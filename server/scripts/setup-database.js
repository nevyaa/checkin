const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
  try {
    console.log('Setting up database...');

    // Create sample owner user
    const ownerPassword = await bcrypt.hash('owner123', 12);
    const ownerResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      ['owner@example.com', ownerPassword, 'John', 'Doe', 'owner', '+1234567890']
    );

    let ownerId;
    if (ownerResult.rows.length > 0) {
      ownerId = ownerResult.rows[0].id;
      console.log('Created owner user');
    } else {
      const existingOwner = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        ['owner@example.com']
      );
      ownerId = existingOwner.rows[0].id;
      console.log('Owner user already exists');
    }

    // Create sample tenant user
    const tenantPassword = await bcrypt.hash('tenant123', 12);
    const tenantResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      ['tenant@example.com', tenantPassword, 'Jane', 'Smith', 'tenant', '+0987654321']
    );

    let tenantUserId;
    if (tenantResult.rows.length > 0) {
      tenantUserId = tenantResult.rows[0].id;
      console.log('Created tenant user');
    } else {
      const existingTenant = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        ['tenant@example.com']
      );
      tenantUserId = existingTenant.rows[0].id;
      console.log('Tenant user already exists');
    }

    // Create sample properties
    const properties = [
      {
        name: 'Sunset Apartments - Unit 101',
        address: '123 Main St, Apt 101, City, State 12345',
        property_type: 'Apartment',
        bedrooms: 2,
        bathrooms: 1,
        square_feet: 850,
        purchase_price: 150000,
        purchase_date: '2020-01-15',
        status: 'active'
      },
      {
        name: 'Downtown Condo - Unit 205',
        address: '456 Oak Ave, Unit 205, City, State 12345',
        property_type: 'Condo',
        bedrooms: 1,
        bathrooms: 1,
        square_feet: 650,
        purchase_price: 120000,
        purchase_date: '2019-06-20',
        status: 'active'
      }
    ];

    const propertyIds = [];
    for (const property of properties) {
      const propertyResult = await pool.query(
        `INSERT INTO properties (
          name, address, property_type, bedrooms, bathrooms, 
          square_feet, purchase_price, purchase_date, status, owner_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING
        RETURNING id`,
        [
          property.name, property.address, property.property_type,
          property.bedrooms, property.bathrooms, property.square_feet,
          property.purchase_price, property.purchase_date, property.status, ownerId
        ]
      );

      if (propertyResult.rows.length > 0) {
        propertyIds.push(propertyResult.rows[0].id);
        console.log(`Created property: ${property.name}`);
      } else {
        const existingProperty = await pool.query(
          'SELECT id FROM properties WHERE name = $1',
          [property.name]
        );
        propertyIds.push(existingProperty.rows[0].id);
        console.log(`Property already exists: ${property.name}`);
      }
    }

    // Create sample tenant
    const tenantResult2 = await pool.query(
      `INSERT INTO tenants (
        first_name, last_name, email, phone, emergency_contact, emergency_phone, status, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email) DO NOTHING
      RETURNING id`,
      [
        'Jane', 'Smith', 'tenant@example.com', '+0987654321',
        'Emergency Contact', '+1111111111', 'active', tenantUserId
      ]
    );

    let tenantId;
    if (tenantResult2.rows.length > 0) {
      tenantId = tenantResult2.rows[0].id;
      console.log('Created tenant record');
    } else {
      const existingTenant = await pool.query(
        'SELECT id FROM tenants WHERE email = $1',
        ['tenant@example.com']
      );
      tenantId = existingTenant.rows[0].id;
      console.log('Tenant record already exists');
    }

    // Create sample lease
    const leaseResult = await pool.query(
      `INSERT INTO leases (
        property_id, tenant_id, start_date, end_date, 
        monthly_rent, security_deposit, late_fee, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
      RETURNING id`,
      [
        propertyIds[0], tenantId, '2024-01-01', '2024-12-31',
        1200, 1200, 50, 'active'
      ]
    );

    let leaseId;
    if (leaseResult.rows.length > 0) {
      leaseId = leaseResult.rows[0].id;
      console.log('Created lease');
    } else {
      const existingLease = await pool.query(
        'SELECT id FROM leases WHERE property_id = $1 AND tenant_id = $2',
        [propertyIds[0], tenantId]
      );
      leaseId = existingLease.rows[0].id;
      console.log('Lease already exists');
    }

    // Create sample payments
    const payments = [
      {
        lease_id: leaseId,
        tenant_id: tenantId,
        property_id: propertyIds[0],
        payment_type: 'rent',
        amount: 1200,
        due_date: '2024-01-01',
        status: 'paid',
        paid_date: '2024-01-01',
        description: 'Rent for January 2024'
      },
      {
        lease_id: leaseId,
        tenant_id: tenantId,
        property_id: propertyIds[0],
        payment_type: 'rent',
        amount: 1200,
        due_date: '2024-02-01',
        status: 'paid',
        paid_date: '2024-02-01',
        description: 'Rent for February 2024'
      },
      {
        lease_id: leaseId,
        tenant_id: tenantId,
        property_id: propertyIds[0],
        payment_type: 'rent',
        amount: 1200,
        due_date: '2024-03-01',
        status: 'pending',
        description: 'Rent for March 2024'
      }
    ];

    for (const payment of payments) {
      await pool.query(
        `INSERT INTO payments (
          lease_id, tenant_id, property_id, payment_type, 
          amount, due_date, status, paid_date, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING`,
        [
          payment.lease_id, payment.tenant_id, payment.property_id,
          payment.payment_type, payment.amount, payment.due_date,
          payment.status, payment.paid_date, payment.description
        ]
      );
    }
    console.log('Created sample payments');

    // Create sample expenses
    const expenses = [
      {
        property_id: propertyIds[0],
        category: 'Maintenance',
        description: 'HVAC repair',
        amount: 250,
        expense_date: '2024-01-15'
      },
      {
        property_id: propertyIds[0],
        category: 'Utilities',
        description: 'Water bill',
        amount: 45,
        expense_date: '2024-01-20'
      },
      {
        property_id: propertyIds[1],
        category: 'Insurance',
        description: 'Property insurance',
        amount: 180,
        expense_date: '2024-01-01'
      }
    ];

    for (const expense of expenses) {
      await pool.query(
        `INSERT INTO expenses (
          property_id, category, description, amount, expense_date
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING`,
        [
          expense.property_id, expense.category, expense.description,
          expense.amount, expense.expense_date
        ]
      );
    }
    console.log('Created sample expenses');

    console.log('Database setup completed successfully!');
    console.log('\nSample login credentials:');
    console.log('Owner: owner@example.com / owner123');
    console.log('Tenant: tenant@example.com / tenant123');

  } catch (error) {
    console.error('Database setup failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('Setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupDatabase };