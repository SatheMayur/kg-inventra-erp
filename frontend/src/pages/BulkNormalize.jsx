import React, { useState } from 'react';
import Nav from '../components/Nav';
import client from '../api/client';

const S = {
  page: { fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#f5f7fa' },
  content: { padding: '24px', maxWidth: '1100px', margin: '0 auto' },
  title: { fontSize: '22px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 8px' },
  subtitle: { fontSize: '13px', color: '#666', marginBottom: '20px' },
  card: { background: '#fff', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '16px' },
  btn: { padding: '9px 16px', borderRadius: '5px', border: 'none', background: '#2d6a4f', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  btnSecondary: { padding: '9px 16px', borderRadius: '5px', border: '1px solid #ccc', background: '#fff', color: '#444', fontSize: '13px', cursor: 'pointer' },
  fileInput: { padding: '10px', border: '1px dashed #999', borderRadius: '5px', flex: 1, fontSize: '13px', background: '#fafafa' },
  textarea: { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '13px', minHeight: '120px', fontFamily: 'monospace', boxSizing: 'border-box' },
  err: { background: '#fff1f0', color: '#cf1322', padding: '10px', borderRadius: '5px', border: '1px solid #ffa39e', marginBottom: '12px', fontSize: '13px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '10px' },
  th: { padding: '6px 8px', textAlign: 'left', background: '#1a1a2e', color: '#fff', position: 'sticky', top: 0 },
  td: { padding: '5px 8px', borderTop: '1px solid #eee' },
  tabRow: { display: 'flex', gap: '4px', marginBottom: '14px', borderBottom: '1px solid #ddd' },
  tab: { padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#666' },
  tabActive: { borderBottom: '3px solid #2d6a4f', color: '#1a1a2e', fontWeight: '600' },
};

export default function BulkNormalize() {
  const [mode, setMode] = useState('text'); // 'text' | 'file'
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  async function downloadTemplate() {
    try {
      const res = await client.get('/normalize/bulk-template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bulk-normalize-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  async function runText() {
    setError(''); setRows(null);
    const inputs = text.split('\n').map(s => s.trim()).filter(Boolean);
    if (!inputs.length) { setError('Type at least one line'); return; }
    setBusy(true);
    try {
      const res = await client.post('/normalize', { inputs });
      setRows(res.data.data.map((d, i) => ({ ...d, status: d.category ? 'matched' : 'unknown' })));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runFileJson() {
    setError(''); setRows(null);
    if (!file) { setError('Pick a file first'); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await client.post('/normalize/bulk?format=json', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setRows(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadResult() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await client.post('/normalize/bulk', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bulk-normalized.xlsx';
      a.click();
      URL.revokeObjectURL(url);
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
        <p style={S.title}>Bulk Normalize</p>
        <p style={S.subtitle}>Convert raw item names ("aloo 2kg", "kashmiri lal mirch", "amul butter") into canonical names with category, sub-category, form, variant, grade, qty.</p>

        <div style={S.card}>
          <div style={S.tabRow}>
            <button style={{ ...S.tab, ...(mode === 'text' ? S.tabActive : {}) }} onClick={() => { setMode('text'); setRows(null); }}>Paste text</button>
            <button style={{ ...S.tab, ...(mode === 'file' ? S.tabActive : {}) }} onClick={() => { setMode('file'); setRows(null); }}>Upload Excel</button>
          </div>

          {error && <div style={S.err}>{error}</div>}

          {mode === 'text' && (
            <div>
              <textarea
                style={S.textarea}
                placeholder={'aloo 2kg premium\nkashmiri lal mirch 500g\nsabut urad 1kg\n1 dozen anda\nindia gate basmati 1121 5kg'}
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <div style={{ marginTop: '10px' }}>
                <button style={S.btn} disabled={busy} onClick={runText}>{busy ? 'Working...' : 'Normalize'}</button>
              </div>
            </div>
          )}

          {mode === 'file' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button style={S.btnSecondary} onClick={downloadTemplate}>Download template</button>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => { setFile(e.target.files[0] || null); setRows(null); }}
                  style={S.fileInput}
                />
                <button style={S.btnSecondary} disabled={busy || !file} onClick={runFileJson}>Preview</button>
                <button style={S.btn} disabled={busy || !file} onClick={downloadResult}>Download .xlsx</button>
              </div>
              <p style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
                Excel column header: <code>input</code> (or <code>name</code> / <code>item</code> / <code>raw</code>). One row per item.
              </p>
            </div>
          )}
        </div>

        {rows && rows.length > 0 && (
          <div style={S.card}>
            <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 10px' }}>Results ({rows.length})</p>
            <div style={{ overflow: 'auto', maxHeight: '500px' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>Input</th>
                    <th style={S.th}>Canonical</th>
                    <th style={S.th}>Category</th>
                    <th style={S.th}>Sub-category</th>
                    <th style={S.th}>Form</th>
                    <th style={S.th}>Variant</th>
                    <th style={S.th}>Grade</th>
                    <th style={S.th}>Qty</th>
                    <th style={S.th}>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={S.td}>{r.original ?? r.input}</td>
                      <td style={{ ...S.td, fontWeight: '600', color: r.status === 'unknown' ? '#cf1322' : '#1a1a2e' }}>
                        {r.canonical_name}
                      </td>
                      <td style={S.td}>{r.category || '—'}</td>
                      <td style={S.td}>{r.sub_category || '—'}</td>
                      <td style={S.td}>{r.form || '—'}</td>
                      <td style={S.td}>{r.variant || '—'}</td>
                      <td style={S.td}>{r.grade || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{r.quantity ?? '—'}</td>
                      <td style={S.td}>{r.unit || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
