import React, { useState, useEffect, useRef } from 'react';
import FoodPhoto from './FoodPhoto';

export default function InventoryGridCard({
  item,
  isSelected,
  onSelect,
  onEdit,
  onClone,
  onToggle,
  onDelete,
  onLabel,
  canWrite,
  userRole,
  openMenuId,
  onOpenToggle
}) {
  const [hovered, setHovered] = useState(false);
  const [menuHoveredItem, setMenuHoveredItem] = useState(null);
  const menuRef = useRef(null);

  const kg = parseFloat(item.live_stock_kg) || 0;
  const rop = parseFloat(item.rop_kg) || 0;
  const isActive = item.is_active !== false;

  // Calculate stock progress fill & colors
  let fillPct = 0;
  let fillColor = 'var(--success)';
  let fillBgColor = 'var(--success-dim)';

  if (kg <= 0) {
    fillPct = 0;
    fillColor = 'var(--danger)';
    fillBgColor = 'var(--danger-dim)';
  } else if (rop > 0) {
    fillPct = Math.min(100, (kg / rop) * 100);
    if (kg <= rop) {
      fillColor = 'var(--warning)';
      fillBgColor = 'var(--warning-dim)';
    } else {
      fillColor = 'var(--success)';
      fillBgColor = 'var(--success-dim)';
    }
  } else {
    fillPct = 100;
    fillColor = 'var(--success)';
    fillBgColor = 'var(--success-dim)';
  }

  // Calculate velocity badge
  const velocity = parseFloat(item.avg_daily_consumption) || 0;
  let velText = 'Slow';
  let velIcon = '💤';
  let velColor = 'var(--text-3)';
  let velBg = 'var(--border)';

  if (velocity >= 5) {
    velText = 'Fast';
    velIcon = '🔥';
    velColor = 'var(--danger)';
    velBg = 'var(--danger-dim)';
  } else if (velocity > 0) {
    velText = 'Active';
    velIcon = '⚡';
    velColor = 'var(--warning)';
    velBg = 'var(--warning-dim)';
  }

  const isMenuOpen = openMenuId === item.id;

  useEffect(() => {
    if (!isMenuOpen) return;
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onOpenToggle(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isMenuOpen, onOpenToggle, item.id]);

  const cardStyle = {
    background: 'var(--surface)',
    border: isSelected ? '1px solid var(--primary)' : hovered ? '1px solid var(--border-strong)' : '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    boxShadow: hovered ? 'var(--shadow)' : 'var(--shadow-sm)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    transition: 'all 0.15s ease',
    transform: hovered ? 'translateY(-2px)' : 'none',
    opacity: isActive ? 1 : 0.7,
  };

  const imageContainerStyle = {
    position: 'relative',
    height: '130px',
    background: 'var(--surface-2)',
    overflow: 'hidden',
  };

  const checkboxWrapStyle = {
    position: 'absolute',
    top: '10px',
    left: '10px',
    zIndex: 10,
    background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.85)',
    borderRadius: 'var(--radius-sm)',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'var(--shadow-xs)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
  };

  const infoWrapStyle = {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    gap: '10px',
  };

  const codePillStyle = {
    fontFamily: 'ui-monospace, "Cascadia Code", "SF Mono", monospace',
    fontSize: '11px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 7px',
    color: 'var(--text-2)',
    fontWeight: '600',
  };

  const titleStyle = {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-1)',
    margin: '4px 0 2px',
    lineHeight: '1.3',
    minHeight: '36px',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };

  const metadataStyle = {
    fontSize: '11px',
    color: 'var(--text-3)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const stockIndicatorWrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '4px',
  };

  const stockHealthLabelStyle = {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-2)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const progressTrackStyle = {
    height: '6px',
    background: 'var(--surface-2)',
    borderRadius: '3px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
  };

  const progressFillStyle = {
    height: '100%',
    width: `${fillPct}%`,
    background: fillColor,
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  };

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '20px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: '600',
    background: velBg,
    color: velColor,
    width: 'fit-content',
  };

  const priceGridStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    fontSize: '12px',
    borderTop: '1px solid var(--border)',
    paddingTop: '8px',
    marginTop: '2px',
  };

  const priceLabelStyle = {
    color: 'var(--text-3)',
    fontSize: '11px',
  };

  const priceValueStyle = {
    color: 'var(--text-2)',
    fontWeight: '600',
    fontVariantNumeric: 'tabular-nums',
  };

  const actionRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    borderTop: '1px solid var(--border)',
    paddingTop: '10px',
  };

  const dropdownStyle = {
    position: 'absolute',
    right: '12px',
    bottom: '44px',
    zIndex: 50,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    minWidth: '130px',
    padding: '4px 0',
  };

  const dropdownItemStyle = (action) => ({
    display: 'block',
    width: '100%',
    padding: '7px 12px',
    border: 'none',
    background: menuHoveredItem === action ? (action === 'delete' ? 'var(--danger-dim)' : 'var(--bg)') : 'none',
    textAlign: 'left',
    fontSize: '12px',
    color: action === 'delete' ? 'var(--danger)' : 'var(--text-2)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontWeight: '500',
  });

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox Overlay */}
      <div style={checkboxWrapStyle} onClick={onSelect}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          style={{ cursor: 'pointer', accentColor: 'var(--primary)', margin: 0 }}
        />
      </div>

      {/* Card Image */}
      <div style={imageContainerStyle}>
        <FoodPhoto
          item={item}
          size="100%"
          radius="0"
          style={{ height: '130px', border: 'none' }}
        />
      </div>

      {/* Card Body Info */}
      <div style={infoWrapStyle}>
        {/* Code & Status Badge */}
        <div style={metadataStyle}>
          <span style={codePillStyle}>{item.item_code}</span>
          <span style={{
            ...badgeStyle,
            padding: '2px 6px',
            fontSize: '10px',
            background: isActive ? 'var(--success-dim)' : 'var(--border)',
            color: isActive ? 'var(--success)' : 'var(--text-3)'
          }}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Title & Category */}
        <div>
          <h3 style={titleStyle}>{item.variant_grade || item.sub_category_name || '—'}</h3>
          <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
            {item.sub_category_name || '—'}
          </div>
        </div>

        {/* Stock Level Tracker */}
        <div style={stockIndicatorWrapStyle}>
          <div style={stockHealthLabelStyle}>
            <span>Stock: {kg.toFixed(2)} {item.unit}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
              ROP: {rop} {item.unit}
            </span>
          </div>
          <div style={progressTrackStyle}>
            <div style={progressFillStyle} />
          </div>
        </div>

        {/* Velocity Badge */}
        <span style={badgeStyle}>
          <span style={{ marginRight: '4px' }}>{velIcon}</span>
          {velText}
        </span>

        {/* Price Info Grid */}
        <div style={priceGridStyle}>
          <div>
            <div style={priceLabelStyle}>Rate</div>
            <div style={priceValueStyle}>
              {item.purchase_rate ? `₹${item.purchase_rate}` : '—'}
            </div>
          </div>
          <div>
            <div style={priceLabelStyle}>MRP</div>
            <div style={priceValueStyle}>
              {item.mrp ? `₹${item.mrp}` : '—'}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={actionRowStyle}>
          <button
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--primary)',
              fontSize: '12px',
              fontWeight: '600'
            }}
            onClick={onLabel}
          >
            Print Label
          </button>
          
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 6px',
                cursor: 'pointer',
                color: 'var(--text-3)',
                fontSize: '14px',
                lineHeight: '1'
              }}
              onClick={() => onOpenToggle(isMenuOpen ? null : item.id)}
            >
              &#x22EE;
            </button>

            {isMenuOpen && (
              <div style={dropdownStyle}>
                {canWrite && (
                  <button
                    style={dropdownItemStyle('edit')}
                    onMouseEnter={() => setMenuHoveredItem('edit')}
                    onMouseLeave={() => setMenuHoveredItem(null)}
                    onClick={() => { onOpenToggle(null); onEdit(); }}
                  >
                    Edit
                  </button>
                )}
                {canWrite && (
                  <button
                    style={dropdownItemStyle('clone')}
                    onMouseEnter={() => setMenuHoveredItem('clone')}
                    onMouseLeave={() => setMenuHoveredItem(null)}
                    onClick={() => { onOpenToggle(null); onClone(); }}
                  >
                    Clone
                  </button>
                )}
                {canWrite && userRole === 'admin' && (
                  <button
                    style={dropdownItemStyle('toggle')}
                    onMouseEnter={() => setMenuHoveredItem('toggle')}
                    onMouseLeave={() => setMenuHoveredItem(null)}
                    onClick={() => { onOpenToggle(null); onToggle(); }}
                  >
                    {isActive ? 'Deactivate' : 'Activate'}
                  </button>
                )}
                {canWrite && userRole === 'admin' && (
                  <button
                    style={dropdownItemStyle('delete')}
                    onMouseEnter={() => setMenuHoveredItem('delete')}
                    onMouseLeave={() => setMenuHoveredItem(null)}
                    onClick={() => { onOpenToggle(null); onDelete(); }}
                  >
                    Delete
                  </button>
                )}
                {!canWrite && (
                  <div style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--text-4)' }}>
                    No actions
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
