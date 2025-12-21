import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CurrencyDollarIcon,
  ShoppingCartIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  CalendarIcon,
  ClockIcon,
  CubeIcon,
  ReceiptPercentIcon,
  BanknotesIcon,
  CreditCardIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  FireIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';

export default function Dashboard() {
  const [dateRange, setDateRange] = useState('today');
  const [comparisonPeriod, setComparisonPeriod] = useState('previous');

  // Get date params
  const getDateParams = () => {
    const params = new URLSearchParams();
    params.append('range', dateRange);
    params.append('compare', comparisonPeriod);
    return params.toString();
  };

  // Fetch dashboard data
  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', dateRange, comparisonPeriod],
    queryFn: () => api.get(`/reports/dashboard?${getDateParams()}`).then(res => res.data),
    refetchInterval: 60000 // Auto refresh every minute
  });

  // Fetch real-time metrics
  const { data: realtimeData } = useQuery({
    queryKey: ['realtime-metrics'],
    queryFn: () => api.get('/reports/realtime').then(res => res.data),
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Use top products from dashboard data
  const topProducts = dashboardData?.topProducts || [];

  // Fetch sales by hour
  const { data: hourlyData } = useQuery({
    queryKey: ['hourly-sales-dashboard', dateRange],
    queryFn: () => api.get(`/reports/hourly-sales?${getDateParams()}`).then(res => res.data)
  });

  // Fetch category performance
  const { data: categoryData } = useQuery({
    queryKey: ['category-performance', dateRange],
    queryFn: () => api.get(`/reports/category-breakdown?${getDateParams()}`).then(res => res.data)
  });

  // Fetch recent transactions
  const { data: recentTransactionsData } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: () => api.get('/sales?limit=10').then(res => res.data)
  });

  // Extract sales array from response
  const recentTransactions = recentTransactionsData?.sales || [];

  // Fetch inventory alerts
  const { data: inventoryAlerts } = useQuery({
    queryKey: ['inventory-alerts'],
    queryFn: () => api.get('/inventory/alerts').then(res => res.data)
  });

  // Fetch employee leaderboard
  const { data: employeeData } = useQuery({
    queryKey: ['employee-leaderboard', dateRange],
    queryFn: () => api.get(`/reports/employee-performance?${getDateParams()}&limit=5`).then(res => res.data)
  });

  // Map server response to expected stats format
  // Backend returns both flattened summary (totalRevenue, totalOrders, etc.) 
  // and nested today object - use flattened first, fall back to nested
  const today = dashboardData?.today || {};
  const paymentBreakdown = dashboardData?.paymentBreakdown || [];

  // Calculate cash and card sales from payment breakdown (lowercase for PostgreSQL)
  const cashSales = dashboardData?.cashSales || paymentBreakdown
    .filter(p => (p.method_type || p.MethodType || '').toLowerCase() === 'cash')
    .reduce((sum, p) => sum + parseFloat(p.total || p.Total || 0), 0);
  const cardSales = dashboardData?.cardSales || paymentBreakdown
    .filter(p => (p.method_type || p.MethodType || '').toLowerCase().includes('card'))
    .reduce((sum, p) => sum + parseFloat(p.total || p.Total || 0), 0);

  const stats = {
    // Use flattened summary first (from backend), then try nested today object
    totalRevenue: parseFloat(dashboardData?.totalRevenue) || parseFloat(today.revenue) || parseFloat(today.TotalSales) || 0,
    totalOrders: parseInt(dashboardData?.totalOrders) || parseInt(today.transactions) || parseInt(today.TransactionCount) || 0,
    avgOrderValue: parseFloat(dashboardData?.avgOrderValue) || parseFloat(today.avg_transaction) || parseFloat(today.AverageTransaction) || 0,
    customersServed: parseInt(dashboardData?.totalOrders) || parseInt(today.transactions) || parseInt(today.TransactionCount) || 0,
    revenueChange: parseFloat(today.growthPercent) || 0,
    ordersChange: parseFloat(today.growthPercent) || 0,
    avgOrderChange: 0,
    customersChange: 0,
    totalDiscounts: parseFloat(dashboardData?.totalDiscounts) || parseFloat(today.discounts) || parseFloat(today.TotalDiscounts) || 0,
    cashSales,
    cardSales,
    itemsSold: parseInt(dashboardData?.itemsSold) || parseInt(today.itemsSold) || parseInt(today.ItemsSold) || 0,
    returns: 0,
    avgItemsPerOrder: dashboardData?.totalOrders > 0
      ? ((dashboardData?.itemsSold || 0) / dashboardData.totalOrders).toFixed(1)
      : 0
  };

  const realtime = realtimeData || {};

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Welcome back! Here's your business overview.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex bg-white rounded-lg border p-1">
            {[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'year', label: 'This Year' }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setDateRange(option.value)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${dateRange === option.value
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => refetch()}
            className="p-2 bg-white border rounded-lg hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Real-time Indicator */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span>Live updates • Last updated: {new Date().toLocaleTimeString()}</span>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Revenue"
          value={`$${(stats.totalRevenue || 0).toLocaleString()}`}
          change={stats.revenueChange}
          icon={CurrencyDollarIcon}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          loading={isLoading}
        />
        <MetricCard
          title="Total Orders"
          value={stats.totalOrders || 0}
          change={stats.ordersChange}
          icon={ShoppingCartIcon}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          loading={isLoading}
        />
        <MetricCard
          title="Average Order Value"
          value={`$${(stats.avgOrderValue || 0).toFixed(2)}`}
          change={stats.avgOrderChange}
          icon={ChartBarIcon}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          loading={isLoading}
        />
        <MetricCard
          title="Customers Served"
          value={stats.customersServed || 0}
          change={stats.customersChange}
          icon={UserGroupIcon}
          iconBg="bg-orange-100"
          iconColor="text-orange-600"
          loading={isLoading}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MiniMetricCard
          label="Items Sold"
          value={stats.itemsSold || 0}
          icon={CubeIcon}
        />
        <MiniMetricCard
          label="Discounts Given"
          value={`$${(stats.totalDiscounts || 0).toFixed(2)}`}
          icon={ReceiptPercentIcon}
        />
        <MiniMetricCard
          label="Cash Sales"
          value={`$${(stats.cashSales || 0).toLocaleString()}`}
          icon={BanknotesIcon}
        />
        <MiniMetricCard
          label="Card Sales"
          value={`$${(stats.cardSales || 0).toLocaleString()}`}
          icon={CreditCardIcon}
        />
        <MiniMetricCard
          label="Returns"
          value={stats.returns || 0}
          icon={ArrowPathIcon}
        />
        <MiniMetricCard
          label="Avg Items/Order"
          value={(stats.avgItemsPerOrder || 0).toFixed(1)}
          icon={ShoppingCartIcon}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend Chart */}
        <div className="bg-white rounded-xl p-6 border shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sales Trend</h3>
              <p className="text-sm text-gray-500">Hourly breakdown</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary-500 rounded-full" />
                <span className="text-gray-600">Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-400 rounded-full" />
                <span className="text-gray-600">Orders</span>
              </div>
            </div>
          </div>

          <div className="h-64">
            {(hourlyData?.data || hourlyData)?.length > 0 ? (
              <div className="flex items-end justify-between h-full gap-1 pt-4">
                {(hourlyData?.data || hourlyData).map((hour, i) => {
                  const hourlyArr = hourlyData?.data || hourlyData || [];
                  const maxSales = Math.max(...hourlyArr.map(h => parseFloat(h.sales || h.revenue) || 0));
                  const sales = parseFloat(hour.sales || hour.revenue) || 0;
                  const height = maxSales > 0 ? (sales / maxSales) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        <p>${sales.toFixed(2)}</p>
                        <p>{hour.orders || hour.transactions || 0} orders</p>
                      </div>
                      <div
                        className="w-full bg-gradient-to-t from-primary-600 to-primary-400 rounded-t hover:from-primary-700 hover:to-primary-500 transition-all cursor-pointer"
                        style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                      />
                      <span className="text-xs text-gray-500 mt-2 transform -rotate-45 origin-top-left">
                        {hour.hour}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <ChartBarIcon className="w-12 h-12 mx-auto mb-2" />
                  <p>No sales data available</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Category Performance */}
        <div className="bg-white rounded-xl p-6 border shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Category Performance</h3>
              <p className="text-sm text-gray-500">Sales by category</p>
            </div>
          </div>

          <div className="space-y-4">
            {(categoryData?.data || categoryData)?.length > 0 ? (
              (categoryData?.data || categoryData).slice(0, 6).map((category, i) => {
                const catArr = categoryData?.data || categoryData || [];
                const totalSales = catArr.reduce((sum, c) => sum + (parseFloat(c.sales || c.revenue) || 0), 0);
                const sales = parseFloat(category.sales || category.revenue) || 0;
                const percentage = totalSales > 0 ? (sales / totalSales) * 100 : 0;
                const colors = [
                  'bg-primary-500', 'bg-blue-500', 'bg-green-500',
                  'bg-yellow-500', 'bg-purple-500', 'bg-pink-500'
                ];
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-700">{category.name || category.category_name || category.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">
                          ${sales.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400">
                <p>No category data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Three Column Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Selling Products */}
        <div className="bg-white rounded-xl p-6 border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FireIcon className="w-5 h-5 text-orange-500" />
              Top Products
            </h3>
          </div>

          <div className="space-y-3">
            {topProducts?.length > 0 ? (
              topProducts.map((product, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-yellow-400 text-yellow-900' :
                    i === 1 ? 'bg-gray-300 text-gray-700' :
                      i === 2 ? 'bg-amber-600 text-white' :
                        'bg-gray-200 text-gray-600'
                    }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {product.name || product.ProductName || product.product_name}{(product.variant || product.VariantName || product.variant_name) ? ` - ${product.variant || product.VariantName || product.variant_name}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">{parseInt(product.quantity || product.QuantitySold || product.sold) || 0} sold</p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    ${(parseFloat(product.revenue || product.Revenue) || 0).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-400">
                <CubeIcon className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">No products data</p>
              </div>
            )}
          </div>
        </div>

        {/* Employee Leaderboard */}
        <div className="bg-white rounded-xl p-6 border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-purple-500" />
              Top Performers
            </h3>
          </div>

          <div className="space-y-3">
            {(employeeData?.data || employeeData)?.length > 0 ? (
              (employeeData?.data || employeeData).map((employee, i) => {
                const empName = employee.name || `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || 'Unknown';
                const initials = empName.split(' ').filter(n => n.length > 0).map(n => n[0]).join('').substring(0, 2) || '?';
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {initials}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{empName}</p>
                      <p className="text-xs text-gray-500">{parseInt(employee.transactions) || 0} sales</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        ${(parseFloat(employee.sales || employee.revenue) || 0).toLocaleString()}
                      </p>
                      {i === 0 && (
                        <span className="text-xs text-yellow-600">🏆 Top</span>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8 text-gray-400">
                <UserGroupIcon className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">No employee data</p>
              </div>
            )}
          </div>
        </div>

        {/* Inventory Alerts */}
        <div className="bg-white rounded-xl p-6 border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
              Inventory Alerts
            </h3>
            {inventoryAlerts?.length > 0 && (
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                {inventoryAlerts.length} items
              </span>
            )}
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {inventoryAlerts?.length > 0 ? (
              inventoryAlerts.slice(0, 5).map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg ${item.quantity <= 0 ? 'bg-red-50' : 'bg-yellow-50'
                    }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.quantity <= 0 ? 'bg-red-100' : 'bg-yellow-100'
                    }`}>
                    {item.quantity <= 0 ? (
                      <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
                    ) : (
                      <CubeIcon className="w-5 h-5 text-yellow-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.name}</p>
                    <p className={`text-xs ${item.quantity <= 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                      {item.quantity <= 0 ? 'Out of stock' : `Only ${item.quantity} left`}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-400">
                <CheckCircleIcon className="w-10 h-10 mx-auto mb-2 text-green-400" />
                <p className="text-sm text-green-600">All stocked up!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
            <a href="/reports" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View All →
            </a>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Transaction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Payment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Time
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentTransactions?.length > 0 ? (
                recentTransactions.slice(0, 8).map((tx, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">
                        #{tx.SaleNumber || tx.sale_number || tx.SaleID || tx.sale_id}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {(tx.CustomerFirstName || tx.customer_first_name) ? `${tx.CustomerFirstName || tx.customer_first_name} ${tx.CustomerLastName || tx.customer_last_name || ''}`.trim() : 'Walk-in'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      -
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${(tx.Status || tx.status) === 'completed' || (tx.Status || tx.status) === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        (tx.Status || tx.status) === 'voided' || (tx.Status || tx.status) === 'VOIDED' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                        {tx.Status || tx.status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm">
                      {(tx.CreatedAt || tx.created_at) ? new Date(tx.CreatedAt || tx.created_at).toLocaleTimeString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">
                      ${(parseFloat(tx.TotalAmount || tx.total_amount) || 0).toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <ShoppingCartIcon className="w-10 h-10 mx-auto mb-2" />
                    <p>No recent transactions</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickStatCard
          label="Peak Hour"
          value={stats.peakHour || '-'}
          sublabel="Most sales"
          icon={ClockIcon}
        />
        <QuickStatCard
          label="Conversion Rate"
          value={`${(stats.conversionRate || 0).toFixed(1)}%`}
          sublabel="Viewed → Purchased"
          icon={ArrowTrendingUpIcon}
        />
        <QuickStatCard
          label="Gross Profit"
          value={`$${(stats.grossProfit || 0).toLocaleString()}`}
          sublabel="Revenue - Cost"
          icon={CurrencyDollarIcon}
        />
        <QuickStatCard
          label="Profit Margin"
          value={`${(stats.profitMargin || 0).toFixed(1)}%`}
          sublabel="Overall margin"
          icon={ChartBarIcon}
        />
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({ title, value, change, icon: Icon, iconBg, iconColor, loading }) {
  const isPositive = change > 0;
  const isNegative = change < 0;

  return (
    <div className="bg-white rounded-xl p-6 border shadow-sm hover:shadow-md transition-shadow">
      {loading ? (
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
          <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-20" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">{title}</span>
            <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center`}>
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 mb-2">{value}</p>
          {change !== undefined && change !== null && (
            <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-600' :
              isNegative ? 'text-red-600' : 'text-gray-500'
              }`}>
              {isPositive ? (
                <ArrowTrendingUpIcon className="w-4 h-4" />
              ) : isNegative ? (
                <ArrowTrendingDownIcon className="w-4 h-4" />
              ) : null}
              <span>
                {isPositive ? '+' : ''}{change?.toFixed(1)}% vs last period
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Mini Metric Card
function MiniMetricCard({ label, value, icon: Icon }) {
  return (
    <div className="bg-white rounded-lg p-4 border hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

// Quick Stat Card
function QuickStatCard({ label, value, sublabel, icon: Icon }) {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 text-white">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-300">{label}</span>
        <Icon className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-gray-400">{sublabel}</p>
    </div>
  );
}
