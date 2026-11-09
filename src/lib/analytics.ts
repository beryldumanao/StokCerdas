import type {Product, Sale} from "./demo";

/** Asumsi default (dapat disesuaikan dengan pemasok toko). */
export const LEAD_TIME_DAYS = 3;
export const SAFETY_DAYS = 2;

export type StockStatus = "kritis" | "waspada" | "aman" | "lambat";

export type StockRow = {
  product: Product;
  sold: number;
  avgDaily: number;
  /** Berapa hari stok cukup pada kecepatan jual saat ini. null = tidak ada penjualan. */
  daysCover: number | null;
  status: StockStatus;
  suggestedQty: number;
  restockCost: number;
  /** Estimasi laba kotor yang hilang selama menunggu restok (hanya status kritis). */
  marginAtRisk: number;
};

export type StockHealth = {
  rows: StockRow[];
  tiedCapital: number;
  deadCapital: number;
  marginAtRisk: number;
  restockBudget: number;
  /** 0-100. Aman=1, Waspada=0.6, Lambat=0.5, Kritis=0 (rata-rata semua produk). */
  score: number;
  counts: Record<StockStatus, number>;
};

const WEIGHT: Record<StockStatus, number> = {aman: 1, waspada: 0.6, lambat: 0.5, kritis: 0};

/**
 * Analisis kesehatan stok berbasis aturan.
 * @param sales  penjualan yang SUDAH difilter pada periode terpilih
 * @param periodDays panjang periode (hari) dipakai sebagai pembagi rata-rata harian
 */
export function analyzeStock(products: Product[], sales: Sale[], periodDays: number): StockHealth {
  const days = Math.max(1, Math.floor(periodDays) || 1);
  const soldBy = new Map<string, number>();
  for (const s of sales) soldBy.set(s.productId, (soldBy.get(s.productId) || 0) + s.qty);

  const rows: StockRow[] = products.map(product => {
    const sold = soldBy.get(product.id) || 0;
    const avgDaily = sold / days;
    const daysCover = avgDaily > 0 ? product.stock / avgDaily : null;
    let status: StockStatus;
    if (sold === 0) status = product.stock > 0 ? "lambat" : "aman";
    else if (daysCover! < LEAD_TIME_DAYS) status = "kritis";
    else if (daysCover! < LEAD_TIME_DAYS + SAFETY_DAYS) status = "waspada";
    else status = "aman";

    const target = Math.ceil(avgDaily * (LEAD_TIME_DAYS + SAFETY_DAYS));
    const suggestedQty = sold > 0 ? Math.max(0, target - product.stock) : 0;
    const shortfallDays = status === "kritis" ? LEAD_TIME_DAYS - daysCover! : 0;
    const marginAtRisk = Math.round(shortfallDays * avgDaily * Math.max(0, product.price - product.cost));
    return {product, sold, avgDaily, daysCover, status, suggestedQty, restockCost: suggestedQty * product.cost, marginAtRisk};
  });

  const counts: Record<StockStatus, number> = {kritis: 0, waspada: 0, aman: 0, lambat: 0};
  for (const r of rows) counts[r.status]++;

  return {
    rows,
    tiedCapital: products.reduce((a, p) => a + p.stock * p.cost, 0),
    deadCapital: rows.filter(r => r.status === "lambat").reduce((a, r) => a + r.product.stock * r.product.cost, 0),
    marginAtRisk: rows.reduce((a, r) => a + r.marginAtRisk, 0),
    restockBudget: rows.reduce((a, r) => a + r.restockCost, 0),
    score: rows.length ? Math.round(rows.reduce((a, r) => a + WEIGHT[r.status], 0) / rows.length * 100) : 100,
    counts,
  };
}
