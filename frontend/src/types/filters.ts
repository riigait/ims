export type SortOrder = 'asc' | 'desc';
export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock';
export type DateRange = 'all' | '7days' | '30days' | '90days';

export interface ProductFilter {
  search: string;
  categoryId?: string;
  locationId?: string;
  stockStatus?: StockStatus;
  departmentId?: string;
  unit?: string;
  dateRange: DateRange;
}

export interface ProductSort {
  field: 'name' | 'sku' | 'stock' | 'date' | 'low-stock';
  order: SortOrder;
}

export interface CategoryFilter {
  search: string;
}

export interface LocationFilter {
  search: string;
  type?: string;
}

export interface StockMovementFilter {
  search: string;
  productId?: string;
  movementType?: 'stock_in' | 'stock_out';
  dateRange: DateRange;
  userId?: string;
}

export interface FilterState<T> {
  filters: T;
  sort?: { field: string; order: SortOrder };
}
