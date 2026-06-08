import React, { useState, useEffect, useCallback } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';

// ---- shared styles (mirrors Reports.jsx) ----
const s = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px' },
  tabBar: {
    display: 'flex', gap: '4px', marginBottom: '24px',
    borderBottom: '1px solid var(--border)', paddingBottom: '0'
  },
  tab: {
    padding: '8px 18px', border: 'none', background: 'transparent',
    cursor: 'pointer', fontSize: '13px', fontWeight: '500',
    color: 'var(--text-3)', borderRadius: 'var(--radius) var(--radius) 0 0',
    borderBottom: '2px solid transparent', marginBottom: '-1px'
  },
  tabActive: { color: 'var(--primary)', borderBottom: '2px solid var(--primary)' },
  card: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px',
    boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px'
  },
  filterBar: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' },
  label: { fontSize: '13px', color: 'var(--text-3)', fontWeight: '500' },
  formLabel: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-3)', marginBottom: '5px' },
  formGroup: { marginBottom: '16px' },
  input: {
    padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
    fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box'
  },
  select: {
    padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
    fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
    background: 'var(--surface)'
  },
  textarea: {
    padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
    fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
    resize: 'vertical', minHeight: '72px'
  },
  btn: {
    padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none',
    background: 'var(--primary)', color: '#fff', cursor: 'pointer',
    fontSize: '13px', fontWeight: '500'
  },
  btnSecondary: {
    padding: '7px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)',
    background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px'
  },
  btnSuccess: {
    padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none',
    background: 'var(--success)', color: '#fff', cursor: 'pointer',
    fontSize: '13px', fontWeight: '500'
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    background: 'var(--surface-2)', padding: '10px 12px', textAlign: 'left',
    borderBottom: '2px solid var(--border)', fontWeight: '600', color: 'var(--text-2)',
    whiteSpace: 'nowrap'
  },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  tdAlt: { padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', verticalAlign: 'middle' },
  error: { color: 'var(--danger)', padding: '12px', background: 'var(--danger-dim)', borderRadius: 'var(--radius)', fontSize: '13px', marginBottom: '12px' },
  success: { color: 'var(--success)', padding: '12px', background: 'var(--success-dim)', borderRadius: 'var(--radius)', fontSize: '13px', border: '1px solid var(--success)', marginBottom: '12px' },
  loading: { color: 'var(--text-3)', padding: '12px', fontSize: '13px' },
  empty: { color: 'var(--text-4)', padding: '24px', textAlign: 'center', fontSize: '13px' },
  helper: { fontSize: '11px', color: 'var(--text-4)', marginTop: '4px' },
  paginationBar: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px', justifyContent: 'flex-end' },
  pageInfo: { fontSize: '13px', color: 'var(--text-3)' }
};

const REASON_OPTIONS = [
  { value: 'transfer_in', label: 'Transfer In' },
  { value: 'transfer_out', label: 'Transfer Out' },
  { value: 'damage', label: 'Damage' },
  { value: 'sample', label: 'Sample' },
  { value: 'correction', label: 'Correction' }
];

const REASON_BADGE = {
  transfer_in:  { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  transfer_out: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  damage:       { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  sample:       { bg: '#faf5ff', color: '#7c3aed', border: '#e9d5ff' },
  correction:   { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }
};

function ReasonBadge({ reason }) {
  const style = REASON_BADGE[reason] || { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
  return (
    <span style={{
      background: style.bg, color: style.color,
      border: `1px solid ${style.border}`,
      padding: '2px 8px', borderRadius: '10px',
      fontSize: '11px', fontWeight: '600', textTransform: 'capitalize',
      whiteSpace: 'nowrap'
    }}>
      {reason ? reason.replace('_', ' ') : '-'}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '-';
  return String(d).slice(0, 10);
}

function fmtDateTime(d) {
  if (!d) return '-';
  return String(d).slice(0, 16).replace('T', ' ');
}

// ---- Tab 1: New Transfer ----
function NewTransferTab() {
  const [items, setItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Load items on mount
  useEffect(() => {
    client.get('/items').then(r => setItems(r.data.data || [])).catch(() => {});
  }, []);

  // Reload items when search changes (debounced with effect)
  useEffect(() => {
    const t = setTimeout(() => {
      const params = itemSearch ? { search: itemSearch } : {};
      client.get('/items', { params }).then(r => setItems(r.data.data || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [itemSearch]);

  // Fetch batches when item changes
  useEffect(() => {
    setBatchId('');
    setBatches([]);
    if (!itemId) return;
    setLoadingBatches(true);
    client.get(`/items/${itemId}/batches`)
      .then(r => setBatches(r.data.data || []))
      .catch(() => setBatches([]))
      .finally(() => setLoadingBatches(false));
  }, [itemId]);

  function resetForm() {
    setItemId('');
    setItemSearch('');
    setBatchId('');
    setBatches([]);
    setQty('');
    setReason('');
    setNotes('');
    setReferenceNo('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!itemId) return setError('Please select an item.');
    if (!batchId) return setError('Please select a batch.');
    if (!qty || isNaN(Number(qty)) || Number(qty) === 0) return setError('Qty must be a non-zero number.');
    if (!reason) return setError('Please select a reason.');

    setSubmitting(true);
    try {
      const res = await client.post('/stock-transfers', {
        itemId: Number(itemId),
        batchId: Number(batchId),
        qty: Number(qty),
        reason,
        notes: notes || undefined,
        referenceNo: referenceNo || undefined
      });
      const { newQtyRemaining } = res.data.data;
      setSuccessMsg(`Transfer saved. Batch new qty remaining: ${newQtyRemaining}`);
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save transfer.');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredItems = items;

  return (
    <div style={{ maxWidth: '560px' }}>
      {error && <div style={s.error}>{error}</div>}
      {successMsg && <div style={s.success}>{successMsg}</div>}
      <form onSubmit={handleSubmit}>
        <div style={s.formGroup}>
          <label style={s.formLabel}>Item *</label>
          <input
            style={s.input}
            placeholder="Search by code or name..."
            value={itemSearch}
            onChange={e => { setItemSearch(e.target.value); setItemId(''); }}
          />
          {itemSearch && !itemId && filteredItems.length > 0 && (
            <div style={{
              border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--surface)',
              maxHeight: '180px', overflowY: 'auto', marginTop: '2px',
              boxShadow: 'var(--shadow-lg)', position: 'absolute', zIndex: 10,
              width: '520px'
            }}>
              {filteredItems.slice(0, 20).map(item => (
                <div
                  key={item.id}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                  onClick={() => {
                    setItemId(String(item.id));
                    setItemSearch(`${item.item_code} — ${item.variant_grade || item.sub_category_name}`);
                  }}
                >
                  <strong>{item.item_code}</strong> — {item.variant_grade || item.sub_category_name}
                  <span style={{ color: 'var(--text-4)', marginLeft: '8px', fontSize: '11px' }}>
                    Stock: {parseFloat(item.live_stock_kg || 0).toFixed(2)} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={s.formGroup}>
          <label style={s.formLabel}>Batch *</label>
          {loadingBatches && <div style={s.helper}>Loading batches...</div>}
          {!itemId && <div style={{ ...s.select, color: 'var(--text-4)' }}>Select an item first</div>}
          {itemId && !loadingBatches && (
            <select
              style={s.select}
              value={batchId}
              onChange={e => setBatchId(e.target.value)}
            >
              <option value="">-- Select batch --</option>
              {batches.length === 0 && <option disabled>No batches found</option>}
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  Batch #{b.id} | Received: {fmtDate(b.receipt_date)} | Expiry: {fmtDate(b.expiry_date)} | Qty: {parseFloat(b.qty_remaining).toFixed(2)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={s.formGroup}>
          <label style={s.formLabel}>Qty *</label>
          <input
            type="number"
            step="0.01"
            style={s.input}
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder="e.g. 10 or -5"
          />
          <div style={s.helper}>Positive adds stock, negative deducts stock</div>
        </div>

        <div style={s.formGroup}>
          <label style={s.formLabel}>Reason *</label>
          <select style={s.select} value={reason} onChange={e => setReason(e.target.value)}>
            <option value="">-- Select reason --</option>
            {REASON_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div style={s.formGroup}>
          <label style={s.formLabel}>Reference No</label>
          <input
            style={s.input}
            value={referenceNo}
            onChange={e => setReferenceNo(e.target.value)}
            placeholder="Optional — PO no., challan no., etc."
          />
        </div>

        <div style={s.formGroup}>
          <label style={s.formLabel}>Notes</label>
          <textarea
            style={s.textarea}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes..."
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" style={s.btnSuccess} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Transfer'}
          </button>
          <button type="button" style={s.btnSecondary} onClick={resetForm}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- Tab 2: History ----
function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  // Filters
  const [filterItemSearch, setFilterItemSearch] = useState('');
  const [filterItemId, setFilterItemId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterReason, setFilterReason] = useState('');
  const [itemSuggestions, setItemSuggestions] = useState([]);

  // Load item suggestions for filter typeahead
  useEffect(() => {
    if (!filterItemSearch || filterItemId) { setItemSuggestions([]); return; }
    const t = setTimeout(() => {
      client.get('/items', { params: { search: filterItemSearch } })
        .then(r => setItemSuggestions(r.data.data || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [filterItemSearch, filterItemId]);

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: pg, limit: 20 };
      if (filterItemId) params.itemId = filterItemId;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const res = await client.get('/stock-transfers', { params });
      let data = res.data.data || [];
      // Client-side reason filter (server doesn't support it directly)
      if (filterReason) data = data.filter(r => r.reason === filterReason);
      setRows(data);
      setPagination(res.data.pagination || { total: 0, pages: 1 });
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [filterItemId, filterFrom, filterTo, filterReason]);

  useEffect(() => { load(page); }, [load, page]);

  function handleSearch() {
    setPage(1);
    load(1);
  }

  function clearFilters() {
    setFilterItemSearch('');
    setFilterItemId('');
    setFilterFrom('');
    setFilterTo('');
    setFilterReason('');
    setPage(1);
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={s.filterBar}>
        <div style={{ position: 'relative' }}>
          <label style={{ ...s.label, marginRight: '6px' }}>Item</label>
          <input
            style={{ ...s.input, width: '200px', display: 'inline-block' }}
            placeholder="Search item..."
            value={filterItemSearch}
            onChange={e => { setFilterItemSearch(e.target.value); setFilterItemId(''); }}
          />
          {filterItemSearch && !filterItemId && itemSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-lg)', minWidth: '260px', maxHeight: '160px', overflowY: 'auto'
            }}>
              {itemSuggestions.slice(0, 15).map(item => (
                <div
                  key={item.id}
                  style={{ padding: '7px 10px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                  onClick={() => {
                    setFilterItemId(String(item.id));
                    setFilterItemSearch(`${item.item_code} — ${item.variant_grade || item.sub_category_name}`);
                    setItemSuggestions([]);
                  }}
                >
                  {item.item_code} — {item.variant_grade || item.sub_category_name}
                </div>
              ))}
            </div>
          )}
        </div>

        <label style={s.label}>From</label>
        <input
          type="date" style={{ ...s.input, width: '140px', display: 'inline-block' }}
          value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
        />
        <label style={s.label}>To</label>
        <input
          type="date" style={{ ...s.input, width: '140px', display: 'inline-block' }}
          value={filterTo} onChange={e => setFilterTo(e.target.value)}
        />
        <label style={s.label}>Reason</label>
        <select
          style={{ ...s.select, width: '150px', display: 'inline-block' }}
          value={filterReason} onChange={e => setFilterReason(e.target.value)}
        >
          <option value="">All</option>
          {REASON_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button style={s.btn} onClick={handleSearch}>Search</button>
        <button style={s.btnSecondary} onClick={clearFilters}>Clear</button>
      </div>

      {error && <div style={s.error}>{error}</div>}
      {loading && <div style={s.loading}>Loading...</div>}

      {!loading && !error && (
        <div style={s.card}>
          {rows.length === 0
            ? <div style={s.empty}>No transfer records found.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Item Code</th>
                      <th style={s.th}>Item Name</th>
                      <th style={s.th}>Batch</th>
                      <th style={s.th}>Qty</th>
                      <th style={s.th}>Reason</th>
                      <th style={s.th}>Reference No</th>
                      <th style={s.th}>Notes</th>
                      <th style={s.th}>Created By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const tdStyle = i % 2 === 0 ? s.td : s.tdAlt;
                      const numQty = parseFloat(r.qty);
                      return (
                        <tr key={r.id}>
                          <td style={tdStyle}>{fmtDateTime(r.created_at)}</td>
                          <td style={tdStyle}>
                            <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{r.item_code}</span>
                          </td>
                          <td style={tdStyle}>{r.item_name || '-'}</td>
                          <td style={tdStyle}>#{r.batch_id}</td>
                          <td style={tdStyle}>
                            <span style={{ fontWeight: '600', color: numQty >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {numQty >= 0 ? '+' : ''}{numQty.toFixed(2)}
                            </span>
                          </td>
                          <td style={tdStyle}><ReasonBadge reason={r.reason} /></td>
                          <td style={tdStyle}>{r.reference_no || '-'}</td>
                          <td style={tdStyle}>{r.notes || '-'}</td>
                          <td style={tdStyle}>{r.created_by_name || '-'}</td>
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

      {/* Pagination */}
      {!loading && pagination.pages > 1 && (
        <div style={s.paginationBar}>
          <span style={s.pageInfo}>
            Page {page} of {pagination.pages} ({pagination.total} total)
          </span>
          <button
            style={s.btnSecondary}
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            style={s.btnSecondary}
            disabled={page >= pagination.pages}
            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----
const TABS = [
  { key: 'new', label: 'New Transfer' },
  { key: 'history', label: 'History' }
];

export default function StockTransfer() {
  const [tab, setTab] = useState('new');

  return (
    <div style={s.page}>
      <Nav />
      <div style={s.content}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-1)', margin: 0 }}>Stock Transfers</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', margin: '4px 0 0' }}>Record and review manual stock adjustments</p>
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
        {tab === 'new' && <NewTransferTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}
