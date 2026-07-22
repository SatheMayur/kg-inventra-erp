import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import Nav from '../components/Nav';
import client from '../api/client';
import { safeUser } from '../lib/safeUser';

// ─── Formatters ────────────────────────────────────────────────────────────
function fmtCurrency(num) {
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(1) + 'Cr';
  if (num >= 100000)   return '₹' + (num / 100000).toFixed(1) + 'L';
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(num || 0);
}
function fmtKg(num) {
  if (num >= 1000) return (num / 1000).toFixed(1) + 't';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(num || 0) + ' kg';
}
function fmtInt(num) {
  return new Intl.NumberFormat('en-IN').format(num || 0);
}
function fmtDate(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}
function fmtTimeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function fmtDateLong() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ─── Velocity Badge ─────────────────────────────────────────────────────────
function VelocityBadge({ kgPerDay }) {
  const v = parseFloat(kgPerDay) || 0;
  if (v >= 5) return (
    <span style={{ ...sb.badge, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: '10px' }}>
      🔥 Fast
    </span>
  );
  if (v >= 1) return (
    <span style={{ ...sb.badge, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '10px' }}>
      ⚡ Active
    </span>
  );
  return (
    <span style={{ ...sb.badge, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', fontSize: '10px' }}>
      💤 Slow
    </span>
  );
}

// ─── Stock Health Indicator ─────────────────────────────────────────────────
function StockHealthBar({ daysRemaining, leadTime }) {
  const days = parseFloat(daysRemaining);
  if (!days) return <span style={{ color: '#64748b', fontSize: '11px' }}>—</span>;
  const ratio = Math.min(days / (leadTime * 3), 1);
  const color = days < leadTime ? '#ef4444' : days < leadTime * 1.5 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', minWidth: '40px' }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '11px', color, fontWeight: '600', whiteSpace: 'nowrap' }}>{days}d</span>
    </div>
  );
}

// ─── Stockout Risk Badge ────────────────────────────────────────────────────
function RiskBadge({ risk }) {
  const map = {
    critical: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '🚨 Critical' },
    high:     { bg: 'rgba(249,115,22,0.15)', color: '#f97316', label: '⚠️ High' },
    medium:   { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Medium' },
    low:      { bg: 'rgba(16,185,129,0.12)', color: '#10b981', label: 'Low' },
    unknown:  { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', label: '—' },
  };
  const c = map[risk] || map.unknown;
  return <span style={{ ...sb.badge, background: c.bg, color: c.color, fontSize: '10px' }}>{c.label}</span>;
}

// ─── Trend Arrow ────────────────────────────────────────────────────────────
function TrendPill({ trend }) {
  if (trend === 'rising')   return <span style={{ color: '#10b981', fontSize: '11px', fontWeight: '600' }}>↑ Rising</span>;
  if (trend === 'declining') return <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: '600' }}>↓ Declining</span>;
  return <span style={{ color: '#94a3b8', fontSize: '11px' }}>→ Stable</span>;
}

// ─── AI Insight Card ────────────────────────────────────────────────────────
function AIInsightCard({ insight, navigate }) {
  const [hov, setHov] = useState(false);
  const sev = {
    critical: { border: '#ef4444', bg: 'rgba(239,68,68,0.06)', icon: '🚨' },
    warning:  { border: '#f59e0b', bg: 'rgba(245,158,11,0.06)', icon: '⚠️' },
    info:     { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)', icon: '📈' },
    success:  { border: '#10b981', bg: 'rgba(16,185,129,0.06)', icon: '✅' },
  }[insight.severity] || { border: '#64748b', bg: 'transparent', icon: 'ℹ️' };

  return (
    <div style={{
      borderLeft: `3px solid ${sev.border}`,
      background: hov ? sev.bg : 'rgba(255,255,255,0.02)',
      borderRadius: '0 var(--radius) var(--radius) 0',
      padding: '10px 12px',
      marginBottom: '8px',
      transition: 'background 0.15s',
    }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{sev.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-1)', marginBottom: '2px' }}>
            {insight.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: '1.5' }}>{insight.body}</div>
          {insight.action && insight.actionPath && (
            <button
              style={{ marginTop: '6px', background: 'none', border: 'none', padding: 0, color: sev.border, fontSize: '11px', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => navigate(insight.actionPath)}
            >
              {insight.action} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Activity Feed Item ─────────────────────────────────────────────────────
function ActivityItem({ item }) {
  const isIn = item.type === 'inward';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
        background: isIn ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
        color: isIn ? '#10b981' : '#f59e0b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: '700',
      }}>
        {isIn ? '↙' : '↗'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: '500' }}>
          {isIn ? 'Inward' : 'Outward'}{item.ref ? ` · ${item.ref}` : ''}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.party || '—'}{item.qty ? ` · ${parseFloat(item.qty).toFixed(1)} kg` : ''}
        </div>
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-4)', flexShrink: 0, marginTop: '2px' }}>
        {fmtTimeAgo(item.created_at)}
      </span>
    </div>
  );
}

// ─── Shimmer Skeleton ───────────────────────────────────────────────────────
function Skeleton({ width = '100%', height = 18, style = {} }) {
  return (
    <div style={{
      width, height,
      background: 'linear-gradient(90deg, var(--border) 25%, var(--surface-2) 50%, var(--border) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      borderRadius: 'var(--radius-sm)',
      ...style,
    }} />
  );
}

// ─── Section Card ───────────────────────────────────────────────────────────
function SectionCard({ title, badge, badgeBg, badgeColor, onViewAll, children, style: extraStyle = {} }) {
  return (
    <div style={{ ...sb.sectionCard, ...extraStyle }}>
      <div style={sb.sectionHeader}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={sb.sectionTitle}>{title}</span>
          {badge != null && badge > 0 && (
            <span style={{ ...sb.badge, background: badgeBg, color: badgeColor, fontSize: '10px', fontWeight: '700' }}>
              {badge}
            </span>
          )}
        </span>
        {onViewAll && (
          <button style={sb.viewAllBtn} onClick={onViewAll}>View All</button>
        )}
      </div>
      <div style={{ padding: '0 16px 16px' }}>{children}</div>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    locked:    { bg: 'var(--success-dim)', color: 'var(--success)' },
    confirmed: { bg: 'var(--primary-dim)', color: 'var(--primary)' },
    draft:     { bg: 'var(--border)',      color: 'var(--text-3)' },
    open:      { bg: 'var(--warning-dim)', color: 'var(--warning)' },
  };
  const c = map[status] || map.draft;
  return <span style={{ ...sb.badge, background: c.bg, color: c.color }}>{status}</span>;
}

// ─── Custom Tooltip for Recharts ────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius)',
      padding: '8px 12px',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-1)', marginBottom: '4px' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ fontSize: '11px', color: p.color }}>
          {p.name === 'stock_value' ? fmtCurrency(p.value) : fmtKg(p.value)}
        </div>
      ))}
    </div>
  );
}

const CHART_COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#06B6D4'];

// ─── Category Snapshot Chart ────────────────────────────────────────────────
function CategoryChart({ data }) {
  if (!data?.length) return (
    <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: '12px' }}>
      No category data
    </div>
  );
  const chartData = data.map(d => ({
    ...d,
    label: d.category.length > 10 ? d.category.slice(0, 10) + '…' : d.category,
  }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="stock_kg" name="stock_kg" radius={[3, 3, 0, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Velocity Leaders Table ─────────────────────────────────────────────────
function VelocityLeadersTable({ leaders, navigate }) {
  if (!leaders?.length) return (
    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-4)', fontSize: '12px' }}>
      No dispatch data yet — velocity leaders will appear after your first outward.
    </div>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={sb.table}>
        <thead>
          <tr>
            <th style={sb.th}>#</th>
            <th style={sb.th}>Item</th>
            <th style={sb.th}>Velocity</th>
            <th style={sb.th}>Stock</th>
            <th style={sb.th}>Days Left</th>
            <th style={sb.th}>Trend</th>
            <th style={sb.th}>Risk</th>
          </tr>
        </thead>
        <tbody>
          {leaders.map((l, i) => (
            <tr key={l.id} style={{ background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent', cursor: 'pointer' }}
              onClick={() => navigate(`/items/${l.id}`)}>
              <td style={sb.td}>
                <span style={{ color: 'var(--text-4)', fontSize: '11px' }}>{i + 1}</span>
              </td>
              <td style={sb.td}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '12px', color: 'var(--text-1)' }}>{l.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-4)' }}>{l.item_code}</div>
                </div>
              </td>
              <td style={sb.td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-1)' }}>
                    {parseFloat(l.velocity_per_day).toFixed(1)}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-4)' }}>kg/d</span>
                  <VelocityBadge kgPerDay={l.velocity_per_day} />
                </div>
              </td>
              <td style={sb.td}>
                <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>{fmtKg(l.stock_kg)}</span>
              </td>
              <td style={{ ...sb.td, minWidth: '100px' }}>
                <StockHealthBar daysRemaining={l.days_remaining} leadTime={l.lead_time_days || 7} />
              </td>
              <td style={sb.td}>
                <TrendPill trend={l.demand_trend} />
              </td>
              <td style={sb.td}>
                <RiskBadge risk={l.stockout_risk} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── KPI Strip ──────────────────────────────────────────────────────────────
const KPI_DEFS = [
  {
    key: 'totalStockValue',
    label: 'Stock Value',
    fmt: fmtCurrency,
    iconBg: 'rgba(245,158,11,0.15)',
    iconColor: '#F59E0B',
    icon: '₹',
    isText: true,
    big: true,
  },
  {
    key: 'totalItems',
    label: 'SKUs',
    fmt: fmtInt,
    iconBg: 'rgba(59,130,246,0.15)',
    iconColor: '#3B82F6',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    key: 'lowStockCount',
    label: 'Low Stock',
    fmt: fmtInt,
    iconBg: 'rgba(239,68,68,0.15)',
    iconColor: '#ef4444',
    alertIfPositive: true,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    key: 'expiryRiskCount',
    label: 'Expiry Risk',
    fmt: fmtInt,
    iconBg: 'rgba(249,115,22,0.15)',
    iconColor: '#f97316',
    alertIfPositive: true,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    key: 'pendingInward',
    label: 'Pending In',
    fmt: fmtInt,
    iconBg: 'rgba(16,185,129,0.15)',
    iconColor: '#10b981',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    key: 'pendingOutward',
    label: 'Pending Out',
    fmt: fmtInt,
    iconBg: 'rgba(245,158,11,0.15)',
    iconColor: '#f59e0b',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
      </svg>
    ),
  },
  {
    key: 'todayDispatchedKg',
    label: "Today's Dispatch",
    fmt: v => fmtKg(v),
    iconBg: 'rgba(139,92,246,0.15)',
    iconColor: '#8b5cf6',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
];

function KpiStrip({ kpis, loading }) {
  return (
    <div style={sb.kpiGrid}>
      {KPI_DEFS.map(def => {
        const val = kpis?.[def.key] ?? 0;
        const isAlert = def.alertIfPositive && val > 0;
        return (
          <div key={def.key} style={{
            ...sb.kpiCard,
            borderColor: isAlert ? 'rgba(239,68,68,0.35)' : 'var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: isAlert ? 'rgba(239,68,68,0.15)' : def.iconBg,
                color: isAlert ? '#ef4444' : def.iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: def.isText ? '12px' : '14px', fontWeight: def.isText ? '800' : 'normal',
              }}>
                {def.isText ? def.icon : def.icon}
              </div>
              {isAlert && (
                <span style={{ ...sb.badge, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: '9px' }}>
                  ALERT
                </span>
              )}
            </div>
            {loading
              ? <Skeleton height={24} width="60%" style={{ marginBottom: '6px' }} />
              : <div style={sb.kpiValue}>{def.fmt(val)}</div>}
            <div style={sb.kpiLabel}>{def.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Low Stock Panel (compact) ──────────────────────────────────────────────
function LowStockPanel({ rows, navigate }) {
  return (
    <SectionCard
      title="Low Stock"
      badge={rows.length}
      badgeBg="rgba(239,68,68,0.12)"
      badgeColor="#ef4444"
      onViewAll={() => navigate('/expiry-alerts')}
    >
      {rows.length === 0
        ? <div style={sb.emptyGreen}>All items adequately stocked</div>
        : (
          <table style={{ ...sb.table, marginTop: '8px' }}>
            <thead>
              <tr>
                <th style={sb.th}>Item</th>
                <th style={sb.th}>Stock</th>
                <th style={sb.th}>ROP</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((r, i) => (
                <tr key={r.itemCode} style={{ background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}>
                  <td style={sb.td}>
                    <div style={{ fontWeight: '600', fontSize: '11px', color: 'var(--text-1)' }}>{r.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-4)' }}>{r.itemCode}</div>
                  </td>
                  <td style={sb.td}>
                    <span style={{ ...sb.badge, background: r.stockKg === 0 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: r.stockKg === 0 ? '#ef4444' : '#f59e0b', fontSize: '10px' }}>
                      {fmtKg(r.stockKg)}
                    </span>
                  </td>
                  <td style={{ ...sb.td, color: 'var(--text-3)', fontSize: '11px' }}>{fmtKg(r.ropKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </SectionCard>
  );
}

// ─── Expiry Panel (compact) ─────────────────────────────────────────────────
function ExpiryPanel({ rows, navigate }) {
  return (
    <SectionCard
      title="Expiring Soon"
      badge={rows.length}
      badgeBg="rgba(249,115,22,0.12)"
      badgeColor="#f97316"
      onViewAll={() => navigate('/expiry-alerts')}
    >
      {rows.length === 0
        ? <div style={sb.emptyGreen}>No items expiring within 30 days</div>
        : (
          <table style={{ ...sb.table, marginTop: '8px' }}>
            <thead>
              <tr>
                <th style={sb.th}>Item</th>
                <th style={sb.th}>Expiry</th>
                <th style={sb.th}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((r, i) => (
                <tr key={r.batchId} style={{ background: i % 2 === 1 ? 'var(--surface-2)' : 'transparent' }}>
                  <td style={sb.td}>
                    <div style={{ fontWeight: '600', fontSize: '11px', color: 'var(--text-1)' }}>{r.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-4)' }}>{r.itemCode}</div>
                  </td>
                  <td style={sb.td}>
                    <span style={{ fontSize: '11px', color: r.daysToExpiry <= 7 ? '#ef4444' : '#f97316', fontWeight: '600' }}>
                      {fmtDate(r.expiryDate)}
                    </span>
                  </td>
                  <td style={{ ...sb.td, fontSize: '11px', color: 'var(--text-2)' }}>{fmtKg(r.qtyRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </SectionCard>
  );
}

// ─── Error Banner ────────────────────────────────────────────────────────────
function ErrorBanner({ message, onRetry }) {
  return (
    <div style={sb.errorBanner}>
      <span style={{ color: 'var(--danger)', fontSize: '13px', flex: 1 }}>{message}</span>
      <button style={sb.retryBtn} onClick={onRetry}>Retry</button>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const sb = {
  // Hero header
  hero: {
    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #0F172A 100%)',
    padding: '28px 32px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    position: 'relative',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: '-60px',
    right: '-60px',
    width: '280px',
    height: '280px',
    background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  heroRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    position: 'relative',
    zIndex: 1,
  },
  heroGreeting: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#fff',
    margin: 0,
    lineHeight: '1.2',
  },
  heroSub: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.45)',
    marginTop: '4px',
  },
  heroTagline: {
    fontSize: '11px',
    color: '#F59E0B',
    fontWeight: '600',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  refreshArea: {
    display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
  },
  lastUpdated: {
    fontSize: '11px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap',
  },
  refreshBtn: {
    padding: '7px 16px',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    display: 'flex', alignItems: 'center', gap: '6px',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap',
    backdropFilter: 'blur(8px)',
  },
  // Content
  content: {
    padding: '20px 32px 32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  // KPI grid — 7 cards
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '12px',
    marginBottom: '20px',
  },
  kpiCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '14px 16px',
    boxShadow: 'var(--shadow-xs)',
  },
  kpiValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--text-1)',
    lineHeight: '1',
    marginBottom: '4px',
    letterSpacing: '-0.3px',
  },
  kpiLabel: {
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--text-4)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  // Main grid
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: '16px',
    marginBottom: '16px',
    alignItems: 'start',
  },
  // Bottom grid
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  storeStrip: {
    background: 'linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 50%, rgba(15,23,42,0.96) 100%)',
    border: '1px solid rgba(245,158,11,0.18)',
    borderRadius: 'var(--radius-lg)',
    padding: '18px',
    marginBottom: '16px',
    boxShadow: 'var(--shadow-sm)',
    color: '#fff',
    position: 'relative',
    overflow: 'hidden',
  },
  storeStripGlow: {
    position: 'absolute',
    inset: 'auto -80px -80px auto',
    width: '220px',
    height: '220px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.03) 55%, transparent 70%)',
    pointerEvents: 'none',
  },
  storeStripTitle: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(245,158,11,0.95)',
    marginBottom: '6px',
  },
  storeStripHeading: {
    fontSize: '20px',
    fontWeight: '800',
    lineHeight: '1.2',
    margin: 0,
  },
  storeStripSub: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.62)',
    marginTop: '6px',
    maxWidth: '760px',
  },
  storePillGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gap: '10px',
    marginTop: '16px',
  },
  storePill: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '14px',
    padding: '12px 12px 10px',
    minHeight: '84px',
  },
  storePillLabel: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.48)',
    marginBottom: '8px',
    fontWeight: '700',
  },
  storePillValue: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#fff',
    lineHeight: '1.2',
  },
  lifecycleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '14px',
  },
  lifecycleStep: {
    padding: '8px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: '700',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: 'rgba(255,255,255,0.88)',
  },
  lifecycleArrow: {
    color: 'rgba(245,158,11,0.95)',
    fontWeight: '900',
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  quickCard: {
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid rgba(148,163,184,0.24)',
    borderRadius: '18px',
    padding: '16px',
    boxShadow: 'var(--shadow-xs)',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
  },
  quickCardTitle: {
    fontSize: '14px',
    fontWeight: '800',
    color: 'var(--text-1)',
    margin: '0 0 6px',
  },
  quickCardSub: {
    fontSize: '12px',
    lineHeight: '1.45',
    color: 'var(--text-3)',
    margin: 0,
  },
  // Section cards
  sectionCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-xs)',
  },
  sectionHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-1)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  viewAllBtn: {
    padding: '4px 10px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-3)',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '600',
    transition: 'background 0.15s',
  },
  // Table
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  th: {
    background: 'var(--surface-2)',
    padding: '7px 10px',
    textAlign: 'left',
    borderBottom: '1px solid var(--border)',
    fontWeight: '600',
    color: 'var(--text-3)',
    whiteSpace: 'nowrap',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
    color: 'var(--text-2)',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  },
  emptyGreen: {
    padding: '20px',
    textAlign: 'center',
    color: 'var(--success)',
    fontSize: '12px',
    fontWeight: '500',
    background: 'var(--success-dim)',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(16,185,129,0.2)',
    margin: '8px 0',
  },
  errorBanner: {
    background: 'var(--danger-dim)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 'var(--radius-lg)',
    padding: '10px 16px',
    marginBottom: '16px',
    display: 'flex', alignItems: 'center', gap: '12px',
  },
  retryBtn: {
    padding: '4px 12px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--danger)',
    background: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer',
    fontSize: '12px', fontWeight: '600', flexShrink: 0,
  },
};

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate  = useNavigate();
  const user      = safeUser();
  const [mis, setMis]           = useState(null);
  const [intel, setIntel]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [lastFetched, setLastFetched] = useState(null);
  const [elapsed, setElapsed]   = useState(0);
  const elapsedRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [misRes, intelRes] = await Promise.allSettled([
        client.get('/reports/mis-dashboard'),
        client.get('/intelligence/command-center'),
      ]);
      if (misRes.status === 'fulfilled') setMis(misRes.value.data.data);
      if (intelRes.status === 'fulfilled') setIntel(intelRes.value.data);
      if (misRes.status === 'rejected' && intelRes.status === 'rejected') {
        setError(misRes.reason?.response?.data?.error || 'Failed to load dashboard');
      }
      setLastFetched(Date.now());
      setElapsed(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!lastFetched) return;
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastFetched) / 1000));
    }, 1000);
    return () => clearInterval(elapsedRef.current);
  }, [lastFetched]);

  const elapsedLabel = elapsed < 60
    ? `${elapsed}s ago`
    : elapsed < 3600
      ? `${Math.floor(elapsed / 60)}m ago`
      : `${Math.floor(elapsed / 3600)}h ago`;

  const summary      = mis?.summary || {};
  const lowStock     = mis?.lowStock || [];
  const expiryAlerts = mis?.expiryAlerts || [];

  // Merge KPIs from both sources
  const kpis = {
    totalStockValue:   intel?.kpis?.totalStockValue   ?? summary.totalStockValue   ?? 0,
    totalItems:        intel?.kpis?.totalItems         ?? summary.totalItems         ?? 0,
    lowStockCount:     intel?.kpis?.lowStockCount      ?? lowStock.length            ?? 0,
    expiryRiskCount:   intel?.kpis?.expiryRiskCount    ?? expiryAlerts.length        ?? 0,
    pendingInward:     intel?.kpis?.pendingInward      ?? summary.pendingInward      ?? 0,
    pendingOutward:    intel?.kpis?.pendingOutward     ?? summary.pendingOutward     ?? 0,
    todayDispatchedKg: intel?.kpis?.todayDispatchedKg  ?? 0,
  };

  const velocityLeaders  = intel?.velocityLeaders  || [];
  const activityFeed     = intel?.activityFeed     || [];
  const categorySnapshot = intel?.categorySnapshot || [];
  const insights         = intel?.insights         || [];

  const userName = user?.name ? user.name.split(' ')[0] : 'there';
  const hasData = mis || intel;
  const storeModules = [
    { title: 'Store Item Master', sub: 'Create and control items', path: '/store/item-master' },
    { title: 'Store Requisition', sub: 'Department request workflow', path: '/store/requisition' },
    { title: 'Purchase Orders', sub: 'Procure stock with approvals', path: '/store/purchase-order' },
    { title: 'Invoice Entry', sub: 'Capture vendor bills', path: '/store/purchase-invoice' },
    { title: 'Dept Transfer', sub: 'Move stock to departments', path: '/store/transfer-to-department' },
    { title: 'Stock Tracking', sub: 'Ledger and running balance', path: '/store/stock-tracking' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '32px' }}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position:  200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <Nav />

      {/* ── Hero Header ── */}
      <div style={sb.hero}>
        <div style={sb.heroGlow} />
        <div style={sb.heroRow}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={sb.heroTagline}>AI Retail Intelligence · Command Center</div>
            <h1 style={sb.heroGreeting}>{getGreeting()}, {userName}</h1>
            <p style={sb.heroSub}>{fmtDateLong()} &nbsp;·&nbsp; Real-time inventory intelligence</p>
          </div>
          <div style={sb.refreshArea}>
            {lastFetched && !loading && (
              <span style={sb.lastUpdated}>Updated {elapsedLabel}</span>
            )}
            <button style={sb.refreshBtn} onClick={load} disabled={loading}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div style={sb.content}>
        <div style={sb.storeStrip}>
          <div style={sb.storeStripGlow} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={sb.storeStripTitle}>Store Management Module</div>
            <h2 style={sb.storeStripHeading}>Operational spine for item master, requisition, procurement, receipt, issue, and ledger</h2>
            <p style={sb.storeStripSub}>
              Built to surface the full material lifecycle in one place: request, approve, purchase, receive, issue, acknowledge, and audit.
            </p>
            <div style={sb.lifecycleRow} aria-label="Store lifecycle">
              <span style={sb.lifecycleStep}>Item Master</span>
              <span style={sb.lifecycleArrow}>→</span>
              <span style={sb.lifecycleStep}>Requisition</span>
              <span style={sb.lifecycleArrow}>→</span>
              <span style={sb.lifecycleStep}>Approval</span>
              <span style={sb.lifecycleArrow}>→</span>
              <span style={sb.lifecycleStep}>PO / GRN</span>
              <span style={sb.lifecycleArrow}>→</span>
              <span style={sb.lifecycleStep}>Issue</span>
              <span style={sb.lifecycleArrow}>→</span>
              <span style={sb.lifecycleStep}>Ledger</span>
            </div>
            <div style={sb.storePillGrid}>
              <div style={sb.storePill}>
                <div style={sb.storePillLabel}>Current State</div>
                <div style={sb.storePillValue}>Stock, reservations, and alerts in real time</div>
              </div>
              <div style={sb.storePill}>
                <div style={sb.storePillLabel}>Workflow</div>
                <div style={sb.storePillValue}>Partial issue and multi-level approvals</div>
              </div>
              <div style={sb.storePill}>
                <div style={sb.storePillLabel}>Procurement</div>
                <div style={sb.storePillValue}>PO, GRN, invoice matching</div>
              </div>
              <div style={sb.storePill}>
                <div style={sb.storePillLabel}>Visibility</div>
                <div style={sb.storePillValue}>Dashboard, reports, and audit</div>
              </div>
              <div style={sb.storePill}>
                <div style={sb.storePillLabel}>Traceability</div>
                <div style={sb.storePillValue}>Every movement writes a ledger row</div>
              </div>
              <div style={sb.storePill}>
                <div style={sb.storePillLabel}>Usability</div>
                <div style={sb.storePillValue}>Large tables, fast search, barcode-first</div>
              </div>
            </div>
          </div>
        </div>

        <div style={sb.quickGrid}>
          {storeModules.map((mod) => (
            <div
              key={mod.path}
              style={sb.quickCard}
              onClick={() => navigate(mod.path)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 30px rgba(15,23,42,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; }}
            >
              <h3 style={sb.quickCardTitle}>{mod.title}</h3>
              <p style={sb.quickCardSub}>{mod.sub}</p>
            </div>
          ))}
        </div>

        {error && <ErrorBanner message={error} onRetry={load} />}

        {/* ── KPI Strip ── */}
        <KpiStrip kpis={kpis} loading={loading && !hasData} />

        {/* ── Main 2-col: Velocity leaders + Right sidebar ── */}
        <div style={sb.mainGrid}>

          {/* Left: Velocity Leaders + Category Chart */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Velocity Leaders */}
            <SectionCard title="Velocity Leaders — Top 15 SKUs" onViewAll={() => navigate('/items')}>
              {loading && !intel
                ? <div style={{ padding: '16px' }}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={32} style={{ marginBottom: '8px' }} />)}</div>
                : <VelocityLeadersTable leaders={velocityLeaders} navigate={navigate} />
              }
            </SectionCard>

            {/* Category Snapshot */}
            <SectionCard title="Stock by Category (kg)">
              {loading && !intel
                ? <Skeleton height={160} style={{ margin: '16px' }} />
                : (
                  <div style={{ padding: '8px 0' }}>
                    <CategoryChart data={categorySnapshot} />
                  </div>
                )}
            </SectionCard>
          </div>

          {/* Right: AI Insights + Activity Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* AI Insights */}
            <SectionCard title="AI Insights">
              {loading && !intel
                ? <div style={{ padding: '8px 0' }}>{[...Array(3)].map((_, i) => <Skeleton key={i} height={52} style={{ marginBottom: '8px' }} />)}</div>
                : insights.length === 0
                  ? <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-4)', fontSize: '12px' }}>No alerts — inventory looks healthy.</div>
                  : <div style={{ paddingTop: '8px' }}>{insights.map(ins => <AIInsightCard key={ins.id} insight={ins} navigate={navigate} />)}</div>
              }
            </SectionCard>

            {/* Activity Feed */}
            <SectionCard title="Live Activity" onViewAll={() => navigate('/inward')}>
              {loading && !intel
                ? <div>{[...Array(5)].map((_, i) => <Skeleton key={i} height={36} style={{ marginBottom: '6px' }} />)}</div>
                : activityFeed.length === 0
                  ? <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-4)', fontSize: '12px' }}>No activity in last 7 days.</div>
                  : <div>{activityFeed.slice(0, 10).map((item, i) => <ActivityItem key={i} item={item} />)}</div>
              }
            </SectionCard>

          </div>
        </div>

        {/* ── Bottom row: Low Stock + Expiry ── */}
        <div style={sb.bottomGrid}>
          {loading && !mis
            ? [0, 1].map(i => (
              <div key={i} style={sb.sectionCard}>
                <div style={sb.sectionHeader}><Skeleton width="40%" height={12} /></div>
                <div style={{ padding: '16px' }}>{[...Array(4)].map((_, j) => <Skeleton key={j} height={14} style={{ marginBottom: '10px' }} />)}</div>
              </div>
            ))
            : (
              <>
                <LowStockPanel rows={lowStock} navigate={navigate} />
                <ExpiryPanel rows={expiryAlerts} navigate={navigate} />
              </>
            )}
        </div>

      </div>
    </div>
  );
}
