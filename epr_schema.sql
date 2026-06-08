-- schema.sql
-- ============================================================================
-- EPR (Extended Producer Responsibility) Waste Logging Schema
-- India Plastic Waste Management Rules 2022 compliance
-- PostgreSQL 14+
-- ============================================================================

-- Drop in dependency order (safe re-run)
DROP VIEW IF EXISTS v_category_recyclability CASCADE;
DROP VIEW IF EXISTS v_epr_compliance_summary CASCADE;
DROP TABLE IF EXISTS epr_monthly_compliance CASCADE;
DROP TABLE IF EXISTS epr_log_breakdown CASCADE;
DROP TABLE IF EXISTS epr_waste_logs CASCADE;
DROP TABLE IF EXISTS sub_category_material_map CASCADE;
DROP TABLE IF EXISTS retail_sub_categories CASCADE;
DROP TABLE IF EXISTS retail_categories CASCADE;
DROP TABLE IF EXISTS epr_material_classes CASCADE;

-- ----------------------------------------------------------------------------
-- Material classes (PWM Rules 2022 categories)
-- ----------------------------------------------------------------------------
CREATE TABLE epr_material_classes (
    id                          SERIAL PRIMARY KEY,
    code                        VARCHAR(40) UNIQUE NOT NULL,
    name                        VARCHAR(120) NOT NULL,
    full_name                   VARCHAR(200) NOT NULL,
    epr_category_roman          VARCHAR(8),               -- I | II | III | NULL
    polymer_code                VARCHAR(40),              -- HDPE #2, LDPE #4, PET #1, etc.
    recyclability               VARCHAR(10) NOT NULL CHECK (recyclability IN ('high','medium','low')),
    color_hex                   VARCHAR(7) NOT NULL,
    liability_rate_inr_per_kg   NUMERIC(8,2) NOT NULL,
    target_recovery_pct         INT NOT NULL DEFAULT 0 CHECK (target_recovery_pct BETWEEN 0 AND 100),
    description                 TEXT,
    created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Retail categories (top-level FMCG grouping)
-- ----------------------------------------------------------------------------
CREATE TABLE retail_categories (
    id                  SERIAL PRIMARY KEY,
    slug                VARCHAR(60) UNIQUE NOT NULL,
    name                VARCHAR(120) NOT NULL,
    short_name          VARCHAR(60),
    icon_type           VARCHAR(40) NOT NULL,
    status              VARCHAR(20) DEFAULT 'active',
    status_border       VARCHAR(10) NOT NULL CHECK (status_border IN ('green','yellow','red')),
    accent_color        VARCHAR(7) NOT NULL,
    accent_bg           VARCHAR(7),
    compliance_note     TEXT,
    sort_order          INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Retail sub-categories
-- ----------------------------------------------------------------------------
CREATE TABLE retail_sub_categories (
    id                          SERIAL PRIMARY KEY,
    category_id                 INT NOT NULL REFERENCES retail_categories(id) ON DELETE CASCADE,
    slug                        VARCHAR(60) NOT NULL,
    name                        VARCHAR(120) NOT NULL,
    icon_type                   VARCHAR(40) NOT NULL,
    avg_packaging_weight_g      NUMERIC(8,2) NOT NULL DEFAULT 0,
    recyclability               VARCHAR(10) NOT NULL CHECK (recyclability IN ('high','medium','low')),
    example_products            TEXT,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (category_id, slug)
);

CREATE INDEX idx_sub_cat_category ON retail_sub_categories(category_id);

-- ----------------------------------------------------------------------------
-- Sub-category → material composition map (fractions sum to 1.0)
-- ----------------------------------------------------------------------------
CREATE TABLE sub_category_material_map (
    id                  SERIAL PRIMARY KEY,
    sub_category_id     INT NOT NULL REFERENCES retail_sub_categories(id) ON DELETE CASCADE,
    material_class_id   INT NOT NULL REFERENCES epr_material_classes(id),
    weight_fraction     NUMERIC(5,4) NOT NULL CHECK (weight_fraction > 0 AND weight_fraction <= 1),
    UNIQUE (sub_category_id, material_class_id)
);

CREATE INDEX idx_scmm_sub ON sub_category_material_map(sub_category_id);
CREATE INDEX idx_scmm_mat ON sub_category_material_map(material_class_id);

-- ----------------------------------------------------------------------------
-- Waste log entries
-- ----------------------------------------------------------------------------
CREATE TABLE epr_waste_logs (
    id                      BIGSERIAL PRIMARY KEY,
    sub_category_id         INT NOT NULL REFERENCES retail_sub_categories(id),
    retail_category_id      INT NOT NULL REFERENCES retail_categories(id),
    quantity                INT NOT NULL CHECK (quantity > 0),
    packaging_weight_g      NUMERIC(10,2) NOT NULL,
    total_weight_kg         NUMERIC(12,4) GENERATED ALWAYS AS ((quantity * packaging_weight_g) / 1000.0) STORED,
    total_liability_inr     NUMERIC(12,4) DEFAULT 0,
    source                  VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','barcode_scan','bulk_import')),
    logged_by               INT,
    logged_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_waste_logs_logged_at ON epr_waste_logs(logged_at DESC);
CREATE INDEX idx_waste_logs_category ON epr_waste_logs(retail_category_id);
CREATE INDEX idx_waste_logs_sub ON epr_waste_logs(sub_category_id);

-- ----------------------------------------------------------------------------
-- Per-log material breakdown
-- ----------------------------------------------------------------------------
CREATE TABLE epr_log_breakdown (
    id                  BIGSERIAL PRIMARY KEY,
    log_id              BIGINT NOT NULL REFERENCES epr_waste_logs(id) ON DELETE CASCADE,
    material_class_id   INT NOT NULL REFERENCES epr_material_classes(id),
    weight_fraction     NUMERIC(5,4) NOT NULL,
    component_weight_g  NUMERIC(12,4) NOT NULL,
    component_weight_kg NUMERIC(12,6) NOT NULL,
    liability_inr       NUMERIC(12,4) NOT NULL
);

CREATE INDEX idx_breakdown_log ON epr_log_breakdown(log_id);
CREATE INDEX idx_breakdown_material ON epr_log_breakdown(material_class_id);

-- ----------------------------------------------------------------------------
-- Monthly compliance rollup (populated by nightly cron)
-- ----------------------------------------------------------------------------
CREATE TABLE epr_monthly_compliance (
    id                  SERIAL PRIMARY KEY,
    year                INT NOT NULL,
    month               INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    material_class_id   INT NOT NULL REFERENCES epr_material_classes(id),
    total_units         INT NOT NULL DEFAULT 0,
    total_weight_kg     NUMERIC(14,4) NOT NULL DEFAULT 0,
    total_liability_inr NUMERIC(14,4) NOT NULL DEFAULT 0,
    computed_at         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (year, month, material_class_id)
);

CREATE INDEX idx_monthly_year_month ON epr_monthly_compliance(year DESC, month DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Monthly rollup by material (real-time, not cached)
CREATE OR REPLACE VIEW v_epr_compliance_summary AS
SELECT
    EXTRACT(YEAR FROM l.logged_at)::INT  AS year,
    EXTRACT(MONTH FROM l.logged_at)::INT AS month,
    m.id                                  AS material_class_id,
    m.code                                AS material_code,
    m.name                                AS material_name,
    m.epr_category_roman,
    m.recyclability,
    m.color_hex,
    COUNT(DISTINCT l.id)                  AS log_count,
    SUM(l.quantity)                       AS total_units,
    ROUND(SUM(b.component_weight_kg)::NUMERIC, 4) AS total_weight_kg,
    ROUND(SUM(b.liability_inr)::NUMERIC, 4)       AS total_liability_inr,
    m.target_recovery_pct
FROM epr_waste_logs l
JOIN epr_log_breakdown b   ON b.log_id = l.id
JOIN epr_material_classes m ON m.id = b.material_class_id
GROUP BY EXTRACT(YEAR FROM l.logged_at), EXTRACT(MONTH FROM l.logged_at),
         m.id, m.code, m.name, m.epr_category_roman, m.recyclability, m.color_hex, m.target_recovery_pct
ORDER BY year DESC, month DESC, total_liability_inr DESC;

-- Weighted recyclability score per retail category (0-100, higher = more recyclable)
CREATE OR REPLACE VIEW v_category_recyclability AS
SELECT
    rc.id              AS category_id,
    rc.slug,
    rc.name,
    rc.status_border,
    COUNT(DISTINCT sc.id) AS sub_category_count,
    ROUND(AVG(
        CASE m.recyclability
            WHEN 'high'   THEN 100
            WHEN 'medium' THEN 50
            WHEN 'low'    THEN 0
        END * scmm.weight_fraction
    )::NUMERIC * 100, 2) AS weighted_recyclability_score,
    SUM(CASE WHEN m.recyclability = 'low'    THEN 1 ELSE 0 END) AS low_recycle_materials,
    SUM(CASE WHEN m.recyclability = 'medium' THEN 1 ELSE 0 END) AS medium_recycle_materials,
    SUM(CASE WHEN m.recyclability = 'high'   THEN 1 ELSE 0 END) AS high_recycle_materials
FROM retail_categories rc
JOIN retail_sub_categories sc           ON sc.category_id = rc.id
JOIN sub_category_material_map scmm     ON scmm.sub_category_id = sc.id
JOIN epr_material_classes m             ON m.id = scmm.material_class_id
GROUP BY rc.id, rc.slug, rc.name, rc.status_border
ORDER BY rc.sort_order;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Material classes (Indian EPR rates, PWM 2022)
INSERT INTO epr_material_classes (code, name, full_name, epr_category_roman, polymer_code, recyclability, color_hex, liability_rate_inr_per_kg, target_recovery_pct, description) VALUES
('CAT-I-HDPE',    'HDPE Rigid',     'Category I — HDPE rigid trays, jars, bottles',           'I',   'HDPE #2',       'high',   '#10B981', 4.50, 30, 'Rigid plastics with established recycling streams.'),
('CAT-I-PP',      'PP Rigid',       'Category I — Polypropylene rigid containers, caps',      'I',   'PP #5',         'medium', '#0EA5E9', 4.50, 25, 'Rigid PP; recyclable but mixed-stream contamination common.'),
('CAT-II-LDPE',   'LDPE Flexible',  'Category II — LDPE flexible single-layer pouches/films', 'II',  'LDPE #4',       'medium', '#F59E0B', 6.00, 20, 'Single-layer flexible plastics. Recyclable via specialised lines only.'),
('CAT-III-MLP',   'MLP Non-Recyc',  'Category III — Multi-Layer Plastic (foil-laminate)',     'III', 'MLP / Other #7','low',    '#EF4444', 12.00, 0, 'Multi-layer laminates: aluminium + PET + PE. No commercial recycling pathway. Highest EPR liability.'),
('PET-01',        'PET Bottle',     'PET #1 transparent beverage bottles',                    NULL,  'PET #1',        'high',   '#3B82F6', 3.50, 40, 'Clear PET — highest value post-consumer recyclate stream.'),
('LIQUID-CARTON', 'TetraPak Carton','Liquid Carton (paper + PE + Al foil)',                   NULL,  'PAP-21',        'high',   '#8B5CF6', 2.00, 35, 'Aseptic multi-material carton; pulped + delaminated.'),
('ALU-CAN',       'Aluminium Can',  'Aluminium beverage can',                                 NULL,  'ALU-41',        'high',   '#94A3B8', 2.50, 60, 'Infinitely recyclable; highest recovery rate of any packaging material.'),
('PAPERBOARD',    'Paperboard',     'Paperboard / corrugated cardboard',                      NULL,  'PAP-21',        'high',   '#A16207', 1.50, 55, 'Fibre-based; widely accepted in municipal paper recycling.');

-- Retail categories
INSERT INTO retail_categories (slug, name, short_name, icon_type, status_border, accent_color, accent_bg, compliance_note, sort_order) VALUES
('fresh-dairy',   'Fresh Produce & Dairy',            'Dairy & Fresh',   'dairy',         'green',  '#059669', '#ECFDF5', 'Dairy pouches (LDPE) and rigid trays (HDPE) are recyclable when cleaned. Segregate at source for highest recovery.', 1),
('beverages',     'Beverages',                        'Beverages',       'beverage',      'green',  '#0284C7', '#EFF6FF', 'PET #1, aluminium cans and TetraPak all have established recycling streams. High EPR-recovery potential.',          2),
('snacks',        'Snacks & Munchies',                'Snacks',          'snacks',        'red',    '#DC2626', '#FEF2F2', 'Category III MLP packaging — multi-layer foil laminates have no commercial recycling pathway. Highest EPR liability at ₹12/kg.', 3),
('personal-care', 'Personal Care',                    'Personal Care',   'personal-care', 'yellow', '#D97706', '#FFFBEB', 'HDPE bottles are recyclable, but pump-nozzle assemblies (mixed polymers + spring) complicate recovery. Remove pumps before bin.', 4),
('dry-grocery',   'Breakfast Cereals & Dry Grocery',  'Dry Grocery',     'dry-grocery',   'green',  '#65A30D', '#F7FEE7', 'Paperboard boxes + LDPE inner liners. Cardboard recycles well; flexible bags need separate stream.',               5);

-- Sub-categories (24 total: 5+5+4+5+5)
-- Fresh Produce & Dairy
INSERT INTO retail_sub_categories (category_id, slug, name, icon_type, avg_packaging_weight_g, recyclability, example_products) VALUES
((SELECT id FROM retail_categories WHERE slug='fresh-dairy'), 'milk',       'Milk',       'milk-pouch',  42,  'medium', 'Amul Taaza 1L / Mother Dairy 500ml pouch'),
((SELECT id FROM retail_categories WHERE slug='fresh-dairy'), 'curd',       'Curd',       'curd-cup',    18,  'high',   'Amul Masti 400g / Nestle a+ 200g cup'),
((SELECT id FROM retail_categories WHERE slug='fresh-dairy'), 'paneer',     'Paneer',     'paneer-pack', 14,  'medium', 'Amul / Mother Dairy 200g vacuum brick'),
((SELECT id FROM retail_categories WHERE slug='fresh-dairy'), 'vegetables', 'Vegetables', 'veggie-tray', 28,  'medium', 'Tray-packed mixed veg / leafy bunches'),
((SELECT id FROM retail_categories WHERE slug='fresh-dairy'), 'fruits',     'Fruits',     'fruit-net',   22,  'medium', 'Apples / oranges in mesh net pack');

-- Beverages
INSERT INTO retail_sub_categories (category_id, slug, name, icon_type, avg_packaging_weight_g, recyclability, example_products) VALUES
((SELECT id FROM retail_categories WHERE slug='beverages'), 'water',         'Bottled Water',  'water-bottle',   24,  'high', 'Bisleri 1L / Aquafina 500ml'),
((SELECT id FROM retail_categories WHERE slug='beverages'), 'soft-drinks',   'Soft Drinks',    'soft-drink-can', 15,  'high', 'Coca-Cola 330ml can / Thums Up 250ml'),
((SELECT id FROM retail_categories WHERE slug='beverages'), 'juices',        'Fresh Juices',   'juice-tetra',    32,  'high', 'Real / Tropicana 1L TetraPak'),
((SELECT id FROM retail_categories WHERE slug='beverages'), 'energy-drinks', 'Energy Drinks',  'energy-can',     16,  'high', 'Red Bull 250ml / Sting 250ml slim can'),
((SELECT id FROM retail_categories WHERE slug='beverages'), 'tea-coffee',    'Tea / Coffee',   'tea-pack',        8,  'low',  'Tea bags / instant coffee sachets');

-- Snacks (4)
INSERT INTO retail_sub_categories (category_id, slug, name, icon_type, avg_packaging_weight_g, recyclability, example_products) VALUES
((SELECT id FROM retail_categories WHERE slug='snacks'), 'chips',    'Chips',              'chips-bag',    12, 'low', 'Lays / Bingo / Kurkure 50g'),
((SELECT id FROM retail_categories WHERE slug='snacks'), 'cookies',  'Cookies / Biscuits', 'cookie-pack',  18, 'low', 'Parle-G / Oreo / Bourbon family pack'),
((SELECT id FROM retail_categories WHERE slug='snacks'), 'choco',    'Chocolates',         'choco-bar',     9, 'low', 'Dairy Milk / KitKat / Munch'),
((SELECT id FROM retail_categories WHERE slug='snacks'), 'noodles',  'Instant Noodles',    'noodles-pack', 22, 'low', 'Maggi 70g / Yippee / Top Ramen');

-- Personal Care
INSERT INTO retail_sub_categories (category_id, slug, name, icon_type, avg_packaging_weight_g, recyclability, example_products) VALUES
((SELECT id FROM retail_categories WHERE slug='personal-care'), 'toothpaste',    'Toothpaste',     'toothpaste',    16, 'medium', 'Colgate / Pepsodent 150g tube'),
((SELECT id FROM retail_categories WHERE slug='personal-care'), 'shampoo',       'Shampoo',        'shampoo-bottle',38, 'medium', 'Head & Shoulders / Dove 340ml bottle'),
((SELECT id FROM retail_categories WHERE slug='personal-care'), 'soap',          'Soap',           'soap-bar',       6, 'high',   'Lifebuoy / Dettol bar in paper wrap'),
((SELECT id FROM retail_categories WHERE slug='personal-care'), 'deodorants',    'Deodorants',     'deodorant',     45, 'medium', 'Axe / Nivea 150ml aerosol'),
((SELECT id FROM retail_categories WHERE slug='personal-care'), 'sanitary',      'Sanitary Items', 'sanitary-pack', 28, 'low',    'Whisper / Stayfree pack of 10');

-- Dry Grocery
INSERT INTO retail_sub_categories (category_id, slug, name, icon_type, avg_packaging_weight_g, recyclability, example_products) VALUES
((SELECT id FROM retail_categories WHERE slug='dry-grocery'), 'oats',        'Oats',              'oats-box',    52, 'high',   'Quaker / Saffola 1kg canister'),
((SELECT id FROM retail_categories WHERE slug='dry-grocery'), 'corn-flakes', 'Corn Flakes',       'cereal-box',  68, 'high',   'Kellogg''s / Bagrry''s 475g box'),
((SELECT id FROM retail_categories WHERE slug='dry-grocery'), 'atta',        'Atta / Wheat Flour','atta-bag',    34, 'medium', 'Aashirvaad / Fortune 5kg sack'),
((SELECT id FROM retail_categories WHERE slug='dry-grocery'), 'rice',        'Rice',              'rice-bag',    26, 'medium', 'India Gate Basmati 5kg pack'),
((SELECT id FROM retail_categories WHERE slug='dry-grocery'), 'pulses',      'Pulses / Dal',      'pulses-pack', 18, 'medium', 'Tata Sampann / Patanjali 1kg dal pack');

-- Sub-category material composition map (fractions sum to 1.0 per sub-category)
-- Fresh dairy
INSERT INTO sub_category_material_map (sub_category_id, material_class_id, weight_fraction) VALUES
((SELECT id FROM retail_sub_categories WHERE slug='milk'),       (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'), 0.88),
((SELECT id FROM retail_sub_categories WHERE slug='milk'),       (SELECT id FROM epr_material_classes WHERE code='CAT-I-HDPE'),  0.12),
((SELECT id FROM retail_sub_categories WHERE slug='curd'),       (SELECT id FROM epr_material_classes WHERE code='CAT-I-PP'),    0.78),
((SELECT id FROM retail_sub_categories WHERE slug='curd'),       (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'), 0.22),
((SELECT id FROM retail_sub_categories WHERE slug='paneer'),     (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'), 0.70),
((SELECT id FROM retail_sub_categories WHERE slug='paneer'),     (SELECT id FROM epr_material_classes WHERE code='CAT-III-MLP'), 0.30),
((SELECT id FROM retail_sub_categories WHERE slug='vegetables'), (SELECT id FROM epr_material_classes WHERE code='CAT-I-HDPE'),  0.55),
((SELECT id FROM retail_sub_categories WHERE slug='vegetables'), (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'), 0.45),
((SELECT id FROM retail_sub_categories WHERE slug='fruits'),     (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'), 0.65),
((SELECT id FROM retail_sub_categories WHERE slug='fruits'),     (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),  0.35);

-- Beverages
INSERT INTO sub_category_material_map (sub_category_id, material_class_id, weight_fraction) VALUES
((SELECT id FROM retail_sub_categories WHERE slug='water'),         (SELECT id FROM epr_material_classes WHERE code='PET-01'),        0.92),
((SELECT id FROM retail_sub_categories WHERE slug='water'),         (SELECT id FROM epr_material_classes WHERE code='CAT-I-HDPE'),    0.08),
((SELECT id FROM retail_sub_categories WHERE slug='soft-drinks'),   (SELECT id FROM epr_material_classes WHERE code='ALU-CAN'),       1.00),
((SELECT id FROM retail_sub_categories WHERE slug='juices'),        (SELECT id FROM epr_material_classes WHERE code='LIQUID-CARTON'), 0.85),
((SELECT id FROM retail_sub_categories WHERE slug='juices'),        (SELECT id FROM epr_material_classes WHERE code='CAT-I-HDPE'),    0.15),
((SELECT id FROM retail_sub_categories WHERE slug='energy-drinks'), (SELECT id FROM epr_material_classes WHERE code='ALU-CAN'),       1.00),
((SELECT id FROM retail_sub_categories WHERE slug='tea-coffee'),    (SELECT id FROM epr_material_classes WHERE code='CAT-III-MLP'),   0.70),
((SELECT id FROM retail_sub_categories WHERE slug='tea-coffee'),    (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),    0.30);

-- Snacks (all MLP-dominant)
INSERT INTO sub_category_material_map (sub_category_id, material_class_id, weight_fraction) VALUES
((SELECT id FROM retail_sub_categories WHERE slug='chips'),   (SELECT id FROM epr_material_classes WHERE code='CAT-III-MLP'),   1.00),
((SELECT id FROM retail_sub_categories WHERE slug='cookies'), (SELECT id FROM epr_material_classes WHERE code='CAT-III-MLP'),   0.75),
((SELECT id FROM retail_sub_categories WHERE slug='cookies'), (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'),   0.25),
((SELECT id FROM retail_sub_categories WHERE slug='choco'),   (SELECT id FROM epr_material_classes WHERE code='CAT-III-MLP'),   1.00),
((SELECT id FROM retail_sub_categories WHERE slug='noodles'), (SELECT id FROM epr_material_classes WHERE code='CAT-III-MLP'),   0.85),
((SELECT id FROM retail_sub_categories WHERE slug='noodles'), (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),    0.15);

-- Personal Care
INSERT INTO sub_category_material_map (sub_category_id, material_class_id, weight_fraction) VALUES
((SELECT id FROM retail_sub_categories WHERE slug='toothpaste'), (SELECT id FROM epr_material_classes WHERE code='CAT-III-MLP'),  0.65),
((SELECT id FROM retail_sub_categories WHERE slug='toothpaste'), (SELECT id FROM epr_material_classes WHERE code='CAT-I-PP'),     0.20),
((SELECT id FROM retail_sub_categories WHERE slug='toothpaste'), (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),   0.15),
((SELECT id FROM retail_sub_categories WHERE slug='shampoo'),    (SELECT id FROM epr_material_classes WHERE code='CAT-I-HDPE'),   0.78),
((SELECT id FROM retail_sub_categories WHERE slug='shampoo'),    (SELECT id FROM epr_material_classes WHERE code='CAT-I-PP'),     0.22),
((SELECT id FROM retail_sub_categories WHERE slug='soap'),       (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),   0.85),
((SELECT id FROM retail_sub_categories WHERE slug='soap'),       (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'),  0.15),
((SELECT id FROM retail_sub_categories WHERE slug='deodorants'), (SELECT id FROM epr_material_classes WHERE code='ALU-CAN'),      0.82),
((SELECT id FROM retail_sub_categories WHERE slug='deodorants'), (SELECT id FROM epr_material_classes WHERE code='CAT-I-PP'),     0.18),
((SELECT id FROM retail_sub_categories WHERE slug='sanitary'),   (SELECT id FROM epr_material_classes WHERE code='CAT-III-MLP'),  0.60),
((SELECT id FROM retail_sub_categories WHERE slug='sanitary'),   (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'),  0.40);

-- Dry Grocery
INSERT INTO sub_category_material_map (sub_category_id, material_class_id, weight_fraction) VALUES
((SELECT id FROM retail_sub_categories WHERE slug='oats'),        (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),   0.70),
((SELECT id FROM retail_sub_categories WHERE slug='oats'),        (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'),  0.30),
((SELECT id FROM retail_sub_categories WHERE slug='corn-flakes'), (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),   0.78),
((SELECT id FROM retail_sub_categories WHERE slug='corn-flakes'), (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'),  0.22),
((SELECT id FROM retail_sub_categories WHERE slug='atta'),        (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'),  0.92),
((SELECT id FROM retail_sub_categories WHERE slug='atta'),        (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),   0.08),
((SELECT id FROM retail_sub_categories WHERE slug='rice'),        (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'),  0.95),
((SELECT id FROM retail_sub_categories WHERE slug='rice'),        (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),   0.05),
((SELECT id FROM retail_sub_categories WHERE slug='pulses'),      (SELECT id FROM epr_material_classes WHERE code='CAT-II-LDPE'),  0.90),
((SELECT id FROM retail_sub_categories WHERE slug='pulses'),      (SELECT id FROM epr_material_classes WHERE code='PAPERBOARD'),   0.10);

-- Sanity check (uncomment to validate fractions sum to 1.0 per sub-category):
-- SELECT sc.slug, ROUND(SUM(scmm.weight_fraction)::NUMERIC, 4) AS total_fraction
-- FROM retail_sub_categories sc
-- JOIN sub_category_material_map scmm ON scmm.sub_category_id = sc.id
-- GROUP BY sc.slug HAVING ROUND(SUM(scmm.weight_fraction)::NUMERIC, 4) <> 1.0000;
