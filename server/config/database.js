const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'rental_property_manager',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const initializeDatabase = async () => {
  const client = await pool.connect();
  
  try {
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'tenant')),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        property_type VARCHAR(50) NOT NULL,
        bedrooms INTEGER,
        bathrooms INTEGER,
        square_feet DECIMAL(10,2),
        purchase_price DECIMAL(12,2),
        purchase_date DATE,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
        owner_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        emergency_contact VARCHAR(255),
        emergency_phone VARCHAR(20),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'evicted')),
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS leases (
        id SERIAL PRIMARY KEY,
        property_id INTEGER REFERENCES properties(id),
        tenant_id INTEGER REFERENCES tenants(id),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        monthly_rent DECIMAL(10,2) NOT NULL,
        security_deposit DECIMAL(10,2),
        late_fee DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        lease_id INTEGER REFERENCES leases(id),
        tenant_id INTEGER REFERENCES tenants(id),
        property_id INTEGER REFERENCES properties(id),
        payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('rent', 'utility', 'deposit', 'late_fee', 'other')),
        amount DECIMAL(10,2) NOT NULL,
        due_date DATE NOT NULL,
        paid_date DATE,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        property_id INTEGER REFERENCES properties(id),
        category VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        expense_date DATE NOT NULL,
        receipt_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        lease_id INTEGER REFERENCES leases(id),
        tenant_id INTEGER REFERENCES tenants(id),
        property_id INTEGER REFERENCES properties(id),
        document_type VARCHAR(50) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        file_size INTEGER,
        notes TEXT,
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        tenant_id INTEGER REFERENCES tenants(id),
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_payments_property_id ON payments(property_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_leases_property_id ON leases(property_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON leases(tenant_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_property_id ON expenses(property_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_documents_lease_id ON documents(lease_id)');

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  initializeDatabase
};