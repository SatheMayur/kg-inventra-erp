import React, { useState, useEffect, useCallback } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';
import { safeUser } from '../lib/safeUser';

const s = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' },
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
  btnSecondary: { padding: '7px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px' },
  btnDanger: { padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: '13px' },
  btnSuccess: { padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--success)', color: '#fff', cursor: 'pointer', fontSize: '13px' },
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
  exportGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' },
  exportCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: 'var(--shadow-sm)' },
  exportTitle: { fontSize: '15px', fontWeight: '600', color: 'var(--text-1)' },
  exportDesc: { fontSize: '12px', color: 'var(--text-3)', lineHeight: '1.5' },
  vendorCard: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: '16px', fontSize: '13px' },
  vendorRow: { display: 'flex', gap: '24px', flexWrap: 'wrap' },
  vendorField: { display: 'flex', flexDirection: 'column', gap: '2px' },
  vendorFieldLabel: { fontSize: '11px', color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  vendorFieldValue: { fontSize: '14px', fontWeight: '600', color: 'var(--text-1)' },
};

function RagDot({ rag }) {
  const colors = { red: 'var(--danger)', amber: '#F59E0B', green: 'var(--success)' };
  return (
    <span style={{
      display: 'inline-block', width: '10px', height: '10px',
      borderRadius: '50%', background: colors[rag] || 'var(--text-4)',
      marginRight: '6px', verticalAlign: 'middle'
    }} />
  );
}

function RiskBar({ score }) {
  const color = score >= 70 ? 'var(--danger)' : score >= 40 ? '#F59E0B' : 'var(--success)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, background: 'var(--border)', borderRadius: 'var(--radius)', height: '8px', minWidth: '80px' }}>
        <div style={{ width: `${score}%`, background: color, height: '100%', borderRadius: 'var(--radius)', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '12px', color: 'var(--text-3)', minWidth: '28px' }}>{score}</span>
    </div>
  );
}

function fmt(num) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
}

function fmtDate(d) {
  if (!d) return '-';
  return String(d).slice(0, 10);
}

// ---------- Expiry Alerts Tab ----------
function ExpiryAlertsTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/reports/expiry-alerts?days=${days}`);
      setData(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load expiry alerts');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={s.filterBar}>
        <label style={s.label}>Expiring within</label>
        <input
          type="number" min="1" value={days}
          onChange={e => setDays(parseInt(e.target.value) || 30)}
          style={{ ...s.input, width: '80px' }}
        />
        <label style={s.label}>days</label>
        <button style={s.btn} onClick={load}>Refresh</button>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {loading && <div style={s.loading}>Loading...</div>}
      {!loading && !error && (
        <div style={s.card}>
          {data.length === 0
            ? <div style={s.empty}>No batches expiring within {days} days.</div>
            : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Item Code</th>
                    <th style={s.th}>Sub-Category</th>
                    <th style={s.th}>Batch ID</th>
                    <th style={s.th}>Qty (kg)</th>
                    <th style={s.th}>Expiry Date</th>
                    <th style={s.th}>Days Left</th>
                    <th style={s.th}>Risk Score</th>
                    <th style={s.th}>RAG</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={r.batch_id}>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_code}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_name || r.sub_category_name}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.batch_id}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.qty_remaining)}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(r.expiry_date)}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                        <span style={{ color: r.rag === 'red' ? 'var(--danger)' : r.rag === 'amber' ? '#F59E0B' : 'var(--success)', fontWeight: '600' }}>
                          {Math.round(r.days_to_expiry)}
                        </span>
                      </td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}><RiskBar score={r.risk_score || 0} /></td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                        <RagDot rag={r.rag} />
                        <span style={{ fontSize: '12px', textTransform: 'capitalize' }}>{r.rag}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  );
}

// ---------- Low Stock Tab ----------
function LowStockTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);
  const user = safeUser();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/reports/low-stock');
      setData(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load low stock');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRunNightly() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await client.post('/reports/run-nightly');
      setRunResult({ ok: true, data: res.data.data });
      load();
    } catch (e) {
      setRunResult({ ok: false, msg: e.response?.data?.error || 'Failed' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div style={s.filterBar}>
        <button style={s.btn} onClick={load}>Refresh</button>
        {user.role === 'admin' && (
          <button style={s.btnSecondary} onClick={handleRunNightly} disabled={running}>
            {running ? 'Running...' : 'Run Nightly Job'}
          </button>
        )}
      </div>
      {runResult && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '13px', background: runResult.ok ? 'var(--success-dim)' : 'var(--danger-dim)', color: runResult.ok ? 'var(--success)' : 'var(--danger)', border: `1px solid ${runResult.ok ? 'var(--success)' : 'var(--danger)'}` }}>
          {runResult.ok
            ? `Nightly job complete. Expired: ${runResult.data.jobs.mark_expired.rows_updated} batches, Risk scores: ${runResult.data.jobs.risk_scores.batches_updated} batches, ROP: ${runResult.data.jobs.rop_update.items_updated} items.`
            : `Error: ${runResult.msg}`}
        </div>
      )}
      {error && <div style={s.error}>{error}</div>}
      {loading && <div style={s.loading}>Loading...</div>}
      {!loading && !error && (
        <div style={s.card}>
          {data.length === 0
            ? <div style={s.empty}>All items are above their reorder point.</div>
            : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Item Code</th>
                    <th style={s.th}>Sub-Category</th>
                    <th style={s.th}>Unit</th>
                    <th style={s.th}>Live Stock</th>
                    <th style={s.th}>ROP</th>
                    <th style={s.th}>Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={r.item_id}>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_code}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.sub_category_name}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.unit}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.live_stock_kg)}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.rop_kg)}</td>
                      <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                        <span style={{ color: parseFloat(r.shortage) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: '600' }}>
                          {fmt(r.shortage)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  );
}

// ---------- Dead Stock Tab ----------
function DeadStockTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/reports/dead-stock?days=${days}`);
      setData(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load dead stock');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={s.filterBar}>
        <label style={s.label}>No dispatch in</label>
        <input
          type="number" min="1" value={days}
          onChange={e => setDays(parseInt(e.target.value) || 30)}
          style={{ ...s.input, width: '80px' }}
        />
        <label style={s.label}>days</label>
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
                  Items with stock and no dispatch in the last <strong>{days} days</strong>
                </div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Item Code</th>
                      <th style={s.th}>Sub-Category</th>
                      <th style={s.th}>Stock (kg)</th>
                      <th style={s.th}>Last Dispatch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={r.item_id}>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_code}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.sub_category_name}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.stock_kg)}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.last_dispatch ? fmtDate(r.last_dispatch) : 'Never'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          }
        </div>
      )}
    </div>
  );
}

// ---------- Margin / MIS Tab ----------
function MarginTab() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/reports/margin?month=${month}`);
      setItems(res.data.data.items);
      setTotals(res.data.data.totals);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load margin data');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={s.filterBar}>
        <label style={s.label}>Month</label>
        <input
          type="month" value={month}
          onChange={e => setMonth(e.target.value)}
          style={s.input}
        />
        <button style={s.btn} onClick={load}>Refresh</button>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {loading && <div style={s.loading}>Loading...</div>}
      {!loading && !error && (
        <>
          <div style={s.summaryCards}>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Total Gross Margin</div>
              <div style={{ ...s.summaryValue, color: totals.totalGrossMargin >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmt(totals.totalGrossMargin)}
              </div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Total Shrinkage</div>
              <div style={{ ...s.summaryValue, color: 'var(--danger)' }}>{fmt(totals.totalShrinkage)}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Net Margin</div>
              <div style={{ ...s.summaryValue, color: (totals.totalNetMargin || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmt(totals.totalNetMargin)}
              </div>
            </div>
          </div>
          <div style={s.card}>
            {items.length === 0
              ? <div style={s.empty}>No locked dispatches found for {month}.</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Item Code</th>
                        <th style={s.th}>Sub-Category</th>
                        <th style={s.th}>Qty Dispatched</th>
                        <th style={s.th}>Avg Dispatch Rate</th>
                        <th style={s.th}>Purchase Rate</th>
                        <th style={s.th}>Gross Margin</th>
                        <th style={s.th}>Shrinkage</th>
                        <th style={s.th}>Net Margin</th>
                        <th style={s.th}>Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r, i) => (
                        <tr key={r.item_id}>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.item_code}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{r.sub_category_name}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.qty_dispatched)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.avg_dispatch_rate)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.purchase_rate)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.grossMargin)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.shrinkage)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(r.netMargin)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                            <span style={{ color: r.marginPct >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                              {r.marginPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Vendor History Tab ----------
function VendorHistoryTab() {
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/vendors').then(r => setVendors(r.data.data)).catch(() => {});
  }, []);

  async function loadHistory(vid) {
    if (!vid) return;
    setLoading(true);
    setError('');
    setHistory(null);
    try {
      const res = await client.get(`/reports/vendor-history/${vid}`);
      setHistory(res.data.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load vendor history');
    } finally {
      setLoading(false);
    }
  }

  function handleVendorChange(e) {
    setVendorId(e.target.value);
    loadHistory(e.target.value);
  }

  return (
    <div>
      <div style={s.filterBar}>
        <label style={s.label}>Vendor</label>
        <select value={vendorId} onChange={handleVendorChange} style={{ ...s.input, minWidth: '220px' }}>
          <option value="">-- Select vendor --</option>
          {vendors.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {loading && <div style={s.loading}>Loading...</div>}
      {history && (
        <>
          <div style={s.vendorCard}>
            <div style={s.vendorRow}>
              <div style={s.vendorField}>
                <span style={s.vendorFieldLabel}>Vendor</span>
                <span style={s.vendorFieldValue}>{history.vendor.name}</span>
              </div>
              {history.vendor.gstin && (
                <div style={s.vendorField}>
                  <span style={s.vendorFieldLabel}>GSTIN</span>
                  <span style={s.vendorFieldValue}>{history.vendor.gstin}</span>
                </div>
              )}
              {history.vendor.contact && (
                <div style={s.vendorField}>
                  <span style={s.vendorFieldLabel}>Contact</span>
                  <span style={s.vendorFieldValue}>{history.vendor.contact}</span>
                </div>
              )}
              {history.vendor.payment_terms && (
                <div style={s.vendorField}>
                  <span style={s.vendorFieldLabel}>Payment Terms</span>
                  <span style={s.vendorFieldValue}>{history.vendor.payment_terms}</span>
                </div>
              )}
              <div style={s.vendorField}>
                <span style={s.vendorFieldLabel}>Total Entries</span>
                <span style={s.vendorFieldValue}>{history.entry_count}</span>
              </div>
              <div style={s.vendorField}>
                <span style={s.vendorFieldLabel}>Grand Total</span>
                <span style={{ ...s.vendorFieldValue, color: 'var(--success)' }}>
                  {fmt(history.grand_total)}
                </span>
              </div>
            </div>
          </div>
          <div style={s.card}>
            {history.entries.length === 0
              ? <div style={s.empty}>No locked inward entries for this vendor.</div>
              : (
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Invoice Date</th>
                      <th style={s.th}>Invoice No</th>
                      <th style={s.th}>Lines</th>
                      <th style={s.th}>Total Value</th>
                      <th style={s.th}>Locked At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.entries.map((e, i) => (
                      <tr key={e.id}>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(e.invoice_date)}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{e.invoice_no || '-'}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{e.line_count}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(e.total_value)}</td>
                        <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(e.locked_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ ...s.td, fontWeight: '700', borderTop: '1px solid var(--border-strong)' }}>Grand Total</td>
                      <td style={{ ...s.td, fontWeight: '700', borderTop: '1px solid var(--border-strong)', color: 'var(--success)' }}>
                        {fmt(history.grand_total)}
                      </td>
                      <td style={{ ...s.td, borderTop: '1px solid var(--border-strong)' }} />
                    </tr>
                  </tfoot>
                </table>
              )
            }
          </div>
        </>
      )}
      {!history && !loading && vendorId && <div style={s.loading}>Select a vendor to view history.</div>}
    </div>
  );
}

// ---------- Export Tab ----------
function ExportTab() {
  async function downloadExport(type) {
    try {
      const res = await client.get(`/reports/export/${type}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers['content-disposition'];
      const fname = cd ? cd.split('filename=')[1] : `${type}-export.xlsx`;
      a.download = fname;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed');
    }
  }

  const exports = [
    {
      type: 'items',
      title: 'Export Items',
      desc: 'All items with category, sub-category, barcode, item code, purchase rate, MRP, live stock, and reorder point.'
    },
    {
      type: 'stock',
      title: 'Export Stock',
      desc: 'Current stock per item per batch — batch ID, receipt date, expiry date, quantity remaining, and risk score.'
    },
    {
      type: 'inward',
      title: 'Export Inward',
      desc: 'All locked inward entries with lines — invoice date, vendor, item code, quantity, rate, expiry date.'
    },
    {
      type: 'outward',
      title: 'Export Outward',
      desc: 'All locked outward entries with lines — dispatch date, challan number, customer, item code, batch, quantity, rate.'
    }
  ];

  return (
    <div style={s.exportGrid}>
      {exports.map(ex => (
        <div key={ex.type} style={s.exportCard}>
          <div style={s.exportTitle}>{ex.title}</div>
          <div style={s.exportDesc}>{ex.desc}</div>
          <button style={s.btn} onClick={() => downloadExport(ex.type)}>
            Download .xlsx
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Main Reports Page ----------
const TABS = [
  { key: 'expiry', label: 'Expiry Alerts' },
  { key: 'lowstock', label: 'Low Stock' },
  { key: 'deadstock', label: 'Dead Stock' },
  { key: 'margin', label: 'Margin / MIS' },
  { key: 'vendor', label: 'Vendor History' },
  { key: 'export', label: 'Export' }
];

export default function Reports() {
  const [tab, setTab] = useState('expiry');

  return (
    <div style={s.page}>
      <Nav />
      <div style={s.content}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>Reports & MIS</h1>
            <p style={s.pageSubtitle}>Expiry, stock, margin, and vendor analytics</p>
          </div>
        </div>
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
        {tab === 'expiry' && <ExpiryAlertsTab />}
        {tab === 'lowstock' && <LowStockTab />}
        {tab === 'deadstock' && <DeadStockTab />}
        {tab === 'margin' && <MarginTab />}
        {tab === 'vendor' && <VendorHistoryTab />}
        {tab === 'export' && <ExportTab />}
      </div>
    </div>
  );
}
