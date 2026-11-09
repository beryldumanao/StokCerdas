// Jalankan: npm test (butuh Node >= 22.6)
import assert from "node:assert/strict";
import {addProduct,updateProduct,deleteProduct,recordSale,voidSale,receiveStock,adjustStock,checkIntegrity,sanitizeState,exportBackup,parseBackup,localDate} from "../src/lib/inventory.ts";

const empty={products:[],sales:[],expenses:[],waste:[],movements:[]};
const ok=r=>{assert.equal(r.ok,true,r.error);return r.state};
const bad=(r,re)=>{assert.equal(r.ok,false);assert.match(r.error,re)};
const mk=(o={})=>({name:"Gula",category:"Sembako",price:15000,cost:12000,stock:10,minStock:3,unit:"kg",...o});

// --- produk
let s=ok(addProduct(empty,mk()));
const gula=s.products[0].id;
assert.equal(s.movements[0].type,"awal"); assert.equal(s.movements[0].balance,10);
bad(addProduct(s,mk({name:" gula "})),/sudah ada/);
bad(addProduct(s,mk({name:"",})),/wajib/);
bad(addProduct(s,mk({name:"X",price:0})),/Harga/);
bad(addProduct(s,mk({name:"X",stock:1.5})),/Stok/);
bad(addProduct(s,mk({name:"X",cost:-1})),/Modal/);
s=ok(addProduct(s,mk({name:"Beras",price:70000,cost:60000,stock:5,unit:"karung"})));
const beras=s.products[0].id;

// --- penjualan multi-item atomik
let r=recordSale(s,[{productId:gula,qty:4},{productId:beras,qty:2}]);
let s2=ok(r);
assert.equal(s2.products.find(p=>p.id===gula).stock,6); assert.equal(s2.products.find(p=>p.id===beras).stock,3);
assert.equal(s2.sales.length,2); assert.equal(s2.sales[0].receiptId,s2.sales[1].receiptId);
assert.equal(s2.sales.reduce((a,x)=>a+x.total,0),4*15000+2*70000);
assert.deepEqual(checkIntegrity(s2),[]);
// gagal sebagian -> tidak ada perubahan (atomik) dan state lama utuh
const before=JSON.stringify(s2);
bad(recordSale(s2,[{productId:gula,qty:1},{productId:beras,qty:99}]),/Stok Beras tidak cukup/);
assert.equal(JSON.stringify(s2),before);
// baris ganda produk yang sama digabung saat cek stok
bad(recordSale(s2,[{productId:gula,qty:4},{productId:gula,qty:4}]),/Stok Gula tidak cukup/);
bad(recordSale(s2,[{productId:gula,qty:0}]),/bilangan bulat/);
bad(recordSale(s2,[{productId:gula,qty:1.5}]),/bilangan bulat/);
bad(recordSale(s2,[]),/minimal satu/);
bad(recordSale(s2,[{productId:"zzz",qty:1}]),/tidak ditemukan/);

// --- pembatalan: seluruh struk, stok kembali
let s3=ok(voidSale(s2,s2.sales[0].id));
assert.equal(s3.sales.length,0); assert.equal(s3.products.find(p=>p.id===gula).stock,10); assert.equal(s3.products.find(p=>p.id===beras).stock,5);
assert.deepEqual(checkIntegrity(s3),[]);
bad(voidSale(s3,"nope"),/tidak ditemukan/);

// --- hapus produk
bad(deleteProduct(s2,gula),/riwayat penjualan/);
s3=ok(deleteProduct(s3,gula)); assert.equal(s3.products.some(p=>p.id===gula),false);

// --- terima barang: modal rata-rata tertimbang, modal transaksi lama tak berubah
let t=ok(addProduct(empty,mk({name:"Minyak",stock:10,cost:10000,price:15000})));
const m=t.products[0].id;
t=ok(recordSale(t,[{productId:m,qty:5}])); // stok 5, modal 10000
t=ok(receiveStock(t,{productId:m,qty:5,unitCost:12000})); // (5*10000+5*12000)/10 = 11000
assert.equal(t.products[0].stock,10); assert.equal(t.products[0].cost,11000);
assert.equal(t.sales[0].cost,10000);
assert.equal(t.movements[0].type,"pembelian");
bad(receiveStock(t,{productId:m,qty:0,unitCost:1}),/Jumlah/);
bad(receiveStock(t,{productId:m,qty:1,unitCost:-5}),/Harga beli/);
// stok 0 lalu terima: modal = harga beli baru (tanpa bagi nol)
let z=ok(addProduct(empty,mk({name:"Kosong",stock:0})));
z=ok(receiveStock(z,{productId:z.products[0].id,qty:4,unitCost:7777})); assert.equal(z.products[0].cost,7777);

// --- opname
t=ok(adjustStock(t,{productId:m,newStock:8,note:"Rusak 2"}));
assert.equal(t.products[0].stock,8); assert.equal(t.movements[0].qty,-2); assert.equal(t.movements[0].note,"Rusak 2");
bad(adjustStock(t,{productId:m,newStock:8}),/sama/);
bad(adjustStock(t,{productId:m,newStock:-1}),/Stok fisik/);
assert.deepEqual(checkIntegrity(t),[]);

// --- edit produk: stok tidak berubah, nama unik
let u=ok(updateProduct(t,m,{name:"Minyak Curah",category:"Sembako",price:16000,cost:11000,minStock:4,unit:"liter"}));
assert.equal(u.products[0].stock,8); assert.equal(u.products[0].price,16000); assert.equal(u.sales[0].price,15000);
bad(updateProduct(s,gula,{name:"Beras",category:"x",price:1,cost:1,minStock:1,unit:"kg"}),/sudah ada/);
bad(updateProduct(s,"nope",{name:"A",category:"x",price:1,cost:1,minStock:1,unit:"kg"}),/tidak ditemukan/);

// --- integritas mendeteksi kerusakan
const broken={...s2,products:s2.products.map(p=>p.id===gula?{...p,stock:-3}:p),sales:s2.sales.map((x,i)=>i?x:{...x,total:1})};
assert.ok(checkIntegrity(broken).length>=2);

// --- sanitize: baris rusak dibuang, tidak crash
const dirty=sanitizeState({products:[{id:"a",name:"OK",price:1,cost:0,stock:1,minStock:0},{id:"b",name:"",price:1},{id:"a",name:"Dup",price:1,cost:0,stock:1,minStock:0},null,{id:"c",name:"Neg",price:1,cost:0,stock:-5,minStock:0}],sales:[{id:"s",date:"bukan-tanggal"}]});
assert.equal(dirty.state.products.length,1); assert.equal(dirty.state.sales.length,0); assert.ok(dirty.dropped>=4);
assert.deepEqual(sanitizeState("sampah").state,{products:[],sales:[],expenses:[],waste:[],movements:[]});
// data lama (tanpa movements) tetap termuat
assert.equal(sanitizeState({products:[{id:"a",name:"Lama",price:1,cost:0,stock:1,minStock:0}]}).state.movements.length,0);

// --- backup round-trip
const back=parseBackup(exportBackup(s2)); assert.equal(back.ok,true); assert.deepEqual(back.state,s2); assert.equal(back.dropped,0);
assert.equal(parseBackup("{bukan json").ok,false);
assert.equal(parseBackup(JSON.stringify({app:"lain",version:1})).ok,false);
assert.equal(parseBackup(JSON.stringify({app:"stokcerdas",version:99,data:{}})).ok,false);
assert.equal(parseBackup(exportBackup(empty)).ok,false);

assert.match(localDate(new Date(2026,0,5,23,59)),/^2026-01-05$/);
console.log("inventory OK");

// --- biaya & barang rusak (dipindah dari UI ke domain)
import {addExpense,addWaste,deleteExpense,deleteWaste} from "../src/lib/inventory.ts";
let e=ok(addExpense(empty,{name:" Listrik ",amount:350000,category:"Utilitas"},"2026-11-01"));
assert.equal(e.expenses[0].name,"Listrik"); assert.equal(e.expenses[0].date,"2026-11-01");
bad(addExpense(empty,{name:"",amount:1,category:"x"}),/wajib/);
bad(addExpense(empty,{name:"A",amount:0,category:"x"}),/lebih dari 0/);
bad(addExpense(empty,{name:"A",amount:NaN,category:"x"}),/lebih dari 0/);
let w=ok(addWaste(empty,{ingredient:"Minyak bocor",amount:15500,reason:"Kemasan bocor"}));
assert.equal(w.waste[0].reason,"Kemasan bocor");
bad(addWaste(empty,{ingredient:" ",amount:5,reason:"x"}),/wajib/);
bad(addWaste(empty,{ingredient:"A",amount:-1,reason:"x"}),/lebih dari 0/);
{ // hapus catatan biaya / barang rusak
  const both=ok(addWaste(e,{ingredient:"Telur",amount:9000,reason:"Rusak"})); assert.equal(both.expenses.length,1); assert.equal(both.waste.length,1);
  const noE=ok(deleteExpense(both,both.expenses[0].id)); assert.equal(noE.expenses.length,0); assert.equal(noE.waste.length,1,"hapus biaya tidak menyentuh barang rusak");
  const noW=ok(deleteWaste(both,both.waste[0].id)); assert.equal(noW.waste.length,0); assert.equal(noW.expenses.length,1);
  bad(deleteExpense(both,"tidak-ada"),/tidak ditemukan/); bad(deleteWaste(both,"tidak-ada"),/tidak ditemukan/);
  assert.equal(both.expenses.length,1,"state asal tidak dimutasi");
}
console.log("expense/waste OK");
