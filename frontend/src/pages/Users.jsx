import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Nav from '../components/Nav';
import { safeUser } from '../lib/safeUser';

const ROLES = ['admin', 'purchase', 'warehouse', 'sales', 'view'];

const roleBadge = {
  admin:     { background: '#f3e8ff', color: '#7c3aed', border: '1px solid #e9d5ff' },
  purchase:  { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  warehouse: { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' },
  sales:     { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' },
  view:      { background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }
};

const S = {
  page:       { minHeight: '100vh', background: 'var(--bg)' },
  content:    { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  pageTitle:  { margin: '0 0 20px', fontSize: '20px', fontWeight: '700', color: 'var(--text-1)' },
  topRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  addBtn:     { padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  tableWrap:  { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:         { background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td:         { padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  badge:      { display: 'inline-block', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' },
  statusOn:   { background: 'var(--success-dim)', color: 'var(--success)' },
  statusOff:  { background: 'rgba(100,116,139,0.1)', color: 'var(--text-3)' },
  actionBtn:  { padding: '3px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', cursor: 'pointer', fontSize: '12px', background: 'var(--surface)', color: 'var(--text-2)', marginRight: '4px' },
  resetBtn:   { padding: '3px 10px', borderRadius: 'var(--radius)', border: '1px solid #93c5fd', cursor: 'pointer', fontSize: '12px', background: 'var(--surface)', color: '#1d4ed8', marginRight: '4px' },
  dangerBtn:  { padding: '3px 10px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontSize: '12px', background: 'var(--danger)', color: '#fff', marginRight: '4px' },
  activateBtn: { padding: '3px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', cursor: 'pointer', fontSize: '12px', background: 'var(--surface)', color: 'var(--success)', marginRight: '4px' },
  disabledBtn: { padding: '3px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', cursor: 'not-allowed', fontSize: '12px', background: 'var(--surface-2)', color: 'var(--text-4)', marginRight: '4px', opacity: '0.6' },
  denied:     { padding: '60px', textAlign: 'center' },
  deniedTitle: { fontSize: '28px', fontWeight: '800', color: 'var(--danger)', marginBottom: '8px' },
  deniedMsg:  { color: 'var(--text-3)', fontSize: '15px' },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal:      { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '440px', boxShadow: 'var(--shadow-lg)' },
  modalTitle: { margin: '0 0 20px', fontSize: '16px', fontWeight: '700', color: 'var(--text-1)' },
  formGroup:  { marginBottom: '14px' },
  label:      { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '5px' },
  input:      { width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-1)', background: 'var(--surface)', boxSizing: 'border-box' },
  select:     { width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-1)', background: 'var(--surface)', boxSizing: 'border-box' },
  checkRow:   { display: 'flex', alignItems: 'center', gap: '8px' },
  btnRow:     { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' },
  saveBtn:    { padding: '8px 20px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  cancelBtn:  { padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px' },
  empty:      { padding: '48px', textAlign: 'center', color: 'var(--text-4)' },
  hint:       { fontSize: '11px', color: 'var(--text-4)', marginTop: '4px' }
};

const emptyAdd = { name: '', email: '', role: 'purchase', password: '' };

export default function Users() {
  const navigate = useNavigate();
  const currentUser = safeUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPwd, setResetPwd] = useState('');
  const [saving, setSaving] = useState(false);

  if (currentUser.role !== 'admin') {
    return (
      <div style={S.page}>
        <Nav />
        <div style={S.denied}>
          <div style={S.deniedTitle}>403 — Access Denied</div>
          <div style={S.deniedMsg}>This page is restricted to administrators.</div>
          <button style={{ ...S.addBtn, marginTop: '20px' }} onClick={() => navigate('/items')}>
            Go to Items
          </button>
        </div>
      </div>
    );
  }

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await client.get('/users');
      setUsers(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleAdd() {
    const { name, email, role, password } = addForm;
    if (!name || !email || !role || !password) return alert('All fields are required');
    setSaving(true);
    try {
      await client.post('/users', { name, email, role, password });
      setShowAdd(false);
      setAddForm(emptyAdd);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Create user failed');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(user) {
    setEditTarget(user);
    setEditForm({ name: user.name, role: user.role, is_active: user.is_active });
  }

  async function handleEdit() {
    if (!editForm.name) return alert('Name is required');
    setSaving(true);
    const payload = { name: editForm.name };
    if (editTarget.id !== currentUser.id) {
      payload.role = editForm.role;
      payload.is_active = editForm.is_active;
    }
    try {
      await client.put(`/users/${editTarget.id}`, payload);
      setEditTarget(null);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!resetPwd) return alert('Password cannot be empty');
    if (resetPwd.length < 6) return alert('Password must be at least 6 characters');
    setSaving(true);
    try {
      await client.put(`/users/${resetTarget.id}`, { password: resetPwd });
      setResetTarget(null);
      setResetPwd('');
      alert(`Password reset for ${resetTarget.name}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Password reset failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(user) {
    const action = user.is_active ? 'Deactivate' : 'Activate';
    const msg = user.is_active
      ? `Deactivate "${user.name}"? They will no longer be able to log in.`
      : `Activate "${user.name}"? They will regain access to the system.`;
    if (!window.confirm(msg)) return;
    try {
      await client.put(`/users/${user.id}`, { is_active: !user.is_active });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || `${action} failed`);
    }
  }

  const isSelf = (userId) => userId === currentUser.id;

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <div style={S.topRow}>
          <h2 style={S.pageTitle}>User Management</h2>
          <button style={S.addBtn} onClick={() => { setShowAdd(true); setAddForm(emptyAdd); }}>
            + Add User
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Name</th>
                  <th style={S.th}>Email</th>
                  <th style={S.th}>Role</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Created</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={6} style={S.empty}>No users found</td></tr>
                )}
                {users.map(u => (
                  <tr key={u.id} style={!u.is_active ? { opacity: 0.7 } : {}}>
                    <td style={S.td}>
                      {u.name}
                      {isSelf(u.id) && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-4)' }}>(you)</span>
                      )}
                    </td>
                    <td style={S.td}>{u.email}</td>
                    <td style={S.td}>
                      <span style={{ ...S.badge, ...(roleBadge[u.role] || {}) }}>{u.role}</span>
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.badge, ...(u.is_active ? S.statusOn : S.statusOff) }}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={S.td}>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                    <td style={S.td}>
                      <button style={S.actionBtn} onClick={() => openEdit(u)}>Edit</button>
                      <button style={S.resetBtn} onClick={() => { setResetTarget(u); setResetPwd(''); }}>
                        Reset Pwd
                      </button>
                      {isSelf(u.id) ? (
                        <span
                          style={S.disabledBtn}
                          title="Cannot modify your own account"
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </span>
                      ) : u.is_active ? (
                        <button style={S.dangerBtn} onClick={() => handleToggleActive(u)}>Deactivate</button>
                      ) : (
                        <button style={S.activateBtn} onClick={() => handleToggleActive(u)}>Activate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div style={S.modal}>
            <h3 style={S.modalTitle}>Add User</h3>
            <div style={S.formGroup}>
              <label style={S.label}>Name *</label>
              <input
                style={S.input}
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Email *</label>
              <input
                type="email"
                style={S.input}
                value={addForm.email}
                onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Role *</label>
              <select
                style={S.select}
                value={addForm.role}
                onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Password *</label>
              <input
                type="password"
                style={S.input}
                value={addForm.password}
                onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Set initial password"
              />
            </div>
            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={S.saveBtn} onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editTarget && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setEditTarget(null)}>
          <div style={S.modal}>
            <h3 style={S.modalTitle}>Edit User — {editTarget.name}</h3>
            <div style={S.formGroup}>
              <label style={S.label}>Name *</label>
              <input
                style={S.input}
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            {isSelf(editTarget.id) ? (
              <div style={S.formGroup}>
                <label style={S.label}>Role</label>
                <div style={{ ...S.input, background: 'var(--surface-2)', color: 'var(--text-4)', cursor: 'not-allowed' }}>
                  {editTarget.role}
                </div>
                <div style={S.hint}>Cannot change your own role</div>
              </div>
            ) : (
              <div style={S.formGroup}>
                <label style={S.label}>Role</label>
                <select
                  style={S.select}
                  value={editForm.role}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            {!isSelf(editTarget.id) && (
              <div style={S.formGroup}>
                <label style={S.label}>Active Status</label>
                <div style={S.checkRow}>
                  <input
                    type="checkbox"
                    id="is_active_edit"
                    checked={editForm.is_active}
                    onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                  />
                  <label htmlFor="is_active_edit" style={{ fontSize: '14px' }}>
                    Account is active
                  </label>
                </div>
              </div>
            )}
            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setEditTarget(null)}>Cancel</button>
              <button style={S.saveBtn} onClick={handleEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setResetTarget(null)}>
          <div style={S.modal}>
            <h3 style={S.modalTitle}>Reset Password — {resetTarget.name}</h3>
            <div style={S.formGroup}>
              <label style={S.label}>New Password *</label>
              <input
                type="password"
                style={S.input}
                value={resetPwd}
                onChange={e => setResetPwd(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
                autoFocus
              />
            </div>
            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setResetTarget(null)}>Cancel</button>
              <button style={S.saveBtn} onClick={handleResetPassword} disabled={saving}>
                {saving ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
