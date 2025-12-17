-- =============================================
-- HIT BY HUMA POS - PostgreSQL Database Schema
-- Version: 1.0.0
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CORE LOOKUP TABLES
-- =============================================

-- Locations/Stores Table
CREATE TABLE IF NOT EXISTS locations (
    location_id SERIAL PRIMARY KEY,
    location_code VARCHAR(20) NOT NULL UNIQUE,
    location_name VARCHAR(100) NOT NULL,
    address VARCHAR(500),
    city VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_headquarters BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Categories
CREATE TABLE IF NOT EXISTS categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    parent_category_id INT REFERENCES categories(category_id),
    description VARCHAR(500),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Attributes (Size, Color, etc.)
CREATE TABLE IF NOT EXISTS attributes (
    attribute_id SERIAL PRIMARY KEY,
    attribute_name VARCHAR(50) NOT NULL UNIQUE,
    attribute_type VARCHAR(20) DEFAULT 'select',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attribute Values
CREATE TABLE IF NOT EXISTS attribute_values (
    attribute_value_id SERIAL PRIMARY KEY,
    attribute_id INT NOT NULL REFERENCES attributes(attribute_id),
    value VARCHAR(100) NOT NULL,
    color_hex VARCHAR(7),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (attribute_id, value)
);

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(200),
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users/Employees Table
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    pin_hash VARCHAR(255),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50),
    phone VARCHAR(20),
    role_id INT REFERENCES roles(role_id),
    default_location_id INT REFERENCES locations(location_id),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Parent Products (Master Product Definition)
CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL UNIQUE,
    product_name VARCHAR(200) NOT NULL,
    category_id INT REFERENCES categories(category_id),
    description TEXT,
    base_price DECIMAL(18,2) NOT NULL,
    cost_price DECIMAL(18,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    has_variants BOOLEAN DEFAULT FALSE,
    propagate_price BOOLEAN DEFAULT TRUE,
    image_url VARCHAR(500),
    tags VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Variants (Child Products with SKU)
CREATE TABLE IF NOT EXISTS product_variants (
    variant_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    sku VARCHAR(50) NOT NULL UNIQUE,
    barcode VARCHAR(50) UNIQUE,
    variant_name VARCHAR(200),
    price DECIMAL(18,2) NOT NULL,
    cost_price DECIMAL(18,2) DEFAULT 0,
    weight DECIMAL(10,3),
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Variant Attributes
CREATE TABLE IF NOT EXISTS variant_attributes (
    variant_attribute_id SERIAL PRIMARY KEY,
    variant_id INT NOT NULL REFERENCES product_variants(variant_id) ON DELETE CASCADE,
    attribute_id INT NOT NULL REFERENCES attributes(attribute_id),
    attribute_value_id INT NOT NULL REFERENCES attribute_values(attribute_value_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (variant_id, attribute_id)
);

-- Product Attributes Definition
CREATE TABLE IF NOT EXISTS product_attributes (
    product_attribute_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    attribute_id INT NOT NULL REFERENCES attributes(attribute_id),
    is_required BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    UNIQUE (product_id, attribute_id)
);

-- Inventory per Location per Variant
CREATE TABLE IF NOT EXISTS inventory (
    inventory_id SERIAL PRIMARY KEY,
    variant_id INT NOT NULL REFERENCES product_variants(variant_id),
    location_id INT NOT NULL REFERENCES locations(location_id),
    quantity_on_hand INT DEFAULT 0,
    quantity_reserved INT DEFAULT 0,
    reorder_level INT DEFAULT 5,
    reorder_quantity INT DEFAULT 10,
    bin_location VARCHAR(50),
    last_stock_check TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (variant_id, location_id)
);

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
    customer_id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    loyalty_points INT DEFAULT 0,
    wallet_balance DECIMAL(18,2) DEFAULT 0,
    total_purchases DECIMAL(18,2) DEFAULT 0,
    visit_count INT DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Methods
CREATE TABLE IF NOT EXISTS payment_methods (
    payment_method_id SERIAL PRIMARY KEY,
    method_name VARCHAR(50) NOT NULL UNIQUE,
    method_type VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    requires_reference BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shifts Table
CREATE TABLE IF NOT EXISTS shifts (
    shift_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id),
    location_id INT NOT NULL REFERENCES locations(location_id),
    terminal_id VARCHAR(50),
    opening_cash DECIMAL(18,2) DEFAULT 0,
    closing_cash DECIMAL(18,2),
    expected_cash DECIMAL(18,2),
    cash_difference DECIMAL(18,2),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales Table
CREATE TABLE IF NOT EXISTS sales (
    sale_id SERIAL PRIMARY KEY,
    sale_number VARCHAR(50) NOT NULL UNIQUE,
    location_id INT NOT NULL REFERENCES locations(location_id),
    shift_id INT REFERENCES shifts(shift_id),
    user_id INT NOT NULL REFERENCES users(user_id),
    customer_id INT REFERENCES customers(customer_id),
    subtotal DECIMAL(18,2) NOT NULL,
    tax_amount DECIMAL(18,2) DEFAULT 0,
    discount_amount DECIMAL(18,2) DEFAULT 0,
    discount_type VARCHAR(20),
    discount_reason VARCHAR(200),
    total_amount DECIMAL(18,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'completed',
    notes TEXT,
    voided_by INT REFERENCES users(user_id),
    voided_at TIMESTAMP,
    void_reason VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
    sale_item_id SERIAL PRIMARY KEY,
    sale_id INT NOT NULL REFERENCES sales(sale_id) ON DELETE CASCADE,
    variant_id INT NOT NULL REFERENCES product_variants(variant_id),
    quantity INT NOT NULL,
    unit_price DECIMAL(18,2) NOT NULL,
    discount_amount DECIMAL(18,2) DEFAULT 0,
    tax_amount DECIMAL(18,2) DEFAULT 0,
    line_total DECIMAL(18,2) NOT NULL,
    notes VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sale Payments
CREATE TABLE IF NOT EXISTS sale_payments (
    sale_payment_id SERIAL PRIMARY KEY,
    sale_id INT NOT NULL REFERENCES sales(sale_id) ON DELETE CASCADE,
    payment_method_id INT NOT NULL REFERENCES payment_methods(payment_method_id),
    amount DECIMAL(18,2) NOT NULL,
    reference_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Transactions
CREATE TABLE IF NOT EXISTS inventory_transactions (
    transaction_id SERIAL PRIMARY KEY,
    variant_id INT NOT NULL REFERENCES product_variants(variant_id),
    location_id INT NOT NULL REFERENCES locations(location_id),
    transaction_type VARCHAR(30) NOT NULL,
    quantity_change INT NOT NULL,
    quantity_before INT NOT NULL,
    quantity_after INT NOT NULL,
    reference_type VARCHAR(30),
    reference_id INT,
    notes VARCHAR(500),
    user_id INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Parked Sales
CREATE TABLE IF NOT EXISTS parked_sales (
    parked_id SERIAL PRIMARY KEY,
    location_id INT NOT NULL REFERENCES locations(location_id),
    user_id INT NOT NULL REFERENCES users(user_id),
    customer_id INT REFERENCES customers(customer_id),
    cart_data JSONB NOT NULL,
    notes VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    setting_id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type VARCHAR(20) DEFAULT 'string',
    description VARCHAR(500),
    is_public BOOLEAN DEFAULT FALSE,
    updated_by INT REFERENCES users(user_id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_variant ON inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_sales_location ON sales(location_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- =============================================
-- DEFAULT DATA
-- =============================================

-- Insert default roles
INSERT INTO roles (role_name, description, permissions) VALUES
('admin', 'System Administrator', '{"all": true}'),
('manager', 'Store Manager', '{"sales": true, "inventory": true, "reports": true, "customers": true, "discounts": true, "void": true}'),
('cashier', 'Cashier', '{"sales": true, "customers": true}')
ON CONFLICT (role_name) DO NOTHING;

-- Insert default payment methods
INSERT INTO payment_methods (method_name, method_type, is_active, sort_order) VALUES
('Cash', 'cash', TRUE, 1),
('Credit Card', 'card', TRUE, 2),
('Debit Card', 'card', TRUE, 3),
('JazzCash', 'mobile', TRUE, 4),
('EasyPaisa', 'mobile', TRUE, 5),
('Store Credit', 'credit', TRUE, 6)
ON CONFLICT (method_name) DO NOTHING;

-- Insert default location
INSERT INTO locations (location_code, location_name, is_headquarters) VALUES
('HQ', 'Main Store', TRUE)
ON CONFLICT (location_code) DO NOTHING;

-- Insert default admin user (password: admin123)
INSERT INTO users (employee_code, email, password_hash, first_name, last_name, role_id, default_location_id) 
SELECT 'ADMIN001', 'admin@hitbyhuma.com', '$2a$10$rQnM1TmKxKVRlFKNz.YHcOVB3Q.3kZQxPNxjh8K.P9xJvZlQ5VjTi', 'Admin', 'User', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE employee_code = 'ADMIN001');

-- Insert default attributes
INSERT INTO attributes (attribute_name, attribute_type, sort_order) VALUES
('Size', 'select', 1),
('Color', 'color', 2)
ON CONFLICT (attribute_name) DO NOTHING;

-- Insert default attribute values for Size
INSERT INTO attribute_values (attribute_id, value, sort_order) 
SELECT a.attribute_id, v.value, v.sort_order
FROM attributes a
CROSS JOIN (VALUES ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6)) AS v(value, sort_order)
WHERE a.attribute_name = 'Size'
ON CONFLICT (attribute_id, value) DO NOTHING;

-- Insert default categories
INSERT INTO categories (category_name, sort_order) VALUES
('Kurtas', 1),
('Shalwar Kameez', 2),
('Western Wear', 3),
('Accessories', 4),
('Footwear', 5)
ON CONFLICT DO NOTHING;

-- Insert default settings
INSERT INTO settings (setting_key, setting_value, setting_type, description, is_public) VALUES
('company_name', 'HIT BY HUMA', 'string', 'Company name displayed on receipts', TRUE),
('currency_symbol', 'PKR', 'string', 'Currency symbol', TRUE),
('tax_rate', '0', 'number', 'Default tax rate percentage', TRUE),
('receipt_footer', 'Thank you for shopping with us!', 'string', 'Receipt footer message', TRUE),
('allow_negative_inventory', 'false', 'boolean', 'Allow sales when stock is zero', FALSE),
('max_discount_without_approval', '10', 'number', 'Maximum discount percentage without manager approval', FALSE)
ON CONFLICT (setting_key) DO NOTHING;
