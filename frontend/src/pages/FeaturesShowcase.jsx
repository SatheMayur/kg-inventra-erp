import React from 'react'
import SortlyFeatureGrid from '../components/SortlyFeatureGrid'
import '../components/SortlyFeatureGrid.css'

const FEATURES = [
  // — Inventory —
  {
    title: 'Barcode & QR Scanning',
    description: 'Scan any barcode or QR code using a smartphone or handheld scanner to instantly look up, add, or update stock.',
    iconKey: 'barcode', accent: '#5B6CF8', bgColor: '#EDEFFE', tag: 'Inventory'
  },
  {
    title: 'Item Master & Catalog',
    description: 'Maintain a full catalog of items with codes, categories, units, variants, and auto-generated EAN-13 barcodes.',
    iconKey: 'package', accent: '#0EA5E9', bgColor: '#E0F2FE', tag: 'Inventory'
  },
  {
    title: 'Bulk Import',
    description: 'Instantly populate your inventory by uploading an existing Excel or CSV spreadsheet with automatic column mapping.',
    iconKey: 'upload', accent: '#10B981', bgColor: '#D1FAE5', tag: 'Inventory'
  },
  {
    title: 'Tags & Folders',
    description: 'Organise items by location, project, or type with colour-coded tags and folder groups — even across multiple sites.',
    iconKey: 'tag', accent: '#F59E0B', bgColor: '#FEF3C7', tag: 'Inventory'
  },
  // — Operations —
  {
    title: 'Inward & Outward Flow',
    description: 'Manage purchase receipts and dispatch challans with FIFO batch tracking, expiry dates, and digital lock on every entry.',
    iconKey: 'truck', accent: '#8B5CF6', bgColor: '#EDE9FE', tag: 'Operations'
  },
  {
    title: 'Check-in / Check-out',
    description: 'Track item custody — know exactly who has a tool or asset, how much was taken, and when it is due for return.',
    iconKey: 'clipboard', accent: '#EC4899', bgColor: '#FCE7F3', tag: 'Operations'
  },
  {
    title: 'Pick Lists',
    description: 'Build pick lists for jobs and orders, track picked vs. required quantities, and advance each list from Draft to Complete.',
    iconKey: 'clipboard', accent: '#14B8A6', bgColor: '#CCFBF1', tag: 'Operations'
  },
  {
    title: 'Stock Transfers',
    description: 'Record and reconcile stock movement between locations with transfer memos linked directly to Petpooja POs.',
    iconKey: 'truck', accent: '#F97316', bgColor: '#FFEDD5', tag: 'Operations'
  },
  // — Intelligence —
  {
    title: 'Alerts & Notifications',
    description: 'Receive in-app and email alerts the moment stock drops below reorder point or maintenance is due on tracked equipment.',
    iconKey: 'bell', accent: '#EF4444', bgColor: '#FEE2E2', tag: 'Intelligence'
  },
  {
    title: 'Reports & Analytics',
    description: 'Drill into inventory value by category, user activity history, item flow over time, and stockout-risk scoring.',
    iconKey: 'chart', accent: '#6366F1', bgColor: '#EEF2FF', tag: 'Intelligence'
  },
  {
    title: 'Custom Fields',
    description: 'Add any attribute specific to your business — expiry dates, serial numbers, cost codes, or compliance fields.',
    iconKey: 'sliders', accent: '#0891B2', bgColor: '#CFFAFE', tag: 'Intelligence'
  },
  // — Platform —
  {
    title: 'Role-Based Access',
    description: 'Control who can view, edit, or approve. Admin, Purchase, Warehouse, Sales, and View-only roles out of the box.',
    iconKey: 'users', accent: '#7C3AED', bgColor: '#EDE9FE', tag: 'Platform'
  },
  {
    title: 'Integrations',
    description: 'Connect to Slack and Microsoft Teams for instant alerts, or wire any tool via outbound webhooks with HMAC signing.',
    iconKey: 'link', accent: '#0F766E', bgColor: '#CCFBF1', tag: 'Platform'
  },
  {
    title: 'Offline Access',
    description: 'Keep working in warehouses with poor connectivity. The PWA caches your data locally and syncs automatically when back online.',
    iconKey: 'wifi', accent: '#1D4ED8', bgColor: '#DBEAFE', tag: 'Platform'
  },
]

const GROUPS = ['Inventory', 'Operations', 'Intelligence', 'Platform']

export default function FeaturesShowcase() {
  const [openGroups, setOpenGroups] = React.useState(() =>
    Object.fromEntries(GROUPS.map(g => [g, true]))
  )
  function toggleGroup(group) {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  return (
    <div className="sfg-page">
      {/* Hero */}
      <div className="sfg-hero">
        <span className="sfg-hero-eyebrow">FG Inventory — Feature Overview</span>
        <h1 className="sfg-hero-title">Everything you need to run a smarter warehouse</h1>
        <p className="sfg-hero-sub">
          From barcode scanning and FIFO tracking to intelligent alerts and team collaboration — built for food & grains businesses.
        </p>
      </div>

      {/* Grouped sections */}
      <div className="sfg-section">
        {GROUPS.map(group => {
          const items = FEATURES.filter(f => f.tag === group)
          const isOpen = openGroups[group]
          return (
            <div key={group} className="sfg-group">
              <button
                className="sfg-group-header"
                onClick={() => toggleGroup(group)}
                aria-expanded={isOpen}
              >
                <span className="sfg-group-label">{group}</span>
                <span className="sfg-group-count">{items.length} features</span>
                <span className="sfg-group-chevron" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▾
                </span>
              </button>
              {isOpen && (
                <div className="sfg-group-body">
                  <SortlyFeatureGrid features={items} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
