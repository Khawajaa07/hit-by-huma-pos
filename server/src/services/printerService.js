/**
 * Thermal Printer Service
 * Handles ESC/POS commands for Epson TM-T88V and compatible printers
 * Note: Hardware features are disabled in cloud deployment
 */

const logger = require('../utils/logger');

// Try to load optional printer dependencies
let ThermalPrinter, PrinterTypes;
try {
  ThermalPrinter = require('node-thermal-printer').printer;
  PrinterTypes = require('node-thermal-printer').types;
} catch (e) {
  logger.warn('Printer dependencies not available - hardware printing disabled');
}

class PrinterService {
  constructor() {
    this.printer = null;
    this.isConnected = false;
    this.isCloudMode = !ThermalPrinter; // No hardware in cloud
    this.companyName = process.env.COMPANY_NAME || 'HIT BY HUMA';
    this.currency = process.env.CURRENCY_SYMBOL || 'PKR';
  }

  /**
   * Initialize printer connection
   */
  async initialize() {
    if (this.isCloudMode) {
      logger.info('Running in cloud mode - printer hardware not available');
      return false;
    }
    
    try {
      this.printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: process.env.THERMAL_PRINTER_INTERFACE || 'printer:auto',
        characterSet: 'SLOVENIA',
        removeSpecialCharacters: false,
        lineCharacter: '-',
        options: {
          timeout: 5000,
        },
      });

      this.isConnected = await this.printer.isPrinterConnected();
      logger.info(`Thermal printer connection: ${this.isConnected ? 'SUCCESS' : 'FAILED'}`);
      
      return this.isConnected;
    } catch (error) {
      logger.error('Printer initialization failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Test printer connection
   */
  async testConnection() {
    if (this.isCloudMode) {
      return {
        connected: false,
        cloudMode: true,
        message: 'Printer hardware not available in cloud deployment',
      };
    }
    
    try {
      if (!this.printer) {
        await this.initialize();
      }
      
      const connected = await this.printer.isPrinterConnected();
      
      if (connected) {
        // Print test receipt
        this.printer.alignCenter();
        this.printer.println('=== PRINTER TEST ===');
        this.printer.println(this.companyName);
        this.printer.println(new Date().toLocaleString());
        this.printer.println('Connection: OK');
        this.printer.cut();
        
        await this.printer.execute();
        this.printer.clear();
      }
      
      return {
        connected,
        printerType: 'EPSON TM-T88V',
        interface: process.env.THERMAL_PRINTER_INTERFACE || 'auto',
      };
    } catch (error) {
      logger.error('Printer test failed:', error);
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Print sales receipt
   */
  async printReceipt(data) {
    try {
      if (!this.printer) {
        await this.initialize();
      }

      const { sale, items, payments } = data;

      // Header - Logo placeholder (bitmap would require image file)
      this.printer.alignCenter();
      this.printer.setTextSize(1, 1);
      this.printer.bold(true);
      this.printer.println('================================');
      this.printer.setTextSize(2, 2);
      this.printer.println(this.companyName);
      this.printer.setTextSize(1, 1);
      this.printer.bold(false);
      this.printer.println('================================');
      
      // Store Info
      this.printer.println(sale.LocationName || '');
      this.printer.println(sale.LocationAddress || '');
      this.printer.println(sale.LocationPhone ? `Tel: ${sale.LocationPhone}` : '');
      this.printer.println('');

      // Receipt Info
      this.printer.alignLeft();
      this.printer.println(`Receipt: ${sale.SaleNumber}`);
      this.printer.println(`Date: ${new Date(sale.CreatedAt).toLocaleString()}`);
      this.printer.println(`Cashier: ${sale.CashierFirstName} ${sale.CashierLastName || ''}`);
      
      if (sale.CustomerFirstName) {
        this.printer.println(`Customer: ${sale.CustomerFirstName} ${sale.CustomerLastName || ''}`);
        this.printer.println(`Phone: ${sale.CustomerPhone || ''}`);
      }
      
      this.printer.println('--------------------------------');

      // Items
      this.printer.bold(true);
      this.printer.tableCustom([
        { text: 'Item', align: 'LEFT', width: 0.5 },
        { text: 'Qty', align: 'CENTER', width: 0.15 },
        { text: 'Price', align: 'RIGHT', width: 0.35 },
      ]);
      this.printer.bold(false);
      this.printer.println('--------------------------------');

      for (const item of items) {
        const productName = item.VariantName || item.ProductName;
        const truncatedName = productName.length > 20 
          ? productName.substring(0, 17) + '...' 
          : productName;
        
        this.printer.tableCustom([
          { text: truncatedName, align: 'LEFT', width: 0.5 },
          { text: String(item.Quantity), align: 'CENTER', width: 0.15 },
          { text: this.formatAmount(item.LineTotal), align: 'RIGHT', width: 0.35 },
        ]);
        
        // Show unit price if quantity > 1
        if (item.Quantity > 1) {
          this.printer.println(`  @ ${this.formatAmount(item.UnitPrice)} each`);
        }
        
        // Show discount if any
        if (item.DiscountAmount > 0) {
          this.printer.println(`  Discount: -${this.formatAmount(item.DiscountAmount)}`);
        }
      }

      this.printer.println('--------------------------------');

      // Totals
      this.printer.alignRight();
      this.printer.tableCustom([
        { text: 'Subtotal:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(sale.SubTotal), align: 'RIGHT', width: 0.5 },
      ]);

      if (sale.DiscountAmount > 0) {
        this.printer.tableCustom([
          { text: 'Discount:', align: 'LEFT', width: 0.5 },
          { text: `-${this.formatAmount(sale.DiscountAmount)}`, align: 'RIGHT', width: 0.5 },
        ]);
      }

      if (sale.TaxAmount > 0) {
        this.printer.tableCustom([
          { text: 'Tax:', align: 'LEFT', width: 0.5 },
          { text: this.formatAmount(sale.TaxAmount), align: 'RIGHT', width: 0.5 },
        ]);
      }

      this.printer.println('--------------------------------');
      this.printer.bold(true);
      this.printer.setTextSize(1, 1);
      this.printer.tableCustom([
        { text: 'TOTAL:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(sale.TotalAmount), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.bold(false);
      this.printer.setTextSize(1, 1);
      this.printer.println('--------------------------------');

      // Payments
      this.printer.alignLeft();
      this.printer.println('Payment:');
      for (const payment of payments) {
        this.printer.tableCustom([
          { text: `  ${payment.MethodName}:`, align: 'LEFT', width: 0.5 },
          { text: this.formatAmount(payment.Amount), align: 'RIGHT', width: 0.5 },
        ]);
        
        if (payment.TenderedAmount && payment.ChangeAmount > 0) {
          this.printer.println(`  Tendered: ${this.formatAmount(payment.TenderedAmount)}`);
          this.printer.println(`  Change: ${this.formatAmount(payment.ChangeAmount)}`);
        }
      }

      this.printer.println('');
      this.printer.println('================================');

      // Footer
      this.printer.alignCenter();
      this.printer.println('Thank you for shopping at');
      this.printer.bold(true);
      this.printer.println(this.companyName);
      this.printer.bold(false);
      this.printer.println('');
      this.printer.println('Exchange within 7 days with receipt');
      this.printer.println('No cash refunds');
      this.printer.println('');
      
      // Barcode for receipt lookup
      if (sale.SaleNumber) {
        this.printer.printBarcode(sale.SaleNumber.replace(/-/g, ''));
      }
      
      this.printer.println('');
      this.printer.println('================================');

      // Cut paper
      this.printer.cut();

      // Execute print
      await this.printer.execute();
      this.printer.clear();

      logger.info(`Receipt printed: ${sale.SaleNumber}`);
      return true;
    } catch (error) {
      logger.error('Receipt printing failed:', error);
      this.printer?.clear();
      throw error;
    }
  }

  /**
   * Open cash drawer
   * Sends pulse to RJ11 port
   */
  async openCashDrawer() {
    try {
      if (!this.printer) {
        await this.initialize();
      }

      // ESC/POS command to open cash drawer
      // Pin 2: \x00, Pin 5: \x01
      // Pulse duration: 100ms on, 100ms off
      this.printer.openCashDrawer();
      await this.printer.execute();
      this.printer.clear();

      logger.info('Cash drawer opened');
      return true;
    } catch (error) {
      logger.error('Cash drawer open failed:', error);
      throw error;
    }
  }

  /**
   * Print product label
   */
  async printLabel(data) {
    try {
      if (!this.printer) {
        await this.initialize();
      }

      const { sku, barcode, name, price, quantity = 1 } = data;

      for (let i = 0; i < quantity; i++) {
        // Label format for standard sticky labels
        this.printer.alignCenter();
        
        // Company name
        this.printer.bold(true);
        this.printer.println(this.companyName);
        this.printer.bold(false);
        
        // Product name
        const truncatedName = name.length > 24 ? name.substring(0, 21) + '...' : name;
        this.printer.println(truncatedName);
        
        // Price
        this.printer.setTextSize(2, 1);
        this.printer.bold(true);
        this.printer.println(this.formatAmount(price));
        this.printer.bold(false);
        this.printer.setTextSize(1, 1);
        
        // SKU
        this.printer.println(`SKU: ${sku}`);
        
        // Barcode
        if (barcode) {
          this.printer.printBarcode(barcode);
        }
        
        this.printer.println('');
        
        // Cut or feed for next label
        if (i < quantity - 1) {
          this.printer.cut(); // Or use partial cut for continuous labels
        }
      }

      this.printer.cut();
      await this.printer.execute();
      this.printer.clear();

      logger.info(`Labels printed: ${quantity}x ${sku}`);
      return true;
    } catch (error) {
      logger.error('Label printing failed:', error);
      this.printer?.clear();
      throw error;
    }
  }

  /**
   * Print Z-Report
   */
  async printZReport(data) {
    try {
      if (!this.printer) {
        await this.initialize();
      }

      this.printer.alignCenter();
      this.printer.bold(true);
      this.printer.setTextSize(2, 2);
      this.printer.println('Z-REPORT');
      this.printer.setTextSize(1, 1);
      this.printer.println(this.companyName);
      this.printer.bold(false);
      this.printer.println('================================');
      
      this.printer.alignLeft();
      this.printer.println(`Report #: ${data.reportNumber}`);
      this.printer.println(`Location: ${data.locationName}`);
      this.printer.println(`Date: ${data.reportDate}`);
      this.printer.println(`Generated: ${new Date().toLocaleString()}`);
      this.printer.println('--------------------------------');

      // Sales Summary
      this.printer.bold(true);
      this.printer.println('SALES SUMMARY');
      this.printer.bold(false);
      
      this.printer.tableCustom([
        { text: 'Gross Sales:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(data.grossSales), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.tableCustom([
        { text: 'Discounts:', align: 'LEFT', width: 0.5 },
        { text: `-${this.formatAmount(data.discounts)}`, align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.tableCustom([
        { text: 'Returns:', align: 'LEFT', width: 0.5 },
        { text: `-${this.formatAmount(data.returns)}`, align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.println('--------------------------------');
      this.printer.bold(true);
      this.printer.tableCustom([
        { text: 'NET SALES:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(data.netSales), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.bold(false);
      this.printer.println('--------------------------------');

      // Transaction Counts
      this.printer.println(`Transactions: ${data.saleCount}`);
      this.printer.println(`Voids: ${data.voidCount}`);
      this.printer.println(`Returns: ${data.returnCount}`);
      this.printer.println('--------------------------------');

      // Payment Breakdown
      this.printer.bold(true);
      this.printer.println('PAYMENT BREAKDOWN');
      this.printer.bold(false);
      
      this.printer.tableCustom([
        { text: 'Cash:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(data.cashTotal), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.tableCustom([
        { text: 'Card:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(data.cardTotal), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.tableCustom([
        { text: 'Store Credit:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(data.walletTotal), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.println('--------------------------------');

      // Cash Reconciliation
      this.printer.bold(true);
      this.printer.println('CASH RECONCILIATION');
      this.printer.bold(false);
      
      this.printer.tableCustom([
        { text: 'Opening:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(data.openingCash), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.tableCustom([
        { text: 'Expected:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(data.expectedCash), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.tableCustom([
        { text: 'Actual:', align: 'LEFT', width: 0.5 },
        { text: this.formatAmount(data.actualCash), align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.println('--------------------------------');
      
      const varianceStatus = Math.abs(data.variance) <= 500 ? 'OK' : 'FLAGGED';
      this.printer.bold(true);
      this.printer.tableCustom([
        { text: 'Variance:', align: 'LEFT', width: 0.5 },
        { text: `${this.formatAmount(data.variance)} [${varianceStatus}]`, align: 'RIGHT', width: 0.5 },
      ]);
      this.printer.bold(false);

      this.printer.println('================================');
      this.printer.alignCenter();
      this.printer.println('*** END OF Z-REPORT ***');
      
      this.printer.cut();
      await this.printer.execute();
      this.printer.clear();

      logger.info(`Z-Report printed: ${data.reportNumber}`);
      return true;
    } catch (error) {
      logger.error('Z-Report printing failed:', error);
      this.printer?.clear();
      throw error;
    }
  }

  /**
   * Format amount with currency
   */
  formatAmount(amount) {
    return `${this.currency} ${parseFloat(amount || 0).toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
}

// Export singleton instance
module.exports = new PrinterService();
