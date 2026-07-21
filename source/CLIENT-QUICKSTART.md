# Inventra — Client Quick Start (Docker)

Run the app in one command. Requires **Docker Desktop** (or Docker Engine + Compose).

## 1. Create a `.env` file
In this folder, create a file named `.env`:

```
# Strong random secret — generate with: openssl rand -hex 32
JWT_SECRET=PASTE_A_64_CHAR_RANDOM_STRING_HERE

# First admin login (you choose these)
ADMIN_EMPID=admin
ADMIN_PASSWORD=ChooseAStrongPassword!
ADMIN_NAME=Administrator

# Load sample demo data? false for a clean start, true to explore with examples.
SEED_DEMO=false
```

The app will **refuse to start** if `JWT_SECRET` or `ADMIN_PASSWORD` are missing — by design.

## 2. Start it
```
docker compose up -d --build
```
First run builds the image and seeds the database (a few minutes). The database persists in a Docker volume (`inventra-data`) across restarts.

## 3. Open + log in
- App: **http://localhost:8080**
- Log in with the `ADMIN_EMPID` / `ADMIN_PASSWORD` you set above.
- Tip: press **Ctrl+K** anywhere to open the "Ask Inventra" command bar (e.g. type `low stock`).

## 4. Day-to-day
- Logs: `docker compose logs -f`
- Stop: `docker compose down` (data is kept)
- Start again: `docker compose up -d`
- Update after new code: `docker compose up -d --build`

## What's included now
- Item master + live stock, barcode/QR, bulk import.
- Employee requests → dept-head/admin approval → ready-for-pickup → issue (stock auto-deducts).
- Purchase orders (auto-reorder on low stock + budget-limit approval), goods receipt, invoices.
- Stock transfers, checkouts/returns, gate passes, audit trail.
- Reports: dashboard, stock-out risk, inventory value, department consumption, supplier performance.
- Low-stock + warranty/license expiry alerts. Natural-language command bar.

## Known limitations (UI not yet built — APIs exist)
- IT-Assets, PO-approve button, supplier-performance view, item reorder fields, and 3-way-match enforcement are **API-only** for now (no screens yet). Queued for the next iteration.

## Going to a real server (beyond localhost)
For multi-user/production beyond a single machine, switch the database from SQLite to **PostgreSQL** and run behind HTTPS — see `DEPLOYMENT.md`.
