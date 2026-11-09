import {initialExpenses, initialProducts, initialSales, initialWaste} from "./demo";
import * as D from "./inventory";
import type {AppState, Result, ProductInput, SaleLine} from "./inventory";

/**
 * DataSource = satu-satunya pintu UI ke data. UI tidak tahu apakah data ada di browser (LocalSource)
 * atau di Supabase (CloudSource, lihat cloud.ts). Semua operasi async dan mengembalikan Result berisi
 * state terbaru, sehingga UI cukup menampilkan hasilnya.
 */
export interface DataSource {
  readonly kind: "local" | "cloud";
  load(): Promise<{state: AppState; notice?: string}>;
  addProduct(input: ProductInput): Promise<Result>;
  updateProduct(id: string, input: Omit<ProductInput, "stock">): Promise<Result>;
  deleteProduct(id: string): Promise<Result>;
  recordSale(lines: SaleLine[]): Promise<Result>;
  voidSale(saleId: string): Promise<Result>;
  receiveStock(input: {productId: string; qty: number; unitCost: number; note?: string}): Promise<Result>;
  adjustStock(input: {productId: string; newStock: number; note?: string}): Promise<Result>;
  addExpense(input: {name: string; amount: number; category: string}): Promise<Result>;
  addWaste(input: {ingredient: string; amount: number; reason: string}): Promise<Result>;
  deleteExpense(id: string): Promise<Result>;
  deleteWaste(id: string): Promise<Result>;
  /** Mengganti seluruh data (pulihkan cadangan / reset demo). Hanya didukung mode lokal. */
  replaceAll(state: AppState, message: string): Promise<Result>;
}

export type KV = {getItem(k: string): string | null; setItem(k: string, v: string): void};
export const STORAGE_KEY = "stokcerdas-retail-v2";
/** Perkiraan kuota localStorage per origin: ±5 juta karakter (UTF-16). Dipakai untuk memperingatkan sebelum penuh. */
export const LOCAL_QUOTA_CHARS = 5_000_000;
export function localUsage(state: AppState): {chars: number; pct: number; level: "ok" | "warn" | "full"} {
  const chars = JSON.stringify(state).length;
  const pct = Math.min(999, Math.round(chars / LOCAL_QUOTA_CHARS * 1000) / 10);
  return {chars, pct, level: pct >= 90 ? "full" : pct >= 70 ? "warn" : "ok"};
}
export const demoState = (): AppState => ({products: initialProducts, sales: initialSales, expenses: initialExpenses, waste: initialWaste, movements: []});

export function createLocalSource(kv: KV | null): DataSource {
  let state: AppState = demoState();

  const commit = (r: Result): Promise<Result> => {
    if (!r.ok) return Promise.resolve(r);
    state = r.state;
    try { kv?.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { return Promise.resolve({...r, message: `${r.message} Peringatan: penyimpanan browser penuh atau tidak tersedia; unduh cadangan agar data tidak hilang.`}); }
    return Promise.resolve(r);
  };

  return {
    kind: "local",
    async load() {
      let raw: string | null = null;
      try { raw = kv?.getItem(STORAGE_KEY) ?? null; } catch { raw = null; }
      if (!raw) { state = demoState(); return {state}; }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.products)) throw new Error("bentuk data tidak dikenali");
        const {state: clean, dropped} = D.sanitizeState(parsed);
        state = clean;
        return {state, notice: dropped ? `${dropped} baris data rusak dibuang saat memuat data tersimpan.` : undefined};
      } catch {
        // data tidak terbaca: simpan salinannya agar tidak hilang, lalu mulai dari data demo
        try { kv?.setItem(`${STORAGE_KEY}-rusak-${Date.now()}`, raw); } catch { /* abaikan */ }
        state = demoState();
        return {state, notice: "Data tersimpan rusak dan tidak bisa dibaca. Salinannya disimpan terpisah; aplikasi memakai data demo."};
      }
    },
    addProduct: input => commit(D.addProduct(state, input)),
    updateProduct: (id, input) => commit(D.updateProduct(state, id, input)),
    deleteProduct: id => commit(D.deleteProduct(state, id)),
    recordSale: lines => commit(D.recordSale(state, lines)),
    voidSale: id => commit(D.voidSale(state, id)),
    receiveStock: input => commit(D.receiveStock(state, input)),
    adjustStock: input => commit(D.adjustStock(state, input)),
    addExpense: input => commit(D.addExpense(state, input)),
    addWaste: input => commit(D.addWaste(state, input)),
    deleteExpense: id => commit(D.deleteExpense(state, id)),
    deleteWaste: id => commit(D.deleteWaste(state, id)),
    replaceAll: (next, message) => commit({ok: true, state: next, message}),
  };
}
