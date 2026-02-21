-- Phase 1 Multi-tenant enforcement migration artifact
-- Authority: docs/CFGP-MES-v1.0.md, docs/db_schema.sql

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id UUID PRIMARY KEY,
  shop_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  branch_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_code TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_code)
);

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS products (
  product_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  sku TEXT NOT NULL,
  barcode TEXT NOT NULL,
  name_mm TEXT,
  name_en TEXT NOT NULL,
  category TEXT,
  unit_type TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  retail_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (retail_price >= 0),
  wholesale_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0),
  tax_category TEXT NOT NULL,
  stock_alert INTEGER NOT NULL DEFAULT 0 CHECK (stock_alert >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, sku),
  UNIQUE (tenant_id, barcode)
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  inventory_log_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  product_id UUID NOT NULL REFERENCES products(product_id),
  action TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT,
  actor_user_id UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  sale_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  cashier_user_id UUID NOT NULL REFERENCES users(user_id),
  customer_id UUID,
  sale_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  discount_total NUMERIC(14,2) NOT NULL,
  tax_total NUMERIC(14,2) NOT NULL,
  net_total NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  source_queue_id UUID,
  event_type TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_log_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  actor_user_id UUID REFERENCES users(user_id),
  role_at_time TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  action_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offline_queue (
  queue_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  device_id TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'SYNCING', 'CONFLICT', 'FAILED', 'CONFIRMED')),
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS sync_state (
  sync_state_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  device_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'DEGRADED', 'READ_ONLY')),
  queue_depth INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, device_id)
);

CREATE TABLE IF NOT EXISTS conflict_log (
  conflict_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  queue_id UUID REFERENCES offline_queue(queue_id),
  conflict_type TEXT NOT NULL,
  local_value JSONB,
  server_value JSONB,
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('OPEN', 'RESOLVED', 'ESCALATED')),
  resolved_by UUID REFERENCES users(user_id),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- RLS enforcement
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_log ENABLE ROW LEVEL SECURITY;

-- session contract set by API role
-- select set_config('app.tenant_id', '<tenant-id>', true);
-- select set_config('app.branch_id', '<branch-id>', true);

CREATE POLICY branches_tenant_policy ON branches
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY users_tenant_branch_policy ON users
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY products_tenant_policy ON products
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY inventory_tenant_branch_policy ON inventory_logs
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY sales_tenant_branch_policy ON sales
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY transactions_tenant_branch_policy ON transactions
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY audit_tenant_branch_policy ON audit_logs
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY offline_queue_tenant_branch_policy ON offline_queue
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY sync_state_tenant_branch_policy ON sync_state
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY conflict_tenant_branch_policy ON conflict_log
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);