import React from 'react';
import { useNavigate } from 'react-router-dom';

const MODULES = {
  itemMaster: {
    title: 'Store Item Master',
    path: '/store/item-master',
    subtitle: 'Create, classify, barcode, and control every material in the store.',
    bullets: [
      'Item code, category, unit, HSN, GST, storage location',
      'Vendor mapping, images, and reorder thresholds',
      'Searchable master with barcode-first workflows',
    ],
  },
  requisition: {
    title: 'Store Requisition Master',
    path: '/store/requisition',
    subtitle: 'Department requests with approval, pending balance, and issue tracking.',
    bullets: [
      'Request number, date, department, requester, concern person',
      'Partial approval and partial issue support',
      'Stock-aware workflow with audit trail',
    ],
  },
  purchaseOrder: {
    title: 'Purchase Order Process',
    path: '/store/purchase-order',
    subtitle: 'Procurement from requisition or low stock through PO and receipt.',
    bullets: [
      'Draft, approval, send, and receive states',
      'Vendor, rate, discount, tax, and delivery date',
      'Built for PO -> GRN -> invoice matching',
    ],
  },
  purchaseInvoice: {
    title: 'Purchase Invoice Entry',
    path: '/store/purchase-invoice',
    subtitle: 'Invoice capture, document upload, and mismatch detection.',
    bullets: [
      'Invoice number, date, payment mode, tax and charges',
      'Upload, scan, view, and download documents',
      'PO / GRN / invoice matching for accounts',
    ],
  },
  transferDept: {
    title: 'Transfer to Department',
    path: '/store/transfer-to-department',
    subtitle: 'Move stock from store to departments or between locations.',
    bullets: [
      'Transfer number, source, destination, reason',
      'Warehouse to department and reverse transfers',
      'Department acknowledgement and closure',
    ],
  },
  stockTracking: {
    title: 'Stock Tracking',
    path: '/store/stock-tracking',
    subtitle: 'Running balance, stock ledger, and movement history.',
    bullets: [
      'Opening, inward, issue, return, adjustment, scrap',
      'Date-wise and item-wise ledger views',
      'Alerts for low stock and out-of-stock items',
    ],
  },
};

function PageShell({ title, subtitle, bullets, accent = '#f59e0b' }) {
  const navigate = useNavigate();
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.heroGlow} />
        <div style={styles.heroInner}>
          <div style={styles.badge}>STORE OPERATIONS</div>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.subtitle}>{subtitle}</p>
          <div style={styles.actions}>
            <button style={styles.primaryBtn} onClick={() => navigate('/items')}>Open items</button>
            <button style={styles.secondaryBtn} onClick={() => navigate('/')}>Back to dashboard</button>
          </div>
        </div>
      </div>
      <div style={styles.grid}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>What this module covers</h2>
          <ul style={styles.list}>
            {bullets.map((b) => (
              <li key={b} style={styles.listItem}>
                <span style={{ ...styles.dot, background: accent }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Operational flow</h2>
          <div style={styles.flow}>
            <span style={styles.flowStep}>Create</span>
            <span style={styles.flowArrow}>→</span>
            <span style={styles.flowStep}>Approve</span>
            <span style={styles.flowArrow}>→</span>
            <span style={styles.flowStep}>Process</span>
            <span style={styles.flowArrow}>→</span>
            <span style={styles.flowStep}>Post</span>
            <span style={styles.flowArrow}>→</span>
            <span style={styles.flowStep}>Track</span>
          </div>
          <p style={styles.note}>
            This page is the visible entry point for the Store Management redesign.
            The detailed business logic is being added behind these routes.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
    color: '#0f172a',
    padding: '24px',
  },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #111827 0%, #1f2937 60%, #111827 100%)',
    borderRadius: '24px',
    padding: '28px',
    boxShadow: '0 18px 60px rgba(15,23,42,0.18)',
    color: '#fff',
    marginBottom: '20px',
  },
  heroGlow: {
    position: 'absolute',
    right: '-60px',
    top: '-60px',
    width: '220px',
    height: '220px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(245,158,11,0.20) 0%, rgba(245,158,11,0.05) 55%, transparent 70%)',
    pointerEvents: 'none',
  },
  heroInner: {
    position: 'relative',
    zIndex: 1,
    maxWidth: '920px',
  },
  badge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#f59e0b',
    marginBottom: '10px',
  },
  title: {
    fontSize: '34px',
    lineHeight: 1.1,
    margin: 0,
    fontWeight: 800,
  },
  subtitle: {
    marginTop: '12px',
    marginBottom: '0',
    maxWidth: '760px',
    fontSize: '15px',
    color: 'rgba(255,255,255,0.72)',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '18px',
  },
  primaryBtn: {
    border: 'none',
    background: '#f59e0b',
    color: '#111827',
    padding: '10px 16px',
    borderRadius: '999px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryBtn: {
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '999px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#fff',
    border: '1px solid rgba(148,163,184,0.24)',
    borderRadius: '20px',
    padding: '20px',
    boxShadow: '0 8px 30px rgba(15,23,42,0.06)',
  },
  cardTitle: {
    margin: '0 0 14px',
    fontSize: '16px',
    fontWeight: 800,
    color: '#0f172a',
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gap: '12px',
  },
  listItem: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
    color: '#334155',
    lineHeight: 1.5,
    fontSize: '14px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    marginTop: '6px',
    flexShrink: 0,
  },
  flow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  flowStep: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '999px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 800,
    color: '#0f172a',
  },
  flowArrow: {
    color: '#f59e0b',
    fontWeight: 900,
  },
  note: {
    marginTop: '14px',
    marginBottom: 0,
    fontSize: '13px',
    lineHeight: 1.6,
    color: '#475569',
  },
};

function makeModulePage(module) {
  return function ModulePage() {
    return <PageShell {...module} />;
  };
}

export const StoreItemMaster = makeModulePage(MODULES.itemMaster);
export const StoreRequisitionMaster = makeModulePage(MODULES.requisition);
export const PurchaseOrderProcess = makeModulePage(MODULES.purchaseOrder);
export const PurchaseInvoiceEntry = makeModulePage(MODULES.purchaseInvoice);
export const TransferToDepartment = makeModulePage(MODULES.transferDept);
export const StockTracking = makeModulePage(MODULES.stockTracking);
