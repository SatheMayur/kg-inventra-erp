import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)'
  },
  card: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    padding: '40px',
    width: '360px',
    boxShadow: 'var(--shadow-lg)'
  },
  logo: {
    textAlign: 'center',
    marginBottom: '28px'
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--text-1)',
    margin: 0
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-3)',
    marginTop: '4px'
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-2)',
    marginBottom: '6px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)',
    fontSize: '14px',
    marginBottom: '16px',
    boxSizing: 'border-box',
    outline: 'none',
    color: 'var(--text-1)',
    background: 'var(--surface)'
  },
  button: {
    width: '100%',
    padding: '11px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '4px'
  },
  error: {
    background: 'var(--danger-dim)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 'var(--radius)',
    padding: '10px 12px',
    color: 'var(--danger)',
    fontSize: '13px',
    marginBottom: '16px'
  }
};

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await client.post('/auth/login', { email, password });
      const { token, user } = res.data.data;
      localStorage.setItem('fg_token', token);
      localStorage.setItem('fg_user', JSON.stringify(user));
      navigate('/items');
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <p style={styles.title}>FG Inventory</p>
          <p style={styles.subtitle}>Food &amp; Grains Management System</p>
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div style={styles.error}>{error}</div>}
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@fg.local"
            required
            autoFocus
          />
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
