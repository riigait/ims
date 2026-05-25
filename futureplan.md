# Future Plan & Roadmap

---

## UI Normalization — Right-Side Drawer Pattern

All pages should follow the same edit/add UX as Inventory Items.
Clicking a row or add button opens a right-side drawer instead of an inline form.

Use **Sonnet in one sweep** for all pages below.

### Pages to Convert

| Page | File | Complexity |
|---|---|---|
| Categories | `frontend/src/pages/Categories.tsx` | Low |
| Locations | `frontend/src/pages/Locations.tsx` | Low |
| Admin Departments | `frontend/src/pages/AdminDepartments.tsx` | Low |
| Admin Users | `frontend/src/pages/AdminUsers.tsx` | Medium |
| Products | `frontend/src/pages/Products.tsx` | High |
| Stock Movements | `frontend/src/pages/StockMovements.tsx` | High |

### Pages to Skip

| Page | Reason |
|---|---|
| Dashboard | Read-only |
| Floor Plans | Visual canvas builder |
| Import PCLSF | File upload UX |
| Inventory Items | Already done ✅ |

### Drawer Pattern Reference

Use `InventoryItems.tsx` as the template:
- Overlay: `fixed inset-0 z-50 flex` with `bg-black/30` backdrop
- Panel: `w-full max-w-lg` sliding in from the right
- Header: title + status badge + X close button
- Body: scrollable sections
- Footer: Save / Cancel / Delete buttons
- Edit form renders **inside** the drawer, not a separate page

---

## Other Planned Features

### Inventory Items — Full Profile Page
- Route: `/inventory-items/:id`
- Full movement history, all fields, product/location/floorplan links
- Print / export QR code

### Stock Movements — Pre-fill from Inventory Item
- "Move Item" on Inventory Items drawer pre-fills Stock Movement form via `sessionStorage`

### Audit Log Page
- Frontend page for `/audit-logs` (backend already exists)
- Filter by user, entity type, date range

### Reports / Export
- Export inventory items to CSV
- Export stock movement history per product
- Low stock report

---

## User Management Security & Rate Limiting

### Phase 1: Admin User Creation Limits (High Priority)

#### 1.1 Admin-to-Admin Creation Restriction
**Goal**: Prevent unauthorized admin account proliferation

**Rules**:
- Admin role can create a new Admin user **maximum once per day**
- Subsequent attempts within 24-hour window show error: "Admin creation limit reached. Please try again tomorrow."
- Last admin creation timestamp stored in database
- Superadmin can override this limit (no restrictions)

**Implementation**:
```
- Add `lastAdminCreatedAt` timestamp field to User table
- Check timestamp before allowing admin creation
- Return 429 (Too Many Requests) on limit exceeded
- Log all admin creation attempts in audit log
```

**Database Change**:
```
User model:
  lastAdminCreatedAt DateTime? @updatedAt  // Track last time user created an admin
```

**API Endpoint**:
```
POST /api/users/invite
  - Check user role (must be admin or superadmin)
  - If admin: check lastAdminCreatedAt + 24 hours
  - If superadmin: no restriction
  - Return 429 if limit exceeded
```

---

#### 1.2 Staff User Creation Daily Limit
**Goal**: Control bulk staff account creation

**Rules**:
- Admin role can create maximum **10 staff users per day**
- Counter resets daily at midnight (server timezone)
- Superadmin has no limit
- Rate limit includes both direct creation and batch imports

**Implementation**:
```
- Add staffUsersCreatedToday counter (reset daily)
- Track per admin user per calendar day
- Return 429 when limit reached
```

**Database Change**:
```
User model:
  staffUsersCreatedToday Int @default(0)  // Daily counter
  staffCreationResetAt   DateTime?         // When counter resets
```

**Error Response** (when limit exceeded):
```json
{
  "error": "Staff user creation limit reached (10/day)",
  "remaining": 0,
  "resetsAt": "2026-05-25T00:00:00Z",
  "message": "Submit a user add request for additional staff accounts"
}
```

---

### Phase 2: User Add Request System (Medium Priority)

**Goal**: Allow admins to request additional staff accounts beyond daily limit

#### 2.1 User Add Request Model
```
model UserAddRequest {
  id              String   @id @default(cuid())
  requestedBy     String   // Admin user ID
  requester       User     @relation(fields: [requestedBy], references: [id])
  
  staffCount      Int      // Number of staff requested
  department      String   // Which department
  reason          String   // Why more staff is needed
  
  status          String   @default("pending")  // pending, approved, rejected
  approvedBy      String?  // Superadmin ID
  approver        User?    @relation(fields: [approvedBy], references: [id])
  approvedAt      DateTime?
  rejectionReason String?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

#### 2.2 User Add Request Workflow

**Admin creates request**:
```
POST /api/user-add-requests
{
  "staffCount": 15,
  "department": "Sales Team",
  "reason": "Q2 expansion - new sales hires joining next week"
}
```

**Superadmin manages requests**:
```
GET /api/user-add-requests?status=pending    // View pending
PATCH /api/user-add-requests/:id/approve     // Approve
PATCH /api/user-add-requests/:id/reject      // Reject with reason
```

**Automatic benefit**:
- Approving request temporarily increases that admin's staff limit by requested amount
- Or creates a "special approval token" valid for X days
- Reset happens automatically after approval window

---

### Phase 3: User Management Dashboard (Low Priority)

**In Superadmin User Management Section**:

#### 3.1 User Creation Statistics
```
Dashboard Widgets:
├─ Admin Accounts
│  ├─ Total: 5
│  ├─ Created Today: 0
│  ├─ Can Create: 1 more today
│  └─ Recent admins: [list]
│
├─ Staff Accounts
│  ├─ Total: 287
│  ├─ Created Today: 8/10
│  ├─ Can Create: 2 more today
│  └─ By Admin: [breakdown]
│
└─ Pending Requests
   ├─ Active Requests: 3
   ├─ Action Needed: 2 pending
   └─ Recent Activity: [timeline]
```

#### 3.2 User Creation History Table
```
Columns:
- Created By (Admin)
- User Added (Email)
- Role (Admin/Staff)
- Department
- Time
- Status
```

#### 3.3 Request Management Panel
```
Pending Requests:
┌─────────────────────────────────┐
│ Admin: john@company.com          │
│ Request: 20 staff users          │
│ Reason: Seasonal expansion       │
│ Submitted: 2 days ago            │
│ [Approve] [Reject]               │
└─────────────────────────────────┘
```

---

## Security Considerations

### Rate Limiting Headers
Add to all user creation responses:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1234567890
```

### Audit Trail
Log all user creation attempts:
```
AuditLog:
{
  userId: admin-id
  action: "USER_CREATE_ATTEMPTED"
  entityType: "user"
  entityId: new-user-id
  changes: {
    role: "staff",
    email: "...",
    limitStatus: "success" or "rate_limited"
  }
}
```

### Daily Reset Logic
```
Cron Job (runs at 00:00 UTC):
- Reset all staffUsersCreatedToday to 0
- Clear expired approval tokens
- Archive old requests
```

---

## Implementation Priority

### Week 1-2:
- [ ] Add database fields for rate limiting
- [ ] Implement admin creation limit (once per day)
- [ ] Implement staff creation limit (10 per day)
- [ ] Add rate limit error handling
- [ ] Update audit logs

### Week 3-4:
- [ ] Create UserAddRequest model
- [ ] Build request creation endpoint
- [ ] Build superadmin approval endpoints
- [ ] Add UI for viewing requests

### Week 5+:
- [ ] User management dashboard
- [ ] Statistics and reporting
- [ ] Advanced filtering and search
- [ ] Email notifications for approvals

---

## Testing Checklist

- [ ] Admin can create 1 admin per day
- [ ] Second admin creation in same day returns 429
- [ ] Reset happens at midnight
- [ ] Admin can create 10 staff per day
- [ ] 11th staff creation returns 429 with proper message
- [ ] Superadmin has no limits
- [ ] Rate limit headers present in responses
- [ ] Audit logs capture all attempts
- [ ] Requests can be created and approved
- [ ] Rejected requests have reason recorded
- [ ] Daily counters reset correctly

---

## API Reference

### Current Endpoints (To be updated)
```
POST /api/users/invite
  - Creates new user (admin or staff)
  - Now with rate limiting checks
  - Returns 429 if limit exceeded
```

### Future Endpoints (To be added)
```
POST /api/user-add-requests
  - Create request for additional staff

GET /api/user-add-requests
  - List requests (superadmin only)

PATCH /api/user-add-requests/:id/approve
  - Approve request (superadmin only)

PATCH /api/user-add-requests/:id/reject
  - Reject request with reason (superadmin only)

GET /api/admin/user-statistics
  - Get creation statistics (superadmin only)
```

---

## Database Migrations

```sql
-- Add rate limiting fields
ALTER TABLE "User" ADD COLUMN "lastAdminCreatedAt" TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "staffUsersCreatedToday" INT DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "staffCreationResetAt" TIMESTAMP;

-- Create UserAddRequest table
CREATE TABLE "UserAddRequest" (
  id TEXT PRIMARY KEY,
  requestedBy TEXT NOT NULL,
  staffCount INT NOT NULL,
  department TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  approvedBy TEXT,
  approvedAt TIMESTAMP,
  rejectionReason TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requestedBy) REFERENCES "User"(id),
  FOREIGN KEY (approvedBy) REFERENCES "User"(id)
);
```

---

## Notes

- All limits are per admin user, not per department
- Superadmin account can always create unlimited users
- Request approval should trigger notification/email to admin
- Consider implementing webhook for approval notifications
- Daily reset should be idempotent (safe to run multiple times)
- Store timezone in User preferences for accurate daily reset
