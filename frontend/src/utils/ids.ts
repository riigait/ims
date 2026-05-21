export const generateId = () => crypto.randomUUID();

export const generateSKU = () => {
  return 'SKU-' + Date.now().toString(36).toUpperCase();
};

export const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US').format(num);
};
