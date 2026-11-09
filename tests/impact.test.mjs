// Jalankan: npm test (butuh Node >= 22.6)
import assert from "node:assert/strict";
import {estimateImpact,stockoutEvents,measure,defaultInputs,impactReportCsv} from "../src/lib/impact.ts";

const base={monthlyRevenue:10_000_000,stockoutsPerMonth:4,marginLostPerStockout:10000,stockoutReductionPct:50,idleCapital:240000,idleCapitalFreedPct:50,capitalCostPctPerMonth:2,hoursPerWeekManual:3,hoursSavedPct:40,hourlyValue:20000,pricePerMonth:49000};

// rumus (dihitung tangan)
let r=estimateImpact(base);
assert.equal(r.avoidedLoss,20000);                 // 4 × 10.000 × 50%
assert.equal(r.cashReleased,120000);               // 240.000 × 50%
assert.equal(r.capitalCarryingSaved,2400);         // 120.000 × 2%
assert.equal(r.timeValue,Math.round(3*4.345*0.4*20000)); // 104.280
assert.equal(r.cashBenefit,22400);
assert.equal(r.monthlyBenefit,22400+104280);
assert.equal(r.netMonthly,r.monthlyBenefit-49000); assert.equal(r.cashNetMonthly,22400-49000);
assert.equal(r.annualNet,r.netMonthly*12); assert.equal(r.maxJustifiedPrice,r.monthlyBenefit);
assert.equal(r.cashBenefitCostRatio,0.5);          // manfaat tunai saja belum menutup biaya: tidak disembunyikan
assert.ok(r.warnings.some(w=>/nilai waktu/.test(w)),"peringatan saat waktu mendominasi");

// nol = nol, tanpa NaN/negatif
r=estimateImpact({...base,stockoutsPerMonth:0,idleCapital:0,hoursPerWeekManual:0,pricePerMonth:0});
assert.equal(r.monthlyBenefit,0); assert.equal(r.benefitCostRatio,null); assert.ok(r.warnings.some(w=>/stok habis/.test(w)));
// masukan ngawur dijepit
r=estimateImpact({...base,stockoutReductionPct:500,idleCapitalFreedPct:-20,hoursSavedPct:NaN,stockoutsPerMonth:-3,marginLostPerStockout:-5});
assert.equal(r.avoidedLoss,0); assert.equal(r.cashReleased,0); assert.equal(r.timeValue,0); assert.ok(Number.isFinite(r.netMonthly));
assert.equal(estimateImpact({...base,stockoutReductionPct:500}).avoidedLoss,4*10000*1,"persen dijepit ke 100");
// manfaat tak masuk akal besar memicu peringatan
assert.ok(estimateImpact({...base,monthlyRevenue:100000,marginLostPerStockout:500000}).warnings.some(w=>/20% omzet/.test(w)));
assert.ok(estimateImpact({...base,monthlyRevenue:0}).warnings.some(w=>/omzet bulanan/.test(w)));

// kejadian stok habis dari buku stok
const mv=(type,balance,date)=>({id:Math.random()+"",date,productId:"p",productName:"P",type,qty:-1,balance,note:""});
assert.equal(stockoutEvents([mv("penjualan",0,"2026-11-05"),mv("penjualan",0,"2026-09-01"),mv("penjualan",3,"2026-11-05"),mv("penyesuaian",0,"2026-11-06"),mv("retur",0,"2026-11-06")],"2026-10-09"),1);

// pengukuran & nilai awal: yang terukur dari data, sisanya asumsi
const sales=[{id:"1",date:"2026-11-01",productId:"p",productName:"P",qty:10,price:2000,cost:1500,total:20000},{id:"2",date:"2026-11-02",productId:"p",productName:"P",qty:20,price:2000,cost:1500,total:40000}];
const health={rows:[],tiedCapital:0,deadCapital:240000,marginAtRisk:5000,restockBudget:0,score:80,counts:{kritis:2,waspada:0,aman:3,lambat:1}};
const m=measure({sales,movements:[mv("penjualan",0,"2026-11-03")],health,periodDays:30,today:"2026-11-08",since30:"2026-10-09"});
assert.equal(m.revenuePeriod,60000); assert.equal(m.cogsPeriod,45000); assert.equal(m.stockoutEvents30d,1); assert.equal(m.idleCapital,240000); assert.equal(m.criticalProducts,2);
let d=defaultInputs(m,3);
assert.equal(d.monthlyRevenue,60000);             // 60.000 / 30 hari × 30
assert.equal(d.stockoutsPerMonth,1);              // terukur dari buku stok
assert.equal(d.marginLostPerStockout,Math.round((15000/30)/3*3)); // laba harian ÷ produk × 3 hari = 500
assert.equal(d.idleCapital,240000);
d=defaultInputs({...m,stockoutEvents30d:0},3); assert.equal(d.stockoutsPerMonth,4,"tanpa data: perkiraan awal yang diberi label di UI");
assert.equal(defaultInputs({...m,revenuePeriod:0,cogsPeriod:0},0).marginLostPerStockout,0,"tanpa produk/penjualan tidak membagi nol");

// laporan CSV
const csv=impactReportCsv("2026-11-08",m,d,estimateImpact(d));
assert.ok(csv.startsWith("﻿\"Bagian\""));
assert.ok(csv.includes('"Terukur","Kejadian stok habis 30 hari","1"')); assert.ok(csv.includes("ESTIMASI, bukan hasil terukur"));
assert.equal(csv.split("\r\n").length,1+8+Object.keys(d).length+7,"jumlah baris");
console.log("impact OK");
