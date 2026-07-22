import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Nav from '../components/Nav';
import FoodPhoto from '../components/FoodPhoto';

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)', display: 'flex', flexDirection: 'column'
  },
  body: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'flex-start',
    padding: '48px 24px'
  },
  scanBox: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '36px 40px',
    boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)',
    width: '100%', maxWidth: '520px', textAlign: 'center'
  },
  scanTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '6px' },
  scanHint: { fontSize: '13px', color: 'var(--text-4)', marginBottom: '20px' },
  scanInput: {
    width: '100%', padding: '14px 16px', fontSize: '18px',
    border: '2px solid var(--primary)', borderRadius: 'var(--radius)',
    textAlign: 'center', letterSpacing: '2px', boxSizing: 'border-box',
    outline: 'none'
  },
  resultCard: {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '24px 28px',
    boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)',
    width: '100%', maxWidth: '520px', marginTop: '24px'
  },
  resultHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: '16px', gap: '16px'
  },
  itemName: { fontSize: '18px', fontWeight: '700', color: 'var(--text-1)' },
  itemCode: {
    fontFamily: 'monospace', fontSize: '12px', background: 'var(--surface-2)',
    padding: '3px 8px', borderRadius: 'var(--radius)', color: 'var(--text-3)'
  },
  infoGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  infoBlock: {
    background: 'var(--surface-2)', borderRadius: 'var(--radius)',
    padding: '12px 14px'
  },
  infoLabel: { fontSize: '11px', color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  infoValue: { fontSize: '16px', fontWeight: '700', color: 'var(--text-1)', marginTop: '3px' },
  stockGood: { color: 'var(--success)' },
  stockWarn: { color: '#F59E0B' },
  stockBad:  { color: 'var(--danger)' },
  registerCard: {
    background: 'var(--surface)', border: '2px dashed var(--border-strong)',
    borderRadius: 'var(--radius-lg)', padding: '28px',
    width: '100%', maxWidth: '520px', marginTop: '24px',
  },
  registerTitle: { fontSize: '15px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '6px' },
  registerSub: { fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px' },
  barcodeChip: {
    display: 'inline-block', padding: '5px 12px', borderRadius: '20px',
    background: 'var(--primary-dim)', color: 'var(--primary)',
    fontFamily: 'monospace', fontSize: '14px', fontWeight: '700', marginBottom: '20px'
  },
  label: { display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' },
  input: {
    width: '100%', padding: '9px 12px', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)', fontSize: '14px', boxSizing: 'border-box',
    background: 'var(--surface)', color: 'var(--text-1)', outline: 'none'
  },
  select: {
    width: '100%', padding: '9px 12px', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)', fontSize: '14px', boxSizing: 'border-box',
    background: 'var(--surface)', color: 'var(--text-1)', marginTop: '10px'
  },
  btnRow: { display: 'flex', gap: '10px', marginTop: '16px' },
  btnPrimary: {
    padding: '9px 20px', background: 'var(--primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius)', fontSize: '13px',
    fontWeight: '600', cursor: 'pointer'
  },
  btnSecondary: {
    padding: '9px 16px', background: 'var(--surface)', color: 'var(--text-2)',
    border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
    fontSize: '13px', cursor: 'pointer'
  },
  successBanner: {
    background: 'var(--success-dim)', border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '13px',
    color: 'var(--success)', marginTop: '12px'
  },
  errBanner: {
    background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '13px',
    color: 'var(--danger)', marginTop: '12px'
  },
  barcode: { fontSize: '12px', color: 'var(--text-4)', marginTop: '12px', fontFamily: 'monospace' },
  photoThumb: {
    width: '72px', height: '72px', objectFit: 'cover', borderRadius: '10px', flexShrink: 0
  },
  photoPlaceholder: {
    width: '72px', height: '72px', borderRadius: '10px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '28px', fontWeight: '700', color: '#fff'
  },
};

function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function stockStyle(kg) {
  if (kg <= 0) return styles.stockBad;
  if (kg < 10) return styles.stockWarn;
  return styles.stockGood;
}

function ItemPhoto({ item }) {
  return <FoodPhoto item={item} size={72} radius={10} style={{ border: '1px solid var(--border)' }} />;
}

export default function Scan() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);
  const [unknownBarcode, setUnknownBarcode] = useState('');
  const [scanning, setScanning] = useState(false);

  // Register alias state
  const [allItems, setAllItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerMsg, setRegisterMsg] = useState(null); // { type: 'success'|'error', text }

  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load items list for the register alias dropdown (lazy)
  useEffect(() => {
    if (unknownBarcode) {
      client.get('/items', { params: { limit: 500 } })
        .then(r => setAllItems(r.data.data || []))
        .catch(() => {});
    }
  }, [unknownBarcode]);

  async function handleKeyDown(e) {
    if (e.key === 'Enter') {
      const barcode = value.trim();
      if (!barcode) return;
      setResult(null);
      setUnknownBarcode('');
      setRegisterMsg(null);
      setScanning(true);
      try {
        const res = await client.get(`/items/scan/${encodeURIComponent(barcode)}`);
        setResult(res.data.data);
      } catch (err) {
        if (err.response?.status === 404) {
          setUnknownBarcode(barcode);
          setSelectedItemId('');
          setItemSearch('');
        } else {
          setUnknownBarcode('');
          alert('Scan failed: ' + (err.response?.data?.error || err.message));
        }
      } finally {
        setScanning(false);
        setValue('');
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
  }

  async function handleRegisterAlias() {
    if (!selectedItemId) { setRegisterMsg({ type: 'error', text: 'Select an item first' }); return; }
    setRegistering(true);
    setRegisterMsg(null);
    try {
      await client.post(`/items/${selectedItemId}/aliases`, { alias_barcode: unknownBarcode });
      setRegisterMsg({ type: 'success', text: `Barcode "${unknownBarcode}" linked to item successfully.` });
      setSelectedItemId('');
      setItemSearch('');
    } catch (err) {
      setRegisterMsg({ type: 'error', text: err.response?.data?.error || 'Registration failed' });
    } finally {
      setRegistering(false);
    }
  }

  function dismissRegister() {
    setUnknownBarcode('');
    setRegisterMsg(null);
    setSelectedItemId('');
    setItemSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const filteredItems = allItems.filter(it => {
    const q = itemSearch.toLowerCase();
    if (!q) return true;
    return (it.item_code || '').toLowerCase().includes(q)
      || (it.sub_category_name || '').toLowerCase().includes(q)
      || (it.variant_grade || '').toLowerCase().includes(q);
  });

  const kg = result ? parseFloat(result.live_stock_kg) || 0 : 0;

  return (
    <div style={styles.page}>
      <Nav />

      <div style={styles.body}>
        <div style={styles.scanBox}>
          <p style={styles.scanTitle}>Scan Item Barcode</p>
          <p style={styles.scanHint}>Focus on the field below and scan with a barcode reader, or type manually and press Enter</p>
          <input
            ref={inputRef}
            style={styles.scanInput}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={scanning ? 'Looking up...' : 'Scan barcode...'}
            disabled={scanning}
            autoComplete="off"
          />
        </div>

        {/* ── Result card ── */}
        {result && (
          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <ItemPhoto item={result} />
              <div style={{ flex: 1 }}>
                <div style={styles.itemName}>
                  {result.variant_grade || result.sub_category_name}
                </div>
                <span style={styles.itemCode}>{result.item_code}</span>
                {result.matched_via === 'alias' && (
                  <span style={{ marginLeft: '8px', fontSize: '11px', background: 'rgba(234,179,8,0.15)', color: '#92400e', borderRadius: '10px', padding: '2px 8px', fontWeight: '600' }}>
                    via alias
                  </span>
                )}
              </div>
            </div>
            <div style={styles.infoGrid}>
              <div style={styles.infoBlock}>
                <div style={styles.infoLabel}>Category</div>
                <div style={{ ...styles.infoValue, fontSize: '14px' }}>{result.category_name}</div>
              </div>
              <div style={styles.infoBlock}>
                <div style={styles.infoLabel}>Sub-Category</div>
                <div style={{ ...styles.infoValue, fontSize: '14px' }}>{result.sub_category_name}</div>
              </div>
              <div style={styles.infoBlock}>
                <div style={styles.infoLabel}>Live Stock</div>
                <div style={{ ...styles.infoValue, ...stockStyle(kg) }}>
                  {kg.toFixed(2)} {result.unit}
                </div>
              </div>
              <div style={styles.infoBlock}>
                <div style={styles.infoLabel}>Active Batches</div>
                <div style={styles.infoValue}>{result.batch_count}</div>
              </div>
              <div style={styles.infoBlock}>
                <div style={styles.infoLabel}>Nearest Expiry</div>
                <div style={styles.infoValue}>{formatDate(result.nearest_expiry)}</div>
              </div>
              <div style={styles.infoBlock}>
                <div style={styles.infoLabel}>Purchase Rate</div>
                <div style={styles.infoValue}>{result.purchase_rate ? `₹${result.purchase_rate}` : '—'}</div>
              </div>
            </div>
            <p style={styles.barcode}>{result.barcode}</p>
            <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <button style={styles.btnPrimary} onClick={() => navigate('/items/' + result.id)}>View Item</button>
              <button style={styles.btnSecondary} onClick={() => { setResult(null); setTimeout(() => inputRef.current?.focus(), 50); }}>Scan Next</button>
            </div>
          </div>
        )}

        {/* ── Unknown barcode → Register alias ── */}
        {unknownBarcode && (
          <div style={styles.registerCard}>
            <div style={styles.registerTitle}>Barcode Not Registered</div>
            <div style={styles.registerSub}>This barcode is not in the system. Link it to an existing item so future scans resolve automatically.</div>
            <div style={styles.barcodeChip}>{unknownBarcode}</div>

            <label style={styles.label}>Search Item</label>
            <input
              style={styles.input}
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="Type item name, code, or grade..."
              autoFocus
            />
            {filteredItems.length > 0 && (
              <select
                style={styles.select}
                size={Math.min(filteredItems.length, 6)}
                value={selectedItemId}
                onChange={e => setSelectedItemId(e.target.value)}
              >
                <option value="">— select item —</option>
                {filteredItems.map(it => (
                  <option key={it.id} value={it.id}>
                    {it.item_code} · {it.variant_grade || it.sub_category_name}
                  </option>
                ))}
              </select>
            )}

            {registerMsg && (
              <div style={registerMsg.type === 'success' ? styles.successBanner : styles.errBanner}>
                {registerMsg.text}
              </div>
            )}

            <div style={styles.btnRow}>
              <button
                style={styles.btnPrimary}
                onClick={handleRegisterAlias}
                disabled={registering || !selectedItemId}
              >
                {registering ? 'Registering...' : 'Register Barcode'}
              </button>
              <button style={styles.btnSecondary} onClick={dismissRegister}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
