-- =============================================
-- Add Salesman Role Migration
-- Run this to add the salesman role to existing database
-- =============================================

-- Insert Salesman Role if not exists
IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'salesman')
BEGIN
    INSERT INTO roles (role_name, description, permissions) VALUES
    ('salesman', 'Sales staff with POS access only', '{"pos": true, "customers.view": true, "customers.create": true, "products.view": true, "inventory.view": true, "shifts.own": true}');
    PRINT 'Salesman role created successfully!';
END
ELSE
BEGIN
    PRINT 'Salesman role already exists.';
END
GO
