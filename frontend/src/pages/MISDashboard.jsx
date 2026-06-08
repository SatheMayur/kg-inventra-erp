import React, { useState, useEffect, useCallback } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';

const s = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px' },
  sectionTitle: {
    fontSize: '15px', fontWeight: '700', color: 'var(--text-1)',
    marginBottom: '12px', marginTop: '0'
  },
  card: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px',
    boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '20px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px', marginBottom: '24px'
  },
  summaryCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px'
  },
  summaryLabel: { fontSize: '12px', color: 'var(--text-3)', fontWeight: '500', marginBottom: '6px' },
  summaryValue: { fontSize: '24px', fontWeight: '700', color: 'var(--text-1)' },
  summarySubValue: { fontSize: '13px', color: 'var(--text-2)', marginTop: '2px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    background: 'var(--surface-2)', padding: '10px 12px', textAlign: 'left',
    borderBottom: '2px solid var(--border)', fontWeight: '600', color: 'var(--text-2)',
    whiteSpace: 'nowrap'
  },
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  tdAlt: { padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', verticalAlign: 'middle' },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
    fontSize: '11px', fontWeight: '600', textTransform: 'capitalize'
  },
  error: { color: 'var(--danger)', padding: '12px', background: 'var(--danger-dim)', borderRadius: 'var(--radius)', fontSize: '13px' },
  loading: { color: 'var(--text-3)', padding: '40px', textAlign: 'center', fontSize: '14px' },
  empty: { color: 'var(--text-4)', padding: '20px', textAlign: 'center', fontSize: '13px' },
  refreshBtn: {
    padding: '6px 14px', borderRadius: 'var(--radius)', border: 'none',
    background: 'var(--primary)', color: '#fff', cursor: 'pointer',
    fontSize: '13px', fontWeight: '500', marginBottom: '20px'
  }
};

function fmt(num) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
}

function fmtInt(num) {
  return new Intl.NumberFormat('en-IN').format(num || 0);
}

function fmtDate(d) {
  if (!d) return '-';
  return String(d).slice(0, 10);
}

function statusBadge(status) {
  const colors = {
    locked: { background: '#dcfce7', color: '#15803d' },
    confirmed: { background: '#dbeafe', color: '#1d4ed8' },
    draft: { background: '#f1f5f9', color: '#475569' },
    open: { background: '#fef3c7', color: '#92400e' },
    received: { background: '#dbeafe', color: '#1d4ed8' },
    closed: { background: '#f3f4f6', color: '#6b7280' }
  };
  const c = colors[status] || colors.draft;
  return <span style={{ ...s.badge, ...c }}>{status}</span>;
}

function riskBadge(score) {
  const bg = score >= 61 ? '#fee2e2' : score >= 31 ? '#fef3c7' : '#dcfce7';
  const color = score >= 61 ? '#dc2626' : score >= 31 ? '#92400e' : '#15803d';
  return <span style={{ ...s.badge, background: bg, color }}>{score}</span>;
}

function SummaryCards({ summary }) {
  const cards = [
    { label: 'Total Items', value: fmtInt(summary.totalItems), highlight: false },
    { label: 'Stock Value (Rs.)', value: fmt(summary.totalStockValue), highlight: true, color: '#15803d' },
    { label: 'Active Vendors', value: fmtInt(summary.activeVendors), highlight: false },
    { label: 'Active Customers', value: fmtInt(summary.activeCustomers), highlight: false },
    { label: 'Pending Inward', value: fmtInt(summary.pendingInward), highlight: summary.pendingInward > 0, color: '#b45309' },
    { label: 'Pending Outward', value: fmtInt(summary.pendingOutward), highlight: summary.pendingOutward > 0, color: '#b45309' }
  ];

  return (
    <div style={s.summaryGrid}>
      {cards.map(c => (
        <div key={c.label} style={s.summaryCard}>
          <div style={s.summaryLabel}>{c.label}</div>
          <div style={{ ...s.summaryValue, color: c.highlight && c.color ? c.color : 'var(--text-1)' }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function LowStockTable({ rows }) {
  if (!rows.length) return <div style={s.empty}>No items below reorder point.</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Item Code</th>
          <th style={s.th}>Name</th>
          <th style={s.th}>Stock (kg)</th>
          <th style={s.th}>ROP (kg)</th>
          <th style={s.th}>Shortage</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const shortage = Math.max(0, r.ropKg - r.stockKg);
          const isOut = r.stockKg === 0;
          return (
            <tr key={r.itemCode}>
              <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.itemCode}</td>
              <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.name}</td>
              <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                <span style={{ ...s.badge, background: isOut ? '#fee2e2' : '#fef3c7', color: isOut ? '#dc2626' : '#92400e' }}>
                  {fmt(r.stockKg)}
                </span>
              </td>
              <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.ropKg)}</td>
              <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                <span style={{ color: 'var(--danger)', fontWeight: '600' }}>{fmt(shortage)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ExpiryAlertsTable({ rows }) {
  if (!rows.length) return <div style={s.empty}>No batches expiring within 30 days.</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Item Code</th>
          <th style={s.th}>Name</th>
          <th style={s.th}>Batch</th>
          <th style={s.th}>Expiry</th>
          <th style={s.th}>Days Left</th>
          <th style={s.th}>Qty (kg)</th>
          <th style={s.th}>Risk</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.batchId}>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.itemCode}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.name}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.batchId}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(r.expiryDate)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>
              <span style={{ color: r.daysToExpiry <= 7 ? 'var(--danger)' : r.daysToExpiry <= 30 ? '#b45309' : 'var(--success)', fontWeight: '600' }}>
                {r.daysToExpiry}
              </span>
            </td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.qtyRemaining)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{riskBadge(r.riskScore)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecentInwardTable({ rows }) {
  if (!rows.length) return <div style={s.empty}>No inward entries.</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>ID</th>
          <th style={s.th}>Vendor</th>
          <th style={s.th}>Invoice No</th>
          <th style={s.th}>Invoice Date</th>
          <th style={s.th}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.id}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.vendorName}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.invoiceNo || '-'}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(r.invoiceDate)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{statusBadge(r.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecentOutwardTable({ rows }) {
  if (!rows.length) return <div style={s.empty}>No outward entries.</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>ID</th>
          <th style={s.th}>Customer</th>
          <th style={s.th}>Challan No</th>
          <th style={s.th}>Dispatch Date</th>
          <th style={s.th}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.id}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.customerName}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.challanNo || '-'}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(r.dispatchDate)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{statusBadge(r.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TopItemsTable({ rows }) {
  if (!rows.length) return <div style={s.empty}>No dispatches in the last 30 days.</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>#</th>
          <th style={s.th}>Item Code</th>
          <th style={s.th}>Name</th>
          <th style={s.th}>Qty Dispatched (kg)</th>
          <th style={s.th}>Revenue (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.itemCode}>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{i + 1}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.itemCode}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.name}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.totalDispatched)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CategoryStockTable({ rows }) {
  if (!rows.length) return <div style={s.empty}>No category stock data.</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Category</th>
          <th style={s.th}>Sub-Category</th>
          <th style={s.th}>Total Stock (kg)</th>
          <th style={s.th}>Total Value (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.category}-${r.subCategory}`}>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.category}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.subCategory}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.totalStock)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.totalValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthlySummaryTable({ rows }) {
  if (!rows.length) return <div style={s.empty}>No monthly data available.</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Month</th>
          <th style={s.th}>Inward Qty (kg)</th>
          <th style={s.th}>Inward Value (Rs.)</th>
          <th style={s.th}>Outward Qty (kg)</th>
          <th style={s.th}>Outward Value (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.month}>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}><strong>{r.month}</strong></td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.inwardQty)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.inwardValue)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.outwardQty)}</td>
            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.outwardValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MISDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/reports/mis-dashboard');
      setData(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load MIS dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={s.page}>
      <Nav />
      <div style={s.content}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-1)', margin: 0 }}>MIS Dashboard</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', margin: '4px 0 0' }}>Management information summary — stock, alerts, activity</p>
          </div>
          <button style={s.refreshBtn} onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && <div style={s.error}>{error}</div>}

        {loading && !data && <div style={s.loading}>Loading dashboard data...</div>}

        {data && (
          <>
            {/* Summary Cards */}
            <SummaryCards summary={data.summary} />

            {/* Low Stock + Expiry Alerts */}
            <div style={s.twoCol}>
              <div style={s.card}>
                <h2 style={s.sectionTitle}>Low Stock Alerts (Top 10)</h2>
                <LowStockTable rows={data.lowStock} />
              </div>
              <div style={s.card}>
                <h2 style={s.sectionTitle}>Expiry Alerts (Next 30 Days)</h2>
                <ExpiryAlertsTable rows={data.expiryAlerts} />
              </div>
            </div>

            {/* Recent Inward + Recent Outward */}
            <div style={s.twoCol}>
              <div style={s.card}>
                <h2 style={s.sectionTitle}>Recent Inward (Last 10)</h2>
                <RecentInwardTable rows={data.recentInward} />
              </div>
              <div style={s.card}>
                <h2 style={s.sectionTitle}>Recent Outward (Last 10)</h2>
                <RecentOutwardTable rows={data.recentOutward} />
              </div>
            </div>

            {/* Top Items */}
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Top Items by Dispatch (Last 30 Days)</h2>
              <TopItemsTable rows={data.topItems} />
            </div>

            {/* Category Stock */}
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Category Stock Breakdown</h2>
              <CategoryStockTable rows={data.categoryStock} />
            </div>

            {/* Monthly Summary */}
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Monthly Summary (Last 6 Months)</h2>
              <MonthlySummaryTable rows={data.monthlySummary} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
