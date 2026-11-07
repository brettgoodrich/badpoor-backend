import fs from "node:fs";
import { closeDatabase, databasePath, openDatabase } from "./client";

const SAFE_DATABASE_FILE = /\.(sqlite3?|db)$/i;

/**
 * Deletes the local SQLite file and its WAL sidecars, then opens a fresh migrated database.
 * Does not insert seed data.
 */
export function resetDatabase() {
  const file = databasePath();
  if (!SAFE_DATABASE_FILE.test(file)) {
    throw new Error("Refusing to delete a database path that does not end in .sqlite, .sqlite3, or .db.");
  }

  closeDatabase();
  for (const candidate of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) {
    fs.rmSync(candidate, { force: true });
  }
  openDatabase();
  return file;
}
