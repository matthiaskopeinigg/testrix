CREATE TABLE IF NOT EXISTS categories (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sample_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  category_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sample_items_category FOREIGN KEY (category_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  sample_item_id INT NOT NULL,
  qty INT NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_order_items_sample_item FOREIGN KEY (sample_item_id) REFERENCES sample_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX sample_items_name_idx ON sample_items (name);
CREATE INDEX customers_email_idx ON customers (email);
CREATE INDEX orders_created_at_idx ON orders (created_at);

CREATE OR REPLACE VIEW order_summaries AS
SELECT o.id AS order_id, c.name AS customer_name, COUNT(oi.id) AS item_count
FROM orders o
JOIN customers c ON c.id = o.customer_id
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, c.name;

DROP PROCEDURE IF EXISTS item_count;
CREATE PROCEDURE item_count(IN p_order_id INT)
SELECT COALESCE(SUM(qty), 0) AS item_count FROM order_items WHERE order_id = p_order_id;

DROP TRIGGER IF EXISTS sample_items_set_updated_at;
CREATE TRIGGER sample_items_set_updated_at
BEFORE UPDATE ON sample_items
FOR EACH ROW
SET NEW.updated_at = CURRENT_TIMESTAMP;

CREATE USER IF NOT EXISTS 'testrix_ro'@'%' IDENTIFIED BY 'testrix';
GRANT SELECT ON testrix.* TO 'testrix_ro'@'%';

INSERT IGNORE INTO categories (name) VALUES ('general'), ('tools');
INSERT IGNORE INTO customers (email, name)
VALUES ('ada@example.com', 'Ada Lovelace'), ('alan@example.com', 'Alan Turing');

INSERT INTO sample_items (name, category_id)
SELECT 'alpha', id FROM categories
WHERE name = 'general' AND NOT EXISTS (SELECT 1 FROM sample_items WHERE name = 'alpha');
INSERT INTO sample_items (name, category_id)
SELECT 'beta', id FROM categories
WHERE name = 'general' AND NOT EXISTS (SELECT 1 FROM sample_items WHERE name = 'beta');
INSERT INTO sample_items (name, category_id)
SELECT 'gamma', id FROM categories
WHERE name = 'tools' AND NOT EXISTS (SELECT 1 FROM sample_items WHERE name = 'gamma');

INSERT INTO orders (customer_id)
SELECT id FROM customers
WHERE email = 'ada@example.com' AND NOT EXISTS (
  SELECT 1 FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.email = 'ada@example.com'
);
INSERT INTO orders (customer_id)
SELECT id FROM customers
WHERE email = 'alan@example.com' AND NOT EXISTS (
  SELECT 1 FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.email = 'alan@example.com'
);

INSERT INTO order_items (order_id, sample_item_id, qty)
SELECT o.id, s.id, 2
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN sample_items s ON s.name = 'alpha'
WHERE c.email = 'ada@example.com'
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.sample_item_id = s.id);
INSERT INTO order_items (order_id, sample_item_id, qty)
SELECT o.id, s.id, 1
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN sample_items s ON s.name = 'beta'
WHERE c.email = 'ada@example.com'
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.sample_item_id = s.id);
INSERT INTO order_items (order_id, sample_item_id, qty)
SELECT o.id, s.id, 3
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN sample_items s ON s.name = 'gamma'
WHERE c.email = 'alan@example.com'
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.sample_item_id = s.id);

GRANT SELECT ON mysql.user TO 'testrix'@'%';
