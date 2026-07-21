import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Nav from '../components/Nav';

export default function InvoiceBank() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);

  async function fetchList() {
    setLoading(true);
    try {
      const res = await client.get('/invoice-bank?limit=50');
      setRows(res.data.data || []);
      setMeta(res.data.meta || {});
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchList(); }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Nav />
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <h2>Invoice Bank</h2>
        {loading ? <p>Loading...</p> : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--surface-2)' }}>
                <tr>
                  <th style={{ padding: 10, textAlign: 'left' }}>ID</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Invoice #</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Vendor</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Date</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Status</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Saved At</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: 10, fontFamily: 'monospace' }}>#{r.id}</td>
                    <td style={{ padding: 10 }}>{r.invoice_no || '—'}</td>
                    <td style={{ padding: 10 }}>{r.vendor_id || '—'}</td>
                    <td style={{ padding: 10 }}>{r.invoice_date || '—'}</td>
                    <td style={{ padding: 10 }}>{r.status}</td>
                    <td style={{ padding: 10 }}>{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
