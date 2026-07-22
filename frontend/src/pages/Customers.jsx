import React, { useState, useEffect, useRef } from 'react';
import client from '../api/client';
import Nav from '../components/Nav';
import { safeUser } from '../lib/safeUser';

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' },
  title: { margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-1)' },
  addBtn: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none',
    background: 'var(--primary)', color: '#fff', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600'
  },
  searchInput: {
    padding: '7px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
    fontSize: '13px', width: '280px', marginBottom: '16px',
    background: 'var(--surface)', color: 'var(--text-2)'
  },
  tableWrap: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'auto'
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left',
    fontWeight: '600', fontSize: '11px', color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
  },
  td: {
    padding: '12px 14px', borderBottom: '1px solid var(--border)',
    color: 'var(--text-2)', verticalAlign: 'middle'
  },
  actionBtn: {
    padding: '4px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)',
    cursor: 'pointer', fontSize: '12px', background: 'var(--surface)',
    color: 'var(--text-2)', marginRight: '4px'
  },
  empty: { padding: '48px', textAlign: 'center', color: 'var(--text-4)' },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
  },
  modal: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px 32px',
    width: '460px', boxShadow: 'var(--shadow-lg)'
  },
  modalTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '20px' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '5px' },
  input: {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-1)',
    background: 'var(--surface)', boxSizing: 'border-box'
  },
  textarea: {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-1)',
    background: 'var(--surface)', boxSizing: 'border-box',
    resize: 'vertical', minHeight: '72px'
  },
  btnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' },
  saveBtn: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none',
    background: 'var(--primary)', color: '#fff', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600'
  },
  cancelBtn: {
    padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)',
    background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px'
  }
};

const emptyForm = { name: '', contact: '', address: '' };

export default function Customers() {
  const user = safeUser();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const debounceRef = useRef(null);
  const canWrite = ['admin', 'sales'].includes(user.role);

  async function fetchCustomers(q) {
    setLoading(true);
    try {
      const params = q ? { search: q } : {};
      const res = await client.get('/customers', { params });
      setCustomers(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCustomers(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({ name: c.name || '', contact: c.contact || '', address: c.address || '' });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Name is required');
    try {
      if (editing) {
        await client.put(`/customers/${editing.id}`, form);
      } else {
        await client.post('/customers', form);
      }
      setShowForm(false);
      fetchCustomers(search);
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    }
  }

  const colSpan = canWrite ? 5 : 4;

  return (
    <div style={styles.page}>
      <Nav />
      <div style={styles.content}>
        <div style={styles.topRow}>
          <h2 style={styles.title}>Customers</h2>
          {canWrite && (
            <button style={styles.addBtn} onClick={openAdd}>+ Add Customer</button>
          )}
        </div>

        <input
          style={styles.searchInput}
          placeholder="Search by name, contact, address..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Contact</th>
                <th style={styles.th}>Address</th>
                <th style={styles.th}>Created</th>
                {canWrite && <th style={styles.th}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={colSpan} style={styles.empty}>Loading...</td></tr>
              )}
              {!loading && customers.length === 0 && (
                <tr><td colSpan={colSpan} style={styles.empty}>No customers found</td></tr>
              )}
              {!loading && customers.map(c => (
                <tr key={c.id}>
                  <td style={styles.td}>{c.name}</td>
                  <td style={styles.td}>{c.contact || '—'}</td>
                  <td style={styles.td}>{c.address || '—'}</td>
                  <td style={styles.td}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                  {canWrite && (
                    <td style={styles.td}>
                      <button style={styles.actionBtn} onClick={() => openEdit(c)}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div style={styles.overlay} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={styles.modal}>
            <div style={styles.modalTitle}>{editing ? 'Edit Customer' : 'Add Customer'}</div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Name *</label>
              <input
                style={styles.input}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Customer name"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Contact</label>
              <input
                style={styles.input}
                value={form.contact}
                onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                placeholder="Phone or email"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Address</label>
              <textarea
                style={styles.textarea}
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Delivery address"
              />
            </div>
            <div style={styles.btnRow}>
              <button style={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={styles.saveBtn} onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
