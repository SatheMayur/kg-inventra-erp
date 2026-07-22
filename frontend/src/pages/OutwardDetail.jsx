import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import Nav from '../components/Nav';
import { safeUser } from '../lib/safeUser';

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  backBtn: { padding: '6px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px', marginBottom: '16px' },
  card: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  cardTitle: { margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-1)' },
  challanNo: { fontSize: '20px', fontWeight: '800', color: 'var(--success)', fontFamily: 'monospace', letterSpacing: '1px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' },
  fl: { fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  fv: { fontSize: '14px', fontWeight: '600', color: 'var(--text-1)', marginTop: '2px' },
  actionRow: { display: 'flex', gap: '10px', marginTop: '16px', alignItems: 'center' },
  confirmBtn: { padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  lockBtn: { padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--success)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  addLineBtn: { padding: '7px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  printBtn: { padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none', background: '#F59E0B', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  tableWrap: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  deleteBtn: { padding: '3px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--danger-dim)', cursor: 'pointer', fontSize: '11px', background: 'var(--danger-dim)', color: 'var(--danger)' },
  empty: { padding: '40px', textAlign: 'center', color: 'var(--text-4)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '460px', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { margin: '0 0 20px', fontSize: '16px', fontWeight: '700', color: 'var(--text-1)' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '5px' },
  input: { width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-1)', background: 'var(--surface)', boxSizing: 'border-box' },
  btnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' },
  saveBtn: { padding: '8px 20px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  cancelBtn: { padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px' }
};

const statusStyle = {
  draft:     { background: 'rgba(100,116,139,0.1)', color: 'var(--text-3)' },
  confirmed: { background: 'var(--primary-dim)',    color: 'var(--primary)' },
  locked:    { background: 'var(--success-dim)',    color: 'var(--success)' },
};

function StatusBadge({ status }) {
  const st = statusStyle[status] || statusStyle.draft;
  return (
    <span style={{ ...st, padding: '3px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: '700' }}>
      {status.toUpperCase()}
    </span>
  );
}

const emptyLine = { item_id: '', qty: '', rate: '' };

export default function OutwardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = safeUser();
  const [entry, setEntry] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLine, setShowAddLine] = useState(false);
  const [lineForm, setLineForm] = useState(emptyLine);
  const [saving, setSaving] = useState(false);

  const isDraft = entry?.status === 'draft';
  const isConfirmed = entry?.status === 'confirmed';
  const isLocked = entry?.status === 'locked';
  const canWrite = ['admin', 'sales'].includes(user.role);

  async function fetchEntry() {
    try {
      const res = await client.get(`/outward/${id}`);
      setEntry(res.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchEntry(); }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    client.get('/items', { signal: controller.signal }).then(r => setItems(r.data.data || [])).catch(() => {});
    return () => controller.abort();
  }, []);

  async function handleAddLine() {
    if (!lineForm.item_id || !lineForm.qty) return alert('Item and Qty are required');
    setSaving(true);
    try {
      await client.post(`/outward/${id}/lines`, { item_id: lineForm.item_id, qty: parseFloat(lineForm.qty), rate: lineForm.rate ? parseFloat(lineForm.rate) : null });
      setShowAddLine(false);
      setLineForm(emptyLine);
      fetchEntry();
    } catch (err) {
      alert(err.response?.data?.error || 'Add line failed');
    } finally { setSaving(false); }
  }

  async function handleDeleteLine(lineId) {
    if (!window.confirm('Remove this line?')) return;
    try {
      await client.delete(`/outward/${id}/lines/${lineId}`);
      fetchEntry();
    } catch (err) { alert(err.response?.data?.error || 'Delete failed'); }
  }

  async function handleConfirm() {
    if (!window.confirm('Confirm dispatch? FIFO stock deduction will run.')) return;
    try {
      await client.post(`/outward/${id}/confirm`);
      fetchEntry();
    } catch (err) { alert(err.response?.data?.error || 'Confirm failed'); }
  }

  async function handleLock() {
    if (!window.confirm('Lock and generate challan? No further changes will be possible.')) return;
    try {
      await client.post(`/outward/${id}/lock`);
      fetchEntry();
    } catch (err) { alert(err.response?.data?.error || 'Lock failed'); }
  }

  if (loading) return <div style={S.page}><Nav /><div style={S.content}><p>Loading...</p></div></div>;
  if (!entry) return <div style={S.page}><Nav /><div style={S.content}><p>Entry not found</p></div></div>;

  const lines = entry.lines || [];

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <button style={S.backBtn} onClick={() => navigate('/outward')}>Back to Outward</button>

        <div style={S.card}>
          <div style={S.cardHead}>
            <h3 style={S.cardTitle}>Outward Dispatch</h3>
            {isLocked && entry.challan_no
              ? <span style={S.challanNo}>{entry.challan_no}</span>
              : <StatusBadge status={entry.status} />
            }
          </div>
          <div style={S.grid}>
            <div><div style={S.fl}>Customer</div><div style={S.fv}>{entry.customer_name}</div></div>
            <div><div style={S.fl}>Dispatch Date</div><div style={S.fv}>{entry.dispatch_date}</div></div>
            <div><div style={S.fl}>Contact</div><div style={S.fv}>{entry.customer_contact || '—'}</div></div>
            <div><div style={S.fl}>Address</div><div style={S.fv}>{entry.customer_address || '—'}</div></div>
            {entry.locked_at && <div><div style={S.fl}>Locked At</div><div style={S.fv}>{new Date(entry.locked_at).toLocaleString('en-IN')}</div></div>}
          </div>
          {canWrite && !isLocked && (
            <div style={S.actionRow}>
              {isDraft && <button style={S.addLineBtn} onClick={() => setShowAddLine(true)}>+ Add Line</button>}
              {isDraft && lines.length > 0 && <button style={S.confirmBtn} onClick={handleConfirm}>Confirm & Run FIFO</button>}
              {isConfirmed && <button style={S.lockBtn} onClick={handleLock}>Lock & Generate Challan</button>}
            </div>
          )}
          {isLocked && (
            <div style={S.actionRow}>
              <button style={S.printBtn} onClick={() => navigate(`/challan/${id}`)}>Print Challan</button>
              <button
                style={{ ...S.printBtn, background: 'var(--success)' }}
                onClick={async () => {
                  try {
                    const res = await client.get(`/outward/${id}/challan`, { responseType: 'text' });
                    const blob = new Blob([res.data], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const win = window.open(url, '_blank');
                    if (win) win.onload = () => URL.revokeObjectURL(url);
                  } catch (err) {
                    alert(err.response?.data?.error || 'Failed to load challan');
                  }
                }}
              >
                View Challan (HTML)
              </button>
            </div>
          )}
        </div>

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Item Code</th>
                <th style={S.th}>Sub-Category</th>
                <th style={S.th}>Batch ID</th>
                <th style={S.th}>Qty</th>
                <th style={S.th}>Rate (₹)</th>
                <th style={S.th}>Amount (₹)</th>
                {isDraft && canWrite && <th style={S.th}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={isDraft && canWrite ? 7 : 6} style={S.empty}>No lines added yet</td></tr>}
              {lines.map(l => {
                const amount = l.rate && l.qty ? (parseFloat(l.rate) * parseFloat(l.qty)).toFixed(2) : '—';
                return (
                  <tr key={l.id}>
                    <td style={S.td}><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>{l.item_code}</span></td>
                    <td style={S.td}>{l.sub_category_name}</td>
                    <td style={S.td}>{l.batch_id ? <span style={{ fontFamily: 'monospace', color: 'var(--success)', fontSize: '12px' }}>#{l.batch_id}</span> : <span style={{ color: 'var(--text-4)' }}>Pending</span>}</td>
                    <td style={S.td}>{l.qty} {l.unit}</td>
                    <td style={S.td}>{l.rate ? `₹${l.rate}` : '—'}</td>
                    <td style={S.td}>{l.rate ? `₹${amount}` : '—'}</td>
                    {isDraft && canWrite && <td style={S.td}><button style={S.deleteBtn} onClick={() => handleDeleteLine(l.id)}>Remove</button></td>}
                  </tr>
                );
              })}
              {lines.length > 0 && (
                <tr>
                  <td colSpan="5" style={{ ...S.td, textAlign: 'right', fontWeight: '700', color: 'var(--text-1)' }}>Total</td>
                  <td style={{ ...S.td, fontWeight: '700', color: 'var(--success)' }}>
                    ₹{lines.reduce((sum, l) => sum + (l.rate && l.qty ? parseFloat(l.rate) * parseFloat(l.qty) : 0), 0).toFixed(2)}
                  </td>
                  {isDraft && canWrite && <td style={S.td}></td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddLine && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <h3 style={S.modalTitle}>Add Line</h3>
            <div style={S.formGroup}>
              <label style={S.label}>Item *</label>
              <select style={S.input} value={lineForm.item_id} onChange={e => setLineForm(f => ({ ...f, item_id: e.target.value }))}>
                <option value="">Select item...</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.item_code} — {i.variant_grade || i.sub_category_name} ({parseFloat(i.live_stock_kg || 0).toFixed(2)} {i.unit} in stock)</option>)}
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Quantity *</label>
              <input type="number" min="0" step="0.01" style={S.input} value={lineForm.qty} onChange={e => setLineForm(f => ({ ...f, qty: e.target.value }))} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Rate (₹)</label>
              <input type="number" min="0" step="0.01" style={S.input} value={lineForm.rate} onChange={e => setLineForm(f => ({ ...f, rate: e.target.value }))} />
            </div>
            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setShowAddLine(false)}>Cancel</button>
              <button style={S.saveBtn} onClick={handleAddLine} disabled={saving}>{saving ? 'Adding...' : 'Add Line'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
