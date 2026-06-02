import { Product, Category, Location } from '@/types/inventory';
import { ProductFilter, ProductSort, StockStatus } from '@/types/filters';

export const UNASSIGNED_LOCATION = '__UNASSIGNED__';

export function getProductLocationFilterValue(product: any): string {
  const locationId = product.locationId;
  const locationName = product.location?.name?.trim();

  const hasNoLocationId = locationId === null || locationId === undefined || locationId === '';
  const hasNoLocationName = !locationName;
  const isNamedUnassigned = locationName?.toLowerCase() === 'unassigned';

  if (hasNoLocationId || hasNoLocationName || isNamedUnassigned) {
    return UNASSIGNED_LOCATION;
  }

  return String(locationId);
}

export const getStockStatus = (product: Product): StockStatus => {
  if (product.currentStock < 0) return 'negative-stock';
  if (product.currentStock === 0) return 'out-of-stock';
  if (product.currentStock > 0 && product.currentStock <= product.lowStockThreshold) return 'low-stock';
  if (product.currentStock > product.lowStockThreshold * 3) return 'overstock';
  return 'in-stock';
};

export const isWithinDateRange = (createdAt: string, range: 'all' | '7days' | '30days' | '90days'): boolean => {
  const now = new Date();
  const created = new Date(createdAt);
  const daysDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

  if (range === '7days') return daysDiff <= 7;
  if (range === '30days') return daysDiff <= 30;
  if (range === '90days') return daysDiff <= 90;
  return true;
};

export const filterProducts = (products: Product[], filter: ProductFilter): Product[] => {
  const search = filter.search.trim().toLowerCase();

  return products.filter((product) => {
    const matchesSearch =
      !search ||
      product.name.toLowerCase().includes(search) ||
      product.sku.toLowerCase().includes(search) ||
      (product.location?.name ?? 'unassigned').toLowerCase().includes(search);

    const matchesCategory =
      !filter.categoryId || product.categoryId === filter.categoryId;

    const matchesLocation =
      !filter.locationId ||
      getProductLocationFilterValue(product) === filter.locationId;

    const matchesStockStatus =
      !filter.stockStatus || getStockStatus(product) === filter.stockStatus;

    const matchesDepartment =
      !filter.departmentId || product.departmentId === filter.departmentId;

    const matchesUnit =
      !filter.unit || product.unit === filter.unit;

    const matchesDateRange = isWithinDateRange(
      product.createdAt || new Date().toISOString(),
      filter.dateRange
    );

    const matchesSource = !filter.source || (() => {
      const src = (product as any).source;
      if (filter.source === 'manual') return src === 'manual';
      if (filter.source === 'csv_import') return src === 'csv_import';
      if (filter.source === 'unknown') return !src || src === 'unknown';
      return true;
    })();

    const matchesCsvImportId = !filter.csvImportId || (product as any).csvImportId === filter.csvImportId;

    const matchesProductStatus = !filter.productStatus || (product as any).status === filter.productStatus;

    const unitPrice = parseFloat((product as any).unitPrice ?? 0);
    const matchesPriceStatus = !filter.priceStatus || (() => {
      if (filter.priceStatus === 'with-price') return unitPrice > 0;
      if (filter.priceStatus === 'zero-price') return unitPrice === 0;
      if (filter.priceStatus === 'missing-price') return (product as any).unitPrice == null;
      if (filter.priceStatus === 'high-price') return unitPrice >= 10000;
      if (filter.priceStatus === 'low-price') return unitPrice > 0 && unitPrice < 10000;
      return true;
    })();

    const totalValue = unitPrice * (product.currentStock ?? 0);
    const matchesValueStatus = !filter.valueStatus || (() => {
      if (filter.valueStatus === 'with-value') return totalValue > 0;
      if (filter.valueStatus === 'zero-value') return totalValue === 0;
      if (filter.valueStatus === 'high-value') return totalValue >= 50000;
      if (filter.valueStatus === 'low-value') return totalValue > 0 && totalValue < 50000;
      if (filter.valueStatus === 'missing') return (product as any).unitPrice == null;
      return true;
    })();


    const now = Date.now();
    const added = product.createdAt ? new Date(product.createdAt).getTime() : null;
    const matchesDateAdded = !filter.dateAdded || (() => {
      if (!added) return false;

      const age = now - added;
      if (filter.dateAdded === 'today') return age >= 0 && age < 86400000;
      if (filter.dateAdded === 'yesterday') return age >= 86400000 && age < 2 * 86400000;
      if (filter.dateAdded === 'last-week') return age >= 7 * 86400000 && age < 30 * 86400000;
      if (filter.dateAdded === 'last-month') return age >= 30 * 86400000 && age < 90 * 86400000;
      if (filter.dateAdded === 'this-year') return age >= 90 * 86400000 && age < 365 * 86400000;
      if (filter.dateAdded === 'older-1-year') return age >= 365 * 86400000;
      return true;
    })();

    const lastMoved = (product as any).lastMovementAt ? new Date((product as any).lastMovementAt).getTime() : null;
    const matchesLastMovement = !filter.lastMovement || (() => {
      if (filter.lastMovement === 'no-movement') return !lastMoved;
      if (filter.lastMovement === 'moved-today') return !!lastMoved && now - lastMoved < 86400000;
      if (filter.lastMovement === 'moved-week') return !!lastMoved && now - lastMoved < 7 * 86400000;
      if (filter.lastMovement === 'moved-month') return !!lastMoved && now - lastMoved < 30 * 86400000;
      if (filter.lastMovement === 'moved-3months') return !!lastMoved && now - lastMoved < 90 * 86400000;
      return true;
    })();

    const matchesDataQuality = !filter.dataQuality || (() => {
      const isTest = ['test', 'n/a', 'none', 'sample'].includes((product.name || '').toLowerCase());
      if (filter.dataQuality === 'complete') return !!product.sku && !!product.categoryId && !!product.locationId && !!product.unit && unitPrice > 0;
      if (filter.dataQuality === 'incomplete') return !product.sku || !product.categoryId || !product.locationId || !product.unit;
      if (filter.dataQuality === 'missing-sku') return !product.sku;
      if (filter.dataQuality === 'missing-category') return !product.categoryId;
      if (filter.dataQuality === 'missing-location') return !product.locationId;
      if (filter.dataQuality === 'missing-unit') return !product.unit;
      if (filter.dataQuality === 'missing-price') return (product as any).unitPrice == null;
      if (filter.dataQuality === 'zero-price') return unitPrice === 0;
      if (filter.dataQuality === 'missing-threshold') return !product.lowStockThreshold && product.lowStockThreshold !== 0;
      if (filter.dataQuality === 'no-threshold') return (product as any).lowStockThreshold === 0;
      if (filter.dataQuality === 'test-data') return isTest;
      if (filter.dataQuality === 'expiry-expired') {
        const exp = (product as any).expiryDate;
        return exp && new Date(exp) < new Date() && (product as any).status === 'active';
      }
      if (filter.dataQuality === 'expiry-soon') {
        const exp = (product as any).expiryDate;
        const in30 = new Date(); in30.setDate(in30.getDate() + 30);
        return exp && new Date(exp) >= new Date() && new Date(exp) <= in30;
      }
      if (filter.dataQuality === 'discontinued-with-stock') {
        return ['discontinued', 'obsolete'].includes((product as any).status || '') && (product.currentStock ?? 0) > 0;
      }
      return true;
    })();

    return (
      matchesSearch &&
      matchesCategory &&
      matchesLocation &&
      matchesStockStatus &&
      matchesDepartment &&
      matchesUnit &&
      matchesDateRange &&
      matchesSource &&
      matchesCsvImportId &&
      matchesProductStatus &&
      matchesPriceStatus &&
      matchesValueStatus &&
      matchesDateAdded &&
      matchesLastMovement &&
      matchesDataQuality
    );
  });
};

export const sortProducts = (products: Product[], sort: ProductSort): Product[] => {
  const sorted = [...products];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'sku':
        comparison = a.sku.localeCompare(b.sku);
        break;
      case 'stock':
        comparison = a.currentStock - b.currentStock;
        break;
      case 'date':
        comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        break;
      case 'low-stock':
        comparison = a.currentStock - b.currentStock;
        break;
    }

    return sort.order === 'desc' ? -comparison : comparison;
  });

  return sorted;
};

export const filterAndSortProducts = (
  products: Product[],
  filter: ProductFilter,
  sort: ProductSort
): Product[] => {
  return sortProducts(filterProducts(products, filter), sort);
};

export const filterCategories = (
  categories: Category[],
  search: string
): Category[] => {
  const term = search.trim().toLowerCase();
  if (!term) return categories;

  return categories.filter(
    (cat) =>
      cat.name.toLowerCase().includes(term) ||
      cat.description?.toLowerCase().includes(term)
  );
};

export const filterLocations = (
  locations: Location[],
  search: string,
  type?: string
): Location[] => {
  const term = search.trim().toLowerCase();

  return locations.filter((loc) => {
    const matchesSearch = !term || loc.name.toLowerCase().includes(term);
    const matchesType = !type || loc.type === type;
    return matchesSearch && matchesType;
  });
};

export const clearProductFilters = (): ProductFilter => ({
  search: '',
  categoryId: undefined,
  locationId: undefined,
  stockStatus: undefined,
  departmentId: undefined,
  unit: undefined,
  dateRange: 'all',
  productStatus: undefined,
  priceStatus: undefined,
  valueStatus: undefined,
  source: undefined,
  csvImportId: undefined,
  dateAdded: undefined,
  lastMovement: undefined,
  dataQuality: undefined,
});

export const filterStockMovements = (
  movements: any[],
  filter: any,
  getProductName: (id: string) => string
): any[] => {
  const search = filter.search.trim().toLowerCase();

  return movements.filter((movement) => {
    let matchesSearch = true;
    if (search) {
      const itemTokens = (movement.items || [])
        .flatMap((item: any) => [
          (item.product?.name || getProductName(item.productId) || '').toLowerCase(),
          (item.stockDetail?.stockId || '').toLowerCase(),
        ])
        .join(' ');
      const movementNo = (movement.movementNo || '').toLowerCase();
      const remarks = (movement.remarks || '').toLowerCase();
      matchesSearch = itemTokens.includes(search) || movementNo.includes(search) || remarks.includes(search);
    }
    const matchesType = !filter.movementType || movement.movementType === filter.movementType;
    const matchesStatus = !filter.movementStatus || movement.status === filter.movementStatus;
    const matchesDateRange = isWithinDateRange(
      movement.createdAt || new Date().toISOString(),
      filter.dateRange
    );

    return matchesSearch && matchesType && matchesStatus && matchesDateRange;
  });
};

export const sortStockMovements = (
  movements: any[],
  field: string,
  getProductName: (id: string) => string
): any[] => {
  const sorted = [...movements];

  sorted.sort((a, b) => {
    switch (field) {
      case 'recently-added':
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case 'oldest':
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      case 'product-name': {
        const nameA = (a.items?.[0]?.product?.name || getProductName(a.items?.[0]?.productId) || '').toLowerCase();
        const nameB = (b.items?.[0]?.product?.name || getProductName(b.items?.[0]?.productId) || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }
      case 'quantity-high':
        return b.quantity - a.quantity;
      case 'quantity-low':
        return a.quantity - b.quantity;
      default:
        return 0;
    }
  });

  return sorted;
};
