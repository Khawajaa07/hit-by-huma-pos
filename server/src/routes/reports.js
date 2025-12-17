const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get dashboard data
router.get('/dashboard', async (req, res, next) => {
  try {
    const { locationId } = req.query;
    
    const params = {};
    let locationFilter = '';
    
    if (locationId) {
      locationFilter = ' AND location_id = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    // Today's stats
    const todayResult = await db.query(
      `SELECT 
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(AVG(total_amount), 0) as avg_transaction
       FROM sales
       WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed' ${locationFilter}`,
      params
    );
    
    // Items sold today
    const itemsResult = await db.query(
      `SELECT COALESCE(SUM(si.quantity), 0) as items_sold
       FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       WHERE DATE(s.created_at) = CURRENT_DATE AND s.status = 'completed' ${locationFilter}`,
      params
    );
    
    // Low stock alerts
    const lowStockResult = await db.query(
      `SELECT COUNT(*) as count
       FROM inventory i
       WHERE i.quantity_on_hand <= i.reorder_level ${locationId ? ' AND i.location_id = @locationId' : ''}`,
      params
    );
    
    // Top products today
    const topProductsResult = await db.query(
      `SELECT p.product_name, pv.variant_name, SUM(si.quantity) as sold, SUM(si.line_total) as revenue
       FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       INNER JOIN product_variants pv ON si.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       WHERE DATE(s.created_at) = CURRENT_DATE AND s.status = 'completed' ${locationFilter}
       GROUP BY p.product_name, pv.variant_name
       ORDER BY sold DESC
       LIMIT 5`,
      params
    );
    
    // Hourly sales
    const hourlyResult = await db.query(
      `SELECT EXTRACT(HOUR FROM created_at) as hour, COALESCE(SUM(total_amount), 0) as revenue
       FROM sales
       WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed' ${locationFilter}
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      params
    );
    
    res.json({
      today: {
        ...todayResult.recordset[0],
        itemsSold: itemsResult.recordset[0].items_sold
      },
      lowStockCount: lowStockResult.recordset[0].count,
      topProducts: topProductsResult.recordset,
      hourlySales: hourlyResult.recordset
    });
  } catch (error) {
    next(error);
  }
});

// Get sales report
router.get('/sales', authorize('reports'), async (req, res, next) => {
  try {
    const { locationId, startDate, endDate, groupBy = 'day' } = req.query;
    
    const params = {};
    let whereClause = "WHERE status = 'completed'";
    
    if (locationId) {
      whereClause += ' AND location_id = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (startDate) {
      whereClause += ' AND created_at >= @startDate';
      params.startDate = startDate;
    }
    
    if (endDate) {
      whereClause += ' AND created_at <= @endDate';
      params.endDate = endDate;
    }
    
    let groupByClause = 'DATE(created_at)';
    let selectDate = 'DATE(created_at) as date';
    
    if (groupBy === 'month') {
      groupByClause = "TO_CHAR(created_at, 'YYYY-MM')";
      selectDate = "TO_CHAR(created_at, 'YYYY-MM') as date";
    } else if (groupBy === 'week') {
      groupByClause = "DATE_TRUNC('week', created_at)";
      selectDate = "DATE_TRUNC('week', created_at) as date";
    }
    
    const result = await db.query(
      `SELECT ${selectDate},
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(SUM(discount_amount), 0) as discounts,
        COALESCE(AVG(total_amount), 0) as avg_transaction
       FROM sales
       ${whereClause}
       GROUP BY ${groupByClause}
       ORDER BY date DESC`,
      params
    );
    
    res.json({ data: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get sales by category
router.get('/sales-by-category', authorize('reports'), async (req, res, next) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    
    const params = {};
    let whereClause = "WHERE s.status = 'completed'";
    
    if (locationId) {
      whereClause += ' AND s.location_id = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (startDate) {
      whereClause += ' AND s.created_at >= @startDate';
      params.startDate = startDate;
    }
    
    if (endDate) {
      whereClause += ' AND s.created_at <= @endDate';
      params.endDate = endDate;
    }
    
    const result = await db.query(
      `SELECT c.category_name, 
        COUNT(DISTINCT s.sale_id) as transactions,
        SUM(si.quantity) as units_sold,
        COALESCE(SUM(si.line_total), 0) as revenue
       FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       INNER JOIN product_variants pv ON si.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       LEFT JOIN categories c ON p.category_id = c.category_id
       ${whereClause}
       GROUP BY c.category_name
       ORDER BY revenue DESC`,
      params
    );
    
    res.json({ data: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get sales by employee
router.get('/sales-by-employee', authorize('reports'), async (req, res, next) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    
    const params = {};
    let whereClause = "WHERE s.status = 'completed'";
    
    if (locationId) {
      whereClause += ' AND s.location_id = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (startDate) {
      whereClause += ' AND s.created_at >= @startDate';
      params.startDate = startDate;
    }
    
    if (endDate) {
      whereClause += ' AND s.created_at <= @endDate';
      params.endDate = endDate;
    }
    
    const result = await db.query(
      `SELECT u.first_name, u.last_name,
        COUNT(*) as transactions,
        COALESCE(SUM(s.total_amount), 0) as revenue,
        COALESCE(AVG(s.total_amount), 0) as avg_transaction
       FROM sales s
       INNER JOIN users u ON s.user_id = u.user_id
       ${whereClause}
       GROUP BY u.user_id, u.first_name, u.last_name
       ORDER BY revenue DESC`,
      params
    );
    
    res.json({ data: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Generate Z-Report
router.post('/z-report', authorize('reports'), async (req, res, next) => {
  try {
    const { locationId, shiftId } = req.body;
    
    const params = { locationId: parseInt(locationId) };
    let shiftFilter = '';
    
    if (shiftId) {
      shiftFilter = ' AND shift_id = @shiftId';
      params.shiftId = parseInt(shiftId);
    }
    
    // Get sales summary
    const salesResult = await db.query(
      `SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as gross_sales,
        COALESCE(SUM(discount_amount), 0) as total_discounts,
        COALESCE(SUM(tax_amount), 0) as total_tax
       FROM sales
       WHERE location_id = @locationId AND DATE(created_at) = CURRENT_DATE AND status = 'completed' ${shiftFilter}`,
      params
    );
    
    // Get payment breakdown
    const paymentsResult = await db.query(
      `SELECT pm.method_name, COALESCE(SUM(sp.amount), 0) as total
       FROM sale_payments sp
       INNER JOIN sales s ON sp.sale_id = s.sale_id
       INNER JOIN payment_methods pm ON sp.payment_method_id = pm.payment_method_id
       WHERE s.location_id = @locationId AND DATE(s.created_at) = CURRENT_DATE AND s.status = 'completed' ${shiftFilter}
       GROUP BY pm.method_name`,
      params
    );
    
    res.json({
      date: new Date().toISOString(),
      summary: salesResult.recordset[0],
      payments: paymentsResult.recordset
    });
  } catch (error) {
    next(error);
  }
});

// Get Z-Reports history
router.get('/z-reports', authorize('reports'), async (req, res, next) => {
  try {
    // For now, return generated data since we don't have a z_reports table
    res.json({ reports: [] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
