import type {Movement} from "./inventory";
import type {Sale} from "./demo";
import {LEAD_TIME_DAYS, type StockHealth} from "./analytics";

/**
 * Estimasi dampak bisnis StokCerdas untuk SATU toko. Semua rumus sederhana dan ditampilkan di layar.
 * Hasilnya ESTIMASI berdasarkan asumsi yang bisa diubah, bukan bukti. Bukti sebenarnya datang dari pilot:
 * ukur baseline, pakai aplikasi, ukur lagi (lihat laporan CSV dan docs/IMPACT.md).
 */

export type ImpactInputs = {
  /** Omzet rata-rata per bulan (Rp). Terukur dari data. */
  monthlyRevenue: number;
  /** Kejadian barang laris habis per bulan. Terukur dari buku stok bila ada, selain itu perkiraan pemilik. */
  stockoutsPerMonth: number;
  /** Laba kotor yang hilang tiap kejadian (Rp). Default: laba kotor harian rata-rata per produk × lama menunggu restok. */
  marginLostPerStockout: number;
  /** Asumsi: persen kejadian stok habis yang bisa dicegah (0-100). */
  stockoutReductionPct: number;
  /** Modal tertahan di stok yang tidak laku (Rp). Terukur dari data. */
  idleCapital: number;
  /** Asumsi: persen modal tertahan yang berhasil dilepas (0-100). */
  idleCapitalFreedPct: number;
  /** Asumsi: biaya modal per bulan (%), mis. bunga pinjaman atau peluang usaha lain. */
  capitalCostPctPerMonth: number;
  /** Jam per minggu untuk mencatat stok dan menghitung laba secara manual. */
  hoursPerWeekManual: number;
  /** Asumsi: persen waktu yang terhemat (0-100). */
  hoursSavedPct: number;
  /** Nilai satu jam kerja pemilik (Rp). */
  hourlyValue: number;
  /** Usulan harga langganan per bulan (Rp). Belum divalidasi pasar. */
  pricePerMonth: number;
};

export type ImpactResult = {
  avoidedLoss: number;
  capitalCarryingSaved: number;
  cashReleased: number;
  timeValue: number;
  /** Manfaat berbentuk uang tunai saja (laba yang dicegah hilang + biaya modal), tanpa nilai waktu. Ini angka yang paling konservatif. */
  cashBenefit: number;
  /** Total termasuk nilai waktu (non-tunai). */
  monthlyBenefit: number;
  netMonthly: number;
  cashNetMonthly: number;
  annualNet: number;
  /** Manfaat total ÷ biaya. null bila harga 0. */
  benefitCostRatio: number | null;
  /** Manfaat tunai ÷ biaya. null bila harga 0. */
  cashBenefitCostRatio: number | null;
  /** Harga bulanan tertinggi yang masih membuat toko untung (= manfaat bulanan). */
  maxJustifiedPrice: number;
  /** Peringatan agar angka tidak dibaca berlebihan. */
  warnings: string[];
};

const WEEKS_PER_MONTH = 4.345;
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);
const pct = (n: number) => clamp(n, 0, 100);
const money = (n: number) => clamp(n, 0, 1e12);

export function estimateImpact(input: ImpactInputs): ImpactResult {
  const stockouts = clamp(input.stockoutsPerMonth, 0, 1000);
  const avoidedLoss = stockouts * money(input.marginLostPerStockout) * pct(input.stockoutReductionPct) / 100;
  const cashReleased = money(input.idleCapital) * pct(input.idleCapitalFreedPct) / 100;
  const capitalCarryingSaved = cashReleased * clamp(input.capitalCostPctPerMonth, 0, 100) / 100;
  const timeValue = clamp(input.hoursPerWeekManual, 0, 168) * WEEKS_PER_MONTH * pct(input.hoursSavedPct) / 100 * money(input.hourlyValue);
  const cashBenefit = Math.round(avoidedLoss + capitalCarryingSaved);
  const monthlyBenefit = Math.round(avoidedLoss + capitalCarryingSaved + timeValue);
  const price = money(input.pricePerMonth);
  const netMonthly = monthlyBenefit - price;

  const warnings: string[] = [];
  const revenue = money(input.monthlyRevenue);
  if (revenue > 0 && monthlyBenefit > revenue * 0.2) warnings.push("Manfaat bulanan melebihi 20% omzet. Periksa kembali asumsi; angka sebesar ini jarang realistis untuk toko kecil.");
  if (monthlyBenefit > 0 && timeValue > monthlyBenefit / 2) warnings.push("Lebih dari separuh manfaat berasal dari nilai waktu (bukan uang tunai). Lihat 'manfaat tunai saja' untuk angka yang lebih konservatif.");
  if (stockouts === 0) warnings.push("Belum ada kejadian stok habis yang tercatat atau diperkirakan, sehingga manfaat pencegahan stok habis bernilai nol.");
  if (revenue === 0) warnings.push("Belum ada penjualan pada periode terpilih, sehingga omzet bulanan tidak bisa dihitung.");

  return {
    avoidedLoss: Math.round(avoidedLoss), capitalCarryingSaved: Math.round(capitalCarryingSaved), cashReleased: Math.round(cashReleased), timeValue: Math.round(timeValue),
    cashBenefit, monthlyBenefit, netMonthly, cashNetMonthly: cashBenefit - price, annualNet: netMonthly * 12,
    benefitCostRatio: price > 0 ? Math.round(monthlyBenefit / price * 10) / 10 : null,
    cashBenefitCostRatio: price > 0 ? Math.round(cashBenefit / price * 10) / 10 : null,
    maxJustifiedPrice: monthlyBenefit, warnings,
  };
}

/** Berapa kali stok sebuah produk menyentuh 0 setelah penjualan sejak tanggal tertentu (diukur dari buku stok). */
export function stockoutEvents(movements: Movement[], sinceDate: string): number {
  return movements.filter(m => m.type === "penjualan" && m.balance === 0 && m.date >= sinceDate).length;
}

export type Measured = {
  periodDays: number;
  revenuePeriod: number;
  cogsPeriod: number;
  stockoutEvents30d: number;
  healthScore: number;
  idleCapital: number;
  marginAtRisk: number;
  criticalProducts: number;
};

export function measure(args: {sales: Sale[]; movements: Movement[]; health: StockHealth; periodDays: number; today: string; since30: string}): Measured {
  const revenuePeriod = args.sales.reduce((a, s) => a + s.total, 0);
  const cogsPeriod = args.sales.reduce((a, s) => a + s.cost * s.qty, 0);
  return {
    periodDays: args.periodDays, revenuePeriod, cogsPeriod,
    stockoutEvents30d: stockoutEvents(args.movements, args.since30),
    healthScore: args.health.score, idleCapital: args.health.deadCapital, marginAtRisk: args.health.marginAtRisk, criticalProducts: args.health.counts.kritis,
  };
}

/** Nilai awal kalkulator: yang bisa diukur diambil dari data toko, sisanya asumsi yang diberi label. */
export function defaultInputs(m: Measured, productCount: number): ImpactInputs {
  const days = Math.max(1, m.periodDays);
  const monthlyRevenue = Math.round(m.revenuePeriod / days * 30);
  const dailyGross = (m.revenuePeriod - m.cogsPeriod) / days;
  return {
    monthlyRevenue,
    stockoutsPerMonth: m.stockoutEvents30d > 0 ? m.stockoutEvents30d : 4,
    marginLostPerStockout: Math.round(dailyGross / Math.max(1, productCount) * LEAD_TIME_DAYS),
    stockoutReductionPct: 50,
    idleCapital: Math.round(m.idleCapital),
    idleCapitalFreedPct: 50,
    capitalCostPctPerMonth: 2,
    hoursPerWeekManual: 3,
    hoursSavedPct: 40,
    hourlyValue: 20000,
    pricePerMonth: 49000,
  };
}

const csvCell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;

/** Laporan dampak untuk pilot: indikator terukur + asumsi + estimasi, dengan tanggal agar baseline dan hasil bisa dibandingkan. */
export function impactReportCsv(date: string, m: Measured, i: ImpactInputs, r: ImpactResult): string {
  const rows: (string | number)[][] = [
    ["Bagian", "Indikator", "Nilai", "Keterangan"],
    ["Terukur", "Tanggal laporan", date, ""],
    ["Terukur", "Periode (hari)", m.periodDays, ""],
    ["Terukur", "Omzet periode (Rp)", Math.round(m.revenuePeriod), "dari transaksi tercatat"],
    ["Terukur", "Kejadian stok habis 30 hari", m.stockoutEvents30d, "dari buku stok (saldo menyentuh 0 setelah penjualan)"],
    ["Terukur", "Produk berstatus kritis", m.criticalProducts, "stok habis sebelum restok tiba"],
    ["Terukur", "Modal tertahan di stok lambat (Rp)", Math.round(m.idleCapital), ""],
    ["Terukur", "Laba berisiko hilang (Rp)", Math.round(m.marginAtRisk), ""],
    ["Terukur", "Skor kesehatan stok", m.healthScore, "0-100"],
    ...(Object.entries(i) as [keyof ImpactInputs, number][]).map(([k, v]): (string | number)[] => ["Asumsi/masukan", k, v, "dapat diubah pengguna"]),
    ["Estimasi", "Laba hilang yang dicegah per bulan (Rp)", r.avoidedLoss, "ESTIMASI, bukan hasil terukur"],
    ["Estimasi", "Biaya modal yang dihemat per bulan (Rp)", r.capitalCarryingSaved, "ESTIMASI"],
    ["Estimasi", "Kas yang dilepas sekali (Rp)", r.cashReleased, "ESTIMASI"],
    ["Estimasi", "Nilai waktu terhemat per bulan (Rp)", r.timeValue, "ESTIMASI"],
    ["Estimasi", "Manfaat tunai saja per bulan (Rp)", r.cashBenefit, "ESTIMASI, tanpa nilai waktu"],
    ["Estimasi", "Manfaat bulanan total termasuk waktu (Rp)", r.monthlyBenefit, "ESTIMASI"],
    ["Estimasi", "Manfaat bersih setelah langganan (Rp/bulan)", r.netMonthly, "ESTIMASI"],
  ];
  return "﻿" + rows.map(r2 => r2.map(csvCell).join(",")).join("\r\n");
}
