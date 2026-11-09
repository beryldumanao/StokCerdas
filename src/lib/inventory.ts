import type {Product, Sale, Expense, Waste} from "./demo";

/**
 * Logika bisnis inti StokCerdas (murni, tanpa React/DOM) agar mudah diuji.
 * Setiap operasi mengembalikan state BARU atau pesan galat; state lama tidak pernah diubah,
 * sehingga operasi bersifat atomik: gagal = tidak ada perubahan sama sekali.
 */

export type MovementType = "awal" | "penjualan" | "retur" | "pembelian" | "penyesuaian";
export type Movement = {id: string; date: string; productId: string; productName: string; type: MovementType; qty: number; balance: number; note: string};
export type AppState = {products: Product[]; sales: Sale[]; expenses: Expense[]; waste: Waste[]; movements: Movement[]};
export type Result = {ok: true; state: AppState; message: string} | {ok: false; error: string};
export type ProductInput = {name: string; category: string; price: number; cost: number; stock: number; minStock: number; unit: string; imageName?: string; imageData?: string};

export const MAX_MOVEMENTS = 1000;
export const BACKUP_VERSION = 3;
const MOVEMENT_TYPES: MovementType[] = ["awal", "penjualan", "retur", "pembelian", "penyesuaian"];

const uid = () => globalThis.crypto.randomUUID();
/** Tanggal lokal (YYYY-MM-DD), bukan UTC, supaya transaksi dini hari tidak mundur sehari. */
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fail = (error: string): Result => ({ok: false, error});
const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const isMoney = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e12;
const withMovement = (movements: Movement[], m: Omit<Movement, "id">): Movement[] => [{id: uid(), ...m}, ...movements].slice(0, MAX_MOVEMENTS);

export function validateProduct(i: ProductInput, products: Product[], selfId?: string): string | null {
  const name = (i.name || "").trim();
  if (!name) return "Nama produk wajib diisi.";
  if (name.length > 80) return "Nama produk maksimal 80 karakter.";
  if (products.some(p => p.id !== selfId && p.name.trim().toLowerCase() === name.toLowerCase())) return `Produk “${name}” sudah ada.`;
  if (!isMoney(i.price) || i.price <= 0) return "Harga jual harus lebih dari 0.";
  if (!isMoney(i.cost)) return "Modal beli harus berupa angka 0 atau lebih.";
  if (!isInt(i.stock) || i.stock < 0) return "Stok harus bilangan bulat 0 atau lebih.";
  if (!isInt(i.minStock) || i.minStock < 0) return "Batas minimum harus bilangan bulat 0 atau lebih.";
  if (!(i.unit || "").trim()) return "Satuan wajib diisi.";
  return null;
}

export function addProduct(state: AppState, input: ProductInput, date = localDate()): Result {
  const err = validateProduct(input, state.products);
  if (err) return fail(err);
  const p: Product = {id: uid(), name: input.name.trim(), category: input.category, price: input.price, cost: input.cost, stock: input.stock, minStock: input.minStock, unit: input.unit.trim(), imageName: (input.imageName || "").trim(), imageData: input.imageData || ""};
  const movements = p.stock > 0 ? withMovement(state.movements, {date, productId: p.id, productName: p.name, type: "awal", qty: p.stock, balance: p.stock, note: "Stok awal"}) : state.movements;
  return {ok: true, state: {...state, products: [p, ...state.products], movements}, message: "Produk berhasil ditambahkan."};
}

/** Mengubah data produk. Stok TIDAK diubah di sini; gunakan adjustStock/receiveStock agar tercatat di buku stok. */
export function updateProduct(state: AppState, id: string, input: Omit<ProductInput, "stock">): Result {
  const cur = state.products.find(p => p.id === id);
  if (!cur) return fail("Produk tidak ditemukan.");
  const err = validateProduct({...input, stock: cur.stock}, state.products, id);
  if (err) return fail(err);
  const next: Product = {...cur, name: input.name.trim(), category: input.category, price: input.price, cost: input.cost, minStock: input.minStock, unit: input.unit.trim(), imageName: (input.imageName ?? cur.imageName ?? "").trim(), imageData: input.imageData ?? cur.imageData ?? ""};
  return {ok: true, state: {...state, products: state.products.map(p => p.id === id ? next : p)}, message: "Produk diperbarui. Transaksi lama tetap memakai harga dan modal saat itu."};
}

export function deleteProduct(state: AppState, id: string): Result {
  const cur = state.products.find(p => p.id === id);
  if (!cur) return fail("Produk tidak ditemukan.");
  if (state.sales.some(s => s.productId === id)) return fail(`“${cur.name}” punya riwayat penjualan sehingga tidak bisa dihapus. Batalkan penjualannya dulu, atau biarkan produk tetap ada.`);
  return {ok: true, state: {...state, products: state.products.filter(p => p.id !== id)}, message: `“${cur.name}” dihapus.`};
}

export function addExpense(state: AppState, input: {name: string; amount: number; category: string}, date = localDate()): Result {
  const name = (input.name || "").trim();
  if (!name) return fail("Nama biaya wajib diisi.");
  if (name.length > 160) return fail("Nama biaya maksimal 160 karakter.");
  if (!isMoney(input.amount) || input.amount <= 0) return fail("Nominal biaya harus lebih dari 0.");
  return {ok: true, state: {...state, expenses: [{id: uid(), date, name, amount: input.amount, category: input.category || "Operasional"}, ...state.expenses]}, message: "Biaya berhasil dicatat."};
}

export function addWaste(state: AppState, input: {ingredient: string; amount: number; reason: string}, date = localDate()): Result {
  const ingredient = (input.ingredient || "").trim();
  if (!ingredient) return fail("Nama barang wajib diisi.");
  if (ingredient.length > 160) return fail("Nama barang maksimal 160 karakter.");
  if (!isMoney(input.amount) || input.amount <= 0) return fail("Nilai kerugian harus lebih dari 0.");
  return {ok: true, state: {...state, waste: [{id: uid(), date, ingredient, amount: input.amount, reason: input.reason || "Barang rusak"}, ...state.waste]}, message: "Barang rusak/hilang berhasil dicatat."};
}

export function deleteExpense(state: AppState, id: string): Result {
  const cur = state.expenses.find(e => e.id === id);
  if (!cur) return fail("Catatan biaya tidak ditemukan.");
  return {ok: true, state: {...state, expenses: state.expenses.filter(e => e.id !== id)}, message: `Biaya “${cur.name}” dihapus.`};
}

export function deleteWaste(state: AppState, id: string): Result {
  const cur = state.waste.find(w => w.id === id);
  if (!cur) return fail("Catatan barang rusak tidak ditemukan.");
  return {ok: true, state: {...state, waste: state.waste.filter(w => w.id !== id)}, message: `Catatan “${cur.ingredient}” dihapus.`};
}

export type SaleLine = {productId: string; qty: number};

/** Mencatat satu struk berisi banyak item. Semua item divalidasi dulu; jika satu gagal, tidak ada yang tercatat. */
export function recordSale(state: AppState, lines: SaleLine[], date = localDate()): Result {
  if (!lines.length) return fail("Tambahkan minimal satu produk.");
  const merged = new Map<string, number>();
  for (const l of lines) {
    if (!isInt(l.qty) || l.qty < 1 || l.qty > 1e6) return fail("Jumlah harus bilangan bulat 1 atau lebih.");
    merged.set(l.productId, (merged.get(l.productId) || 0) + l.qty);
  }
  for (const [pid, qty] of merged) {
    const p = state.products.find(x => x.id === pid);
    if (!p) return fail("Produk tidak ditemukan.");
    if (p.stock < qty) return fail(`Stok ${p.name} tidak cukup (tersisa ${p.stock} ${p.unit}, diminta ${qty}).`);
  }
  const receiptId = uid();
  let products = state.products, movements = state.movements;
  const sales: Sale[] = [];
  for (const [pid, qty] of merged) {
    const p = products.find(x => x.id === pid)!;
    const balance = p.stock - qty;
    products = products.map(x => x.id === pid ? {...x, stock: balance} : x);
    sales.push({id: uid(), receiptId, date, at: new Date().toISOString(), productId: p.id, productName: p.name, qty, price: p.price, cost: p.cost, total: p.price * qty});
    movements = withMovement(movements, {date, productId: p.id, productName: p.name, type: "penjualan", qty: -qty, balance, note: "Penjualan"});
  }
  const total = sales.reduce((a, s) => a + s.total, 0);
  return {ok: true, state: {...state, products, sales: [...sales, ...state.sales], movements}, message: `Penjualan tersimpan (${sales.length} item, total ${total.toLocaleString("id-ID")}). Stok diperbarui.`};
}

/** Membatalkan penjualan (retur). Jika bagian dari struk multi-item, seluruh struk dibatalkan dan stok dikembalikan. */
export function voidSale(state: AppState, saleId: string, date = localDate()): Result {
  const sale = state.sales.find(s => s.id === saleId);
  if (!sale) return fail("Transaksi tidak ditemukan.");
  const group = sale.receiptId ? state.sales.filter(s => s.receiptId === sale.receiptId) : [sale];
  let products = state.products, movements = state.movements;
  for (const s of group) {
    const p = products.find(x => x.id === s.productId);
    if (!p) continue;
    const balance = p.stock + s.qty;
    products = products.map(x => x.id === s.productId ? {...x, stock: balance} : x);
    movements = withMovement(movements, {date, productId: p.id, productName: p.name, type: "retur", qty: s.qty, balance, note: "Pembatalan penjualan"});
  }
  const ids = new Set(group.map(s => s.id));
  return {ok: true, state: {...state, products, sales: state.sales.filter(s => !ids.has(s.id)), movements}, message: `${group.length} transaksi dibatalkan dan stok dikembalikan.`};
}

/** Penerimaan barang dari pemasok. Modal per unit dihitung rata-rata tertimbang; modal transaksi lama tidak berubah. */
export function receiveStock(state: AppState, input: {productId: string; qty: number; unitCost: number; note?: string}, date = localDate()): Result {
  const p = state.products.find(x => x.id === input.productId);
  if (!p) return fail("Produk tidak ditemukan.");
  if (!isInt(input.qty) || input.qty < 1 || input.qty > 1e6) return fail("Jumlah diterima harus bilangan bulat 1 atau lebih.");
  if (!isMoney(input.unitCost)) return fail("Harga beli per unit harus berupa angka 0 atau lebih.");
  const balance = p.stock + input.qty;
  const cost = Math.round((p.stock * p.cost + input.qty * input.unitCost) / balance);
  return {
    ok: true,
    state: {...state, products: state.products.map(x => x.id === p.id ? {...x, stock: balance, cost} : x), movements: withMovement(state.movements, {date, productId: p.id, productName: p.name, type: "pembelian", qty: input.qty, balance, note: (input.note || "").trim() || "Penerimaan barang"})},
    message: `${input.qty} ${p.unit} ${p.name} diterima. Modal rata-rata kini ${cost.toLocaleString("id-ID")}/unit.`,
  };
}

/** Stok opname: menyamakan stok sistem dengan hitungan fisik. Selisih tercatat di buku stok. */
export function adjustStock(state: AppState, input: {productId: string; newStock: number; note?: string}, date = localDate()): Result {
  const p = state.products.find(x => x.id === input.productId);
  if (!p) return fail("Produk tidak ditemukan.");
  if (!isInt(input.newStock) || input.newStock < 0) return fail("Stok fisik harus bilangan bulat 0 atau lebih.");
  const delta = input.newStock - p.stock;
  if (delta === 0) return fail("Stok fisik sama dengan stok sistem. Tidak ada yang perlu disesuaikan.");
  return {
    ok: true,
    state: {...state, products: state.products.map(x => x.id === p.id ? {...x, stock: input.newStock} : x), movements: withMovement(state.movements, {date, productId: p.id, productName: p.name, type: "penyesuaian", qty: delta, balance: input.newStock, note: (input.note || "").trim() || "Stok opname"})},
    message: `Stok ${p.name} disesuaikan ${delta > 0 ? "+" : ""}${delta} ${p.unit}.`,
  };
}

/** Pemeriksaan konsistensi data. Mengembalikan daftar masalah (kosong = sehat). */
export function checkIntegrity(state: AppState): string[] {
  const issues: string[] = [];
  const dup = (label: string, ids: string[]) => { if (new Set(ids).size !== ids.length) issues.push(`ID ganda pada ${label}.`); };
  dup("produk", state.products.map(p => p.id)); dup("penjualan", state.sales.map(s => s.id)); dup("buku stok", state.movements.map(m => m.id));
  for (const p of state.products) if (p.stock < 0) issues.push(`Stok ${p.name} negatif (${p.stock}).`);
  const ids = new Set(state.products.map(p => p.id));
  for (const s of state.sales) {
    if (!ids.has(s.productId)) issues.push(`Penjualan ${s.productName} mengacu ke produk yang sudah tidak ada.`);
    if (Math.abs(s.total - s.price * s.qty) > 0.5) issues.push(`Total penjualan ${s.productName} (${s.date}) tidak sama dengan harga × jumlah.`);
  }
  const latest = new Map<string, Movement>();
  for (const m of state.movements) if (!latest.has(m.productId)) latest.set(m.productId, m); // movements: terbaru di depan
  for (const [pid, m] of latest) {
    const p = state.products.find(x => x.id === pid);
    if (p && p.stock !== m.balance) issues.push(`Saldo buku stok ${p.name} (${m.balance}) tidak sama dengan stok produk (${p.stock}).`);
  }
  return issues;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, d = "") => typeof v === "string" ? v : d;
const rows = (v: unknown): any[] => Array.isArray(v) ? v.filter(x => x && typeof x === "object") : [];

/** Membersihkan data dari penyimpanan/berkas: baris rusak dibuang, bukan membuat aplikasi crash. */
export function sanitizeState(raw: unknown): {state: AppState; dropped: number} {
  const r: any = raw && typeof raw === "object" ? raw : {};
  let dropped = 0;
  const keep = <T,>(src: unknown, ok: (x: any) => T | null): T[] => {
    const seen = new Set<string>(); const out: T[] = [];
    for (const x of rows(src)) { const v = ok(x); if (v && !seen.has((v as any).id)) { seen.add((v as any).id); out.push(v); } else dropped++; }
    return out;
  };
  const products = keep<Product>(r.products, x => typeof x.id === "string" && x.id && str(x.name).trim() && isMoney(x.price) && isMoney(x.cost) && isMoney(x.stock) && isMoney(x.minStock)
    ? {id: x.id, name: str(x.name).trim(), category: str(x.category, "Lainnya"), price: x.price, cost: x.cost, stock: x.stock, minStock: x.minStock, unit: str(x.unit, "pcs") || "pcs", imageName: str(x.imageName), imageData: str(x.imageData)} : null);
  const sales = keep<Sale>(r.sales, x => typeof x.id === "string" && x.id && DATE.test(str(x.date)) && typeof x.productId === "string" && isMoney(x.qty) && x.qty > 0 && isMoney(x.price) && isMoney(x.cost) && isMoney(x.total)
    ? {id: x.id, ...(typeof x.receiptId === "string" ? {receiptId: x.receiptId} : {}), date: x.date, ...(typeof x.at === "string" && !isNaN(Date.parse(x.at)) ? {at: x.at} : {}), productId: x.productId, productName: str(x.productName, "Produk"), qty: x.qty, price: x.price, cost: x.cost, total: x.total} : null);
  const expenses = keep<Expense>(r.expenses, x => typeof x.id === "string" && x.id && DATE.test(str(x.date)) && isMoney(x.amount) ? {id: x.id, date: x.date, name: str(x.name, "Biaya"), amount: x.amount, category: str(x.category, "Operasional")} : null);
  const waste = keep<Waste>(r.waste, x => typeof x.id === "string" && x.id && DATE.test(str(x.date)) && isMoney(x.amount) ? {id: x.id, date: x.date, ingredient: str(x.ingredient, "Barang"), amount: x.amount, reason: str(x.reason, "Barang rusak")} : null);
  const movements = keep<Movement>(r.movements, x => typeof x.id === "string" && x.id && DATE.test(str(x.date)) && typeof x.productId === "string" && MOVEMENT_TYPES.includes(x.type) && typeof x.qty === "number" && Number.isFinite(x.qty) && isMoney(x.balance)
    ? {id: x.id, date: x.date, productId: x.productId, productName: str(x.productName, "Produk"), type: x.type, qty: x.qty, balance: x.balance, note: str(x.note)} : null);
  return {state: {products, sales, expenses, waste, movements: movements.slice(0, MAX_MOVEMENTS)}, dropped};
}

export function exportBackup(state: AppState, now = new Date()): string {
  return JSON.stringify({app: "stokcerdas", version: BACKUP_VERSION, exportedAt: now.toISOString(), data: state}, null, 2);
}

export function parseBackup(text: string): {ok: true; state: AppState; dropped: number} | {ok: false; error: string} {
  let obj: any;
  try { obj = JSON.parse(text); } catch { return {ok: false, error: "Berkas bukan JSON yang valid."}; }
  if (!obj || obj.app !== "stokcerdas" || typeof obj.version !== "number") return {ok: false, error: "Berkas ini bukan cadangan StokCerdas."};
  if (obj.version > BACKUP_VERSION) return {ok: false, error: "Cadangan dibuat oleh versi aplikasi yang lebih baru."};
  const {state, dropped} = sanitizeState(obj.data);
  if (!state.products.length && !state.sales.length) return {ok: false, error: "Cadangan tidak berisi produk maupun penjualan."};
  return {ok: true, state, dropped};
}
