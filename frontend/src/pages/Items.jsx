import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import ItemForm from '../components/ItemForm';
import Nav from '../components/Nav';
import GuidedTour from '../components/GuidedTour';
import { safeUser } from '../lib/safeUser';
import { getCategoryColor, prewarmImages } from '../lib/itemImage';
import FoodPhoto from '../components/FoodPhoto';

// ─── Style tokens (all vars from index.html) ───────────────────────────────

const s = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
  },

  // Page header
  pageHeader: {
    padding: '24px 32px 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pageTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--text-1)',
    margin: 0,
  },
  pageSubtitle: {
    fontSize: '13px',
    color: 'var(--text-3)',
    marginTop: '2px',
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    paddingTop: '2px',
  },

  // Buttons
  btnPrimary: {
    padding: '8px 16px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  btnSecondary: {
    padding: '8px 14px',
    background: 'var(--surface)',
    color: 'var(--text-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },

  // Metrics strip
  metricsStrip: {
    display: 'flex',
    gap: '12px',
    padding: '16px 32px',
    flexWrap: 'wrap',
  },
  metricCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '140px',
    boxShadow: 'var(--shadow-sm)',
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--text-1)',
    lineHeight: 1,
  },
  metricLabel: {
    fontSize: '12px',
    color: 'var(--text-3)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },

  // Filter bar
  filterSection: {
    padding: '12px 32px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
    marginBottom: '0',
  },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '10px',
    color: 'var(--text-4)',
    pointerEvents: 'none',
    lineHeight: 1,
  },
  searchInput: {
    padding: '8px 12px 8px 32px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    background: 'var(--bg)',
    color: 'var(--text-1)',
    outline: 'none',
    width: '220px',
    transition: 'border-color 0.15s',
  },
  filterSelect: {
    padding: '7px 28px 7px 10px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    background: 'var(--surface)',
    color: 'var(--text-2)',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    outline: 'none',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    minWidth: '140px',
  },

  // Status tab group
  tabGroup: {
    display: 'flex',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    marginLeft: 'auto',
  },
  tab: {
    padding: '7px 14px',
    border: 'none',
    background: 'transparent',
    fontSize: '13px',
    cursor: 'pointer',
    color: 'var(--text-3)',
    fontWeight: '500',
    transition: 'background 0.12s, color 0.12s',
  },
  tabActive: {
    background: 'var(--primary)',
    color: '#fff',
  },

  // Table
  tableWrap: {
    margin: '16px 32px 32px',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
  },
  tableScroll: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '11px 14px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  thCheck: {
    padding: '11px 14px',
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-3)',
    background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)',
    width: '40px',
  },
  td: {
    padding: '12px 14px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-2)',
    fontSize: '13px',
    verticalAlign: 'middle',
  },
  tdCheck: {
    padding: '12px 14px',
    borderBottom: '1px solid var(--border)',
    textAlign: 'center',
    verticalAlign: 'middle',
    width: '40px',
  },

  // Item code chip
  codeChip: {
    fontFamily: 'ui-monospace, "Cascadia Code", "SF Mono", monospace',
    fontSize: '11px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 7px',
    color: 'var(--text-2)',
    display: 'inline-block',
  },

  // Name link button
  nameLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'var(--primary)',
    fontSize: '13px',
    fontWeight: '500',
    textAlign: 'left',
  },

  // Pills
  pillBase: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '20px',
    padding: '2px 10px',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },

  // Action cells
  actionsCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  viewBtn: {
    background: 'none',
    border: 'none',
    padding: '2px 4px',
    cursor: 'pointer',
    color: 'var(--primary)',
    fontSize: '13px',
    fontWeight: '500',
  },
  moreBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '3px 7px',
    cursor: 'pointer',
    color: 'var(--text-3)',
    fontSize: '15px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
  },

  // Overflow dropdown
  dropdownWrap: {
    position: 'relative',
    display: 'inline-block',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 50,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    minWidth: '158px',
    padding: '4px 0',
    marginTop: '4px',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '8px 14px',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    fontSize: '13px',
    color: 'var(--text-2)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  dropdownDanger: {
    color: 'var(--danger)',
  },

  // Empty/loading state
  emptyState: {
    padding: '48px',
    textAlign: 'center',
    color: 'var(--text-4)',
    fontSize: '14px',
  },

  // Bulk bar (fixed floating)
  bulkBar: {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%) translateX(110px)',
    background: 'var(--text-1)',
    color: '#fff',
    borderRadius: 'var(--radius-lg)',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 50,
    whiteSpace: 'nowrap',
  },
  bulkLabel: {
    fontSize: '13px',
    fontWeight: '600',
  },
  bulkSelect: {
    padding: '6px 28px 6px 10px',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    outline: 'none',
    minWidth: '160px',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
  },
  bulkApplyBtn: {
    padding: '7px 14px',
    borderRadius: 'var(--radius)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  bulkClearBtn: {
    padding: '7px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    fontSize: '13px',
  },

  // Modal overlay
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15,23,42,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)',
  },
  modalBox: {
    background: 'var(--surface)',
    borderRadius: '16px',
    padding: '28px',
    width: '500px',
    maxWidth: 'calc(100vw - 40px)',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--border)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  modalTitle: {
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--text-1)',
    margin: 0,
  },
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-3)',
    fontSize: '20px',
    lineHeight: 1,
    padding: '2px 4px',
    borderRadius: 'var(--radius-sm)',
  },
  dropZone: {
    border: '2px dashed var(--border-strong)',
    borderRadius: 'var(--radius)',
    padding: '28px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    background: 'var(--bg)',
    marginBottom: '16px',
    color: 'var(--text-3)',
    fontSize: '13px',
    transition: 'border-color 0.15s, background 0.15s',
  },
  dropZoneActive: {
    borderColor: 'var(--primary)',
    background: 'var(--primary-dim)',
    color: 'var(--primary)',
  },
  resultBox: {
    background: 'var(--surface-2)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    padding: '12px 14px',
    fontSize: '13px',
    marginTop: '12px',
    maxHeight: '180px',
    overflowY: 'auto',
  },
  errItem: {
    color: 'var(--danger)',
    marginBottom: '3px',
    fontSize: '12px',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function stockPillStyle(kg) {
  if (kg <= 0) {
    return { background: 'var(--danger-dim)', color: 'var(--danger)' };
  }
  return { background: 'var(--success-dim)', color: 'var(--success)' };
}

function statusPillStyle(isActive) {
  if (isActive) {
    return { background: 'var(--success-dim)', color: 'var(--success)' };
  }
  return { background: 'var(--border)', color: 'var(--text-3)' };
}

// ─── Bulk Import Modal ──────────────────────────────────────────────────────

function BulkImportModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  function handleFileDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0] || e.target.files?.[0];
    if (f) setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await client.post('/items/bulk-import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data.data);
      if (onDone) onDone();
    } catch (e) {
      setResult({
        imported: 0,
        skipped: 0,
        errors: [{ row: '-', error: e.response?.data?.error || 'Upload failed' }],
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const res = await client.get('/items/bulk-template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'item-master-template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download template');
    }
  }

  const dropZoneStyle = {
    ...s.dropZone,
    ...(dragging ? s.dropZoneActive : {}),
  };

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modalBox}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Bulk Import Items</h2>
          <button style={s.modalCloseBtn} onClick={onClose} title="Close">&#x2715;</button>
        </div>

        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button style={s.btnSecondary} onClick={handleDownloadTemplate}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M3 5.5l3.5 3.5L10 5.5M1 10.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Download Template
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-4)' }}>
            Fill the .xlsx template, then upload below
          </span>
        </div>

        <div
          style={dropZoneStyle}
          onClick={() => fileRef.current && fileRef.current.click()}
          onDrop={handleFileDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
        >
          {file ? (
            <span style={{ color: 'var(--success)', fontWeight: '600', fontSize: '13px' }}>
              <span style={{ marginRight: '6px' }}>&#x2713;</span>{file.name}
            </span>
          ) : (
            <>
              <div style={{ fontSize: '28px', marginBottom: '8px', color: 'var(--text-4)' }}>&#x1F4C2;</div>
              <div style={{ fontWeight: '500', color: 'var(--text-2)', marginBottom: '4px' }}>
                Drag & drop Excel file here
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-4)' }}>or click to select (.xlsx, .xls)</div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileDrop}
          />
        </div>

        {result && (
          <div style={s.resultBox}>
            <div style={{
              fontWeight: '700',
              marginBottom: '6px',
              color: result.imported > 0 ? 'var(--success)' : 'var(--warning)',
            }}>
              Imported: {result.imported} &nbsp;&middot;&nbsp; Skipped: {result.skipped}
            </div>
            {result.errors && result.errors.length > 0 && result.errors.map((e, i) => (
              <div key={i} style={s.errItem}>Row {e.row}: {e.error}</div>
            ))}
          </div>
        )}

        <div style={s.modalFooter}>
          <button style={s.btnSecondary} onClick={onClose}>Close</button>
          <button
            style={{ ...s.btnPrimary, opacity: !file || uploading ? 0.55 : 1 }}
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row Overflow Menu ──────────────────────────────────────────────────────

function RowMenu({ item, isActive, canWrite, userRole, onEdit, onClone, onToggle, onDelete, onLabel, isOpen, onOpenToggle }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        onOpenToggle(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen, onOpenToggle]);

  return (
    <div style={s.actionsCell}>
      <button style={s.viewBtn} onClick={onLabel} title="Print label">
        Label
      </button>
      <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          style={s.moreBtn}
          onClick={() => onOpenToggle(isOpen ? null : item.id)}
          title="More actions"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          &#x22EE;
        </button>
        {isOpen && (
          <div style={s.dropdown}>
            {canWrite && (
              <button
                style={s.dropdownItem}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                onClick={() => { onOpenToggle(null); onEdit(); }}
              >
                Edit
              </button>
            )}
            {canWrite && (
              <button
                style={s.dropdownItem}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                onClick={() => { onOpenToggle(null); onClone(); }}
              >
                Clone
              </button>
            )}
            {canWrite && userRole === 'admin' && (
              <button
                style={s.dropdownItem}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                onClick={() => { onOpenToggle(null); onToggle(); }}
              >
                {isActive ? 'Deactivate' : 'Activate'}
              </button>
            )}
            {canWrite && userRole === 'admin' && (
              <button
                style={{ ...s.dropdownItem, ...s.dropdownDanger }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-dim)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                onClick={() => { onOpenToggle(null); onDelete(); }}
              >
                Delete
              </button>
            )}
            {!canWrite && (
              <div style={{ padding: '8px 14px', fontSize: '12px', color: 'var(--text-4)' }}>
                No actions available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

function ItemThumb({ item, onClick }) {
  return <FoodPhoto item={item} size={40} radius={8} onClick={onClick} />;
}

export default function Items() {
  const navigate = useNavigate();
  const user = safeUser();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [locations, setLocations] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('true'); // 'true' | 'false' | 'all'
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const debounceRef = useRef(null);
  const [showTour, setShowTour] = useState(!localStorage.getItem('fg_tour_done'));
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLocation, setBulkLocation] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);

  function handleTourDone() {
    localStorage.setItem('fg_tour_done', '1');
    setShowTour(false);
  }

  const fetchItems = useCallback(async (q, catId, actFilter, locId, tId) => {
    setLoading(true);
    try {
      const params = {};
      if (q) params.search = q;
      if (catId) params.category_id = catId;
      params.active = actFilter;
      if (locId) params.location_id = locId;
      if (tId) params.tag_id = tId;
      const res = await client.get('/items', { params });
      const loaded = res.data.data || [];
      setItems(loaded);
      prewarmImages(loaded);
    } catch (err) {
      console.error('Failed to load items', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    client.get('/categories').then(res => setCategories(res.data.data || []));
    client.get('/tags').then(res => setTags(res.data.data || [])).catch(() => {});
    client.get('/locations').then(res => setLocations(res.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchItems(search, categoryFilter, activeFilter, locationFilter, tagFilter);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, categoryFilter, activeFilter, locationFilter, tagFilter, fetchItems]);

  function openAdd() {
    setEditingItem(null);
    setShowForm(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setShowForm(true);
  }

  async function handleSave(payload) {
    if (editingItem) {
      await client.put(`/items/${editingItem.id}`, payload);
    } else {
      await client.post('/items', payload);
    }
    setShowForm(false);
    fetchItems(search, categoryFilter, activeFilter, locationFilter, tagFilter);
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.item_code} — ${item.variant_grade || item.sub_category_name}"? This cannot be undone.`)) return;
    try {
      await client.delete(`/items/${item.id}`);
      fetchItems(search, categoryFilter, activeFilter, locationFilter, tagFilter);
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  }

  async function handleToggleActive(item) {
    const action = item.is_active !== false ? 'Deactivate' : 'Activate';
    if (!window.confirm(`${action} item "${item.item_code}"?`)) return;
    try {
      await client.patch(`/items/${item.id}/toggle-active`);
      fetchItems(search, categoryFilter, activeFilter, locationFilter, tagFilter);
    } catch (err) {
      alert(err.response?.data?.error || 'Toggle failed');
    }
  }

  function toggleSelectItem(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (selectedIds.length === items.length && items.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(i => i.id));
    }
  }

  async function handleBulkApplyLocation() {
    if (!bulkLocation || selectedIds.length === 0) return;
    try {
      await client.patch('/items/bulk', { ids: selectedIds, fields: { location_id: Number(bulkLocation) } });
      setSelectedIds([]);
      setBulkLocation('');
      fetchItems(search, categoryFilter, activeFilter, locationFilter, tagFilter);
    } catch (err) {
      alert(err.response?.data?.error || 'Bulk update failed');
    }
  }

  async function handleClone(item) {
    try {
      const res = await client.post(`/items/${item.id}/clone`);
      const newId = res.data.data?.id || res.data.id;
      if (newId) navigate('/items/' + newId);
      else fetchItems(search, categoryFilter, activeFilter, locationFilter, tagFilter);
    } catch (err) {
      alert(err.response?.data?.error || 'Clone failed');
    }
  }

  const canWrite = ['admin', 'purchase'].includes(user.role);

  // Metrics
  const totalItems = items.length;
  const activeItems = items.filter(i => i.is_active !== false).length;
  const lowStockItems = items.filter(i => (parseFloat(i.live_stock_kg) || 0) === 0).length;

  const colSpan = canWrite ? 11 : 10;

  const searchInputStyle = {
    ...s.searchInput,
    borderColor: searchFocused ? 'var(--primary)' : undefined,
    boxShadow: searchFocused ? '0 0 0 2px var(--primary-dim)' : undefined,
  };

  return (
    <div style={s.page}>
      {showTour && <GuidedTour onDone={handleTourDone} />}
      <Nav />

      {/* ── Page Header ── */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Item Master</h1>
          <p style={s.pageSubtitle}>Manage your inventory catalog</p>
        </div>
        <div style={s.headerActions}>
          {canWrite && (
            <button style={s.btnSecondary} onClick={() => setShowImport(true)}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v7M3 5.5l3.5 3.5L10 5.5M1 10.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Bulk Import
            </button>
          )}
          {canWrite && (
            <button style={s.btnPrimary} onClick={openAdd}>
              <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
              Add Item
            </button>
          )}
        </div>
      </div>

      {/* ── Metrics Strip ── */}
      <div style={s.metricsStrip}>
        <div style={s.metricCard}>
          <span style={s.metricValue}>{totalItems}</span>
          <span style={s.metricLabel}>Total Items</span>
        </div>
        <div style={s.metricCard}>
          <span style={{ ...s.metricValue, color: 'var(--success)' }}>{activeItems}</span>
          <span style={s.metricLabel}>Active</span>
        </div>
        <div style={s.metricCard}>
          <span style={{ ...s.metricValue, color: lowStockItems > 0 ? 'var(--danger)' : 'var(--text-4)' }}>
            {lowStockItems}
          </span>
          <span style={s.metricLabel}>Out of Stock</span>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div style={s.filterSection}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </span>
          <input
            style={searchInputStyle}
            placeholder="Search code, barcode, name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>

        <select
          style={s.filterSelect}
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          style={s.filterSelect}
          value={locationFilter}
          onChange={e => setLocationFilter(e.target.value)}
        >
          <option value="">All Locations</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.path || l.name}</option>
          ))}
        </select>

        <select
          style={s.filterSelect}
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
        >
          <option value="">All Tags</option>
          {tags.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}{t.item_count != null ? ` (${t.item_count})` : ''}
            </option>
          ))}
        </select>

        {/* Status pill-tabs — right-aligned */}
        <div style={s.tabGroup}>
          {[
            { label: 'Active', value: 'true' },
            { label: 'All', value: 'all' },
            { label: 'Inactive', value: 'false' },
          ].map(tab => (
            <button
              key={tab.value}
              style={activeFilter === tab.value ? { ...s.tab, ...s.tabActive } : s.tab}
              onClick={() => setActiveFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div style={s.tableWrap}>
        <div style={s.tableScroll}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.thCheck}>
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.length === items.length}
                    onChange={toggleSelectAll}
                    title="Select all"
                    style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </th>
                <th style={{ ...s.th, width: '52px', padding: '10px 8px' }}></th>
                <th style={s.th}>Item Code</th>
                <th style={s.th}>Name / Grade</th>
                <th style={s.th}>Sub-Category</th>
                <th style={s.th}>Unit</th>
                <th style={s.th}>Purchase Rate</th>
                <th style={s.th}>MRP</th>
                <th style={s.th}>Live Stock</th>
                <th style={s.th}>Status</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colSpan} style={s.emptyState}>
                    <span style={{ opacity: 0.6 }}>Loading items...</span>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={colSpan} style={s.emptyState}>
                    No items found
                  </td>
                </tr>
              )}
              {!loading && items.map(item => {
                const kg = parseFloat(item.live_stock_kg) || 0;
                const isActive = item.is_active !== false;
                const isSelected = selectedIds.includes(item.id);

                const rowStyle = {
                  opacity: isActive ? 1 : 0.7,
                  background: isSelected ? 'var(--primary-dim)' : undefined,
                  cursor: 'default',
                  transition: 'background 0.1s',
                };

                return (
                  <tr
                    key={item.id}
                    style={rowStyle}
                    onMouseEnter={e => !isSelected && (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => !isSelected && (e.currentTarget.style.background = '')}
                  >
                    <td style={s.tdCheck}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectItem(item.id)}
                        style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                      />
                    </td>
                    <td style={{ ...s.td, padding: '6px 8px', width: '52px' }}>
                      <ItemThumb item={item} onClick={() => navigate('/items/' + item.id)} />
                    </td>
                    <td style={s.td}>
                      <button
                        style={s.nameLink}
                        onClick={() => navigate('/items/' + item.id)}
                      >
                        <span style={s.codeChip}>{item.item_code}</span>
                      </button>
                    </td>
                    <td style={s.td}>
                      <div style={{ fontWeight: '500', color: 'var(--text-1)', fontSize: '13px' }}>
                        {item.variant_grade || item.sub_category_name || '—'}
                      </div>
                      {item.barcode && (
                        <div style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '2px', fontFamily: 'ui-monospace, monospace' }}>
                          {item.barcode}
                        </div>
                      )}
                    </td>
                    <td style={{ ...s.td, color: 'var(--text-3)' }}>
                      {item.sub_category_name || '—'}
                    </td>
                    <td style={{ ...s.td, color: 'var(--text-3)' }}>
                      {item.unit}
                    </td>
                    <td style={s.td}>
                      {item.purchase_rate
                        ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>&#x20B9;{item.purchase_rate}</span>
                        : <span style={{ color: 'var(--text-4)' }}>—</span>}
                    </td>
                    <td style={s.td}>
                      {item.mrp
                        ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>&#x20B9;{item.mrp}</span>
                        : <span style={{ color: 'var(--text-4)' }}>—</span>}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.pillBase, ...stockPillStyle(kg) }}>
                        {kg.toFixed(2)}&nbsp;{item.unit}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.pillBase, padding: '3px 10px', ...statusPillStyle(isActive) }}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <RowMenu
                        item={item}
                        isActive={isActive}
                        canWrite={canWrite}
                        userRole={user.role}
                        onEdit={() => openEdit(item)}
                        onClone={() => handleClone(item)}
                        onToggle={() => handleToggleActive(item)}
                        onDelete={() => handleDelete(item)}
                        onLabel={() => window.open('/api/items/' + item.id + '/label', '_blank')}
                        isOpen={openMenuId === item.id}
                        onOpenToggle={setOpenMenuId}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Floating Bulk Bar ── */}
      {canWrite && selectedIds.length > 0 && (
        <div style={s.bulkBar}>
          <span style={s.bulkLabel}>
            {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
          </span>
          <select
            style={s.bulkSelect}
            value={bulkLocation}
            onChange={e => setBulkLocation(e.target.value)}
          >
            <option value="">Set Location</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.path || l.name}</option>
            ))}
          </select>
          <button
            style={{ ...s.bulkApplyBtn, opacity: !bulkLocation ? 0.5 : 1 }}
            onClick={handleBulkApplyLocation}
            disabled={!bulkLocation}
          >
            Apply
          </button>
          <button style={s.bulkClearBtn} onClick={() => setSelectedIds([])}>
            Clear
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {showForm && (
        <ItemForm
          item={editingItem}
          categories={categories}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}

      {showImport && (
        <BulkImportModal
          onClose={() => setShowImport(false)}
          onDone={() => fetchItems(search, categoryFilter, activeFilter, locationFilter, tagFilter)}
        />
      )}
    </div>
  );
}
