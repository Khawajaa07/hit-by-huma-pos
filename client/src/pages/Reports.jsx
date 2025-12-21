import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CalendarIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';

export default function Reports() {
  const [dateRange, setDateRange] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Get date params
  const getDateParams = () => {
    const params = new URLSearchParams();
    if (dateRange === 'custom' && startDate && endDate) {
      params.append('startDate', startDate);
      params.append('endDate', endDate);
    } else {
      params.append('range', dateRange);
    }
    return params.toString();
  };

  // Fetch dashboard data (sales summary)
  const { data: dashboardData, isLoading: summaryLoading } = useQuery({
    queryKey: ['reports-dashboard', dateRange, startDate, endDate],
    queryFn: () => api.get(`/reports/dashboard?${getDateParams()}`).then(res => res.data)
  });

  // Normalize sales summary from dashboard data
  const salesSummary = dashboardData ? {
    totalSales: dashboardData.totalRevenue || dashboardData.today?.revenue || 0,
    totalTransactions: dashboardData.totalOrders || dashboardData.today?.transactions || 0,
    averageOrder: dashboardData.avgOrderValue || dashboardData.today?.avg_transaction || 0,
    customersServed: dashboardData.totalOrders || dashboardData.today?.transactions || 0,
    salesChange: dashboardData.today?.growthPercent || 0
  } : null;

  // Use topProducts from dashboard data instead of separate endpoint
  const topProducts = (dashboardData?.topProducts || []).map(p => ({
    name: p.name || p.product_name,
    quantity: p.quantity || p.sold || 0,
    revenue: p.revenue || 0
  }));

  // Fetch category breakdown
  const { data: categoryData } = useQuery({
    queryKey: ['category-breakdown', dateRange, startDate, endDate],
    queryFn: () => api.get(`/reports/category-breakdown?${getDateParams()}`).then(res => res.data)
  });

  // Normalize category breakdown - use data property from API response
  const categoryBreakdown = (categoryData?.data || categoryData || []).map(c => ({
    name: c.name || c.category_name || 'Uncategorized',
    sales: parseFloat(c.revenue) || parseFloat(c.sales) || 0,
    units: parseInt(c.units) || parseInt(c.units_sold) || 0
  }));

  // Fetch hourly sales
  const { data: hourlyData } = useQuery({
    queryKey: ['hourly-sales', dateRange, startDate, endDate],
    queryFn: () => api.get(`/reports/hourly-sales?${getDateParams()}`).then(res => res.data)
  });

  // Normalize hourly sales - use data property from API response
  const hourlySales = (hourlyData?.data || dashboardData?.hourlySales || []).map(h => ({
    hour: h.hour,
    orders: h.orders || h.transactions || 0,
    sales: parseFloat(h.sales) || parseFloat(h.revenue) || 0
  }));

  // Fetch employee performance
  const { data: employeeData } = useQuery({
    queryKey: ['employee-performance', dateRange, startDate, endDate],
    queryFn: () => api.get(`/reports/employee-performance?${getDateParams()}`).then(res => res.data)
  });

  // Normalize employee performance - use data property from API response
  const employeePerformance = (employeeData?.data || []).map(e => ({
    name: e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
    transactions: parseInt(e.transactions) || 0,
    sales: parseFloat(e.revenue) || parseFloat(e.sales) || 0,
    avgTransaction: e.transactions > 0 ? (parseFloat(e.revenue) || parseFloat(e.sales) || 0) / e.transactions : 0
  }));

  // Normalize payment breakdown from dashboard data
  const paymentMethods = (dashboardData?.paymentBreakdown || []).map(p => ({
    type: p.method_name || p.MethodName || p.method_type || 'Unknown',
    amount: parseFloat(p.total) || parseFloat(p.Total) || 0
  }));

  const handleExport = (type) => {
    const params = getDateParams();
    window.open(`${api.defaults.baseURL}/reports/export?${params}&format=${type}`, '_blank');
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500">Sales performance and business insights</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('pdf')}
            className="btn btn-secondary flex items-center gap-2"
          >
            <PrinterIcon className="w-5 h-5" />
            Print
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="btn btn-secondary flex items-center gap-2"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-gray-400" />
          <span className="text-gray-600">Date Range:</span>
        </div>
        <div className="flex gap-2">
          {[
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
            { value: 'week', label: 'This Week' },
            { value: 'month', label: 'This Month' },
            { value: 'year', label: 'This Year' },
            { value: 'custom', label: 'Custom' }
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setDateRange(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === option.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input input-sm"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input input-sm"
            />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Total Sales"
          value={`$${(salesSummary?.totalSales || 0).toLocaleString()}`}
          change={salesSummary?.salesChange}
          icon={CurrencyDollarIcon}
          loading={summaryLoading}
        />
        <SummaryCard
          title="Transactions"
          value={salesSummary?.totalTransactions || 0}
          change={salesSummary?.transactionsChange}
          icon={ShoppingCartIcon}
          loading={summaryLoading}
        />
        <SummaryCard
          title="Average Order"
          value={`$${(salesSummary?.averageOrder || 0).toFixed(2)}`}
          change={salesSummary?.avgOrderChange}
          icon={ChartBarIcon}
          loading={summaryLoading}
        />
        <SummaryCard
          title="Customers Served"
          value={salesSummary?.customersServed || 0}
          change={salesSummary?.customersChange}
          icon={UserGroupIcon}
          loading={summaryLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Hourly Sales Chart */}
        <div className="bg-white rounded-xl p-6 border">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-gray-500" />
            Sales by Hour
          </h3>
          <div className="h-64">
            {hourlySales?.length > 0 ? (
              <div className="flex items-end justify-between h-full gap-1">
                {hourlySales.map((hour, i) => {
                  const maxSales = Math.max(...hourlySales.map(h => h.sales));
                  const height = maxSales > 0 ? (hour.sales / maxSales) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-primary-500 rounded-t hover:bg-primary-600 transition-colors"
                        style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                        title={`${hour.hour}: $${hour.sales.toFixed(2)}`}
                      />
                      <span className="text-xs text-gray-500 mt-2">
                        {hour.hour}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-xl p-6 border">
          <h3 className="text-lg font-semibold mb-4">Sales by Category</h3>
          <div className="space-y-4">
            {categoryBreakdown?.length > 0 ? (
              categoryBreakdown.map((category, i) => {
                const totalSales = categoryBreakdown.reduce((sum, c) => sum + c.sales, 0);
                const percentage = totalSales > 0 ? (category.sales / totalSales) * 100 : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-700">{category.name}</span>
                      <span className="text-sm text-gray-500">
                        ${category.sales.toLocaleString()} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-500">No data available</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-white rounded-xl p-6 border">
          <h3 className="text-lg font-semibold mb-4">Top Selling Products</h3>
          <div className="space-y-3">
            {topProducts?.length > 0 ? (
              topProducts.map((product, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    i === 0 ? 'bg-yellow-400 text-yellow-900' :
                    i === 1 ? 'bg-gray-300 text-gray-700' :
                    i === 2 ? 'bg-amber-600 text-white' :
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{product.name}</p>
                    <p className="text-sm text-gray-500">{product.quantity} sold</p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    ${product.revenue.toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">No data available</div>
            )}
          </div>
        </div>

        {/* Employee Performance */}
        <div className="bg-white rounded-xl p-6 border">
          <h3 className="text-lg font-semibold mb-4">Employee Performance</h3>
          <div className="space-y-3">
            {employeePerformance?.length > 0 ? (
              employeePerformance.map((employee, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-primary-600">
                      {employee.name?.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{employee.name}</p>
                    <p className="text-sm text-gray-500">
                      {employee.transactions} transactions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      ${employee.sales.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Avg: ${employee.avgTransaction.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">No data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Methods Breakdown */}
      <div className="bg-white rounded-xl p-6 border mt-6">
        <h3 className="text-lg font-semibold mb-4">Payment Methods</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {paymentMethods?.length > 0 ? (
            paymentMethods.map((method, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-900">
                  ${parseFloat(method.amount || 0).toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 capitalize">{method.type}</p>
              </div>
            ))
          ) : (
            <div className="col-span-4 text-center py-8 text-gray-500">
              No payment data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({ title, value, change, icon: Icon, loading }) {
  const isPositive = change > 0;
  const isNegative = change < 0;

  return (
    <div className="bg-white rounded-xl p-6 border">
      {loading ? (
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
          <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-20" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">{title}</span>
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 mb-2">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-sm ${
              isPositive ? 'text-green-600' :
              isNegative ? 'text-red-600' : 'text-gray-500'
            }`}>
              {isPositive ? (
                <ArrowTrendingUpIcon className="w-4 h-4" />
              ) : isNegative ? (
                <ArrowTrendingDownIcon className="w-4 h-4" />
              ) : null}
              <span>
                {isPositive ? '+' : ''}{change?.toFixed(1)}% vs previous period
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
