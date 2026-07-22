import React, { useState, useEffect, useCallback } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';

const s = {
  page:    { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  card: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px',
    boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px'
  },
  filterBar: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' },
  label: { fontSize: '13px', color: 'var(--text-2)', fontWeight: '500' },
  input: {
    padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
    fontSize: '13px', color: 'var(--text-1)', background: 'var(--surface)', outline: 'none'
  },
  btn: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none',
    background: 'var(--primary)', color: '#fff', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600'
  },
  btnSecondary: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)',
    background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px'
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left',
    fontWeight: '600', fontSize: '11px', color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
  },
  td:    { padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  tdAlt: { padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', verticalAlign: 'middle' },
  error:   { color: 'var(--danger)', padding: '12px', background: 'var(--danger-dim)', borderRadius: 'var(--radius)', fontSize: '13px', border: '1px solid var(--danger)', marginBottom: '12px' },
  loading: { color: 'var(--text-3)', padding: '12px', fontSize: '13px' },
  empty:   { padding: '48px', textAlign: 'center', color: 'var(--text-4)', fontSize: '13px' },
  summaryCards: { display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' },
  summaryCard: {
    flex: '1 1 160px', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)'
  },
  summaryLabel: { fontSize: '12px', color: 'var(--text-3)', fontWeight: '500', marginBottom: '6px' },
  summaryValue: { fontSize: '22px', fontWeight: '700', color: 'var(--text-1)' },
};

function fmt(num) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
}

function fmtDate(d) {
  if (!d) return '-';
  return String(d).slice(0, 10);
}

function batchStatus(b) {
  if (b.expiredAt || (b.expiryDate && new Date(b.expiryDate) < new Date())) {
    return { label: 'Expired', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  }
  if (b.qtyRemaining <= 0) {
    return { label: 'Depleted', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
  }
  if (b.qtyReceived > 0 && b.qtyRemaining < b.qtyReceived * 0.1) {
    return { label: 'Low', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
  }
  return { label: 'Active', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' };
}

function StatusBadge({ batch }) {
  const st = batchStatus(batch);
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
      fontSize: '12px', fontWeight: '600',
      color: st.color, background: st.bg, border: `1px solid ${st.border}`
    }}>
      {st.label}
    </span>
  );
}

function RiskBadge({ score }) {
  const n = parseInt(score) || 0;
  const color = n >= 61 ? '#dc2626' : n >= 31 ? '#b45309' : '#15803d';
  const bg = n >= 61 ? '#fef2f2' : n >= 31 ? '#fffbeb' : '#f0fdf4';
  const border = n >= 61 ? '#fecaca' : n >= 31 ? '#fde68a' : '#bbf7d0';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
      fontSize: '12px', fontWeight: '600', color, background: bg,
      border: `1px solid ${border}`
    }}>
      {n}
    </span>
  );
}

function downloadCSV(batches, itemCode) {
  const headers = ['Batch ID', 'Receipt Date', 'Expiry Date', 'Qty Received', 'Qty Remaining', 'Risk Score', 'Status'];
  const rows = batches.map(b => [
    b.id,
    fmtDate(b.receiptDate),
    fmtDate(b.expiryDate),
    b.qtyReceived,
    b.qtyRemaining,
    b.riskScore,
    batchStatus(b).label
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `batches-${itemCode || 'export'}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BatchViewer() {
  const [items, setItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [includeEmpty, setIncludeEmpty] = useState(true);
  const [batches, setBatches] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Load items for search
  useEffect(() => {
    setLoadingItems(true);
    client.get('/items?active=all')
      .then(r => setItems(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoadingItems(false));
  }, []);

  const filteredItems = items.filter(it => {
    if (!itemSearch) return true;
    const q = itemSearch.toLowerCase();
    return (
      (it.item_code || '').toLowerCase().includes(q) ||
      (it.sub_category_name || '').toLowerCase().includes(q) ||
      (it.variant_grade || '').toLowerCase().includes(q)
    );
  });

  const loadBatches = useCallback(async (item) => {
    if (!item) return;
    setLoadingBatches(true);
    setError('');
    setBatches([]);
    try {
      const res = await client.get(`/batches?itemId=${item.id}&includeEmpty=${includeEmpty}`);
      setBatches(res.data.data || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load batches');
    } finally {
      setLoadingBatches(false);
    }
  }, [includeEmpty]);

  useEffect(() => {
    if (selectedItem) loadBatches(selectedItem);
  }, [selectedItem, includeEmpty, loadBatches]);

  function selectItem(item) {
    setSelectedItem(item);
    setItemSearch(`${item.item_code} — ${item.sub_category_name}`);
    setShowDropdown(false);
  }

  // Summary stats
  const totalReceived = batches.reduce((sum, b) => sum + b.qtyReceived, 0);
  const totalRemaining = batches.reduce((sum, b) => sum + b.qtyRemaining, 0);
  const activeCount = batches.filter(b => batchStatus(b).label === 'Active').length;
  const expiredCount = batches.filter(b => batchStatus(b).label === 'Expired').length;

  return (
    <div style={s.page}>
      <Nav />
      <div style={s.content}>
        {/* Search & filter bar */}
        <div style={s.card}>
          <div style={s.filterBar}>
            <label style={s.label}>Item</label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...s.input, width: '280px' }}
                placeholder="Search by item code or name..."
                value={itemSearch}
                onChange={e => {
                  setItemSearch(e.target.value);
                  setShowDropdown(true);
                  if (!e.target.value) setSelectedItem(null);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
              />
              {showDropdown && filteredItems.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  background: 'var(--surface)', border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius)', maxHeight: '220px', overflowY: 'auto',
                  boxShadow: 'var(--shadow-lg)'
                }}>
                  {filteredItems.slice(0, 40).map(it => (
                    <div
                      key={it.id}
                      onMouseDown={() => selectItem(it)}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                        borderBottom: '1px solid var(--border)',
                        background: selectedItem?.id === it.id ? 'var(--primary-dim)' : 'transparent'
                      }}
                    >
                      <span style={{ fontWeight: '600', color: 'var(--text-1)' }}>{it.item_code}</span>
                      <span style={{ color: 'var(--text-3)', marginLeft: '8px' }}>{it.sub_category_name}</span>
                      {it.variant_grade && (
                        <span style={{ color: 'var(--text-4)', marginLeft: '6px', fontSize: '12px' }}>
                          ({it.variant_grade})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label style={{ ...s.label, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeEmpty}
                onChange={e => setIncludeEmpty(e.target.checked)}
              />
              Include depleted batches
            </label>
            {selectedItem && (
              <button style={s.btn} onClick={() => loadBatches(selectedItem)}>
                Refresh
              </button>
            )}
            {selectedItem && batches.length > 0 && (
              <button style={s.btnSecondary} onClick={() => downloadCSV(batches, selectedItem.item_code)}>
                Export CSV
              </button>
            )}
          </div>
          {loadingItems && <div style={s.loading}>Loading items...</div>}
        </div>

        {/* Summary cards — only show when item selected */}
        {selectedItem && !loadingBatches && batches.length > 0 && (
          <div style={s.summaryCards}>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Total Batches</div>
              <div style={s.summaryValue}>{batches.length}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Active Batches</div>
              <div style={{ ...s.summaryValue, color: 'var(--success)' }}>{activeCount}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Expired Batches</div>
              <div style={{ ...s.summaryValue, color: expiredCount > 0 ? 'var(--danger)' : 'var(--text-1)' }}>
                {expiredCount}
              </div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Total Received (kg)</div>
              <div style={s.summaryValue}>{fmt(totalReceived)}</div>
            </div>
            <div style={s.summaryCard}>
              <div style={s.summaryLabel}>Total Remaining (kg)</div>
              <div style={{ ...s.summaryValue, color: 'var(--success)' }}>{fmt(totalRemaining)}</div>
            </div>
          </div>
        )}

        {/* Batches table */}
        {error && <div style={s.error}>{error}</div>}
        {loadingBatches && <div style={s.loading}>Loading batches...</div>}
        {!loadingBatches && selectedItem && !error && (
          <div style={s.card}>
            {batches.length === 0
              ? <div style={s.empty}>No batches found for {selectedItem.item_code}.</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ marginBottom: '10px', fontSize: '13px', color: 'var(--text-3)' }}>
                    Showing <strong>{batches.length}</strong> batch{batches.length !== 1 ? 'es' : ''} for{' '}
                    <strong>{selectedItem.item_code}</strong>
                    {selectedItem.sub_category_name && ` — ${selectedItem.sub_category_name}`}
                  </div>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Batch ID</th>
                        <th style={s.th}>Receipt Date</th>
                        <th style={s.th}>Expiry Date</th>
                        <th style={s.th}>Qty Received (kg)</th>
                        <th style={s.th}>Qty Remaining (kg)</th>
                        <th style={s.th}>Risk Score</th>
                        <th style={s.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((b, i) => (
                        <tr key={b.id}>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{b.id}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmtDate(b.receiptDate)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>
                            {b.expiryDate ? (
                              <span style={{
                                color: new Date(b.expiryDate) < new Date() ? 'var(--danger)' : 'var(--text-2)'
                              }}>
                                {fmtDate(b.expiryDate)}
                              </span>
                            ) : '-'}
                          </td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(b.qtyReceived)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}>{fmt(b.qtyRemaining)}</td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}><RiskBadge score={b.riskScore} /></td>
                          <td style={i % 2 === 0 ? s.td : s.tdAlt}><StatusBadge batch={b} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}
        {!selectedItem && !loadingItems && (
          <div style={{ ...s.card, textAlign: 'center', color: 'var(--text-4)', padding: '40px' }}>
            Select an item above to view its batches.
          </div>
        )}
      </div>
    </div>
  );
}
