# Bench

Local raw-material inventory for the HZN gym-uniform shop (`feb098-c4.myshopify.com`). Shopify sells the finished product — HCS Gym Shorts, HCS Gym Sweatpants, and the occasional custom line such as “S-XL Shirts”. This app tracks the prints and blanks those products are made from. Customers never see it, and version 1 never writes to Shopify.

On-hand quantity is the sum of a ledger. A purchase or receipt adds stock, marking a garment built consumes the recipe, and a manual adjustment can correct a count. Negative on-hand is allowed: that number is the shortfall to buy. Materials are mostly bought to order.

## Setup

Requires Node.js 22+.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The seed loads a fake shop (fake Shopify ids, fake orders) so the dashboard works with no token. `npm run db:seed` wipes the local database and does not call Shopify.

Leave the Shopify credentials blank until you want a live read. The SQLite file lives at `data/inventory.sqlite` (or `DATABASE_PATH`). It is gitignored. Do not commit `.env` or a database. The client secret and access token stay in the environment and are never written to the database or logs.

## Shopify app

The sync is read-only. Scopes: `read_orders` and `read_products`.

Since January 1, 2026, Shopify no longer lets you create a new admin custom app, so there is no static `shpat_` token to copy out of the admin. New apps are created in the Dev Dashboard and sign in with the [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant). See also [Access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens) and the [legacy custom apps](https://shopify.dev/docs/apps/build/authentication-authorization/legacy/admin-custom-apps) note.

1. In the Shopify admin, go to **Settings → Apps and sales channels → Develop apps**, then **Build apps in Dev Dashboard**. You can also open it from the store name menu with **View Dev Dashboard**. ([Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard))
2. Create an app. ([Create apps using the Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard))
3. Open the app’s **Versions** tab. Set the access scopes to `read_orders,read_products` and **Release** the version. The app needs a released version before it can be installed.
4. Install it on the store. From Dev Dashboard **Home** (or the Apps list), open the app and choose **Install app** on the Installs card. Pick this store and confirm **Install**.
5. Open the app’s **Settings** and copy the **Client ID** and **Client secret** into `.env` as `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`.
6. Set `SHOPIFY_STORE_DOMAIN=feb098-c4.myshopify.com` (no `https://`, no path).
7. Restart `npm run dev`, open **Orders**, and choose **Sync from Shopify**.

The app posts `grant_type=client_credentials` with the client id and secret to `https://{shop}.myshopify.com/admin/oauth/access_token`. Shopify returns `access_token`, `scope`, and `expires_in` (86399 seconds, 24 hours). Do not send a `scope` parameter; the token carries the scopes the store granted. The token is cached in memory and requested again shortly before it expires, or once after an Admin API 401. It is not stored in SQLite.

`shop_not_permitted` means the app and the store are not in the same Shopify organization. Both have to show up under the same org in the Dev Dashboard. Owning the store, or having the app installed, is not enough if they live in different orgs.

If you already have a legacy static token, set `SHOPIFY_ADMIN_ACCESS_TOKEN` and the app uses it as-is instead of the client credentials grant.

The query uses Admin API `2026-10`. It loads products and variants, plus orders that are open and unfulfilled or partially fulfilled, including each line’s unfulfilled quantity. Lines with no recipe are called out on the dashboard. Customer fields are not requested.

After a real sync, sample variant ids no longer match. Open **Recipes → Map a product** and map the live variants. Recipes point at Shopify variant ids (or a custom line title) and survive later syncs.

Protected customer data is not required for this app.

## What you can do

- **Materials.** Create and edit prints, blanks, trims, and other materials (name, type, optional size and color, unit, notes). Record a purchase, a receipt, or a signed adjustment. Delete only works when nothing references the material.
- **Recipes.** Map a whole product at once: one print for every checked size, and a blank auto-matched by size and color, with per-variant overrides. Map a custom line by its title when the line has no variant. Edit or delete a single recipe afterward.
- **Orders.** Read the local copy of open orders. Mark one line, or every mapped line on an order, as built. That writes consume movements for `quantity × recipe`. It does not fulfill or edit the Shopify order. Building is allowed even when stock goes negative.
- **Dashboard.** Materials needed for what is still unbuilt, versus on hand, and the buy list. Each mapped variant shows how many could be built if you made only that variant (the scarcest material wins). When several variants share a print, the card also shows how many garments that print can cover in total. Open orders list what each line still needs, what can be built with current stock (older orders claim shared materials first), and which lines have no recipe.

With the sample data: 15 of Print A, 10 Blank Shorts S, and 10 Blank Shorts M. Shorts S and Shorts M can each be built 10 times alone. The shared print covers 15 garments across the sizes that use it.

## Dev commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run db:migrate` | Apply Drizzle migrations to the local SQLite file |
| `npm run db:reset` | Delete the local SQLite file (and its `-wal` / `-shm` sidecars) and create an empty migrated database. Does not load sample data. Stop `npm run dev` first so the server is not still holding the old file. |
| `npm run db:generate` | Generate a new migration after a schema change |
| `npm run db:seed` | Replace the local database with fake sample data |
| `npm test` | Unit tests for needs, shortfall, buildable counts, and Shopify token caching |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |

There is no authentication. Run it on your machine. Do not expose it on the public internet.

## Data model

SQLite via better-sqlite3 and Drizzle. Migrations live in `drizzle/`.

- **materials** — name, type (`print`, `blank`, `trim`, `other`), optional size and color, unit, notes.
- **inventory_movements** — the ledger. `quantity` is signed: purchase and receipt are positive, consume is negative, adjustment is either. Optional link to a build. On hand is `sum(quantity)` per material.
- **recipes** and **recipe_lines** — one recipe per Shopify variant, or per custom line title. Each line is a material and a quantity per finished unit.
- **shopify_products**, **shopify_variants**, **shopify_orders**, **shopify_line_items** — a cache from the last sync (or from the seed). Replaced on the next sync. Recipes are not deleted when the cache is replaced.
- **builds** — a local record that some quantity of a line was made. Remaining demand is Shopify’s unfulfilled quantity minus the sum of builds for that line. Builds do not change Shopify.

```text
open line (unfulfilled − already built)
        × recipe lines
        = material demand

shortfall = max(0, demand − on hand)

buildable alone = min over recipe lines of floor(on hand / quantity per unit)
shared print    = floor(on hand / quantity) across every variant that uses it
```
