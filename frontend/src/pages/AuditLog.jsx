import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Nav from '../components/Nav';
import { safeUser } from '../lib/safeUser';

const S = {
  page:         { minHeight: '100vh', background: 'var(--bg)' },
  content:      { padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' },
  pageTitle:    { margin: '0 0 16px', fontSize: '20px', fontWeight: '700', color: 'var(--text-1)' },
  filterBar:    { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' },
  filterSelect: { padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text-1)', minWidth: '160px' },
  dateInput:    { padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text-1)' },
  resetBtn:     { padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px' },
  tableWrap:    { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'auto' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:           { background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td:           { padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'top' },
  actionBadge:  { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' },
  mono:         { fontFamily: 'monospace', fontSize: '12px', background: 'var(--surface-2)', padding: '2px 5px', borderRadius: 'var(--radius)', color: 'var(--text-2)' },
  empty:        { padding: '48px', textAlign: 'center', color: 'var(--text-4)' },
  pagination:   { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' },
  pageBtn:      { padding: '5px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px', color: 'var(--text-2)' },
  pageBtnDis:   { padding: '5px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', cursor: 'not-allowed', fontSize: '13px', color: 'var(--text-2)', opacity: 0.4 },
  pageInfo:     { fontSize: '13px', color: 'var(--text-3)' },
  denied:       { padding: '60px', textAlign: 'center' },
  deniedTitle:  { fontSize: '28px', fontWeight: '800', color: 'var(--danger)', marginBottom: '8px' },
  deniedMsg:    { color: 'var(--text-3)', fontSize: '15px' },
  addBtn:       { padding: '8px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  pre:          { margin: 0, fontSize: '11px', color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }
};

const ACTION_COLORS = {
  INSERT: { background: 'var(--success-dim)', color: 'var(--success)' },
  UPDATE: { background: 'var(--primary-dim)', color: 'var(--primary)' },
  DELETE: { background: 'var(--danger-dim)', color: 'var(--danger)' },
  LOCK:   { background: 'rgba(245,158,11,0.1)', color: '#92400e' }
};

function actionStyle(action) {
  return { ...S.actionBadge, ...(ACTION_COLORS[action] || { background: 'var(--surface-2)', color: 'var(--text-3)' }) };
}

function JsonCell({ value }) {
  if (!value) return <span style={{ color: 'var(--text-4)' }}>—</span>;
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return <span style={S.mono}>{String(value)}</span>;
  }
  const text = JSON.stringify(parsed, null, 2);
  return (
    <details>
      <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--primary)', userSelect: 'none' }}>
        View JSON
      </summary>
      <pre style={S.pre}>{text}</pre>
    </details>
  );
}

export default function AuditLog() {
  const navigate = useNavigate();
  const currentUser = safeUser();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const [filterUser, setFilterUser] = useState('');
  const [filterTable, setFilterTable] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const [userOptions, setUserOptions] = useState([]);
  const [tableOptions, setTableOptions] = useState([]);

  const pageRef = useRef(1);

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

  const fetchLog = useCallback(async (page) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filterUser) params.user_id = filterUser;
      if (filterTable) params.table_name = filterTable;
      if (filterAction) params.action = filterAction;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const res = await client.get('/audit-log', { params });
      setRows(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Failed to load audit log', err);
    } finally {
      setLoading(false);
    }
  }, [filterUser, filterTable, filterAction, filterFrom, filterTo]);

  useEffect(() => {
    pageRef.current = 1;
    fetchLog(1);
  }, [fetchLog]);

  useEffect(() => {
    client.get('/audit-log/users').then(res => setUserOptions(res.data.data || [])).catch(() => {});
    client.get('/audit-log/tables').then(res => setTableOptions(res.data.data || [])).catch(() => {});
  }, []);

  function goPage(p) {
    pageRef.current = p;
    fetchLog(p);
  }

  function handleReset() {
    setFilterUser('');
    setFilterTable('');
    setFilterAction('');
    setFilterFrom('');
    setFilterTo('');
  }

  const { page, totalPages, total } = pagination;

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <h2 style={S.pageTitle}>Audit Log</h2>

        <div style={S.filterBar}>
          <select
            style={S.filterSelect}
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
          >
            <option value="">All Users</option>
            {userOptions.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>

          <select
            style={S.filterSelect}
            value={filterTable}
            onChange={e => setFilterTable(e.target.value)}
          >
            <option value="">All Tables</option>
            {tableOptions.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            style={{ ...S.filterSelect, minWidth: '130px' }}
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
          >
            <option value="">All Actions</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="LOCK">LOCK</option>
          </select>

          <input
            type="date"
            style={S.dateInput}
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            title="From date"
          />
          <input
            type="date"
            style={S.dateInput}
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            title="To date"
          />

          <button style={S.resetBtn} onClick={handleReset}>Clear Filters</button>
        </div>

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Timestamp</th>
                <th style={S.th}>User</th>
                <th style={S.th}>Action</th>
                <th style={S.th}>Table</th>
                <th style={S.th}>Record ID</th>
                <th style={S.th}>Old Value</th>
                <th style={S.th}>New Value</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={S.empty}>Loading...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} style={S.empty}>No audit records found</td></tr>
              )}
              {!loading && rows.map(row => (
                <tr key={row.id}>
                  <td style={S.td}>
                    <span style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                      {new Date(row.created_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: false
                      })}
                    </span>
                  </td>
                  <td style={S.td}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-1)' }}>{row.user_name || '—'}</div>
                    {row.user_email && (
                      <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>{row.user_email}</div>
                    )}
                  </td>
                  <td style={S.td}>
                    <span style={actionStyle(row.action)}>{row.action}</span>
                  </td>
                  <td style={S.td}>
                    <span style={S.mono}>{row.table_name || '—'}</span>
                  </td>
                  <td style={S.td}>
                    {row.record_id != null
                      ? <span style={S.mono}>{row.record_id}</span>
                      : <span style={{ color: 'var(--text-4)' }}>—</span>
                    }
                  </td>
                  <td style={S.td}><JsonCell value={row.old_value} /></td>
                  <td style={S.td}><JsonCell value={row.new_value} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={S.pagination}>
            <span style={S.pageInfo}>
              {total} record{total !== 1 ? 's' : ''}
              {totalPages > 1 && ` — page ${page} of ${totalPages}`}
            </span>
            <button
              style={page <= 1 ? S.pageBtnDis : S.pageBtn}
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
            >
              Prev
            </button>
            <button
              style={page >= totalPages ? S.pageBtnDis : S.pageBtn}
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
