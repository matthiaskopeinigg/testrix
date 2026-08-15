-- Local Testrix PostgreSQL seed (docker compose).
-- Connection from the Database sidebar: type PostgreSQL, host localhost, port 5432,
-- user testrix, password testrix, database testrix.
-- Seed runs only on first volume create. Recreate with:
--   docker compose down -v && docker compose up -d

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

CREATE TABLE actors (
  actor_id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  last_update TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_profiles (
  customer_id SERIAL PRIMARY KEY,
  account_number TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  date_of_birth DATE,
  gender TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  region TEXT,
  postal_code TEXT,
  country TEXT NOT NULL,
  loyalty_tier TEXT NOT NULL,
  credit_limit NUMERIC(12, 2),
  balance NUMERIC(12, 2),
  lifetime_value NUMERIC(12, 2),
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_login_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  preferred_store TEXT,
  risk_score INTEGER,
  nps_score INTEGER
);

CREATE TABLE films (
  film_id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  release_year INTEGER,
  language TEXT NOT NULL,
  original_language TEXT,
  rental_duration INTEGER NOT NULL,
  rental_rate NUMERIC(6, 2) NOT NULL,
  length INTEGER,
  replacement_cost NUMERIC(8, 2) NOT NULL,
  rating TEXT,
  special_features TEXT,
  last_update TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

INSERT INTO actors (first_name, last_name, last_update)
SELECT
  (ARRAY[
    'PENELOPE','NICK','ED','JENNIFER','JOHNNY','BETTE','GRACE','MATTHEW','JOE','CHRISTIAN',
    'ZERO','KARL','UMA','VIVIEN','CUBA','FRED','HELEN','DAN','BOB','LUCILLE'
  ])[1 + ((g - 1) % 20)],
  (ARRAY[
    'GUINESS','WAHLBERG','CHASE','DAVIS','LOLLOBRIGIDA','NICHOLSON','MOSTEL','JOHANSSON','SWANK','GABLE',
    'CAGE','BERRY','WOOD','BERGEN','OLIVIER','COSTNER','VOIGHT','TORN','FAWCETT','TRACY'
  ])[1 + (((g - 1) / 20) % 20)],
  TIMESTAMPTZ '2006-02-15 04:34:33+00' + (g || ' minutes')::INTERVAL
FROM generate_series(1, 200) AS g;

INSERT INTO customer_profiles (
  account_number, first_name, last_name, email, phone, mobile, date_of_birth, gender,
  address_line1, address_line2, city, region, postal_code, country, loyalty_tier,
  credit_limit, balance, lifetime_value, marketing_opt_in, is_active, notes,
  created_at, updated_at, last_login_at, last_order_at, preferred_store, risk_score, nps_score
)
SELECT
  'ACC-' || lpad(g::TEXT, 6, '0'),
  (ARRAY['Ada','Grace','Alan','Katherine','Margaret','Donald','Barbara','Linus','Guido','Ken'])[1 + ((g - 1) % 10)],
  (ARRAY['Lovelace','Hopper','Turing','Johnson','Hamilton','Knuth','Liskov','Torvalds','van Rossum','Thompson'])[1 + (((g - 1) / 10) % 10)],
  CASE WHEN g % 11 = 0 THEN NULL ELSE 'customer' || g || '@example.test' END,
  CASE WHEN g % 9 = 0 THEN NULL ELSE '+1-415-555-' || lpad(((g * 17) % 10000)::TEXT, 4, '0') END,
  CASE WHEN g % 7 = 0 THEN NULL ELSE '+1-628-555-' || lpad(((g * 31) % 10000)::TEXT, 4, '0') END,
  DATE '1970-01-01' + ((g * 37) % 18000),
  (ARRAY['F','M','X', NULL::text])[1 + ((g - 1) % 4)],
  (g * 11) || ' Market Street',
  CASE WHEN g % 4 = 0 THEN 'Suite ' || (g % 40) ELSE NULL END,
  (ARRAY['San Francisco','Austin','Berlin','Tokyo','London','Seoul','Toronto','Sydney'])[1 + ((g - 1) % 8)],
  (ARRAY['CA','TX','BE','TK','LN','KR','ON','NSW', NULL::text])[1 + ((g - 1) % 9)],
  lpad(((g * 13) % 100000)::TEXT, 5, '0'),
  (ARRAY['United States','Germany','Japan','United Kingdom','South Korea','Canada','Australia'])[1 + ((g - 1) % 7)],
  (ARRAY['bronze','silver','gold','platinum'])[1 + ((g - 1) % 4)],
  CASE WHEN g % 8 = 0 THEN NULL ELSE ((g % 50) * 250.00)::NUMERIC(12, 2) END,
  CASE WHEN g % 6 = 0 THEN NULL ELSE ((g % 80) * 18.75)::NUMERIC(12, 2) END,
  ((g % 120) * 42.10)::NUMERIC(12, 2),
  (g % 3) = 0,
  (g % 13) <> 0,
  CASE
    WHEN g % 5 = 0 THEN NULL
    WHEN g % 5 = 1 THEN ''
    ELSE 'Imported profile note ' || g
  END,
  TIMESTAMPTZ '2024-01-01 08:00:00+00' + (g || ' hours')::INTERVAL,
  TIMESTAMPTZ '2025-06-01 09:15:00+00' + (g || ' minutes')::INTERVAL,
  CASE WHEN g % 10 = 0 THEN NULL ELSE TIMESTAMPTZ '2026-03-01 12:00:00+00' + (g || ' minutes')::INTERVAL END,
  CASE WHEN g % 8 = 0 THEN NULL ELSE TIMESTAMPTZ '2026-02-01 16:30:00+00' + (g || ' hours')::INTERVAL END,
  (ARRAY['Downtown','Airport','Online','Warehouse', NULL::text])[1 + ((g - 1) % 5)],
  CASE WHEN g % 12 = 0 THEN NULL ELSE (g % 100) END,
  CASE WHEN g % 15 = 0 THEN NULL ELSE (g % 11) END
FROM generate_series(1, 400) AS g;

INSERT INTO films (
  title, description, release_year, language, original_language, rental_duration,
  rental_rate, length, replacement_cost, rating, special_features, last_update
)
SELECT
  (ARRAY[
    'ACADEMY DINOSAUR','ACE GOLDFINGER','ADAPTATION HOLES','AFFAIR PREJUDICE','AFRICAN EGG',
    'AGENT TRUMAN','AIRPLANE SIERRA','AIRPORT POLLOCK','ALABAMA DEVIL','ALADDIN CALENDAR'
  ])[1 + ((g - 1) % 10)] || ' ' || g,
  'A ' || (ARRAY['Epic','Touching','Brilliant','Fateful','Astounding'])[1 + ((g - 1) % 5)]
    || ' ' || (ARRAY['Drama','Documentary','Comedy','Action','Sci-Fi'])[1 + (((g - 1) / 5) % 5)]
    || ' of a ' || (ARRAY['database','developer','astronaut','composer','teacher'])[1 + ((g - 1) % 5)]
    || ' and a ' || (ARRAY['cat','robot','dentist','mad scientist','wait'])[1 + (((g - 1) / 3) % 5)],
  2000 + ((g - 1) % 26),
  (ARRAY['English','Japanese','German','French','Italian'])[1 + ((g - 1) % 5)],
  CASE WHEN g % 4 = 0 THEN NULL ELSE (ARRAY['English','Japanese','German'])[1 + ((g - 1) % 3)] END,
  3 + ((g - 1) % 5),
  (0.99 + ((g - 1) % 5) * 0.99)::NUMERIC(6, 2),
  48 + ((g * 7) % 140),
  (9.99 + ((g - 1) % 20))::NUMERIC(8, 2),
  (ARRAY['G','PG','PG-13','R','NC-17', NULL::text])[1 + ((g - 1) % 6)],
  (ARRAY['Trailers','Commentaries','Deleted Scenes','Behind the Scenes', NULL::text])[1 + ((g - 1) % 5)],
  TIMESTAMPTZ '2006-02-15 05:03:42+00' + (g || ' hours')::INTERVAL
FROM generate_series(1, 250) AS g;

CREATE INDEX idx_actors_last_name ON actors (last_name);
CREATE INDEX idx_customer_profiles_email ON customer_profiles (email);
CREATE INDEX idx_customer_profiles_city ON customer_profiles (city, country);
CREATE INDEX idx_films_title ON films (title);

CREATE VIEW active_customers AS
SELECT
  customer_id,
  account_number,
  first_name,
  last_name,
  email,
  city,
  country,
  loyalty_tier,
  balance,
  last_login_at
FROM customer_profiles
WHERE is_active;

CREATE VIEW actor_directory AS
SELECT actor_id, first_name, last_name, last_update
FROM actors;
