/** Create only the original legal fixture's demo instances in a fresh local deployment. */
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
let cookie = "";
const base = `http://127.0.0.1:${env.PORT || 3000}`;
async function api(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<any> {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: {
      cookie,
      "x-csrf-protection": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (path === "/auth/login")
    cookie = res.headers.get("set-cookie")!.split(";")[0];
  if (!res.ok) throw new Error(`${path}: ${await res.text()}`);
  return res.json();
}
await api("/auth/login", {
  username: env.ADMIN_USERNAME,
  password: env.ADMIN_PASSWORD,
});
const game = (await api("/games")).find(
  (g: any) => g.manifest["MIDlet-Name"] === "Control Test",
);
if (!game) throw new Error("Upload legal Control Test fixture first");
for (const i of await api("/instances")) {
  if (i.name.startsWith("E2E ") && i.status !== "running")
    await api(`/instances/${i.id}`, undefined, "DELETE");
}
for (let n = 1; n <= 5; n++) {
  const name = `Demo 0${n} · Control Test`;
  let i = (await api("/instances")).find((v: any) => v.name === name);
  if (!i)
    i = await api("/instances", {
      gameId: game.id,
      name,
      restartPolicy: n === 1 ? "restore-running" : "manual",
    });
  if (n === 1) await api(`/instances/${i.id}/start`, {});
}
console.log("Five legal demo entries ready; only Demo 01 is running.");
