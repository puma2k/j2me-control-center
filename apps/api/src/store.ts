import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Game,
  Instance,
  Settings,
} from "../../../packages/shared/schema.js";
export class Store {
  db: Database.Database;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    if (Number(this.db.pragma("user_version", { simple: true })) > 1)
      throw new Error("Database newer than server; restore matching version");
    this.db.transaction(() => {
      this.db
        .exec(`CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS instances(id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES games(id),data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,password TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,username TEXT NOT NULL REFERENCES users(username),expires INTEGER NOT NULL);
        PRAGMA user_version = 1;`);
    })();
  }
  games(): Game[] {
    return this.db
      .prepare("SELECT data FROM games ORDER BY rowid DESC")
      .all()
      .map((r: any) => JSON.parse(r.data));
  }
  game(id: string): Game | undefined {
    const r: any = this.db.prepare("SELECT data FROM games WHERE id=?").get(id);
    return r && JSON.parse(r.data);
  }
  putGame(g: Game) {
    this.db
      .prepare(
        "INSERT INTO games VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(g.id, JSON.stringify(g));
  }
  instances(): Instance[] {
    return this.db
      .prepare("SELECT data FROM instances ORDER BY rowid DESC")
      .all()
      .map((r: any) => JSON.parse(r.data));
  }
  instance(id: string): Instance | undefined {
    const r: any = this.db
      .prepare("SELECT data FROM instances WHERE id=?")
      .get(id);
    return r && JSON.parse(r.data);
  }
  putInstance(i: Instance) {
    this.db
      .prepare(
        "INSERT INTO instances VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(i.id, i.gameId, JSON.stringify(i));
  }
  deleteInstance(id: string) {
    this.db.prepare("DELETE FROM instances WHERE id=?").run(id);
  }
  settings(defaults: Settings): Settings {
    const r: any = this.db
      .prepare("SELECT data FROM settings WHERE id=1")
      .get();
    return r ? JSON.parse(r.data) : defaults;
  }
  putSettings(s: Settings) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES(1,?)")
      .run(JSON.stringify(s));
  }
  event(action: string, detail: unknown) {
    this.db
      .prepare("INSERT INTO events(at,action,detail) VALUES(?,?,?)")
      .run(Date.now(), action, JSON.stringify(detail));
    this.db
      .prepare(
        "DELETE FROM events WHERE id < (SELECT MAX(id)-10000 FROM events)",
      )
      .run();
  }
  close() {
    this.db.close();
  }
}
