import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      customer: null,
      discountAmount: 0,
      discountType: null,
      discountReason: null,
      notes: null,
      parkedSaleId: null,
      suspendedCarts: [],
      taxRate: 0, // Default tax rate, can be configured

      // Add item to cart
      addItem: (product) => {
        const items = get().items;
        const existingIndex = items.findIndex(
          item => item.variantId === product.variantId
        );

        if (existingIndex !== -1) {
          // Update quantity
          const newItems = [...items];
          newItems[existingIndex].quantity += 1;
          set({ items: newItems });
        } else {
          // Add new item
          // Use productName if variantName is 'Default' or empty
          const displayName = product.variantName && product.variantName !== 'Default'
            ? (product.productName ? `${product.productName} - ${product.variantName}` : product.variantName)
            : (product.productName || product.name || 'Unknown Product');

          set({
            items: [...items, {
              variantId: product.variantId,
              sku: product.sku,
              barcode: product.barcode,
              name: displayName,
              productName: product.productName,
              variantName: product.variantName,
              price: product.price,
              originalPrice: product.price,
              quantity: 1,
              discountAmount: 0,
              imageUrl: product.imageUrl,
              stock: product.stock,
            }],
          });
        }
      },

      // Remove item from cart
      removeItem: (variantId) => {
        set({ items: get().items.filter(item => item.variantId !== variantId) });
      },

      // Update item quantity
      updateQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(variantId);
          return;
        }

        const items = get().items.map(item =>
          item.variantId === variantId ? { ...item, quantity } : item
        );
        set({ items });
      },

      // Update item price (with manager override)
      updatePrice: (variantId, price, overrideBy = null) => {
        const items = get().items.map(item =>
          item.variantId === variantId
            ? { ...item, price, priceOverrideBy: overrideBy }
            : item
        );
        set({ items });
      },

      // Apply item discount
      applyItemDiscount: (variantId, discountAmount) => {
        const items = get().items.map(item =>
          item.variantId === variantId
            ? { ...item, discountAmount }
            : item
        );
        set({ items });
      },

      // Set customer
      setCustomer: (customer) => set({ customer }),

      // Apply cart discount
      applyDiscount: (amount, type, reason) => {
        set({
          discountAmount: amount,
          discountType: type,
          discountReason: reason,
        });
      },

      // Clear discount
      clearDiscount: () => {
        set({
          discountAmount: 0,
          discountType: null,
          discountReason: null,
        });
      },

      // Set notes
      setNotes: (notes) => set({ notes }),

      // Set parked sale ID (for resuming)
      setParkedSaleId: (id) => set({ parkedSaleId: id }),

      // Calculate subtotal
      getSubtotal: () => {
        return get().items.reduce((sum, item) => {
          return sum + (item.price * item.quantity) - item.discountAmount;
        }, 0);
      },

      // Calculate tax
      getTax: () => {
        const subtotal = get().getSubtotal();
        return subtotal * (get().taxRate / 100);
      },

      // Calculate total
      getTotal: () => {
        const subtotal = get().getSubtotal();
        const tax = get().getTax();
        return subtotal + tax - get().discountAmount;
      },

      // Alias for discount (for compatibility)
      get discount() {
        return get().discountAmount;
      },

      // Set discount (alias for applyDiscount)
      setDiscount: (amount, type = 'FIXED', reason = '') => {
        set({
          discountAmount: amount,
          discountType: type,
          discountReason: reason,
        });
      },

      // Get item count
      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      // Suspend current cart
      suspendCart: (note = '') => {
        const { items, customer, discountAmount, discountType, discountReason, notes, suspendedCarts } = get();
        if (items.length === 0) return;

        const cartId = Date.now().toString();
        const suspendedCart = {
          id: cartId,
          items: [...items],
          customer,
          discountAmount,
          discountType,
          discountReason,
          notes: note || notes,
          suspendedAt: new Date().toISOString(),
        };

        set({
          suspendedCarts: [...suspendedCarts, suspendedCart],
          items: [],
          customer: null,
          discountAmount: 0,
          discountType: null,
          discountReason: null,
          notes: null,
          parkedSaleId: null,
        });

        return cartId;
      },

      // Resume a suspended cart
      resumeCart: (cartId) => {
        const { suspendedCarts } = get();
        const cart = suspendedCarts.find(c => c.id === cartId);
        if (!cart) return false;

        set({
          items: cart.items,
          customer: cart.customer,
          discountAmount: cart.discountAmount,
          discountType: cart.discountType,
          discountReason: cart.discountReason,
          notes: cart.notes,
          suspendedCarts: suspendedCarts.filter(c => c.id !== cartId),
        });

        return true;
      },

      // Get suspended carts
      getSuspendedCarts: () => {
        return get().suspendedCarts || [];
      },

      // Remove a suspended cart
      removeSuspendedCart: (cartId) => {
        const { suspendedCarts } = get();
        set({
          suspendedCarts: suspendedCarts.filter(c => c.id !== cartId),
        });
      },

      // Clear cart
      clearCart: () => {
        set({
          items: [],
          customer: null,
          discountAmount: 0,
          discountType: null,
          discountReason: null,
          notes: null,
          parkedSaleId: null,
        });
      },

      // Load parked sale
      loadParkedSale: (sale, items) => {
        set({
          items: items.map(item => ({
            variantId: item.VariantID,
            sku: item.SKU,
            barcode: item.Barcode,
            name: item.VariantName || item.ProductName,
            productName: item.ProductName,
            price: item.UnitPrice,
            originalPrice: item.OriginalPrice,
            quantity: item.Quantity,
            discountAmount: item.DiscountAmount || 0,
            imageUrl: item.ImageURL,
          })),
          customer: sale.CustomerID ? {
            id: sale.CustomerID,
            firstName: sale.FirstName,
            lastName: sale.LastName,
            phone: sale.Phone,
          } : null,
          parkedSaleId: sale.SaleID,
          notes: sale.ParkedNotes,
        });
      },
    }),
    {
      name: 'cart-storage',
    }
  )
);
