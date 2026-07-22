import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Nav from '../components/Nav';
import client from '../api/client';
import { safeUser } from '../lib/safeUser';

const S = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  content: { padding: '24px', maxWidth: '900px', margin: '0 auto' },
  title: { fontSize: '22px', fontWeight: '700', color: 'var(--text-1)', margin: '0 0 8px' },
  subtitle: { fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px' },
  card: { background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '16px' },
  step: { display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' },
  stepNum: { width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 },
  stepBody: { fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5 },
  btn: { padding: '10px 18px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  btnSecondary: { padding: '10px 18px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  fileInput: { padding: '10px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius)', width: '100%', fontSize: '13px', background: 'var(--surface-2)' },
  result: { padding: '14px', background: 'var(--success-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--radius)', fontSize: '13px', marginTop: '14px' },
  resultRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' },
  errorList: { marginTop: '12px', maxHeight: '240px', overflow: 'auto', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)', padding: '10px', fontSize: '12px' },
  errorRow: { padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--danger)' },
  error: { background: 'var(--danger-dim)', color: 'var(--danger)', padding: '10px', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: '12px', fontSize: '13px' },
};

export default function OpeningStock() {
  const navigate = useNavigate();
  const user = safeUser();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  if (user.role !== 'admin') {
    return (
      <div style={S.page}>
        <Nav />
        <div style={S.content}>
          <div style={S.card}>
            <p style={S.title}>Opening Stock Import</p>
            <p style={S.subtitle}>Admin role required.</p>
          </div>
        </div>
      </div>
    );
  }

  async function downloadTemplate() {
    try {
      const res = await client.get('/inward/opening-stock-template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'opening-stock-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  async function runImport(dryRun) {
    setError('');
    if (dryRun) { setPreview(null); setResult(null); } else { setResult(null); }
    if (!file) {
      setError('Pick a file first');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const url = dryRun ? '/inward/opening-stock?dryRun=true' : '/inward/opening-stock';
      const res = await client.post(url, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (dryRun) {
        setPreview(res.data.data);
      } else {
        setResult(res.data.data);
        setPreview(null);
        setFile(null);
        const input = document.getElementById('os-file-input');
        if (input) input.value = '';
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.page}>
      <Nav />
      <div style={S.content}>
        <p style={S.title}>Opening Stock Import</p>
        <p style={S.subtitle}>One-time bulk load of existing inventory. Preserves your vendor barcodes via alias mapping. Creates items + batches in one shot.</p>

        <div style={S.card}>
          <p style={{ fontSize: '14px', fontWeight: '600', marginTop: 0, marginBottom: '14px' }}>How it works</p>
          <div style={S.step}>
            <span style={S.stepNum}>1</span>
            <span style={S.stepBody}>Download the template. Fill rows: <code>existing_barcode</code> (vendor/MRP code), <code>item_name</code> (alias or canonical), <code>qty_kg</code>, <code>expiry_date</code>, <code>purchase_rate</code>, optional <code>sub_category</code>, <code>mrp</code>, <code>storage_location</code>, <code>receipt_date</code>.</span>
          </div>
          <div style={S.step}>
            <span style={S.stepNum}>2</span>
            <span style={S.stepBody}>For each row: matches existing item by primary barcode → then alias → then canonical name. Creates a new item (auto FG-XXXX + EAN-13) if no match. Registers the vendor barcode in <code>item_aliases</code>.</span>
          </div>
          <div style={S.step}>
            <span style={S.stepNum}>3</span>
            <span style={S.stepBody}>Creates a batch row per line with <code>qty_received = qty_remaining = qty_kg</code>. Stock immediately visible on Items page and scannable by either barcode.</span>
          </div>
          <div style={S.step}>
            <span style={S.stepNum}>4</span>
            <span style={S.stepBody}>Each row commits in its own transaction. Failed rows are reported; successful rows are not rolled back.</span>
          </div>
        </div>

        <div style={S.card}>
          <p style={{ fontSize: '14px', fontWeight: '600', marginTop: 0, marginBottom: '14px' }}>Upload</p>
          {error && <div style={S.error}>{error}</div>}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={S.btnSecondary} onClick={downloadTemplate}>Download template</button>
            <input
              id="os-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={e => { setFile(e.target.files[0] || null); setPreview(null); setResult(null); }}
              style={{ ...S.fileInput, flex: 1, minWidth: '200px' }}
            />
            <button type="button" style={S.btnSecondary} disabled={busy || !file} onClick={() => runImport(true)}>
              {busy ? 'Working...' : 'Preview'}
            </button>
            <button type="button" style={S.btn} disabled={busy || !file || !preview} onClick={() => runImport(false)}>
              {busy ? 'Importing...' : 'Confirm Import'}
            </button>
          </div>
          {!preview && file && !busy && (
            <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
              Click <strong>Preview</strong> first to see what will happen. <strong>Confirm Import</strong> unlocks after a preview.
            </p>
          )}

          {preview && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ ...S.result, background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.35)' }}>
                <p style={{ fontWeight: '700', margin: '0 0 8px' }}>Preview (dry run) — nothing was written yet</p>
                <div style={S.resultRow}><span>Rows in sheet</span><strong>{preview.rows_total}</strong></div>
                <div style={S.resultRow}><span>Items would create</span><strong>{preview.items_created}</strong></div>
                <div style={S.resultRow}><span>Items would match</span><strong>{preview.items_matched}</strong></div>
                <div style={S.resultRow}><span>Aliases would register</span><strong>{preview.aliases_registered}</strong></div>
                <div style={S.resultRow}><span>Batches would create</span><strong>{preview.batches_created}</strong></div>
                <div style={S.resultRow}><span>Row errors</span><strong>{preview.errors.length}</strong></div>
              </div>

              {preview.preview.length > 0 && (
                <div style={{ marginTop: '12px', maxHeight: '360px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ background: 'var(--surface-2)', color: 'var(--text-3)', position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Row</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Canonical</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vendor BC</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Alias</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Qty (kg)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map(p => (
                        <tr key={p.row} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 8px' }}>{p.row}</td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{
                              padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: '600',
                              background: p.action === 'CREATE_ITEM' ? 'var(--success-dim)' : 'var(--primary-dim)',
                              color: p.action === 'CREATE_ITEM' ? 'var(--success)' : 'var(--primary)',
                            }}>{p.action}</span>
                          </td>
                          <td style={{ padding: '5px 8px' }}>{p.item_code || '— new —'}</td>
                          <td style={{ padding: '5px 8px' }}>{p.canonical_name || '—'}</td>
                          <td style={{ padding: '5px 8px' }}>{p.category}{p.sub_category ? ` / ${p.sub_category}` : ''}</td>
                          <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{p.vendor_barcode || '—'}</td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{
                              fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
                              background: p.alias_action === 'REGISTER' ? 'rgba(234,179,8,0.12)' : p.alias_action === 'ALREADY' ? 'var(--surface-2)' : 'transparent',
                              color: p.alias_action === 'REGISTER' ? '#92400e' : 'var(--text-3)',
                            }}>{p.alias_action}</span>
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.batch_qty}</td>
                          <td style={{ padding: '5px 8px' }}>{p.expiry_date || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div style={S.errorList}>
                  {preview.errors.map((e, i) => (
                    <div key={`${e.row}-${i}`} style={S.errorRow}>Row {e.row}: {e.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && (
            <div style={S.result}>
              <p style={{ fontWeight: '700', margin: '0 0 8px' }}>Import complete</p>
              <div style={S.resultRow}><span>Rows in sheet</span><strong>{result.rows_total}</strong></div>
              <div style={S.resultRow}><span>Items created</span><strong>{result.items_created}</strong></div>
              <div style={S.resultRow}><span>Items matched (existing)</span><strong>{result.items_matched}</strong></div>
              <div style={S.resultRow}><span>Vendor barcodes registered</span><strong>{result.aliases_registered}</strong></div>
              <div style={S.resultRow}><span>Batches created</span><strong>{result.batches_created}</strong></div>
              <div style={S.resultRow}><span>Errors</span><strong>{result.errors.length}</strong></div>

              {result.errors.length > 0 && (
                <div style={S.errorList}>
                  {result.errors.map((e, i) => (
                    <div key={`${e.row}-${i}`} style={S.errorRow}>Row {e.row}: {e.error}</div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button style={S.btn} onClick={() => navigate('/items')}>Go to Items</button>
                <button style={S.btnSecondary} onClick={() => navigate('/reports')}>Open Reports</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
