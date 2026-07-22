import React, { useState, useEffect } from 'react';
import client from '../api/client';
import Nav from '../components/Nav';
import { safeUser } from '../lib/safeUser';

const S = {
  page:       { minHeight: '100vh', background: 'var(--bg)' },
  content:    { padding: '24px' },
  topRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title:      { margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--text-1)' },
  addBtn:     { padding: '8px 18px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '700' },
  card:       { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px', overflow: 'hidden' },
  cardHeader: { padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: '700', color: 'var(--text-2)', background: 'var(--surface-2)' },
  addForm:    { padding: '16px 18px', borderBottom: '1px solid var(--border)', background: 'var(--primary-dim)' },
  formRow:    { display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' },
  formGroup:  { display: 'flex', flexDirection: 'column', gap: '4px' },
  label:      { fontSize: '11px', fontWeight: '600', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px' },
  input:      { padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '14px', minWidth: '200px', boxSizing: 'border-box' },
  select:     { padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '14px', minWidth: '220px', background: 'var(--surface)', boxSizing: 'border-box' },
  saveBtn:    { padding: '7px 18px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap' },
  cancelBtn:  { padding: '7px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th:         { background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-2)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' },
  td:         { padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  nameCel:    { display: 'flex', alignItems: 'center', gap: '6px' },
  pathBadge:  { fontSize: '11px', color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: '3px', padding: '1px 6px', fontFamily: 'monospace' },
  actionBtn:  { padding: '3px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', cursor: 'pointer', fontSize: '12px', background: 'var(--surface)', color: 'var(--text-2)', marginRight: '4px' },
  deleteBtn:  { padding: '3px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--danger-dim)', cursor: 'pointer', fontSize: '12px', background: 'var(--danger-dim)', color: 'var(--danger)', marginRight: '4px' },
  editInput:  { padding: '4px 8px', border: '1px solid var(--primary)', borderRadius: 'var(--radius)', fontSize: '13px', minWidth: '160px', boxSizing: 'border-box' },
  editSave:   { padding: '3px 10px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12px', marginRight: '4px' },
  editCancel: { padding: '3px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', cursor: 'pointer', fontSize: '12px' },
  empty:      { padding: '40px', textAlign: 'center', color: 'var(--text-4)', fontSize: '14px' },
  error:      { background: 'var(--danger-dim)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', color: 'var(--danger)', padding: '8px 14px', fontSize: '13px', marginBottom: '12px' },
  depthDot:   { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', opacity: 0.5, flexShrink: 0 },
};

function depthFromPath(path) {
  if (!path) return 0;
  return path.split('/').filter(Boolean).length - 1;
}

function buildSortedList(flat) {
  return [...flat].sort((a, b) => {
    const pa = a.path || a.name;
    const pb = b.path || b.name;
    return pa.localeCompare(pb);
  });
}

export default function Locations() {
  const user = safeUser();
  const isAdmin = user.role === 'admin';

  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addParent, setAddParent] = useState('');
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  async function fetchLocations() {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/locations');
      setLocations(buildSortedList(res.data.data || res.data || []));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchLocations(); }, []);

  function openAdd() {
    setAddName('');
    setAddParent('');
    setAddError('');
    setShowAdd(true);
  }

  function cancelAdd() {
    setShowAdd(false);
    setAddError('');
  }

  async function handleAdd() {
    if (!addName.trim()) { setAddError('Name is required'); return; }
    setAddSaving(true);
    setAddError('');
    try {
      const payload = { name: addName.trim() };
      if (addParent) payload.parent_id = Number(addParent);
      await client.post('/locations', payload);
      setShowAdd(false);
      await fetchLocations();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Create failed');
    } finally {
      setAddSaving(false);
    }
  }

  function openEdit(loc) {
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function handleEdit(id) {
    if (!editName.trim()) { setEditError('Name is required'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      await client.put(`/locations/${id}`, { name: editName.trim() });
      setEditingId(null);
      await fetchLocations();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Rename failed');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(loc) {
    if (!window.confirm(`Delete location "${loc.name}"?\nThis will fail if any items are assigned to it.`)) return;
    setError('');
    try {
      await client.delete(`/locations/${loc.id}`);
      await fetchLocations();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  }

  const sorted = buildSortedList(locations);

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <div style={S.topRow}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-1)', margin: 0 }}>Locations</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', margin: '4px 0 0' }}>Manage warehouse location hierarchy</p>
          </div>
          {isAdmin && !showAdd && (
            <button style={S.addBtn} onClick={openAdd}>+ Add Location</button>
          )}
        </div>

        {error && <div style={S.error}>{error}</div>}

        <div style={S.card}>
          {showAdd && isAdmin && (
            <div style={S.addForm}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)', marginBottom: '10px' }}>
                New Location
              </div>
              {addError && <div style={{ ...S.error, marginBottom: '10px' }}>{addError}</div>}
              <div style={S.formRow}>
                <div style={S.formGroup}>
                  <label style={S.label}>Name *</label>
                  <input
                    style={S.input}
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="Location name"
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    autoFocus
                  />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label}>Parent (optional)</label>
                  <select
                    style={S.select}
                    value={addParent}
                    onChange={e => setAddParent(e.target.value)}
                  >
                    <option value="">-- Top level --</option>
                    {sorted.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {' '.repeat(depthFromPath(loc.path) * 4)}{loc.path || loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button style={S.saveBtn} onClick={handleAdd} disabled={addSaving}>
                  {addSaving ? 'Saving...' : 'Save'}
                </button>
                <button style={S.cancelBtn} onClick={cancelAdd}>Cancel</button>
              </div>
            </div>
          )}

          {editError && editingId && (
            <div style={{ ...S.error, margin: '10px 18px 0' }}>{editError}</div>
          )}

          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Path</th>
                {isAdmin && <th style={S.th}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={isAdmin ? 3 : 2} style={S.empty}>Loading...</td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={isAdmin ? 3 : 2} style={S.empty}>No locations defined. Add one above.</td></tr>
              )}
              {!loading && sorted.map(loc => {
                const depth = depthFromPath(loc.path);
                const isEditing = editingId === loc.id;
                return (
                  <tr key={loc.id}>
                    <td style={S.td}>
                      <div style={S.nameCel}>
                        {Array.from({ length: depth }).map((_, i) => (
                          <span key={i} style={{ display: 'inline-block', width: '18px', borderLeft: '2px solid var(--border)', marginLeft: '6px', height: '18px', flexShrink: 0 }} />
                        ))}
                        {depth > 0 && <span style={S.depthDot} />}
                        {isEditing ? (
                          <input
                            style={S.editInput}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleEdit(loc.id); if (e.key === 'Escape') cancelEdit(); }}
                            autoFocus
                          />
                        ) : (
                          <span>{loc.name}</span>
                        )}
                      </div>
                    </td>
                    <td style={S.td}>
                      <span style={S.pathBadge}>{loc.path || loc.name}</span>
                    </td>
                    {isAdmin && (
                      <td style={S.td}>
                        {isEditing ? (
                          <>
                            <button style={S.editSave} onClick={() => handleEdit(loc.id)} disabled={editSaving}>
                              {editSaving ? '...' : 'Save'}
                            </button>
                            <button style={S.editCancel} onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button style={S.actionBtn} onClick={() => openEdit(loc)}>Edit</button>
                            <button style={S.deleteBtn} onClick={() => handleDelete(loc)}>Delete</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
