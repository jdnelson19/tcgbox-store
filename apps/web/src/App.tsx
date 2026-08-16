import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, MouseEvent } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

type ItemField =
  | 'itemName'
  | 'manufacturer'
  | 'vendor'
  | 'location'
  | 'status'
  | 'assetTag'
  | 'serialNumber'
  | 'macAddress'
  | 'ip'
  | 'cost'
  | 'purchaseCost'
  | 'yearPurchased'
  | 'model'
  | 'type'
  | 'vlan'

type InventoryItem = {
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
}

type TotalsData = {
  summary: {
    totalItems: number
    totalCost: number
    uniqueManufacturers: number
    uniqueLocations: number
  }
  byType: Record<string, number>
  byManufacturer: Record<string, number>
  byLocation: Record<string, number>
}

type MapArea = {
  id?: string
  location: string
  locationTag?: string
  color: string
  x: number
  y: number
  width: number
  height: number
}

type MapAsset = {
  id: string
  originalName: string
  mimeType: string
  relativePath: string
  uploadedAt: string
  areas: MapArea[]
}

type FieldDef = {
  key: ItemField
  label: string
  type?: 'text' | 'number'
}

type RoundingStep = 10 | 50 | 100 | 250 | 500 | 1000
type AssetTagMode = 'manual' | 'autoNext'
type InventorySettings = {
  assetTagMode?: AssetTagMode
  requireUniqueAssetTag?: boolean
  keepRemovedAssetTagHistory?: boolean
  requiredAddItemFields?: Partial<Record<ItemField, boolean>>
  excludeRemovedFromReports?: boolean
  columnOrder?: ItemField[]
}
type GraphType = 'bar' | 'circle' | 'line'
type GraphMetric =
  | 'count'
  | 'costSum'
  | 'costAvg'
  | 'purchaseCost'
  | 'projectedReplacementCost'
  | 'age'
  | 'depreciatedValue'
type GraphSortBy = 'label' | 'value'
type GraphBreakdownField = ItemField | 'none'
type PurchaseFilterMode = 'any' | 'year' | 'before' | 'after'
type ReportFilters = {
  category: string
  location: string
  status: string
  purchasedMode: PurchaseFilterMode
  yearPurchased: string
}
type GuidedMeasure = 'count' | 'purchaseCost' | 'age' | 'depreciatedValue'
type GuidedGroupBy = 'category' | 'manufacturer' | 'location' | 'status' | 'yearPurchased' | 'vendor'
type GuidedFilterField = 'category' | 'location' | 'status' | 'yearPurchased'
type GuidedFilter = {
  id: string
  field: GuidedFilterField
  value: string
}
type QuickReportId =
  | 'inventoryByCategory'
  | 'inventoryByLocation'
  | 'valueByLocation'
  | 'valueByType'
  | 'valueByYear'
  | 'projectedReplacementCost'
  | 'purchasedThisYear'
  | 'inventoryGrowth'
type AggregateValues = {
  count: number
  costSum: number
  purchaseCostSum: number
  projectedReplacementCostSum: number
  ageSum: number
  ageCount: number
  depreciatedValueSum: number
}
type ReportPreset = {
  id: string
  name: string
  graphGroupByField: ItemField
  graphBreakdownField?: GraphBreakdownField
  graphMetric: GraphMetric
  graphSortBy: GraphSortBy
  graphSortDirection: 'asc' | 'desc'
  reportLimit: 5 | 10 | 20
  reportSortField: ItemField
  reportSortDirection: 'asc' | 'desc'
  graphType: GraphType
}

type GuidedTemplate = {
  id: string
  name: string
  measure: GuidedMeasure
  groupBy: GuidedGroupBy
  filters: ReportFilters
  graphType: GraphType
}

const apiBase = import.meta.env.VITE_API_BASE ?? ''

const fields: FieldDef[] = [
  { key: 'itemName', label: 'Item Name' },
  { key: 'model', label: 'Model' },
  { key: 'assetTag', label: 'Asset Tag' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'location', label: 'Location' },
  { key: 'status', label: 'Status' },
  { key: 'serialNumber', label: 'Serial Number' },
  { key: 'type', label: 'Type' },
  { key: 'purchaseCost', label: 'Purchase Cost', type: 'number' },
  { key: 'yearPurchased', label: 'Year Purchased' },
  { key: 'macAddress', label: 'MAC Address' },
  { key: 'ip', label: 'IP' },
  { key: 'vlan', label: 'VLAN' },
]

const networkFields: ItemField[] = ['macAddress', 'ip', 'vlan']
const uniqueAddItemFields: ItemField[] = ['itemName', 'assetTag', 'serialNumber', 'purchaseCost', 'macAddress', 'ip']
const roundingSteps: RoundingStep[] = [10, 50, 100, 250, 500, 1000]
const defaultColumnOrder: ItemField[] = fields.map((field) => field.key)
const fieldByKey = Object.fromEntries(fields.map((field) => [field.key, field])) as Record<ItemField, FieldDef>
const createDefaultRequiredAddItemFields = (): Record<ItemField, boolean> =>
  Object.fromEntries(fields.map((field) => [field.key, false])) as Record<ItemField, boolean>
const defaultReportFilters = (): ReportFilters => ({
  category: '',
  location: '',
  status: '',
  purchasedMode: 'any',
  yearPurchased: '',
})
const statusDefaults = ['Working', 'Out for Repair', 'Needs Checked', 'Shelfed', 'Removed'] as const
const guidedGroupByToField: Record<GuidedGroupBy, ItemField> = {
  category: 'type',
  manufacturer: 'manufacturer',
  location: 'location',
  status: 'status',
  yearPurchased: 'yearPurchased',
  vendor: 'vendor',
}
const guidedGroupByLabel: Record<GuidedGroupBy, string> = {
  category: 'Category',
  manufacturer: 'Manufacturer',
  location: 'Location',
  status: 'Status',
  yearPurchased: 'Year Purchased',
  vendor: 'Vendor',
}
const guidedMeasureToMetric: Record<GuidedMeasure, GraphMetric> = {
  count: 'count',
  purchaseCost: 'purchaseCost',
  age: 'age',
  depreciatedValue: 'depreciatedValue',
}

const blankItem = (): Omit<InventoryItem, 'id'> => ({
  itemName: '',
  manufacturer: '',
  vendor: '',
  location: '',
  status: 'Working',
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

const blankArea = (): MapArea => ({
  location: '',
  color: '#e38336',
  x: 5,
  y: 5,
  width: 20,
  height: 20,
})

function App() {
  const [tab, setTab] = useState<'inventory' | 'maps' | 'reports' | 'import' | 'settings'>('inventory')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [itemDraft, setItemDraft] = useState<Omit<InventoryItem, 'id'>>(blankItem)
  const [filters, setFilters] = useState<Partial<Record<ItemField, string>>>({})
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<ItemField>('itemName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [reportSortField, setReportSortField] = useState<ItemField>('itemName')
  const [reportSortDirection, setReportSortDirection] = useState<'asc' | 'desc'>('asc')
  const [roundingStep, setRoundingStep] = useState<RoundingStep>(100)
  const [assetTagMode, setAssetTagMode] = useState<AssetTagMode>('manual')
  const [requireUniqueAssetTag, setRequireUniqueAssetTag] = useState(false)
  const [keepRemovedAssetTagHistory, setKeepRemovedAssetTagHistory] = useState(true)
  const [requiredAddItemFields, setRequiredAddItemFields] = useState<Record<ItemField, boolean>>(createDefaultRequiredAddItemFields)
  const [excludeRemovedFromReports, setExcludeRemovedFromReports] = useState(true)
  const [isAddExpanded, setIsAddExpanded] = useState(false)
  const [dirtyItemIds, setDirtyItemIds] = useState<Record<string, true>>({})
  const [showNetworkFields, setShowNetworkFields] = useState(false)
  const [isAssetTagHistoryOpen, setIsAssetTagHistoryOpen] = useState(false)
  const [columnOrder, setColumnOrder] = useState<ItemField[]>(defaultColumnOrder)
  const [totals, setTotals] = useState<TotalsData | null>(null)
  const [graphGroupByField, setGraphGroupByField] = useState<ItemField>('type')
  const [graphBreakdownField, setGraphBreakdownField] = useState<GraphBreakdownField>('none')
  const [graphMetric, setGraphMetric] = useState<GraphMetric>('count')
  const [graphSortBy, setGraphSortBy] = useState<GraphSortBy>('value')
  const [graphSortDirection, setGraphSortDirection] = useState<'asc' | 'desc'>('desc')
  const [reportLimit, setReportLimit] = useState<5 | 10 | 20>(10)
  const [graphType, setGraphType] = useState<GraphType>('bar')
  const [activeReportName, setActiveReportName] = useState('Custom Report')
  const [reportFilters, setReportFilters] = useState<ReportFilters>(defaultReportFilters)
  const [guidedMeasure, setGuidedMeasure] = useState<GuidedMeasure>('count')
  const [guidedGroupBy, setGuidedGroupBy] = useState<GuidedGroupBy>('category')
  const [guidedFilters, setGuidedFilters] = useState<GuidedFilter[]>([])
  const [guidedGraphType, setGuidedGraphType] = useState<GraphType>('bar')
  const [guidedTemplateName, setGuidedTemplateName] = useState('')
  const [guidedTemplates, setGuidedTemplates] = useState<GuidedTemplate[]>([])
  const [reportPresets, setReportPresets] = useState<ReportPreset[]>([])
  const [reportPresetName, setReportPresetName] = useState('')
  const [options, setOptions] = useState<Record<string, string[]>>({})
  const [maps, setMaps] = useState<MapAsset[]>([])
  const [selectedMapId, setSelectedMapId] = useState<string>('')
  const [mapUploadFile, setMapUploadFile] = useState<File | null>(null)
  const [areaDraft, setAreaDraft] = useState<MapArea>(blankArea)
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)
  const [importFileName, setImportFileName] = useState('')
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([])
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Partial<Record<ItemField, string>>>({})
  const [busyMessage, setBusyMessage] = useState('')
  const [isMac, setIsMac] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState(search)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const itemNameInputRef = useRef<HTMLInputElement | null>(null)
  const addItemFormRef = useRef<HTMLFormElement | null>(null)

  const selectedMap = useMemo(() => maps.find((m) => m.id === selectedMapId) ?? null, [maps, selectedMapId])
  const safeColumnOrder = useMemo(() => columnOrder.filter((key) => Boolean(fieldByKey[key])) as ItemField[], [columnOrder])
  const modifierLabel = isMac ? 'Option' : 'Alt'
  const isDuplicateAssetTag = useMemo(() => {
    if (!requireUniqueAssetTag || assetTagMode === 'autoNext') {
      return false
    }

    const value = String(itemDraft.assetTag ?? '').trim().toLowerCase()
    if (!value) {
      return false
    }

    return items.some((item) => String(item.assetTag ?? '').trim().toLowerCase() === value)
  }, [assetTagMode, itemDraft.assetTag, items, requireUniqueAssetTag])
  const addFormFields = useMemo(
    () =>
      fields.filter((field) => {
        if (requiredAddItemFields[field.key]) {
          return true
        }
        return showNetworkFields || !networkFields.includes(field.key)
      }),
    [requiredAddItemFields, showNetworkFields],
  )

  const openAddItemForm = (): void => {
    setTab('inventory')
    setIsAddExpanded(true)
    requestAnimationFrame(() => {
      itemNameInputRef.current?.focus()
      itemNameInputRef.current?.select()
    })
  }

  const topCards = useMemo(() => {
    if (!totals) {
      return [
        { label: 'Total Items', value: '0' },
        { label: 'Total Value', value: '$0.00' },
        { label: 'Manufacturers', value: '0' },
        { label: 'Locations', value: '0' },
      ]
    }

    return [
      { label: 'Total Items', value: String(totals.summary.totalItems) },
      { label: 'Total Value', value: formatCurrency(totals.summary.totalCost) },
      { label: 'Manufacturers', value: String(totals.summary.uniqueManufacturers) },
      { label: 'Locations', value: String(totals.summary.uniqueLocations) },
    ]
  }, [totals])

  const dragPreview = useMemo(() => {
    if (!dragStart || !dragCurrent) {
      return null
    }

    return getRectFromPoints(dragStart, dragCurrent)
  }, [dragStart, dragCurrent])

  const quickReports = useMemo(
    () =>
      [
        {
          id: 'inventoryByCategory' as QuickReportId,
          icon: '📊',
          title: 'Inventory by Category',
          graphGroupByField: 'type' as ItemField,
          graphMetric: 'count' as GraphMetric,
          graphType: 'bar' as GraphType,
          graphSortBy: 'value' as GraphSortBy,
          graphSortDirection: 'desc' as const,
          reportLimit: 20 as const,
          filters: defaultReportFilters(),
        },
        {
          id: 'inventoryByLocation' as QuickReportId,
          icon: '📍',
          title: 'Inventory by Location',
          graphGroupByField: 'location' as ItemField,
          graphMetric: 'count' as GraphMetric,
          graphType: 'bar' as GraphType,
          graphSortBy: 'value' as GraphSortBy,
          graphSortDirection: 'desc' as const,
          reportLimit: 20 as const,
          filters: defaultReportFilters(),
        },
        {
          id: 'valueByLocation' as QuickReportId,
          icon: '💰',
          title: 'Inventory Value by Location',
          graphGroupByField: 'location' as ItemField,
          graphMetric: 'purchaseCost' as GraphMetric,
          graphType: 'bar' as GraphType,
          graphSortBy: 'value' as GraphSortBy,
          graphSortDirection: 'desc' as const,
          reportLimit: 20 as const,
          filters: defaultReportFilters(),
        },
        {
          id: 'valueByType' as QuickReportId,
          icon: '💰',
          title: 'Inventory Value by Type',
          graphGroupByField: 'type' as ItemField,
          graphMetric: 'purchaseCost' as GraphMetric,
          graphType: 'bar' as GraphType,
          graphSortBy: 'value' as GraphSortBy,
          graphSortDirection: 'desc' as const,
          reportLimit: 20 as const,
          filters: defaultReportFilters(),
        },
        {
          id: 'valueByYear' as QuickReportId,
          icon: '💰',
          title: 'Inventory Value by Year',
          graphGroupByField: 'yearPurchased' as ItemField,
          graphMetric: 'purchaseCost' as GraphMetric,
          graphType: 'bar' as GraphType,
          graphSortBy: 'label' as GraphSortBy,
          graphSortDirection: 'asc' as const,
          reportLimit: 20 as const,
          filters: defaultReportFilters(),
        },
        {
          id: 'projectedReplacementCost' as QuickReportId,
          icon: '🧾',
          title: 'Projected Replacement Cost',
          graphGroupByField: 'yearPurchased' as ItemField,
          graphMetric: 'projectedReplacementCost' as GraphMetric,
          graphType: 'bar' as GraphType,
          graphSortBy: 'label' as GraphSortBy,
          graphSortDirection: 'asc' as const,
          reportLimit: 20 as const,
          filters: defaultReportFilters(),
        },
        {
          id: 'purchasedThisYear' as QuickReportId,
          icon: '📅',
          title: 'Equipment Purchased This Year',
          graphGroupByField: 'type' as ItemField,
          graphMetric: 'count' as GraphMetric,
          graphType: 'bar' as GraphType,
          graphSortBy: 'value' as GraphSortBy,
          graphSortDirection: 'desc' as const,
          reportLimit: 20 as const,
          filters: {
            ...defaultReportFilters(),
            purchasedMode: 'year' as const,
            yearPurchased: String(new Date().getFullYear()),
          },
        },
        {
          id: 'inventoryGrowth' as QuickReportId,
          icon: '📈',
          title: 'Inventory Growth',
          graphGroupByField: 'yearPurchased' as ItemField,
          graphMetric: 'count' as GraphMetric,
          graphType: 'line' as GraphType,
          graphSortBy: 'label' as GraphSortBy,
          graphSortDirection: 'asc' as const,
          reportLimit: 20 as const,
          filters: defaultReportFilters(),
        },
      ] as const,
    [],
  )

  const guidedFilterValueOptions = (field: GuidedFilterField): string[] => {
    if (field === 'category') {
      return options.type ?? []
    }
    if (field === 'location') {
      return options.location ?? []
    }
    if (field === 'status') {
      return [...new Set([...(options.status ?? []), ...statusDefaults])]
    }
    return options.yearPurchased ?? []
  }

  const reportFilteredItems = useMemo(
    () => applyReportFilters(items, reportFilters, excludeRemovedFromReports),
    [items, reportFilters, excludeRemovedFromReports],
  )

  const reportRows = useMemo(() => {
    const aggregate = reportFilteredItems.reduce<Record<string, Record<string, AggregateValues>>>((acc, item) => {
      const primary = reportGroupingValue(item, graphGroupByField, graphMetric) || 'Unspecified'
      const secondary =
        graphBreakdownField === 'none'
          ? ''
          : reportGroupingValue(item, graphBreakdownField, graphMetric) || 'Unspecified'

      if (!acc[primary]) {
        acc[primary] = {}
      }
      if (!acc[primary][secondary]) {
        acc[primary][secondary] = {
          count: 0,
          costSum: 0,
          purchaseCostSum: 0,
          projectedReplacementCostSum: 0,
          ageSum: 0,
          ageCount: 0,
          depreciatedValueSum: 0,
        }
      }

      acc[primary][secondary].count += 1
      const safeCost = Number(item.cost) || 0
      const safePurchaseCost = itemPurchaseCost(item)
      const age = itemAge(item)
      acc[primary][secondary].costSum += safeCost
      acc[primary][secondary].purchaseCostSum += safePurchaseCost
      acc[primary][secondary].projectedReplacementCostSum += safePurchaseCost * 0.27
      if (age !== null) {
        acc[primary][secondary].ageSum += age
        acc[primary][secondary].ageCount += 1
      }
      acc[primary][secondary].depreciatedValueSum += depreciatedValue(safePurchaseCost, age)
      return acc
    }, {})

    const rows = Object.entries(aggregate).flatMap(([primary, secondaryBucket]) =>
      Object.entries(secondaryBucket).map(([secondary, values]) => {
        const label = secondary ? `${primary} | ${secondary}` : primary
        return [label, metricValue(values, graphMetric)] as [string, number]
      }),
    )

    rows.sort((a, b) => {
      const compare =
        graphSortBy === 'label'
          ? a[0].localeCompare(b[0], undefined, { numeric: true })
          : a[1] - b[1]
      return graphSortDirection === 'desc' ? -compare : compare
    })

    return rows.slice(0, reportLimit)
  }, [graphGroupByField, graphBreakdownField, graphMetric, graphSortBy, graphSortDirection, reportLimit, reportFilteredItems])

  const reportBreakdownTable = useMemo(() => {
    if (graphBreakdownField === 'none') {
      return null
    }

    const matrix = reportFilteredItems.reduce<Record<string, Record<string, AggregateValues>>>((acc, item) => {
      const primary = reportGroupingValue(item, graphGroupByField, graphMetric) || 'Unspecified'
      const secondary = reportGroupingValue(item, graphBreakdownField, graphMetric) || 'Unspecified'

      if (!acc[primary]) {
        acc[primary] = {}
      }
      if (!acc[primary][secondary]) {
        acc[primary][secondary] = {
          count: 0,
          costSum: 0,
          purchaseCostSum: 0,
          projectedReplacementCostSum: 0,
          ageSum: 0,
          ageCount: 0,
          depreciatedValueSum: 0,
        }
      }

      acc[primary][secondary].count += 1
      const safeCost = Number(item.cost) || 0
      const safePurchaseCost = itemPurchaseCost(item)
      const age = itemAge(item)
      acc[primary][secondary].costSum += safeCost
      acc[primary][secondary].purchaseCostSum += safePurchaseCost
      acc[primary][secondary].projectedReplacementCostSum += safePurchaseCost * 0.27
      if (age !== null) {
        acc[primary][secondary].ageSum += age
        acc[primary][secondary].ageCount += 1
      }
      acc[primary][secondary].depreciatedValueSum += depreciatedValue(safePurchaseCost, age)
      return acc
    }, {})

    const primaryLabels = Object.keys(matrix).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const secondaryLabels = [...new Set(primaryLabels.flatMap((primary) => Object.keys(matrix[primary] ?? {})))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    )

    return {
      primaryLabels,
      secondaryLabels,
      valueFor: (primary: string, secondary: string): number => {
        const values = matrix[primary]?.[secondary]
        if (!values) {
          return 0
        }
        return metricValue(values, graphMetric)
      },
    }
  }, [graphGroupByField, graphBreakdownField, graphMetric, reportFilteredItems])

  const reportTableRows = useMemo(() => {
    const sorted = [...reportFilteredItems]
    sorted.sort((a, b) => {
      const left = String(a[reportSortField] ?? '').toLowerCase()
      const right = String(b[reportSortField] ?? '').toLowerCase()
      const result = left.localeCompare(right, undefined, { numeric: true })
      return reportSortDirection === 'desc' ? -result : result
    })
    return sorted
  }, [reportFilteredItems, reportSortField, reportSortDirection])

  const nextAutoAssetTag = useMemo(() => findNextAssetTag(items), [items])

  const assetTagHistory = useMemo(() => {
    const active: InventoryItem[] = []
    const removed: InventoryItem[] = []

    for (const item of items) {
      if (!String(item.assetTag ?? '').trim()) {
        continue
      }
      if (isRemovedStatus(item.status)) {
        removed.push(item)
      } else {
        active.push(item)
      }
    }

    const sortByTagThenName = (left: InventoryItem, right: InventoryItem): number => {
      const leftTag = String(left.assetTag ?? '')
      const rightTag = String(right.assetTag ?? '')
      const tagResult = leftTag.localeCompare(rightTag, undefined, { numeric: true })
      if (tagResult !== 0) {
        return tagResult
      }
      return String(left.itemName ?? '').localeCompare(String(right.itemName ?? ''), undefined, { numeric: true })
    }

    active.sort(sortByTagThenName)
    removed.sort(sortByTagThenName)

    return { active, removed }
  }, [items])

  const buildItemPayload = (source: Omit<InventoryItem, 'id'>): Omit<InventoryItem, 'id'> => {
    const status = String(source.status ?? '') || 'Working'
    const payload: Omit<InventoryItem, 'id'> = {
      itemName: String(source.itemName ?? ''),
      manufacturer: String(source.manufacturer ?? ''),
      vendor: String(source.vendor ?? ''),
      location: String(source.location ?? ''),
      status,
      assetTag: String(source.assetTag ?? '').trim(),
      serialNumber: String(source.serialNumber ?? ''),
      macAddress: String(source.macAddress ?? ''),
      ip: String(source.ip ?? ''),
      cost: roundToNearest(Number(source.cost || 0), roundingStep),
      purchaseCost: roundToNearest(Number(source.purchaseCost || source.cost || 0), roundingStep),
      yearPurchased: String(source.yearPurchased ?? ''),
      model: String(source.model ?? ''),
      type: String(source.type ?? ''),
      vlan: String(source.vlan ?? ''),
    }

    if (!keepRemovedAssetTagHistory && isRemovedStatus(payload.status)) {
      payload.assetTag = ''
    }

    return payload
  }

  const saveItem = async (id: string, payload: Omit<InventoryItem, 'id'>, busyLabel: string): Promise<void> => {
    setBusyMessage(busyLabel)
    try {
      await request(`/api/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      await Promise.all([refreshItems(), refreshTotals(), refreshOptions()])
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to save item.')
      throw error
    } finally {
      setBusyMessage('')
    }
  }

  const onClearRemovedAssetTag = async (item: InventoryItem): Promise<void> => {
    if (!isRemovedStatus(item.status) || !String(item.assetTag ?? '').trim()) {
      return
    }

    try {
      await saveItem(item.id, buildItemPayload({ ...item, assetTag: '' }), 'Clearing removed asset tag...')
    } catch {
      return
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search)
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [search])

  useEffect(() => {
    void refreshItems()
  }, [debouncedSearch, sortField, sortDirection, filters])

  useEffect(() => {
    void refreshTotals()
    void refreshOptions()
    void refreshMaps()
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('inventory.settings')
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw) as InventorySettings & { roundingStep?: RoundingStep }

      if (roundingSteps.includes(parsed.roundingStep as RoundingStep)) {
        setRoundingStep(parsed.roundingStep as RoundingStep)
      }
      if (parsed.assetTagMode === 'manual' || parsed.assetTagMode === 'autoNext') {
        setAssetTagMode(parsed.assetTagMode)
      }
      if (typeof parsed.requireUniqueAssetTag === 'boolean') {
        setRequireUniqueAssetTag(parsed.requireUniqueAssetTag)
      }
      if (typeof parsed.keepRemovedAssetTagHistory === 'boolean') {
        setKeepRemovedAssetTagHistory(parsed.keepRemovedAssetTagHistory)
      }
      if (parsed.requiredAddItemFields) {
        setRequiredAddItemFields(normalizeRequiredAddItemFields(parsed.requiredAddItemFields))
      }
      if (typeof parsed.excludeRemovedFromReports === 'boolean') {
        setExcludeRemovedFromReports(parsed.excludeRemovedFromReports)
      }
      if (isValidColumnOrder(parsed.columnOrder)) {
        setColumnOrder(parsed.columnOrder)
      }
    } catch {
      // Keep defaults when settings JSON is invalid.
    }
  }, [])

  useEffect(() => {
    const payload = {
      roundingStep,
      assetTagMode,
      requireUniqueAssetTag,
      keepRemovedAssetTagHistory,
      requiredAddItemFields,
      excludeRemovedFromReports,
      columnOrder,
    }
    localStorage.setItem('inventory.settings', JSON.stringify(payload))
  }, [roundingStep, assetTagMode, requireUniqueAssetTag, keepRemovedAssetTagHistory, requiredAddItemFields, excludeRemovedFromReports, columnOrder])

  useEffect(() => {
    setColumnOrder((current) => {
      const cleaned = current.filter((key) => Boolean(fieldByKey[key]))
      const isComplete =
        cleaned.length === defaultColumnOrder.length &&
        defaultColumnOrder.every((key) => cleaned.includes(key))
      return isComplete ? cleaned : defaultColumnOrder
    })
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('inventory.reportPresets')
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw) as ReportPreset[]
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((preset) => isValidReportPreset(preset))
        setReportPresets(valid)
      }
    } catch {
      // Keep defaults when presets JSON is invalid.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('inventory.reportPresets', JSON.stringify(reportPresets))
  }, [reportPresets])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('inventory.guidedTemplates')
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw) as GuidedTemplate[]
      if (Array.isArray(parsed)) {
        const valid = parsed
          .map((template) => normalizeGuidedTemplate(template))
          .filter((template): template is GuidedTemplate => template !== null)
        setGuidedTemplates(valid)
      }
    } catch {
      // Keep defaults when guided templates JSON is invalid.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('inventory.guidedTemplates', JSON.stringify(guidedTemplates))
  }, [guidedTemplates])

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'))
  }, [])

  useEffect(() => {
    const focusSearch = (): void => {
      setTab('inventory')
      requestAnimationFrame(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      })
    }

    const submitAddItem = (): void => {
      setTab('inventory')
      setIsAddExpanded(true)
      requestAnimationFrame(() => {
        addItemFormRef.current?.requestSubmit()
      })
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.altKey
      if (!mod) {
        return
      }

      const code = event.code

      if (code === 'Digit1') {
        event.preventDefault()
        setTab('inventory')
        return
      }
      if (code === 'Digit2') {
        event.preventDefault()
        setTab('maps')
        return
      }
      if (code === 'Digit3') {
        event.preventDefault()
        setTab('reports')
        return
      }
      if (code === 'Digit4') {
        event.preventDefault()
        setTab('import')
        return
      }
      if (code === 'Digit5') {
        event.preventDefault()
        setTab('settings')
        return
      }
      if (code === 'KeyF') {
        event.preventDefault()
        focusSearch()
        return
      }
      if (code === 'KeyN') {
        event.preventDefault()
        openAddItemForm()
        return
      }
      if (code === 'Enter' || code === 'NumpadEnter') {
        event.preventDefault()
        submitAddItem()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const refreshItems = async (): Promise<void> => {
    const query = new URLSearchParams({
      search: debouncedSearch,
      sortField,
      sortDirection,
    })
    for (const field of fields) {
      const value = filters[field.key]?.trim()
      if (value) {
        query.set(field.key, value)
      }
    }
    const data = await request<{ items: InventoryItem[] }>(`/api/items?${query.toString()}`)
    setItems(data.items)
  }

  const refreshTotals = async (): Promise<void> => {
    const data = await request<TotalsData>('/api/totals')
    setTotals(data)
  }

  const refreshOptions = async (): Promise<void> => {
    const data = await request<{ options: Record<string, string[]> }>('/api/options')
    setOptions(data.options)
  }

  const refreshMaps = async (): Promise<void> => {
    const data = await request<{ maps: MapAsset[] }>('/api/maps')
    setMaps(data.maps)
    if (!selectedMapId && data.maps.length > 0) {
      setSelectedMapId(data.maps[0].id)
    }
  }

  const onAddItem = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setBusyMessage('Adding item...')
    try {
      const payload = buildItemPayload({
        ...itemDraft,
        status: itemDraft.status || 'Working',
        assetTag: assetTagMode === 'autoNext' ? nextAutoAssetTag : itemDraft.assetTag,
        ...(showNetworkFields ? {} : { macAddress: '', ip: '', vlan: '' }),
      })

      await request('/api/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setItemDraft(blankItem())
      setShowNetworkFields(false)
      await Promise.all([refreshItems(), refreshTotals(), refreshOptions()])
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to add item.')
    } finally {
      setBusyMessage('')
    }
  }

  const onInlineItemChange = (id: string, key: ItemField, nextValue: string): void => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item
        }
        const field = fieldByKey[key]
        return {
          ...item,
          [key]: field.type === 'number' ? Number(nextValue) || 0 : nextValue,
          ...(key === 'status' && !keepRemovedAssetTagHistory && isRemovedStatus(nextValue) ? { assetTag: '' } : {}),
        }
      }),
    )
    setDirtyItemIds((current) => ({ ...current, [id]: true }))
  }

  const onInlineItemCommit = async (id: string): Promise<void> => {
    if (!dirtyItemIds[id]) {
      return
    }

    const item = items.find((entry) => entry.id === id)
    if (!item) {
      return
    }

    try {
      await saveItem(id, buildItemPayload(item), 'Updating item...')
      setDirtyItemIds((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    } catch {
      return
    } finally {
      // saveItem handles busy state
    }
  }

  const onDeleteItem = async (id: string): Promise<void> => {
    setBusyMessage('Removing item...')
    try {
      await request(`/api/items/${id}`, { method: 'DELETE' })
      await Promise.all([refreshItems(), refreshTotals(), refreshOptions()])
    } finally {
      setBusyMessage('')
    }
  }

  const onUploadMap = async (): Promise<void> => {
    if (!mapUploadFile) {
      return
    }
    setBusyMessage('Uploading map...')
    try {
      const formData = new FormData()
      formData.set('mapFile', mapUploadFile)
      await fetch(`${apiBase}/api/maps`, {
        method: 'POST',
        body: formData,
      })
      setMapUploadFile(null)
      await refreshMaps()
    } finally {
      setBusyMessage('')
    }
  }

  const onCreateArea = async (): Promise<void> => {
    if (!selectedMap) {
      return
    }

    const areaPayload = {
      ...areaDraft,
      id: editingAreaId ?? undefined,
    }

    const nextAreas = editingAreaId
      ? selectedMap.areas.map((area) => (area.id === editingAreaId ? { ...area, ...areaPayload } : area))
      : [...selectedMap.areas, areaPayload]

    setBusyMessage(editingAreaId ? 'Updating map area...' : 'Saving map area...')
    try {
      await request(`/api/maps/${selectedMap.id}/areas`, {
        method: 'PUT',
        body: JSON.stringify({ areas: nextAreas }),
      })
      setAreaDraft(blankArea())
      setEditingAreaId(null)
      setDragStart(null)
      setDragCurrent(null)
      await Promise.all([refreshMaps(), refreshOptions()])
    } finally {
      setBusyMessage('')
    }
  }

  const onMapMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    const point = getPercentPoint(event)
    setDragStart(point)
    setDragCurrent(point)
  }

  const onMapMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    if (!dragStart) {
      return
    }
    setDragCurrent(getPercentPoint(event))
  }

  const onMapMouseUp = (event: MouseEvent<HTMLDivElement>): void => {
    if (!dragStart) {
      return
    }

    const end = getPercentPoint(event)
    const rect = getRectFromPoints(dragStart, end)
    setAreaDraft((previous) => ({
      ...previous,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }))
    setDragStart(null)
    setDragCurrent(null)
  }

  const onSelectArea = (area: MapArea): void => {
    setEditingAreaId(area.id ?? null)
    setAreaDraft({
      id: area.id,
      location: area.location ?? area.locationTag ?? '',
      color: area.color ?? '#e38336',
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
    })
  }

  const onDeleteArea = async (): Promise<void> => {
    if (!selectedMap || !editingAreaId) {
      return
    }

    const nextAreas = selectedMap.areas.filter((area) => area.id !== editingAreaId)
    setBusyMessage('Deleting map area...')
    try {
      await request(`/api/maps/${selectedMap.id}/areas`, {
        method: 'PUT',
        body: JSON.stringify({ areas: nextAreas }),
      })
      setAreaDraft(blankArea())
      setEditingAreaId(null)
      await Promise.all([refreshMaps(), refreshOptions()])
    } finally {
      setBusyMessage('')
    }
  }

  const onClearAreaEdit = (): void => {
    setEditingAreaId(null)
    setAreaDraft(blankArea())
    setDragStart(null)
    setDragCurrent(null)
  }

  const onHeaderSort = (field: ItemField): void => {
    if (sortField === field) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortField(field)
    setSortDirection('asc')
  }

  const onReportHeaderSort = (field: ItemField): void => {
    if (reportSortField === field) {
      setReportSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setReportSortField(field)
    setReportSortDirection('asc')
  }

  const onSaveReportPreset = (): void => {
    const name = reportPresetName.trim()
    if (!name) {
      return
    }

    const preset: ReportPreset = {
      id: crypto.randomUUID(),
      name,
      graphGroupByField,
      graphBreakdownField,
      graphMetric,
      graphSortBy,
      graphSortDirection,
      reportLimit,
      reportSortField,
      reportSortDirection,
      graphType,
    }

    setReportPresets((current) => [preset, ...current])
    setReportPresetName('')
  }

  const onApplyReportPreset = (preset: ReportPreset): void => {
    setGraphGroupByField(preset.graphGroupByField)
    setGraphBreakdownField(preset.graphBreakdownField ?? 'none')
    setGraphMetric(preset.graphMetric)
    setGraphSortBy(preset.graphSortBy)
    setGraphSortDirection(preset.graphSortDirection)
    setReportLimit(preset.reportLimit)
    setReportSortField(preset.reportSortField)
    setReportSortDirection(preset.reportSortDirection)
    setGraphType(preset.graphType)
  }

  const onDeleteReportPreset = (id: string): void => {
    setReportPresets((current) => current.filter((preset) => preset.id !== id))
  }

  const onRunQuickReport = (id: QuickReportId): void => {
    const quick = quickReports.find((entry) => entry.id === id)
    if (!quick) {
      return
    }

    setActiveReportName(quick.title)
    setGraphGroupByField(quick.graphGroupByField)
    setGraphBreakdownField('none')
    setGraphMetric(quick.graphMetric)
    setGraphSortBy(quick.graphSortBy)
    setGraphSortDirection(quick.graphSortDirection)
    setReportLimit(quick.reportLimit)
    setGraphType(quick.graphType)
    setReportFilters(normalizeReportFilters(quick.filters))
  }

  const onRunGuidedReport = (): void => {
    const metric = guidedMeasureToMetric[guidedMeasure]
    const groupField = guidedGroupByToField[guidedGroupBy]
    const generatedName = `Guided: ${guidedMeasureLabel(guidedMeasure)} by ${guidedGroupByLabel[guidedGroupBy]}`
    const nextFilters: ReportFilters = defaultReportFilters()

    for (const filter of guidedFilters) {
      const value = filter.value.trim()
      if (!value) {
        continue
      }
      if (filter.field === 'category') {
        nextFilters.category = value
      } else if (filter.field === 'location') {
        nextFilters.location = value
      } else if (filter.field === 'status') {
        nextFilters.status = value
      } else if (filter.field === 'yearPurchased') {
        nextFilters.purchasedMode = 'year'
        nextFilters.yearPurchased = value
      }
    }

    setActiveReportName(generatedName)
    setGraphGroupByField(groupField)
    setGraphBreakdownField('none')
    setGraphMetric(metric)
    setGraphSortBy(metric === 'age' ? 'label' : 'value')
    setGraphSortDirection(metric === 'age' ? 'asc' : 'desc')
    setReportLimit(20)
    setGraphType(guidedGraphType)
    setReportFilters(nextFilters)
  }

  const onSaveGuidedTemplate = (): void => {
    const name = guidedTemplateName.trim()
    if (!name) {
      return
    }

    const nextFilters: ReportFilters = defaultReportFilters()
    for (const filter of guidedFilters) {
      const value = filter.value.trim()
      if (!value) {
        continue
      }
      if (filter.field === 'category') {
        nextFilters.category = value
      } else if (filter.field === 'location') {
        nextFilters.location = value
      } else if (filter.field === 'status') {
        nextFilters.status = value
      } else if (filter.field === 'yearPurchased') {
        nextFilters.purchasedMode = 'year'
        nextFilters.yearPurchased = value
      }
    }

    const template: GuidedTemplate = {
      id: crypto.randomUUID(),
      name,
      measure: guidedMeasure,
      groupBy: guidedGroupBy,
      filters: nextFilters,
      graphType: guidedGraphType,
    }

    setGuidedTemplates((current) => [template, ...current])
    setGuidedTemplateName('')
  }

  const onAddGuidedFilter = (): void => {
    setGuidedFilters((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        field: 'location',
        value: '',
      },
    ])
  }

  const onChangeGuidedFilterField = (id: string, field: GuidedFilterField): void => {
    setGuidedFilters((current) =>
      current.map((filter) =>
        filter.id === id
          ? {
              ...filter,
              field,
              value: '',
            }
          : filter,
      ),
    )
  }

  const onChangeGuidedFilterValue = (id: string, value: string): void => {
    setGuidedFilters((current) => current.map((filter) => (filter.id === id ? { ...filter, value } : filter)))
  }

  const onRemoveGuidedFilter = (id: string): void => {
    setGuidedFilters((current) => current.filter((filter) => filter.id !== id))
  }

  const onApplyGuidedTemplate = (template: GuidedTemplate): void => {
    setGuidedMeasure(template.measure)
    setGuidedGroupBy(template.groupBy)
    setGuidedFilters(guidedFiltersFromReportFilters(template.filters))
    setGuidedGraphType(template.graphType)
  }

  const onDeleteGuidedTemplate = (id: string): void => {
    setGuidedTemplates((current) => current.filter((template) => template.id !== id))
  }

  const onExportReport = (): void => {
    const summaryRows = reportRows.map(([label, value]) => ({
      Label: label,
      Value: formatMetric(value, graphMetric),
      NumericValue: roundTwo(value),
    }))

    const detailRows = reportTableRows.map((item) =>
      safeColumnOrder.reduce<Record<string, string | number>>((acc, key) => {
        acc[fieldByKey[key].label] = item[key]
        return acc
      }, {}),
    )

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'Filtered Items')

    if (reportBreakdownTable) {
      const matrixRows = reportBreakdownTable.primaryLabels.map((primary) => {
        const row: Record<string, string | number> = { [fieldByKey[graphGroupByField].label]: primary }
        for (const secondary of reportBreakdownTable.secondaryLabels) {
          row[secondary] = roundTwo(reportBreakdownTable.valueFor(primary, secondary))
        }
        return row
      })
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(matrixRows), 'Breakdown Matrix')
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const safeName = normalize(activeReportName) || 'report'
    XLSX.writeFile(workbook, `${safeName}-${stamp}.xlsx`)
  }

  const onExportSpreadsheet = (): void => {
    const rows = items.map((item) =>
      safeColumnOrder.reduce<Record<string, string | number>>((acc, key) => {
        acc[fieldByKey[key].label] = item[key]
        return acc
      }, {}),
    )

    const sheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Inventory')
    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `inventory-export-${stamp}.xlsx`)
  }

  const onImportSpreadsheet = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheetName = workbook.SheetNames[0]
    const firstSheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []

    const autoMap: Partial<Record<ItemField, string>> = {}
    for (const field of fields) {
      const found = headers.find((header) => normalize(header) === normalize(field.label))
      if (found) {
        autoMap[field.key] = found
      }
    }

    setImportFileName(file.name)
    setImportRows(rows)
    setImportHeaders(headers)
    setMapping(autoMap)
  }

  const onCommitImport = async (): Promise<void> => {
    const nextPool = buildAssetTagPool(items)
    const mappedRows = importRows.map((row) => {
      const item: Omit<InventoryItem, 'id'> = blankItem()
      for (const field of fields) {
        const source = mapping[field.key]
        if (!source) {
          continue
        }
        const raw = row[source]
        if (field.key === 'cost') {
          item.cost = roundToNearest(Number(raw ?? 0) || 0, roundingStep)
        } else if (field.key === 'purchaseCost') {
          item.purchaseCost = roundToNearest(Number(raw ?? 0) || 0, roundingStep)
        } else if (field.key === 'itemName') {
          item.itemName = String(raw ?? '').trim()
        } else if (field.key === 'manufacturer') {
          item.manufacturer = String(raw ?? '').trim()
        } else if (field.key === 'vendor') {
          item.vendor = String(raw ?? '').trim()
        } else if (field.key === 'location') {
          item.location = String(raw ?? '').trim()
        } else if (field.key === 'status') {
          item.status = String(raw ?? '').trim()
        } else if (field.key === 'assetTag') {
          item.assetTag = String(raw ?? '').trim()
        } else if (field.key === 'serialNumber') {
          item.serialNumber = String(raw ?? '').trim()
        } else if (field.key === 'macAddress') {
          item.macAddress = String(raw ?? '').trim()
        } else if (field.key === 'ip') {
          item.ip = String(raw ?? '').trim()
        } else if (field.key === 'yearPurchased') {
          item.yearPurchased = String(raw ?? '').trim()
        } else if (field.key === 'model') {
          item.model = String(raw ?? '').trim()
        } else if (field.key === 'type') {
          item.type = String(raw ?? '').trim()
        } else if (field.key === 'vlan') {
          item.vlan = String(raw ?? '').trim()
        } else {
          // Exhaustive guard for future fields.
        }
      }

      if (!item.purchaseCost) {
        item.purchaseCost = item.cost
      }
      if (!item.status) {
        item.status = 'Working'
      }

      if (assetTagMode === 'autoNext') {
        item.assetTag = String(nextFromPool(nextPool))
      }
      return buildItemPayload(item)
    })

    setBusyMessage(`Importing ${mappedRows.length} rows...`)
    try {
      await request('/api/items/bulk', {
        method: 'POST',
        body: JSON.stringify({ items: mappedRows }),
      })
      await Promise.all([refreshItems(), refreshTotals(), refreshOptions()])
      setTab('inventory')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to import items.')
    } finally {
      setBusyMessage('')
    }
  }

  return (
    <main className="app-shell">
      <header className="top-header">
        <div>
          <p className="eyebrow">Inventory Tracking Workspace</p>
          <h1>Asset Inventory Manager</h1>
          <p className="shortcut-hint">
            Shortcuts: {isMac ? 'Option' : 'Alt'}+1..5 tabs, {isMac ? 'Option' : 'Alt'}+F search, {isMac ? 'Option' : 'Alt'}+N add item, {isMac ? 'Option' : 'Alt'}+Enter submit item
          </p>
        </div>
        <p className="busy">{busyMessage}</p>
      </header>

      <section className="card-grid">
        {topCards.map((card) => (
          <article key={card.label} className="metric-card">
            <p>{card.label}</p>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <nav className="tabs">
        <button type="button" className={tab === 'inventory' ? 'active' : ''} onClick={() => setTab('inventory')}>
          Inventory
        </button>
        <button type="button" className={tab === 'maps' ? 'active' : ''} onClick={() => setTab('maps')}>
          Maps
        </button>
        <button type="button" className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>
          Reports
        </button>
        <button type="button" className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>
          Import
        </button>
        <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          Settings
        </button>
      </nav>

      {tab === 'inventory' && (
        <section className="inventory-layout">
          <article className="panel inventory-block">
            <div className="block-title-row">
              <button
                type="button"
                className="submit-btn"
                onClick={() => {
                  if (isAddExpanded) {
                    setIsAddExpanded(false)
                    return
                  }
                  openAddItemForm()
                }}
              >
                {isAddExpanded ? 'Close Add Item' : 'Add Item'}
              </button>
            </div>
            {isAddExpanded && (
              <>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={showNetworkFields}
                    onChange={(event) => setShowNetworkFields(event.target.checked)}
                  />
                  Network Item
                </label>
                <form className="form-grid" onSubmit={onAddItem} ref={addItemFormRef}>
                  {addFormFields.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      {requiredAddItemFields[field.key] ? ' *' : ''}
                      <input
                        ref={field.key === 'itemName' ? itemNameInputRef : undefined}
                        type={field.type ?? 'text'}
                        autoComplete={uniqueAddItemFields.includes(field.key) ? 'off' : 'on'}
                        list={uniqueAddItemFields.includes(field.key) ? undefined : `${field.key}-options`}
                        required={requiredAddItemFields[field.key]}
                        className={field.key === 'assetTag' && isDuplicateAssetTag ? 'field-invalid' : undefined}
                        value={
                          field.key === 'assetTag' && assetTagMode === 'autoNext'
                            ? nextAutoAssetTag
                            : String(itemDraft[field.key] ?? '')
                        }
                        disabled={field.key === 'assetTag' && assetTagMode === 'autoNext'}
                        onChange={(event) => {
                          if (field.key === 'assetTag' && assetTagMode === 'autoNext') {
                            return
                          }
                          const next = event.target.value
                          setItemDraft((previous) => ({
                            ...previous,
                            [field.key]: field.type === 'number' ? Number(next) || 0 : next,
                          }))
                        }}
                      />
                      {!uniqueAddItemFields.includes(field.key) && (
                        <datalist id={`${field.key}-options`}>
                          {((field.key === 'status'
                            ? [...new Set([...(options.status ?? []), ...statusDefaults])]
                            : options[field.key] ?? []) as string[]).map((entry) => (
                            <option key={entry} value={entry} />
                          ))}
                        </datalist>
                      )}
                    </label>
                  ))}
                  <button type="submit" className="submit-btn">
                    Add Item
                  </button>
                </form>
              </>
            )}
            {!isAddExpanded && <p>Expand to add inventory items.</p>}
          </article>

          <article className="panel inventory-block">
            <div className="block-title-row">
              <h2>Search Items</h2>
            </div>
            <div className="toolbar">
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search any text in any field"
              />
              <button type="button" onClick={() => setSearch('')}>
                Clear Search
              </button>
            </div>
            <p className="shortcut-hint">Use Column Name: text to search one column only, like Asset Tag: 1234 or Serial Number: abc.</p>
          </article>

          <article className="panel inventory-block">
            <div className="block-title-row">
              <h2>Inventory</h2>
              <button type="button" onClick={onExportSpreadsheet} disabled={items.length === 0}>
                Export Spreadsheet
              </button>
            </div>
            <div className="table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    {safeColumnOrder.map((key) => (
                      <th key={key}>
                        <button
                          type="button"
                          className="sort-header"
                          onClick={() => onHeaderSort(key)}
                          title={`Sort by ${fieldByKey[key].label}`}
                        >
                          <span>{fieldByKey[key].label}</span>
                          <span className="sort-indicator">
                            {sortField === key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th>Actions</th>
                  </tr>
                  <tr>
                    {safeColumnOrder.map((key) => (
                      <th key={`${key}-filter`}>
                        <input
                          value={filters[key] ?? ''}
                          onChange={(event) =>
                            setFilters((previous) => ({
                              ...previous,
                              [key]: event.target.value,
                            }))
                          }
                          placeholder={`Filter ${fieldByKey[key].label}`}
                        />
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      {safeColumnOrder.map((key) => {
                        const field = fieldByKey[key]
                        const optionValues =
                          key === 'status'
                            ? [...new Set([...(options.status ?? []), ...statusDefaults])]
                            : (options[key] ?? [])

                        return (
                          <td key={`${item.id}-${key}`}>
                            <input
                              className="cell-input"
                              type={field.type ?? 'text'}
                              list={`${key}-options`}
                              value={String(item[key] ?? '')}
                              onChange={(event) => onInlineItemChange(item.id, key, event.target.value)}
                              onBlur={() => void onInlineItemCommit(item.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.currentTarget.blur()
                                }
                              }}
                            />
                            <datalist id={`${key}-options`}>
                              {optionValues.map((entry) => (
                                <option key={`${item.id}-${key}-${entry}`} value={entry} />
                              ))}
                            </datalist>
                          </td>
                        )
                      })}
                      <td>
                        <button type="button" className="danger" onClick={() => void onDeleteItem(item.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={safeColumnOrder.length + 1}>No items found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {tab === 'maps' && (
        <section className="panel map-panel">
          <div className="toolbar">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(event) => setMapUploadFile(event.target.files?.[0] ?? null)}
            />
            <button type="button" onClick={() => void onUploadMap()}>
              Upload Map
            </button>
            <select value={selectedMapId} onChange={(event) => setSelectedMapId(event.target.value)}>
              <option value="">Select Map</option>
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.originalName}
                </option>
              ))}
            </select>
          </div>

          {selectedMap && (
            <>
              <div className="map-stage">
                {selectedMap.mimeType.startsWith('image/') ? (
                  <div
                    className="map-canvas"
                    onMouseDown={onMapMouseDown}
                    onMouseMove={onMapMouseMove}
                    onMouseUp={onMapMouseUp}
                    onMouseLeave={() => {
                      setDragStart(null)
                      setDragCurrent(null)
                    }}
                  >
                    <img
                      src={`${apiBase}${selectedMap.relativePath}`}
                      alt={selectedMap.originalName}
                      draggable={false}
                    />
                    {dragPreview && (
                      <div
                        className="map-preview"
                        style={{
                          left: `${dragPreview.x}%`,
                          top: `${dragPreview.y}%`,
                          width: `${dragPreview.width}%`,
                          height: `${dragPreview.height}%`,
                        }}
                      />
                    )}
                    {selectedMap.areas.map((area) => (
                      <div
                        key={area.id}
                        className={`map-area ${editingAreaId === area.id ? 'selected' : ''}`}
                        onMouseDown={(event) => {
                          event.stopPropagation()
                          onSelectArea(area)
                        }}
                        style={{
                          left: `${area.x}%`,
                          top: `${area.y}%`,
                          width: `${area.width}%`,
                          height: `${area.height}%`,
                          borderColor: area.color ?? '#e38336',
                          backgroundColor: hexToRgba(area.color ?? '#e38336', 0.22),
                        }}
                        title={area.location ?? area.locationTag ?? ''}
                      >
                        <span>{area.location ?? area.locationTag ?? ''}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <a href={`${apiBase}${selectedMap.relativePath}`} target="_blank" rel="noreferrer">
                    Open PDF map: {selectedMap.originalName}
                  </a>
                )}
              </div>

              <div className="area-form">
                <h3>Create Bound Area</h3>
                <p>Click and drag on the map image to set X, Y, Width, and Height.</p>
                {editingAreaId && <p>Editing selected area. Save to update, or clear selection to create a new area.</p>}
                <div className="area-grid">
                  <label>
                    Location
                    <input
                      list="location-options"
                      value={areaDraft.location ?? ''}
                      onChange={(event) => setAreaDraft((previous) => ({ ...previous, location: event.target.value }))}
                    />
                    <datalist id="location-options">
                      {(options.location ?? []).map((entry) => (
                        <option key={entry} value={entry} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    Color
                    <input
                      type="color"
                      value={areaDraft.color ?? '#e38336'}
                      onChange={(event) => setAreaDraft((previous) => ({ ...previous, color: event.target.value }))}
                    />
                  </label>
                  <label>
                    X (%)
                    <input
                      type="number"
                      value={areaDraft.x}
                      onChange={(event) =>
                        setAreaDraft((previous) => ({ ...previous, x: Number(event.target.value) || 0 }))
                      }
                    />
                  </label>
                  <label>
                    Y (%)
                    <input
                      type="number"
                      value={areaDraft.y}
                      onChange={(event) =>
                        setAreaDraft((previous) => ({ ...previous, y: Number(event.target.value) || 0 }))
                      }
                    />
                  </label>
                  <label>
                    Width (%)
                    <input
                      type="number"
                      value={areaDraft.width}
                      onChange={(event) =>
                        setAreaDraft((previous) => ({ ...previous, width: Number(event.target.value) || 0 }))
                      }
                    />
                  </label>
                  <label>
                    Height (%)
                    <input
                      type="number"
                      value={areaDraft.height}
                      onChange={(event) =>
                        setAreaDraft((previous) => ({ ...previous, height: Number(event.target.value) || 0 }))
                      }
                    />
                  </label>
                </div>
                <div className="toolbar">
                  <button type="button" onClick={() => void onCreateArea()}>
                    {editingAreaId ? 'Update Area' : 'Save Area to Map'}
                  </button>
                  <button type="button" onClick={onClearAreaEdit}>
                    Clear Selection
                  </button>
                  <button type="button" className="danger" onClick={() => void onDeleteArea()} disabled={!editingAreaId}>
                    Delete Area
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'reports' && (
        <section className="inventory-layout reports-layout">
          <article className="panel inventory-block">
            <h2>Reports</h2>
          </article>

          <article className="panel inventory-block">
            <div className="block-title-row">
              <h3>1-Click Reports</h3>
              <p>No configuration required.</p>
            </div>
            <div className="quick-reports-grid">
              {quickReports.map((quick) => (
                <button key={quick.id} type="button" className="quick-report-btn" onClick={() => onRunQuickReport(quick.id)}>
                  <span>{quick.icon}</span>
                  <strong>{quick.title}</strong>
                </button>
              ))}
            </div>
          </article>

          <article className="panel inventory-block">
            <h3>Guided Report Builder</h3>
            <div className="form-grid">
              <label>
                Prompt 1 - What would you like to compare?
                <select value={guidedMeasure} onChange={(event) => setGuidedMeasure(event.target.value as GuidedMeasure)}>
                  <option value="count">Count of items</option>
                  <option value="purchaseCost">Purchase Cost</option>
                  <option value="age">Year Purchased (Age)</option>
                  <option value="depreciatedValue">Depreciated Value</option>
                </select>
              </label>

              <label>
                Prompt 2 - Grouped by
                <select value={guidedGroupBy} onChange={(event) => setGuidedGroupBy(event.target.value as GuidedGroupBy)}>
                  <option value="category">Category</option>
                  <option value="manufacturer">Manufacturer</option>
                  <option value="location">Location</option>
                  <option value="status">Status</option>
                  <option value="yearPurchased">Year Purchased</option>
                  <option value="vendor">Vendor</option>
                </select>
              </label>
            </div>

            <div className="guided-filters-card">
              <div className="block-title-row">
                <h4>Prompt 3 - Optional Filters</h4>
                <button type="button" onClick={onAddGuidedFilter}>
                  Add Filter
                </button>
              </div>
              {guidedFilters.length === 0 && <p>No filters applied. Results will include all items.</p>}
              {guidedFilters.map((filter) => (
                <div key={filter.id} className="guided-filter-row">
                  <label>
                    Filter Field
                    <select
                      value={filter.field}
                      onChange={(event) => onChangeGuidedFilterField(filter.id, event.target.value as GuidedFilterField)}
                    >
                      <option value="category">Equipment Type</option>
                      <option value="location">Location</option>
                      <option value="status">Status</option>
                      <option value="yearPurchased">Year Purchased</option>
                    </select>
                  </label>

                  <label>
                    Filter Value
                    <select value={filter.value} onChange={(event) => onChangeGuidedFilterValue(filter.id, event.target.value)}>
                      <option value="">Select value</option>
                      {guidedFilterValueOptions(filter.field).map((entry) => (
                        <option key={`guided-filter-${filter.id}-${entry}`} value={entry}>
                          {entry}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button type="button" className="danger" onClick={() => onRemoveGuidedFilter(filter.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="toolbar">
              <span className="graph-type-picker" role="radiogroup" aria-label="Graph type">
                <label className={`graph-type-option ${guidedGraphType === 'bar' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="guided-graph-type"
                    checked={guidedGraphType === 'bar'}
                    onChange={() => setGuidedGraphType('bar')}
                  />
                  <span aria-hidden="true">📊</span>
                  <span>Bar</span>
                </label>
                <label className={`graph-type-option ${guidedGraphType === 'circle' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="guided-graph-type"
                    checked={guidedGraphType === 'circle'}
                    onChange={() => setGuidedGraphType('circle')}
                  />
                  <span aria-hidden="true">🟠</span>
                  <span>Circle</span>
                </label>
                <label className={`graph-type-option ${guidedGraphType === 'line' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="guided-graph-type"
                    checked={guidedGraphType === 'line'}
                    onChange={() => setGuidedGraphType('line')}
                  />
                  <span aria-hidden="true">📈</span>
                  <span>Line</span>
                </label>
              </span>
              <button type="button" onClick={onRunGuidedReport}>
                Generate Report
              </button>
              <input
                value={guidedTemplateName}
                onChange={(event) => setGuidedTemplateName(event.target.value)}
                placeholder="Template name"
              />
              <button type="button" onClick={onSaveGuidedTemplate} disabled={!guidedTemplateName.trim()}>
                Save Report Template
              </button>
            </div>
            {guidedTemplates.length > 0 && (
              <div className="preset-list">
                {guidedTemplates.map((template) => (
                  <div key={template.id} className="preset-row">
                    <div>
                      <strong>{template.name}</strong>
                      <p>
                        {guidedMeasureLabel(template.measure)} by {guidedGroupByLabel[template.groupBy]} | Graph: {template.graphType}
                      </p>
                    </div>
                    <div className="column-order-actions">
                      <button type="button" onClick={() => onApplyGuidedTemplate(template)}>
                        Apply
                      </button>
                      <button type="button" className="danger" onClick={() => onDeleteGuidedTemplate(template.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel inventory-block">
            <p>
              <strong>Active Report:</strong> {activeReportName}
            </p>
            <p>
              Filters: Category {reportFilters.category || 'Any'}, Location {reportFilters.location || 'Any'}, Status{' '}
              {reportFilters.status || 'Any'}, Year Purchased {reportFilters.purchasedMode === 'any' ? 'Any' : `${reportFilters.purchasedMode} ${reportFilters.yearPurchased || 'N/A'}`}
            </p>
            <div className="toolbar">
              <button type="button" onClick={onExportReport} disabled={reportRows.length === 0}>
                Export Current Report
              </button>
            </div>
          </article>

          <article className="panel inventory-block">
            <div className="block-title-row">
              <h3>Saved Presets</h3>
            </div>
            <div className="toolbar">
              <input
                value={reportPresetName}
                onChange={(event) => setReportPresetName(event.target.value)}
                placeholder="Preset name"
              />
              <button type="button" onClick={onSaveReportPreset} disabled={!reportPresetName.trim()}>
                Save Current
              </button>
            </div>
            {reportPresets.length === 0 && <p>No presets saved yet.</p>}
            {reportPresets.length > 0 && (
              <div className="preset-list">
                {reportPresets.map((preset) => (
                  <div key={preset.id} className="preset-row">
                    <div>
                      <strong>{preset.name}</strong>
                      <p>
                        {reportTitle(preset.graphGroupByField, preset.graphMetric, preset.graphBreakdownField ?? 'none')} | Top {preset.reportLimit} | Graph Sort:{' '}
                        {preset.graphSortBy} {preset.graphSortDirection} | Table Sort: {fieldByKey[preset.reportSortField].label}{' '}
                        {preset.reportSortDirection} | Graph: {preset.graphType}
                      </p>
                    </div>
                    <div className="column-order-actions">
                      <button type="button" onClick={() => onApplyReportPreset(preset)}>
                        Apply
                      </button>
                      <button type="button" className="danger" onClick={() => onDeleteReportPreset(preset.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel inventory-block">
            <h3>{reportTitle(graphGroupByField, graphMetric, graphBreakdownField)}</h3>
            {reportRows.length === 0 && <p>No data yet.</p>}
            {reportRows.length > 0 && (
              <ReportChart
                rows={reportRows}
                graphType={graphType}
                valueFormatter={graphMetric === 'count' ? undefined : (value) => formatMetric(value, graphMetric)}
              />
            )}
          </article>

          {reportBreakdownTable && (
            <article className="panel inventory-block">
              <div className="block-title-row">
                <h3>Breakdown Matrix</h3>
                <p>
                  {reportFieldLabel(graphGroupByField, graphMetric)} by{' '}
                  {graphBreakdownField === 'none' ? 'None' : reportFieldLabel(graphBreakdownField, graphMetric)}
                </p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{reportFieldLabel(graphGroupByField, graphMetric)}</th>
                      {reportBreakdownTable.secondaryLabels.map((label) => (
                        <th key={`breakdown-head-${label}`}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportBreakdownTable.primaryLabels.map((primary) => (
                      <tr key={`breakdown-row-${primary}`}>
                        <td>{primary}</td>
                        {reportBreakdownTable.secondaryLabels.map((secondary) => (
                          <td key={`breakdown-cell-${primary}-${secondary}`}>
                            {formatMetric(reportBreakdownTable.valueFor(primary, secondary), graphMetric)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          <div className="totals-columns">
            <TotalsBlock title="By Type" rows={totals?.byType ?? {}} />
            <TotalsBlock title="By Manufacturer" rows={totals?.byManufacturer ?? {}} />
            <TotalsBlock title="By Location" rows={totals?.byLocation ?? {}} />
          </div>

          <article className="panel inventory-block">
            <div className="block-title-row">
              <h3>Report Table</h3>
              <p>
                Sorted by {fieldByKey[reportSortField].label} ({reportSortDirection})
              </p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {safeColumnOrder.map((key) => (
                      <th key={`report-${key}`}>
                        <button
                          type="button"
                          className="sort-header"
                          onClick={() => onReportHeaderSort(key)}
                          title={`Sort report by ${fieldByKey[key].label}`}
                        >
                          <span>{fieldByKey[key].label}</span>
                          <span className="sort-indicator">
                            {reportSortField === key ? (reportSortDirection === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportTableRows.map((item) => (
                    <tr key={`report-row-${item.id}`}>
                      {safeColumnOrder.map((key) => (
                        <td key={`report-${item.id}-${key}`}>{String(item[key] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                  {reportTableRows.length === 0 && (
                    <tr>
                      <td colSpan={safeColumnOrder.length}>No report rows yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {tab === 'import' && (
        <section className="panel">
          <h2>Import Existing Spreadsheet</h2>
          <p>Upload your file, map source columns to inventory fields, then import.</p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void onImportSpreadsheet(event)} />
          {importFileName && <p>Loaded: {importFileName}</p>}

          {importHeaders.length > 0 && (
            <div className="import-grid">
              {fields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(event) =>
                      setMapping((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Skip</option>
                    {importHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          <button type="button" onClick={() => void onCommitImport()} disabled={importRows.length === 0}>
            Import {importRows.length} Rows
          </button>
        </section>
      )}

      {tab === 'settings' && (
        <section className="panel settings-panel">
          <h2>Settings</h2>

          <article className="settings-card">
            <h3>Cost Rounding Scheme</h3>
            <p>Round entered or imported cost to the nearest selected increment.</p>
            <select value={roundingStep} onChange={(event) => setRoundingStep(Number(event.target.value) as RoundingStep)}>
              {roundingSteps.map((step) => (
                <option key={step} value={step}>
                  Nearest {step}
                </option>
              ))}
            </select>
          </article>

          <article className="settings-card">
            <div className="block-title-row">
              <h3>Asset Tag Behavior</h3>
              <button type="button" onClick={() => setIsAssetTagHistoryOpen(true)}>
                View Asset Tag History
              </button>
            </div>
            <label className="checkbox-row">
              <input
                type="radio"
                name="assetTagMode"
                checked={assetTagMode === 'manual'}
                onChange={() => setAssetTagMode('manual')}
              />
              Require manual asset tag entry
            </label>
            <label className="checkbox-row">
              <input
                type="radio"
                name="assetTagMode"
                checked={assetTagMode === 'autoNext'}
                onChange={() => setAssetTagMode('autoNext')}
              />
              Autofill next unused number (preview: {nextAutoAssetTag})
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={requireUniqueAssetTag}
                onChange={(event) => setRequireUniqueAssetTag(event.target.checked)}
              />
              Require each asset tag to be unique
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={keepRemovedAssetTagHistory}
                onChange={(event) => setKeepRemovedAssetTagHistory(event.target.checked)}
              />
              Keep removed items&apos; asset tags in history
            </label>
          </article>

          <article className="settings-card">
            <h3>Required Add Item Fields</h3>
            <p>Mark any inventory field as required when adding items.</p>
            <div className="required-fields-grid">
              {fields.map((field) => (
                <label key={field.key} className="checkbox-row required-field-row">
                  <input
                    type="checkbox"
                    checked={requiredAddItemFields[field.key]}
                    onChange={(event) =>
                      setRequiredAddItemFields((current) => ({
                        ...current,
                        [field.key]: event.target.checked,
                      }))
                    }
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </article>

          <article className="settings-card">
            <h3>Reports</h3>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={excludeRemovedFromReports}
                onChange={(event) => setExcludeRemovedFromReports(event.target.checked)}
              />
              If status is set to Removed, do not include in report generation
            </label>
          </article>

          <article className="settings-card">
            <div className="block-title-row">
              <h3>Inventory Column Order</h3>
              <button type="button" onClick={() => setColumnOrder(defaultColumnOrder)}>
                Reset Default
              </button>
            </div>
            <p>Move columns up or down to change table display and export order.</p>
            <div className="column-order-list">
              {safeColumnOrder.map((key, index) => (
                <div key={key} className="column-order-row">
                  <span>{fieldByKey[key].label}</span>
                  <div className="column-order-actions">
                    <button
                      type="button"
                      onClick={() => setColumnOrder((current) => moveColumn(current, index, -1))}
                      disabled={index === 0}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => setColumnOrder((current) => moveColumn(current, index, 1))}
                      disabled={index === safeColumnOrder.length - 1}
                    >
                      Down
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="settings-card">
            <h3>Keyboard Shortcuts</h3>
            <div className="shortcut-list">
              <p>{modifierLabel}+1: Inventory tab</p>
              <p>{modifierLabel}+2: Maps tab</p>
              <p>{modifierLabel}+3: Reports tab</p>
              <p>{modifierLabel}+4: Import tab</p>
              <p>{modifierLabel}+5: Settings tab</p>
              <p>{modifierLabel}+F: Focus search</p>
              <p>{modifierLabel}+N: Focus add-item name field</p>
              <p>{modifierLabel}+Enter: Submit add-item form</p>
            </div>
          </article>

          {isAssetTagHistoryOpen && (
            <div className="asset-tag-history-overlay" onClick={() => setIsAssetTagHistoryOpen(false)}>
              <section
                className="panel asset-tag-history-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="asset-tag-history-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="block-title-row">
                  <h3 id="asset-tag-history-title">Asset Tag History</h3>
                  <button type="button" onClick={() => setIsAssetTagHistoryOpen(false)}>
                    Close
                  </button>
                </div>
                <p className="shortcut-hint">
                  Active tags stay in use. Removed tags can stay in history or be cleared here so they can be reused.
                </p>
                <div className="asset-tag-history-grid">
                  <section className="asset-tag-history-section">
                    <h4>Active Asset Tags</h4>
                    {assetTagHistory.active.length === 0 && <p>No active asset tags yet.</p>}
                    {assetTagHistory.active.length > 0 && (
                      <div className="asset-tag-history-list">
                        {assetTagHistory.active.map((item) => (
                          <div key={item.id} className="asset-tag-history-row">
                            <div>
                              <strong>{item.assetTag}</strong>
                              <span>{item.itemName || 'Untitled Item'}</span>
                            </div>
                            <span className="asset-tag-history-status">{item.status || 'Working'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="asset-tag-history-section">
                    <div className="block-title-row">
                      <h4>Removed Asset Tags</h4>
                      {assetTagHistory.removed.length > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            for (const item of assetTagHistory.removed) {
                              await onClearRemovedAssetTag(item)
                            }
                          }}
                        >
                          Clear All Removed Tags
                        </button>
                      )}
                    </div>
                    {assetTagHistory.removed.length === 0 && <p>No removed asset tags yet.</p>}
                    {assetTagHistory.removed.length > 0 && (
                      <div className="asset-tag-history-list">
                        {assetTagHistory.removed.map((item) => (
                          <div key={item.id} className="asset-tag-history-row">
                            <div>
                              <strong>{item.assetTag}</strong>
                              <span>{item.itemName || 'Untitled Item'}</span>
                            </div>
                            <button type="button" onClick={() => void onClearRemovedAssetTag(item)}>
                              Delete Tag
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </section>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function ReportBar({
  label,
  value,
  max,
  valueFormatter,
}: {
  label: string
  value: number
  max: number
  valueFormatter?: (value: number) => string
}) {
  const width = Math.max(4, Math.round((value / Math.max(max, 1)) * 100))
  const displayValue = valueFormatter ? valueFormatter(value) : String(value)

  return (
    <div className="report-row">
      <div className="report-meta">
        <span>{label}</span>
        <strong>{displayValue}</strong>
      </div>
      <div className="report-track">
        <div className="report-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function ReportChart({
  rows,
  graphType,
  valueFormatter,
}: {
  rows: Array<[string, number]>
  graphType: GraphType
  valueFormatter?: (value: number) => string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const maxValue = rows[0]?.[1] ?? 1

  const showTooltip = (
    event: MouseEvent<HTMLElement | SVGElement>,
    label: string,
    value: number,
  ): void => {
    if (!containerRef.current) {
      return
    }
    const rect = containerRef.current.getBoundingClientRect()
    setTooltip({
      x: event.clientX - rect.left + 10,
      y: event.clientY - rect.top + 10,
      text: `${label}: ${valueFormatter ? valueFormatter(value) : String(value)}`,
    })
  }

  if (graphType === 'circle') {
    const total = rows.reduce((sum, [, value]) => sum + value, 0)
    const segments = rows.map((row, index) => {
      const ratio = total > 0 ? row[1] / total : 0
      return { label: row[0], value: row[1], ratio, color: chartColor(index) }
    })

    const radius = 72
    const center = 90
    let cursor = 0
    const arcData = segments.map((segment) => {
      const startAngle = cursor * 360
      cursor += segment.ratio
      const endAngle = cursor * 360
      return {
        ...segment,
        path: describePieSlice(center, center, radius, startAngle, endAngle),
      }
    })

    return (
      <div className="report-circle-wrap" ref={containerRef} onMouseLeave={() => setTooltip(null)}>
        <svg viewBox="0 0 180 180" className="report-circle-svg" role="img" aria-label="Circle chart">
          {arcData.map((segment) => (
            <path
              key={segment.label}
              d={segment.path}
              fill={segment.color}
              className="report-circle-segment"
              onMouseMove={(event) => showTooltip(event, segment.label, segment.value)}
            />
          ))}
        </svg>
        <div className="report-circle-legend">
          {arcData.map((segment) => (
            <div key={segment.label} className="report-circle-item">
              <span className="report-swatch" style={{ backgroundColor: segment.color }} />
              <span>{segment.label}</span>
              <strong>{valueFormatter ? valueFormatter(segment.value) : String(segment.value)}</strong>
            </div>
          ))}
        </div>
        {tooltip && <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}
      </div>
    )
  }

  if (graphType === 'line') {
    const width = 700
    const height = 220
    const padding = 24
    const step = rows.length > 1 ? (width - padding * 2) / (rows.length - 1) : 0
    const points = rows.map(([, value], index) => {
      const x = padding + index * step
      const y = height - padding - (value / Math.max(maxValue, 1)) * (height - padding * 2)
      return { x, y, value }
    })
    const path = points.map((point) => `${point.x},${point.y}`).join(' ')

    return (
      <div className="report-line-wrap" ref={containerRef} onMouseLeave={() => setTooltip(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} className="report-line-chart" role="img" aria-label="Line chart">
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="report-axis" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="report-axis" />
          <polyline fill="none" className="report-line" points={path} />
          {points.map((point, index) => (
            <circle
              key={rows[index][0]}
              cx={point.x}
              cy={point.y}
              r={4}
              className="report-dot"
              onMouseMove={(event) => showTooltip(event, rows[index][0], rows[index][1])}
            />
          ))}
        </svg>
        <div className="report-line-labels">
          {rows.map(([label, value]) => (
            <div key={label} className="report-line-label-item">
              <span>{label}</span>
              <strong>{valueFormatter ? valueFormatter(value) : String(value)}</strong>
            </div>
          ))}
        </div>
        {tooltip && <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}
      </div>
    )
  }

  return (
    <div className="report-bars" ref={containerRef} onMouseLeave={() => setTooltip(null)}>
      {rows.map(([label, value]) => (
        <div key={label} onMouseMove={(event) => showTooltip(event, label, value)}>
          <ReportBar
            label={label}
            value={value}
            max={maxValue}
            valueFormatter={valueFormatter}
          />
        </div>
      ))}
      {tooltip && <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}
    </div>
  )
}

function TotalsBlock({ title, rows }: { title: string; rows: Record<string, number> }) {
  const sorted = Object.entries(rows).sort((a, b) => b[1] - a[1])

  return (
    <article className="totals-card">
      <h3>{title}</h3>
      {sorted.length === 0 && <p>No data yet.</p>}
      {sorted.length > 0 && (
        <ul>
          {sorted.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getInventorySettingsHeaders(),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(errorBody?.error ? String(errorBody.error) : `Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return {} as T
  }

  return (await response.json()) as T
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

function normalize(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function getInventorySettingsHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('inventory.settings')
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as {
      requireUniqueAssetTag?: boolean
      keepRemovedAssetTagHistory?: boolean
    }

    return {
      'X-Inventory-Require-Unique-Asset-Tag': String(Boolean(parsed.requireUniqueAssetTag)),
      'X-Inventory-Keep-Removed-Asset-Tag-History': String(parsed.keepRemovedAssetTagHistory ?? true),
    }
  } catch {
    return {}
  }
}

function isRemovedStatus(status: string): boolean {
  return status.trim().toLowerCase() === 'removed'
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100
}

function getPercentPoint(event: MouseEvent<HTMLDivElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 100
  const y = ((event.clientY - rect.top) / rect.height) * 100
  return {
    x: roundTwo(clamp(x, 0, 100)),
    y: roundTwo(clamp(y, 0, 100)),
  }
}

function getRectFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): MapArea {
  const x = roundTwo(Math.min(start.x, end.x))
  const y = roundTwo(Math.min(start.y, end.y))
  const width = roundTwo(Math.max(1, Math.abs(start.x - end.x)))
  const height = roundTwo(Math.max(1, Math.abs(start.y - end.y)))
  return {
    ...blankArea(),
    x,
    y,
    width,
    height,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function reportFieldLabel(field: ItemField, metric: GraphMetric): string {
  if (metric === 'projectedReplacementCost' && field === 'yearPurchased') {
    return 'Replacement Year'
  }
  return fieldByKey[field].label
}

function reportGroupingValue(item: InventoryItem, field: ItemField, metric: GraphMetric): string {
  if (metric === 'projectedReplacementCost' && field === 'yearPurchased') {
    const purchaseYear = Number(item.yearPurchased)
    if (!Number.isFinite(purchaseYear) || purchaseYear <= 0) {
      return ''
    }
    return String(Math.trunc(purchaseYear) + 10)
  }
  return String(item[field] ?? '').trim()
}

function reportTitle(groupByField: ItemField, metric: GraphMetric, breakdownField: GraphBreakdownField = 'none'): string {
  const metricLabel =
    metric === 'count'
      ? 'Count'
      : metric === 'costSum'
        ? 'Total Cost'
        : metric === 'costAvg'
          ? 'Average Cost'
          : metric === 'purchaseCost'
            ? 'Purchase Cost'
            : metric === 'projectedReplacementCost'
              ? 'Projected Replacement Cost (10-Year)'
            : metric === 'age'
              ? 'Year Purchased (Average Age)'
              : 'Depreciated Value'
  if (breakdownField !== 'none') {
    return `${metricLabel} by ${reportFieldLabel(groupByField, metric)} and ${reportFieldLabel(breakdownField, metric)}`
  }
  return `${metricLabel} by ${reportFieldLabel(groupByField, metric)}`
}

function metricValue(values: AggregateValues, metric: GraphMetric): number {
  if (metric === 'costSum') {
    return values.costSum
  }
  if (metric === 'purchaseCost') {
    return values.purchaseCostSum
  }
  if (metric === 'projectedReplacementCost') {
    return values.projectedReplacementCostSum
  }
  if (metric === 'costAvg') {
    return values.count > 0 ? values.costSum / values.count : 0
  }
  if (metric === 'age') {
    return values.ageCount > 0 ? values.ageSum / values.ageCount : 0
  }
  if (metric === 'depreciatedValue') {
    return values.depreciatedValueSum
  }
  return values.count
}

function formatMetric(value: number, metric: GraphMetric): string {
  if (metric === 'count') {
    return String(Math.round(value))
  }
  if (metric === 'age') {
    return `${value.toFixed(1)} yrs`
  }
  return formatCurrency(value)
}

function applyReportFilters(items: InventoryItem[], filters: ReportFilters, excludeRemoved: boolean): InventoryItem[] {
  const normalized = normalizeReportFilters(filters)
  const category = normalized.category.trim().toLowerCase()
  const location = normalized.location.trim().toLowerCase()
  const status = normalized.status.trim().toLowerCase()
  const year = Number(normalized.yearPurchased)

  return items.filter((item) => {
    if (category && !String(item.type ?? '').toLowerCase().includes(category)) {
      return false
    }
    if (location && !String(item.location ?? '').toLowerCase().includes(location)) {
      return false
    }
    if (status && !String(item.status ?? '').toLowerCase().includes(status)) {
      return false
    }
    if (excludeRemoved && String(item.status ?? '').toLowerCase() === 'removed') {
      return false
    }

    if (normalized.purchasedMode !== 'any') {
      if (!Number.isFinite(year)) {
        return false
      }
      const itemYear = Number(item.yearPurchased)
      if (!Number.isFinite(itemYear)) {
        return false
      }
      if (normalized.purchasedMode === 'year' && itemYear !== year) {
        return false
      }
      if (normalized.purchasedMode === 'before' && itemYear >= year) {
        return false
      }
      if (normalized.purchasedMode === 'after' && itemYear <= year) {
        return false
      }
    }

    return true
  })
}

function itemAge(item: InventoryItem): number | null {
  const year = Number(item.yearPurchased)
  if (!Number.isFinite(year) || year <= 0) {
    return null
  }
  const thisYear = new Date().getFullYear()
  return Math.max(0, thisYear - year)
}

function itemPurchaseCost(item: InventoryItem): number {
  const purchaseCost = Number(item.purchaseCost) || 0
  if (purchaseCost > 0) {
    return purchaseCost
  }
  return Number(item.cost) || 0
}

function depreciatedValue(cost: number, age: number | null): number {
  if (!Number.isFinite(cost) || cost <= 0) {
    return 0
  }
  if (age === null) {
    return cost
  }
  const factor = Math.max(0.1, 1 - age * 0.1)
  return cost * factor
}

function guidedMeasureLabel(measure: GuidedMeasure): string {
  if (measure === 'count') {
    return 'Count of items'
  }
  if (measure === 'purchaseCost') {
    return 'Purchase Cost'
  }
  if (measure === 'age') {
    return 'Year Purchased (Age)'
  }
  return 'Depreciated Value'
}

function roundToNearest(value: number, step: RoundingStep): number {
  return Math.round(value / step) * step
}

function findNextAssetTag(items: InventoryItem[]): string {
  const pool = buildAssetTagPool(items)
  return String(nextFromPool(pool))
}

function moveColumn(order: ItemField[], fromIndex: number, offset: -1 | 1): ItemField[] {
  const toIndex = fromIndex + offset
  if (toIndex < 0 || toIndex >= order.length) {
    return order
  }

  const next = [...order]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function isValidColumnOrder(value: unknown): value is ItemField[] {
  if (!Array.isArray(value) || value.length !== defaultColumnOrder.length) {
    return false
  }

  const valueSet = new Set(value)
  if (valueSet.size !== defaultColumnOrder.length) {
    return false
  }

  return defaultColumnOrder.every((field) => valueSet.has(field))
}

function normalizeRequiredAddItemFields(value: unknown): Record<ItemField, boolean> {
  const normalized = createDefaultRequiredAddItemFields()
  if (typeof value !== 'object' || value === null) {
    return normalized
  }

  for (const field of fields) {
    const next = (value as Partial<Record<ItemField, unknown>>)[field.key]
    if (typeof next === 'boolean') {
      normalized[field.key] = next
    }
  }

  return normalized
}

function buildAssetTagPool(items: InventoryItem[]): Set<number> {
  const used = new Set<number>()
  for (const item of items) {
    const parsed = Number(item.assetTag)
    if (Number.isInteger(parsed) && parsed > 0) {
      used.add(parsed)
    }
  }
  return used
}

function nextFromPool(pool: Set<number>): number {
  let current = 1
  while (pool.has(current)) {
    current += 1
  }
  pool.add(current)
  return current
}

function hexToRgba(hex: string, alpha: number): string {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#e38336'
  const r = Number.parseInt(safe.slice(1, 3), 16)
  const g = Number.parseInt(safe.slice(3, 5), 16)
  const b = Number.parseInt(safe.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function isValidReportPreset(value: unknown): value is ReportPreset {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const preset = value as Partial<ReportPreset>
  const validGroupByField =
    typeof preset.graphGroupByField === 'string' &&
    defaultColumnOrder.includes(preset.graphGroupByField as ItemField)
  const validMetric =
    preset.graphMetric === 'count' ||
    preset.graphMetric === 'costSum' ||
    preset.graphMetric === 'costAvg' ||
    preset.graphMetric === 'purchaseCost' ||
    preset.graphMetric === 'projectedReplacementCost' ||
    preset.graphMetric === 'age' ||
    preset.graphMetric === 'depreciatedValue'
  const validGraphSortBy = preset.graphSortBy === 'label' || preset.graphSortBy === 'value'
  const validGraphSortDirection = preset.graphSortDirection === 'asc' || preset.graphSortDirection === 'desc'
  const validBreakdownField =
    preset.graphBreakdownField === undefined ||
    preset.graphBreakdownField === 'none' ||
    (typeof preset.graphBreakdownField === 'string' && defaultColumnOrder.includes(preset.graphBreakdownField as ItemField))
  const validLimit = preset.reportLimit === 5 || preset.reportLimit === 10 || preset.reportLimit === 20
  const validSortDirection = preset.reportSortDirection === 'asc' || preset.reportSortDirection === 'desc'
  const validSortField = typeof preset.reportSortField === 'string' && defaultColumnOrder.includes(preset.reportSortField as ItemField)
  const validGraphType = preset.graphType === 'bar' || preset.graphType === 'circle' || preset.graphType === 'line'

  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    validGroupByField &&
    validMetric &&
    validGraphSortBy &&
    validGraphSortDirection &&
    validBreakdownField &&
    validLimit &&
    validSortDirection &&
    validSortField &&
    validGraphType
  )
}

function normalizeReportFilters(value: unknown): ReportFilters {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const purchasedMode =
    source.purchasedMode === 'any' ||
    source.purchasedMode === 'year' ||
    source.purchasedMode === 'before' ||
    source.purchasedMode === 'after'
      ? source.purchasedMode
      : 'any'

  return {
    category: typeof source.category === 'string' ? source.category : '',
    location:
      typeof source.location === 'string'
        ? source.location
        : typeof source.room === 'string'
          ? source.room
          : '',
    status: typeof source.status === 'string' ? source.status : '',
    purchasedMode,
    yearPurchased:
      typeof source.yearPurchased === 'string'
        ? source.yearPurchased
        : typeof source.purchasedYear === 'string'
          ? source.purchasedYear
          : '',
  }
}

function guidedFiltersFromReportFilters(filters: ReportFilters): GuidedFilter[] {
  const next: GuidedFilter[] = []
  const createId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return `guided-filter-${Math.random().toString(36).slice(2, 10)}`
  }

  if (filters.category.trim()) {
    next.push({ id: createId(), field: 'category', value: filters.category })
  }
  if (filters.location.trim()) {
    next.push({ id: createId(), field: 'location', value: filters.location })
  }
  if (filters.status.trim()) {
    next.push({ id: createId(), field: 'status', value: filters.status })
  }
  if (filters.purchasedMode !== 'any' && filters.yearPurchased.trim()) {
    next.push({ id: createId(), field: 'yearPurchased', value: filters.yearPurchased })
  }

  return next
}

function normalizeGuidedTemplate(value: unknown): GuidedTemplate | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const template = value as Record<string, unknown>
  const validMeasure =
    template.measure === 'count' ||
    template.measure === 'purchaseCost' ||
    template.measure === 'age' ||
    template.measure === 'depreciatedValue'
  const groupByRaw = template.groupBy
  const groupBy: GuidedGroupBy | null =
    groupByRaw === 'category' ||
    groupByRaw === 'manufacturer' ||
    groupByRaw === 'location' ||
    groupByRaw === 'status' ||
    groupByRaw === 'yearPurchased' ||
    groupByRaw === 'vendor'
      ? (groupByRaw as GuidedGroupBy)
      : groupByRaw === 'room'
        ? 'location'
        : groupByRaw === 'purchaseYear'
          ? 'yearPurchased'
          : null
  const validGraphType = template.graphType === 'bar' || template.graphType === 'circle' || template.graphType === 'line'

  if (typeof template.id !== 'string' || typeof template.name !== 'string' || !validMeasure || !groupBy || !validGraphType) {
    return null
  }

  return {
    id: template.id,
    name: template.name,
    measure: template.measure as GuidedMeasure,
    groupBy,
    filters: normalizeReportFilters(template.filters),
    graphType: template.graphType as GraphType,
  }
}

function chartColor(index: number): string {
  const palette = ['#0d8f8b', '#2a6fb1', '#e38336', '#ad4ec6', '#57a13f', '#cc4f4f', '#9674d8', '#b8922a']
  return palette[index % palette.length]
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number): { x: number; y: number } {
  const radians = ((angleInDegrees - 90) * Math.PI) / 180.0
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function describePieSlice(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= 359.999) {
    return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
  }
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, 'Z'].join(' ')
}

export default App
