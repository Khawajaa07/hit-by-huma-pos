import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
  MinusIcon,
  XMarkIcon,
  BuildingStorefrontIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  FunnelIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Inventory() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [stockFilter, setStockFilter] = useState('all'); // all, low, out
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Fetch locations
  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/inventory/locations').then(res => res.data)
  });
  
  // Extract and transform locations
  const locations = locationsData?.locations?.map(loc => ({
    id: loc.LocationID,
    name: loc.LocationName
  })) || [];

  // Fetch inventory
  const { data: inventoryData, isLoading, refetch } = useQuery({
    queryKey: ['inventory', selectedLocation, searchQuery, stockFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedLocation) params.append('locationId', selectedLocation);
      if (searchQuery) params.append('search', searchQuery);
      if (stockFilter === 'low') params.append('lowStock', 'true');
      return api.get(`/inventory?${params}`).then(res => res.data);
    }
  });
  
  // Extract inventory array and summary from response
  const inventory = inventoryData?.inventory || [];
  const summary = inventoryData?.summary || {
    totalProducts: inventory.length,
    totalValue: inventory.reduce((sum, item) => sum + ((item.quantity || 0) * (item.variant?.price || 0)), 0),
    lowStock: inventory.filter(item => item.quantity > 0 && item.quantity <= (item.reorderLevel || 5)).length,
    outOfStock: inventory.filter(item => (item.quantity || 0) <= 0).length
  };

  // Filter inventory based on stockFilter
  const filteredInventory = stockFilter === 'out' 
    ? inventory.filter(item => (item.quantity || 0) <= 0)
    : stockFilter === 'low'
    ? inventory.filter(item => item.quantity > 0 && item.quantity <= (item.reorderLevel || 5))
    : inventory;

  const handleAdjust = (product) => {
    setSelectedProduct(product);
    setShowAdjustModal(true);
  };

  const handleTransfer = (product) => {
    setSelectedProduct(product);
    setShowTransferModal(true);
  };

  const getStockStatusColor = (quantity, lowStockThreshold) => {
    if (quantity <= 0) return 'text-red-600 bg-red-100';
    if (quantity <= lowStockThreshold) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500">Manage stock levels across locations</p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowPathIcon className="w-5 h-5" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-sm text-gray-500 mb-1">Total Products</p>
          <p className="text-2xl font-bold text-gray-900">{summary?.totalProducts || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <p className="text-sm text-gray-500 mb-1">Total Stock Value</p>
          <p className="text-2xl font-bold text-gray-900">
            ${(summary?.totalValue || 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-yellow-200 bg-yellow-50">
          <p className="text-sm text-yellow-700 mb-1">Low Stock Items</p>
          <p className="text-2xl font-bold text-yellow-700">{summary?.lowStock || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-red-200 bg-red-50">
          <p className="text-sm text-red-700 mb-1">Out of Stock</p>
          <p className="text-2xl font-bold text-red-700">{summary?.outOfStock || 0}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product name, SKU..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>

        {/* Location Filter */}
        <div className="relative">
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="appearance-none pl-10 pr-10 py-2 border rounded-lg bg-white"
          >
            <option value="">All Locations</option>
            {locations?.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <BuildingStorefrontIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        {/* Stock Status Filter */}
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'All' },
            { value: 'low', label: 'Low Stock' },
            { value: 'out', label: 'Out of Stock' }
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStockFilter(filter.value)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                stockFilter === filter.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                In Stock
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reserved
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Available
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-32" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-12 mx-auto" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-12 mx-auto" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-12 mx-auto" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20 ml-auto" /></td>
                </tr>
              ))
            ) : filteredInventory?.length > 0 ? (
              filteredInventory.map((item) => (
                <tr key={`${item.id || item.variantId}-${item.locationId}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{item.productName || item.product?.name}</p>
                      {(item.variantName || item.variant?.name) && (
                        <p className="text-sm text-gray-500">{item.variantName || item.variant?.name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.sku || item.variant?.sku}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                      {item.locationName || item.location?.name}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-medium">{item.quantity || 0}</td>
                  <td className="px-6 py-4 text-center text-gray-500">{item.reserved || 0}</td>
                  <td className="px-6 py-4 text-center font-medium">
                    {(item.quantity || 0) - (item.reserved || 0)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      getStockStatusColor(item.quantity || 0, item.reorderLevel || 5)
                    }`}>
                      {(item.quantity || 0) <= 0 ? 'Out of Stock' :
                       (item.quantity || 0) <= (item.reorderLevel || 5) ? 'Low Stock' : 'In Stock'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleAdjust(item)}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
                        title="Adjust Stock"
                      >
                        <PlusIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleTransfer(item)}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
                        title="Transfer Stock"
                      >
                        <ArrowsRightLeftIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  <BuildingStorefrontIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No inventory items found</p>
                  <p className="text-sm">Add products and stock to get started</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Stock Adjustment Modal */}
      {showAdjustModal && selectedProduct && (
        <StockAdjustmentModal
          product={selectedProduct}
          onClose={() => {
            setShowAdjustModal(false);
            setSelectedProduct(null);
          }}
          onSave={() => {
            queryClient.invalidateQueries(['inventory']);
            queryClient.invalidateQueries(['inventory-summary']);
            setShowAdjustModal(false);
            setSelectedProduct(null);
          }}
        />
      )}

      {/* Stock Transfer Modal */}
      {showTransferModal && selectedProduct && (
        <StockTransferModal
          product={selectedProduct}
          locations={locations}
          onClose={() => {
            setShowTransferModal(false);
            setSelectedProduct(null);
          }}
          onSave={() => {
            queryClient.invalidateQueries(['inventory']);
            queryClient.invalidateQueries(['inventory-summary']);
            setShowTransferModal(false);
            setSelectedProduct(null);
          }}
        />
      )}
    </div>
  );
}

// Stock Adjustment Modal
function StockAdjustmentModal({ product, onClose, onSave }) {
  const [adjustmentType, setAdjustmentType] = useState('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!quantity || parseInt(quantity) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    setLoading(true);
    try {
      const adjustmentValue = adjustmentType === 'add' 
        ? parseInt(quantity) 
        : -parseInt(quantity);
      
      await api.post('/inventory/adjust', {
        variantId: product.variantId || product.variant?.id,
        locationId: product.locationId || product.location?.id || 1,
        adjustment: adjustmentValue,
        reason: reason || 'Stock adjustment'
      });
      toast.success('Stock adjusted successfully');
      onSave();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to adjust stock');
    } finally {
      setLoading(false);
    }
  };

  const currentQty = product.quantity || 0;
  const newQuantity = adjustmentType === 'add'
    ? currentQty + (parseInt(quantity) || 0)
    : currentQty - (parseInt(quantity) || 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Adjust Stock</h3>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="font-medium text-gray-900">{product.productName || product.product?.name}</p>
          {(product.variantName || product.variant?.name) && (
            <p className="text-sm text-gray-500">{product.variantName || product.variant?.name}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            Current Stock: <span className="font-medium">{product.quantity || 0}</span> at {product.locationName || product.location?.name}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Adjustment Type */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdjustmentType('add')}
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
                adjustmentType === 'add'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <PlusIcon className="w-5 h-5" />
              Add Stock
            </button>
            <button
              type="button"
              onClick={() => setAdjustmentType('remove')}
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
                adjustmentType === 'remove'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <MinusIcon className="w-5 h-5" />
              Remove Stock
            </button>
          </div>

          {/* Quantity */}
          <div>
            <label className="label">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              min="1"
              max={adjustmentType === 'remove' ? (product.quantity || 0) : undefined}
              className="input"
              required
            />
          </div>

          {/* Reason */}
          <div>
            <label className="label">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input"
              required
            >
              <option value="">Select reason</option>
              <option value="restock">Restock / Received</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost / Stolen</option>
              <option value="returned">Customer Return</option>
              <option value="correction">Inventory Correction</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* New Quantity Preview */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">New Stock Level:</span>
              <span className={`text-2xl font-bold ${
                newQuantity < 0 ? 'text-red-600' :
                newQuantity <= 10 ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {newQuantity}
              </span>
            </div>
            {newQuantity < 0 && (
              <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                <ExclamationTriangleIcon className="w-4 h-4" />
                Cannot reduce below 0
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || newQuantity < 0}
              className="flex-1 btn-primary"
            >
              {loading ? 'Adjusting...' : 'Confirm Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Stock Transfer Modal
function StockTransferModal({ product, locations, onClose, onSave }) {
  const [toLocation, setToLocation] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const currentLocationId = product.locationId || product.location?.id;
  const availableLocations = locations?.filter(l => (l.id || l.LocationID) !== currentLocationId) || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!quantity || parseInt(quantity) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    if (parseInt(quantity) > (product.quantity || 0)) {
      toast.error('Cannot transfer more than available stock');
      return;
    }

    setLoading(true);
    try {
      await api.post('/inventory/transfers', {
        fromLocationId: product.locationId || product.location?.id || 1,
        toLocationId: parseInt(toLocation),
        items: [{
          variantId: product.variantId || product.variant?.id,
          quantity: parseInt(quantity)
        }],
        notes
      });
      toast.success('Stock transferred successfully');
      onSave();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to transfer stock');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Transfer Stock</h3>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="font-medium text-gray-900">{product.productName || product.product?.name}</p>
          {(product.variantName || product.variant?.name) && (
            <p className="text-sm text-gray-500">{product.variantName || product.variant?.name}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded-full">
              From: {product.locationName || product.location?.name}
            </span>
            <span className="text-gray-500">→</span>
            <span className="text-sm text-gray-600">
              Available: {product.quantity || 0}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* To Location */}
          <div>
            <label className="label">Transfer To</label>
            <select
              value={toLocation}
              onChange={(e) => setToLocation(e.target.value)}
              className="input"
              required
            >
              <option value="">Select destination</option>
              {availableLocations.map((loc) => (
                <option key={loc.id || loc.LocationID} value={loc.id || loc.LocationID}>
                  {loc.name || loc.LocationName}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="label">Quantity to Transfer</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              min="1"
              max={product.quantity || 0}
              className="input"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add transfer notes..."
              rows={2}
              className="input resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || parseInt(quantity) > product.quantity}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
            >
              <ArrowsRightLeftIcon className="w-5 h-5" />
              {loading ? 'Transferring...' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
