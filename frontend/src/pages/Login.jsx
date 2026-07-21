import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
  },
  card: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    padding: '40px',
    width: '360px',
    boxShadow: 'var(--shadow-lg)',
    textAlign: 'center',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--text-1)',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-3)',
    marginTop: '4px',
    lineHeight: 1.5,
  },
  note: {
    marginTop: '18px',
    fontSize: '13px',
    color: 'var(--text-3)',
    lineHeight: 1.6,
  },
};

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      navigate('/store/item-master', { replace: true });
    }
  }, [navigate]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.title}>FG Inventory</p>
        <p style={styles.subtitle}>Food &amp; Grains Management System</p>
        <p style={styles.note}>
          Local demo mode is active. Redirecting to Store Item Master.
        </p>
      </div>
    </div>
  );
}
