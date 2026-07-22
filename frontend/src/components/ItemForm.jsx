import React, { useState } from 'react';

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000
  },
  modal: {
    background: '#fff', borderRadius: '8px', padding: '28px',
    width: '560px', maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 4px 24px rgba(0,0,0,0.18)'
  },
  header: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '20px'
  },
  title: { fontSize: '18px', fontWeight: '700', color: '#1a1a2e', margin: 0 },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '22px',
    cursor: 'pointer', color: '#888', lineHeight: 1
  },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  fieldGroup: { marginBottom: '14px' },
  label: {
    display: 'block', fontSize: '12px', fontWeight: '600',
    color: '#555', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px'
  },
  input: {
    width: '100%', padding: '8px 10px', border: '1px solid #ddd',
    borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box'
  },
  readOnly: {
    width: '100%', padding: '8px 10px', border: '1px solid #eee',
    borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box',
    background: '#f9f9f9', color: '#666'
  },
  select: {
    width: '100%', padding: '8px 10px', border: '1px solid #ddd',
    borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box',
    background: '#fff'
  },
  textarea: {
    width: '100%', padding: '8px 10px', border: '1px solid #ddd',
    borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box',
    resize: 'vertical', minHeight: '72px', fontFamily: 'Arial, sans-serif'
  },
  sectionLabel: {
    fontSize: '11px', fontWeight: '700', color: '#2d6a4f',
    textTransform: 'uppercase', letterSpacing: '0.8px',
    borderBottom: '1px solid #e8f5e9', paddingBottom: '4px',
    marginBottom: '12px', marginTop: '6px'
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  cancelBtn: {
    padding: '9px 20px', border: '1px solid #ddd', borderRadius: '4px',
    background: '#fff', cursor: 'pointer', fontSize: '14px'
  },
  saveBtn: {
    padding: '9px 20px', border: 'none', borderRadius: '4px',
    background: '#2d6a4f', color: '#fff', cursor: 'pointer',
    fontSize: '14px', fontWeight: '600'
  },
  error: {
    background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: '4px',
    padding: '8px 12px', color: '#cf1322', fontSize: '13px', marginBottom: '14px'
  }
};

const UNITS = ['kg', 'g', 'litre', 'ml', 'pcs', 'box', 'bag'];

export default function ItemForm({ item, categories, onSave, onClose }) {
  const isEdit = Boolean(item);

  const [subCategoryId, setSubCategoryId] = useState(item?.sub_category_id || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState(item?.category_id || '');
  const [hsnCode, setHsnCode] = useState(item?.hsn_code || '');
  const [unit, setUnit] = useState(item?.unit || 'kg');
  const [variantGrade, setVariantGrade] = useState(item?.variant_grade || '');
  const [purchaseRate, setPurchaseRate] = useState(item?.purchase_rate || '');
  const [mrp, setMrp] = useState(item?.mrp || '');
  const [avgDailyConsumption, setAvgDailyConsumption] = useState(item?.avg_daily_consumption || '');
  const [leadTimeDays, setLeadTimeDays] = useState(item?.lead_time_days || 7);
  const [demandVariabilityPct, setDemandVariabilityPct] = useState(item?.demand_variability_pct || 20);
  const [gstRate, setGstRate] = useState(item?.gst_rate !== undefined ? item.gst_rate : 5);
  const [reorderQty, setReorderQty] = useState(item?.reorder_qty || '');
  const [packSize, setPackSize] = useState(item?.pack_size || '');
  const [storageLocation, setStorageLocation] = useState(item?.storage_location || '');
  const [description, setDescription] = useState(item?.description || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const availableSubs = selectedCategoryId
    ? (categories.find(c => c.id === parseInt(selectedCategoryId))?.sub_categories || [])
    : [];

  function handleCategoryChange(e) {
    setSelectedCategoryId(e.target.value);
    setSubCategoryId('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!subCategoryId) {
      setError('Please select a sub-category');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        sub_category_id: parseInt(subCategoryId),
        hsn_code: hsnCode,
        unit,
        variant_grade: variantGrade,
        purchase_rate: purchaseRate !== '' ? parseFloat(purchaseRate) : null,
        mrp: mrp !== '' ? parseFloat(mrp) : null,
        avg_daily_consumption: avgDailyConsumption !== '' ? parseFloat(avgDailyConsumption) : 0,
        lead_time_days: parseInt(leadTimeDays) || 7,
        demand_variability_pct: parseInt(demandVariabilityPct) || 20,
        gst_rate: parseFloat(gstRate) || 5,
        reorder_qty: reorderQty !== '' ? parseFloat(reorderQty) : 0,
        pack_size: packSize || null,
        storage_location: storageLocation || null,
        description: description || null
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>{isEdit ? 'Edit Item' : 'Add New Item'}</h2>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {isEdit && (
            <div style={styles.row}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Item Code</label>
                <input style={styles.readOnly} value={item.item_code} readOnly />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Barcode</label>
                <input style={styles.readOnly} value={item.barcode} readOnly />
              </div>
            </div>
          )}

          <div style={styles.sectionLabel}>Classification</div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Category *</label>
              <select style={styles.select} value={selectedCategoryId} onChange={handleCategoryChange} required>
                <option value="">Select category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Sub-Category *</label>
              <select
                style={styles.select}
                value={subCategoryId}
                onChange={e => setSubCategoryId(e.target.value)}
                required
                disabled={!selectedCategoryId}
              >
                <option value="">Select sub-category</option>
                {availableSubs.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Variant / Grade</label>
              <input
                style={styles.input}
                value={variantGrade}
                onChange={e => setVariantGrade(e.target.value)}
                placeholder="e.g. Basmati 1121"
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Unit</label>
              <select style={styles.select} value={unit} onChange={e => setUnit(e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div style={styles.sectionLabel}>Pricing & Tax</div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>HSN Code</label>
              <input
                style={styles.input}
                value={hsnCode}
                onChange={e => setHsnCode(e.target.value)}
                placeholder="e.g. 1006"
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>GST Rate (%)</label>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={gstRate}
                onChange={e => setGstRate(e.target.value)}
                placeholder="5"
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Purchase Rate (per unit)</label>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={purchaseRate}
                onChange={e => setPurchaseRate(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>MRP (per unit)</label>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={mrp}
                onChange={e => setMrp(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div style={styles.sectionLabel}>Replenishment</div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Avg Daily Consumption</label>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={avgDailyConsumption}
                onChange={e => setAvgDailyConsumption(e.target.value)}
                placeholder="kg/day"
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Reorder Qty</label>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={reorderQty}
                onChange={e => setReorderQty(e.target.value)}
                placeholder="e.g. 200"
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Lead Time (days)</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                value={leadTimeDays}
                onChange={e => setLeadTimeDays(e.target.value)}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Demand Variability (%)</label>
              <input
                style={styles.input}
                type="number"
                min="0"
                max="100"
                value={demandVariabilityPct}
                onChange={e => setDemandVariabilityPct(e.target.value)}
              />
            </div>
          </div>

          <div style={styles.sectionLabel}>Storage & Details</div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Pack Size</label>
              <input
                style={styles.input}
                value={packSize}
                onChange={e => setPackSize(e.target.value)}
                placeholder="e.g. 25kg bag"
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Storage Location</label>
              <input
                style={styles.input}
                value={storageLocation}
                onChange={e => setStorageLocation(e.target.value)}
                placeholder="e.g. Rack A1"
              />
            </div>
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              style={styles.textarea}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes about this item..."
            />
          </div>

          <div style={styles.actions}>
            <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
