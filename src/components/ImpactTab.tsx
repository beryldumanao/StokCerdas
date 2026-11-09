"use client";
import {useMemo,useState} from "react";
import {Activity,Boxes,CircleAlert,Download,TrendingUp,Wallet} from "lucide-react";
import type {Product,Sale} from "@/lib/demo";
import type {StockHealth} from "@/lib/analytics";
import type {Movement} from "@/lib/inventory";
import {localDate} from "@/lib/inventory";
import {defaultInputs,estimateImpact,impactReportCsv,measure,ImpactInputs} from "@/lib/impact";
import {Metric} from "./ui";

type Kind="terukur"|"asumsi"|"perkiraan"|"usulan";
const FIELDS:[keyof ImpactInputs,string,Kind,string][]=[
 ["monthlyRevenue","Omzet per bulan (Rp)","terukur","dari penjualan periode terpilih"],
 ["stockoutsPerMonth","Kejadian barang laris habis per bulan","perkiraan","terukur dari buku stok bila ada; jika belum, perkiraan awal"],
 ["marginLostPerStockout","Laba hilang tiap kejadian (Rp)","terukur","laba kotor harian rata-rata per produk × 3 hari menunggu restok"],
 ["stockoutReductionPct","Kejadian yang berhasil dicegah (%)","asumsi","ganti dengan hasil pilot"],
 ["idleCapital","Modal tertahan di stok lambat (Rp)","terukur","dari panel Kesehatan Stok"],
 ["idleCapitalFreedPct","Modal tertahan yang berhasil dilepas (%)","asumsi","ganti dengan hasil pilot"],
 ["capitalCostPctPerMonth","Biaya modal per bulan (%)","asumsi","mis. bunga pinjaman atau peluang usaha lain"],
 ["hoursPerWeekManual","Jam pencatatan manual per minggu","perkiraan","tanyakan ke pemilik toko"],
 ["hoursSavedPct","Waktu yang terhemat (%)","asumsi","ganti dengan hasil pilot"],
 ["hourlyValue","Nilai satu jam kerja pemilik (Rp)","asumsi","belum tentu uang tunai"],
 ["pricePerMonth","Usulan langganan per bulan (Rp)","usulan","belum divalidasi pasar"],
];
const KIND_CLASS:Record<Kind,string>={terukur:"",asumsi:"warn",perkiraan:"warn",usulan:"warn"};

export function ImpactTab({products,sales,movements,health,periodDays,fmt}:{products:Product[];sales:Sale[];movements:Movement[];health:StockHealth;periodDays:number;fmt:(n:number)=>string}){
 const today=localDate();
 const since30=useMemo(()=>{const d=new Date();d.setDate(d.getDate()-29);return localDate(d)},[today]);
 const measured=useMemo(()=>measure({sales,movements,health,periodDays,today,since30}),[sales,movements,health,periodDays,today,since30]);
 const defaults=useMemo(()=>defaultInputs(measured,products.length),[measured,products.length]);
 const [edits,setEdits]=useState<Partial<ImpactInputs>>({});
 const inputs:ImpactInputs={...defaults,...edits};
 const r=useMemo(()=>estimateImpact(inputs),[inputs.monthlyRevenue,inputs.stockoutsPerMonth,inputs.marginLostPerStockout,inputs.stockoutReductionPct,inputs.idleCapital,inputs.idleCapitalFreedPct,inputs.capitalCostPctPerMonth,inputs.hoursPerWeekManual,inputs.hoursSavedPct,inputs.hourlyValue,inputs.pricePerMonth]);
 const download=()=>{const url=URL.createObjectURL(new Blob([impactReportCsv(today,measured,inputs,r)],{type:"text/csv;charset=utf-8;"}));const a=document.createElement("a");a.href=url;a.download=`stokcerdas-laporan-dampak-${today}.csv`;a.click();URL.revokeObjectURL(url)};
 const kindOf=(k:keyof ImpactInputs,kind:Kind):Kind=>k==="stockoutsPerMonth"&&measured.stockoutEvents30d>0?"terukur":kind;
 return <>
  <section className="page-panel tint-panel" style={{marginBottom:16}}><div style={{display:"flex",gap:12,alignItems:"flex-start"}}><div className="metric-icon"><TrendingUp size={18}/></div><div><div className="card-title">Dampak bisnis untuk toko ini</div><div className="card-desc" style={{lineHeight:1.75,fontSize:13}}>Bagian atas berisi angka yang <b>terukur</b> dari data toko. Kalkulator di bawahnya mengubah angka itu menjadi <b>estimasi</b> manfaat per bulan berdasarkan asumsi yang bisa Anda ubah. Estimasi bukan bukti; buktinya datang dari pilot (lihat langkah di bagian bawah).</div></div></div></section>

  <div className="section-row" style={{marginTop:0}}><div><div className="card-title">Terukur di toko ini</div><div className="card-desc">Dihitung langsung dari penjualan dan buku stok yang tercatat.</div></div><button className="btn secondary" onClick={download}><Download size={15}/>Unduh laporan dampak (CSV)</button></div>
  <div className="grid metrics" style={{marginBottom:16}}>
   <Metric title="Stok habis (30 hari)" value={String(measured.stockoutEvents30d)} foot="Saldo buku stok menyentuh 0 setelah penjualan" icon={<CircleAlert size={17}/>}/>
   <Metric title="Produk kritis sekarang" value={String(measured.criticalProducts)} foot={`Laba berisiko hilang ${fmt(measured.marginAtRisk)}`} icon={<Activity size={17}/>}/>
   <Metric title="Modal tertahan" value={fmt(measured.idleCapital)} foot="Stok yang tidak terjual pada periode" icon={<Boxes size={17}/>}/>
   <Metric title="Skor kesehatan stok" value={`${measured.healthScore}/100`} foot="Dasar pembanding sebelum dan sesudah" icon={<TrendingUp size={17}/>}/>
  </div>

  <section className="page-panel" style={{marginBottom:16}}>
   <div className="card-title">Kalkulator estimasi manfaat</div>
   <div className="card-desc" style={{lineHeight:1.7}}>Label <span className="pill">terukur</span> berasal dari data toko; <span className="pill warn">asumsi</span>, <span className="pill warn">perkiraan</span>, dan <span className="pill warn">usulan</span> adalah angka yang harus Anda ganti dengan hasil wawancara atau pilot.</div>
   <div className="form-grid" style={{marginTop:16}}>
    {FIELDS.map(([k,label,kind,hint])=>{const kk=kindOf(k,kind);return <div className="field" key={k}><label htmlFor={`imp-${k}`} style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><span>{label}</span><span className={`pill ${KIND_CLASS[kk]}`}>{kk}</span></label><input id={`imp-${k}`} type="number" min="0" value={inputs[k]} onChange={e=>setEdits(o=>({...o,[k]:Math.max(0,Number(e.target.value)||0)}))}/><small className="muted">{hint}</small></div>})}
   </div>
   <div className="actions"><button className="btn secondary small" onClick={()=>setEdits({})}>Kembalikan ke data toko</button></div>
  </section>

  <div className="grid metrics" style={{marginBottom:16}}>
   <Metric title="Manfaat tunai per bulan" value={fmt(r.cashBenefit)} foot="Laba yang dicegah hilang + biaya modal yang dihemat" icon={<Wallet size={17}/>}/>
   <Metric title="Nilai waktu terhemat" value={fmt(r.timeValue)} foot="Bukan uang tunai; nilai jam kerja pemilik" icon={<Activity size={17}/>}/>
   <Metric title="Manfaat bersih per bulan" value={fmt(r.netMonthly)} foot={`Setelah langganan ${fmt(inputs.pricePerMonth)}; tunai saja ${fmt(r.cashNetMonthly)}`} icon={<TrendingUp size={17}/>}/>
   <Metric title="Kas dilepas sekali" value={fmt(r.cashReleased)} foot="Modal tertahan yang kembali menjadi uang" icon={<Boxes size={17}/>}/>
  </div>
  {r.warnings.map((w,i)=><div className="page-panel" key={i} style={{marginBottom:10}}><div className="insight warn" style={{padding:0,border:0}}><div className="insight-icon"><CircleAlert size={17}/></div><div><p style={{margin:0,fontSize:12,lineHeight:1.7}}>{w}</p></div></div></div>)}

  <section className="page-panel" style={{marginBottom:16}}>
   <div className="card-title">Rincian rumus</div>
   <div className="table-wrap"><table><thead><tr><th>KOMPONEN</th><th>RUMUS</th><th>HASIL / BULAN</th></tr></thead><tbody>
    <tr><td><b>Laba hilang yang dicegah</b></td><td>{inputs.stockoutsPerMonth} kejadian × {fmt(inputs.marginLostPerStockout)} × {inputs.stockoutReductionPct}%</td><td><b>{fmt(r.avoidedLoss)}</b></td></tr>
    <tr><td><b>Biaya modal yang dihemat</b></td><td>{fmt(inputs.idleCapital)} × {inputs.idleCapitalFreedPct}% × {inputs.capitalCostPctPerMonth}% per bulan</td><td><b>{fmt(r.capitalCarryingSaved)}</b></td></tr>
    <tr><td><b>Nilai waktu terhemat</b></td><td>{inputs.hoursPerWeekManual} jam/minggu × 4,345 minggu × {inputs.hoursSavedPct}% × {fmt(inputs.hourlyValue)}</td><td><b>{fmt(r.timeValue)}</b></td></tr>
    <tr><td><b>Total manfaat</b></td><td>jumlah tiga komponen di atas</td><td><b>{fmt(r.monthlyBenefit)}</b></td></tr>
    <tr><td><b>Rasio manfaat ÷ biaya</b></td><td>total {r.benefitCostRatio===null?"(tanpa biaya)":`÷ ${fmt(inputs.pricePerMonth)}`}; tunai saja {r.cashBenefitCostRatio===null?"–":`${r.cashBenefitCostRatio}×`}</td><td><b>{r.benefitCostRatio===null?"–":`${r.benefitCostRatio}×`}</b></td></tr>
    <tr><td><b>Harga langganan maksimum yang masih untung</b></td><td>sama dengan total manfaat bulanan</td><td><b>{fmt(r.maxJustifiedPrice)}</b></td></tr>
   </tbody></table></div>
  </section>

  <section className="page-panel">
   <div className="card-title">Cara membuktikan dampak di lapangan (pilot 4 minggu)</div>
   <ol className="muted" style={{fontSize:12,lineHeight:1.9,paddingLeft:18,margin:"10px 0 0"}}>
    <li><b>Minggu 0, baseline:</b> pilih 3–5 toko. Catat berapa kali barang laris habis dalam sebulan terakhir, nilai stok yang menumpuk, dan jam per minggu untuk mencatat stok. Unduh laporan CSV sebagai titik awal.</li>
    <li><b>Minggu 1–4:</b> toko mencatat penjualan dan penerimaan barang di StokCerdas dan mengikuti saran restok. Unduh laporan CSV tiap minggu.</li>
    <li><b>Akhir minggu 4:</b> bandingkan kejadian stok habis, modal tertahan, skor stok, dan jam pencatatan dengan baseline. Ganti kolom asumsi di kalkulator dengan hasil sebenarnya.</li>
    <li><b>Tetapkan kriteria sukses sebelum mulai</b> (misalnya kejadian stok habis turun minimal 30%), dan laporkan juga toko yang tidak membaik.</li>
   </ol>
  </section>
 </>}
