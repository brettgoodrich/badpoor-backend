import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
  drizzle?: AppDatabase;
  migrated?: boolean;
};

export function databasePath() {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    return path.resolve(/*turbopackIgnore: true*/ configured);
  }
  return path.join(process.cwd(), "data", "inventory.sqlite");
}

export function openDatabase() {
  if (!globalForDb.sqlite || !globalForDb.drizzle) {
    const file = databasePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sqlite = new Database(file);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    globalForDb.sqlite = sqlite;
    globalForDb.drizzle = drizzle(sqlite, { schema });
  }

  if (!globalForDb.migrated) {
    migrate(globalForDb.drizzle, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    globalForDb.migrated = true;
  }

  return globalForDb.drizzle;
}

/** Test helper and seed reset. Closes the cached connection so a new file can be opened. */
export function closeDatabase() {
  globalForDb.sqlite?.close();
  globalForDb.sqlite = undefined;
  globalForDb.drizzle = undefined;
  globalForDb.migrated = false;
}
