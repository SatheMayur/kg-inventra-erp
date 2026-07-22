import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Nav from '../components/Nav';
import { safeUser } from '../lib/safeUser';

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-1)' },
  addBtn: { padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  filterBar: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' },
  select: { padding: '7px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text-2)' },
  input: { width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-1)', background: 'var(--surface)', boxSizing: 'border-box' },
  filterInput: { padding: '7px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text-2)', minWidth: '160px' },
  dateInput: { padding: '7px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text-2)' },
  filterLabel: { fontSize: '12px', color: 'var(--text-3)', marginRight: '4px' },
  tableWrap: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  viewBtn: { padding: '4px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--primary)', cursor: 'pointer', fontSize: '12px', background: 'var(--primary-dim)', color: 'var(--primary)', marginRight: '4px' },
  receivedBtn: { padding: '4px 10px', borderRadius: 'var(--radius)', border: '1px solid rgba(245,158,11,0.4)', cursor: 'pointer', fontSize: '12px', background: 'rgba(245,158,11,0.1)', color: '#92400e', marginRight: '4px' },
  closeBtn: { padding: '4px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--success)', cursor: 'pointer', fontSize: '12px', background: 'var(--success-dim)', color: 'var(--success)' },
  empty: { padding: '48px', textAlign: 'center', color: 'var(--text-4)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '460px', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { margin: '0 0 20px', fontSize: '16px', fontWeight: '700', color: 'var(--text-1)' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '5px' },
  textarea: { width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-1)', background: 'var(--surface)', boxSizing: 'border-box', resize: 'vertical', minHeight: '72px' },
  btnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' },
  saveBtn: { padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  cancelBtn: { padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px' }
};

// open = amber, received = indigo, closed = green
const statusStyle = {
  open:     { background: 'rgba(245,158,11,0.1)', color: '#92400e' },
  received: { background: 'var(--primary-dim)',   color: 'var(--primary)' },
  closed:   { background: 'var(--success-dim)',   color: 'var(--success)' }
};

function StatusBadge({ status }) {
  return (
    <span style={{
      ...(statusStyle[status] || { background: 'rgba(100,116,139,0.1)', color: 'var(--text-3)' }),
      padding: '2px 10px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '600'
    }}>
      {status}
    </span>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const user = safeUser();
  const [pos, setPos] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ vendor_id: '', po_date: today(), delivery_date: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const canWrite = ['admin', 'purchase'].includes(user.role);
  const canClose = user.role === 'admin';

  async function fetchPos() {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (vendorSearch.trim()) params.vendor_search = vendorSearch.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await client.get('/purchase-orders', { params });
      setPos(res.data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    client.get('/vendors').then(r => setVendors(r.data.data || []));
  }, []);

  useEffect(() => { fetchPos(); }, [statusFilter, vendorSearch, dateFrom, dateTo]);

  async function handleCreate() {
    if (!form.vendor_id || !form.po_date) return alert('Vendor and PO Date are required');
    setSaving(true);
    try {
      const payload = { vendor_id: form.vendor_id, po_date: form.po_date };
      if (form.delivery_date) payload.delivery_date = form.delivery_date;
      if (form.notes.trim()) payload.notes = form.notes.trim();
      const res = await client.post('/purchase-orders', payload);
      setShowForm(false);
      setForm({ vendor_id: '', po_date: today(), delivery_date: '', notes: '' });
      navigate(`/purchase-orders/${res.data.data.id}`);
    } catch (err) { alert(err.response?.data?.error || 'Create failed'); }
    finally { setSaving(false); }
  }

  async function handleStatusChange(po, newStatus) {
    const label = newStatus === 'received' ? 'Mark as Received' : 'Close PO';
    if (!window.confirm(`${label}? PO-${String(po.id).padStart(4, '0')}`)) return;
    try {
      await client.patch(`/purchase-orders/${po.id}`, { status: newStatus });
      fetchPos();
    } catch (err) { alert(err.response?.data?.error || 'Update failed'); }
  }

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <div style={S.topRow}>
          <h2 style={S.title}>Purchase Orders</h2>
          {canWrite && (
            <button style={S.addBtn} onClick={() => { setForm({ vendor_id: '', po_date: today(), delivery_date: '', notes: '' }); setShowForm(true); }}>
              + New PO
            </button>
          )}
        </div>

        <div style={S.filterBar}>
          <select style={S.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="received">Received</option>
            <option value="closed">Closed</option>
          </select>
          <input
            style={S.filterInput}
            placeholder="Search vendor..."
            value={vendorSearch}
            onChange={e => setVendorSearch(e.target.value)}
          />
          <span style={S.filterLabel}>From</span>
          <input type="date" style={S.dateInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={S.filterLabel}>To</span>
          <input type="date" style={S.dateInput} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(statusFilter || vendorSearch || dateFrom || dateTo) && (
            <button
              style={{ ...S.cancelBtn, fontSize: '12px', padding: '6px 12px' }}
              onClick={() => { setStatusFilter(''); setVendorSearch(''); setDateFrom(''); setDateTo(''); }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>PO #</th>
                <th style={S.th}>Vendor</th>
                <th style={S.th}>PO Date</th>
                <th style={S.th}>Expected Delivery</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Created By</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="7" style={S.empty}>Loading...</td></tr>}
              {!loading && pos.length === 0 && <tr><td colSpan="7" style={S.empty}>No purchase orders found</td></tr>}
              {!loading && pos.map(po => (
                <tr key={po.id}>
                  <td style={S.td}>
                    <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                      PO-{String(po.id).padStart(4, '0')}
                    </span>
                  </td>
                  <td style={S.td}>{po.vendor_name}</td>
                  <td style={S.td}>{po.po_date}</td>
                  <td style={S.td}>{po.delivery_date || '—'}</td>
                  <td style={S.td}><StatusBadge status={po.status} /></td>
                  <td style={S.td}>{po.created_by_name || '—'}</td>
                  <td style={S.td}>
                    <button style={S.viewBtn} onClick={() => navigate(`/purchase-orders/${po.id}`)}>View</button>
                    {canWrite && po.status === 'open' && (
                      <button style={S.receivedBtn} onClick={() => handleStatusChange(po, 'received')}>
                        Mark Received
                      </button>
                    )}
                    {canClose && po.status === 'received' && (
                      <button style={S.closeBtn} onClick={() => handleStatusChange(po, 'closed')}>
                        Close PO
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <h3 style={S.modalTitle}>New Purchase Order</h3>
            <div style={S.formGroup}>
              <label style={S.label}>Vendor *</label>
              <select style={S.input} value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
                <option value="">Select vendor...</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>PO Date *</label>
              <input type="date" style={S.input} value={form.po_date} onChange={e => setForm(f => ({ ...f, po_date: e.target.value }))} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Expected Delivery Date</label>
              <input type="date" style={S.input} value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Notes (optional)</label>
              <textarea
                style={S.textarea}
                placeholder="Add any notes for this PO..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={{ ...S.saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
