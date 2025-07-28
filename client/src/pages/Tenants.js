import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api, endpoints } from '../services/api';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye, 
  Users,
  Mail,
  Phone,
  Calendar,
  MapPin,
  DollarSign,
  FileText,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

const Tenants = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    emergency_contact: '',
    emergency_phone: '',
    status: 'active'
  });

  const queryClient = useQueryClient();

  // Fetch tenants
  const { data: tenantsData, isLoading } = useQuery(
    ['tenants', searchTerm, statusFilter],
    () => api.get(`/tenants?search=${searchTerm}&status=${statusFilter}`),
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

  // Create/Update tenant mutation
  const tenantMutation = useMutation(
    (data) => {
      if (editingTenant) {
        return api.put(`/tenants/${editingTenant.id}`, data);
      }
      return api.post('/tenants', data);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('tenants');
        toast.success(editingTenant ? 'Tenant updated successfully!' : 'Tenant created successfully!');
        handleCloseModal();
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Operation failed');
      },
    }
  );

  // Delete tenant mutation
  const deleteMutation = useMutation(
    (id) => api.delete(`/tenants/${id}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('tenants');
        toast.success('Tenant deleted successfully!');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete tenant');
      },
    }
  );

  const tenants = tenantsData?.data?.tenants || [];
  const properties = propertiesData?.data?.properties || [];

  const handleSubmit = (e) => {
    e.preventDefault();
    tenantMutation.mutate(formData);
  };

  const handleEdit = (tenant) => {
    setEditingTenant(tenant);
    setFormData({
      first_name: tenant.first_name,
      last_name: tenant.last_name,
      email: tenant.email,
      phone: tenant.phone,
      date_of_birth: tenant.date_of_birth,
      emergency_contact: tenant.emergency_contact,
      emergency_phone: tenant.emergency_phone,
      status: tenant.status
    });
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this tenant?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTenant(null);
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      date_of_birth: '',
      emergency_contact: '',
      emergency_phone: '',
      status: 'active'
    });
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
      case 'active':
        return 'text-green-600 bg-green-100';
      case 'inactive':
        return 'text-red-600 bg-red-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getLeaseStatus = (lease) => {
    if (!lease) return { status: 'No Lease', color: 'text-gray-600 bg-gray-100' };
    
    const today = new Date();
    const endDate = new Date(lease.end_date);
    
    if (endDate < today) {
      return { status: 'Expired', color: 'text-red-600 bg-red-100' };
    } else if (endDate.getTime() - today.getTime() < 90 * 24 * 60 * 60 * 1000) {
      return { status: 'Expiring Soon', color: 'text-yellow-600 bg-yellow-100' };
    } else {
      return { status: 'Active', color: 'text-green-600 bg-green-100' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-gray-600">Manage your property tenants</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Tenant
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tenants Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="spinner"></div>
        </div>
      ) : tenants.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((tenant) => {
            const leaseStatus = getLeaseStatus(tenant.current_lease);
            return (
              <div key={tenant.id} className="card hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {tenant.first_name} {tenant.last_name}
                      </h3>
                      <p className="text-sm text-gray-600">{tenant.email}</p>
                    </div>
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(tenant.status)}`}>
                    {tenant.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="h-4 w-4 mr-2" />
                    <span>{tenant.phone || 'No phone'}</span>
                  </div>
                  
                  {tenant.current_lease && (
                    <>
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        <span>{tenant.current_lease.property?.name || 'Unknown Property'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          Lease: {formatDate(tenant.current_lease.start_date)} - {formatDate(tenant.current_lease.end_date)}
                        </span>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${leaseStatus.color}`}>
                          {leaseStatus.status}
                        </span>
                      </div>
                      <div className="flex items-center text-sm">
                        <DollarSign className="h-4 w-4 mr-1 text-green-600" />
                        <span className="font-medium text-green-600">
                          ${tenant.current_lease.monthly_rent}/month
                        </span>
                      </div>
                    </>
                  )}

                  {tenant.emergency_contact && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Emergency:</span> {tenant.emergency_contact}
                      {tenant.emergency_phone && ` (${tenant.emergency_phone})`}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-1" />
                    <span>Since {formatDate(tenant.created_at)}</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(tenant)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit tenant"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tenant.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete tenant"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tenants found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || statusFilter !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'Get started by adding your first tenant'
            }
          </p>
          {!searchTerm && statusFilter === 'all' && (
            <button
              onClick={() => setShowModal(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Tenant
            </button>
          )}
        </div>
      )}

      {/* Tenant Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {editingTenant ? 'Edit Tenant' : 'Add New Tenant'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.first_name}
                      onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                      className="input"
                      placeholder="Enter first name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.last_name}
                      onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                      className="input"
                      placeholder="Enter last name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="input"
                      placeholder="Enter email address"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="input"
                      placeholder="Enter phone number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
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
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Emergency Contact
                    </label>
                    <input
                      type="text"
                      value={formData.emergency_contact}
                      onChange={(e) => setFormData({...formData, emergency_contact: e.target.value})}
                      className="input"
                      placeholder="Emergency contact name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Emergency Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.emergency_phone}
                      onChange={(e) => setFormData({...formData, emergency_phone: e.target.value})}
                      className="input"
                      placeholder="Emergency contact phone"
                    />
                  </div>
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
                    disabled={tenantMutation.isLoading}
                    className="btn btn-primary"
                  >
                    {tenantMutation.isLoading ? (
                      <div className="spinner mr-2"></div>
                    ) : null}
                    {editingTenant ? 'Update Tenant' : 'Create Tenant'}
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

export default Tenants;