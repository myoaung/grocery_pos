-- Phase 2 seed fixtures (safe defaults, deterministic IDs)

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

INSERT INTO roles (role_id, tenant_id, role_code, role_name, permissions)
VALUES
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000001',
    'TENANT_OWNER',
    'Tenant Owner',
    '{"reports":["all"],"inventory":["all"],"orders":["all"]}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000001',
    'MANAGER',
    'Store Manager',
    '{"reports":["daily","stock"],"inventory":["read","write"],"orders":["all"]}'::jsonb
  )
ON CONFLICT (tenant_id, role_code) DO NOTHING;

INSERT INTO categories (category_id, tenant_id, category_code, category_name, description)
VALUES
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000001',
    'STAPLES',
    'Staples',
    'Rice, oil, and essential dry goods'
  )
ON CONFLICT (tenant_id, category_code) DO NOTHING;

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

INSERT INTO inventory (inventory_id, tenant_id, branch_id, product_id, quantity_on_hand, reorder_level)
VALUES (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000301',
  125,
  20
)
ON CONFLICT (tenant_id, branch_id, product_id) DO NOTHING;
