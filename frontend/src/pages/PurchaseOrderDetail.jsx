import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import Nav from '../components/Nav';
import { safeUser } from '../lib/safeUser';

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px 28px', maxWidth: '860px', margin: '0 auto' },
  backBtn: { padding: '6px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px', marginBottom: '16px' },
  card: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px' },
  cardTitle: { margin: '0 0 16px', fontSize: '16px', fontWeight: '700', color: 'var(--text-1)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  fieldLabel: { fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  fieldValue: { fontSize: '14px', fontWeight: '600', color: 'var(--text-1)', marginTop: '2px' },
  notesValue: { fontSize: '13px', color: 'var(--text-2)', marginTop: '3px', whiteSpace: 'pre-wrap' },
  statusRow: { display: 'flex', gap: '12px', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap' },
  receivedBtn: { padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'rgba(245,158,11,0.85)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  closeBtn: { padding: '7px 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--success)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { background: 'var(--surface-2)', padding: '10px 14px', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', verticalAlign: 'middle' },
  inwardLink: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: '13px', fontFamily: 'monospace', textDecoration: 'underline', padding: '0' }
};

// open = amber, received = indigo, closed = green
const poStatusStyle = {
  open:     { background: 'rgba(245,158,11,0.1)', color: '#92400e' },
  received: { background: 'var(--primary-dim)',   color: 'var(--primary)' },
  closed:   { background: 'var(--success-dim)',   color: 'var(--success)' }
};

const inwardStatusStyle = {
  draft:     { background: 'rgba(100,116,139,0.1)', color: 'var(--text-3)' },
  confirmed: { background: 'var(--primary-dim)',    color: 'var(--primary)' },
  locked:    { background: 'var(--success-dim)',    color: 'var(--success)' }
};

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = safeUser();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchPo() {
    try {
      const res = await client.get(`/purchase-orders/${id}`);
      setPo(res.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchPo(); }, [id]);

  async function handleStatusChange(newStatus) {
    const label = newStatus === 'received' ? 'Mark as Received' : 'Close PO';
    if (!window.confirm(`${label}? This action cannot be undone.`)) return;
    try {
      await client.patch(`/purchase-orders/${id}`, { status: newStatus });
      fetchPo();
    } catch (err) { alert(err.response?.data?.error || 'Update failed'); }
  }

  if (loading) return <div style={S.page}><Nav /><div style={S.content}><p>Loading...</p></div></div>;
  if (!po) return <div style={S.page}><Nav /><div style={S.content}><p>PO not found</p></div></div>;

  const inwardEntries = po.inward_entries || [];
  const canMarkReceived = ['admin', 'purchase'].includes(user.role) && po.status === 'open';
  const canClose = user.role === 'admin' && po.status === 'received';

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <button style={S.backBtn} onClick={() => navigate('/purchase-orders')}>
          Back to Purchase Orders
        </button>

        <div style={S.card}>
          <h3 style={S.cardTitle}>Purchase Order — PO-{String(po.id).padStart(4, '0')}</h3>
          <div style={S.grid}>
            <div>
              <div style={S.fieldLabel}>Vendor</div>
              <div style={S.fieldValue}>{po.vendor_name}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>GSTIN</div>
              <div style={S.fieldValue}>{po.gstin || '—'}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>PO Date</div>
              <div style={S.fieldValue}>{po.po_date}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Expected Delivery</div>
              <div style={S.fieldValue}>{po.delivery_date || '—'}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Contact</div>
              <div style={S.fieldValue}>{po.contact || '—'}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Payment Terms</div>
              <div style={S.fieldValue}>{po.payment_terms || '—'}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Created By</div>
              <div style={S.fieldValue}>{po.created_by_name || '—'}</div>
            </div>
            <div>
              <div style={S.fieldLabel}>Created At</div>
              <div style={S.fieldValue}>{po.created_at ? new Date(po.created_at).toLocaleDateString() : '—'}</div>
            </div>
          </div>
          {po.notes && (
            <div style={{ marginTop: '16px' }}>
              <div style={S.fieldLabel}>Notes</div>
              <div style={S.notesValue}>{po.notes}</div>
            </div>
          )}

          <div style={S.statusRow}>
            <span style={{
              ...(poStatusStyle[po.status] || { background: 'rgba(100,116,139,0.1)', color: 'var(--text-3)' }),
              padding: '2px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600'
            }}>
              {po.status.toUpperCase()}
            </span>
            {canMarkReceived && (
              <button style={S.receivedBtn} onClick={() => handleStatusChange('received')}>
                Mark Received
              </button>
            )}
            {canClose && (
              <button style={S.closeBtn} onClick={() => handleStatusChange('closed')}>
                Close PO
              </button>
            )}
          </div>
        </div>

        <div style={S.card}>
          <h4 style={S.cardTitle}>Linked Inward Entries ({inwardEntries.length})</h4>
          {inwardEntries.length === 0 ? (
            <p style={{ color: '#999', fontSize: '14px', margin: 0 }}>
              No inward entries linked to this PO yet.
            </p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Inward #</th>
                  <th style={S.th}>Invoice #</th>
                  <th style={S.th}>Invoice Date</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {inwardEntries.map(ie => (
                  <tr key={ie.id}>
                    <td style={S.td}>
                      <button style={S.inwardLink} onClick={() => navigate(`/inward/${ie.id}`)}>
                        IN-{String(ie.id).padStart(4, '0')}
                      </button>
                    </td>
                    <td style={S.td}>{ie.invoice_no || '—'}</td>
                    <td style={S.td}>{ie.invoice_date || '—'}</td>
                    <td style={S.td}>
                      <span style={{
                        ...(inwardStatusStyle[ie.status] || { background: 'rgba(100,116,139,0.1)', color: 'var(--text-3)' }),
                        padding: '2px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        {ie.status}
                      </span>
                    </td>
                    <td style={S.td}>{ie.created_at ? new Date(ie.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
