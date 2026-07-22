import React, { useState, useEffect } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';
import { safeUser } from '../lib/safeUser';

const FIELD_TYPES = ['text', 'number', 'date', 'boolean'];

// Semantic per-type colors — kept as-is (design intent)
const typeBadge = {
  text:    { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  number:  { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' },
  date:    { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' },
  boolean: { background: '#f3e8ff', color: '#7c3aed', border: '1px solid #e9d5ff' },
};

const S = {
  page:      { minHeight: '100vh', background: 'var(--bg)' },
  content:   { padding: '24px' },
  topRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  pageTitle: { margin: 0, fontSize: '20px', fontWeight: '800', color: 'var(--text-1)' },
  addBtn:    { padding: '8px 18px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '700' },
  tableWrap: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'auto' },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th:        { background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-2)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' },
  td:        { padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  badge:     { display: 'inline-block', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' },
  deleteBtn: { padding: '3px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--danger-dim)', cursor: 'pointer', fontSize: '12px', background: 'var(--danger-dim)', color: 'var(--danger)' },
  empty:     { padding: '40px', textAlign: 'center', color: 'var(--text-4)' },
  inlineCard: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', padding: '20px 24px', marginBottom: '20px' },
  inlineTitle: { margin: '0 0 14px', fontSize: '15px', fontWeight: '700', color: 'var(--text-1)' },
  formRow:   { display: 'flex', gap: '12px', alignItems: 'flex-end' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label:     { fontSize: '12px', fontWeight: '600', color: 'var(--text-3)' },
  input:     { padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '14px', width: '240px', boxSizing: 'border-box' },
  select:    { padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--surface)', width: '160px', boxSizing: 'border-box' },
  saveBtn:   { padding: '8px 18px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '700' },
  cancelBtn: { padding: '8px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' },
};

const emptyForm = { name: '', field_type: 'text' };

export default function CustomFields() {
  const user = safeUser();
  const isAdmin = user.role === 'admin';

  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function fetchFields() {
    setLoading(true);
    try {
      const res = await client.get('/custom-fields');
      setFields(res.data.data || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchFields(); }, []);

  async function handleAdd() {
    if (!form.name.trim()) return alert('Field name is required');
    setSaving(true);
    try {
      await client.post('/custom-fields', { name: form.name.trim(), field_type: form.field_type });
      setShowAdd(false);
      setForm(emptyForm);
      fetchFields();
    } catch (err) {
      alert(err.response?.data?.error || 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(field) {
    if (!window.confirm(`Delete custom field "${field.name}"? This cannot be undone.`)) return;
    try {
      await client.delete(`/custom-fields/${field.id}`);
      fetchFields();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setShowAdd(false); setForm(emptyForm); }
  }

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-1)', margin: 0 }}>Custom Fields</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', margin: '4px 0 0' }}>Define custom metadata fields for inventory items</p>
          </div>
          {isAdmin && !showAdd && (
            <button style={S.addBtn} onClick={() => { setShowAdd(true); setForm(emptyForm); }}>
              + Add Field
            </button>
          )}
        </div>

        {isAdmin && showAdd && (
          <div style={S.inlineCard}>
            <div style={S.inlineTitle}>New Custom Field</div>
            <div style={S.formRow}>
              <div style={S.formGroup}>
                <label style={S.label}>Field Name *</label>
                <input
                  style={S.input}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Lot Number"
                  autoFocus
                />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Type</label>
                <select
                  style={S.select}
                  value={form.field_type}
                  onChange={e => setForm(f => ({ ...f, field_type: e.target.value }))}
                >
                  {FIELD_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <button style={S.saveBtn} onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                style={S.cancelBtn}
                onClick={() => { setShowAdd(false); setForm(emptyForm); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Type</th>
                <th style={S.th}>Created</th>
                {isAdmin && <th style={S.th}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} style={S.empty}>Loading...</td>
                </tr>
              )}
              {!loading && fields.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} style={S.empty}>No custom fields defined</td>
                </tr>
              )}
              {!loading && fields.map(f => (
                <tr key={f.id}>
                  <td style={S.td}>{f.name}</td>
                  <td style={S.td}>
                    <span style={{ ...S.badge, ...(typeBadge[f.field_type] || {}) }}>
                      {f.field_type}
                    </span>
                  </td>
                  <td style={S.td}>
                    {f.created_at ? new Date(f.created_at).toLocaleDateString('en-IN') : '—'}
                  </td>
                  {isAdmin && (
                    <td style={S.td}>
                      <button style={S.deleteBtn} onClick={() => handleDelete(f)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
