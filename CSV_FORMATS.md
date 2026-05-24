# CSV Import Formats for PCLSF Pages

This document describes the CSV format required for importing data into each page.

---

## **1. Products (products.csv)**

**Required columns:**
- `sku` - Unique product code
- `name` - Product name
- `categoryId` - Category ID (must exist in database)
- `unit` - Unit of measurement (pcs, kg, liter, etc.)
- `currentStock` - Initial stock quantity
- `lowStockThreshold` - Minimum stock alert level

**Optional columns:**
- `description` - Product description
- `locationId` - Location ID (storage location)
- `supplier` - Supplier/Vendor name
- `unitPrice` - Price per unit
- `status` - Product status (active, discontinued, obsolete, on-backorder)
- `expiryDate` - Expiration date (YYYY-MM-DD format)
- `leadTimeDays` - Days until new stock arrives
- `notes` - Product notes

**Example:**
```csv
sku,name,categoryId,unit,currentStock,lowStockThreshold,supplier,unitPrice,status
SKU-001,Laptop,cat-123,pcs,10,2,Tech Corp,999.99,active
SKU-002,Mouse,cat-123,pcs,50,10,Tech Corp,29.99,active
SKU-003,USB Cable,cat-123,pcs,100,20,Parts Inc,5.99,active
```

---

## **2. Categories (categories.csv)**

**Required columns:**
- `name` - Category name
- `description` - Category description (can be empty)

**Example:**
```csv
name,description
Electronics,Computer and electronic devices
Office Supplies,Office equipment and supplies
Furniture,Office furniture and fixtures
```

---

## **3. Locations (locations.csv)**

**Required columns:**
- `name` - Location name
- `type` - Location type (branch, building, floor, room, rack, shelf)

**Optional columns:**
- `parentId` - Parent location ID (for hierarchical locations)
- `notes` - Location notes

**Example:**
```csv
name,type,notes
Main Warehouse,building,Central storage facility
Shelf A1,shelf,First floor shelf
Shelf A2,shelf,First floor shelf
```

---

## **4. Stock Movements (stock-movements.csv)**

**Required columns:**
- `productId` - Product ID
- `quantity` - Quantity moved

**Optional columns:**
- `movementType` - Type of movement (stock_in, stock_out, adjustment, transfer, damaged, returned) - Default: stock_in
- `reason` - Reason for movement
- `locationId` - Location ID

**Example (Stock In):**
```csv
productId,quantity,movementType,reason,locationId
prod-123,50,stock_in,Shipment received,loc-456
prod-124,30,stock_in,Returned goods,loc-456
prod-125,10,stock_out,Sale,loc-456
```

---

## **5. Floor Plans (floor-plans.csv)**

**Required columns:**
- `name` - Floor plan name
- `width` - Width in units
- `height` - Height in units
- `planJson` - JSON serialized floor plan data

**Optional columns:**
- `locationId` - Associated location ID
- `description` - Floor plan description

**Example:**
```csv
name,width,height,planJson,locationId
Main Floor,100,80,"{""tiles"":[]}",loc-456
Second Floor,100,80,"{""tiles"":[]}",loc-789
```

---

## **Import Instructions**

1. Prepare your CSV file following the format above
2. Ensure all required columns are present
3. Use correct IDs for foreign keys (categoryId, locationId, productId, etc.)
4. For dates, use YYYY-MM-DD format
5. For empty optional fields, leave blank (don't omit the column)
6. Use the unified Import PCLSF page to import
7. Check results for any errors

---

## **Important Notes**

- **Foreign Keys**: Make sure referenced IDs exist (e.g., categoryId must exist in Categories)
- **Unique Values**: SKU must be unique for products
- **Data Types**: Numbers should not have quotes, strings can have quotes if needed
- **Encoding**: Save CSV as UTF-8
- **Dates**: Format as YYYY-MM-DD (e.g., 2026-05-24)
