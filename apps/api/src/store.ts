import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { emptyItem } from './types.js'
import type { InventoryDB, InventoryItem } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dbPath = path.join(__dirname, '..', 'data', 'db.json')

const defaultDB: InventoryDB = {
  items: [],
  maps: [],
}

export const readDB = async (): Promise<InventoryDB> => {
  try {
    const raw = await readFile(dbPath, 'utf-8')
    const parsed = JSON.parse(raw) as InventoryDB
    const normalized: InventoryDB = {
      maps: Array.isArray(parsed.maps) ? parsed.maps : [],
      items: Array.isArray(parsed.items) ? parsed.items.map((item) => normalizeItem(item)) : [],
    }
    return normalized
  } catch {
    await ensureDB()
    return structuredClone(defaultDB)
  }
}

export const writeDB = async (db: InventoryDB): Promise<void> => {
  await ensureDB()
  await writeFile(dbPath, JSON.stringify(db, null, 2), 'utf-8')
}

const ensureDB = async (): Promise<void> => {
  await mkdir(path.dirname(dbPath), { recursive: true })
  try {
    await readFile(dbPath, 'utf-8')
  } catch {
    await writeFile(dbPath, JSON.stringify(defaultDB, null, 2), 'utf-8')
  }
}

function normalizeItem(item: unknown): InventoryItem {
  const source = (item ?? {}) as Partial<InventoryItem>
  const defaults = emptyItem()
  return {
    id: String(source.id ?? ''),
    itemName: String(source.itemName ?? defaults.itemName),
    manufacturer: String(source.manufacturer ?? defaults.manufacturer),
    vendor: String(source.vendor ?? defaults.vendor),
    location: String(source.location ?? defaults.location),
    status: String(source.status ?? 'Working'),
    assetTag: String(source.assetTag ?? defaults.assetTag),
    serialNumber: String(source.serialNumber ?? defaults.serialNumber),
    macAddress: String(source.macAddress ?? defaults.macAddress),
    ip: String(source.ip ?? defaults.ip),
    cost: toNumber(source.cost, defaults.cost),
    purchaseCost: toNumber(source.purchaseCost, defaults.purchaseCost),
    yearPurchased: String(source.yearPurchased ?? defaults.yearPurchased),
    model: String(source.model ?? defaults.model),
    type: String(source.type ?? defaults.type),
    vlan: String(source.vlan ?? defaults.vlan),
    createdAt: String(source.createdAt ?? new Date().toISOString()),
    updatedAt: String(source.updatedAt ?? new Date().toISOString()),
  }
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
