# Inventory Management System

An open-source Inventory Management System built for IT asset tracking, office equipment inventory, and multi-department stock management.

This app is currently under active development. You can use it, test it, and contribute to it, but some features may still change or contain bugs. Please report any issues you find through GitHub Issues.

---

## About the Project

Inventory Management System is designed to help companies, offices, IT departments, and government organizations manage assets and inventory records in a structured way.

It can be used for tracking:

- IT equipment
- Office supplies
- Network devices
- Stock movements
- Department-assigned assets
- Locations and storage areas
- Product categories
- Inventory item details

The goal of this project is to provide a practical, open-source inventory platform that can be improved and customized based on real operational needs.

---

## Main Features

- Product and inventory item management
- Category management
- Location management
- Department-based organization
- Stock movement tracking
- Asset tag, barcode, serial number, MAC address, and model number fields
- Item status and condition tracking
- Warranty and date received tracking
- Role-based access structure
- Dashboard-style inventory monitoring
- Search, filter, and sorting support
- Designed for company and government office inventory workflows

---

## Project Status

This project is under active development.

Current focus areas include:

- Improving inventory workflows
- Enhancing product, category, and location management
- Improving stock movement tracking
- Cleaning up UI behavior
- Improving data validation
- Strengthening security and role-based access
- Preparing the system for more production-ready use

Breaking changes may happen while the project is still being improved.

---

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL via Prisma ORM
- **Authentication:** JWT-based with role-based access
- **API:** REST

---

## Use Cases

This system is useful for:

- IT asset tracking
- Office equipment inventory
- Government office inventory
- Company stock management
- Multi-department asset monitoring
- Equipment assignment tracking
- Basic warehouse or storage room inventory

---

## Security Notice

This repository should only contain safe public information.

Do not commit or expose:

- `.env` files
- API keys
- Database passwords
- JWT secrets
- Admin credentials
- Private server IP addresses
- Internal-only URLs
- Cloud access tokens
- Personal user data
- Production database dumps
- Real confidential inventory records

Use `.env.example` instead of `.env`.

Example:

```env
DATABASE_URL="your-database-url-here"
JWT_SECRET="your-jwt-secret-here"
PORT=3001
```

Never place real secrets inside the README, source code, screenshots, documentation, or GitHub Issues.

---

## Installation

Clone the repository:

```bash
git clone <your-repository-url>
cd <repository-folder>
```

Install dependencies:

```bash
npm install
```

Create an environment file:

```bash
cp backend/.env.example backend/.env
```

Update the `.env` file with your local development values.

Run database setup:

```bash
cd backend
npx prisma generate
npx prisma migrate dev
```

Start the development server:

```bash
npm run dev
```

If the frontend and backend are separated, install and run each one separately based on your project structure.

---

## Recommended Environment Files

Use this structure:

```
.env
.env.example
```

The `.env` file should be ignored by Git.

The `.env.example` file should contain only placeholder values.

Example `.gitignore` entries:

```
.env
.env.local
.env.production
.env.development
node_modules
dist
build
coverage
logs
uploads
temp
cache
```

---

## Contributing

Contributions are welcome.

You can help by:

- Reporting bugs
- Suggesting improvements
- Improving documentation
- Fixing UI issues
- Improving backend logic
- Adding tests
- Improving security
- Refactoring code safely

Before submitting changes, please make sure your code does not expose secrets, private data, or environment-specific configuration.

---

## Bug Reports

When reporting bugs, please include:

- What page or feature has the issue
- Steps to reproduce the problem
- Expected result
- Actual result
- Screenshot if helpful
- Browser or environment used

Do not include passwords, tokens, private URLs, or real confidential data in bug reports.

---

## Development Notes

This project is still evolving. Some modules, database fields, UI components, and API routes may be updated as the system improves.

The goal is to keep the system clean, secure, practical, and useful for real inventory operations.

---

## License

This project is open source. Add your selected license here (e.g., MIT License).

---

## Disclaimer

This software is provided as-is while under active development. Use it carefully, review the code before production deployment, and configure your own security settings properly.
