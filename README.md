# Rental Property Management System

A comprehensive web application for managing rental properties, tenants, leases, payments, and financial reporting. Built with React.js frontend and Node.js backend with PostgreSQL database.

## Features

### 🏠 Property Management
- Create, edit, and activate properties
- Property details including address, type, bedrooms, bathrooms, square footage
- Property status tracking (active, inactive, maintenance)
- Property search and filtering

### 👥 Tenant Management
- Add and manage tenant information
- Tenant profiles with contact details and emergency contacts
- Tenant status tracking (active, inactive, pending)
- Current lease information display

### 📋 Lease Management
- Create and manage lease agreements
- Automatic monthly rent payment generation
- Lease expiration reminders (3 months prior)
- Lease status tracking

### 💰 Payment Management
- Create rent and utility payment entries
- Payment status tracking (pending, paid, overdue)
- Payment search by tenant and date range
- Mark payments as paid functionality
- Overdue payment alerts

### 📊 Financial Reporting
- Monthly and yearly financial reports
- Income/expense reports filterable by property and tenant
- ROI calculations and analysis
- Income/expense dashboard with charts
- Payment statistics and trends

### 💸 Expense Management
- Track property expenses by category
- Expense reporting and analysis
- Expense statistics and summaries

### 📄 Document Management
- Upload and store lease documents
- Document categorization and notes
- Document download functionality

### 📧 Notifications
- Email notifications for rent and utility due dates
- Formal email breakdowns sent to tenants
- In-app notification system
- Notification management and tracking

### 🔐 User Authentication & Authorization
- User registration and login
- Role-based access control (Owner/Tenant)
- JWT-based authentication
- Profile management

## Technology Stack

### Frontend
- **React.js** - UI framework
- **React Router DOM** - Client-side routing
- **React Query** - Data fetching and caching
- **Tailwind CSS** - Styling framework
- **Axios** - HTTP client
- **React Hook Form** - Form management
- **Recharts** - Data visualization
- **Lucide React** - Icons
- **React Hot Toast** - Notifications

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **pg** - PostgreSQL client
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **multer** - File uploads
- **nodemailer** - Email sending
- **express-validator** - Request validation
- **moment** - Date/time manipulation

## Prerequisites

Before running this application, make sure you have the following installed:

- **Node.js** (v14 or higher)
- **npm** or **yarn**
- **PostgreSQL** (v12 or higher)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd rental-property-manager
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Set up the database**
   - Create a PostgreSQL database named `rental_property_manager`
   - Copy the `.env.example` file to `.env` in the server directory
   - Update the database credentials in `.env`

4. **Configure environment variables**
   ```bash
   cd server
   cp .env.example .env
   ```
   
   Edit `server/.env` with your configuration:
   ```env
   # Database Configuration
   DB_USER=your_db_user
   DB_HOST=localhost
   DB_NAME=rental_property_manager
   DB_PASSWORD=your_db_password
   DB_PORT=5432

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

   # Email Configuration (for notifications)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password

   # Server Configuration
   PORT=5000
   NODE_ENV=development
   CLIENT_URL=http://localhost:3000
   ```

5. **Initialize the database**
   ```bash
   npm run setup-db
   ```

6. **Start the development servers**
   ```bash
   npm run dev
   ```

This will start both the backend server (port 5000) and frontend development server (port 3000).

## Usage

### Demo Credentials

The application comes with sample data and demo accounts:

**Property Owner:**
- Email: `owner@example.com`
- Password: `owner123`

**Tenant:**
- Email: `tenant@example.com`
- Password: `tenant123`

### Key Features Walkthrough

1. **Dashboard**: Overview of financial metrics, recent payments, and notifications
2. **Properties**: Manage rental properties with detailed information
3. **Tenants**: Add and manage tenant profiles and information
4. **Payments**: Track rent and utility payments with status management
5. **Reports**: Generate financial reports and analyze property performance
6. **Documents**: Upload and manage lease documents
7. **Notifications**: Send and manage tenant notifications

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/profile` - Get user profile
- `PUT /auth/profile` - Update user profile
- `PUT /auth/change-password` - Change password

### Properties
- `GET /properties` - List properties
- `GET /properties/:id` - Get property details
- `POST /properties` - Create property
- `PUT /properties/:id` - Update property
- `DELETE /properties/:id` - Delete property

### Tenants
- `GET /tenants` - List tenants
- `GET /tenants/:id` - Get tenant details
- `POST /tenants` - Create tenant
- `PUT /tenants/:id` - Update tenant
- `DELETE /tenants/:id` - Delete tenant

### Payments
- `GET /payments` - List payments
- `GET /payments/:id` - Get payment details
- `POST /payments` - Create payment
- `PUT /payments/:id` - Update payment
- `PUT /payments/:id/mark-paid` - Mark payment as paid
- `DELETE /payments/:id` - Delete payment

### Reports
- `GET /reports/dashboard` - Dashboard summary
- `GET /reports/monthly` - Monthly reports
- `GET /reports/yearly` - Yearly reports
- `GET /reports/roi` - ROI reports
- `GET /reports/income-expense` - Income/expense reports

## Project Structure

```
rental-property-manager/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── contexts/       # React contexts
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   └── index.js        # App entry point
│   ├── package.json
│   └── tailwind.config.js
├── server/                 # Node.js backend
│   ├── config/            # Database configuration
│   ├── middleware/        # Express middleware
│   ├── routes/            # API routes
│   ├── scripts/           # Database scripts
│   ├── index.js           # Server entry point
│   └── package.json
├── package.json           # Root package.json
└── README.md
```

## Development

### Available Scripts

**Root level:**
- `npm run dev` - Start both client and server in development mode
- `npm run server` - Start only the server
- `npm run client` - Start only the client
- `npm run build` - Build the client for production
- `npm run install-all` - Install dependencies for all packages
- `npm run setup-db` - Initialize database with sample data

**Server:**
- `npm run dev` - Start server with nodemon
- `npm start` - Start server in production mode
- `npm run setup-db` - Initialize database

**Client:**
- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

### Database Schema

The application uses the following main tables:
- `users` - User accounts and authentication
- `properties` - Property information
- `tenants` - Tenant profiles
- `leases` - Lease agreements
- `payments` - Payment records
- `expenses` - Property expenses
- `documents` - Document storage
- `notifications` - System notifications

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- Input validation and sanitization
- CORS protection
- Rate limiting
- Security headers with Helmet

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue in the repository or contact the development team.

## Roadmap

- [ ] Mobile app development
- [ ] Advanced reporting features
- [ ] Integration with payment gateways
- [ ] Maintenance request system
- [ ] Tenant portal enhancements
- [ ] Multi-language support
- [ ] Advanced analytics dashboard