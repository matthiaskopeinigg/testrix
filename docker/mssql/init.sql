IF DB_ID(N'testrix') IS NULL
  CREATE DATABASE testrix;
GO

USE testrix;
GO

IF OBJECT_ID(N'dbo.categories', N'U') IS NULL
BEGIN
  IF OBJECT_ID(N'dbo.sample_items', N'U') IS NOT NULL
    DROP TABLE dbo.sample_items;

  CREATE TABLE dbo.categories (
    id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    name NVARCHAR(64) NOT NULL UNIQUE
  );

  CREATE TABLE dbo.customers (
    id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    email NVARCHAR(128) NOT NULL UNIQUE,
    name NVARCHAR(128) NOT NULL
  );

  CREATE TABLE dbo.sample_items (
    id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    name NVARCHAR(64) NOT NULL,
    category_id INT NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_sample_items_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_sample_items_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_sample_items_category FOREIGN KEY (category_id) REFERENCES dbo.categories (id)
  );

  CREATE TABLE dbo.orders (
    id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    customer_id INT NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_orders_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_orders_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers (id)
  );

  CREATE TABLE dbo.order_items (
    id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    order_id INT NOT NULL,
    sample_item_id INT NOT NULL,
    qty INT NOT NULL,
    CONSTRAINT FK_order_items_order FOREIGN KEY (order_id) REFERENCES dbo.orders (id),
    CONSTRAINT FK_order_items_sample_item FOREIGN KEY (sample_item_id) REFERENCES dbo.sample_items (id)
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'sample_items_name_idx' AND object_id = OBJECT_ID(N'dbo.sample_items')
)
  CREATE INDEX sample_items_name_idx ON dbo.sample_items (name);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'customers_email_idx' AND object_id = OBJECT_ID(N'dbo.customers')
)
  CREATE INDEX customers_email_idx ON dbo.customers (email);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'orders_created_at_idx' AND object_id = OBJECT_ID(N'dbo.orders')
)
  CREATE INDEX orders_created_at_idx ON dbo.orders (created_at);
GO

CREATE OR ALTER VIEW dbo.order_summaries AS
SELECT o.id AS order_id, c.name AS customer_name, COUNT(oi.id) AS item_count
FROM dbo.orders o
JOIN dbo.customers c ON c.id = o.customer_id
LEFT JOIN dbo.order_items oi ON oi.order_id = o.id
GROUP BY o.id, c.name;
GO

CREATE OR ALTER FUNCTION dbo.item_count(@order_id INT)
RETURNS INT
AS
BEGIN
  DECLARE @count INT;
  SELECT @count = COALESCE(SUM(qty), 0) FROM dbo.order_items WHERE order_id = @order_id;
  RETURN @count;
END
GO

CREATE OR ALTER TRIGGER dbo.sample_items_set_updated_at
ON dbo.sample_items
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF TRIGGER_NESTLEVEL() > 1
    RETURN;
  UPDATE s
  SET updated_at = SYSUTCDATETIME()
  FROM dbo.sample_items s
  INNER JOIN inserted i ON i.id = s.id;
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.categories)
BEGIN
  INSERT INTO dbo.categories (name) VALUES (N'general'), (N'tools');
  INSERT INTO dbo.customers (email, name)
  VALUES (N'ada@example.com', N'Ada Lovelace'), (N'alan@example.com', N'Alan Turing');
  INSERT INTO dbo.sample_items (name, category_id)
  SELECT N'alpha', id FROM dbo.categories WHERE name = N'general';
  INSERT INTO dbo.sample_items (name, category_id)
  SELECT N'beta', id FROM dbo.categories WHERE name = N'general';
  INSERT INTO dbo.sample_items (name, category_id)
  SELECT N'gamma', id FROM dbo.categories WHERE name = N'tools';
  INSERT INTO dbo.orders (customer_id)
  SELECT id FROM dbo.customers WHERE email = N'ada@example.com';
  INSERT INTO dbo.orders (customer_id)
  SELECT id FROM dbo.customers WHERE email = N'alan@example.com';
  INSERT INTO dbo.order_items (order_id, sample_item_id, qty)
  SELECT o.id, s.id, 2
  FROM dbo.orders o
  JOIN dbo.customers c ON c.id = o.customer_id
  JOIN dbo.sample_items s ON s.name = N'alpha'
  WHERE c.email = N'ada@example.com';
  INSERT INTO dbo.order_items (order_id, sample_item_id, qty)
  SELECT o.id, s.id, 1
  FROM dbo.orders o
  JOIN dbo.customers c ON c.id = o.customer_id
  JOIN dbo.sample_items s ON s.name = N'beta'
  WHERE c.email = N'ada@example.com';
  INSERT INTO dbo.order_items (order_id, sample_item_id, qty)
  SELECT o.id, s.id, 3
  FROM dbo.orders o
  JOIN dbo.customers c ON c.id = o.customer_id
  JOIN dbo.sample_items s ON s.name = N'gamma'
  WHERE c.email = N'alan@example.com';
END
GO
