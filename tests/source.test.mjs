// Jalankan: npm test (butuh Node >= 22.6)
import assert from "node:assert/strict";
import {createLocalSource,demoState,STORAGE_KEY} from "../src/lib/source.ts";

const memKV=(init={})=>{const m=new Map(Object.entries(init));return{m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,v)}}};

// 1) kosong -> data demo
let kv=memKV(), src=createLocalSource(kv);
let {state}=await src.load();
assert.equal(state.products.length,demoState().products.length); assert.equal(src.kind,"local");

// 2) operasi sukses -> tersimpan; instance baru memuat data yang sama
const gula=state.products.find(p=>p.name.startsWith("Gula"));
let r=await src.recordSale([{productId:gula.id,qty:2}]);
assert.equal(r.ok,true); assert.ok(kv.m.has(STORAGE_KEY));
const src2=createLocalSource(kv); const s2=(await src2.load()).state;
assert.equal(s2.products.find(p=>p.id===gula.id).stock,gula.stock-2); assert.equal(s2.movements.length,1);

// 3) operasi gagal -> tidak menyimpan apa pun
const before=kv.m.get(STORAGE_KEY);
r=await src.recordSale([{productId:gula.id,qty:9999}]); assert.equal(r.ok,false); assert.equal(kv.m.get(STORAGE_KEY),before);

// 4) data rusak (bukan JSON): salinan disimpan, pakai demo, ada pemberitahuan
kv=memKV({[STORAGE_KEY]:"{rusak"}); src=createLocalSource(kv);
let l=await src.load(); assert.match(l.notice,/rusak/); assert.ok([...kv.m.keys()].some(k=>k.includes("rusak-")));
assert.equal(l.state.products.length,demoState().products.length);

// 5) sebagian baris rusak: dibuang + pemberitahuan
kv=memKV({[STORAGE_KEY]:JSON.stringify({products:[{id:"a",name:"OK",price:1,cost:0,stock:1,minStock:0},{id:"b"}],sales:[]})});
l=await createLocalSource(kv).load(); assert.equal(l.state.products.length,1); assert.match(l.notice,/1 baris/);

// 6) penyimpanan penuh: operasi tetap berhasil tetapi pengguna diperingatkan
const full={getItem:()=>null,setItem:()=>{throw new Error("quota")}};
src=createLocalSource(full); await src.load(); r=await src.addExpense({name:"Listrik",amount:1000,category:"Utilitas"});
assert.equal(r.ok,true); assert.match(r.message,/Peringatan/);

// 7) tanpa penyimpanan sama sekali (kv=null) tetap jalan
src=createLocalSource(null); await src.load(); assert.equal((await src.addWaste({ingredient:"X",amount:5,reason:"Hilang"})).ok,true);

// 8) replaceAll
src=createLocalSource(memKV()); await src.load(); r=await src.replaceAll({products:[],sales:[],expenses:[],waste:[],movements:[]},"ok"); assert.equal(r.ok,true); assert.equal(r.state.products.length,0);
// 9) meter penyimpanan: tumbuh seiring data, level peringatan
{
  const {localUsage,LOCAL_QUOTA_CHARS}=await import("../src/lib/source.ts");
  const small=localUsage(demoState()); assert.ok(small.chars>1000&&small.pct<10&&small.level==="ok");
  const big=demoState(); const row=big.sales[0]; big.sales=Array.from({length:20000},(_,i)=>({...row,id:"s"+i}));
  const u=localUsage(big); assert.ok(u.pct>40&&u.pct<70&&u.level==="ok","20 ribu penjualan: "+u.pct+"%");
  const per=(u.chars-small.chars)/(20000-demoState().sales.length); assert.ok(per>100&&per<300,"~"+per+" karakter per penjualan");
  const capacity=Math.round(LOCAL_QUOTA_CHARS/per); assert.ok(capacity>15000&&capacity<50000,"kapasitas mode lokal ~"+capacity+" penjualan");
  assert.equal(localUsage({...big,sales:[...big.sales,...big.sales]}).level,"full");
}
console.log("source OK");
