import * as D from "./inventory";
import type {AppState, Movement, MovementType, Result} from "./inventory";
import type {Product, Sale, Expense, Waste} from "./demo";
import type {DataSource} from "./source";

/**
 * CloudSource: DataSource yang memakai Supabase. Operasi stok memanggil fungsi PostgreSQL atomik
 * (supabase/migrations/002_atomic_functions.sql); keamanan antar-bisnis dijaga Row Level Security.
 * Setelah tiap operasi berhasil, state dimuat ulang dari database agar UI selalu sama dengan server.
 * Hanya transaksi dalam jendela waktu (default 90 hari) yang dimuat, diambil per halaman 1000 baris (batas PostgREST). Skalanya dibuktikan di docs/SCALABILITY.md.
 *
 * STATUS: logika pemetaan dan pemanggilan diuji dengan klien palsu (tests/cloud.test.mjs) dan fungsi SQL-nya diuji
 * di PostgreSQL lokal (supabase/tests/run.sh). Belum diuji terhadap proyek Supabase sungguhan.
 */

/** Bentuk minimal klien Supabase yang kita pakai, agar mudah diganti klien palsu saat tes. */
export type SupabaseLike = {
  from(table: string): any;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{data: any; error: {message: string; code?: string} | null}>;
};

const num = (v: unknown) => Number(v ?? 0);
const localDay = (iso: string) => D.localDate(new Date(iso));
const noonIso = (date: string) => new Date(`${date}T12:00:00`).toISOString();

const MOVEMENT_FROM_DB: Record<string, MovementType> = {opening: "awal", sale: "penjualan", return: "retur", purchase: "pembelian", adjustment: "penyesuaian", waste: "penyesuaian"};

export const mapProduct = (r: any): Product => ({id: r.id, name: r.name, category: r.category, price: num(r.selling_price), cost: num(r.unit_cost), stock: num(r.stock), minStock: num(r.min_stock), unit: r.unit, imageName: r.image_name || "", imageData: r.image_data || ""});
export const mapSales = (rows: any[]): Sale[] => rows.flatMap(s => (s.sale_items || []).map((i: any): Sale => ({id: i.id, receiptId: s.id, date: localDay(s.sold_at), at: s.sold_at, productId: i.product_id ?? "", productName: i.product_name_snapshot, qty: num(i.quantity), price: num(i.unit_price), cost: num(i.unit_cost), total: num(i.line_total)})));
export const mapExpense = (r: any): Expense => ({id: r.id, date: localDay(r.spent_at), name: r.name, amount: num(r.amount), category: r.category});
export const mapWaste = (r: any): Waste => ({id: r.id, date: localDay(r.recorded_at), ingredient: r.ingredient_name, amount: num(r.amount), reason: r.reason});
export const mapMovement = (r: any): Movement => ({id: r.id, date: localDay(r.created_at), productId: r.product_id ?? "", productName: r.product_name_snapshot, type: MOVEMENT_FROM_DB[r.movement_type] ?? "penyesuaian", qty: num(r.quantity_delta), balance: num(r.balance_after), note: r.note || ""});

const friendly = (e: {message: string; code?: string}) => e.code === "23505" ? "Nama produk sudah dipakai produk lain." : e.message;

export async function ensureBusiness(client: SupabaseLike, userId: string, name = "Toko Saya"): Promise<string> {
  const found = await client.from("businesses").select("id").order("created_at", {ascending: true}).limit(1);
  if (found.error) throw new Error(found.error.message);
  if (found.data?.length) return found.data[0].id;
  const made = await client.from("businesses").insert({owner_id: userId, name}).select("id").single();
  if (made.error) throw new Error(made.error.message);
  return made.data.id;
}

export type CloudOptions = {
  /** Jendela data transaksi yang dimuat ke browser (hari). Menjaga memori dan waktu muat tetap terbatas walau riwayat bertahun-tahun. */
  windowDays?: number;
  now?: () => Date;
  /** Jumlah halaman maksimum per tabel (1000 baris/halaman). Default 30 = 30.000 baris. */
  maxPages?: number;
};
export const DEFAULT_WINDOW_DAYS = 90; // sama dengan periode terpanjang di dashboard
/** PostgREST/Supabase membatasi satu permintaan (default 1000 baris), jadi data diambil per halaman agar tidak terpotong diam-diam. */
const PAGE = 1000;
const DEFAULT_MAX_PAGES = 30;

export function createCloudSource(client: SupabaseLike, businessId: string, opts: CloudOptions = {}): DataSource {
  let last: AppState = {products: [], sales: [], expenses: [], waste: [], movements: []};
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

  /** Ambil semua baris per halaman. Bila melewati batas halaman, kembalikan yang terbaru dan tandai terpotong. */
  async function fetchAll(make: () => any): Promise<{data: any[]; error: {message: string} | null; truncated: boolean}> {
    const out: any[] = [];
    for (let i = 0; i < maxPages; i++) {
      const r = await make().range(i * PAGE, (i + 1) * PAGE - 1);
      if (r.error) return {data: [], error: r.error, truncated: false};
      out.push(...r.data);
      if (r.data.length < PAGE) return {data: out, error: null, truncated: false};
    }
    return {data: out, error: null, truncated: true};
  }

  let lastNotice: string | undefined;
  async function load(): Promise<AppState> {
    const since = new Date((opts.now?.() ?? new Date()).getTime() - windowDays * 86_400_000).toISOString();
    const [p, s, e, w, m] = await Promise.all([
      fetchAll(() => client.from("products").select("*").eq("business_id", businessId).eq("active", true).order("created_at", {ascending: false}).order("id")),
      fetchAll(() => client.from("sales").select("id,sold_at,sale_items(id,product_id,product_name_snapshot,quantity,unit_price,unit_cost,line_total)").eq("business_id", businessId).gte("sold_at", since).order("sold_at", {ascending: false}).order("id")),
      fetchAll(() => client.from("expenses").select("*").eq("business_id", businessId).gte("spent_at", since).order("spent_at", {ascending: false}).order("id")),
      fetchAll(() => client.from("waste_records").select("*").eq("business_id", businessId).gte("recorded_at", since).order("recorded_at", {ascending: false}).order("id")),
      client.from("stock_movements").select("*").eq("business_id", businessId).order("created_at", {ascending: false}).limit(D.MAX_MOVEMENTS),
    ]);
    const err = [p, s, e, w, m].find(x => x.error)?.error;
    if (err) throw new Error(err.message);
    const cut = [["produk", p], ["penjualan", s], ["biaya", e], ["barang rusak", w]].filter(([, x]) => (x as any).truncated).map(([n]) => n);
    lastNotice = cut.length ? `Data ${cut.join(", ")} sangat banyak sehingga hanya ${maxPages * PAGE} baris terbaru yang ditampilkan. Ekspor atau perpendek periode untuk laporan lengkap.` : undefined;
    last = {products: p.data.map(mapProduct), sales: mapSales(s.data), expenses: e.data.map(mapExpense), waste: w.data.map(mapWaste), movements: m.data.map(mapMovement)};
    return last;
  }

  /** Jalankan operasi tulis; bila sukses muat ulang state. Galat jaringan/DB menjadi pesan, bukan crash. */
  async function write(op: () => PromiseLike<{error: {message: string; code?: string} | null}>, message: string): Promise<Result> {
    try {
      const res = await op();
      if (res.error) return {ok: false, error: friendly(res.error)};
      return {ok: true, state: await load(), message};
    } catch (e) {
      return {ok: false, error: `Gagal menghubungi server: ${e instanceof Error ? e.message : "tidak diketahui"}`};
    }
  }
  const bad = (error: string): Result => ({ok: false, error});

  return {
    kind: "cloud",
    async load() { const state = await load(); return {state, notice: lastNotice}; },
    addProduct: input => write(() => client.rpc("create_product", {p_business: businessId, p_name: input.name, p_category: input.category, p_price: input.price, p_cost: input.cost, p_stock: input.stock, p_min_stock: input.minStock, p_unit: input.unit, p_image_name: input.imageName || "", p_image_data: input.imageData || ""}), "Produk berhasil ditambahkan."),
    async updateProduct(id, input) {
      const cur = last.products.find(p => p.id === id);
      if (!cur) return bad("Produk tidak ditemukan.");
      const err = D.validateProduct({...input, stock: cur.stock}, last.products, id);
      if (err) return bad(err);
      return write(() => client.from("products").update({name: input.name.trim(), category: input.category, selling_price: input.price, unit_cost: input.cost, min_stock: input.minStock, unit: input.unit.trim(), image_name: input.imageName ?? cur.imageName ?? "", image_data: input.imageData ?? cur.imageData ?? "", updated_at: new Date().toISOString()}).eq("id", id), "Produk diperbarui. Transaksi lama tetap memakai harga dan modal saat itu.");
    },
    deleteProduct: id => write(() => client.rpc("delete_product", {p_product: id}), "Produk dihapus."),
    recordSale: lines => lines.length && lines.every(l => Number.isInteger(l.qty) && l.qty >= 1)
      ? write(() => client.rpc("create_sale", {p_business: businessId, p_lines: lines.map(l => ({product_id: l.productId, quantity: l.qty}))}), "Penjualan tersimpan. Stok diperbarui.")
      : Promise.resolve(bad(lines.length ? "Jumlah harus bilangan bulat 1 atau lebih." : "Tambahkan minimal satu produk.")),
    async voidSale(saleId) {
      const sale = last.sales.find(s => s.id === saleId);
      if (!sale?.receiptId) return bad("Transaksi tidak ditemukan.");
      return write(() => client.rpc("void_sale", {p_sale: sale.receiptId}), "Transaksi dibatalkan dan stok dikembalikan.");
    },
    receiveStock: input => write(() => client.rpc("receive_stock", {p_product: input.productId, p_quantity: input.qty, p_unit_cost: input.unitCost, p_note: input.note ?? null}), "Barang diterima dan stok diperbarui."),
    adjustStock: input => write(() => client.rpc("adjust_stock", {p_product: input.productId, p_new_stock: input.newStock, p_note: input.note ?? null}), "Stok disesuaikan."),
    async addExpense(input) {
      const v = D.addExpense(last, input); // validasi yang sama dengan mode lokal
      if (!v.ok) return v;
      const e = v.state.expenses[0];
      return write(() => client.from("expenses").insert({business_id: businessId, spent_at: noonIso(e.date), name: e.name, category: e.category, amount: e.amount}), v.message);
    },
    async addWaste(input) {
      const v = D.addWaste(last, input);
      if (!v.ok) return v;
      const w = v.state.waste[0];
      return write(() => client.from("waste_records").insert({business_id: businessId, recorded_at: noonIso(w.date), ingredient_name: w.ingredient, amount: w.amount, reason: w.reason}), v.message);
    },
    async deleteExpense(id) {
      const cur = last.expenses.find(e => e.id === id);
      if (!cur) return bad("Catatan biaya tidak ditemukan.");
      return write(() => client.from("expenses").delete().eq("id", id).eq("business_id", businessId), `Biaya “${cur.name}” dihapus.`);
    },
    async deleteWaste(id) {
      const cur = last.waste.find(w => w.id === id);
      if (!cur) return bad("Catatan barang rusak tidak ditemukan.");
      return write(() => client.from("waste_records").delete().eq("id", id).eq("business_id", businessId), `Catatan “${cur.ingredient}” dihapus.`);
    },
    replaceAll: () => Promise.resolve(bad("Pemulihan cadangan dan reset demo hanya tersedia di mode lokal.")),
  };
}
