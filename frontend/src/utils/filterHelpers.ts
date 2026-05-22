import { Product, Category, Location } from '@/types/inventory';
import { ProductFilter, ProductSort, StockStatus } from '@/types/filters';

export const getStockStatus = (product: Product): StockStatus => {
  if (product.currentStock === 0) return 'out-of-stock';
  if (product.currentStock > 0 && product.currentStock <= product.lowStockThreshold) return 'low-stock';
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
      product.sku.toLowerCase().includes(search);

    const matchesCategory =
      !filter.categoryId || product.categoryId === filter.categoryId;

    const matchesLocation =
      !filter.locationId || product.locationId === filter.locationId;

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

    return (
      matchesSearch &&
      matchesCategory &&
      matchesLocation &&
      matchesStockStatus &&
      matchesDepartment &&
      matchesUnit &&
      matchesDateRange
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
        comparison = b.currentStock - a.currentStock;
        break;
      case 'date':
        comparison = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
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
});
