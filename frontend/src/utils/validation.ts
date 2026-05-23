export const validateEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validateProductName = (name: string): boolean => {
  return name.trim().length > 0 && name.trim().length <= 255;
};

export const validateSKU = (sku: string): boolean => {
  return sku.trim().length > 0 && sku.trim().length <= 50;
};

export const validateStock = (stock: number): boolean => {
  return Number.isInteger(stock) && stock >= 0;
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 6;
};
