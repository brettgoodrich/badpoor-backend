import { io } from "next/cache";
import { openDatabase } from "./client";

/**
 * Request-time database handle.
 * `io()` keeps synchronous better-sqlite3 reads out of the prerendered shell.
 */
export async function getDb() {
  await io();
  return openDatabase();
}
