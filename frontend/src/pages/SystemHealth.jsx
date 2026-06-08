import React, { useState, useEffect, useCallback } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';

const APP_VERSION = 'v1.0.0';

const s = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '1100px', margin: '0 auto' },
  heading: { fontSize: '20px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '20px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' },
  card: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px',
    boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)'
  },
  cardTitle: { fontSize: '15px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '16px' },
  statusRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-2)'
  },
  statusRowLast: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', fontSize: '13px', color: 'var(--text-2)'
  },
  pill: (ok) => ({
    padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
    background: ok ? 'var(--success-dim)' : 'var(--danger-dim)',
    color: ok ? 'var(--success)' : 'var(--danger)'
  }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    background: 'var(--surface-2)', padding: '10px 12px', textAlign: 'left',
    borderBottom: '1px solid var(--border)', fontWeight: '600', fontSize: '11px',
    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap'
  },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', color: 'var(--text-2)' },
  tdAlt: { padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', verticalAlign: 'middle', color: 'var(--text-2)' },
  loading: { color: 'var(--text-3)', padding: '16px', fontSize: '13px' },
  error: { color: 'var(--danger)', padding: '12px', background: 'var(--danger-dim)', borderRadius: 'var(--radius)', fontSize: '13px', border: '1px solid rgba(239,68,68,0.3)' },
  empty: { color: 'var(--text-4)', padding: '24px', textAlign: 'center', fontSize: '13px' },
  btn: {
    padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none',
    background: 'var(--primary)', color: '#fff', cursor: 'pointer',
    fontSize: '13px', fontWeight: '500'
  },
  btnDisabled: {
    padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none',
    background: 'var(--text-4)', color: '#fff', cursor: 'not-allowed',
    fontSize: '13px', fontWeight: '500'
  },
  runRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  runMsg: { fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }
};

function fmtDatetime(val) {
  if (!val) return '—';
  const d = new Date(val);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function CronStatusPill({ result }) {
  if (!result) return <span style={s.pill(false)}>Unknown</span>;
  if (result.error) return <span style={s.pill(false)}>Error</span>;
  return <span style={s.pill(true)}>Success</span>;
}

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [cronLog, setCronLog] = useState([]);
  const [cronLoading, setCronLoading] = useState(true);
  const [cronError, setCronError] = useState(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runMsg, setRunMsg] = useState(null);

  const loadHealth = useCallback(async () => {
    try {
      const res = await client.get('/system/health');
      setHealth(res.data);
    } catch (e) {
      setHealth({ status: 'error', db: 'disconnected' });
    }
  }, []);

  const loadCronLog = useCallback(async () => {
    setCronLoading(true);
    setCronError(null);
    try {
      const res = await client.get('/system/cron-log');
      setCronLog(res.data.data || []);
    } catch (e) {
      setCronError('Failed to load cron log.');
    } finally {
      setCronLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    loadCronLog();
  }, [loadHealth, loadCronLog]);

  async function handleRunNow() {
    setRunLoading(true);
    setRunMsg(null);
    try {
      const res = await client.post('/reports/run-nightly');
      setRunMsg('Nightly job triggered successfully.');
      loadCronLog();
    } catch (e) {
      const msg = e.response?.data?.error || 'Trigger failed.';
      setRunMsg(`Error: ${msg}`);
    } finally {
      setRunLoading(false);
    }
  }

  const lastRun = cronLog.length > 0 ? cronLog[0].ran_at : null;
  const dbOk = health?.db === 'connected';

  return (
    <div style={s.page}>
      <Nav />
      <div style={s.content}>
        <h1 style={s.heading}>System Health</h1>

        <div style={s.grid}>
          {/* System Status Panel */}
          <div style={s.card}>
            <div style={s.cardTitle}>System Status</div>

            <div style={s.statusRow}>
              <span>Database</span>
              {health === null
                ? <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>Checking...</span>
                : <span style={s.pill(dbOk)}>{dbOk ? 'Connected' : 'Disconnected'}</span>
              }
            </div>

            <div style={s.statusRow}>
              <span>Last Nightly Run</span>
              <span style={{ color: 'var(--text-2)', fontWeight: '500' }}>{fmtDatetime(lastRun)}</span>
            </div>

            <div style={s.statusRow}>
              <span>Next Scheduled Run</span>
              <span style={{ color: 'var(--text-2)' }}>Tonight at 2:00 AM</span>
            </div>

            <div style={s.statusRowLast}>
              <span>App Version</span>
              <span style={{ color: 'var(--text-2)', fontWeight: '500' }}>{APP_VERSION}</span>
            </div>
          </div>

          {/* Placeholder for future panels */}
          <div style={s.card}>
            <div style={s.cardTitle}>Quick Actions</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '12px' }}>
              Manually trigger the nightly intelligence job (risk scoring, ROP update, expiry marking).
            </div>
            <div style={s.runRow}>
              <button
                style={runLoading ? s.btnDisabled : s.btn}
                onClick={handleRunNow}
                disabled={runLoading}
              >
                {runLoading ? 'Running...' : 'Run Nightly Job Now'}
              </button>
            </div>
            {runMsg && <div style={s.runMsg}>{runMsg}</div>}
            <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '8px' }}>
              Scheduled automatically at 2:00 AM via server cron.
            </div>
          </div>
        </div>

        {/* Cron Log Table */}
        <div style={s.card}>
          <div style={s.cardTitle}>Recent Cron Job Runs (last 30)</div>

          {cronLoading && <div style={s.loading}>Loading...</div>}
          {cronError && <div style={s.error}>{cronError}</div>}

          {!cronLoading && !cronError && cronLog.length === 0 && (
            <div style={s.empty}>No cron job runs recorded yet.</div>
          )}

          {!cronLoading && !cronError && cronLog.length > 0 && (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Job Name</th>
                  <th style={s.th}>Ran At</th>
                  <th style={s.th}>Batches Scored</th>
                  <th style={s.th}>Items ROP Updated</th>
                  <th style={s.th}>Batches Expired</th>
                  <th style={s.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {cronLog.map((row, i) => {
                  const r = row.result || {};
                  const tdStyle = i % 2 === 0 ? s.td : s.tdAlt;
                  return (
                    <tr key={row.id}>
                      <td style={tdStyle}>{row.job}</td>
                      <td style={tdStyle}>{fmtDatetime(row.ran_at)}</td>
                      <td style={tdStyle}>{r.batchesScored ?? '—'}</td>
                      <td style={tdStyle}>{r.itemsRopUpdated ?? '—'}</td>
                      <td style={tdStyle}>{r.batchesExpired ?? '—'}</td>
                      <td style={tdStyle}><CronStatusPill result={r} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
