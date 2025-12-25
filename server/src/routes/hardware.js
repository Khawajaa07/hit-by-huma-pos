const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const printerService = require('../services/printerService');

// Get printer status (mock for cloud deployment)
router.get('/printer/status', async (req, res) => {
  try {
    const status = await printerService.testConnection();
    res.json(Object.assign({ message: 'Local hardware status' }, status));
  } catch (err) {
    res.json({ connected: false, message: 'Printer status unknown', error: err.message });
  }
});

// Print receipt
router.post('/printer/receipt', authorize('pos'), async (req, res) => {
  const { sale } = req.body;

  try {
    const result = await printerService.printReceipt(sale);
    res.json({
      success: true,
      printed: result.printed || false,
      method: result.isCloudMode ? 'cloud' : 'usb',
      message: result.message || (result.printed ? 'Receipt printed successfully' : 'Cloud mode - use browser print')
    });
  } catch (error) {
    console.error('Receipt print failed:', error);
    res.status(500).json({
      success: false,
      printed: false,
      error: error.message,
      message: 'Receipt printing failed. Please try browser print or check printer connection.'
    });
  }
});


// Print label (mock for cloud deployment)
router.post('/label/print', authorize('inventory'), async (req, res) => {
  const { barcode, productName, price, quantity } = req.body;

  console.log('Label print requested:', { barcode, productName, quantity });

  try {
    const result = await printerService.printLabel({ sku: barcode || productName, barcode, name: productName, price, quantity });
    res.json({ success: true, printed: !!result, labels: quantity || 1 });
  } catch (error) {
    res.status(500).json({ success: false, printed: false, message: error.message });
  }
});

// Test a hardware device (client calls POST /hardware/test/:device)
router.post('/test/:device', authorize('pos'), async (req, res) => {
  const { device } = req.params;
  try {
    if (device === 'printer') {
      const status = await printerService.testConnection();
      res.json({ success: true, device: 'printer', status });
      return;
    }

    // For other devices, return mock/placeholder
    res.json({ success: true, device, message: 'Test executed (mock for this device)' });
  } catch (error) {
    res.status(500).json({ success: false, device, error: error.message });
  }
});

// Set thermal printer interface at runtime
router.post('/printer/interface', authorize('settings'), async (req, res) => {
  const { interface: iface } = req.body;
  try {
    const ok = await printerService.setInterface(iface);
    res.json({ success: !!ok, interface: iface });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
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
    barcodeScanner: {
      mode: 'keyboard',
      message: 'Operates via keyboard input'
    },
    environment: 'cloud',
    message: 'Hardware features require local deployment'
  });
});

module.exports = router;
