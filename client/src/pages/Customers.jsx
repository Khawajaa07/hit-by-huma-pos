import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  XMarkIcon,
  WalletIcon,
  ShoppingBagIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  GiftIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

export default function Customers() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Check if user is salesman (can only add, not edit/delete)
  const isSalesman = user?.role?.toLowerCase() === 'salesman' || user?.isSalesman;

  // Fetch customers
  const { data: customersData, isLoading } = useQuery({
    queryKey: ['customers', searchQuery],
    queryFn: async () => {
      const params = searchQuery ? `?search=${searchQuery}` : '';
      const res = await api.get(`/customers${params}`);
      return res.data;
    }
  });

  // Extract and normalize customers array from response
  const customers = (customersData?.customers || []).map(c => ({
    customer_id: c.CustomerID,
    phone: c.Phone,
    first_name: c.FirstName,
    last_name: c.LastName,
    email: c.Email,
    customer_type: c.CustomerType,
    total_spent: c.TotalSpend,
    total_orders: c.TotalVisits,
    last_visit_at: c.LastVisitAt,
    wallet_balance: c.WalletBalance,
    loyalty_points: c.LoyaltyPoints,
    // Calculate days since last purchase
    last_purchase_days: c.LastVisitAt
      ? Math.floor((new Date() - new Date(c.LastVisitAt)) / (1000 * 60 * 60 * 24))
      : 999
  }));

  // Delete customer mutation
  const deleteMutation = useMutation({
    mutationFn: (customerId) => api.delete(`/customers/${customerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['customers']);
      toast.success('Customer deleted successfully');
    },
    onError: () => toast.error('Failed to delete customer')
  });

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setShowCustomerModal(true);
  };

  const handleViewDetails = (customer) => {
    setSelectedCustomer(customer);
    setShowDetailsModal(true);
  };

  const handleDelete = (customer) => {
    if (confirm(`Delete customer "${customer.first_name} ${customer.last_name}"?`)) {
      deleteMutation.mutate(customer.customer_id);
    }
  };

  const handleCloseModal = () => {
    setShowCustomerModal(false);
    setEditingCustomer(null);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500">Manage customer relationships and purchase history</p>
        </div>
        <button
          onClick={() => setShowCustomerModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Add Customer
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Customers</p>
              <p className="text-xl font-bold text-gray-900">{customers?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <ShoppingBagIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active This Month</p>
              <p className="text-xl font-bold text-gray-900">
                {customers?.filter(c => c.last_purchase_days <= 30).length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <WalletIcon className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Store Credit</p>
              <p className="text-xl font-bold text-gray-900">
                ${customers?.reduce((sum, c) => sum + (c.wallet_balance || 0), 0).toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <GiftIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Loyalty Points</p>
              <p className="text-xl font-bold text-gray-900">
                {customers?.reduce((sum, c) => sum + (c.loyalty_points || 0), 0).toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name, phone, or email..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
              <div className="h-3 bg-gray-200 rounded w-full mb-2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))
        ) : customers?.length > 0 ? (
          customers.map((customer) => (
            <div
              key={customer.customer_id}
              className="bg-white rounded-2xl p-6 border hover:shadow-xl transition-shadow cursor-pointer flex flex-col gap-4"
              onClick={() => handleViewDetails(customer)}
            >
              <div className="flex items-center gap-4 mb-2">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-primary-600">
                    {customer.first_name?.[0]}{customer.last_name?.[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-lg truncate">
                    {customer.first_name} {customer.last_name}
                  </h3>
                  <div className="flex items-center gap-2 text-base text-primary-700 font-medium mt-1">
                    <PhoneIcon className="w-5 h-5" />
                    <span>{customer.phone || <span className="text-gray-400">No phone</span>}</span>
                  </div>
                  {customer.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                      <EnvelopeIcon className="w-4 h-4" />
                      <span className="truncate">{customer.email}</span>
                    </div>
                  )}
                </div>
                {!isSalesman && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(customer);
                    }}
                    className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg self-start"
                    title="Edit customer"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t mt-2">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Total Spent</p>
                  <p className="font-semibold text-gray-900 text-lg">
                    ${parseFloat(customer.total_spent || 0).toLocaleString()}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Orders</p>
                  <p className="font-semibold text-gray-900 text-lg">{customer.total_orders || 0}</p>
                </div>
                <div className="text-center col-span-2">
                  <p className="text-xs text-gray-500">Credit</p>
                  <p className="font-semibold text-green-600 text-lg">
                    ${parseFloat(customer.wallet_balance || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-500">
            <UserIcon className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium">No customers found</p>
            <p className="text-sm">Add your first customer to get started</p>
          </div>
        )}
      </div>

      {/* Customer Modal */}
      {showCustomerModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={handleCloseModal}
          onSave={() => {
            queryClient.invalidateQueries(['customers']);
            handleCloseModal();
          }}
        />
      )}

      {/* Customer Details Modal */}
      {showDetailsModal && selectedCustomer && (
        <CustomerDetailsModal
          customerId={selectedCustomer.customer_id}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedCustomer(null);
          }}
        />
      )}
    </div>
  );
}

// Customer Modal Component
function CustomerModal({ customer, onClose, onSave }) {
  const [formData, setFormData] = useState({
    first_name: customer?.first_name || '',
    last_name: customer?.last_name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
    sms_opt_in: customer?.sms_opt_in ?? true
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.first_name || !formData.phone) {
      toast.error('Name and phone are required');
      return;
    }

    setLoading(true);
    try {
      // Convert to server format (camelCase)
      const payload = {
        firstName: formData.first_name,
        lastName: formData.last_name,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        notes: formData.notes,
        smsOptIn: formData.sms_opt_in
      };

      if (customer) {
        await api.put(`/customers/${customer.customer_id}`, payload);
        toast.success('Customer updated successfully');
      } else {
        await api.post('/customers', payload);
        toast.success('Customer created successfully');
      }
      onSave();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">
            {customer ? 'Edit Customer' : 'Add New Customer'}
          </h2>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="First name"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Last name"
                className="input"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="label">Phone Number *</label>
            <div className="relative">
              <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="input pl-10"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="label">Email</label>
            <div className="relative">
              <EnvelopeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@example.com"
                className="input pl-10"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="label">Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Street address"
              rows={2}
              className="input resize-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Customer notes, preferences..."
              rows={2}
              className="input resize-none"
            />
          </div>

          {/* SMS Opt-in */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <ChatBubbleLeftIcon className="w-5 h-5 text-gray-500" />
              <div>
                <p className="font-medium">SMS Notifications</p>
                <p className="text-sm text-gray-500">Receive order updates and promotions</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, sms_opt_in: !formData.sms_opt_in })}
              className={`relative w-12 h-6 rounded-full transition-colors ${formData.sms_opt_in ? 'bg-primary-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.sms_opt_in ? 'left-7' : 'left-1'
                  }`}
              />
            </button>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Saving...' : (customer ? 'Update Customer' : 'Create Customer')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Customer Details Modal
function CustomerDetailsModal({ customerId, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch customer details
  const { data: customerData, isLoading } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api.get(`/customers/${customerId}`).then(res => res.data)
  });

  // Normalize customer data from server (PascalCase to snake_case)
  const customer = customerData?.customer ? {
    customer_id: customerData.customer.CustomerID,
    phone: customerData.customer.Phone,
    first_name: customerData.customer.FirstName,
    last_name: customerData.customer.LastName,
    email: customerData.customer.Email,
    address: customerData.customer.Address,
    notes: customerData.customer.Notes,
    customer_type: customerData.customer.CustomerType,
    total_spent: customerData.customer.TotalSpend,
    total_orders: customerData.customer.TotalVisits,
    wallet_balance: customerData.customer.WalletBalance,
    loyalty_points: customerData.customer.LoyaltyPoints,
    sms_opt_in: customerData.customer.SMSOptIn,
    created_at: customerData.customer.CreatedAt
  } : null;

  // Normalize purchases from server
  const purchases = (customerData?.purchases || []).map(p => ({
    transaction_id: p.SaleID,
    transaction_number: p.SaleNumber,
    total_amount: p.TotalAmount,
    status: p.Status,
    created_at: p.CreatedAt,
    location_name: p.LocationName,
    item_count: p.ItemCount
  }));

  // Add/Remove wallet balance mutation
  const walletMutation = useMutation({
    mutationFn: (data) => api.post(`/customers/${customerId}/wallet`, data),
    onSuccess: () => {
      toast.success('Wallet updated');
    }
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8">
          <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-600">
                  {customer?.first_name?.[0]}{customer?.last_name?.[0]}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {customer?.first_name} {customer?.last_name}
                </h2>
                <p className="text-gray-500">{customer?.phone}</p>
                {customer?.email && (
                  <p className="text-sm text-gray-500">{customer?.email}</p>
                )}
              </div>
            </div>
            <button onClick={onClose}>
              <XMarkIcon className="w-6 h-6 text-gray-400" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">
                ${parseFloat(customer?.total_spent || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Total Spent</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{customer?.total_orders || 0}</p>
              <p className="text-xs text-gray-500">Orders</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                ${parseFloat(customer?.wallet_balance || 0).toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">Store Credit</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{customer?.loyalty_points || 0}</p>
              <p className="text-xs text-gray-500">Points</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {['overview', 'purchases', 'wallet'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium capitalize border-b-2 -mb-px ${activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {customer?.address && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Address</p>
                  <p className="text-gray-900">{customer.address}</p>
                </div>
              )}
              {customer?.notes && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Notes</p>
                  <p className="text-gray-900">{customer.notes}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500 mb-1">Customer Since</p>
                <p className="text-gray-900">
                  {new Date(customer?.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">SMS Notifications</p>
                <span className={`px-2 py-1 text-xs rounded-full ${customer?.sms_opt_in
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                  {customer?.sms_opt_in ? 'Opted In' : 'Opted Out'}
                </span>
              </div>
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="space-y-3">
              {purchases?.length > 0 ? (
                purchases.map((purchase) => (
                  <div key={purchase.transaction_id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">#{purchase.transaction_number}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(purchase.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        {purchase.item_count} items at {purchase.location_name}
                      </span>
                      <span className="font-semibold">
                        ${parseFloat(purchase.total_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingBagIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No purchases yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-4">
              <div className="p-6 bg-gradient-to-r from-primary-500 to-purple-600 rounded-xl text-white text-center">
                <p className="text-sm opacity-80 mb-1">Available Balance</p>
                <p className="text-4xl font-bold">
                  ${parseFloat(customer?.wallet_balance || 0).toFixed(2)}
                </p>
              </div>
              <p className="text-sm text-gray-500">
                Store credit can be applied at checkout. Credits are added from returns or promotional offers.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
