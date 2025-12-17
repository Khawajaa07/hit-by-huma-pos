const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get printer status (mock for cloud deployment)
router.get('/printer/status', async (req, res) => {
  // In cloud deployment, we return a mock status
  // Real hardware would be managed locally
  res.json({
    connected: false,
    message: 'Hardware not available in cloud deployment',
    printerType: 'none'
  });
});

// Print receipt (mock for cloud deployment)
router.post('/printer/receipt', authorize('pos'), async (req, res) => {
  const { saleId, items, totals, payment, customerName } = req.body;
  
  // In cloud deployment, we log the receipt data and return success
  console.log('Receipt print requested:', { saleId, itemCount: items?.length });
  
  res.json({
    success: true,
    printed: false,
    message: 'Receipt saved. Hardware printing not available in cloud deployment.',
    receiptData: {
      saleId,
      timestamp: new Date().toISOString()
    }
  });
});

// Open cash drawer (mock for cloud deployment)
router.post('/drawer/open', authorize('pos'), async (req, res) => {
  console.log('Cash drawer open requested by user:', req.user?.employee_code);
  
  res.json({
    success: true,
    opened: false,
    message: 'Cash drawer command not available in cloud deployment'
  });
});

// Print label (mock for cloud deployment)
router.post('/label/print', authorize('inventory'), async (req, res) => {
  const { barcode, productName, price, quantity } = req.body;
  
  console.log('Label print requested:', { barcode, productName, quantity });
  
  res.json({
    success: true,
    printed: false,
    message: 'Label printing not available in cloud deployment',
    labels: quantity || 1
  });
});

// Get barcode scanner status
router.get('/scanner/status', async (req, res) => {
  res.json({
    connected: false,
    message: 'Barcode scanner operates on client side via keyboard input'
  });
});

// Get all hardware status
router.get('/status', async (req, res) => {
  res.json({
    receiptPrinter: {
      connected: false,
      type: 'none'
    },
    labelPrinter: {
      connected: false,
      type: 'none'
    },
    cashDrawer: {
      connected: false
    },
    barcodeScanner: {
      mode: 'keyboard',
      message: 'Operates via keyboard input'
    },
    environment: 'cloud',
    message: 'Hardware features require local deployment'
  });
});

module.exports = router;
