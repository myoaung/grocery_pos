-- Cosmic Forge Grocery POS - Schema Specification (Governance Artifact)
-- Phase 0 spec intent only. Not an executed migration script.
-- Authority: docs/CFGP-MES-v1.0.md, docs/Release-Gatekeeper.md, docs/ACP.md

-- =========================================================
-- Core tenant and branch scope
-- =========================================================

CREATE TABLE tenants (
  tenant_id UUID PRIMARY KEY,
  shop_name TEXT NOT NULL,
  address TEXT,
  contact_details TEXT,
  logo_url TEXT,
  tax_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE branches (
  branch_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_code TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_code)
);

-- =========================================================
-- Users and access
-- =========================================================

CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID REFERENCES branches(branch_id),
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

-- Optional multi-branch assignment map for a user.
CREATE TABLE user_branch_access (
  user_id UUID NOT NULL REFERENCES users(user_id),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, branch_id)
);

-- =========================================================
-- Product and inventory
-- =========================================================

CREATE TABLE products (
  product_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  sku TEXT NOT NULL,
  name_mm TEXT,
  name_en TEXT NOT NULL,
  category TEXT,
  unit_type TEXT,
  cost_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  retail_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (retail_price >= 0),
  wholesale_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0),
  tax_category TEXT NOT NULL,
  stock_alert INTEGER NOT NULL DEFAULT 0 CHECK (stock_alert >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE inventory_logs (
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

-- =========================================================
-- Audit and governance logs
-- =========================================================

CREATE TABLE audit_logs (
  audit_log_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID REFERENCES branches(branch_id),
  actor_user_id UUID REFERENCES users(user_id),
  action_type TEXT NOT NULL,
  action_target TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  sync_state TEXT,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- Offline-first conceptual data model (Phase 0 definition)
-- =========================================================

CREATE TABLE offline_queue (
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
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE sync_state (
  sync_state_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID NOT NULL REFERENCES branches(branch_id),
  device_id TEXT NOT NULL,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  queue_depth INTEGER NOT NULL DEFAULT 0 CHECK (queue_depth >= 0),
  status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'DEGRADED', 'READ_ONLY')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, device_id)
);

CREATE TABLE conflict_log (
  conflict_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  branch_id UUID REFERENCES branches(branch_id),
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

-- =========================================================
-- RLS policy declarations (artifact-level governance intent)
-- =========================================================
-- Session contract expected from API layer:
--   SET app.tenant_id = '<tenant-uuid>';
--   SET app.branch_id = '<branch-uuid>'; -- when branch-scoped context exists

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users ON users
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_user_branch_access ON user_branch_access
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_products ON products
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_branch_isolation_inventory_logs ON inventory_logs
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY tenant_branch_isolation_audit_logs ON audit_logs
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND (
    branch_id IS NULL
    OR branch_id = current_setting('app.branch_id', true)::uuid
  )
);

CREATE POLICY tenant_branch_isolation_offline_queue ON offline_queue
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY tenant_branch_isolation_sync_state ON sync_state
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND branch_id = current_setting('app.branch_id', true)::uuid
);

CREATE POLICY tenant_branch_isolation_conflict_log ON conflict_log
USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
  AND (
    branch_id IS NULL
    OR branch_id = current_setting('app.branch_id', true)::uuid
  )
);

CREATE POLICY tenant_isolation_branches ON branches
USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
