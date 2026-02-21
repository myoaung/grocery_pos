-- Phase 2 core schema expansion
-- Adds normalized commerce primitives with tenant-safe RLS.

CREATE TABLE IF NOT EXISTS roles (
  role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  role_name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, role_code)
);

CREATE TABLE IF NOT EXISTS categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  parent_category_id UUID REFERENCES categories(category_id) ON DELETE SET NULL,
  category_code TEXT NOT NULL,
  category_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, category_code)
);

CREATE TABLE IF NOT EXISTS inventory (
  inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  cashier_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  order_status TEXT NOT NULL CHECK (order_status IN ('DRAFT', 'OPEN', 'PAID', 'CANCELLED', 'REFUNDED')),
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_number)
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  reference_number TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(payment_id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  printed_at TIMESTAMPTZ,
  receipt_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_branch ON inventory(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_branch ON orders(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_receipts_order_id ON receipts(order_id);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_self_policy'
  ) THEN
    EXECUTE 'CREATE POLICY tenants_self_policy ON tenants USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'roles' AND policyname = 'roles_tenant_policy'
  ) THEN
    EXECUTE 'CREATE POLICY roles_tenant_policy ON roles USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'categories_tenant_policy'
  ) THEN
    EXECUTE 'CREATE POLICY categories_tenant_policy ON categories USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory' AND policyname = 'inventory_tenant_branch_policy'
  ) THEN
    EXECUTE
      'CREATE POLICY inventory_tenant_branch_policy ON inventory USING (
         tenant_id = current_setting(''app.tenant_id'', true)::uuid
         AND branch_id = current_setting(''app.branch_id'', true)::uuid
       )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_tenant_branch_policy'
  ) THEN
    EXECUTE
      'CREATE POLICY orders_tenant_branch_policy ON orders USING (
         tenant_id = current_setting(''app.tenant_id'', true)::uuid
         AND branch_id = current_setting(''app.branch_id'', true)::uuid
       )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'payments_tenant_branch_policy'
  ) THEN
    EXECUTE
      'CREATE POLICY payments_tenant_branch_policy ON payments USING (
         tenant_id = current_setting(''app.tenant_id'', true)::uuid
         AND branch_id = current_setting(''app.branch_id'', true)::uuid
       )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'receipts' AND policyname = 'receipts_tenant_branch_policy'
  ) THEN
    EXECUTE
      'CREATE POLICY receipts_tenant_branch_policy ON receipts USING (
         tenant_id = current_setting(''app.tenant_id'', true)::uuid
         AND branch_id = current_setting(''app.branch_id'', true)::uuid
       )';
  END IF;
END $$;
