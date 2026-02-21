-- Seed defaults are intentionally minimal and non-sensitive.
-- Use deterministic UUIDs to keep local/CI runs reproducible.

INSERT INTO tenants (tenant_id, shop_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Grocery Tenant')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO branches (branch_id, tenant_id, branch_code, branch_name, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'HQ',
  'Demo HQ',
  TRUE
)
ON CONFLICT (branch_id) DO NOTHING;

INSERT INTO users (user_id, tenant_id, branch_id, role, email, is_active)
VALUES
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'TENANT_OWNER',
    'owner.demo@grocery-pos.local',
    TRUE
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'MANAGER',
    'manager.demo@grocery-pos.local',
    TRUE
  )
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO products (
  product_id,
  tenant_id,
  sku,
  barcode,
  name_en,
  category,
  unit_type,
  cost_price,
  retail_price,
  wholesale_price,
  tax_category,
  stock_alert
)
VALUES (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000001',
  'DEMO-SKU-001',
  '1111111111111',
  'Demo Rice 1kg',
  'Staples',
  'PACK',
  1.25,
  1.75,
  1.55,
  'STANDARD',
  5
)
ON CONFLICT (tenant_id, sku) DO NOTHING;
