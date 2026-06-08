import React, { useState } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';
import { safeUser } from '../lib/safeUser';

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px', maxWidth: '600px', margin: '0 auto' },
  title: { fontSize: '22px', fontWeight: '700', color: 'var(--text-1)', margin: '0 0 8px' },
  subtitle: { fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px' },
  card: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px' },
  cardTitle: { fontSize: '14px', fontWeight: '600', color: 'var(--text-1)', margin: '0 0 14px' },
  label: { display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', marginBottom: '5px' },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box', color: 'var(--text-1)', background: 'var(--surface)' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' },
  btn: { padding: '9px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  err: { background: 'var(--danger-dim)', color: 'var(--danger)', padding: '10px', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: '12px', fontSize: '12px' },
  ok: { background: 'var(--success-dim)', color: 'var(--success)', padding: '10px', borderRadius: 'var(--radius)', border: '1px solid rgba(16,185,129,0.3)', marginBottom: '12px', fontSize: '12px' },
  rules: { fontSize: '11px', color: 'var(--text-4)', margin: '0 0 10px', lineHeight: 1.5 },
};

export default function Profile() {
  const user = safeUser();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setOk('');
    if (next !== confirm) return setErr('New password and confirmation do not match');
    setBusy(true);
    try {
      await client.post('/auth/change-password', { current_password: current, new_password: next });
      setOk('Password changed. Next login will use the new password.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <p style={S.title}>Profile</p>
        <p style={S.subtitle}>Your account details and password.</p>

        <div style={S.card}>
          <p style={S.cardTitle}>Account</p>
          <div style={S.row}><span>Name</span><strong>{user.name || '—'}</strong></div>
          <div style={S.row}><span>Email</span><strong>{user.email || '—'}</strong></div>
          <div style={S.row}><span>Role</span><strong>{user.role || '—'}</strong></div>
          <div style={S.row}><span>User ID</span><strong>{user.id || '—'}</strong></div>
        </div>

        <div style={S.card}>
          <p style={S.cardTitle}>Change password</p>
          <p style={S.rules}>Requirements: min 8 characters, one uppercase, one lowercase, one digit. Must differ from current.</p>
          {err && <div style={S.err}>{err}</div>}
          {ok && <div style={S.ok}>{ok}</div>}
          <form onSubmit={submit}>
            <label style={S.label}>Current password</label>
            <input type="password" style={S.input} value={current} onChange={e => setCurrent(e.target.value)} required />
            <label style={S.label}>New password</label>
            <input type="password" style={S.input} value={next} onChange={e => setNext(e.target.value)} required />
            <label style={S.label}>Confirm new password</label>
            <input type="password" style={S.input} value={confirm} onChange={e => setConfirm(e.target.value)} required />
            <button type="submit" style={S.btn} disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
