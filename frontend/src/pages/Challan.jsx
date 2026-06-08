import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';

const S = {
  page: { fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '32px 24px', color: '#111' },
  noPrint: { marginBottom: '24px' },
  printBtn: { padding: '9px 22px', borderRadius: '4px', border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '700', marginRight: '10px' },
  backBtn: { padding: '9px 16px', borderRadius: '4px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '14px' },
  header: { borderBottom: '2px solid #1a1a2e', paddingBottom: '16px', marginBottom: '24px' },
  companyName: { fontSize: '22px', fontWeight: '800', color: '#1a1a2e', margin: '0 0 4px' },
  challanLabel: { fontSize: '13px', color: '#555', margin: 0 },
  challanNo: { fontSize: '20px', fontWeight: '800', color: '#2e7d32', fontFamily: 'monospace', float: 'right', marginTop: '-28px' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' },
  infoBox: { background: '#f9fafb', borderRadius: '6px', padding: '12px 14px' },
  infoLabel: { fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' },
  infoValue: { fontSize: '14px', fontWeight: '600', color: '#222' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', marginBottom: '24px' },
  thead: { background: '#1a1a2e', color: '#fff' },
  th: { padding: '10px 12px', textAlign: 'left', fontWeight: '600', fontSize: '13px' },
  td: { padding: '9px 12px', borderBottom: '1px solid #e8e8e8', verticalAlign: 'middle' },
  totalRow: { fontWeight: '700', background: '#f5f5f5' },
  footer: { borderTop: '1px solid #e8e8e8', paddingTop: '16px', marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  sig: { textAlign: 'center' },
  sigLine: { width: '160px', borderTop: '1px solid #333', marginTop: '40px', paddingTop: '6px', fontSize: '12px', color: '#555' }
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Challan() {
  const { id } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get(`/outward/challan/${id}`)
      .then(r => setEntry(r.data.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load challan'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={S.page}><p>Loading challan...</p></div>;
  if (error) return <div style={S.page}><p style={{ color: '#cf1322' }}>{error}</p></div>;
  if (!entry) return <div style={S.page}><p>Challan not found</p></div>;

  const lines = entry.lines || [];
  const total = lines.reduce((sum, l) => sum + (l.rate && l.qty ? parseFloat(l.rate) * parseFloat(l.qty) : 0), 0);

  return (
    <div style={S.page}>
      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } }`}</style>

      <div className="no-print" style={S.noPrint}>
        <button style={S.printBtn} onClick={() => window.print()}>Print Challan</button>
        <button style={S.backBtn} onClick={() => window.history.back()}>Back</button>
      </div>

      <div style={S.header}>
        <p style={S.companyName}>FG Inventory — Food & Grains</p>
        <p style={S.challanLabel}>Delivery Challan</p>
        <div style={S.challanNo}>{entry.challan_no}</div>
      </div>

      <div style={S.infoGrid}>
        <div style={S.infoBox}>
          <div style={S.infoLabel}>Bill To</div>
          <div style={S.infoValue}>{entry.customer_name}</div>
          {entry.customer_contact && <div style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>{entry.customer_contact}</div>}
          {entry.customer_address && <div style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>{entry.customer_address}</div>}
        </div>
        <div style={S.infoBox}>
          <div style={S.infoLabel}>Dispatch Date</div>
          <div style={S.infoValue}>{formatDate(entry.dispatch_date)}</div>
          <div style={{ ...S.infoLabel, marginTop: '10px' }}>Challan No.</div>
          <div style={{ ...S.infoValue, color: '#2e7d32', fontFamily: 'monospace' }}>{entry.challan_no}</div>
        </div>
      </div>

      <table style={S.table}>
        <thead style={S.thead}>
          <tr>
            <th style={S.th}>#</th>
            <th style={S.th}>Item</th>
            <th style={S.th}>Qty</th>
            <th style={S.th}>Rate (₹)</th>
            <th style={S.th}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const amount = l.rate && l.qty ? (parseFloat(l.rate) * parseFloat(l.qty)).toFixed(2) : '—';
            const name = l.variant_grade ? `${l.sub_category_name} — ${l.variant_grade}` : l.sub_category_name;
            return (
              <tr key={l.id}>
                <td style={S.td}>{idx + 1}</td>
                <td style={S.td}>{name}<div style={{ fontSize: '11px', color: '#999', fontFamily: 'monospace' }}>{l.item_code}</div></td>
                <td style={S.td}>{l.qty} {l.unit}</td>
                <td style={S.td}>{l.rate ? `₹${parseFloat(l.rate).toFixed(2)}` : '—'}</td>
                <td style={S.td}>{l.rate ? `₹${amount}` : '—'}</td>
              </tr>
            );
          })}
          <tr style={S.totalRow}>
            <td colSpan="4" style={{ ...S.td, textAlign: 'right', fontWeight: '700', paddingRight: '16px' }}>Total Amount</td>
            <td style={{ ...S.td, fontWeight: '800', fontSize: '15px', color: '#2e7d32' }}>₹{total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div style={S.footer}>
        <div style={{ fontSize: '12px', color: '#888' }}>
          <p style={{ margin: '0 0 4px' }}>Generated: {new Date().toLocaleString('en-IN')}</p>
          <p style={{ margin: 0 }}>This is a computer-generated document.</p>
        </div>
        <div style={S.sig}>
          <div style={S.sigLine}>Authorised Signatory</div>
        </div>
      </div>
    </div>
  );
}
