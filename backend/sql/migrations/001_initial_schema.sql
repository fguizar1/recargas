BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS carriers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS recharge_types (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id),
  code VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  UNIQUE (carrier_id, code)
);

CREATE TABLE IF NOT EXISTS recharge_packages (
  id SERIAL PRIMARY KEY,
  type_id INTEGER NOT NULL REFERENCES recharge_types(id),
  name VARCHAR(120) NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  validity_days INTEGER CHECK (validity_days IS NULL OR validity_days > 0),
  validity_hours INTEGER CHECK (validity_hours IS NULL OR validity_hours > 0),
  benefits TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (type_id, name)
);

CREATE TABLE IF NOT EXISTS recharges (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  package_id INTEGER REFERENCES recharge_packages(id) ON DELETE SET NULL,
  carrier VARCHAR(100) NOT NULL,
  phone VARCHAR(10) NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'mxn',
  status VARCHAR(16) NOT NULL
    CHECK (status IN ('pending', 'paid', 'failed')),
  stripe_session_id VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recharges_user_created_at_idx
  ON recharges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recharges_status_idx
  ON recharges (status);

COMMIT;
