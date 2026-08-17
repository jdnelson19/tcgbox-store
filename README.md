# Inventory Manager

Mobile-friendly inventory management and tracking app with a React frontend and TypeScript Express API.

## Features

- Inventory item fields: Item Name, Manufacturer, Location, Asset Tag, Serial Number, MAC Address, IP, Cost, Year Purchased, Model, Type, VLAN
- Sort and filter by any inventory column
- Global search across all fields
- Add-item form with auto-fill dropdowns based on previous values
- Top metrics strip (item count, value, manufacturer count, location count)
- Maps tab with file upload (`pdf`, `png`, `jpg`) and map areas bound to location tags
- Totals tab with grouped counts
- Spreadsheet import (`xlsx`, `xls`, `csv`) with per-column mapping before commit

## Project Structure

- `apps/web`: React + Vite UI
- `apps/api`: Express API with JSON persistence and uploaded map files

## Run Locally

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`

To run the storefront app at the same time, use:

```bash
npm run dev:all
```

- Storefront: `http://localhost:5174` (or next available port)

### Use on phone inside your local network

- Find your computer IP on the same Wi-Fi/LAN.
- Open `http://YOUR_COMPUTER_IP:5173` on your phone.
- API calls are proxied through the frontend server, so no extra phone config is needed.

## Build

```bash
npm run build
```

## Hosting Options

### Option 1: Easiest production deployment

- Host frontend on Vercel or Netlify.
- Host API on Render, Railway, or Fly.io.
- Persist data with mounted volume or upgrade API to Postgres.

### Option 2: Single-container deployment

- Build frontend static files and serve via API server.
- Deploy one Docker container to Fly.io, Render, or AWS App Runner.

### Option 3: Spreadsheet-backed mode

- Keep this app API-first for performance.
- Add a sync connector to Google Sheets or Airtable for import/export and backup.
- This gives spreadsheet compatibility without limiting UI speed.

## Notes

- Uploaded maps are stored under `apps/api/uploads/maps`.
- Data persists in `apps/api/data/db.json`.
- For multi-user production, migrate persistence to a database and add authentication.

## SQL Migration Path

- A step-by-step migration plan is documented in `docs/migration-to-sql.md`.
- Recommended sequence: local JSON first, then SQL backend, then auth/roles and backups.
