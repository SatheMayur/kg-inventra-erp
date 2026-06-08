import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import Nav from '../components/Nav';
import ItemForm from '../components/ItemForm';
import { safeUser } from '../lib/safeUser';
import { getItemIcon } from '../lib/itemImage';
import FoodPhoto from '../components/FoodPhoto';

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px', maxWidth: '1100px', margin: '0 auto' },
  backLink: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    color: 'var(--primary)', fontSize: '14px', cursor: 'pointer',
    background: 'none', border: 'none', padding: 0, marginBottom: '16px',
    fontWeight: '600'
  },
  headerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '20px', flexWrap: 'wrap', gap: '12px'
  },
  titleBlock: {},
  h1: { margin: 0, fontSize: '22px', color: 'var(--text-1)', fontWeight: '700' },
  subtitle: { margin: '4px 0 0', fontSize: '14px', color: 'var(--text-3)' },
  actionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
  btn: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)',
    cursor: 'pointer', fontSize: '13px', background: 'var(--surface)', color: 'var(--text-2)', fontWeight: '600'
  },
  btnPrimary: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none',
    cursor: 'pointer', fontSize: '13px', background: 'var(--primary)',
    color: '#fff', fontWeight: '600'
  },
  btnDanger: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid #ffa39e',
    cursor: 'pointer', fontSize: '13px', background: 'var(--surface)', color: '#cf1322', fontWeight: '600'
  },
  btnWarning: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid #ffd591',
    cursor: 'pointer', fontSize: '13px', background: 'var(--surface)', color: '#d46b08', fontWeight: '600'
  },
  tabs: {
    display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '20px'
  },
  tab: {
    padding: '10px 20px', cursor: 'pointer', fontSize: '14px',
    border: 'none', background: 'none', fontWeight: '600', color: 'var(--text-3)',
    borderBottom: '2px solid transparent', marginBottom: '-2px'
  },
  tabActive: {
    padding: '10px 20px', cursor: 'pointer', fontSize: '14px',
    border: 'none', background: 'none', fontWeight: '700', color: 'var(--primary)',
    borderBottom: '2px solid var(--primary)', marginBottom: '-2px'
  },
  card: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', padding: '20px', marginBottom: '16px'
  },
  cardTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--primary)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' },
  field: { marginBottom: '12px' },
  fieldLabel: { fontSize: '11px', fontWeight: '600', color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' },
  fieldValue: { fontSize: '14px', color: 'var(--text-1)' },
  badge: { display: 'inline-block', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: '600' },
  badgeGreen: { background: '#f6ffed', color: '#389e0d', border: '1px solid #b7eb8f' },
  badgeGray: { background: '#f5f5f5', color: '#8c8c8c', border: '1px solid #d9d9d9' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' },
  statCard: {
    background: 'var(--primary-dim)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '12px 16px', textAlign: 'center'
  },
  statVal: { fontSize: '22px', fontWeight: '700', color: 'var(--primary)', display: 'block' },
  statLbl: { fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: {
    background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left',
    fontWeight: '700', color: 'var(--text-3)', fontSize: '11px', textTransform: 'uppercase',
    letterSpacing: '0.4px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
  },
  td: { padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  tdTotal: { padding: '10px 14px', borderTop: '2px solid var(--border)', color: 'var(--text-1)', fontWeight: '700', background: 'var(--surface-2)' },
  empty: { padding: '40px', textAlign: 'center', color: 'var(--text-4)' },
  progressBar: { height: '8px', borderRadius: '4px', background: 'var(--surface-2)', overflow: 'hidden', minWidth: '80px' },
  progressFill: { height: '100%', borderRadius: '4px', transition: 'width 0.3s' },
  jsonBlock: {
    background: 'var(--surface-2)', borderRadius: 'var(--radius)', padding: '6px 10px',
    fontSize: '12px', fontFamily: 'monospace', maxWidth: '300px',
    wordBreak: 'break-all', whiteSpace: 'pre-wrap'
  },
  codeCell: { fontFamily: 'monospace', fontSize: '12px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '3px' },
  preferred: { color: '#faad14', marginRight: '4px' },
  modal: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000
  },
  modalBox: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px',
    width: '420px', boxShadow: 'var(--shadow-lg)'
  },
  modalTitle: { fontSize: '17px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '18px' },
  input: {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px',
    color: 'var(--text-1)', background: 'var(--surface)'
  },
  label: {
    display: 'block', fontSize: '12px', fontWeight: '600',
    color: 'var(--text-2)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px'
  },
  select: {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)', fontSize: '14px', boxSizing: 'border-box',
    background: 'var(--surface)', color: 'var(--text-1)', marginBottom: '12px'
  },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' },
  error: {
    background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)',
    padding: '8px 12px', color: 'var(--danger)', fontSize: '13px', marginBottom: '12px'
  }
};

function batchStatusColor(expiry) {
  if (!expiry) return { background: '#f0f0f0', color: '#8c8c8c' };
  const days = Math.ceil((new Date(expiry) - new Date()) / 86400000);
  if (days <= 0) return { background: '#fff1f0', color: '#cf1322' };
  if (days <= 7) return { background: '#fff1f0', color: '#cf1322' };
  if (days <= 30) return { background: '#fff7e6', color: '#d46b08' };
  return { background: '#f6ffed', color: '#389e0d' };
}

function batchStatusText(expiry) {
  if (!expiry) return 'No expiry';
  const days = Math.ceil((new Date(expiry) - new Date()) / 86400000);
  if (days <= 0) return 'Expired';
  if (days <= 7) return `${days}d left`;
  if (days <= 30) return `${days}d left`;
  return `${days}d left`;
}

function riskColor(score) {
  if (score >= 70) return '#cf1322';
  if (score >= 40) return '#d46b08';
  return '#389e0d';
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN');
}

// ---- Vendor Price Modal ----
function VendorPriceModal({ vendors, onClose, onSave }) {
  const [vendorId, setVendorId] = useState('');
  const [vendorSku, setVendorSku] = useState('');
  const [rate, setRate] = useState('');
  const [leadTime, setLeadTime] = useState(7);
  const [isPreferred, setIsPreferred] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    if (!vendorId) { setErr('Select a vendor'); return; }
    setSaving(true);
    try {
      await onSave({ vendor_id: parseInt(vendorId), vendor_sku: vendorSku, purchase_rate: parseFloat(rate) || null, lead_time_days: parseInt(leadTime) || 7, is_preferred: isPreferred });
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.modal} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modalBox}>
        <div style={S.modalTitle}>Add Vendor Price</div>
        {err && <div style={S.error}>{err}</div>}
        <form onSubmit={handleSave}>
          <label style={S.label}>Vendor *</label>
          <select style={S.select} value={vendorId} onChange={e => setVendorId(e.target.value)} required>
            <option value="">Select vendor</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <label style={S.label}>Vendor SKU</label>
          <input style={S.input} value={vendorSku} onChange={e => setVendorSku(e.target.value)} placeholder="Vendor's product code" />
          <label style={S.label}>Purchase Rate</label>
          <input style={S.input} type="number" step="0.01" min="0" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" />
          <label style={S.label}>Lead Time (days)</label>
          <input style={S.input} type="number" min="1" value={leadTime} onChange={e => setLeadTime(e.target.value)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <input type="checkbox" id="preferred" checked={isPreferred} onChange={e => setIsPreferred(e.target.checked)} />
            <label htmlFor="preferred" style={{ fontSize: '14px', cursor: 'pointer' }}>Mark as preferred vendor</label>
          </div>
          <div style={S.modalFooter}>
            <button type="button" style={{ ...S.btn }} onClick={onClose}>Cancel</button>
            <button type="submit" style={S.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Tab: Overview ----
function OverviewTab({ item, categories, user, onEdit, onToggleActive, loading }) {
  const stockInfo = {
    totalKg: parseFloat(item.live_stock_kg) || 0
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={S.card}>
          <div style={S.cardTitle}>Identification</div>
          <div style={S.twoCol}>
            <div style={S.field}>
              <div style={S.fieldLabel}>Item Code</div>
              <div style={S.fieldValue}><span style={S.codeCell}>{item.item_code}</span></div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Barcode</div>
              <div style={S.fieldValue}><span style={{ ...S.codeCell, fontSize: '11px' }}>{item.barcode}</span></div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Category</div>
              <div style={S.fieldValue}>{item.category_name || '—'}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Sub-Category</div>
              <div style={S.fieldValue}>{item.sub_category_name || '—'}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Unit</div>
              <div style={S.fieldValue}>{item.unit}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Pack Size</div>
              <div style={S.fieldValue}>{item.pack_size || '—'}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Storage Location</div>
              <div style={S.fieldValue}>{item.storage_location || '—'}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Status</div>
              <div style={S.fieldValue}>
                <span style={{ ...S.badge, ...(item.is_active !== false ? S.badgeGreen : S.badgeGray) }}>
                  {item.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Location</div>
              <div style={S.fieldValue}>{item.location_name || '—'}</div>
            </div>
            <div style={{ ...S.field, gridColumn: '1 / -1' }}>
              <div style={S.fieldLabel}>Tags</div>
              <div style={S.fieldValue}>
                {(item.tags && item.tags.length > 0) ? item.tags.map(tag => (
                  <span
                    key={tag.id}
                    style={{
                      background: '#e6f7ff', color: '#096dd9', border: '1px solid #91d5ff',
                      borderRadius: '10px', padding: '1px 8px', fontSize: '12px', marginRight: '4px',
                      display: 'inline-block'
                    }}
                  >
                    {tag.name}
                  </span>
                )) : '—'}
              </div>
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Pricing & Tax</div>
          <div style={S.twoCol}>
            <div style={S.field}>
              <div style={S.fieldLabel}>Purchase Rate</div>
              <div style={S.fieldValue}>{item.purchase_rate ? `Rs. ${parseFloat(item.purchase_rate).toFixed(2)}` : '—'}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>MRP</div>
              <div style={S.fieldValue}>{item.mrp ? `Rs. ${parseFloat(item.mrp).toFixed(2)}` : '—'}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>GST Rate</div>
              <div style={S.fieldValue}>{item.gst_rate !== undefined ? `${item.gst_rate}%` : '—'}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>HSN Code</div>
              <div style={S.fieldValue}>{item.hsn_code || '—'}</div>
            </div>
            <div style={S.field}>
              <div style={S.fieldLabel}>Variant / Grade</div>
              <div style={S.fieldValue}>{item.variant_grade || '—'}</div>
            </div>
          </div>
          {item.description && (
            <div style={{ ...S.field, marginTop: '8px' }}>
              <div style={S.fieldLabel}>Description</div>
              <div style={{ ...S.fieldValue, color: '#555', lineHeight: '1.5' }}>{item.description}</div>
            </div>
          )}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Replenishment Parameters</div>
        <div style={S.statsRow}>
          <div style={S.statCard}>
            <span style={S.statVal}>{parseFloat(item.avg_daily_consumption || 0).toFixed(1)}</span>
            <div style={S.statLbl}>Avg Daily ({item.unit}/day)</div>
          </div>
          <div style={S.statCard}>
            <span style={S.statVal}>{item.lead_time_days || 7}</span>
            <div style={S.statLbl}>Lead Time (days)</div>
          </div>
          <div style={S.statCard}>
            <span style={S.statVal}>{item.demand_variability_pct || 20}%</span>
            <div style={S.statLbl}>Demand Variability</div>
          </div>
          <div style={S.statCard}>
            <span style={S.statVal}>{parseFloat(item.rop_kg || 0).toFixed(1)}</span>
            <div style={S.statLbl}>ROP ({item.unit})</div>
          </div>
          <div style={S.statCard}>
            <span style={S.statVal}>{parseFloat(item.reorder_qty || 0).toFixed(1)}</span>
            <div style={S.statLbl}>Reorder Qty ({item.unit})</div>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Live Stock Summary</div>
        <div style={S.statsRow}>
          <div style={{ ...S.statCard, background: stockInfo.totalKg > 0 ? '#f6ffed' : '#fff1f0', border: stockInfo.totalKg > 0 ? '1px solid #b7eb8f' : '1px solid #ffa39e' }}>
            <span style={{ ...S.statVal, color: stockInfo.totalKg > 0 ? '#389e0d' : '#cf1322' }}>
              {stockInfo.totalKg.toFixed(2)}
            </span>
            <div style={S.statLbl}>Total Stock ({item.unit})</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Tab: Stock Batches ----
function BatchesTab({ batches, item, loading }) {
  if (loading) return <div style={S.empty}>Loading...</div>;
  const activeBatches = batches.filter(b => parseFloat(b.qty_remaining) > 0);
  const totalRemaining = activeBatches.reduce((s, b) => s + parseFloat(b.qty_remaining || 0), 0);
  const nearest = activeBatches
    .filter(b => b.expiry_date)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))[0];

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={S.cardTitle}>Stock Batches</div>
        {nearest && (
          <div style={{ fontSize: '13px', color: '#666' }}>
            Nearest expiry: <strong style={{ color: batchStatusColor(nearest.expiry_date).color }}>{fmtDate(nearest.expiry_date)}</strong>
          </div>
        )}
      </div>
      {batches.length === 0 ? (
        <div style={S.empty}>No batches found for this item</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Batch ID</th>
                <th style={S.th}>Receipt Date</th>
                <th style={S.th}>Expiry Date</th>
                <th style={S.th}>Qty Received</th>
                <th style={S.th}>Qty Remaining</th>
                <th style={S.th}>Risk Score</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => {
                const statusColor = batchStatusColor(b.expiry_date);
                const risk = parseInt(b.risk_score) || 0;
                return (
                  <tr key={b.id}>
                    <td style={S.td}><span style={S.codeCell}>#{b.id}</span></td>
                    <td style={S.td}>{fmtDate(b.receipt_date)}</td>
                    <td style={S.td}>{fmtDate(b.expiry_date)}</td>
                    <td style={S.td}>{parseFloat(b.qty_received || 0).toFixed(2)} {item.unit}</td>
                    <td style={S.td}><strong>{parseFloat(b.qty_remaining || 0).toFixed(2)}</strong> {item.unit}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={S.progressBar}>
                          <div style={{ ...S.progressFill, width: `${risk}%`, background: riskColor(risk) }} />
                        </div>
                        <span style={{ fontSize: '12px', color: riskColor(risk), fontWeight: '600' }}>{risk}</span>
                      </div>
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.badge, ...statusColor }}>
                        {batchStatusText(b.expiry_date)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td style={S.tdTotal} colSpan={4}>Total</td>
                <td style={S.tdTotal}>{totalRemaining.toFixed(2)} {item.unit}</td>
                <td style={S.tdTotal} colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Tab: Vendor Prices ----
function VendorsTab({ itemId, item, user }) {
  const [vendors, setVendors] = useState([]);
  const [allVendors, setAllVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState('');

  const canWrite = ['admin', 'purchase'].includes(user.role);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get(`/items/${itemId}/vendors`);
      setVendors(res.data.data || []);
    } catch (e) {
      setErr('Failed to load vendor prices');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchVendors();
    client.get('/vendors').then(r => setAllVendors(r.data.data || [])).catch(() => {});
  }, [fetchVendors]);

  async function handleSave(payload) {
    await client.post(`/items/${itemId}/vendors`, payload);
    fetchVendors();
  }

  async function handleDelete(vendorId) {
    if (!window.confirm('Remove this vendor price mapping?')) return;
    try {
      await client.delete(`/items/${itemId}/vendors/${vendorId}`);
      fetchVendors();
    } catch (e) {
      setErr(e.response?.data?.error || 'Delete failed');
    }
  }

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={S.cardTitle}>Vendor Prices</div>
        {canWrite && (
          <button style={S.btnPrimary} onClick={() => setShowModal(true)}>+ Add Vendor Price</button>
        )}
      </div>
      {err && <div style={S.error}>{err}</div>}
      {loading ? (
        <div style={S.empty}>Loading...</div>
      ) : vendors.length === 0 ? (
        <div style={S.empty}>No vendor prices configured for this item</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Vendor</th>
                <th style={S.th}>Vendor SKU</th>
                <th style={S.th}>Purchase Rate</th>
                <th style={S.th}>Lead Time</th>
                <th style={S.th}>Preferred</th>
                {user.role === 'admin' && <th style={S.th}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id}>
                  <td style={S.td}>
                    {v.is_preferred && <span style={S.preferred}>&#9733;</span>}
                    {v.vendor_name}
                  </td>
                  <td style={S.td}>{v.vendor_sku || '—'}</td>
                  <td style={S.td}>{v.purchase_rate ? `Rs. ${parseFloat(v.purchase_rate).toFixed(2)}` : '—'}</td>
                  <td style={S.td}>{v.lead_time_days} days</td>
                  <td style={S.td}>
                    {v.is_preferred
                      ? <span style={{ ...S.badge, background: '#fffbe6', color: '#d48806', border: '1px solid #ffe58f' }}>Preferred</span>
                      : <span style={{ ...S.badge, ...S.badgeGray }}>—</span>
                    }
                  </td>
                  {user.role === 'admin' && (
                    <td style={S.td}>
                      <button style={{ ...S.btn, color: '#cf1322', borderColor: '#ffa39e', fontSize: '12px', padding: '4px 10px' }}
                        onClick={() => handleDelete(v.vendor_id)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <VendorPriceModal
          vendors={allVendors}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ---- Tab: Audit History ----
function HistoryTab({ itemId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    client.get(`/items/${itemId}/history`)
      .then(r => setLogs(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [itemId]);

  if (loading) return <div style={S.empty}>Loading...</div>;

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Audit History</div>
      {logs.length === 0 ? (
        <div style={S.empty}>No audit records found</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Date / Time</th>
                <th style={S.th}>User</th>
                <th style={S.th}>Action</th>
                <th style={S.th}>Changed Fields</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 50).map(log => (
                <tr key={log.id}>
                  <td style={S.td}>{fmtDateTime(log.created_at)}</td>
                  <td style={S.td}>{log.user_name || '—'}</td>
                  <td style={S.td}>
                    <span style={{
                      ...S.badge,
                      background: log.action === 'INSERT' ? '#e6f7ff' : log.action === 'DELETE' ? '#fff1f0' : '#fff7e6',
                      color: log.action === 'INSERT' ? '#096dd9' : log.action === 'DELETE' ? '#cf1322' : '#d46b08',
                      border: '1px solid transparent'
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={S.td}>
                    {log.changed_fields ? (
                      <div style={S.jsonBlock}>
                        {typeof log.changed_fields === 'string'
                          ? log.changed_fields
                          : JSON.stringify(log.changed_fields, null, 2)}
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Item cover photo (header) ----
function ItemCoverPhoto({ item }) {
  const hasCustom = !!item?.item_image_url;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <FoodPhoto item={item} size={88} radius={14} />
      {hasCustom && (
        <div title="Custom photo set" style={{
          position: 'absolute', bottom: '4px', right: '4px',
          background: 'var(--success)', color: '#fff', borderRadius: '50%',
          width: '16px', height: '16px', fontSize: '9px', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontWeight: '700'
        }}>✓</div>
      )}
    </div>
  );
}

// ---- Tab: Aliases ----
function AliasesTab({ itemId, item, user, fetchItem }) {
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const canWrite = ['admin', 'purchase', 'warehouse'].includes(user.role);

  function load() {
    setLoading(true);
    client.get(`/items/${itemId}/aliases`)
      .then(r => setAliases(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [itemId]);

  async function handleAdd() {
    if (!newBarcode.trim()) { setErr('Barcode is required'); return; }
    setSaving(true); setErr(''); setOk('');
    try {
      await client.post(`/items/${itemId}/aliases`, { alias_barcode: newBarcode.trim(), alias_name: newName.trim() || null });
      setNewBarcode(''); setNewName('');
      setOk('Alias registered.');
      load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleDelete(aliasId) {
    if (!window.confirm('Remove this alias barcode?')) return;
    try {
      await client.delete(`/items/${itemId}/aliases/${aliasId}`);
      load();
    } catch (e) { setErr(e.response?.data?.error || 'Delete failed'); }
  }

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Alternate Barcodes / Aliases</div>
      {loading ? <div style={S.empty}>Loading...</div> : aliases.length === 0 ? (
        <div style={S.empty}>No alias barcodes registered</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Alias Barcode</th>
                <th style={S.th}>Label / Name</th>
                <th style={S.th}>Created</th>
                {user.role === 'admin' && <th style={S.th}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {aliases.map(a => (
                <tr key={a.id}>
                  <td style={S.td}><span style={S.codeCell}>{a.alias_barcode}</span></td>
                  <td style={S.td}>{a.alias_name || '—'}</td>
                  <td style={S.td}>{a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN') : '—'}</td>
                  {user.role === 'admin' && (
                    <td style={S.td}>
                      <button style={{ ...S.btn, color: '#cf1322', borderColor: '#ffa39e', fontSize: '12px', padding: '3px 10px' }}
                        onClick={() => handleDelete(a.id)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
          <div style={S.cardTitle}>Register New Alias</div>
          {err && <div style={S.error}>{err}</div>}
          {ok && <div style={{ ...S.error, background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)', marginBottom: '12px' }}>{ok}</div>}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={S.label}>Barcode *</label>
              <input style={{ ...S.input, marginBottom: 0 }} value={newBarcode} onChange={e => setNewBarcode(e.target.value)} placeholder="Vendor/MRP barcode" />
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={S.label}>Label (optional)</label>
              <input style={{ ...S.input, marginBottom: 0 }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Vendor SKU" />
            </div>
            <button style={S.btnPrimary} onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Register'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Tab: Photos ----
function PhotosTab({ itemId, item, user, fetchItem }) {
  const [photos, setPhotos] = useState(item.photos || []);
  const [uploading, setUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoLabel, setPhotoLabel] = useState('');
  const [error, setError] = useState('');
  const [coverUrl, setCoverUrl] = useState(item.item_image_url || '');
  const [previewUrl, setPreviewUrl] = useState(item.item_image_url || '');
  const [previewErr, setPreviewErr] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [coverMsg, setCoverMsg] = useState({ type: '', text: '' });

  const canManage = ['admin', 'purchase'].includes(user.role);
  const icon = getItemIcon(item);

  function handleCoverInput(val) {
    setCoverUrl(val);
    setPreviewErr(false);
    setPreviewUrl(val);
    setCoverMsg({ type: '', text: '' });
  }

  async function saveCoverUrl() {
    if (previewErr) { setCoverMsg({ type: 'error', text: 'URL failed to load — verify the link is a valid image' }); return; }
    setSavingCover(true); setCoverMsg({ type: '', text: '' });
    try {
      await client.put(`/items/${itemId}`, { item_image_url: coverUrl.trim() || null });
      setCoverMsg({ type: 'success', text: 'Cover image saved.' });
      fetchItem();
    } catch (e) {
      setCoverMsg({ type: 'error', text: e.response?.data?.error || 'Save failed' });
    } finally { setSavingCover(false); }
  }

  async function removeCover() {
    if (!window.confirm('Remove the cover image? The category icon will show instead.')) return;
    try {
      await client.put(`/items/${itemId}`, { item_image_url: null });
      setCoverUrl(''); setPreviewUrl('');
      setCoverMsg({ type: 'success', text: 'Cover image removed.' });
      fetchItem();
    } catch (e) {
      setCoverMsg({ type: 'error', text: e.response?.data?.error || 'Remove failed' });
    }
  }

  useEffect(() => {
    setPhotos(item.photos || []);
  }, [item.photos]);

  async function handleUpload() {
    if (!photoFile) { setError('Select a photo first'); return; }
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('photo', photoFile);
      if (photoLabel) fd.append('label', photoLabel);
      const token = localStorage.getItem('fg_token');
      const res = await fetch(`/api/items/${itemId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (!res.ok) throw new Error('Upload failed');
      setPhotoFile(null);
      setPhotoLabel('');
      fetchItem();
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photoId) {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await client.delete(`/items/${itemId}/photos/${photoId}`);
      fetchItem();
    } catch (e) {
      setError(e.response?.data?.error || 'Delete failed');
    }
  }

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Photos</div>

      {/* ── Cover Image Manager ── */}
      {canManage && (
        <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '14px' }}>Cover Image</div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Preview panel */}
            <div style={{ flexShrink: 0 }}>
              {previewUrl && !previewErr ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '12px', border: '2px solid var(--border)', display: 'block' }}
                  onError={() => setPreviewErr(true)}
                />
              ) : (
                <div style={{
                  width: '120px', height: '120px', borderRadius: '12px', border: '2px dashed var(--border-strong)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: icon.bg, gap: '4px'
                }}>
                  <span style={{ fontSize: '40px' }}>{icon.emoji}</span>
                  {previewErr
                    ? <span style={{ fontSize: '10px', color: 'var(--danger)', fontWeight: '600', textAlign: 'center', padding: '0 4px' }}>Invalid URL</span>
                    : <span style={{ fontSize: '10px', color: 'var(--text-4)', textAlign: 'center' }}>Category icon</span>
                  }
                </div>
              )}
              {previewUrl && !previewErr && (
                <div style={{ fontSize: '10px', color: 'var(--success)', fontWeight: '600', marginTop: '5px', textAlign: 'center' }}>✓ Preview OK</div>
              )}
            </div>

            {/* URL input + actions */}
            <div style={{ flex: 1, minWidth: '240px' }}>
              <label style={S.label}>Image URL</label>
              <input
                style={{ ...S.input, marginBottom: '8px' }}
                value={coverUrl}
                onChange={e => handleCoverInput(e.target.value)}
                placeholder="Paste image URL — jpg, png, webp"
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button style={S.btnPrimary} onClick={saveCoverUrl} disabled={savingCover || (!coverUrl.trim())}>
                  {savingCover ? 'Saving...' : 'Save Cover Image'}
                </button>
                {item.item_image_url && (
                  <button style={{ ...S.btn, color: '#cf1322', borderColor: '#ffa39e' }} onClick={removeCover}>
                    Remove
                  </button>
                )}
              </div>
              {coverMsg.text && (
                <div style={{
                  fontSize: '12px', marginTop: '8px', padding: '6px 10px', borderRadius: 'var(--radius)',
                  background: coverMsg.type === 'success' ? 'var(--success-dim)' : 'var(--danger-dim)',
                  color: coverMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                  border: `1px solid ${coverMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                }}>
                  {coverMsg.text}
                </div>
              )}
              <p style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '8px' }}>
                Paste a direct image link. The preview above confirms the URL loads correctly before saving.
                If no custom image is set, the category icon shows automatically.
              </p>
            </div>
          </div>
        </div>
      )}
      {error && <div style={S.error}>{error}</div>}
      {photos.length === 0 ? (
        <div style={S.empty}>No photos uploaded yet</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          {photos.map(photo => (
            <div key={photo.id} style={{ width: 'calc(33.33% - 12px)', minWidth: '160px' }}>
              <img
                src={photo.storage_url}
                alt={photo.label || 'Item photo'}
                style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '4px' }}
              />
              {photo.label && (
                <div style={{ fontSize: '12px', color: '#555', marginTop: '4px', textAlign: 'center' }}>{photo.label}</div>
              )}
              {user.role === 'admin' && (
                <button
                  style={{ ...S.btn, color: '#cf1322', borderColor: '#ffa39e', fontSize: '12px', padding: '3px 8px', marginTop: '6px', width: '100%' }}
                  onClick={() => handleDelete(photo.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
        <div style={S.cardTitle}>Upload Photo</div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={S.label}>Photo File *</label>
            <input
              type="file"
              accept="image/*"
              style={{ fontSize: '13px' }}
              onChange={e => setPhotoFile(e.target.files[0] || null)}
            />
          </div>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={S.label}>Label (optional)</label>
            <input
              style={{ ...S.input, marginBottom: 0 }}
              value={photoLabel}
              onChange={e => setPhotoLabel(e.target.value)}
              placeholder="e.g. Front view"
            />
          </div>
          <button style={S.btnPrimary} onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Tab: Custom Fields ----
function CustomFieldsTab({ itemId, item, fetchItem }) {
  const [defs, setDefs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/custom-fields').then(r => setDefs(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const map = {};
    (item.custom_fields || []).forEach(cf => { map[cf.field_id] = cf.value; });
    setValues(map);
  }, [item.custom_fields]);

  function currentValue(fieldId) {
    const cf = (item.custom_fields || []).find(f => f.field_id === fieldId);
    return cf ? cf.value : '—';
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = defs.map(d => ({ field_id: d.id, value: values[d.id] !== undefined ? String(values[d.id]) : '' }));
      await client.put(`/custom-fields/items/${itemId}`, { values: payload });
      setEditing(false);
      fetchItem();
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function renderInput(def) {
    const val = values[def.id] !== undefined ? values[def.id] : '';
    if (def.field_type === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={val === 'true' || val === true}
          onChange={e => setValues(prev => ({ ...prev, [def.id]: String(e.target.checked) }))}
        />
      );
    }
    return (
      <input
        style={{ ...S.input, marginBottom: 0 }}
        type={def.field_type === 'number' ? 'number' : def.field_type === 'date' ? 'date' : 'text'}
        value={val}
        onChange={e => setValues(prev => ({ ...prev, [def.id]: e.target.value }))}
      />
    );
  }

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={S.cardTitle}>Custom Fields</div>
        {!editing && (
          <button style={S.btnPrimary} onClick={() => setEditing(true)}>Edit Values</button>
        )}
      </div>
      {error && <div style={S.error}>{error}</div>}
      {defs.length === 0 ? (
        <div style={S.empty}>No custom fields defined</div>
      ) : (
        <div style={S.twoCol}>
          {defs.map(def => (
            <div key={def.id} style={S.field}>
              <div style={S.fieldLabel}>{def.name}</div>
              {editing ? renderInput(def) : (
                <div style={S.fieldValue}>{currentValue(def.id)}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button style={S.btnPrimary} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button style={S.btn} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = safeUser();

  const [item, setItem] = useState(null);
  const [batches, setBatches] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchItem = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get(`/items/${id}`);
      setItem(res.data.data);
    } catch (e) {
      alert('Failed to load item');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchBatches = useCallback(async () => {
    setBatchLoading(true);
    try {
      const res = await client.get(`/items/${id}/batches`);
      setBatches(res.data.data || []);
    } catch (e) {
      console.error('Failed to load batches');
    } finally {
      setBatchLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItem();
    fetchBatches();
    client.get('/categories').then(r => setCategories(r.data.data || [])).catch(() => {});
  }, [fetchItem, fetchBatches]);

  async function handleEditSave(payload) {
    await client.put(`/items/${id}`, payload);
    setShowEdit(false);
    fetchItem();
  }

  async function handleToggleActive() {
    if (!window.confirm(`${item.is_active ? 'Deactivate' : 'Activate'} this item?`)) return;
    setToggling(true);
    try {
      await client.patch(`/items/${id}/toggle-active`);
      fetchItem();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to toggle status');
    } finally {
      setToggling(false);
    }
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'batches', label: 'Stock Batches' },
    { key: 'vendors', label: 'Vendor Prices' },
    { key: 'aliases', label: 'Barcodes' },
    { key: 'history', label: 'Audit History' },
    { key: 'photos', label: 'Photos' },
    { key: 'customFields', label: 'Custom Fields' }
  ];

  if (loading) {
    return (
      <div style={S.page}>
        <Nav />
        <div style={S.content}>
          <div style={S.empty}>Loading item...</div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={S.page}>
        <Nav />
        <div style={S.content}>
          <div style={S.empty}>Item not found</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <button style={S.backLink} onClick={() => navigate('/items')}>
          &larr; Back to Item Master
        </button>

        <div style={S.headerRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ItemCoverPhoto item={item} />
            <div style={S.titleBlock}>
              <h1 style={S.h1}>
                {item.item_code}
                {item.variant_grade ? ` — ${item.variant_grade}` : ''}
              </h1>
              <p style={S.subtitle}>
                {item.category_name} / {item.sub_category_name}
                &nbsp;&nbsp;|&nbsp;&nbsp;Barcode: {item.barcode}
              </p>
            </div>
          </div>
          <div style={S.actionRow}>
            <button
              style={S.btn}
              onClick={() => window.open(`/api/items/${id}/label`, '_blank')}
            >
              Print Label
            </button>
            <button
              style={S.btn}
              onClick={() => window.open(`/api/items/${id}/qr`, '_blank')}
            >
              QR Code
            </button>
            {user.role === 'admin' && (
              <button
                style={S.btn}
                onClick={async () => {
                  try {
                    const result = await client.post(`/items/${id}/clone`);
                    navigate('/items/' + result.data.data.id);
                  } catch (e) {
                    alert(e.response?.data?.error || 'Clone failed');
                  }
                }}
              >
                Clone
              </button>
            )}
            {['admin', 'purchase'].includes(user.role) && (
              <button style={S.btnPrimary} onClick={() => setShowEdit(true)}>
                Edit
              </button>
            )}
            {user.role === 'admin' && (
              <button
                style={item.is_active !== false ? S.btnWarning : S.btnPrimary}
                onClick={handleToggleActive}
                disabled={toggling}
              >
                {toggling ? '...' : item.is_active !== false ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        </div>

        <div style={S.tabs}>
          {tabs.map(t => (
            <button
              key={t.key}
              style={activeTab === t.key ? S.tabActive : S.tab}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <OverviewTab
            item={item}
            categories={categories}
            user={user}
            onEdit={() => setShowEdit(true)}
            onToggleActive={handleToggleActive}
            loading={loading}
          />
        )}
        {activeTab === 'batches' && (
          <BatchesTab batches={batches} item={item} loading={batchLoading} />
        )}
        {activeTab === 'vendors' && (
          <VendorsTab itemId={id} item={item} user={user} />
        )}
        {activeTab === 'aliases' && (
          <AliasesTab itemId={id} item={item} user={user} fetchItem={fetchItem} />
        )}
        {activeTab === 'history' && (
          <HistoryTab itemId={id} />
        )}
        {activeTab === 'photos' && (
          <PhotosTab itemId={id} item={item} user={user} fetchItem={fetchItem} />
        )}
        {activeTab === 'customFields' && (
          <CustomFieldsTab itemId={id} item={item} fetchItem={fetchItem} />
        )}
      </div>

      {showEdit && (
        <ItemForm
          item={item}
          categories={categories}
          onSave={handleEditSave}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
