import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api, endpoints } from '../services/api';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  DollarSign,
  Calendar,
  Users,
  Building2,
  CheckCircle,
  AlertCircle,
  Clock,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';

const Payments = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState({
    tenant_id: '',
    property_id: '',
    type: 'rent',
    amount: '',
    due_date: '',
    description: '',
    status: 'pending'
  });

  const queryClient = useQueryClient();

  // Fetch payments
  const { data: paymentsData, isLoading } = useQuery(
    ['payments', searchTerm, statusFilter, typeFilter, dateRange],
    () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (dateRange.start) params.append('start_date', dateRange.start);
      if (dateRange.end) params.append('end_date', dateRange.end);
      return api.get(`/payments?${params.toString()}`);
    },
    {
      refetchOnWindowFocus: false,
    }
  );

  // Fetch tenants for dropdown
  const { data: tenantsData } = useQuery(
    ['tenants'],
    () => api.get('/tenants?status=active'),
    {
      refetchOnWindowFocus: false,
    }
  );

  // Fetch properties for dropdown
  const { data: propertiesData } = useQuery(
    ['properties'],
    () => api.get('/properties?status=active'),
    {
      refetchOnWindowFocus: false,
    }
  );

  // Create/Update payment mutation
  const paymentMutation = useMutation(
    (data) => {
      if (editingPayment) {
        return api.put(`/payments/${editingPayment.id}`, data);
      }
      return api.post('/payments', data);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('payments');
        toast.success(editingPayment ? 'Payment updated successfully!' : 'Payment created successfully!');
        handleCloseModal();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Operation failed');
      },
    }
  );

  // Mark payment as paid mutation
  const markPaidMutation = useMutation(
    (id) => api.put(`/payments/${id}/mark-paid`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('payments');
        toast.success('Payment marked as paid!');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to mark payment as paid');
      },
    }
  );

  // Delete payment mutation
  const deleteMutation = useMutation(
    (id) => api.delete(`/payments/${id}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('payments');
        toast.success('Payment deleted successfully!');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete payment');
      },
    }
  );

  const payments = paymentsData?.data?.payments || [];
  const tenants = tenantsData?.data?.tenants || [];
  const properties = propertiesData?.data?.properties || [];

  const handleSubmit = (e) => {
    e.preventDefault();
    paymentMutation.mutate(formData);
  };

  const handleEdit = (payment) => {
    setEditingPayment(payment);
    setFormData({
      tenant_id: payment.tenant_id,
      property_id: payment.property_id,
      type: payment.type,
      amount: payment.amount,
      due_date: payment.due_date.split('T')[0],
      description: payment.description,
      status: payment.status
    });
    setShowModal(true);
  };

  const handleMarkPaid = (id) => {
    markPaidMutation.mutate(id);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this payment?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPayment(null);
    setFormData({
      tenant_id: '',
      property_id: '',
      type: 'rent',
      amount: '',
      due_date: '',
      description: '',
      status: 'pending'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
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

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'overdue':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'rent':
        return <Building2 className="h-4 w-4" />;
      case 'utility':
        return <FileText className="h-4 w-4" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600">Manage rent and utility payments</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Payment
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search payments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input"
            >
              <option value="all">All Types</option>
              <option value="rent">Rent</option>
              <option value="utility">Utility</option>
            </select>
          </div>
          <div>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="input"
              placeholder="Start date"
            />
          </div>
        </div>
      </div>

      {/* Payments Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="spinner"></div>
        </div>
      ) : payments.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getTypeIcon(payment.type)}
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900 capitalize">
                            {payment.type} Payment
                          </div>
                          {payment.description && (
                            <div className="text-sm text-gray-500">
                              {payment.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.tenant?.first_name} {payment.tenant?.last_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {payment.tenant?.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.property?.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {payment.property?.address}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(payment.amount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(payment.due_date)}
                      </div>
                      {isOverdue(payment.due_date) && payment.status !== 'paid' && (
                        <div className="text-xs text-red-600">
                          Overdue
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(payment.status)}
                        <span className={`ml-2 inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(payment.status)}`}>
                          {payment.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {payment.status !== 'paid' && (
                          <button
                            onClick={() => handleMarkPaid(payment.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Mark as paid"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(payment)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit payment"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(payment.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete payment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No payments found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' || dateRange.start || dateRange.end
              ? 'Try adjusting your search or filters'
              : 'Get started by adding your first payment'
            }
          </p>
          {!searchTerm && statusFilter === 'all' && typeFilter === 'all' && !dateRange.start && !dateRange.end && (
            <button
              onClick={() => setShowModal(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Payment
            </button>
          )}
        </div>
      )}

      {/* Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {editingPayment ? 'Edit Payment' : 'Add New Payment'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tenant *
                    </label>
                    <select
                      required
                      value={formData.tenant_id}
                      onChange={(e) => setFormData({...formData, tenant_id: e.target.value})}
                      className="input"
                    >
                      <option value="">Select tenant</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.first_name} {tenant.last_name} ({tenant.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Property *
                    </label>
                    <select
                      required
                      value={formData.property_id}
                      onChange={(e) => setFormData({...formData, property_id: e.target.value})}
                      className="input"
                    >
                      <option value="">Select property</option>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name} - {property.address}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Type *
                    </label>
                    <select
                      required
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                      className="input"
                    >
                      <option value="rent">Rent</option>
                      <option value="utility">Utility</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      className="input"
                      placeholder="Enter amount"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.due_date}
                      onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status *
                    </label>
                    <select
                      required
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="input"
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows="3"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="input"
                    placeholder="Payment description..."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={paymentMutation.isLoading}
                    className="btn btn-primary"
                  >
                    {paymentMutation.isLoading ? (
                      <div className="spinner mr-2"></div>
                    ) : null}
                    {editingPayment ? 'Update Payment' : 'Create Payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;