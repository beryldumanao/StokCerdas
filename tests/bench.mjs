// Benchmark logika di browser/Node: berapa besar data sebelum aplikasi terasa lambat?
// Jalankan: npm run bench. Ambang sengaja longgar (anti-flaky); angka sebenarnya dicetak.
import assert from "node:assert/strict";
import {analyzeStock} from "../src/lib/analytics.ts";
import {recordSale,checkIntegrity,sanitizeState,exportBackup,localDate} from "../src/lib/inventory.ts";

const P=2000, S=100000, uid=i=>`id-${i}`;
const products=Array.from({length:P},(_,i)=>({id:uid(i),name:"Produk "+i,category:"Sembako",price:10000,cost:8000,stock:1e6,minStock:5,unit:"pcs"}));
const day=i=>`2026-${String(1+i%11).padStart(2,"0")}-${String(1+i%28).padStart(2,"0")}`;
const sales=Array.from({length:S},(_,i)=>({id:"s"+i,date:day(i),productId:uid(i%P),productName:"Produk",qty:2,price:10000,cost:8000,total:20000}));
const state={products,sales,expenses:[],waste:[],movements:[]};
const T=(name,fn,limit)=>{const t=performance.now();const r=fn();const ms=performance.now()-t;console.log(`${name.padEnd(46)} ${ms.toFixed(1).padStart(8)} ms`);assert.ok(ms<limit,`${name} terlalu lambat: ${ms.toFixed(0)} ms (ambang ${limit})`);return r};
console.log(`Data uji: ${P} produk, ${S} penjualan`);
T("analyzeStock (kesehatan stok, seluruh produk)",()=>analyzeStock(products,sales,30),1500);
T("recordSale 2 item (salin state besar)",()=>{const r=recordSale(state,[{productId:uid(1),qty:1},{productId:uid(2),qty:1}],localDate());assert.equal(r.ok,true)},500);
T("checkIntegrity (periksa seluruh data)",()=>checkIntegrity(state),1500);
const json=T("exportBackup (serialisasi JSON)",()=>exportBackup(state),3000);
console.log(`${"Ukuran cadangan JSON".padEnd(46)} ${(json.length/1048576).toFixed(1).padStart(8)} MB`);
T("sanitizeState (muat & validasi data besar)",()=>sanitizeState(JSON.parse(json).data),3000);
console.log("BENCH LULUS");
