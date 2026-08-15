-- Local Testrix PostgreSQL seed (docker compose).
-- Connection from the Data sidebar: type PostgreSQL, host localhost, port 5432,
-- user testrix, password testrix, database testrix.

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  discontinued BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  bio TEXT NOT NULL DEFAULT '',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  balance NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  quantity INTEGER NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  status TEXT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO products (sku, name, price, discontinued) VALUES
  ('SKU-100', 'Notebook', 12.50, FALSE),
  ('SKU-200', 'Mechanical keyboard', 89.00, FALSE),
  ('SKU-300', 'USB-C hub', 34.99, FALSE),
  ('SKU-400', 'Legacy serial adapter', 19.00, TRUE);

INSERT INTO users (name, email, bio, notes, is_active, balance, created_at)
SELECT
  'User ' || g,
  CASE WHEN g % 5 = 0 THEN NULL ELSE 'user' || g || '@example.test' END,
  CASE WHEN g % 7 = 0 THEN '' ELSE 'Bio for user ' || g END,
  CASE
    WHEN g % 4 = 0 THEN NULL
    WHEN g % 4 = 1 THEN ''
    ELSE 'Note ' || g
  END,
  (g % 3) <> 0,
  CASE WHEN g % 6 = 0 THEN NULL ELSE (g * 10.25)::NUMERIC(10, 2) END,
  TIMESTAMPTZ '2026-01-01 00:00:00+00' + (g || ' days')::INTERVAL
FROM generate_series(1, 32) AS g;

INSERT INTO orders (user_id, product_id, quantity, total, status, placed_at)
SELECT
  u.id,
  p.id,
  qty.n,
  (qty.n * p.price)::NUMERIC(10, 2),
  CASE
    WHEN g % 8 = 0 THEN NULL
    WHEN g % 8 = 1 THEN ''
    WHEN g % 3 = 0 THEN 'shipped'
    ELSE 'pending'
  END,
  TIMESTAMPTZ '2026-02-01 12:00:00+00' + (g || ' hours')::INTERVAL
FROM generate_series(1, 48) AS g
JOIN users u ON u.id = ((g - 1) % 32) + 1
JOIN products p ON p.id = ((g - 1) % 4) + 1
CROSS JOIN LATERAL (SELECT ((g - 1) % 5) + 1 AS n) AS qty;
