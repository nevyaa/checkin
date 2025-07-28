# Rental Property Management System

A comprehensive web application for managing rental properties, tenants, and finances with role-based access for property owners and tenants.

## Features

### Property Management
- ✅ Create, edit, and activate/deactivate properties
- ✅ Property dashboard with financial overview
- ✅ Property details management (address, type, bedrooms, etc.)

### Tenant Management
- ✅ Create, edit, and activate/deactivate tenants
- ✅ Lease management with start/end dates
- ✅ Automatic rent schedule generation (monthly/yearly)
- ✅ Lease expiry reminders (3 months before expiration)
- ✅ Monthly/yearly rent estimates

### Financial Management
- ✅ Rent and utility payment tracking
- ✅ Monthly rent breakdown for lease term
- ✅ Payment entry forms for rent and utilities
- ✅ Transaction history with search and filtering
- ✅ Expense tracking by property
- ✅ Income/expense reports with filtering
- ✅ ROI calculations and dashboard analytics

### Reporting & Analytics
- ✅ Monthly and yearly financial reports
- ✅ Income/expense analysis by property and tenant
- ✅ ROI calculations and performance metrics
- ✅ Vacancy reports and occupancy rates
- ✅ Maintenance expense tracking

### Document Management
- ✅ Upload and manage lease documents
- ✅ Document storage by tenant and property
- ✅ File download and viewing capabilities
- ✅ Document categorization and notes

### Communication & Notifications
- ✅ Email notifications for rent and utility due dates
- ✅ Automated lease expiry reminders
- ✅ Formal email templates with payment breakdowns
- ✅ In-app notification system
- ✅ Communication history between owners and tenants

### User Management
- ✅ Two-role system: Property Owners and Tenants
- ✅ Secure authentication with JWT tokens
- ✅ User registration and login
- ✅ Profile management and password changes
- ✅ Role-based access control

### Tenant Portal Features
- ✅ Personal dashboard with lease information
- ✅ Payment history and upcoming payments
- ✅ Document access and downloads
- ✅ Communication with property owner
- ✅ Rent statements and receipts

## Technology Stack

### Backend
- **Node.js** with Express.js
- **PostgreSQL** database
- **JWT** authentication
- **Bcrypt** password hashing
- **Nodemailer** for email notifications
- **Multer** for file uploads
- **Joi** for request validation
- **Moment.js** for date handling

### Frontend
- **React 18** with functional components
- **Material-UI (MUI)** for modern UI components
- **React Router** for navigation
- **React Query** for data fetching and caching
- **React Hook Form** with Yup validation
- **Recharts** for data visualization
- **Axios** for API communication

### Security Features
- Rate limiting on API endpoints
- Helmet.js for security headers
- Input validation and sanitization
- Role-based access control
- Secure file upload handling
- Password hashing with bcrypt

## Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn package manager

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd rental-property-manager
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=rental_property_db
   DB_USER=postgres
   DB_PASSWORD=your_password

   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_EXPIRE=7d

   # Email Configuration (SMTP)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_app_password

   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # File Upload Configuration
   UPLOAD_PATH=./uploads
   MAX_FILE_SIZE=5000000

   # Application URLs
   FRONTEND_URL=http://localhost:3000
   BACKEND_URL=http://localhost:5000
   ```

4. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb rental_property_db

   # Run migrations to create tables
   npm run migrate
   ```

5. **Start the backend server**
   ```bash
   npm run dev
   ```

   The backend API will be available at `http://localhost:5000`

### Frontend Setup

1. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Create environment file (optional)**
   ```bash
   # Create .env file in frontend directory if needed
   echo "REACT_APP_API_URL=http://localhost:5000/api" > .env
   ```

3. **Start the frontend development server**
   ```bash
   npm start
   ```

   The frontend application will be available at `http://localhost:3000`

## Usage

### Getting Started

1. **Register as Property Owner**
   - Navigate to `http://localhost:3000/register`
   - Create an account with role "Owner"

2. **Add Your First Property**
   - Go to Properties section
   - Click "Add Property"
   - Fill in property details

3. **Add Tenants**
   - Navigate to Tenants section
   - Click "Add Tenant" 
   - Create tenant user account and assign to property

4. **Manage Finances**
   - Add expenses in the Expenses section
   - Track rent payments in Transactions
   - View reports and analytics in Reports section

### Key Features Usage

#### For Property Owners:
- **Dashboard**: Overview of all properties, income, expenses, and alerts
- **Properties**: Manage property portfolio with detailed information
- **Tenants**: Handle tenant relationships and lease agreements
- **Transactions**: Track all rental income and payments
- **Expenses**: Record and categorize property-related expenses
- **Reports**: Generate financial reports and ROI analysis
- **Documents**: Upload and manage lease agreements and documents
- **Notifications**: Send automated emails to tenants

#### For Tenants:
- **Dashboard**: View personal lease information and payment status
- **Transactions**: See payment history and upcoming dues
- **Documents**: Access lease agreements and important documents
- **Profile**: Update personal information and contact details

## API Documentation

The API provides comprehensive endpoints for all functionality:

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Property Management
- `GET /api/properties` - List properties
- `POST /api/properties` - Create property
- `GET /api/properties/:id` - Get property details
- `PUT /api/properties/:id` - Update property
- `DELETE /api/properties/:id` - Delete property

### Tenant Management
- `GET /api/tenants` - List tenants
- `POST /api/tenants` - Create tenant
- `GET /api/tenants/:id` - Get tenant details
- `PUT /api/tenants/:id` - Update tenant

### Financial Management
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Create transaction
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense

### Reports & Analytics
- `GET /api/reports/dashboard` - Dashboard data
- `GET /api/reports/income-expense` - Income/expense reports
- `GET /api/reports/roi-analysis` - ROI analysis

Visit `http://localhost:5000/api` for complete API documentation.

## Database Schema

The application uses PostgreSQL with the following main tables:

- **users** - User accounts (owners and tenants)
- **properties** - Property information
- **tenants** - Tenant-property relationships
- **transactions** - Financial transactions
- **expenses** - Property expenses
- **documents** - File storage metadata
- **notifications** - Email notifications
- **communications** - User communications

## File Structure

```
rental-property-manager/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── validation.js
│   ├── migrations/
│   │   └── migrate.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── properties.js
│   │   ├── tenants.js
│   │   ├── transactions.js
│   │   ├── expenses.js
│   │   ├── reports.js
│   │   ├── documents.js
│   │   └── notifications.js
│   ├── services/
│   │   └── emailService.js
│   ├── uploads/
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   ├── layout/
│   │   │   └── pages/
│   │   ├── contexts/
│   │   │   └── AuthContext.js
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions, please open an issue in the GitHub repository or contact the development team.

## Roadmap

Future enhancements planned:
- Mobile app development
- Advanced reporting with more charts
- Integration with payment gateways
- Automated rent collection
- Property maintenance scheduling
- Tenant screening tools
- Multi-language support