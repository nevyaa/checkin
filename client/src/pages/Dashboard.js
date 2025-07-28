import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useAuth } from '../contexts/AuthContext';
import { api, endpoints } from '../services/api';
import { 
  Building2, 
  Users, 
  FileText, 
  DollarSign, 
  TrendingUp, 
  AlertCircle,
  Calendar,
  Home,
  CreditCard,
  Receipt
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const Dashboard = () => {
  const { user, isOwner, isTenant } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  // Fetch dashboard data
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery(
    ['dashboard', selectedPeriod],
    () => api.get(`/reports/dashboard?period=${selectedPeriod}`),
    {
      enabled: !!user,
      refetchInterval: 300000, // Refetch every 5 minutes
    }
  );

  // Fetch recent payments
  const { data: recentPayments, isLoading: paymentsLoading } = useQuery(
    ['recent-payments'],
    () => api.get('/payments?limit=5&sort=due_date'),
    {
      enabled: !!user,
    }
  );

  // Fetch recent notifications
  const { data: notifications, isLoading: notificationsLoading } = useQuery(
    ['notifications'],
    () => api.get('/notifications?limit=5'),
    {
      enabled: !!user,
    }
  );

  // Fetch overdue payments
  const { data: overduePayments, isLoading: overdueLoading } = useQuery(
    ['overdue-payments'],
    () => api.get('/payments/overdue'),
    {
      enabled: !!user,
    }
  );

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'text-green-600 bg-green-100';
      case 'overdue':
        return 'text-red-600 bg-red-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getPaymentTypeIcon = (type) => {
    switch (type) {
      case 'rent':
        return <Home className="h-4 w-4" />;
      case 'utility':
        return <Receipt className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  const data = dashboardData?.data || {};
  const recentPaymentsList = recentPayments?.data?.payments || [];
  const notificationsList = notifications?.data?.notifications || [];
  const overdueList = overduePayments?.data?.payments || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.first_name}!
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your {isOwner ? 'properties' : 'rental'} today.
          </p>
        </div>
        <div className="flex space-x-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="input"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Income</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(data.totalIncome)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Net Profit</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(data.netProfit)}
              </p>
            </div>
          </div>
        </div>

        {isOwner && (
          <>
            <div className="card">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Building2 className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Properties</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.activeProperties || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Users className="h-6 w-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Tenants</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.activeTenants || 0}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {isTenant && (
          <>
            <div className="card">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FileText className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Leases</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.activeLeases || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <AlertCircle className="h-6 w-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Overdue Payments</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {overdueList.length}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Charts and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Income Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.incomeData || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Line type="monotone" dataKey="income" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Payments */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Payments</h3>
          <div className="space-y-3">
            {paymentsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="spinner"></div>
              </div>
            ) : recentPaymentsList.length > 0 ? (
              recentPaymentsList.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getPaymentTypeIcon(payment.type)}
                    <div>
                      <p className="font-medium text-gray-900">
                        {payment.type === 'rent' ? 'Rent' : 'Utility'} Payment
                      </p>
                      <p className="text-sm text-gray-600">
                        Due: {formatDate(payment.due_date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {formatCurrency(payment.amount)}
                    </p>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(payment.status)}`}>
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">No recent payments</p>
            )}
          </div>
        </div>
      </div>

      {/* Overdue Payments Alert */}
      {overdueList.length > 0 && (
        <div className="card border-l-4 border-red-500">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Overdue Payments ({overdueList.length})
              </h3>
              <p className="text-gray-600">
                You have {overdueList.length} overdue payment{overdueList.length > 1 ? 's' : ''} that require attention.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {overdueList.slice(0, 3).map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                <div>
                  <p className="font-medium text-gray-900">
                    {payment.type === 'rent' ? 'Rent' : 'Utility'} Payment
                  </p>
                  <p className="text-sm text-gray-600">
                    Due: {formatDate(payment.due_date)}
                  </p>
                </div>
                <p className="font-medium text-red-600">
                  {formatCurrency(payment.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Notifications */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Notifications</h3>
        <div className="space-y-3">
          {notificationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="spinner"></div>
            </div>
          ) : notificationsList.length > 0 ? (
            notificationsList.map((notification) => (
              <div key={notification.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="p-1 bg-blue-100 rounded">
                  <Calendar className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{notification.title}</p>
                  <p className="text-sm text-gray-600">{notification.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(notification.created_at)}
                  </p>
                </div>
                {!notification.read && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-8">No recent notifications</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;