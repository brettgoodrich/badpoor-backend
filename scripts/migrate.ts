import { databasePath, openDatabase } from "../src/lib/db/client";

openDatabase();
console.log(`Migrated ${databasePath()}`);
