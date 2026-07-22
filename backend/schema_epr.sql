-- =============================================================
-- EPR (Extended Producer Responsibility) Compliance Schema
-- India: Plastic Waste Management Rules 2022
-- Food & Grains Business — Store KG
-- =============================================================

-- ─────────────────────────────────────────────
-- 1. EPR MATERIAL CLASSES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epr_material_classes (
  id                  SERIAL PRIMARY KEY,
  code                VARCHAR(20) NOT NULL UNIQUE,   -- PET, HDPE, PP, PS, LDPE, MLP, GLASS, PAPER, METAL
  name                VARCHAR(100) NOT NULL,
  epr_category_roman  VARCHAR(5),                    -- I, II, III, or NULL for non-plastic
  recyclability       VARCHAR(10) NOT NULL            CHECK (recyclability IN ('high','medium','low')),
  color_hex           VARCHAR(7) NOT NULL,
  epr_rate_inr_per_kg NUMERIC(8,2) NOT NULL DEFAULT 0,
  description         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 2. RETAIL CATEGORIES (Zepto-style consumer view)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retail_categories (
  id           SERIAL PRIMARY KEY,
  slug         VARCHAR(60) NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  subtitle     VARCHAR(200),
  icon_type    VARCHAR(40) NOT NULL,   -- matches SVG icon key
  accent_color VARCHAR(7) NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 3. RETAIL CATEGORY → MATERIAL CLASS DEFAULTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retail_category_material_defaults (
  id                 SERIAL PRIMARY KEY,
  retail_category_id INT NOT NULL REFERENCES retail_categories(id) ON DELETE CASCADE,
  material_class_id  INT NOT NULL REFERENCES epr_material_classes(id),
  default_fraction   NUMERIC(5,4) NOT NULL CHECK (default_fraction > 0 AND default_fraction <= 1),
  UNIQUE (retail_category_id, material_class_id)
);

-- Constraint: fractions per category must sum to 1 (enforced via trigger below)

-- ─────────────────────────────────────────────
-- 4. EPR ITEMS (SKU catalog)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epr_items (
  id                          SERIAL PRIMARY KEY,
  barcode                     VARCHAR(60) UNIQUE NOT NULL,
  name                        VARCHAR(200) NOT NULL,
  brand                       VARCHAR(100),
  retail_category_id          INT REFERENCES retail_categories(id),
  gross_packaging_weight_grams NUMERIC(10,3) NOT NULL DEFAULT 0,
  net_content_grams           NUMERIC(10,3),
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 5. ITEM MATERIAL COMPONENTS (per-SKU breakdown)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_material_components (
  id                SERIAL PRIMARY KEY,
  item_id           INT NOT NULL REFERENCES epr_items(id) ON DELETE CASCADE,
  material_class_id INT NOT NULL REFERENCES epr_material_classes(id),
  weight_fraction   NUMERIC(5,4) NOT NULL CHECK (weight_fraction > 0 AND weight_fraction <= 1),
  component_label   VARCHAR(50),    -- cap, body, label, wrap, seal, etc.
  UNIQUE (item_id, material_class_id, component_label)
);

-- ─────────────────────────────────────────────
-- 6. EPR WASTE LOGS (scan events)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epr_waste_logs (
  id                          BIGSERIAL PRIMARY KEY,
  item_id                     INT REFERENCES epr_items(id),          -- nullable if barcode unknown
  scanned_barcode             VARCHAR(60),
  retail_category_id          INT NOT NULL REFERENCES retail_categories(id),
  quantity                    INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  gross_packaging_weight_grams NUMERIC(10,3) NOT NULL,
  scanned_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source                      VARCHAR(30) NOT NULL DEFAULT 'barcode_scan'
                                CHECK (source IN ('barcode_scan','manual','bulk')),
  logged_by_user_id           INT REFERENCES users(id),
  facility_id                 INT,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epr_logs_scanned_at  ON epr_waste_logs(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_epr_logs_category    ON epr_waste_logs(retail_category_id);
CREATE INDEX IF NOT EXISTS idx_epr_logs_item        ON epr_waste_logs(item_id);

-- ─────────────────────────────────────────────
-- 7. EPR LOG MATERIAL BREAKDOWN (computed per-log)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epr_log_material_breakdown (
  id                BIGSERIAL PRIMARY KEY,
  log_id            BIGINT NOT NULL REFERENCES epr_waste_logs(id) ON DELETE CASCADE,
  material_class_id INT NOT NULL REFERENCES epr_material_classes(id),
  weight_kg         NUMERIC(12,6) NOT NULL,
  epr_liability_inr NUMERIC(12,4) NOT NULL,
  UNIQUE (log_id, material_class_id)
);

CREATE INDEX IF NOT EXISTS idx_epr_breakdown_log      ON epr_log_material_breakdown(log_id);
CREATE INDEX IF NOT EXISTS idx_epr_breakdown_material ON epr_log_material_breakdown(material_class_id);

-- ─────────────────────────────────────────────
-- 8. EPR MONTHLY SUMMARY (aggregated)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epr_monthly_summary (
  id                 SERIAL PRIMARY KEY,
  year               SMALLINT NOT NULL,
  month              SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  material_class_id  INT NOT NULL REFERENCES epr_material_classes(id),
  total_weight_kg    NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_liability_inr NUMERIC(14,4) NOT NULL DEFAULT 0,
  item_count         INT NOT NULL DEFAULT 0,
  last_computed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (year, month, material_class_id)
);

-- ─────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_epr_compliance_summary AS
SELECT
  ms.year,
  ms.month,
  TO_DATE(ms.year::TEXT || '-' || LPAD(ms.month::TEXT, 2, '0') || '-01', 'YYYY-MM-DD') AS period_start,
  mc.code                AS material_code,
  mc.name                AS material_name,
  mc.epr_category_roman  AS epr_category,
  mc.recyclability,
  mc.epr_rate_inr_per_kg,
  ms.total_weight_kg,
  ms.total_liability_inr,
  ms.item_count,
  ms.last_computed_at
FROM epr_monthly_summary ms
JOIN epr_material_classes mc ON mc.id = ms.material_class_id
ORDER BY ms.year DESC, ms.month DESC, mc.epr_category_roman NULLS LAST, mc.code;

CREATE OR REPLACE VIEW v_category_recyclability AS
SELECT
  rc.slug,
  rc.name                   AS category_name,
  rc.accent_color,
  ROUND(
    SUM(rcmd.default_fraction * CASE mc.recyclability
          WHEN 'high'   THEN 1.0
          WHEN 'medium' THEN 0.5
          WHEN 'low'    THEN 0.0
        END) * 100
  , 1)                      AS weighted_recyclability_score,
  ROUND(
    SUM(rcmd.default_fraction * mc.epr_rate_inr_per_kg)
  , 2)                      AS blended_epr_rate_inr_per_kg,
  -- dominant material
  (
    SELECT mc2.code
    FROM retail_category_material_defaults rcmd2
    JOIN epr_material_classes mc2 ON mc2.id = rcmd2.material_class_id
    WHERE rcmd2.retail_category_id = rc.id
    ORDER BY rcmd2.default_fraction DESC
    LIMIT 1
  )                         AS dominant_material_code
FROM retail_categories rc
JOIN retail_category_material_defaults rcmd ON rcmd.retail_category_id = rc.id
JOIN epr_material_classes mc ON mc.id = rcmd.material_class_id
GROUP BY rc.id, rc.slug, rc.name, rc.accent_color
ORDER BY weighted_recyclability_score DESC;

-- ─────────────────────────────────────────────
-- SEED: epr_material_classes
-- ─────────────────────────────────────────────
INSERT INTO epr_material_classes
  (code, name, epr_category_roman, recyclability, color_hex, epr_rate_inr_per_kg, description)
VALUES
  ('PET',   'Polyethylene Terephthalate',          'I',   'high',   '#22c55e', 5.00,
   'Rigid plastic — bottles, jars, trays. Widely recycled in India via PCR.'),
  ('HDPE',  'High-Density Polyethylene',           'I',   'high',   '#16a34a', 4.00,
   'Rigid plastic — cans, drums, caps, jerricans.'),
  ('PP',    'Polypropylene',                       'I',   'high',   '#4ade80', 4.50,
   'Rigid plastic — containers, bottle caps, straws, yogurt pots.'),
  ('PS',    'Polystyrene',                         'I',   'medium', '#86efac', 6.00,
   'Rigid plastic — foam cups, clam-shells. Difficult to recycle.'),
  ('LDPE',  'Low-Density Polyethylene / LLDPE',   'II',  'medium', '#f59e0b', 7.00,
   'Flexible plastic films — pouches, wraps, cling films, carry bags.'),
  ('MLP',   'Multi-Layer Plastic (laminated)',     'III', 'low',    '#ef4444', 12.00,
   'Laminated flexible packaging — chip packets, ketchup sachets. Extended EPR.'),
  ('GLASS', 'Glass',                               NULL,  'high',   '#38bdf8', 0.00,
   'Glass bottles and jars. Separate compliance stream — mostly recycled.'),
  ('PAPER', 'Paper / Paperboard',                 NULL,  'high',   '#a78bfa', 0.00,
   'Cartons, corrugated boxes, paper bags. Separate compliance stream.'),
  ('METAL', 'Aluminium / Steel Metal',            NULL,  'high',   '#94a3b8', 0.00,
   'Tins, cans, foil. Separate compliance stream — high intrinsic value.');

-- ─────────────────────────────────────────────
-- SEED: retail_categories (12 Zepto-style categories)
-- ─────────────────────────────────────────────
INSERT INTO retail_categories (slug, name, subtitle, icon_type, accent_color, sort_order) VALUES
  ('beverages',       'Beverages',       'Juices, water, soft drinks',          'bottle',      '#22c55e', 1),
  ('dairy',           'Dairy & Milk',    'Milk pouches, curd, butter',          'carton',      '#38bdf8', 2),
  ('snacks',          'Snacks',          'Chips, namkeen, biscuits',            'packet',      '#ef4444', 3),
  ('personal-care',   'Personal Care',   'Shampoo, cream, toothpaste',          'tube',        '#a78bfa', 4),
  ('home-care',       'Home Care',       'Cleaners, detergents, sprays',        'spray',       '#f59e0b', 5),
  ('fresh-produce',   'Fresh Produce',   'Vegetables, fruits, mesh bags',       'produce',     '#4ade80', 6),
  ('ready-to-eat',    'Ready to Eat',    'Instant noodles, cup meals',          'noodles',     '#fb923c', 7),
  ('cooking-oils',    'Cooking Oils',    'Mustard, sunflower, groundnut oil',   'oil',         '#eab308', 8),
  ('baby-products',   'Baby Products',   'Formula, purees, baby water',         'baby',        '#f472b6', 9),
  ('glass-bottles',   'Glass & Jars',    'Pickles, sauces, ghee',               'glass-bottle','#64748b', 10),
  ('grains-pulses',   'Grains & Pulses', 'Rice, dal, flour in sacks/pouches',   'grains',      '#ca8a04', 11),
  ('frozen-foods',    'Frozen Foods',    'Frozen peas, meat, ready meals',      'frozen',      '#818cf8', 12);

-- ─────────────────────────────────────────────
-- SEED: retail_category_material_defaults
-- ─────────────────────────────────────────────
-- Fractions must sum to 1.0000 per category

-- beverages: PET body 0.80, PP cap 0.10, PAPER label 0.10
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('PET',   0.8000),
  ('PP',    0.1000),
  ('PAPER', 0.1000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'beverages';

-- dairy: LDPE pouch 0.70, PAPER carton 0.20, PP cap 0.10
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('LDPE',  0.7000),
  ('PAPER', 0.2000),
  ('PP',    0.1000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'dairy';

-- snacks: MLP outer bag 0.90, PAPER inner 0.10
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('MLP',   0.9000),
  ('PAPER', 0.1000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'snacks';

-- personal-care: HDPE tube 0.50, MLP laminate 0.30, PP cap 0.20
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('HDPE',  0.5000),
  ('MLP',   0.3000),
  ('PP',    0.2000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'personal-care';

-- home-care: HDPE bottle 0.60, PP trigger 0.20, LDPE film 0.20
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('HDPE',  0.6000),
  ('PP',    0.2000),
  ('LDPE',  0.2000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'home-care';

-- fresh-produce: LDPE mesh/bag 0.60, PAPER label 0.20, PP tie 0.20
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('LDPE',  0.6000),
  ('PAPER', 0.2000),
  ('PP',    0.2000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'fresh-produce';

-- ready-to-eat: MLP cup/packet 0.65, PAPER outer 0.25, PP fork/lid 0.10
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('MLP',   0.6500),
  ('PAPER', 0.2500),
  ('PP',    0.1000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'ready-to-eat';

-- cooking-oils: PET bottle 0.70, LDPE seal 0.15, PP cap 0.10, PAPER label 0.05
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('PET',   0.7000),
  ('LDPE',  0.1500),
  ('PP',    0.1000),
  ('PAPER', 0.0500)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'cooking-oils';

-- baby-products: PET bottle 0.50, PP nipple/cap 0.30, PAPER label 0.20
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('PET',   0.5000),
  ('PP',    0.3000),
  ('PAPER', 0.2000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'baby-products';

-- glass-bottles: GLASS bottle 0.85, METAL lid 0.10, PAPER label 0.05
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('GLASS', 0.8500),
  ('METAL', 0.1000),
  ('PAPER', 0.0500)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'glass-bottles';

-- grains-pulses: LDPE inner liner 0.40, PP woven sack 0.40, PAPER label 0.20
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('LDPE',  0.4000),
  ('PP',    0.4000),
  ('PAPER', 0.2000)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'grains-pulses';

-- frozen-foods: MLP inner pouch 0.50, PAPER outer box 0.35, LDPE film 0.15
INSERT INTO retail_category_material_defaults (retail_category_id, material_class_id, default_fraction)
SELECT rc.id, mc.id, f.frac
FROM retail_categories rc
CROSS JOIN (VALUES
  ('MLP',   0.5000),
  ('PAPER', 0.3500),
  ('LDPE',  0.1500)
) AS f(code, frac)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE rc.slug = 'frozen-foods';

-- ─────────────────────────────────────────────
-- SEED: epr_items (8 real Indian brand products)
-- ─────────────────────────────────────────────
INSERT INTO epr_items (barcode, name, brand, retail_category_id, gross_packaging_weight_grams, net_content_grams)
SELECT
  i.barcode, i.name, i.brand,
  rc.id,
  i.pkg_g, i.net_g
FROM (VALUES
  ('8901030924452', 'Tropicana Mixed Fruit Juice 1L',    'Tropicana',      'beverages',     32.5,  1000),
  ('8901396087342', 'Lay''s Magic Masala 26g',           'Lay''s',         'snacks',         4.2,    26),
  ('8901030589117', 'Amul Milk Full Cream 500ml Pouch',  'Amul',           'dairy',         11.0,   500),
  ('8901063151758', 'Maggi 2-Minute Noodles 70g',        'Maggi',          'ready-to-eat',  12.8,    70),
  ('8901030889131', 'Fortune Sunflower Oil 1L PET',      'Fortune',        'cooking-oils',  38.0,  1000),
  ('8901719111715', 'India Gate Basmati Rice 1kg',       'India Gate',     'grains-pulses', 28.0,  1000),
  ('8906009540016', 'Haldiram''s Aloo Bhujia 400g',      'Haldiram''s',    'snacks',        22.0,   400),
  ('8901030928559', 'Kissan Mixed Fruit Jam 500g Glass', 'Kissan',         'glass-bottles', 410.0,  500)
) AS i(barcode, name, brand, cat_slug, pkg_g, net_g)
JOIN retail_categories rc ON rc.slug = i.cat_slug;

-- Item-level material components for Lay's Magic Masala (MLP dominant)
INSERT INTO item_material_components (item_id, material_class_id, weight_fraction, component_label)
SELECT ei.id, mc.id, f.frac, f.label
FROM epr_items ei
CROSS JOIN (VALUES
  ('MLP',   0.9200, 'outer-pouch'),
  ('PAPER', 0.0800, 'inner-label')
) AS f(code, frac, label)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE ei.barcode = '8901396087342';

-- Item-level material components for Tropicana 1L (PET bottle)
INSERT INTO item_material_components (item_id, material_class_id, weight_fraction, component_label)
SELECT ei.id, mc.id, f.frac, f.label
FROM epr_items ei
CROSS JOIN (VALUES
  ('PET',   0.8200, 'bottle-body'),
  ('PP',    0.1000, 'cap'),
  ('PAPER', 0.0800, 'sleeve-label')
) AS f(code, frac, label)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE ei.barcode = '8901030924452';

-- Item-level material components for Kissan Jam Glass jar
INSERT INTO item_material_components (item_id, material_class_id, weight_fraction, component_label)
SELECT ei.id, mc.id, f.frac, f.label
FROM epr_items ei
CROSS JOIN (VALUES
  ('GLASS', 0.8800, 'jar-body'),
  ('METAL', 0.0900, 'lid'),
  ('PAPER', 0.0300, 'label')
) AS f(code, frac, label)
JOIN epr_material_classes mc ON mc.code = f.code
WHERE ei.barcode = '8906009540016' -- Haldiram placeholder; Kissan is 8901030928559
   OR ei.barcode = '8901030928559';

-- ─────────────────────────────────────────────
-- FUNCTION: recompute monthly summary
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_recompute_epr_monthly_summary(p_year SMALLINT, p_month SMALLINT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO epr_monthly_summary (year, month, material_class_id, total_weight_kg, total_liability_inr, item_count, last_computed_at)
  SELECT
    p_year,
    p_month,
    b.material_class_id,
    SUM(b.weight_kg)         AS total_weight_kg,
    SUM(b.epr_liability_inr) AS total_liability_inr,
    COUNT(DISTINCT l.id)     AS item_count,
    NOW()
  FROM epr_waste_logs l
  JOIN epr_log_material_breakdown b ON b.log_id = l.id
  WHERE EXTRACT(YEAR  FROM l.scanned_at) = p_year
    AND EXTRACT(MONTH FROM l.scanned_at) = p_month
  GROUP BY b.material_class_id
  ON CONFLICT (year, month, material_class_id) DO UPDATE SET
    total_weight_kg     = EXCLUDED.total_weight_kg,
    total_liability_inr = EXCLUDED.total_liability_inr,
    item_count          = EXCLUDED.item_count,
    last_computed_at    = NOW();
END;
$$;

-- ─────────────────────────────────────────────
-- TRIGGER: auto-compute breakdown on log insert
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_epr_log_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_pkg_kg NUMERIC;
  v_frac         NUMERIC;
  v_mat_id       INT;
  v_rate         NUMERIC;
BEGIN
  v_total_pkg_kg := (NEW.gross_packaging_weight_grams * NEW.quantity) / 1000.0;

  -- Use item-level components if item known, else retail category defaults
  IF NEW.item_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM item_material_components WHERE item_id = NEW.item_id LIMIT 1
  ) THEN
    FOR v_mat_id, v_frac, v_rate IN
      SELECT imc.material_class_id, imc.weight_fraction, mc.epr_rate_inr_per_kg
      FROM item_material_components imc
      JOIN epr_material_classes mc ON mc.id = imc.material_class_id
      WHERE imc.item_id = NEW.item_id
    LOOP
      INSERT INTO epr_log_material_breakdown (log_id, material_class_id, weight_kg, epr_liability_inr)
      VALUES (NEW.id, v_mat_id, v_total_pkg_kg * v_frac, v_total_pkg_kg * v_frac * v_rate)
      ON CONFLICT (log_id, material_class_id) DO UPDATE SET
        weight_kg         = EXCLUDED.weight_kg,
        epr_liability_inr = EXCLUDED.epr_liability_inr;
    END LOOP;
  ELSE
    FOR v_mat_id, v_frac, v_rate IN
      SELECT rcmd.material_class_id, rcmd.default_fraction, mc.epr_rate_inr_per_kg
      FROM retail_category_material_defaults rcmd
      JOIN epr_material_classes mc ON mc.id = rcmd.material_class_id
      WHERE rcmd.retail_category_id = NEW.retail_category_id
    LOOP
      INSERT INTO epr_log_material_breakdown (log_id, material_class_id, weight_kg, epr_liability_inr)
      VALUES (NEW.id, v_mat_id, v_total_pkg_kg * v_frac, v_total_pkg_kg * v_frac * v_rate)
      ON CONFLICT (log_id, material_class_id) DO UPDATE SET
        weight_kg         = EXCLUDED.weight_kg,
        epr_liability_inr = EXCLUDED.epr_liability_inr;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_epr_log_breakdown ON epr_waste_logs;
CREATE TRIGGER trg_epr_log_breakdown
AFTER INSERT ON epr_waste_logs
FOR EACH ROW EXECUTE FUNCTION fn_epr_log_after_insert();
