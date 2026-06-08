import React, { useState, useEffect, useCallback } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';

const s = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' },
  pageTitle: { fontSize: '20px', fontWeight: '700', color: 'var(--text-1)', margin: 0 },
  pageSubtitle: { fontSize: '13px', color: 'var(--text-3)', margin: '4px 0 0' },
  tabBar: { display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' },
  tab: { padding: '8px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: 'var(--text-3)', borderRadius: 'var(--radius) var(--radius) 0 0', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  tabActive: { color: 'var(--primary)', borderBottom: '2px solid var(--primary)' },
  card: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px' },
  filterBar: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' },
  label: { fontSize: '13px', color: 'var(--text-3)', fontWeight: '500' },
  input: { padding: '7px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text-2)', outline: 'none' },
  btn: { padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { background: 'var(--surface-2)', padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: '600', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  tdAlt: { padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', verticalAlign: 'middle' },
  error: { color: 'var(--danger)', padding: '12px', background: 'var(--danger-dim)', borderRadius: 'var(--radius)', fontSize: '13px' },
  loading: { color: 'var(--text-3)', padding: '12px', fontSize: '13px' },
  empty: { color: 'var(--text-4)', padding: '24px', textAlign: 'center', fontSize: '13px' },
  summaryCards: { display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' },
  summaryCard: { flex: '1 1 200px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' },
  summaryLabel: { fontSize: '12px', color: 'var(--text-3)', fontWeight: '500', marginBottom: '6px' },
  summaryValue: { fontSize: '22px', fontWeight: '700', color: 'var(--text-1)' },
};

const DAYS_OPTIONS = [7, 14, 30, 60, 90];
const DEAD_DAYS_OPTIONS = [30, 60, 90, 180];

function fmt(num) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
}

function fmtDate(d) {
  if (!d) return '-';
  return String(d).slice(0, 10);
}

function RiskBadge({ score }) {
  const n = parseInt(score) || 0;
  const style = n >= 61
    ? { color: 'var(--danger)', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)' }
    : n >= 31
    ? { color: '#92400e', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }
    : { color: 'var(--success)', background: 'var(--success-dim)', border: '1px solid rgba(16,185,129,0.3)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
      fontSize: '12px', fontWeight: '600', ...style
    }}>
      {n}
    </span>
  );
}

// ---------- Tab 1: Expiring Soon ----------
function ExpiringSoonTab({ summaryRef }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/reports/expiry-alerts?days=${days}`);
      const rows = res.data.data || [];
      setData(rows);
      if (summaryRef) {
        summaryRef.expiring = rows;
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load expiry alerts');
    } finally {
      setLoading(false);
    }
  }, [days, summaryRef]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={s.filterBar}>
        <label style={s.label}>Expiring within</label>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value))}
          style={s.input}
        >
          {DAYS_OPTIONS.map(d => (
            <option key={d} value={d}>{d} days</option>
          ))}
        </select>
        <button style={s.btn} onClick={load}>Refresh</button>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {loading && <div style={s.loading}>Loading...</div>}
      {!loading && !error && (
        <div style={s.card}>
          {data.length === 0
            ? <div style={s.empty}>No batches expiring within {days} days.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Item Code</th>
                      <th style={s.th}>Item Name</th>
                      <th style={s.th}>Batch ID</th>
                      <th style={s.th}>Expiry Date</th>
                      <th style={s.th}>Days Left</th>
                      <th style={s.th}>Qty Remaining (kg)</th>
                      <th style={s.th}>Risk Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => {
                      const daysLeft = Math.round(r.days_to_expiry);
                      const dayColor = daysLeft <= 7 ? 'var(--danger)' : daysLeft <= 30 ? '#F59E0B' : 'var(--success)';
                      return (
                        <tr key={r.batch_id}>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_code}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_name || r.sub_category_name}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.batch_id}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(r.expiry_date)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                            <span style={{ color: dayColor, fontWeight: '600' }}>{daysLeft}</span>
                          </td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.qty_remaining)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}><RiskBadge score={r.risk_score} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}

// ---------- Tab 2: Expired ----------
function ExpiredTab({ onLoad }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState('');
  const [data, setData] = useState([]);
  const [totalShrinkage, setTotalShrinkage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = month ? `/reports/expired-batches?month=${month}` : '/reports/expired-batches';
      const res = await client.get(url);
      setData(res.data.data || []);
      setTotalShrinkage(res.data.total_shrinkage || 0);
      if (onLoad) onLoad(res.data.total_shrinkage || 0);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load expired batches');
    } finally {
      setLoading(false);
    }
  }, [month, onLoad]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={s.filterBar}>
        <label style={s.label}>Filter by month</label>
        <input
          type="month" value={month}
          onChange={e => setMonth(e.target.value)}
          style={s.input}
          placeholder="All time"
        />
        {month && (
          <button style={{ ...s.btn, background: 'var(--text-3)' }} onClick={() => setMonth('')}>
            Clear
          </button>
        )}
        <button style={s.btn} onClick={load}>Refresh</button>
      </div>
      <div style={{ ...s.summaryCards, marginBottom: '16px' }}>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>Total Shrinkage Value{month ? ` (${month})` : ' (All Time)'}</div>
          <div style={{ ...s.summaryValue, color: 'var(--danger)' }}>&#8377; {fmt(totalShrinkage)}</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>Expired Batches{month ? ` (${month})` : ' (All Time)'}</div>
          <div style={s.summaryValue}>{data.length}</div>
        </div>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {loading && <div style={s.loading}>Loading...</div>}
      {!loading && !error && (
        <div style={s.card}>
          {data.length === 0
            ? <div style={s.empty}>No expired batches found{month ? ` for ${month}` : ''}.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Item Code</th>
                      <th style={s.th}>Item Name</th>
                      <th style={s.th}>Batch ID</th>
                      <th style={s.th}>Expiry Date</th>
                      <th style={s.th}>Expired At</th>
                      <th style={s.th}>Expired Qty (kg)</th>
                      <th style={s.th}>Shrinkage Value (&#8377;)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={r.batch_id}>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_code}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.sub_category_name}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.batch_id}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(r.expiry_date)}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(r.expired_at)}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.expired_qty)}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                          <span style={{ color: 'var(--danger)', fontWeight: '600' }}>
                            {fmt(r.shrinkage_value)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ ...s.td, fontWeight: '700', borderTop: '2px solid var(--border)' }}>
                        Total Shrinkage
                      </td>
                      <td style={{ ...s.td, fontWeight: '700', borderTop: '2px solid var(--border)', color: 'var(--danger)' }}>
                        &#8377; {fmt(totalShrinkage)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}

// ---------- Tab 3: Dead Stock ----------
function DeadStockTab({ onLoad }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/reports/dead-stock?days=${days}`);
      const rows = res.data.data || [];
      setData(rows);
      if (onLoad) onLoad(rows.length);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load dead stock');
    } finally {
      setLoading(false);
    }
  }, [days, onLoad]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={s.filterBar}>
        <label style={s.label}>No dispatch in</label>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value))}
          style={s.input}
        >
          {DEAD_DAYS_OPTIONS.map(d => (
            <option key={d} value={d}>{d} days</option>
          ))}
        </select>
        <button style={s.btn} onClick={load}>Refresh</button>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {loading && <div style={s.loading}>Loading...</div>}
      {!loading && !error && (
        <div style={s.card}>
          {data.length === 0
            ? <div style={s.empty}>No dead stock found for {days}-day window.</div>
            : (
              <>
                <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-3)' }}>
                  Items with stock on hand and no dispatch in the last <strong>{days} days</strong>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Item Code</th>
                        <th style={s.th}>Name</th>
                        <th style={s.th}>Stock (kg)</th>
                        <th style={s.th}>Last Dispatch</th>
                        <th style={s.th}>Days Since Dispatch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((r, i) => {
                        const daysSince = r.last_dispatch
                          ? Math.floor((Date.now() - new Date(r.last_dispatch).getTime()) / 86400000)
                          : null;
                        const dayColor = daysSince === null
                          ? 'var(--danger)'
                          : daysSince > 90 ? 'var(--danger)' : daysSince > 30 ? '#F59E0B' : 'var(--text-2)';
                        return (
                          <tr key={r.item_id}>
                            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_code}</td>
                            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.sub_category_name}</td>
                            <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.stock_kg)}</td>
                            <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                              {r.last_dispatch ? fmtDate(r.last_dispatch) : 'Never'}
                            </td>
                            <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                              <span style={{ color: dayColor, fontWeight: '600' }}>
                                {daysSince !== null ? daysSince : 'Never dispatched'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          }
        </div>
      )}
    </div>
  );
}

// ---------- Summary Cards ----------
function SummaryCards({ expiringData, expiredShrinkage, deadStockCount }) {
  const itemsExpiring30 = expiringData.filter(r => Math.round(r.days_to_expiry) <= 30).length;
  const qtyAtRisk = expiringData
    .filter(r => Math.round(r.days_to_expiry) <= 30)
    .reduce((sum, r) => sum + (parseFloat(r.qty_remaining) || 0), 0);

  return (
    <div style={s.summaryCards}>
      <div style={s.summaryCard}>
        <div style={s.summaryLabel}>Items Expiring (30 days)</div>
        <div style={{ ...s.summaryValue, color: itemsExpiring30 > 0 ? '#F59E0B' : 'var(--text-1)' }}>
          {itemsExpiring30}
        </div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryLabel}>Qty at Risk (kg)</div>
        <div style={{ ...s.summaryValue, color: qtyAtRisk > 0 ? '#F59E0B' : 'var(--text-1)' }}>
          {fmt(qtyAtRisk)}
        </div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryLabel}>Expired Value (this month)</div>
        <div style={{ ...s.summaryValue, color: expiredShrinkage > 0 ? 'var(--danger)' : 'var(--text-1)' }}>
          &#8377; {fmt(expiredShrinkage)}
        </div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryLabel}>Dead Stock Items</div>
        <div style={{ ...s.summaryValue, color: deadStockCount > 0 ? '#F59E0B' : 'var(--text-1)' }}>
          {deadStockCount}
        </div>
      </div>
    </div>
  );
}

// ---------- Main Page ----------
const TABS = [
  { key: 'expiring', label: 'Expiring Soon' },
  { key: 'expired', label: 'Expired' },
  { key: 'deadstock', label: 'Dead Stock' },
];

export default function ExpiryAlerts() {
  const [tab, setTab] = useState('expiring');
  const [expiringData, setExpiringData] = useState([]);
  const [expiredShrinkage, setExpiredShrinkage] = useState(0);
  const [deadStockCount, setDeadStockCount] = useState(0);

  // Fetch summary data for expiring tab on mount (use 30-day window for summary)
  useEffect(() => {
    client.get('/reports/expiry-alerts?days=30')
      .then(r => setExpiringData(r.data.data || []))
      .catch(() => {});
    // Current month expired shrinkage
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    client.get(`/reports/expired-batches?month=${month}`)
      .then(r => setExpiredShrinkage(r.data.total_shrinkage || 0))
      .catch(() => {});
    client.get('/reports/dead-stock?days=30')
      .then(r => setDeadStockCount((r.data.data || []).length))
      .catch(() => {});
  }, []);

  return (
    <div style={s.page}>
      <Nav />
      <div style={s.content}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>Expiry Alerts</h1>
            <p style={s.pageSubtitle}>Track expiring stock, expired batches, and dead inventory</p>
          </div>
        </div>
        <SummaryCards
          expiringData={expiringData}
          expiredShrinkage={expiredShrinkage}
          deadStockCount={deadStockCount}
        />
        <div style={s.tabBar}>
          {TABS.map(t => (
            <button
              key={t.key}
              style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'expiring' && <ExpiringSoonTab />}
        {tab === 'expired' && <ExpiredTab onLoad={setExpiredShrinkage} />}
        {tab === 'deadstock' && <DeadStockTab onLoad={setDeadStockCount} />}
      </div>
    </div>
  );
}
