export function sceneScale(stock: number, referenceStock: number) {
  if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(referenceStock) || referenceStock <= 0) throw new Error('Invalid scene stock or visual reference.');
  return { level: Math.min(stock / referenceStock, 1), aboveReference: stock > referenceStock };
}
