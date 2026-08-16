# Migration Plan: Local First to SQL Multi-User

This project currently runs local-first with JSON persistence (`apps/api/data/db.json`).

## Phase 1: Local-First (Current)

- Start app with `npm run dev`
- Frontend served by Vite on port `5173`
- API served by Express on port `4000`
- API routes are proxied through Vite (`/api`, `/uploads`), so mobile devices on the same LAN can use the UI through your computer IP.

## Phase 2: SQL Migration (Recommended)

### 1) Add a SQL database

- Good local/network choices:
  - PostgreSQL
  - MariaDB
  - SQL Server Express (if your environment is Microsoft-heavy)

### 2) Create normalized tables

Suggested tables:

- `inventory_items`
- `map_assets`
- `map_areas`
- `users`
- `audit_log`

Core fields for `inventory_items`:

- `item_name`, `manufacturer`, `location`, `asset_tag`, `serial_number`
- `mac_address`, `ip`, `cost`, `year_purchased`, `model`, `type`, `vlan`
- `created_at`, `updated_at`

### 3) Move persistence behind a repository interface

Current API reads/writes JSON directly. During migration:

- Keep route layer unchanged
- Replace persistence implementation with SQL-backed repository
- Keep response shapes stable so frontend does not need large changes

### 4) Multi-user network readiness

- Host API and DB on a machine reachable inside your LAN/VPN
- Add auth (JWT or session-based)
- Add row validation and permission checks
- Add backups and restore tests

### 5) Safe migration process

- Export existing JSON data
- Run one-time import script into SQL
- Verify counts and spot-check records
- Switch API persistence mode to SQL

## Phase 3: Production Hardening

- Add per-user roles (admin/editor/viewer)
- Add audit trail for create/update/delete
- Add optimistic concurrency for item updates
- Add regular DB backups and alerting
