import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CSVRow {
  itemId: string;
  count: string;
  description: string;
  modelNumber: string;
  serialNumber: string;
  macId: string;
  location: string;
  note: string;
}

// Parse CSV file
function parseCSV(filePath: string): CSVRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const rows: CSVRow[] = [];

  for (let i = 2; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const cols = lines[i].split(',').map(col => col.trim());
    if (cols.length < 3 || !cols[2]) continue; // Skip if no description

    rows.push({
      itemId: cols[0] || '',
      count: cols[1] || '',
      description: cols[2],
      modelNumber: cols[3] || '',
      serialNumber: cols[4] || '',
      macId: cols[5] || '',
      location: cols[6] || 'Unspecified',
      note: cols[8] || '',
    });
  }

  return rows;
}

// Generate SKU
function generateSKU(index: number, description: string): string {
  const prefix = description.split(' ')[0].toUpperCase().slice(0, 3) || 'PRD';
  return `${prefix}-${String(index + 1).padStart(5, '0')}`;
}

// Auto-detect category from description
function categorizeProduct(description: string): string {
  const desc = description.toLowerCase();

  if (desc.includes('phone') || desc.includes('iphone') || desc.includes('xiaomi') || desc.includes('oppo') || desc.includes('samsung')) return 'Mobile Devices';
  if (desc.includes('router') || desc.includes('switch') || desc.includes('access point') || desc.includes('ubiquiti') || desc.includes('nanostation')) return 'Network Equipment';
  if (desc.includes('charger') || desc.includes('powerbank') || desc.includes('power') || desc.includes('ups') || desc.includes('adapter')) return 'Power & Charging';
  if (desc.includes('antenna') || desc.includes('booster')) return 'Antennas & Boosters';
  if (desc.includes('monitor') || desc.includes('display') || desc.includes('tv') || desc.includes('screen')) return 'Displays';
  if (desc.includes('keyboard') || desc.includes('mouse') || desc.includes('printer') || desc.includes('peripheral')) return 'Peripherals';
  if (desc.includes('laptop') || desc.includes('pc') || desc.includes('mini pc') || desc.includes('macmini')) return 'Computers';
  if (desc.includes('speaker') || desc.includes('subwoofer') || desc.includes('audio')) return 'Audio Equipment';
  if (desc.includes('enclosure') || desc.includes('disk') || desc.includes('storage')) return 'Storage';
  if (desc.includes('air conditioner') || desc.includes('ac')) return 'Cooling';

  return 'Other Equipment';
}

// Main import function
async function importCSV() {
  try {
    console.log('📂 Starting CSV import...\n');

    // Parse CSV
    const csvPath = path.join('d:\\vs\\ims', 'Inventory_2023-2024.csv');
    const rows = parseCSV(csvPath);
    console.log(`✅ Parsed ${rows.length} items from CSV\n`);

    // Extract unique locations
    const uniqueLocations = [...new Set(rows.map(r => r.location).filter(l => l && l !== 'Unspecified'))];
    console.log(`📍 Found ${uniqueLocations.length} unique locations`);

    // Create locations
    const locationMap = new Map<string, string>();
    for (const locName of uniqueLocations) {
      try {
        const loc = await prisma.location.create({
          data: {
            name: locName.slice(0, 100),
            type: 'storage',
            notes: `Imported from inventory CSV`,
          },
        });
        locationMap.set(locName, loc.id);
      } catch (error: any) {
        if (error.code === 'P2002') {
          // Already exists
          const existing = await prisma.location.findFirst({ where: { name: locName } });
          if (existing) locationMap.set(locName, existing.id);
        }
      }
    }
    console.log(`✅ Created/linked ${locationMap.size} locations\n`);

    // Extract unique categories
    const categories = [...new Set(rows.map(r => categorizeProduct(r.description)))];
    console.log(`📂 Found ${categories.length} categories`);

    // Create categories
    const categoryMap = new Map<string, string>();
    for (const catName of categories) {
      try {
        const cat = await prisma.category.create({
          data: {
            name: catName,
            description: `Auto-categorized from inventory import`,
          },
        });
        categoryMap.set(catName, cat.id);
      } catch (error: any) {
        if (error.code === 'P2002') {
          const existing = await prisma.category.findFirst({ where: { name: catName } });
          if (existing) categoryMap.set(catName, existing.id);
        }
      }
    }
    console.log(`✅ Created/linked ${categoryMap.size} categories\n`);

    // Import products
    console.log(`🛍️ Importing products...`);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const category = categorizeProduct(row.description);
      const categoryId = categoryMap.get(category);
      const locationId = locationMap.get(row.location);

      if (!categoryId) {
        console.error(`❌ Row ${i + 1}: Missing category`);
        errorCount++;
        continue;
      }

      // Build metadata in description
      const metadata = [
        row.modelNumber ? `Model: ${row.modelNumber}` : '',
        row.serialNumber ? `S/N: ${row.serialNumber}` : '',
        row.macId ? `MAC: ${row.macId}` : '',
        row.note ? `Note: ${row.note}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      const stock = row.count ? parseInt(row.count) : 1;

      try {
        await prisma.product.create({
          data: {
            sku: generateSKU(i, row.description),
            name: row.description.slice(0, 255),
            description: metadata || undefined,
            categoryId,
            locationId: locationId || undefined,
            currentStock: isNaN(stock) ? 1 : Math.max(1, stock),
            unit: 'pcs',
            lowStockThreshold: 10,
          },
        });
        successCount++;

        if ((i + 1) % 100 === 0) {
          console.log(`   Processed ${i + 1}/${rows.length} products...`);
        }
      } catch (error: any) {
        console.error(`❌ Row ${i + 1}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n✅ Import complete!`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total: ${successCount + errorCount}`);

  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importCSV();
