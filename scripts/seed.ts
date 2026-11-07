import { databasePath } from "../src/lib/db/client";
import { seedDatabase } from "../src/lib/db/seed";

seedDatabase();
console.log(`Seeded fake shop data in ${databasePath()}`);
console.log("This did not call Shopify. Run it again any time to reset the local database.");
