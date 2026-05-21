# Claude Code Build Guide: Inventory Management System Phase 1

## Project Name

Inventory Management System with Interactive 2D Floor Plan Builder

---

## Main Goal

Build a Web App / PWA inventory management system first.

Phase 1 must focus on a working inventory system with a manual interactive 2D floor plan builder.

Camera scanning and automatic floor plan generation should be treated as experimental only. Do not make camera scanning required for Phase 1.

---

## Important Claude Code Rules

Before doing anything, minimize token usage.

Rules:

1. Do not inspect the whole project unless necessary.
2. First check the project structure only.
3. If there is an existing app, identify the frontend, backend, database, and package manager.
4. If the project is empty, create a clean starter project.
5. Focus only on Phase 1 features.
6. Do not add unnecessary libraries.
7. Do not build camera scanning yet unless the manual floor plan editor is already working.
8. Always make small, testable changes.
9. After each major step, summarize what was changed.
10. Prefer clean, simple, maintainable code over complex AI features.

---

## Recommended Tech Stack

Use this stack unless the existing project already has another stack:

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- PWA support
- Canvas or SVG for 2D floor plan editing

### Backend

Choose one:

- Node.js + Express + TypeScript
- or Next.js full-stack if the project is already using Next.js

### Database

Choose one:

- PostgreSQL for production-ready setup
- SQLite for local prototype
- Prisma ORM if helpful

### Authentication

For Phase 1, simple authentication is enough:

- Admin login
- User login
- Role field: admin, staff

Do not overbuild authentication yet.

---

## Phase 1 Scope

Build the following:

1. Inventory dashboard
2. Product management
3. Category management
4. Stock in / stock out records
5. Warehouse / branch / room / rack / shelf locations
6. Manual 2D floor plan builder
7. Clickable floor plan objects
8. Save floor plan to database
9. Load and edit saved floor plan
10. Basic PWA setup

Do not build advanced AI camera scanning yet.

---

## Core Modules

### 1. Inventory Dashboard

The dashboard should show:

- Total products
- Total stock quantity
- Low stock products
- Recent stock movements
- Total locations
- Saved floor plans

---

### 2. Product Management

Each product should have:

- Product ID
- SKU
- Product name
- Category
- Description
- Unit
- Current stock quantity
- Low stock threshold
- Assigned location
- Created date
- Updated date

Required actions:

- Add product
- Edit product
- Delete product
- Search product
- Filter by category
- Filter by location

---

### 3. Category Management

Each category should have:

- Category ID
- Category name
- Description

Required actions:

- Add category
- Edit category
- Delete category

---

### 4. Stock Movement

Each stock movement should have:

- Movement ID
- Product ID
- Movement type: stock_in or stock_out
- Quantity
- Reason
- Location
- User
- Date and time

Required actions:

- Add stock in
- Add stock out
- View stock movement history
- Update current stock automatically after stock movement

---

### 5. Location Management

Locations should support this structure:

```text
Branch / Warehouse
  └── Building
       └── Floor
            └── Room / Area
                 └── Rack
                      └── Shelf / Bin
```

Each location should have:

- Location ID
- Location name
- Location type
- Parent location ID
- Notes

Required actions:

- Add location
- Edit location
- Delete location
- Assign product to location

---

## 2D Floor Plan Builder

This is the most important Phase 1 feature after basic inventory.

### Main Goal

Create a manual 2D floor plan editor where users can create a warehouse, room, or storage area layout.

Users should be able to manually add walls, rooms, racks, shelves, labels, and inventory zones.

Each object must be clickable and editable.

---

## Floor Plan Editor Required Features

### Canvas / Drawing Area

The editor should have a large drawing area.

Required tools:

- Select tool
- Add wall tool
- Add room / area tool
- Add rack tool
- Add shelf tool
- Add label tool
- Delete selected object
- Save floor plan
- Load floor plan
- Edit floor plan later

---

## Floor Plan Object Types

Support these object types:

### Wall

Properties:

- ID
- Type: wall
- Start X
- Start Y
- End X
- End Y
- Thickness
- Color
- Label
- Notes

Required behavior:

- Clickable
- Selectable
- Movable
- Editable
- Deletable

---

### Room / Area

Properties:

- ID
- Type: room
- X
- Y
- Width
- Height
- Label
- Notes
- Linked location ID

Required behavior:

- Clickable
- Selectable
- Movable
- Resizeable
- Editable
- Deletable
- Can be linked to an inventory location

---

### Rack

Properties:

- ID
- Type: rack
- X
- Y
- Width
- Height
- Rotation
- Label
- Notes
- Linked location ID

Required behavior:

- Clickable
- Selectable
- Movable
- Resizeable
- Rotatable if possible
- Editable
- Deletable

---

### Shelf / Bin

Properties:

- ID
- Type: shelf
- X
- Y
- Width
- Height
- Label
- Notes
- Linked location ID

Required behavior:

- Clickable
- Selectable
- Movable
- Editable
- Deletable

---

### Label / Text

Properties:

- ID
- Type: label
- X
- Y
- Text
- Font size
- Notes

Required behavior:

- Clickable
- Selectable
- Movable
- Editable
- Deletable

---

## Floor Plan Data Format

Save the floor plan as JSON in the database.

Example JSON:

```json
{
  "id": "floorplan_001",
  "name": "Main Warehouse Floor 1",
  "width": 1200,
  "height": 800,
  "scale": {
    "pixelsPerMeter": 50
  },
  "objects": [
    {
      "id": "wall_001",
      "type": "wall",
      "startX": 100,
      "startY": 100,
      "endX": 500,
      "endY": 100,
      "thickness": 8,
      "label": "North Wall",
      "notes": ""
    },
    {
      "id": "rack_001",
      "type": "rack",
      "x": 150,
      "y": 180,
      "width": 200,
      "height": 60,
      "rotation": 0,
      "label": "Rack A1",
      "linkedLocationId": "loc_001",
      "notes": "Main storage rack"
    }
  ]
}
```

---

## Database Tables

Use these basic tables or equivalent models.

### users

- id
- name
- email
- password_hash
- role
- created_at
- updated_at

### products

- id
- sku
- name
- description
- category_id
- unit
- current_stock
- low_stock_threshold
- location_id
- created_at
- updated_at

### categories

- id
- name
- description
- created_at
- updated_at

### stock_movements

- id
- product_id
- movement_type
- quantity
- reason
- location_id
- user_id
- created_at

### locations

- id
- name
- type
- parent_id
- notes
- created_at
- updated_at

### floor_plans

- id
- name
- location_id
- width
- height
- plan_json
- created_at
- updated_at

---

## UI Pages

Create these pages:

### Dashboard

Path:

```text
/dashboard
```

Shows summary cards and recent stock movements.

---

### Products

Path:

```text
/products
```

Features:

- Product table
- Search
- Add product
- Edit product
- Delete product
- View product details

---

### Categories

Path:

```text
/categories
```

Features:

- Category table
- Add category
- Edit category
- Delete category

---

### Stock Movements

Path:

```text
/stock-movements
```

Features:

- Stock movement table
- Add stock in
- Add stock out
- Filter by product
- Filter by date

---

### Locations

Path:

```text
/locations
```

Features:

- Location tree
- Add branch / warehouse
- Add building
- Add floor
- Add room
- Add rack
- Add shelf
- Edit location
- Delete location

---

### Floor Plans

Path:

```text
/floor-plans
```

Features:

- List saved floor plans
- Create new floor plan
- Open saved floor plan
- Edit saved floor plan
- Delete floor plan

---

### Floor Plan Editor

Path:

```text
/floor-plans/:id/edit
```

Features:

- Canvas / SVG editor
- Toolbar
- Object properties panel
- Save button
- Delete selected object button
- Link selected object to location
- Load saved data
- Save edited data

---

## Floor Plan Editor UI Layout

Recommended layout:

```text
 -------------------------------------------------------
| Top Bar: Floor Plan Name | Save | Back               |
 -------------------------------------------------------
| Toolbar       | Drawing Canvas / SVG Area | Properties |
| Select        |                           | Panel      |
| Wall          |                           |            |
| Room          |                           |            |
| Rack          |                           |            |
| Shelf         |                           |            |
| Label         |                           |            |
| Delete        |                           |            |
 -------------------------------------------------------
```

---

## Manual Floor Plan Workflow

User flow:

1. User opens Floor Plans page.
2. User clicks Create Floor Plan.
3. User enters floor plan name, width, and height.
4. User opens the editor.
5. User chooses Add Wall tool.
6. User draws or places a wall.
7. User clicks the wall.
8. Properties panel opens.
9. User edits wall label, thickness, and notes.
10. User adds racks, shelves, rooms, or labels.
11. User links rack or shelf to inventory location.
12. User saves the floor plan.
13. User can reopen and edit the floor plan later.

---

## Camera Scanning Rule

Do not build camera scanning as the main Phase 1 feature.

Only prepare the architecture so camera scanning can be added later.

Future camera scanning idea:

```text
Camera Capture
  ↓
Image / video frame
  ↓
Experimental wall detection
  ↓
Generated floor plan draft
  ↓
User manually edits and corrects the plan
```

For now, create a placeholder page or note only:

```text
Camera scanning is planned for a future phase.
Manual floor plan editing is the main supported method in Phase 1.
```

---

## PWA Requirements

Add basic PWA support:

- Web app manifest
- App name
- App icon placeholder
- Theme color
- Service worker if easy
- Installable app behavior if supported
- Offline fallback page if possible

Do not overcomplicate offline sync in Phase 1.

---

## Security Requirements

Basic security for Phase 1:

- Validate all inputs
- Hash passwords
- Do not store plain text passwords
- Protect authenticated routes
- Use role-based access for admin-only actions
- Sanitize saved floor plan JSON
- Limit floor plan object count to prevent abuse
- Use environment variables for secrets

---

## Code Quality Requirements

Claude Code should:

1. Keep files organized.
2. Use TypeScript types for inventory and floor plan objects.
3. Avoid huge single files.
4. Create reusable components.
5. Add comments only where helpful.
6. Avoid unnecessary dependencies.
7. Make the app easy to extend in future phases.

---

## Suggested Folder Structure

Use this only if starting from scratch.

```text
inventory-pwa/
  src/
    components/
      layout/
      inventory/
      floorplan/
    pages/
      Dashboard.tsx
      Products.tsx
      Categories.tsx
      StockMovements.tsx
      Locations.tsx
      FloorPlans.tsx
      FloorPlanEditor.tsx
    types/
      inventory.ts
      floorplan.ts
    services/
      api.ts
      floorPlanStorage.ts
    utils/
      ids.ts
      validation.ts
    App.tsx
    main.tsx
  public/
    manifest.webmanifest
    icons/
  server/
    src/
      routes/
      models/
      db/
      middleware/
      index.ts
  README.md
  package.json
```

---

## TypeScript Types

Create types similar to this:

```ts
export type FloorPlanObjectType = "wall" | "room" | "rack" | "shelf" | "label";

export interface BaseFloorPlanObject {
  id: string;
  type: FloorPlanObjectType;
  label?: string;
  notes?: string;
  linkedLocationId?: string;
}

export interface WallObject extends BaseFloorPlanObject {
  type: "wall";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thickness: number;
}

export interface RectangleObject extends BaseFloorPlanObject {
  type: "room" | "rack" | "shelf";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface LabelObject extends BaseFloorPlanObject {
  type: "label";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type FloorPlanObject = WallObject | RectangleObject | LabelObject;

export interface FloorPlan {
  id: string;
  name: string;
  width: number;
  height: number;
  scale: {
    pixelsPerMeter: number;
  };
  objects: FloorPlanObject[];
}
```

---

## Acceptance Criteria

Phase 1 is complete when:

1. The app can run locally.
2. User can open the dashboard.
3. User can add, edit, delete, and search products.
4. User can create categories.
5. User can record stock in and stock out.
6. User can create inventory locations.
7. User can create a new floor plan.
8. User can manually add walls.
9. User can manually add rooms, racks, shelves, and labels.
10. User can click a floor plan object.
11. Selected object shows in a properties panel.
12. User can edit the selected object.
13. User can delete the selected object.
14. User can link a rack, shelf, or room to a location.
15. User can save the floor plan.
16. User can reopen and edit the saved floor plan later.
17. The app has basic PWA setup.
18. Camera scanning is not required for completion.

---

## Suggested Build Order for Claude Code

Follow this order:

1. Inspect project structure.
2. Identify existing stack.
3. If empty, scaffold the app.
4. Create inventory types.
5. Create floor plan types.
6. Create basic layout and navigation.
7. Create dashboard page.
8. Create product CRUD.
9. Create category CRUD.
10. Create location CRUD.
11. Create stock movement logic.
12. Create floor plan list page.
13. Create floor plan editor page.
14. Add manual object creation tools.
15. Add selection behavior.
16. Add properties panel.
17. Add save/load floor plan.
18. Add basic PWA setup.
19. Test the full user flow.
20. Summarize what works and what remains.

---

## What Not To Do Yet

Do not build these in Phase 1:

- Full AI camera scanning
- LiDAR scanning
- Automatic room detection
- Advanced image recognition
- Multi-user real-time collaboration
- Advanced offline sync
- Accounting integration
- Barcode printer integration
- Advanced reporting
- Mobile native apps
- iOS native app
- Android native app

---

## Future Phase Ideas

Possible later phases:

1. Barcode scanning using phone camera
2. QR code per item or location
3. Camera-assisted floor plan detection
4. AI wall detection
5. Native Android scanner app
6. Native iOS scanner app
7. Advanced reports
8. Role-based approval flow
9. Offline-first warehouse mode
10. Multi-branch sync
11. Asset tracking
12. Audit trail
13. Export to Excel / PDF
14. Import products by CSV

---

## Final Instruction to Claude Code

Build Phase 1 only.

The priority is a working inventory Web App / PWA with a manual interactive 2D floor plan builder.

The floor plan builder must allow manual creation, selection, editing, saving, loading, and later editing of walls, rooms, racks, shelves, and labels.

Camera scanning should remain a future feature and must not block Phase 1.
