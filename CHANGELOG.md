# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-06-03

### Added
- Product catalog with categories, units, suppliers, and stock level tracking
- Inventory Items — individual physical asset tracking with serial numbers, asset tags, barcodes, condition, and warranty
- Stock Movements — full movement lifecycle (stock in/out, transfer, deployment, repair, disposal, borrowed, lost, found, adjustment)
- Stock movement confirmation workflow — pending movements require admin confirmation
- Locations and Floor Plans — visual department mapping with location assignment
- Bulk Add Products — spreadsheet-style batch product creation
- Import / Export — CSV import and export with approval workflow
- User management — roles (superadmin, admin, staff), invite codes, department assignment
- Requests system — import, delete, edit, and password reset requests with approval workflow
- Notification bell — live alerts for low stock, warranty expiry, unverified items, data quality issues with per-user snooze
- Inventory verification — bulk and per-item "Mark as Verified Today" with last-checked tracking
- Dashboard — summary stats, priority actions, analytics, recent activity feeds, getting started checklist, welcome guide
- Dark mode support
- Role-based access control throughout
- Department-scoped data visibility for staff users
- Docker Compose setup for local development
