import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Store } from "./store.js";
import { AppError } from "./errors.js";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class Auth {
  constructor(
    readonly store: Store,
    readonly username: string,
    password: string,
    readonly ttl: number,
    readonly secure: boolean,
    readonly origin?: string,
  ) {
    if (password.length < 12)
      throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
    const user: any = store.db
      .prepare("SELECT password FROM users WHERE username=?")
      .get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      store.db.transaction(() => {
        store.db.prepare("DELETE FROM sessions").run();
        store.db
          .prepare(
            "INSERT INTO users VALUES(?,?) ON CONFLICT(username) DO UPDATE SET password=excluded.password",
          )
          .run(username, bcrypt.hashSync(password, 12));
      })();
    }
  }
  sameOrigin(req: FastifyRequest) {
    const origin = req.headers.origin;
    return (
      origin ===
      (this.origin || `${this.secure ? "https" : "http"}://${req.headers.host}`)
    );
  }
  csrf(req: FastifyRequest) {
    if (
      req.headers.origin
        ? !this.sameOrigin(req)
        : req.headers["x-csrf-protection"] !== "1"
    )
      throw new AppError(403, "Same-origin request required");
  }
  session(req: FastifyRequest) {
    const token = req.cookies.session;
    if (!token) return undefined;
    const s: any = this.store.db
      .prepare(
        "SELECT username,expires FROM sessions WHERE token=? AND expires>?",
      )
      .get(tokenHash(token), Date.now());
    return s as { username: string; expires: number } | undefined;
  }
  require(req: FastifyRequest) {
    const user = this.session(req);
    if (!user) throw new AppError(401, "Authentication required");
    return user;
  }
  async login(username: string, password: string, reply: FastifyReply) {
    const row: any = this.store.db
      .prepare("SELECT password FROM users WHERE username=?")
      .get(username);
    const correct = await bcrypt.compare(
      password,
      row?.password || bcrypt.hashSync("unused-dummy-password", 12),
    );
    if (!row || !correct) throw new AppError(401, "Invalid credentials");
    const token = randomBytes(32).toString("base64url");
    const expires = Date.now() + this.ttl * 1000;
    this.store.db
      .prepare("DELETE FROM sessions WHERE expires<=?")
      .run(Date.now());
    this.store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(tokenHash(token), username, expires);
    reply.setCookie("session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: this.secure,
      maxAge: this.ttl,
    });
    this.store.event("auth.login", { username });
    return { username, expires };
  }
  logout(req: FastifyRequest, reply: FastifyReply) {
    this.store.db
      .prepare("DELETE FROM sessions WHERE token=?")
      .run(tokenHash(req.cookies.session || ""));
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  }
}
