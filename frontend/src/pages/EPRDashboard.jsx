// EPRDashboard.jsx — EPR Waste Logging Dashboard
// Tailwind v4 via @tailwindcss/vite (no preflight — safe coexistence with existing app styles)
import '../epr.css';

import React, { useState, useMemo, useRef } from 'react';

// ============================================================================
// EMBEDDED DATA — Material classes (India PWM Rules 2022 rates)
// ============================================================================
const MATERIAL_CLASSES = {
  'CAT-I-HDPE': {
    code: 'CAT-I-HDPE', name: 'HDPE Rigid',
    fullName: 'Category I — HDPE rigid trays, jars, bottles',
    eprCat: 'I', polymer: 'HDPE #2', recyclability: 'high',
    color: '#10B981', rateInr: 4.50, targetRecoveryPct: 30,
    desc: 'Rigid plastics with established recycling streams.',
  },
  'CAT-I-PP': {
    code: 'CAT-I-PP', name: 'PP Rigid',
    fullName: 'Category I — Polypropylene rigid containers, caps',
    eprCat: 'I', polymer: 'PP #5', recyclability: 'medium',
    color: '#0EA5E9', rateInr: 4.50, targetRecoveryPct: 25,
    desc: 'Rigid PP; recyclable but mixed-stream contamination common.',
  },
  'CAT-II-LDPE': {
    code: 'CAT-II-LDPE', name: 'LDPE Flexible',
    fullName: 'Category II — LDPE flexible single-layer pouches/films',
    eprCat: 'II', polymer: 'LDPE #4', recyclability: 'medium',
    color: '#F59E0B', rateInr: 6.00, targetRecoveryPct: 20,
    desc: 'Single-layer flexible plastics. Recyclable via specialised lines only.',
  },
  'CAT-III-MLP': {
    code: 'CAT-III-MLP', name: 'MLP Non-Recyc',
    fullName: 'Category III — Multi-Layer Plastic (foil-laminate)',
    eprCat: 'III', polymer: 'MLP / Other #7', recyclability: 'low',
    color: '#EF4444', rateInr: 12.00, targetRecoveryPct: 0,
    desc: 'Multi-layer laminates: aluminium + PET + PE. No commercial recycling pathway. Highest EPR liability.',
  },
  'PET-01': {
    code: 'PET-01', name: 'PET Bottle',
    fullName: 'PET #1 transparent beverage bottles',
    eprCat: null, polymer: 'PET #1', recyclability: 'high',
    color: '#3B82F6', rateInr: 3.50, targetRecoveryPct: 40,
    desc: 'Clear PET — highest value post-consumer recyclate stream.',
  },
  'LIQUID-CARTON': {
    code: 'LIQUID-CARTON', name: 'TetraPak Carton',
    fullName: 'Liquid Carton (paper + PE + Al foil)',
    eprCat: null, polymer: 'PAP-21', recyclability: 'high',
    color: '#8B5CF6', rateInr: 2.00, targetRecoveryPct: 35,
    desc: 'Aseptic multi-material carton; pulped + delaminated.',
  },
  'ALU-CAN': {
    code: 'ALU-CAN', name: 'Aluminium Can',
    fullName: 'Aluminium beverage can',
    eprCat: null, polymer: 'ALU-41', recyclability: 'high',
    color: '#94A3B8', rateInr: 2.50, targetRecoveryPct: 60,
    desc: 'Infinitely recyclable; highest recovery rate of any packaging material.',
  },
  'PAPERBOARD': {
    code: 'PAPERBOARD', name: 'Paperboard',
    fullName: 'Paperboard / corrugated cardboard',
    eprCat: null, polymer: 'PAP-21', recyclability: 'high',
    color: '#A16207', rateInr: 1.50, targetRecoveryPct: 55,
    desc: 'Fibre-based; widely accepted in municipal paper recycling.',
  },
};

// ============================================================================
// EMBEDDED DATA — Retail categories + sub-categories
// ============================================================================
const CATEGORIES = [
  {
    id: 'fresh-dairy',
    name: 'Fresh Produce & Dairy',
    shortName: 'Dairy & Fresh',
    icon: 'dairy',
    status: 'mixed',
    statusLabel: 'High / Medium',
    accent: '#059669',
    accentBg: '#ECFDF5',
    statusBorder: 'green',
    note: 'Dairy pouches (LDPE) and rigid trays (HDPE) are recyclable when cleaned. Segregate at source for highest recovery.',
    defaultMaterials: [
      { code: 'CAT-I-HDPE', fraction: 0.30 },
      { code: 'CAT-II-LDPE', fraction: 0.70 },
    ],
    subCategories: [
      { id: 'milk', name: 'Milk', icon: 'milk-pouch', avgWeightG: 42, recyclability: 'medium',
        materials: [{ code: 'CAT-II-LDPE', fraction: 0.88 }, { code: 'CAT-I-HDPE', fraction: 0.12 }],
        example: 'Amul Taaza 1L / Mother Dairy 500ml pouch' },
      { id: 'curd', name: 'Curd', icon: 'curd-cup', avgWeightG: 18, recyclability: 'high',
        materials: [{ code: 'CAT-I-PP', fraction: 0.78 }, { code: 'CAT-II-LDPE', fraction: 0.22 }],
        example: 'Amul Masti 400g / Nestle a+ 200g cup' },
      { id: 'paneer', name: 'Paneer', icon: 'paneer-pack', avgWeightG: 14, recyclability: 'medium',
        materials: [{ code: 'CAT-II-LDPE', fraction: 0.70 }, { code: 'CAT-III-MLP', fraction: 0.30 }],
        example: 'Amul / Mother Dairy 200g vacuum brick' },
      { id: 'vegetables', name: 'Vegetables', icon: 'veggie-tray', avgWeightG: 28, recyclability: 'medium',
        materials: [{ code: 'CAT-I-HDPE', fraction: 0.55 }, { code: 'CAT-II-LDPE', fraction: 0.45 }],
        example: 'Tray-packed mixed veg / leafy bunches' },
      { id: 'fruits', name: 'Fruits', icon: 'fruit-net', avgWeightG: 22, recyclability: 'medium',
        materials: [{ code: 'CAT-II-LDPE', fraction: 0.65 }, { code: 'PAPERBOARD', fraction: 0.35 }],
        example: 'Apples / oranges in mesh net pack' },
    ],
  },
  {
    id: 'beverages',
    name: 'Beverages',
    shortName: 'Beverages',
    icon: 'beverage',
    status: 'high',
    statusLabel: 'High',
    accent: '#0284C7',
    accentBg: '#EFF6FF',
    statusBorder: 'green',
    note: 'PET #1, aluminium cans and TetraPak all have established recycling streams. High EPR-recovery potential.',
    defaultMaterials: [
      { code: 'PET-01', fraction: 0.50 },
      { code: 'LIQUID-CARTON', fraction: 0.25 },
      { code: 'ALU-CAN', fraction: 0.25 },
    ],
    subCategories: [
      { id: 'water', name: 'Bottled Water', icon: 'water-bottle', avgWeightG: 24, recyclability: 'high',
        materials: [{ code: 'PET-01', fraction: 0.92 }, { code: 'CAT-I-HDPE', fraction: 0.08 }],
        example: 'Bisleri 1L / Aquafina 500ml' },
      { id: 'soft-drinks', name: 'Soft Drinks', icon: 'soft-drink-can', avgWeightG: 15, recyclability: 'high',
        materials: [{ code: 'ALU-CAN', fraction: 1.00 }],
        example: 'Coca-Cola 330ml can / Thums Up 250ml' },
      { id: 'juices', name: 'Fresh Juices', icon: 'juice-tetra', avgWeightG: 32, recyclability: 'high',
        materials: [{ code: 'LIQUID-CARTON', fraction: 0.85 }, { code: 'CAT-I-HDPE', fraction: 0.15 }],
        example: 'Real / Tropicana 1L TetraPak' },
      { id: 'energy-drinks', name: 'Energy Drinks', icon: 'energy-can', avgWeightG: 16, recyclability: 'high',
        materials: [{ code: 'ALU-CAN', fraction: 1.00 }],
        example: 'Red Bull 250ml / Sting 250ml slim can' },
      { id: 'tea-coffee', name: 'Tea / Coffee', icon: 'tea-pack', avgWeightG: 8, recyclability: 'low',
        materials: [{ code: 'CAT-III-MLP', fraction: 0.70 }, { code: 'PAPERBOARD', fraction: 0.30 }],
        example: 'Tea bags / instant coffee sachets' },
    ],
  },
  {
    id: 'snacks',
    name: 'Snacks & Munchies',
    shortName: 'Snacks',
    icon: 'snacks',
    status: 'low',
    statusLabel: 'Low (MLP)',
    accent: '#DC2626',
    accentBg: '#FEF2F2',
    statusBorder: 'red',
    note: 'Category III MLP packaging — multi-layer foil laminates have no commercial recycling pathway. Highest EPR liability at ₹12/kg.',
    defaultMaterials: [
      { code: 'CAT-III-MLP', fraction: 1.00 },
    ],
    subCategories: [
      { id: 'chips', name: 'Chips', icon: 'chips-bag', avgWeightG: 12, recyclability: 'low',
        materials: [{ code: 'CAT-III-MLP', fraction: 1.00 }],
        example: 'Lays / Bingo / Kurkure 50g' },
      { id: 'cookies', name: 'Cookies / Biscuits', icon: 'cookie-pack', avgWeightG: 18, recyclability: 'low',
        materials: [{ code: 'CAT-III-MLP', fraction: 0.75 }, { code: 'CAT-II-LDPE', fraction: 0.25 }],
        example: 'Parle-G / Oreo / Bourbon family pack' },
      { id: 'choco', name: 'Chocolates', icon: 'choco-bar', avgWeightG: 9, recyclability: 'low',
        materials: [{ code: 'CAT-III-MLP', fraction: 1.00 }],
        example: 'Dairy Milk / KitKat / Munch' },
      { id: 'noodles', name: 'Instant Noodles', icon: 'noodles-pack', avgWeightG: 22, recyclability: 'low',
        materials: [{ code: 'CAT-III-MLP', fraction: 0.85 }, { code: 'PAPERBOARD', fraction: 0.15 }],
        example: 'Maggi 70g / Yippee / Top Ramen' },
    ],
  },
  {
    id: 'personal-care',
    name: 'Personal Care',
    shortName: 'Personal Care',
    icon: 'personal-care',
    status: 'medium',
    statusLabel: 'Medium (pumps)',
    accent: '#D97706',
    accentBg: '#FFFBEB',
    statusBorder: 'yellow',
    note: 'HDPE bottles are recyclable, but pump-nozzle assemblies (mixed polymers + spring) complicate recovery. Remove pumps before bin.',
    defaultMaterials: [
      { code: 'CAT-I-HDPE', fraction: 0.70 },
      { code: 'CAT-I-PP', fraction: 0.30 },
    ],
    subCategories: [
      { id: 'toothpaste', name: 'Toothpaste', icon: 'toothpaste', avgWeightG: 16, recyclability: 'medium',
        materials: [{ code: 'CAT-III-MLP', fraction: 0.65 }, { code: 'CAT-I-PP', fraction: 0.20 }, { code: 'PAPERBOARD', fraction: 0.15 }],
        example: 'Colgate / Pepsodent 150g tube' },
      { id: 'shampoo', name: 'Shampoo', icon: 'shampoo-bottle', avgWeightG: 38, recyclability: 'medium',
        materials: [{ code: 'CAT-I-HDPE', fraction: 0.78 }, { code: 'CAT-I-PP', fraction: 0.22 }],
        example: 'Head & Shoulders / Dove 340ml bottle' },
      { id: 'soap', name: 'Soap', icon: 'soap-bar', avgWeightG: 6, recyclability: 'high',
        materials: [{ code: 'PAPERBOARD', fraction: 0.85 }, { code: 'CAT-II-LDPE', fraction: 0.15 }],
        example: 'Lifebuoy / Dettol bar in paper wrap' },
      { id: 'deodorants', name: 'Deodorants', icon: 'deodorant', avgWeightG: 45, recyclability: 'medium',
        materials: [{ code: 'ALU-CAN', fraction: 0.82 }, { code: 'CAT-I-PP', fraction: 0.18 }],
        example: 'Axe / Nivea 150ml aerosol' },
      { id: 'sanitary', name: 'Sanitary Items', icon: 'sanitary-pack', avgWeightG: 28, recyclability: 'low',
        materials: [{ code: 'CAT-III-MLP', fraction: 0.60 }, { code: 'CAT-II-LDPE', fraction: 0.40 }],
        example: 'Whisper / Stayfree pack of 10' },
    ],
  },
  {
    id: 'dry-grocery',
    name: 'Breakfast Cereals & Dry Grocery',
    shortName: 'Dry Grocery',
    icon: 'dry-grocery',
    status: 'high',
    statusLabel: 'High',
    accent: '#65A30D',
    accentBg: '#F7FEE7',
    statusBorder: 'green',
    note: 'Paperboard boxes + LDPE inner liners. Cardboard recycles well; flexible bags need separate stream.',
    defaultMaterials: [
      { code: 'PAPERBOARD', fraction: 0.60 },
      { code: 'CAT-II-LDPE', fraction: 0.40 },
    ],
    subCategories: [
      { id: 'oats', name: 'Oats', icon: 'oats-box', avgWeightG: 52, recyclability: 'high',
        materials: [{ code: 'PAPERBOARD', fraction: 0.70 }, { code: 'CAT-II-LDPE', fraction: 0.30 }],
        example: 'Quaker / Saffola 1kg canister' },
      { id: 'corn-flakes', name: 'Corn Flakes', icon: 'cereal-box', avgWeightG: 68, recyclability: 'high',
        materials: [{ code: 'PAPERBOARD', fraction: 0.78 }, { code: 'CAT-II-LDPE', fraction: 0.22 }],
        example: "Kellogg's / Bagrry's 475g box" },
      { id: 'atta', name: 'Atta / Wheat Flour', icon: 'atta-bag', avgWeightG: 34, recyclability: 'medium',
        materials: [{ code: 'CAT-II-LDPE', fraction: 0.92 }, { code: 'PAPERBOARD', fraction: 0.08 }],
        example: 'Aashirvaad / Fortune 5kg sack' },
      { id: 'rice', name: 'Rice', icon: 'rice-bag', avgWeightG: 26, recyclability: 'medium',
        materials: [{ code: 'CAT-II-LDPE', fraction: 0.95 }, { code: 'PAPERBOARD', fraction: 0.05 }],
        example: 'India Gate Basmati 5kg pack' },
      { id: 'pulses', name: 'Pulses / Dal', icon: 'pulses-pack', avgWeightG: 18, recyclability: 'medium',
        materials: [{ code: 'CAT-II-LDPE', fraction: 0.90 }, { code: 'PAPERBOARD', fraction: 0.10 }],
        example: 'Tata Sampann / Patanjali 1kg dal pack' },
    ],
  },
];

// ============================================================================
// PROCESSING — compute per-material breakdown for a scanned/logged item
// ============================================================================
function processItemScan({ categoryId, subCategoryId, quantity = 1, overrideWeightG }) {
  const category = CATEGORIES.find(c => c.id === categoryId);
  if (!category) return null;
  const sub = category.subCategories.find(s => s.id === subCategoryId);
  if (!sub) return null;

  const qty = Math.max(1, Number(quantity) || 1);
  const packagingWeightG = overrideWeightG != null ? Number(overrideWeightG) : sub.avgWeightG;
  const totalWeightG = qty * packagingWeightG;
  const totalWeightKg = totalWeightG / 1000;

  const recycleRank = { low: 3, medium: 2, high: 1 };
  let worst = 'high';

  const breakdown = sub.materials.map(m => {
    const mat = MATERIAL_CLASSES[m.code];
    if (!mat) return null;
    const componentWeightG = totalWeightG * m.fraction;
    const weightKg = componentWeightG / 1000;
    const liability = +(weightKg * mat.rateInr).toFixed(4);
    if (recycleRank[mat.recyclability] > recycleRank[worst]) worst = mat.recyclability;
    return {
      ...mat,
      fraction: m.fraction,
      componentWeightG: +componentWeightG.toFixed(4),
      weightKg: +weightKg.toFixed(6),
      liability,
    };
  }).filter(Boolean);

  const totalLiabilityInr = +breakdown.reduce((s, b) => s + b.liability, 0).toFixed(4);

  const flags = [];
  if (breakdown.some(b => b.code === 'CAT-III-MLP')) {
    flags.push('⚠ Category III MLP — Extended EPR obligation applies');
  }
  if (worst === 'low') flags.push('⚠ Low recyclability — high shrinkage risk');
  if (breakdown.some(b => b.code === 'PET-01' && b.fraction > 0.5)) {
    flags.push('✓ PET-dominant — eligible for buyback credit');
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    categoryId,
    subCategoryId,
    categoryName: category.name,
    categoryAccent: category.accent,
    subCategoryName: sub.name,
    subIcon: sub.icon,
    quantity: qty,
    packagingWeightG,
    totalWeightG: +totalWeightG.toFixed(4),
    totalWeightKg: +totalWeightKg.toFixed(6),
    totalLiabilityInr,
    breakdown,
    recyclability: worst,
    flags,
  };
}

// ============================================================================
// SVG ICON SYSTEM — 29 minimalist flat-vector icons
// ============================================================================
function ItemIcon({ type, color = '#374151', size = 56 }) {
  const stroke = color;
  const fillLite = color;
  const common = {
    width: size, height: size, viewBox: '0 0 64 64',
    fill: 'none', stroke, strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };

  switch (type) {
    // -------- Category top-level icons --------
    case 'dairy':
      return (
        <svg {...common}>
          <rect x="14" y="12" width="22" height="34" rx="2" />
          <line x1="14" y1="20" x2="36" y2="20" />
          <line x1="20" y1="12" x2="20" y2="16" />
          <line x1="30" y1="12" x2="30" y2="16" />
          <rect x="40" y="30" width="14" height="18" rx="1.5" />
          <ellipse cx="47" cy="30" rx="7" ry="2" />
        </svg>
      );
    case 'beverage':
      return (
        <svg {...common}>
          <path d="M26 10 L26 14 L24 18 L24 50 Q24 54 28 54 L36 54 Q40 54 40 50 L40 18 L38 14 L38 10 Z" />
          <rect x="26" y="10" width="12" height="3" />
          <line x1="30" y1="22" x2="30" y2="50" />
          <circle cx="32" cy="32" r="1.2" fill={fillLite} stroke="none" />
          <circle cx="35" cy="38" r="1" fill={fillLite} stroke="none" />
          <circle cx="29" cy="44" r="1" fill={fillLite} stroke="none" />
        </svg>
      );
    case 'snacks':
      return (
        <svg {...common}>
          <path d="M14 14 L50 14 L48 18 L50 50 L14 50 L16 18 Z" />
          <line x1="14" y1="14" x2="50" y2="14" strokeDasharray="2 2" />
          <line x1="14" y1="50" x2="50" y2="50" strokeDasharray="2 2" />
          <path d="M20 26 Q24 30 28 26 T36 26 T44 26" />
          <path d="M20 36 Q24 40 28 36 T36 36 T44 36" />
        </svg>
      );
    case 'personal-care':
      return (
        <svg {...common}>
          <rect x="22" y="22" width="20" height="30" rx="2" />
          <rect x="26" y="12" width="6" height="10" />
          <path d="M26 12 L20 8 L20 12 Z" />
          <line x1="22" y1="32" x2="42" y2="32" />
          <line x1="22" y1="42" x2="42" y2="42" />
        </svg>
      );
    case 'dry-grocery':
      return (
        <svg {...common}>
          <rect x="16" y="10" width="32" height="44" rx="1.5" />
          <ellipse cx="32" cy="32" rx="8" ry="3" />
          <circle cx="28" cy="32" r="1" fill={fillLite} stroke="none" />
          <circle cx="32" cy="32" r="1" fill={fillLite} stroke="none" />
          <circle cx="36" cy="32" r="1" fill={fillLite} stroke="none" />
          <line x1="20" y1="18" x2="44" y2="18" />
          <line x1="20" y1="46" x2="44" y2="46" />
        </svg>
      );

    // -------- Fresh & Dairy sub-icons --------
    case 'milk-pouch':
      return (
        <svg {...common}>
          <path d="M20 14 L44 14 L42 50 L22 50 Z" />
          <line x1="20" y1="14" x2="44" y2="14" strokeDasharray="2 1" />
          <line x1="22" y1="50" x2="42" y2="50" strokeDasharray="2 1" />
          <text x="32" y="34" textAnchor="middle" fontSize="9" fill={stroke} stroke="none">MILK</text>
        </svg>
      );
    case 'curd-cup':
      return (
        <svg {...common}>
          <path d="M20 22 L24 52 L40 52 L44 22 Z" />
          <ellipse cx="32" cy="22" rx="12" ry="3" />
          <ellipse cx="32" cy="22" rx="12" ry="3" fill="none" strokeDasharray="2 1" />
          <line x1="22" y1="32" x2="42" y2="32" strokeDasharray="1 2" />
        </svg>
      );
    case 'paneer-pack':
      return (
        <svg {...common}>
          <rect x="14" y="20" width="36" height="24" rx="2" />
          <line x1="14" y1="24" x2="50" y2="24" />
          <line x1="14" y1="40" x2="50" y2="40" />
          <text x="32" y="35" textAnchor="middle" fontSize="7" fill={stroke} stroke="none">PANEER</text>
        </svg>
      );
    case 'veggie-tray':
      return (
        <svg {...common}>
          <rect x="12" y="36" width="40" height="14" rx="1" />
          <path d="M20 36 L20 24 Q22 18 26 22 Q28 16 32 22 Q34 16 38 22 Q42 18 44 24 L44 36" />
          <path d="M26 24 L26 20" />
          <path d="M32 22 L32 18" />
          <path d="M38 24 L38 20" />
        </svg>
      );
    case 'fruit-net':
      return (
        <svg {...common}>
          <path d="M16 16 L48 16 L44 52 L20 52 Z" />
          <line x1="20" y1="20" x2="44" y2="48" />
          <line x1="44" y1="20" x2="20" y2="48" />
          <line x1="32" y1="16" x2="32" y2="52" />
          <line x1="16" y1="34" x2="48" y2="34" />
          <circle cx="25" cy="30" r="3" />
          <circle cx="38" cy="38" r="3" />
          <circle cx="30" cy="44" r="3" />
        </svg>
      );

    // -------- Beverage sub-icons --------
    case 'water-bottle':
      return (
        <svg {...common}>
          <path d="M28 10 L28 16 L26 20 L26 52 Q26 54 28 54 L36 54 Q38 54 38 52 L38 20 L36 16 L36 10 Z" />
          <rect x="28" y="10" width="8" height="3" />
          <line x1="26" y1="24" x2="38" y2="24" />
          <line x1="28" y1="32" x2="36" y2="32" strokeDasharray="1 2" />
        </svg>
      );
    case 'soft-drink-can':
      return (
        <svg {...common}>
          <rect x="22" y="14" width="20" height="38" rx="2" />
          <ellipse cx="32" cy="14" rx="10" ry="2" />
          <ellipse cx="32" cy="52" rx="10" ry="2" />
          <path d="M28 12 L36 12 L34 14 L30 14 Z" />
          <line x1="22" y1="22" x2="42" y2="22" />
        </svg>
      );
    case 'juice-tetra':
      return (
        <svg {...common}>
          <path d="M18 18 L46 18 L46 54 L18 54 Z" />
          <path d="M18 18 L26 10 L46 10 L46 18" />
          <line x1="26" y1="10" x2="26" y2="18" />
          <rect x="34" y="12" width="4" height="4" />
          <line x1="40" y1="22" x2="40" y2="14" />
        </svg>
      );
    case 'energy-can':
      return (
        <svg {...common}>
          <rect x="24" y="10" width="16" height="44" rx="2" />
          <ellipse cx="32" cy="10" rx="8" ry="1.5" />
          <ellipse cx="32" cy="54" rx="8" ry="1.5" />
          <path d="M28 8 L36 8 L34 10 L30 10 Z" />
          <path d="M30 22 L34 28 L30 28 L34 36" />
        </svg>
      );
    case 'tea-pack':
      return (
        <svg {...common}>
          <rect x="20" y="22" width="24" height="28" rx="1.5" />
          <line x1="20" y1="28" x2="44" y2="28" strokeDasharray="1 2" />
          <line x1="32" y1="22" x2="32" y2="14" />
          <rect x="29" y="10" width="6" height="4" />
        </svg>
      );

    // -------- Snacks sub-icons --------
    case 'chips-bag':
      return (
        <svg {...common}>
          <path d="M14 14 L50 14 L48 20 L50 48 L14 48 L16 20 Z" />
          <line x1="14" y1="14" x2="50" y2="14" strokeDasharray="2 2" />
          <line x1="14" y1="48" x2="50" y2="48" strokeDasharray="2 2" />
          <path d="M20 26 L24 28 L28 26 L32 28 L36 26 L40 28 L44 26" />
          <path d="M20 34 L24 36 L28 34 L32 36 L36 34 L40 36 L44 34" />
          <text x="32" y="44" textAnchor="middle" fontSize="6" fill={stroke} stroke="none">CHIPS</text>
        </svg>
      );
    case 'cookie-pack':
      return (
        <svg {...common}>
          <rect x="12" y="22" width="40" height="20" rx="2" />
          <rect x="22" y="26" width="20" height="12" rx="1" strokeDasharray="2 1" />
          <circle cx="32" cy="32" r="4" />
          <circle cx="30" cy="30" r="0.6" fill={fillLite} stroke="none" />
          <circle cx="34" cy="30" r="0.6" fill={fillLite} stroke="none" />
          <circle cx="32" cy="34" r="0.6" fill={fillLite} stroke="none" />
        </svg>
      );
    case 'choco-bar':
      return (
        <svg {...common}>
          <rect x="16" y="24" width="32" height="16" rx="1" />
          <path d="M16 24 L12 20 L12 28 Z" />
          <path d="M48 24 L52 20 L52 28 Z" />
          <path d="M16 40 L12 44 L12 36 Z" />
          <path d="M48 40 L52 44 L52 36 Z" />
          <line x1="24" y1="24" x2="24" y2="40" />
          <line x1="32" y1="24" x2="32" y2="40" />
          <line x1="40" y1="24" x2="40" y2="40" />
        </svg>
      );
    case 'noodles-pack':
      return (
        <svg {...common}>
          <rect x="14" y="20" width="30" height="28" rx="1.5" />
          <text x="29" y="36" textAnchor="middle" fontSize="7" fill={stroke} stroke="none">MAGGI</text>
          <rect x="46" y="36" width="10" height="12" rx="1" />
          <line x1="46" y1="42" x2="56" y2="42" strokeDasharray="1 1" />
        </svg>
      );

    // -------- Personal Care sub-icons --------
    case 'toothpaste':
      return (
        <svg {...common}>
          <path d="M16 28 L44 28 L46 36 L44 44 L16 44 Z" />
          <path d="M16 28 L14 30 L14 42 L16 44" />
          <rect x="44" y="30" width="6" height="12" rx="1" />
          <rect x="50" y="32" width="3" height="8" rx="1" />
        </svg>
      );
    case 'shampoo-bottle':
      return (
        <svg {...common}>
          <rect x="18" y="22" width="28" height="30" rx="3" />
          <rect x="28" y="14" width="8" height="8" />
          <path d="M36 18 L44 18 L44 22" />
          <circle cx="44" cy="22" r="1.5" fill={fillLite} stroke="none" />
          <line x1="22" y1="32" x2="42" y2="32" />
          <line x1="22" y1="42" x2="42" y2="42" />
        </svg>
      );
    case 'soap-bar':
      return (
        <svg {...common}>
          <rect x="14" y="22" width="36" height="20" rx="2" />
          <path d="M14 22 L10 20 L10 42 L14 40" />
          <path d="M50 22 L54 20 L54 42 L50 40" />
          <text x="32" y="35" textAnchor="middle" fontSize="7" fill={stroke} stroke="none">SOAP</text>
        </svg>
      );
    case 'deodorant':
      return (
        <svg {...common}>
          <rect x="22" y="20" width="20" height="32" rx="2" />
          <rect x="26" y="10" width="12" height="10" rx="1" />
          <circle cx="32" cy="12" r="1.5" fill={fillLite} stroke="none" />
          <line x1="22" y1="28" x2="42" y2="28" />
          <line x1="22" y1="44" x2="42" y2="44" />
        </svg>
      );
    case 'sanitary-pack':
      return (
        <svg {...common}>
          <rect x="12" y="20" width="40" height="24" rx="1.5" />
          <line x1="18" y1="20" x2="18" y2="44" strokeDasharray="2 1" />
          <line x1="46" y1="20" x2="46" y2="44" strokeDasharray="2 1" />
          <text x="32" y="34" textAnchor="middle" fontSize="6" fill={stroke} stroke="none">PADS</text>
        </svg>
      );

    // -------- Dry Grocery sub-icons --------
    case 'oats-box':
      return (
        <svg {...common}>
          <rect x="22" y="14" width="20" height="40" rx="2" />
          <ellipse cx="32" cy="14" rx="10" ry="3" />
          <ellipse cx="32" cy="54" rx="10" ry="3" fill="none" />
          <line x1="22" y1="22" x2="42" y2="22" />
          <text x="32" y="38" textAnchor="middle" fontSize="7" fill={stroke} stroke="none">OATS</text>
        </svg>
      );
    case 'cereal-box':
      return (
        <svg {...common}>
          <rect x="16" y="10" width="32" height="44" rx="1.5" />
          <ellipse cx="32" cy="36" rx="10" ry="3" />
          <path d="M22 36 Q32 28 42 36" />
          <circle cx="28" cy="33" r="1" fill={fillLite} stroke="none" />
          <circle cx="32" cy="32" r="1" fill={fillLite} stroke="none" />
          <circle cx="36" cy="33" r="1" fill={fillLite} stroke="none" />
          <text x="32" y="20" textAnchor="middle" fontSize="6" fill={stroke} stroke="none">CEREAL</text>
        </svg>
      );
    case 'atta-bag':
      return (
        <svg {...common}>
          <path d="M18 22 L46 22 L48 54 L16 54 Z" />
          <path d="M18 22 Q22 14 26 18 Q30 12 34 18 Q38 12 42 18 Q44 14 46 22" />
          <line x1="26" y1="16" x2="38" y2="16" />
          <line x1="20" y1="34" x2="44" y2="34" strokeDasharray="2 1" />
          <text x="32" y="44" textAnchor="middle" fontSize="7" fill={stroke} stroke="none">ATTA</text>
        </svg>
      );
    case 'rice-bag':
      return (
        <svg {...common}>
          <path d="M18 14 L46 14 L48 54 L16 54 Z" />
          <line x1="18" y1="14" x2="46" y2="14" strokeDasharray="2 1" />
          <ellipse cx="25" cy="30" rx="1.5" ry="0.8" fill={fillLite} stroke="none" />
          <ellipse cx="32" cy="28" rx="1.5" ry="0.8" fill={fillLite} stroke="none" />
          <ellipse cx="38" cy="32" rx="1.5" ry="0.8" fill={fillLite} stroke="none" />
          <ellipse cx="28" cy="36" rx="1.5" ry="0.8" fill={fillLite} stroke="none" />
          <ellipse cx="36" cy="40" rx="1.5" ry="0.8" fill={fillLite} stroke="none" />
          <ellipse cx="24" cy="42" rx="1.5" ry="0.8" fill={fillLite} stroke="none" />
          <ellipse cx="32" cy="46" rx="1.5" ry="0.8" fill={fillLite} stroke="none" />
        </svg>
      );
    case 'pulses-pack':
      return (
        <svg {...common}>
          <rect x="16" y="18" width="32" height="32" rx="1.5" />
          <line x1="16" y1="24" x2="48" y2="24" strokeDasharray="2 1" />
          <circle cx="24" cy="34" r="1.2" fill={fillLite} stroke="none" />
          <circle cx="30" cy="32" r="1.2" fill={fillLite} stroke="none" />
          <circle cx="36" cy="36" r="1.2" fill={fillLite} stroke="none" />
          <circle cx="40" cy="32" r="1.2" fill={fillLite} stroke="none" />
          <circle cx="28" cy="40" r="1.2" fill={fillLite} stroke="none" />
          <circle cx="34" cy="42" r="1.2" fill={fillLite} stroke="none" />
          <circle cx="38" cy="40" r="1.2" fill={fillLite} stroke="none" />
          <circle cx="24" cy="44" r="1.2" fill={fillLite} stroke="none" />
        </svg>
      );

    default:
      return (
        <svg {...common}>
          <rect x="14" y="14" width="36" height="36" rx="2" />
          <line x1="14" y1="14" x2="50" y2="50" />
          <line x1="50" y1="14" x2="14" y2="50" />
        </svg>
      );
  }
}

// ============================================================================
// SMALL COMPONENTS
// ============================================================================
function RecyclabilityBadge({ level, compact = false }) {
  const config = {
    high:   { cls: 'bg-emerald-100 text-emerald-700', icon: '♻', label: 'Highly Recyclable' },
    medium: { cls: 'bg-amber-100 text-amber-700',   icon: '⚡', label: 'Conditionally Recyclable' },
    low:    { cls: 'bg-red-100 text-red-700',       icon: '⚠', label: 'Hard to Recycle (MLP)' },
  }[level] || { cls: 'bg-gray-100 text-gray-700', icon: '•', label: 'Unknown' };

  const size = compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${size} ${config.cls}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

function statusBorderClass(border) {
  switch (border) {
    case 'green':  return 'border-l-4 border-emerald-500';
    case 'yellow': return 'border-l-4 border-amber-400';
    case 'red':    return 'border-l-4 border-red-500';
    default:       return 'border-l-4 border-gray-300';
  }
}

function DonutChart({ data, size = 100 }) {
  const r = 35;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#F3F4F6" strokeWidth="18" />
      {data.map((d, i) => {
        const len = C * d.fraction;
        const dash = `${len} ${C - len}`;
        const el = (
          <circle
            key={i}
            cx="50" cy="50" r={r}
            fill="none"
            stroke={d.color}
            strokeWidth="18"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
          />
        );
        offset += len;
        return el;
      })}
      <circle cx="50" cy="50" r="26" fill="white" />
    </svg>
  );
}

function EprCatBadge({ romanCat }) {
  if (!romanCat) return <span className="text-gray-400 text-xs">—</span>;
  const colorMap = {
    'I':   'bg-emerald-100 text-emerald-700',
    'II':  'bg-amber-100 text-amber-700',
    'III': 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${colorMap[romanCat] || 'bg-gray-100 text-gray-700'}`}>
      Cat {romanCat}
    </span>
  );
}

// ============================================================================
// CARDS
// ============================================================================
function CategoryCard({ category, isSelected, onClick }) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-xl shadow-sm cursor-pointer overflow-hidden transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        statusBorderClass(category.statusBorder),
        isSelected ? 'ring-2 ring-offset-2 shadow-lg' : '',
      ].join(' ')}
      style={isSelected ? { '--tw-ring-color': category.accent, boxShadow: `0 8px 24px -8px ${category.accent}55` } : {}}
    >
      <div
        className="flex items-center justify-center py-5"
        style={{ backgroundColor: category.accentBg }}
      >
        <ItemIcon type={category.icon} color={category.accent} size={64} />
      </div>
      <div className="p-3 space-y-2">
        <h3 className="font-semibold text-gray-800 text-sm leading-tight">{category.name}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">{category.statusLabel}</span>
        </div>
        <RecyclabilityBadge
          level={category.statusBorder === 'green' ? 'high' : category.statusBorder === 'yellow' ? 'medium' : 'low'}
          compact
        />
      </div>
    </div>
  );
}

function SubCategoryCard({ sub, isSelected, onClick, accent }) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-lg cursor-pointer transition-all duration-200 p-3 border border-gray-200',
        'hover:shadow-sm hover:border-gray-300',
        isSelected ? 'ring-2 shadow-md' : '',
      ].join(' ')}
      style={isSelected ? { '--tw-ring-color': accent, backgroundColor: `${accent}10` } : {}}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 rounded-md p-1.5"
          style={{ backgroundColor: `${accent}15` }}
        >
          <ItemIcon type={sub.icon} color={accent} size={40} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-800 truncate">{sub.name}</div>
          <div className="mt-1">
            <RecyclabilityBadge level={sub.recyclability} compact />
          </div>
          <div className="text-[10px] text-gray-400 truncate mt-1">{sub.example}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPLIANCE MATRIX
// ============================================================================
function EPRComplianceMatrix({ breakdown, category, sub }) {
  if (!breakdown || breakdown.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 text-center text-sm text-gray-400">
        No materials to display.
      </div>
    );
  }

  const totalWeight = breakdown.reduce((s, b) => s + b.componentWeightG, 0);
  const totalLiability = breakdown.reduce((s, b) => s + b.liability, 0);
  const donutData = breakdown.map(b => ({ fraction: b.fraction, color: b.color }));

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">EPR Compliance Matrix</h3>
        <p className="text-xs text-gray-500">{sub ? sub.name : category.name} — material composition + liability</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2 text-left">Material Type</th>
              <th className="px-2 py-2 text-left">EPR</th>
              <th className="px-2 py-2 text-left">Polymer</th>
              <th className="px-2 py-2 text-right">% Pack</th>
              <th className="px-2 py-2 text-right">Wt (g)</th>
              <th className="px-2 py-2 text-right">₹/kg</th>
              <th className="px-2 py-2 text-right">Liability ₹</th>
              <th className="px-2 py-2 text-right">Recovery %</th>
              <th className="px-2 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b, i) => (
              <tr key={b.code} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                    <div>
                      <div className="font-semibold text-gray-800">{b.code}</div>
                      <div className="text-[10px] text-gray-500">{b.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2"><EprCatBadge romanCat={b.eprCat} /></td>
                <td className="px-2 py-2 text-gray-600">{b.polymer}</td>
                <td className="px-2 py-2 text-right font-mono">{(b.fraction * 100).toFixed(1)}%</td>
                <td className="px-2 py-2 text-right font-mono">{b.componentWeightG.toFixed(2)}</td>
                <td className="px-2 py-2 text-right font-mono">₹{b.rateInr.toFixed(2)}</td>
                <td className="px-2 py-2 text-right font-mono font-semibold">₹{b.liability.toFixed(4)}</td>
                <td className="px-2 py-2 text-right text-gray-600">{b.targetRecoveryPct}%</td>
                <td className="px-2 py-2"><RecyclabilityBadge level={b.recyclability} compact /></td>
              </tr>
            ))}
            <tr className="bg-gray-100 font-bold">
              <td className="px-3 py-2 text-gray-800">TOTAL</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right font-mono">100.0%</td>
              <td className="px-2 py-2 text-right font-mono">{totalWeight.toFixed(2)}</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right font-mono">₹{totalLiability.toFixed(4)}</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-4 border-t border-gray-100 flex items-center gap-6">
        <DonutChart data={donutData} size={110} />
        <div className="flex-1 grid grid-cols-1 gap-2">
          {breakdown.map(b => (
            <div key={b.code} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: b.color }} />
              <span className="font-mono text-gray-700 w-24">{b.code}</span>
              <span className="text-gray-500 flex-1 truncate">{b.fullName}</span>
              <span className="font-mono text-gray-800 font-semibold">{(b.fraction * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LOG ENTRY PANEL
// ============================================================================
function LogEntryPanel({ sub, category, onLog }) {
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState(sub.avgWeightG);
  const [showSuccess, setShowSuccess] = useState(false);
  const timeoutRef = useRef(null);

  // Reset when sub-category changes
  React.useEffect(() => {
    setQuantity(1);
    setWeight(sub.avgWeightG);
  }, [sub.id, sub.avgWeightG]);

  const preview = useMemo(() => {
    return processItemScan({
      categoryId: category.id,
      subCategoryId: sub.id,
      quantity,
      overrideWeightG: Number(weight) || 0,
    });
  }, [category.id, sub.id, quantity, weight]);

  const handleLog = () => {
    const result = processItemScan({
      categoryId: category.id,
      subCategoryId: sub.id,
      quantity,
      overrideWeightG: Number(weight) || 0,
    });
    if (result) {
      onLog(result);
      setShowSuccess(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setShowSuccess(false), 2000);
    }
  };

  const totalKg = preview ? preview.totalWeightKg : 0;
  const totalLiability = preview ? preview.totalLiabilityInr : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div
        className="px-4 py-3 border-b border-gray-100 flex items-center gap-3"
        style={{ backgroundColor: category.accentBg }}
      >
        <ItemIcon type={sub.icon} color={category.accent} size={40} />
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{sub.name}</h3>
          <p className="text-xs text-gray-500">{category.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs italic text-gray-500">e.g. {sub.example}</p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Packaging weight (g)</label>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
          />
          <p className="text-[10px] text-gray-400 mt-1">Default avg: {sub.avgWeightG}g per unit</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold"
            >
              −
            </button>
            <input
              type="number"
              min="1"
              max="9999"
              value={quantity}
              onChange={e => setQuantity(Math.max(1, Math.min(9999, Number(e.target.value) || 1)))}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md text-center font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
            <button
              onClick={() => setQuantity(q => Math.min(9999, q + 1))}
              className="w-9 h-9 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold"
            >
              +
            </button>
          </div>
        </div>

        <div
          className="rounded-md px-3 py-3 text-xs flex items-center justify-between"
          style={{ backgroundColor: category.accentBg, color: category.accent }}
        >
          <span>
            Total packaging: <strong className="font-mono">{totalKg.toFixed(3)} kg</strong>
          </span>
          <span>
            Est. EPR: <strong className="font-mono">₹{totalLiability.toFixed(4)}</strong>
          </span>
        </div>

        {preview && preview.flags.length > 0 && (
          <div className="space-y-1">
            {preview.flags.map((f, i) => (
              <div
                key={i}
                className={`text-[11px] px-2 py-1.5 rounded ${
                  f.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {f}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleLog}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-md transition-colors"
        >
          Log Waste Entry
        </button>

        {showSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium px-3 py-2 rounded-md text-center animate-pulse">
            ✓ Logged — added to compliance ledger
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// STATS STRIP + LOGS TABLE + LEGEND
// ============================================================================
function StatsStrip({ logs }) {
  const stats = useMemo(() => {
    const units = logs.reduce((s, l) => s + l.quantity, 0);
    const kg = logs.reduce((s, l) => s + l.totalWeightKg, 0);
    const inr = logs.reduce((s, l) => s + l.totalLiabilityInr, 0);
    const highRisk = logs.filter(l => l.recyclability === 'low').length;
    return { units, kg, inr, highRisk };
  }, [logs]);

  const cards = [
    { label: 'Units Logged',      value: stats.units.toLocaleString('en-IN'), border: 'border-blue-500' },
    { label: 'Packaging Weight',  value: `${stats.kg.toFixed(3)} kg`,          border: 'border-emerald-500' },
    { label: 'EPR Liability',     value: `₹${stats.inr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, border: 'border-violet-500' },
    { label: 'MLP High-Risk',     value: stats.highRisk.toLocaleString('en-IN'), border: 'border-red-500' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => (
        <div
          key={c.label}
          className={`bg-white rounded-xl shadow-sm px-4 py-3 border-l-4 ${c.border}`}
        >
          <div className="text-xs uppercase tracking-wider text-gray-500 font-medium">{c.label}</div>
          <div className="text-2xl font-bold text-gray-800 mt-1 font-mono">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function RecentLogsTable({ logs }) {
  const recent = logs.slice(0, 10);

  const statusDot = (level) => {
    const cls = {
      high:   'bg-emerald-500',
      medium: 'bg-amber-400',
      low:    'bg-red-500',
    }[level] || 'bg-gray-400';
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />;
  };

  const formatTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toTimeString().slice(0, 8);
    } catch {
      return '--';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Recent Waste Logs</h3>
        <span className="text-xs text-gray-500">Showing last {recent.length}</span>
      </div>
      {recent.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-gray-400">
          No waste entries logged yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Sub-Category</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Pack Wt (g)</th>
                <th className="px-2 py-2 text-right">Total Wt (kg)</th>
                <th className="px-2 py-2 text-right">EPR ₹</th>
                <th className="px-2 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((l, i) => (
                <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-mono text-gray-600">{formatTime(l.timestamp)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: l.categoryAccent }} />
                      <span className="text-gray-700">{l.categoryName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{l.subCategoryName}</td>
                  <td className="px-2 py-2 text-right font-mono">{l.quantity}</td>
                  <td className="px-2 py-2 text-right font-mono">{l.packagingWeightG.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right font-mono">{l.totalWeightKg.toFixed(3)}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold">₹{l.totalLiabilityInr.toFixed(4)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      {statusDot(l.recyclability)}
                      <span className="text-gray-600 capitalize text-[11px]">{l.recyclability}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MaterialLegend() {
  const mats = Object.values(MATERIAL_CLASSES);
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Material Class Reference</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {mats.map(m => (
          <div key={m.code} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ backgroundColor: m.color }} />
              <span className="font-mono font-bold text-xs text-gray-800">{m.code}</span>
              <EprCatBadge romanCat={m.eprCat} />
            </div>
            <div className="text-[11px] text-gray-600 leading-tight mb-2">{m.fullName}</div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-gray-800 font-semibold">₹{m.rateInr.toFixed(2)}/kg</span>
              <RecyclabilityBadge level={m.recyclability} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD
// ============================================================================
export default function EPRDashboard() {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'high-risk'

  const [logs, setLogs] = useState(() => {
    const seed = [
      processItemScan({ categoryId: 'snacks',        subCategoryId: 'chips',   quantity: 24 }),
      processItemScan({ categoryId: 'beverages',     subCategoryId: 'water',   quantity: 48 }),
      processItemScan({ categoryId: 'fresh-dairy',   subCategoryId: 'milk',    quantity: 36 }),
      processItemScan({ categoryId: 'personal-care', subCategoryId: 'shampoo', quantity: 12 }),
      processItemScan({ categoryId: 'dry-grocery',   subCategoryId: 'oats',    quantity: 20 }),
    ].filter(Boolean);
    // newest first
    return seed.reverse();
  });

  const selectedCategory = useMemo(
    () => CATEGORIES.find(c => c.id === selectedCategoryId) || null,
    [selectedCategoryId]
  );
  const selectedSub = useMemo(
    () => (selectedCategory ? selectedCategory.subCategories.find(s => s.id === selectedSubId) : null) || null,
    [selectedCategory, selectedSubId]
  );

  // Filter categories
  const visibleCategories = useMemo(() => {
    if (categoryFilter === 'all') return CATEGORIES;
    // high-risk: any category whose default materials contain MLP at > 50%
    return CATEGORIES.filter(c =>
      c.defaultMaterials.some(m => m.code === 'CAT-III-MLP' && m.fraction >= 0.5)
    );
  }, [categoryFilter]);

  const handleSelectCategory = (id) => {
    setSelectedCategoryId(id);
    setSelectedSubId(null);
  };

  const handleSelectSub = (id) => {
    setSelectedSubId(id);
  };

  const handleLog = (entry) => {
    setLogs(prev => [entry, ...prev]);
  };

  // Right-panel content: computed live preview for the matrix
  const livePreview = useMemo(() => {
    if (!selectedCategory) return null;
    if (selectedSub) {
      return processItemScan({
        categoryId: selectedCategory.id,
        subCategoryId: selectedSub.id,
        quantity: 1,
      });
    }
    // Synthesise a category-level preview using defaultMaterials
    const synthSub = {
      id: '__cat-default__',
      name: `${selectedCategory.shortName} (default mix)`,
      avgWeightG: 100,
      recyclability: selectedCategory.statusBorder === 'red' ? 'low'
                    : selectedCategory.statusBorder === 'yellow' ? 'medium' : 'high',
      materials: selectedCategory.defaultMaterials,
      example: 'Category-level average composition',
      icon: selectedCategory.icon,
    };
    const totalWeightG = 100;
    const recycleRank = { low: 3, medium: 2, high: 1 };
    let worst = 'high';
    const breakdown = synthSub.materials.map(m => {
      const mat = MATERIAL_CLASSES[m.code];
      if (!mat) return null;
      const componentWeightG = totalWeightG * m.fraction;
      const weightKg = componentWeightG / 1000;
      const liability = +(weightKg * mat.rateInr).toFixed(4);
      if (recycleRank[mat.recyclability] > recycleRank[worst]) worst = mat.recyclability;
      return { ...mat, fraction: m.fraction, componentWeightG, weightKg, liability };
    }).filter(Boolean);
    return { breakdown, recyclability: worst, syntheticSub: synthSub };
  }, [selectedCategory, selectedSub]);

  // Current period label
  const periodLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-violet-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 text-2xl">♻</span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">EPR Waste Logging Dashboard</h1>
            </div>
            <p className="text-xs sm:text-sm text-indigo-200 mt-1 ml-13 pl-1">
              India Plastic Waste Management Rules 2022 — Extended Producer Responsibility tracker
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-xs font-medium">
              <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
              Live · {periodLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* STATS STRIP */}
        <StatsStrip logs={logs} />

        {/* MAIN GRID — LEFT 60% / RIGHT 40% */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* LEFT PANEL */}
          <div className="lg:col-span-3 space-y-4">

            {/* Filter Tabs */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCategoryFilter('all')}
                className={[
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  categoryFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                ].join(' ')}
              >
                All Categories
              </button>
              <button
                onClick={() => setCategoryFilter('high-risk')}
                className={[
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  categoryFilter === 'high-risk'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                ].join(' ')}
              >
                ⚠ High-Risk MLP
              </button>
              <span className="text-xs text-gray-400 ml-auto">
                {visibleCategories.length} categories
              </span>
            </div>

            {/* Category Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {visibleCategories.map(cat => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  isSelected={cat.id === selectedCategoryId}
                  onClick={() => handleSelectCategory(cat.id)}
                />
              ))}
            </div>

            {/* Sub-Category Grid */}
            {selectedCategory && (
              <div className="space-y-3 mt-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-800">
                    {selectedCategory.name} — sub-categories
                  </h2>
                  <button
                    onClick={() => { setSelectedCategoryId(null); setSelectedSubId(null); }}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    ✕ Clear
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedCategory.subCategories.map(sub => (
                    <SubCategoryCard
                      key={sub.id}
                      sub={sub}
                      isSelected={sub.id === selectedSubId}
                      onClick={() => handleSelectSub(sub.id)}
                      accent={selectedCategory.accent}
                    />
                  ))}
                </div>

                {/* Category compliance note */}
                <div
                  className="rounded-md px-3 py-3 text-xs italic"
                  style={{ backgroundColor: selectedCategory.accentBg, color: selectedCategory.accent }}
                >
                  {selectedCategory.note}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANEL */}
          <div className="lg:col-span-2 space-y-4">
            {selectedSub && selectedCategory ? (
              <>
                <LogEntryPanel sub={selectedSub} category={selectedCategory} onLog={handleLog} />
                <EPRComplianceMatrix
                  breakdown={livePreview ? livePreview.breakdown : []}
                  category={selectedCategory}
                  sub={selectedSub}
                />
              </>
            ) : selectedCategory ? (
              <>
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">{selectedCategory.name}</h3>
                  <p className="text-xs text-gray-500 mb-3">Default category-level material composition shown below. Select a sub-category to log a waste entry.</p>
                  <div className="text-xs text-gray-500 italic">{selectedCategory.note}</div>
                </div>
                <EPRComplianceMatrix
                  breakdown={livePreview ? livePreview.breakdown.map(b => ({ ...b, componentWeightG: b.componentWeightG, liability: b.liability })) : []}
                  category={selectedCategory}
                  sub={null}
                />
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <div className="text-5xl mb-3">♻</div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Select a category to begin</h3>
                <p className="text-xs text-gray-500">
                  ← Choose a retail category, then a sub-category to log a waste entry and view its full EPR compliance matrix.
                </p>
                <ul className="text-[11px] text-gray-400 mt-4 space-y-1 text-left max-w-xs mx-auto">
                  <li>• Green border → high recyclability</li>
                  <li>• Yellow border → conditional (pumps / mixed materials)</li>
                  <li>• Red border → Category III MLP (highest liability)</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* RECENT LOGS TABLE */}
        <RecentLogsTable logs={logs} />

        {/* MATERIAL LEGEND */}
        <MaterialLegend />

        {/* FOOTER */}
        <div className="text-center text-[11px] text-gray-400 py-4">
          EPR rates per Plastic Waste Management Rules 2022 · Recovery targets per CPCB notification ·
          Total entries logged: {logs.length}
        </div>
      </div>
    </div>
  );
}
