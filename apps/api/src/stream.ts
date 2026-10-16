import { PointerBroker } from "./pointer.js";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { FrameEncoder } from "./frames.js";
import { messageInput, type Key } from "../../../packages/shared/schema.js";
import { InputBroker, MacroRunner } from "./input.js";
import type { Manager } from "./manager.js";
import type { Auth } from "./auth.js";
export function registerStream(
  app: FastifyInstance,
  manager: Manager,
  auth: Auth,
) {
  const encoder = new FrameEncoder();
  const broker = new InputBroker((id, key, down) => manager.key(id, key, down));
  const pointers = new PointerBroker((id, action, x, y) =>
    manager.pointer(id, action, x, y),
  );
  manager.on("state", (instance) => {
    if (instance.status !== "running") {
      void broker.reset(instance.id);
      void pointers.reset(instance.id);
    }
  });
  const clients = new Set<WebSocket>();
  const stats = new Map<
    string,
    {
      frames: number;
      drops: number;
      bytes: number;
      latencyMs: number;
      since: number;
    }
  >();
  app.get(
    "/ws",
    {
      websocket: true,
      preValidation: async (req) => {
        auth.require(req);
        if (!auth.sameOrigin(req))
          throw Object.assign(new Error("Origin rejected"), {
            statusCode: 403,
          });
      },
    },
    (socket, req) => {
      clients.add(socket);
      let macroIds: string[] = [];
      let ids: string[] = [],
        fps = manager.settings.streamFps,
        quality = manager.settings.quality,
        busy = false,
        last = 0,
        closed = false,
        messages = 0;
      const send = (data: unknown) => {
        if (!auth.session(req)) {
          socket.close(1008, "Session revoked");
          return;
        }
        if (socket.readyState === 1 && socket.bufferedAmount < 1024 * 1024)
          socket.send(JSON.stringify(data));
      };
      const macro = new MacroRunner(broker, (state, error) => {
        send({ type: "macro", state, error });
        manager.store.event("macro." + state, { error });
      });
      const release = async () => {
        await macro.cancel();
        await broker.release(socket);
        await pointers.release(socket);
      };
      let keyQueue = Promise.resolve();
      socket.on("message", (raw) => {
        if (++messages > 150) {
          socket.close(1008, "Command rate exceeded");
          return;
        }
        keyQueue = keyQueue
          .then(async () => {
            if (closed) return;
            if (!auth.session(req)) {
              socket.close(1008, "Session expired");
              return;
            }
            const msg = messageInput.parse(JSON.parse(raw.toString()));
            if (msg.type === "subscribe") {
              for (const id of msg.ids) manager.get(id);
              ids = msg.ids;
              fps = msg.fps || manager.settings.streamFps;
              quality = msg.quality || manager.settings.quality;
              send({ type: "subscribed", ids });
            } else if (msg.type === "text") {
              await manager.text(msg.id, msg.text, msg.backspace);
              send({ type: "textResult", id: msg.id, ok: true });
            } else if (msg.type === "pointer") {
              await pointers.input(socket, msg.id, msg.action, msg.x, msg.y);
              send({
                type: "pointerResult",
                id: msg.id,
                action: msg.action,
                ok: true,
              });
            } else if (msg.type === "release") await release();
            else if (msg.type === "macro") {
              if (
                msg.steps.reduce((n, s) => n + s.holdMs + s.delayMs, 0) > 60000
              )
                throw new Error("Macro limit: 60 seconds");
              for (const id of msg.ids) manager.get(id);
              macroIds = msg.ids;
              void macro.start(msg.ids, msg.steps);
            } else if (msg.type === "cancelMacro") await macro.cancel();
            else if (msg.type === "ping")
              send({ type: "pong", time: msg.time });
            else if (msg.type === "key") {
              const results = [];
              for (const id of msg.ids) {
                try {
                  await broker.key(socket, id, msg.key, msg.down);
                  results.push({ id, ok: true });
                } catch (e) {
                  results.push({ id, ok: false, error: String(e) });
                }
              }
              send({
                type: "keyResult",
                key: msg.key,
                down: msg.down,
                results,
              });
            }
          })
          .catch((e) =>
            send({
              type: "error",
              error: e instanceof Error ? e.message : "Invalid message",
            }),
          );
      });
      const state = (instance: { id: string; status: string }) => {
        if (instance.status !== "running" && macroIds.includes(instance.id))
          void macro.cancel();
        send({ type: "state", instance });
      };
      manager.on("state", state);
      const rate = setInterval(() => {
        messages = 0;
        if (!auth.session(req)) socket.close(1008, "Session revoked");
      }, 1000);
      const session = auth.session(req)!;
      const expiry = setTimeout(
        () => socket.close(1008, "Session expired"),
        Math.max(1, session.expires - Date.now()),
      );
      const tick = setInterval(() => {
        void (async () => {
          if (closed || busy || !ids.length || Date.now() - last < 1000 / fps)
            return;
          if (!auth.session(req)) {
            socket.close(1008, "Session expired");
            return;
          }
          last = Math.max(last + 1000 / fps, Date.now() - 1000 / fps);
          busy = true;
          try {
            for (const id of [...ids]) {
              const a = manager.adapters.get(id);
              if (!a || a.getStatus() !== "running") continue;
              const s = stats.get(id) || {
                frames: 0,
                drops: 0,
                bytes: 0,
                latencyMs: 0,
                since: Date.now(),
              };
              stats.set(id, s);
              if (socket.bufferedAmount > 256 * 1024) {
                s.drops++;
                continue;
              }
              const start = Date.now();
              try {
                const image = await encoder.encode(a, quality);
                if (closed) break;
                if (socket.bufferedAmount > 256 * 1024) {
                  s.drops++;
                  continue;
                }
                const data = image.toString("base64");
                send({
                  type: "frame",
                  id,
                  data,
                  mime: "image/jpeg",
                  at: Date.now(),
                });
                s.frames++;
                s.bytes += image.length;
                s.latencyMs = Date.now() - start;
              } catch (e) {
                send({ type: "frameError", id, error: String(e) });
              }
            }
          } finally {
            busy = false;
          }
        })().catch(() => {});
      }, 2);
      const metrics = setInterval(() => {
        void (async () => {
          const data = await Promise.all(
            ids.map(async (id) => ({
              id,
              ...(await manager.adapters.get(id)?.getMetrics()),
              stream: stats.get(id),
            })),
          );
          send({ type: "metrics", instances: data });
        })().catch(() => {});
      }, 2000);
      socket.on("error", () => {});
      socket.on("close", () => {
        closed = true;
        clients.delete(socket);
        manager.off("state", state);
        clearInterval(tick);
        clearInterval(rate);
        clearInterval(metrics);
        clearTimeout(expiry);
        void keyQueue.finally(release).catch(() => {});
      });
      send({ type: "ready" });
    },
  );
  app.addHook("preClose", async () => {
    for (const s of clients) s.close(1001, "Server shutdown");
  });
  manager.on("deleted", (id) => stats.delete(id));
  return { clients, stats };
}
