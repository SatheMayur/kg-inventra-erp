import React, { useState } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  title: { fontSize: '22px', fontWeight: '700', color: 'var(--text-1)', margin: '0 0 4px' },
  subtitle: { fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px' },
  card: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px' },
  filterRow: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '11px', fontWeight: '600', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px', minWidth: '150px' },
  btn: { padding: '9px 18px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  btnSecondary: { padding: '9px 18px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' },
  summaryCard: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '16px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', textAlign: 'center' },
  summaryLabel: { fontSize: '11px', color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' },
  summaryValue: { fontSize: '20px', fontWeight: '700', color: 'var(--text-1)' },
  tableWrap: { overflowX: 'auto', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: 'var(--surface)' },
  th: { padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--text-3)', textAlign: 'left', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' },
  thRight: { padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--text-3)', textAlign: 'right', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' },
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border)' },
  tdRight: { padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right' },
  error: { background: 'var(--danger-dim)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '13px' },
  empty: { padding: '40px', textAlign: 'center', color: 'var(--text-4)', fontSize: '14px' },
};

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
}

function marginColor(pct) {
  if (pct >= 20) return '#15803d';
  if (pct >= 5) return '#d97706';
  return '#dc2626';
}

function marginBg(pct) {
  if (pct >= 20) return '#dcfce7';
  if (pct >= 5) return '#fef3c7';
  return '#fee2e2';
}

function currentMonthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export default function MarginReport() {
  const defaults = currentMonthRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);

  async function loadReport() {
    if (!from || !to) { setError('Both From and To dates are required'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await client.get('/reports/margin', { params: { from, to } });
      setReportData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!reportData?.items?.length) return;
    const headers = ['Item Code', 'Name', 'Qty Dispatched (kg)', 'Purchase Rate', 'Avg Dispatch Rate',
      'Gross Margin (Rs)', 'Shrinkage (Rs)', 'Net Margin (Rs)', 'Margin %', 'Expired Qty (kg)'];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.map(escape).join(','),
      ...reportData.items.map(r => [
        r.item_code, r.sub_category_name, r.qty_dispatched, r.purchase_rate,
        r.avg_dispatch_rate.toFixed(2), r.grossMargin.toFixed(2), r.shrinkage.toFixed(2),
        r.netMargin.toFixed(2), r.marginPct, r.expired_qty
      ].map(escape).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `margin-report-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const items = reportData?.items || [];
  const totals = reportData?.totals || {};
  const totalRevenue = items.reduce((s, r) => s + (r.avg_dispatch_rate * r.qty_dispatched), 0);
  const netMarginPct = totals.totalGrossMargin
    ? Math.round((totals.totalNetMargin / (totalRevenue || 1)) * 100)
    : 0;

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <p style={S.title}>Margin & P&amp;L Report</p>
        <p style={S.subtitle}>Per-item gross margin, shrinkage cost, and net margin for dispatched stock in the selected date range. Sorted worst performers first.</p>

        <div style={S.card}>
          <div style={S.filterRow}>
            <div style={S.fieldGroup}>
              <span style={S.label}>From</span>
              <input type="date" style={S.input} value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div style={S.fieldGroup}>
              <span style={S.label}>To</span>
              <input type="date" style={S.input} value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <button style={S.btn} onClick={loadReport} disabled={loading}>
              {loading ? 'Loading...' : 'Load Report'}
            </button>
            {items.length > 0 && (
              <button style={S.btnSecondary} onClick={exportCsv}>Export CSV</button>
            )}
          </div>
          {error && <div style={{ ...S.error, marginTop: '12px' }}>{error}</div>}
        </div>

        {items.length > 0 && (
          <>
            <div style={S.summaryGrid}>
              <div style={S.summaryCard}>
                <div style={S.summaryLabel}>Total Revenue</div>
                <div style={{ ...S.summaryValue, color: '#1a1a2e' }}>Rs {fmt(totalRevenue)}</div>
              </div>
              <div style={S.summaryCard}>
                <div style={S.summaryLabel}>Total Gross Margin</div>
                <div style={{ ...S.summaryValue, color: '#15803d' }}>Rs {fmt(totals.totalGrossMargin)}</div>
              </div>
              <div style={S.summaryCard}>
                <div style={S.summaryLabel}>Total Shrinkage</div>
                <div style={{ ...S.summaryValue, color: '#dc2626' }}>Rs {fmt(totals.totalShrinkage)}</div>
              </div>
              <div style={S.summaryCard}>
                <div style={S.summaryLabel}>Net Margin %</div>
                <div style={{ ...S.summaryValue, color: marginColor(netMarginPct) }}>{netMarginPct}%</div>
              </div>
            </div>

            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Item Code</th>
                    <th style={S.th}>Name</th>
                    <th style={S.thRight}>Qty Dispatched (kg)</th>
                    <th style={S.thRight}>Purchase Rate</th>
                    <th style={S.thRight}>Avg Dispatch Rate</th>
                    <th style={S.thRight}>Gross Margin (Rs)</th>
                    <th style={S.thRight}>Shrinkage (Rs)</th>
                    <th style={S.thRight}>Net Margin (Rs)</th>
                    <th style={S.thRight}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(r => (
                    <tr key={r.item_id} style={{ background: '#fff' }}>
                      <td style={S.td}><code style={{ fontSize: '12px' }}>{r.item_code}</code></td>
                      <td style={S.td}>{r.sub_category_name}</td>
                      <td style={S.tdRight}>{fmt(r.qty_dispatched)}</td>
                      <td style={S.tdRight}>Rs {fmt(r.purchase_rate)}</td>
                      <td style={S.tdRight}>Rs {fmt(r.avg_dispatch_rate)}</td>
                      <td style={S.tdRight}>Rs {fmt(r.grossMargin)}</td>
                      <td style={{ ...S.tdRight, color: r.shrinkage > 0 ? '#dc2626' : '#15803d' }}>
                        {r.shrinkage > 0 ? `Rs ${fmt(r.shrinkage)}` : '—'}
                      </td>
                      <td style={S.tdRight}>Rs {fmt(r.netMargin)}</td>
                      <td style={S.tdRight}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '700',
                          background: marginBg(r.marginPct), color: marginColor(r.marginPct)
                        }}>
                          {r.marginPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && reportData && items.length === 0 && (
          <div style={{ ...S.card, ...S.empty }}>
            No dispatched items found for the selected date range.
          </div>
        )}
      </div>
    </div>
  );
}
