import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Nav from '../components/Nav';
import { safeUser } from '../lib/safeUser';

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' },
  title: { margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-1)' },
  addBtn: { padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  filterBar: { display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' },
  select: { padding: '7px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text-2)' },
  tableWrap: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  viewBtn: { padding: '4px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', cursor: 'pointer', fontSize: '12px', background: 'var(--surface)', color: 'var(--primary)' },
  empty: { padding: '48px', textAlign: 'center', color: 'var(--text-4)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '460px', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { margin: '0 0 20px', fontSize: '16px', fontWeight: '700', color: 'var(--text-1)' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '5px' },
  input: { width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-1)', background: 'var(--surface)', boxSizing: 'border-box' },
  btnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' },
  saveBtn: { padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  cancelBtn: { padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px' }
};

const statusStyle = {
  draft:     { background: 'rgba(100,116,139,0.1)', color: 'var(--text-3)' },
  confirmed: { background: 'var(--primary-dim)',    color: 'var(--primary)' },
  locked:    { background: 'var(--success-dim)',    color: 'var(--success)' },
};

function StatusBadge({ status }) {
  const base = { padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' };
  return (
    <span style={{ ...base, ...(statusStyle[status] || statusStyle.draft) }}>
      {status}
    </span>
  );
}

export default function Outward() {
  const navigate = useNavigate();
  const user = safeUser();
  const [entries, setEntries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: '', dispatch_date: '' });
  const canWrite = ['admin', 'sales'].includes(user.role);

  async function fetchEntries() {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await client.get('/outward', { params });
      setEntries(res.data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { client.get('/customers').then(r => setCustomers(r.data.data || [])); }, []);
  useEffect(() => { fetchEntries(); }, [statusFilter]);

  async function handleCreate() {
    if (!form.customer_id || !form.dispatch_date) return alert('Customer and Dispatch Date are required');
    try {
      const res = await client.post('/outward', form);
      setShowForm(false);
      setForm({ customer_id: '', dispatch_date: '' });
      navigate(`/outward/${res.data.data.id}`);
    } catch (err) { alert(err.response?.data?.error || 'Create failed'); }
  }

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <div style={S.topRow}>
          <h2 style={S.title}>Outward Dispatches</h2>
          {canWrite && <button style={S.addBtn} onClick={() => setShowForm(true)}>+ New Dispatch</button>}
        </div>
        <div style={S.filterBar}>
          <select style={S.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="locked">Locked</option>
          </select>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Challan #</th>
                <th style={S.th}>Customer</th>
                <th style={S.th}>Dispatch Date</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Created By</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="6" style={S.empty}>Loading...</td></tr>}
              {!loading && entries.length === 0 && <tr><td colSpan="6" style={S.empty}>No dispatches found</td></tr>}
              {!loading && entries.map(e => (
                <tr key={e.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', fontWeight: '600', color: e.challan_no ? 'var(--success)' : 'var(--text-4)' }}>{e.challan_no || `OW-${String(e.id).padStart(4, '0')}`}</span></td>
                  <td style={S.td}>{e.customer_name}</td>
                  <td style={S.td}>{e.dispatch_date}</td>
                  <td style={S.td}><StatusBadge status={e.status} /></td>
                  <td style={S.td}>{e.created_by_name}</td>
                  <td style={S.td}>
                    <button style={S.viewBtn} onClick={() => navigate(`/outward/${e.id}`)}>View</button>
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
            <h3 style={S.modalTitle}>New Dispatch</h3>
            <div style={S.formGroup}>
              <label style={S.label}>Customer *</label>
              <select style={S.input} value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Dispatch Date *</label>
              <input type="date" style={S.input} value={form.dispatch_date} onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} />
            </div>
            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={S.saveBtn} onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
