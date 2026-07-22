import React, { useEffect, useMemo, useState } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';
import { safeUser } from '../lib/safeUser';

const styles = {
  page: { background: '#f0f2f5', minHeight: '100vh' },
  container: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#1a1a2e', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  metaPill: { fontSize: '12px', color: '#666', background: '#fff', border: '1px solid #ddd', padding: '4px 10px', borderRadius: '12px' },
  addBtn: {
    padding: '8px 16px', background: '#2d6a4f', color: '#fff', border: 'none',
    borderRadius: '5px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
  },
  searchRow: { display: 'flex', gap: '10px', marginBottom: '18px' },
  searchInput: {
    flex: 1, padding: '10px 14px', border: '1px solid #ddd', borderRadius: '6px',
    fontSize: '14px', outline: 'none', background: '#fff'
  },
  categorySelect: {
    padding: '10px 14px', border: '1px solid #ddd', borderRadius: '6px',
    fontSize: '14px', background: '#fff', minWidth: '220px', outline: 'none'
  },
  catCard: {
    background: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    marginBottom: '16px', overflow: 'hidden'
  },
  catHead: {
    padding: '14px 18px', background: '#1a1a2e', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
  },
  catName: { fontSize: '15px', fontWeight: '700', letterSpacing: '0.2px', margin: 0 },
  catCount: { fontSize: '12px', color: '#e2b96f', background: 'rgba(226,185,111,0.16)', padding: '3px 10px', borderRadius: '10px' },
  subBlock: { borderTop: '1px solid #f0f0f0', padding: '12px 18px' },
  subName: { fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '8px' },
  itemGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' },
  itemRow: {
    padding: '8px 12px', background: '#f8f9fb', borderRadius: '5px',
    border: '1px solid #eaeaea', fontSize: '13px', position: 'relative'
  },
  itemRowCustom: { background: '#eef7f0', border: '1px solid #b7dfc4' },
  customBadge: {
    fontSize: '10px', color: '#2d6a4f', background: '#d4edda',
    padding: '1px 6px', borderRadius: '8px', marginLeft: '6px', fontWeight: '600'
  },
  itemName: { fontWeight: '600', color: '#1a1a2e' },
  itemAliases: { fontSize: '11px', color: '#888', marginTop: '3px', lineHeight: 1.4 },
  deleteBtn: {
    position: 'absolute', top: '6px', right: '6px',
    background: 'transparent', border: 'none', color: '#cf1322',
    cursor: 'pointer', fontSize: '14px', padding: '0 4px'
  },
  empty: { padding: '40px', textAlign: 'center', color: '#888', background: '#fff', borderRadius: '8px' },
  error: { padding: '12px 16px', background: '#fff1f0', color: '#cf1322', borderRadius: '6px', border: '1px solid #ffa39e', marginBottom: '16px' },
  loading: { padding: '40px', textAlign: 'center', color: '#888' },

  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
  },
  modal: { background: '#fff', borderRadius: '8px', width: '460px', padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  modalTitle: { fontSize: '18px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 18px' },
  formLabel: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#444', marginBottom: '5px' },
  formInput: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box', outline: 'none' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' },
  cancelBtn: { padding: '8px 16px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' },
  saveBtn: { padding: '8px 16px', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  modalError: { padding: '8px 10px', background: '#fff1f0', color: '#cf1322', borderRadius: '4px', border: '1px solid #ffa39e', fontSize: '12px', marginBottom: '12px' },
};

const user = safeUser();

export default function Catalog() {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [collapsed, setCollapsed] = useState({});
  const [showAdd, setShowAdd] = useState(false);

  function loadCatalog() {
    setError('');
    return client.get('/normalize/catalog')
      .then(res => setTree(res.data.data))
      .catch(err => setError(err.response?.data?.error || err.message));
  }

  useEffect(() => { loadCatalog(); }, []);

  const filtered = useMemo(() => {
    if (!tree) return null;
    const q = search.trim().toLowerCase();
    return tree.categories
      .filter(c => categoryFilter === 'all' || c.category === categoryFilter)
      .map(c => {
        const sub_categories = c.sub_categories
          .map(sc => {
            const items = q
              ? sc.items.filter(it =>
                  it.canonical.toLowerCase().includes(q) ||
                  it.aliases.some(a => a.toLowerCase().includes(q))
                )
              : sc.items;
            return { ...sc, items, item_count: items.length };
          })
          .filter(sc => sc.items.length > 0);
        return { ...c, sub_categories, item_count: sub_categories.reduce((s, x) => s + x.items.length, 0) };
      })
      .filter(c => c.sub_categories.length > 0);
  }, [tree, search, categoryFilter]);

  function toggle(cat) {
    setCollapsed(s => ({ ...s, [cat]: !s[cat] }));
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete custom item "${item.canonical}"?`)) return;
    try {
      await client.delete(`/normalize/catalog/items/${item.id}`);
      await loadCatalog();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  }

  return (
    <div style={styles.page}>
      <Nav />
      <div style={styles.container}>
        <div style={styles.header}>
          <p style={styles.title}>Items Catalog</p>
          <div style={styles.headerRight}>
            {tree && (
              <span style={styles.metaPill}>
                {tree.total_categories} categories · {tree.total_items} items
              </span>
            )}
            <button style={styles.addBtn} onClick={() => setShowAdd(true)}>+ Add Item</button>
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {tree && (
          <div style={styles.searchRow}>
            <input
              style={styles.searchInput}
              placeholder="Search canonical name or alias (try: aloo, kashmiri, basmati, kaju)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select style={styles.categorySelect} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              {tree.categories.map(c => (
                <option key={c.category} value={c.category}>{c.category}</option>
              ))}
            </select>
          </div>
        )}

        {!tree && !error && <div style={styles.loading}>Loading catalog...</div>}

        {filtered && filtered.length === 0 && (
          <div style={styles.empty}>No items match "{search}".</div>
        )}

        {filtered && filtered.map(cat => (
          <div key={cat.category} style={styles.catCard}>
            <div style={styles.catHead} onClick={() => toggle(cat.category)}>
              <p style={styles.catName}>
                {collapsed[cat.category] ? '▸' : '▾'} {cat.category}
              </p>
              <span style={styles.catCount}>{cat.item_count} items · {cat.sub_categories.length} sub-categories</span>
            </div>
            {!collapsed[cat.category] && cat.sub_categories.map(sc => (
              <div key={sc.sub_category} style={styles.subBlock}>
                <div style={styles.subName}>{sc.sub_category} ({sc.items.length})</div>
                <div style={styles.itemGrid}>
                  {sc.items.map(it => (
                    <div
                      key={it.canonical}
                      style={{ ...styles.itemRow, ...(it.is_custom ? styles.itemRowCustom : {}) }}
                    >
                      {it.is_custom && (user.role === 'admin' || it.created_by === user.id) && (
                        <button
                          style={styles.deleteBtn}
                          title="Delete custom item"
                          onClick={() => handleDelete(it)}
                        >✕</button>
                      )}
                      <div style={styles.itemName}>
                        {it.canonical}
                        {it.is_custom && <span style={styles.customBadge}>CUSTOM</span>}
                      </div>
                      <div style={styles.itemAliases}>
                        {it.aliases.length ? it.aliases.slice(0, 6).join(', ') : '—'}
                        {it.aliases.length > 6 ? '…' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

        {showAdd && (
          <AddItemModal
            tree={tree}
            onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); loadCatalog(); }}
          />
        )}
      </div>
    </div>
  );
}

function AddItemModal({ tree, onClose, onSaved }) {
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [canonical, setCanonical] = useState('');
  const [aliases, setAliases] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const subOptions = useMemo(() => {
    if (!tree || !category) return [];
    const cat = tree.categories.find(c => c.category === category);
    return cat ? cat.sub_categories.map(sc => sc.sub_category) : [];
  }, [tree, category]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!category || !subCategory || !canonical.trim()) {
      setError('Category, sub-category, and canonical name are required');
      return;
    }
    setSaving(true);
    try {
      await client.post('/normalize/catalog/items', {
        canonical: canonical.trim(),
        category,
        sub_category: subCategory.trim(),
        aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <p style={styles.modalTitle}>Add Catalog Item</p>
        <form onSubmit={handleSubmit}>
          {error && <div style={styles.modalError}>{error}</div>}

          <label style={styles.formLabel}>Category *</label>
          <select
            style={styles.formInput}
            value={category}
            onChange={e => { setCategory(e.target.value); setSubCategory(''); }}
            required
          >
            <option value="">— Select category —</option>
            {tree && tree.categories.map(c => (
              <option key={c.category} value={c.category}>{c.category}</option>
            ))}
          </select>

          <label style={styles.formLabel}>Sub-category *</label>
          <input
            style={styles.formInput}
            value={subCategory}
            onChange={e => setSubCategory(e.target.value)}
            placeholder="e.g. Root Vegetables (pick existing or type new)"
            list="subcat-options"
            required
          />
          <datalist id="subcat-options">
            {subOptions.map(s => <option key={s} value={s} />)}
          </datalist>

          <label style={styles.formLabel}>Canonical Item Name *</label>
          <input
            style={styles.formInput}
            value={canonical}
            onChange={e => setCanonical(e.target.value)}
            placeholder="e.g. Coconut, Tinda, Olive"
            required
          />

          <label style={styles.formLabel}>Aliases (comma-separated)</label>
          <input
            style={styles.formInput}
            value={aliases}
            onChange={e => setAliases(e.target.value)}
            placeholder="e.g. nariyal, coconut whole, copra"
          />

          <div style={styles.formActions}>
            <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
