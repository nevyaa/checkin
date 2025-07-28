const Joi = require('joi');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// User validation schemas
const userRegistrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  first_name: Joi.string().min(2).max(100).required(),
  last_name: Joi.string().min(2).max(100).required(),
  phone: Joi.string().pattern(/^[\d\s\-\+\(\)]+$/).optional(),
  role: Joi.string().valid('owner', 'tenant').default('tenant')
});

const userLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Property validation schemas
const propertySchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  address: Joi.string().required(),
  city: Joi.string().min(2).max(100).required(),
  state: Joi.string().min(2).max(50).required(),
  zip_code: Joi.string().max(20).required(),
  property_type: Joi.string().required(),
  bedrooms: Joi.number().integer().min(0).optional(),
  bathrooms: Joi.number().min(0).optional(),
  square_feet: Joi.number().integer().min(0).optional(),
  purchase_price: Joi.number().min(0).optional(),
  purchase_date: Joi.date().optional(),
  description: Joi.string().optional()
});

// Tenant validation schemas
const tenantSchema = Joi.object({
  user_id: Joi.number().integer().required(),
  property_id: Joi.number().integer().required(),
  lease_start_date: Joi.date().required(),
  lease_end_date: Joi.date().required(),
  monthly_rent: Joi.number().min(0).required(),
  security_deposit: Joi.number().min(0).optional(),
  lease_type: Joi.string().valid('monthly', 'yearly').default('monthly')
});

// Transaction validation schemas
const transactionSchema = Joi.object({
  tenant_id: Joi.number().integer().required(),
  transaction_type: Joi.string().valid('rent', 'utility', 'deposit', 'fee').required(),
  amount: Joi.number().min(0).required(),
  due_date: Joi.date().optional(),
  paid_date: Joi.date().optional(),
  payment_method: Joi.string().optional(),
  description: Joi.string().optional()
});

// Expense validation schemas
const expenseSchema = Joi.object({
  property_id: Joi.number().integer().required(),
  category: Joi.string().min(2).max(100).required(),
  description: Joi.string().required(),
  amount: Joi.number().min(0).required(),
  expense_date: Joi.date().required(),
  vendor: Joi.string().optional(),
  is_recurring: Joi.boolean().default(false)
});

module.exports = {
  validateRequest,
  userRegistrationSchema,
  userLoginSchema,
  propertySchema,
  tenantSchema,
  transactionSchema,
  expenseSchema
};