# App overview — IMS (Inventory Management System)

IMS is a multi-department inventory platform used to track physical assets across locations.

## Core capabilities
- Products, categories, and stock movements per department
- Location management with an optional floor-plan editor (canvas-based, drag-and-drop)
- Role-based access: `superadmin` → global; `admin` → one or more departments; `staff` → read + request workflow
- Approval workflows: delete requests, edit requests, import requests, password resets
- CSV bulk import/export for inventory data
- Dashboard with stock summaries and recent-activity feed
- Notifications bell for pending approvals and system events
- Barcode/QR scanner page for quick lookups

## User roles
| Role | Scope |
|------|-------|
| superadmin | All departments, settings, user management |
| admin | Assigned departments; can approve staff requests |
| staff | Assigned departments; read-only unless request approved |

## Department scoping
Every request carries an `X-Department-Id` header set by the frontend axios interceptor. Backend middleware validates it against the user's assigned departments before allowing writes.
