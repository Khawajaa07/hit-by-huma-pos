import { io } from 'socket.io-client';
import { useCartStore } from '../stores/cartStore';

// Backend Socket URL - Railway deployment
const BACKEND_URL = 'https://pos-backend-production-93a5.up.railway.app';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? '/' : BACKEND_URL);

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    // Listen for barcode scans
    this.socket.on('barcode-scanned', (data) => {
      console.log('Barcode scanned:', data.barcode);
      this.handleBarcodeScanned(data.barcode);
    });

    // Listen for inventory updates
    this.socket.on('inventory-updated', (data) => {
      console.log('Inventory updated:', data);
      this.notifyListeners('inventory-updated', data);
    });

    // Listen for sale completed
    this.socket.on('sale-completed', (data) => {
      console.log('Sale completed:', data);
      this.notifyListeners('sale-completed', data);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinLocation(locationId) {
    if (this.socket?.connected) {
      this.socket.emit('join-location', locationId);
    }
  }

  joinCFD(terminalId) {
    if (this.socket?.connected) {
      this.socket.emit('join-cfd', terminalId);
    }
  }

  async handleBarcodeScanned(barcode) {
    try {
      // Import api here to avoid circular dependency
      const { default: api } = await import('./api');
      
      // Search for product by barcode
      const response = await api.get('/products/search/quick', {
        params: { q: barcode },
      });

      if (response.data.results?.length > 0) {
        const product = response.data.results[0];
        
        // Add to cart
        useCartStore.getState().addItem({
          variantId: product.variantId,
          sku: product.sku,
          barcode: product.barcode,
          variantName: product.variantName,
          productName: product.productName,
          price: product.price,
          imageUrl: product.imageUrl,
        });

        this.notifyListeners('product-added', product);
      } else {
        this.notifyListeners('product-not-found', { barcode });
      }
    } catch (error) {
      console.error('Error handling barcode:', error);
      this.notifyListeners('barcode-error', { barcode, error: error.message });
    }
  }

  addListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  removeListener(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  // Subscribe to cart updates for CFD
  onCartUpdate(callback) {
    if (this.socket) {
      this.socket.on('cart-update', callback);
    }
  }
}

export const socketService = new SocketService();
export default socketService;
