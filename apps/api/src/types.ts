export const inventoryFields = [
  'itemName',
  'manufacturer',
  'vendor',
  'location',
  'status',
  'assetTag',
  'serialNumber',
  'macAddress',
  'ip',
  'cost',
  'purchaseCost',
  'yearPurchased',
  'model',
  'type',
  'vlan',
] as const

export type InventoryField = (typeof inventoryFields)[number]

export type InventoryItem = {
  id: string
  itemName: string
  manufacturer: string
  vendor: string
  location: string
  status: string
  assetTag: string
  serialNumber: string
  macAddress: string
  ip: string
  cost: number
  purchaseCost: number
  yearPurchased: string
  model: string
  type: string
  vlan: string
  createdAt: string
  updatedAt: string
}

export type MapArea = {
  id: string
  location: string
  color: string
  x: number
  y: number
  width: number
  height: number
}

export type MapAsset = {
  id: string
  originalName: string
  mimeType: string
  relativePath: string
  uploadedAt: string
  areas: MapArea[]
}

export type InventoryDB = {
  items: InventoryItem[]
  maps: MapAsset[]
}

export const emptyItem = (): Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'> => ({
  itemName: '',
  manufacturer: '',
  vendor: '',
  location: '',
  status: '',
  assetTag: '',
  serialNumber: '',
  macAddress: '',
  ip: '',
  cost: 0,
  purchaseCost: 0,
  yearPurchased: '',
  model: '',
  type: '',
  vlan: '',
})
