import { resetDatabase } from "../src/lib/db/reset";

const file = resetDatabase();
console.log(`Reset ${file}`);
console.log("The database is empty and migrated. Run npm run db:seed to load the fake shop.");
