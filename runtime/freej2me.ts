import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  mkdir,
  readFile,
  stat,
  rename,
  appendFile,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { once } from "node:events";
import type { EmulatorAdapter, ProcessMetrics } from "./adapter.js";
import {
  keyCodes,
  type Instance,
  type Key,
  type Status,
} from "../packages/shared/schema.js";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function killGroup(child: ChildProcessWithoutNullStreams | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid!, "SIGTERM");
  } catch {
    return;
  }
  await Promise.race([once(child, "exit"), sleep(2000)]);
  if (child.exitCode === null && child.signalCode === null)
    try {
      process.kill(-child.pid!, "SIGKILL");
      await Promise.race([once(child, "exit"), sleep(1000)]);
    } catch {}
}
export function startupTimeoutMs(
  value = process.env.START_TIMEOUT_SECONDS,
): number {
  const seconds = Number(value || 60);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300)
    throw new Error("START_TIMEOUT_SECONDS must be between 1 and 300");
  return seconds * 1000;
}
export class FreeJ2ME implements EmulatorAdapter {
  onExit = (reason: string) => {};
  private java?: ChildProcessWithoutNullStreams;
  private xvfb?: ChildProcessWithoutNullStreams;
  private state: Status = "stopped";
  private started = 0;
  private capture?: Promise<Buffer>;
  private captureKind = false;
  private rawPath: string;
  private pendingFrame?: { resolve: () => void; reject: (e: Error) => void };
  private logQueue = Promise.resolve();
  private ticks?: { value: number; at: number };
  private logBytes = 0;
  readonly cwd: string;
  constructor(
    readonly instance: Instance,
    readonly root: string,
    readonly games: string,
    readonly emulator: string,
    readonly display: number,
  ) {
    this.cwd = join(root, instance.id);
    this.rawPath = `/tmp/j2me-${instance.id}.rgb`;
  }
  private log(line: string) {
    // Do not retain arbitrary stdout chunks in an unbounded promise queue.
    if (this.logBytes > 2 * 1024 * 1024) return;
    const text = line.slice(0, 16384);
    this.logBytes += Buffer.byteLength(text);
    this.logQueue = this.logQueue
      .then(async () => {
        const path = join(this.cwd, "runtime.log");
        const s = await stat(path).catch(() => null);
        if (s && s.size > 1024 * 1024)
          await rename(path, `${path}.1`).catch(() => {});
        await appendFile(path, text);
      })
      .catch(() => {})
      .finally(() => {
        this.logBytes -= Buffer.byteLength(text);
      });
  }
  async start() {
    if (this.state === "running") return;
    this.state = "starting";
    await mkdir(this.cwd, { recursive: true });
    const env = {
      ...process.env,
      // glibc otherwise creates many arenas for JVM/AWT threads and retains freed pages.
      MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || "2",
      DISPLAY: `:${this.display}`,
      HOME: this.cwd,
    };
    this.xvfb = spawn(
      "Xvfb",
      [
        `:${this.display}`,
        "-screen",
        "0",
        `${this.instance.width}x${this.instance.height}x24`,
        "-nolisten",
        "tcp",
        "-ac",
      ],
      { cwd: this.cwd, env, detached: true, stdio: "pipe" },
    );
    this.xvfb.on("error", (e) => this.log(`Xvfb error: ${e.message}\n`));
    this.xvfb.stderr.on("data", (b) => this.log(b.toString()));
    this.xvfb.on("exit", (code, signal) => {
      if (this.state === "running") {
        this.onExit(`Xvfb exited: ${code ?? signal}`);
        void killGroup(this.java);
      }
    });
    await sleep(150);
    this.java = spawn(
      process.env.JAVA_BIN || "java",
      [
        `-Xms8m`,
        "-XX:+UseSerialGC",
        "-XX:TieredStopAtLevel=1",
        "-XX:ReservedCodeCacheSize=32m",
        "-XX:MinHeapFreeRatio=10",
        "-XX:MaxHeapFreeRatio=20",
        `-Xmx${this.instance.heapMb}m`,
        "-Dfile.encoding=ISO_8859_1",
        `-Duser.home=${this.cwd}`,
        "-cp",
        `${this.emulator}/build/freej2me_plus.jar:${this.emulator}/bridge/classes`,
        "Bridge",
        join(this.games, `${this.instance.gameId}.jar`),
        String(this.instance.width),
        String(this.instance.height),
        String(this.instance.fps),
        this.instance.profile,
        this.rawPath,
      ],
      { cwd: this.cwd, env, detached: true, stdio: "pipe" },
    );
    const child = this.java;
    child.stdin.on("error", (e) => this.log(`Input error: ${e.message}\n`));
    let output = "";
    const ready = new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.once("exit", (code, signal) =>
        reject(new Error(`Emulator exited before ready: ${code ?? signal}`)),
      );
      child.stdout.on("data", (b: Buffer) => {
        this.log(b.toString().replace(/CONTROL_FRAME\r?\n/g, ""));
        output = (output + b.toString()).slice(-32768);
        if (output.includes("CONTROL_READY")) resolve();
        if (output.includes("CONTROL_FRAME")) {
          output = output.replaceAll("CONTROL_FRAME", "");
          this.pendingFrame?.resolve();
          this.pendingFrame = undefined;
        }
      });
    });
    child.stderr.on("data", (b) => this.log(b.toString()));
    child.on("exit", (code, signal) => {
      this.pendingFrame?.reject(new Error("Emulator exited"));
      this.pendingFrame = undefined;
      if (this.state === "running") {
        this.state = "failed";
        this.onExit(`JVM exited: ${code ?? signal}`);
      }
      void killGroup(this.xvfb);
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ready,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  `Emulator startup timeout (${startupTimeoutMs() / 1000}s)`,
                ),
              ),
            startupTimeoutMs(),
          );
        }),
      ]);
      if (this.xvfb.exitCode !== null || this.xvfb.signalCode !== null)
        throw new Error("Xvfb failed to start");
      this.state = "running";
      this.started = Date.now();
    } catch (e) {
      this.state = "failed";
      await this.stop();
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  async stop() {
    this.state = "stopping";
    this.pendingFrame?.reject(new Error("Stopped"));
    this.pendingFrame = undefined;
    await killGroup(this.java);
    await killGroup(this.xvfb);
    await this.logQueue;
    await unlink(this.rawPath).catch(() => {});
    this.state = "stopped";
    this.java = undefined;
    this.xvfb = undefined;
  }
  async restart() {
    await this.stop();
    await this.start();
  }
  async sendKey(key: Key, down: boolean) {
    if (this.state !== "running" || !this.java?.stdin.writable)
      throw new Error("Instance is not running");
    if (this.java.stdin.writableLength > 65536)
      throw new Error("Emulator input backpressure");
    this.java.stdin.write(`${down ? "DOWN" : "UP"} ${keyCodes[key]}\n`);
  }
  async sendPointer(action: "down" | "move" | "up", x: number, y: number) {
    if (this.state !== "running" || !this.java?.stdin.writable)
      throw new Error("Instance is not running");
    if (this.java.stdin.writableLength > 65536)
      throw new Error("Emulator input backpressure");
    this.java.stdin.write(`POINTER ${action} ${x} ${y}\n`);
  }
  async sendText(text: string, backspace: number) {
    if (this.state !== "running" || !this.java?.stdin.writable)
      throw new Error("Instance is not running");
    if (this.java.stdin.writableLength > 65536)
      throw new Error("Emulator input backpressure");
    this.java.stdin.write(
      `TEXT ${backspace} ${Buffer.from(text, "utf8").toString("base64")}\n`,
    );
  }
  captureFrame(): Promise<Buffer> {
    return this.captureImage(false);
  }
  async captureRaw() {
    return {
      data: await this.captureImage(true),
      width: this.instance.width,
      height: this.instance.height,
    };
  }
  private captureImage(raw: boolean): Promise<Buffer> {
    if (this.capture) {
      if (this.captureKind === raw) return this.capture;
      return this.capture.then(() => this.captureImage(raw));
    }
    this.captureKind = raw;
    this.capture = (async () => {
      if (this.state !== "running" || !this.java)
        throw new Error("Instance is not running");
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          this.pendingFrame = { resolve, reject };
          timeout = setTimeout(() => {
            this.pendingFrame = undefined;
            reject(new Error("Frame timeout"));
          }, 3000);
          this.java!.stdin.write(raw ? "FRAME_RAW\n" : "FRAME\n");
        });
        return await readFile(raw ? this.rawPath : join(this.cwd, "frame.png"));
      } finally {
        clearTimeout(timeout);
      }
    })().finally(() => {
      this.capture = undefined;
    });
    return this.capture;
  }
  getStatus() {
    return this.state;
  }
  async getLogs() {
    return (
      await readFile(join(this.cwd, "runtime.log"), "utf8").catch(() => "")
    ).slice(-65536);
  }
  async getMetrics(): Promise<ProcessMetrics> {
    const pid = this.java?.pid;
    if (!pid || this.state !== "running")
      return { pid: null, cpuPercent: 0, rssMb: 0, uptimeSeconds: 0 };
    try {
      const [status, statText] = await Promise.all([
        readFile(`/proc/${pid}/status`, "utf8"),
        readFile(`/proc/${pid}/stat`, "utf8"),
      ]);
      const fields = statText.slice(statText.lastIndexOf(")") + 2).split(" ");
      const ticks = Number(fields[11]) + Number(fields[12]),
        at = Date.now();
      const cpuPercent = this.ticks
        ? Math.max(
            0,
            ((ticks - this.ticks.value) / 100 / ((at - this.ticks.at) / 1000)) *
              100,
          )
        : 0;
      this.ticks = { value: ticks, at };
      const pssText = await readFile(`/proc/${pid}/smaps_rollup`, "utf8").catch(
        () => "",
      );
      return {
        pid,
        cpuPercent,
        rssMb: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) / 1024,
        pssMb: Number(pssText.match(/^Pss:\s+(\d+)/m)?.[1] || 0) / 1024,
        uptimeSeconds: (at - this.started) / 1000,
      };
    } catch {
      return {
        pid,
        cpuPercent: 0,
        rssMb: 0,
        uptimeSeconds: (Date.now() - this.started) / 1000,
      };
    }
  }
}
