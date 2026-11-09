import {Activity,Boxes,CircleAlert,Wallet} from "lucide-react";
import {LEAD_TIME_DAYS,SAFETY_DAYS,StockHealth} from "@/lib/analytics";
import {Metric,ProductVisual} from "./ui";

const STATUS_LABEL:Record<string,string>={kritis:"Kritis",waspada:"Waspada",aman:"Aman",lambat:"Stok lambat"};
export function StockHealthPanel({health,fmt}:{health:StockHealth;fmt:(n:number)=>string}){
 const scoreLabel=health.score>=80?"Sehat":health.score>=60?"Perlu perhatian":"Berisiko";
 const rows=[...health.rows].sort((a,b)=>({kritis:0,waspada:1,lambat:2,aman:3} as Record<string,number>)[a.status]-({kritis:0,waspada:1,lambat:2,aman:3} as Record<string,number>)[b.status]);
 return <section className="page-panel" style={{marginBottom:16}}>
  <div className="card-title">Kesehatan Stok · diukur dari kecepatan jual, bukan angka minimum tetap</div>
  <div className="card-desc" style={{lineHeight:1.7}}>Stok “aman” menurut batas minimum bisa saja habis dalam 2 hari kalau barangnya laris, dan stok “banyak” bisa menahan modal berbulan-bulan kalau tidak laku. Panel ini menghitung keduanya dari data penjualan.</div>
  <div className="grid metrics" style={{marginTop:16,marginBottom:0}}>
   <Metric title="Skor kesehatan stok" value={`${health.score}/100`} foot={scoreLabel} icon={<Activity size={17}/>}/>
   <Metric title="Laba berisiko hilang" value={fmt(health.marginAtRisk)} foot={`${health.counts.kritis} produk habis sebelum restok tiba`} icon={<CircleAlert size={17}/>}/>
   <Metric title="Modal tertahan (stok lambat)" value={fmt(health.deadCapital)} foot={`${health.counts.lambat} produk tidak terjual di periode ini · total nilai stok ${fmt(health.tiedCapital)}`} icon={<Boxes size={17}/>}/>
   <Metric title="Anggaran restok disarankan" value={fmt(health.restockBudget)} foot="Hanya untuk produk yang laku" icon={<Wallet size={17}/>}/>
  </div>
  <div className="table-wrap"><table><thead><tr><th>PRODUK</th><th>STOK</th><th>JUAL/HARI</th><th>CUKUP UNTUK</th><th>STATUS</th><th>SARAN BELI</th><th>MODAL RESTOK</th></tr></thead><tbody>{rows.map(r=><tr key={r.product.id}><td><div className="product-cell"><ProductVisual product={r.product} size={36}/><b>{r.product.name}</b></div></td><td>{r.product.stock} {r.product.unit}</td><td>{r.avgDaily?Math.ceil(r.avgDaily):"–"}</td><td>{r.daysCover===null?"tidak terjual":`${Math.round(r.daysCover)} hari`}</td><td><span className={`pill ${r.status==="kritis"?"red":r.status==="aman"?"":"warn"}`}>{STATUS_LABEL[r.status]}</span></td><td>{r.suggestedQty?`${r.suggestedQty} ${r.product.unit}`:"–"}</td><td>{r.restockCost?fmt(r.restockCost):"–"}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty">Belum ada produk.</div>}</div>
  <div className="card-desc" style={{marginTop:12,lineHeight:1.7}}>Cara hitung: rata-rata jual/hari = unit terjual ÷ jumlah hari periode. <b>Kritis</b> = stok habis sebelum {LEAD_TIME_DAYS} hari (waktu pengadaan). <b>Waspada</b> = habis sebelum {LEAD_TIME_DAYS+SAFETY_DAYS} hari (termasuk stok pengaman {SAFETY_DAYS} hari). <b>Stok lambat</b> = ada stok tetapi tidak terjual. Laba berisiko = kekurangan hari × jual/hari × laba per unit. Skor = rata-rata bobot status (Aman 1, Waspada 0,6, Lambat 0,5, Kritis 0). Asumsi bisa disesuaikan dengan pemasok.</div>
 </section>}
