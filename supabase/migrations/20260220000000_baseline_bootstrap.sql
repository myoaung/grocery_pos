-- Supabase baseline bootstrap for Grocery POS
-- Safe to run repeatedly in CI and local resets.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
