import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { readDB, writeDB } from './store.js'
import type { InventoryField, InventoryItem, MapArea } from './types.js'
import { inventoryFields } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.join(__dirname, '..', 'uploads', 'maps')

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

const diskStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await mkdir(uploadsDir, { recursive: true })
    cb(null, uploadsDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_')
    cb(null, `${Date.now()}_${base}${ext}`)
  },
})

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
    cb(null, ok.includes(file.mimetype))
  },
})

const itemSchema = z.object({
  itemName: z.string().default(''),
  manufacturer: z.string().default(''),
  vendor: z.string().default(''),
  location: z.string().default(''),
  status: z.string().default(''),
  assetTag: z.string().default(''),
  serialNumber: z.string().default(''),
  macAddress: z.string().default(''),
  ip: z.string().default(''),
  cost: z.coerce.number().default(0),
  purchaseCost: z.coerce.number().default(0),
  yearPurchased: z.string().default(''),
  model: z.string().default(''),
  type: z.string().default(''),
  vlan: z.string().default(''),
})

const areaSchema = z.object({
  id: z.string().optional(),
  location: z.string().optional(),
  locationTag: z.string().optional(),
  color: z.string().default('#e38336'),
  x: z.coerce.number().default(0),
  y: z.coerce.number().default(0),
  width: z.coerce.number().default(0),
  height: z.coerce.number().default(0),
})

const toId = (): string => randomUUID()

type InventoryWritePolicy = {
  requireUniqueAssetTag: boolean
  keepRemovedAssetTagHistory: boolean
}

const readWritePolicy = (req: express.Request): InventoryWritePolicy => ({
  requireUniqueAssetTag: req.get('x-inventory-require-unique-asset-tag') === 'true',
  keepRemovedAssetTagHistory: req.get('x-inventory-keep-removed-asset-tag-history') !== 'false',
})

const normalizeAssetTag = (value: string): string => value.trim().toLowerCase()

const isRemovedStatus = (status: string): boolean => status.trim().toLowerCase() === 'removed'

const applyAssetTagPolicy = <T extends { assetTag: string; status: string }>(item: T, policy: InventoryWritePolicy): T => ({
  ...item,
  assetTag: policy.keepRemovedAssetTagHistory || !isRemovedStatus(item.status) ? String(item.assetTag ?? '').trim() : '',
})

const findAssetTagConflict = (items: InventoryItem[], assetTag: string, excludeId?: string): InventoryItem | undefined => {
  const normalized = normalizeAssetTag(assetTag)
  if (!normalized) {
    return undefined
  }

  return items.find((item) => item.id !== excludeId && normalizeAssetTag(item.assetTag) === normalized)
}

const inventoryFieldLabels: Record<InventoryField, string> = {
  itemName: 'Item Name',
  manufacturer: 'Manufacturer',
  vendor: 'Vendor',
  location: 'Location',
  status: 'Status',
  assetTag: 'Asset Tag',
  serialNumber: 'Serial Number',
  macAddress: 'MAC Address',
  ip: 'IP',
  cost: 'Cost',
  purchaseCost: 'Purchase Cost',
  yearPurchased: 'Year Purchased',
  model: 'Model',
  type: 'Type',
  vlan: 'VLAN',
}

const normalizedInventoryFieldLookup = new Map<string, InventoryField>(
  inventoryFields.flatMap((field) => {
    const label = inventoryFieldLabels[field]
    return [field, label, label.toLowerCase()]
      .map((value) => [value.replace(/[^a-z0-9]/g, '').toLowerCase(), field] as const)
  }),
)

const parseSearchQuery = (value: string): { field?: InventoryField; text: string } => {
  const trimmed = value.trim()
  if (!trimmed) {
    return { text: '' }
  }

  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex < 1) {
    return { text: trimmed.toLowerCase() }
  }

  const fieldName = trimmed.slice(0, separatorIndex).trim().replace(/[^a-z0-9]/gi, '').toLowerCase()
  const text = trimmed.slice(separatorIndex + 1).trim().toLowerCase()
  const field = normalizedInventoryFieldLookup.get(fieldName)

  if (!field || !text) {
    return { text: trimmed.toLowerCase() }
  }

  return { field, text }
}

const applyItemFilters = (items: InventoryItem[], query: Record<string, unknown>): InventoryItem[] => {
  const search = parseSearchQuery(String(query.search ?? ''))
  const sortField = String(query.sortField ?? '').trim() as InventoryField
  const sortDirection = String(query.sortDirection ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'

  const filtered = items.filter((item) => {
    if (search.text) {
      if (search.field) {
        const itemValue = String(item[search.field] ?? '').toLowerCase()
        if (!itemValue.includes(search.text)) {
          return false
        }
      } else {
        const joined = inventoryFields.map((field) => String(item[field] ?? '')).join(' ').toLowerCase()
        if (!joined.includes(search.text)) {
          return false
        }
      }
    }

    for (const field of inventoryFields) {
      const raw = query[field]
      if (!raw) {
        continue
      }
      const val = String(raw).trim().toLowerCase()
      if (!val) {
        continue
      }
      const itemVal = String(item[field] ?? '').toLowerCase()
      if (!itemVal.includes(val)) {
        return false
      }
    }

    return true
  })

  if (inventoryFields.includes(sortField)) {
    filtered.sort((a, b) => {
      const left = String(a[sortField] ?? '').toLowerCase()
      const right = String(b[sortField] ?? '').toLowerCase()
      const result = left.localeCompare(right, undefined, { numeric: true })
      return sortDirection === 'desc' ? -result : result
    })
  }

  return filtered
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/items', async (req, res) => {
  const db = await readDB()
  const filtered = applyItemFilters(db.items, req.query)
  res.json({ items: filtered })
})

app.post('/api/items', async (req, res) => {
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
    return
  }

  const db = await readDB()
  const policy = readWritePolicy(req)
  const now = new Date().toISOString()
  const item = applyAssetTagPolicy(
    {
      id: toId(),
      ...parsed.data,
      cost: safeNumber(parsed.data.cost),
      purchaseCost: safeNumber(parsed.data.purchaseCost),
      createdAt: now,
      updatedAt: now,
    },
    policy,
  ) as InventoryItem

  const conflict = policy.requireUniqueAssetTag ? findAssetTagConflict(db.items, item.assetTag) : undefined
  if (conflict) {
    res.status(409).json({ error: `Asset tag ${item.assetTag} is already in use.` })
    return
  }

  db.items.push(item)
  await writeDB(db)
  res.status(201).json({ item })
})

app.post('/api/items/bulk', async (req, res) => {
  const schema = z.object({ items: z.array(itemSchema).max(10000) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
    return
  }

  const db = await readDB()
  const policy = readWritePolicy(req)
  const now = new Date().toISOString()
  const seenAssetTags = new Set(db.items.map((item) => normalizeAssetTag(item.assetTag)).filter(Boolean))
  const newItems: InventoryItem[] = []

  for (const row of parsed.data.items) {
    const item = applyAssetTagPolicy(
      {
        id: toId(),
        ...row,
        cost: safeNumber(row.cost),
        purchaseCost: safeNumber(row.purchaseCost),
        createdAt: now,
        updatedAt: now,
      },
      policy,
    ) as InventoryItem

    if (policy.requireUniqueAssetTag) {
      const normalized = normalizeAssetTag(item.assetTag)
      if (normalized) {
        if (seenAssetTags.has(normalized)) {
          res.status(409).json({ error: `Asset tag ${item.assetTag} is already in use.` })
          return
        }
        seenAssetTags.add(normalized)
      }
    }

    newItems.push(item)
  }

  db.items.push(...newItems)
  await writeDB(db)
  res.status(201).json({ imported: newItems.length })
})

app.put('/api/items/:id', async (req, res) => {
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
    return
  }

  const db = await readDB()
  const idx = db.items.findIndex((item) => item.id === req.params.id)
  if (idx < 0) {
    res.status(404).json({ error: 'Item not found' })
    return
  }

  const policy = readWritePolicy(req)
  const nextItem = applyAssetTagPolicy(
    {
      ...db.items[idx],
      ...parsed.data,
      cost: safeNumber(parsed.data.cost),
      purchaseCost: safeNumber(parsed.data.purchaseCost),
      updatedAt: new Date().toISOString(),
    },
    policy,
  ) as InventoryItem

  const conflict = policy.requireUniqueAssetTag ? findAssetTagConflict(db.items, nextItem.assetTag, req.params.id) : undefined
  if (conflict) {
    res.status(409).json({ error: `Asset tag ${nextItem.assetTag} is already in use.` })
    return
  }

  db.items[idx] = nextItem
  await writeDB(db)
  res.json({ item: db.items[idx] })
})

app.delete('/api/items/:id', async (req, res) => {
  const db = await readDB()
  const before = db.items.length
  db.items = db.items.filter((item) => item.id !== req.params.id)

  if (db.items.length === before) {
    res.status(404).json({ error: 'Item not found' })
    return
  }

  await writeDB(db)
  res.status(204).end()
})

app.get('/api/options', async (_req, res) => {
  const db = await readDB()
  const options = Object.fromEntries(
    inventoryFields.map((field) => {
      const unique = new Set<string>()
      for (const item of db.items) {
        const value = String(item[field] ?? '').trim()
        if (value) {
          unique.add(value)
        }
      }

      if (field === 'location') {
        for (const mapAsset of db.maps) {
          for (const area of mapAsset.areas) {
            const value = String((area as { location?: string; locationTag?: string }).location ?? (area as { locationTag?: string }).locationTag ?? '').trim()
            if (value) {
              unique.add(value)
            }
          }
        }
      }

      return [field, [...unique].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))]
    }),
  )

  res.json({ options })
})

app.get('/api/totals', async (_req, res) => {
  const db = await readDB()
  const totalItems = db.items.length
  const totalCost = db.items.reduce((sum, item) => sum + replacementValue(item), 0)

  const byType = aggregate(db.items, 'type')
  const byManufacturer = aggregate(db.items, 'manufacturer')
  const byLocation = aggregate(db.items, 'location')
  res.json({
    summary: {
      totalItems,
      totalCost,
      uniqueManufacturers: Object.keys(byManufacturer).length,
      uniqueLocations: Object.keys(byLocation).length,
    },
    byType,
    byManufacturer,
    byLocation,
  })
})

app.get('/api/maps', async (_req, res) => {
  const db = await readDB()
  res.json({ maps: db.maps })
})

app.post('/api/maps', upload.single('mapFile'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Map file is required' })
    return
  }

  const db = await readDB()
  const map = {
    id: toId(),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    relativePath: `/uploads/maps/${req.file.filename}`,
    uploadedAt: new Date().toISOString(),
    areas: [] as MapArea[],
  }

  db.maps.push(map)
  await writeDB(db)
  res.status(201).json({ map })
})

app.put('/api/maps/:id/areas', async (req, res) => {
  const bodySchema = z.object({ areas: z.array(areaSchema).max(2000) })
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
    return
  }

  const db = await readDB()
  const map = db.maps.find((m) => m.id === req.params.id)
  if (!map) {
    res.status(404).json({ error: 'Map not found' })
    return
  }

  map.areas = parsed.data.areas.map((area) => ({
    ...area,
    location: String(area.location ?? area.locationTag ?? '').trim(),
    color: normalizeHexColor(area.color),
    id: area.id ?? toId(),
  }))

  await writeDB(db)
  res.json({ map })
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Inventory API listening on http://localhost:${port}`)
})

function aggregate(items: InventoryItem[], key: InventoryField): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const label = String(item[key] ?? '').trim() || 'Unspecified'
    acc[label] = (acc[label] ?? 0) + 1
    return acc
  }, {})
}

function normalizeHexColor(input: string): string {
  const value = String(input ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase()
  }
  return '#e38336'
}

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function replacementValue(item: InventoryItem): number {
  const purchaseCost = safeNumber(item.purchaseCost)
  if (purchaseCost > 0) {
    return purchaseCost
  }
  return safeNumber(item.cost)
}
