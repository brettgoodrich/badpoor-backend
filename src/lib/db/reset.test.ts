import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase } from "./client";
import { resetDatabase } from "./reset";

const originalPath = process.env.DATABASE_PATH;

afterEach(() => {
  closeDatabase();
  if (originalPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalPath;
});

describe("resetDatabase", () => {
  it("deletes the sqlite file and its sidecars, then migrates an empty database", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-reset-"));
    const file = path.join(dir, "inventory.sqlite");
    process.env.DATABASE_PATH = file;
    fs.writeFileSync(file, "not a database");
    fs.writeFileSync(`${file}-wal`, "wal");
    fs.writeFileSync(`${file}-shm`, "shm");

    expect(resetDatabase()).toBe(file);
    // Opening the new database in WAL mode may create fresh sidecars.
    // They must not be the files that were there before the reset.
    const wal = fs.existsSync(`${file}-wal`) ? fs.readFileSync(`${file}-wal`) : Buffer.alloc(0);
    const shm = fs.existsSync(`${file}-shm`) ? fs.readFileSync(`${file}-shm`) : Buffer.alloc(0);
    expect(wal.equals(Buffer.from("wal"))).toBe(false);
    expect(shm.equals(Buffer.from("shm"))).toBe(false);

    const sqlite = new Database(file, { readonly: true });
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'materials'")
      .all();
    const rows = sqlite.prepare("SELECT COUNT(*) AS count FROM materials").get() as { count: number };
    sqlite.close();

    expect(tables).toHaveLength(1);
    expect(rows.count).toBe(0);
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
