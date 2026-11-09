process.env.TZ="Asia/Bangkok"; // pemetaan tanggal harus memakai zona waktu pengguna
import assert from "node:assert/strict";
import {createCloudSource,ensureBusiness,mapSales,mapMovement,mapProduct} from "../src/lib/cloud.ts";

const B="biz-1";
function fake(db,rpcImpl={}){
  const calls=[];
  const client={calls,
    from(table){const q={table,op:"select",filters:[],payload:null};
      const b={select(c){if(q.op==="select")q.cols=c;else q.returning=true;return b},eq(k,v){q.filters.push([k,v]);return b},gte(k,v){q.gte=[k,v];return b},order(c){(q.orders??=[]).push(c);return b},limit(n){q.limit=n;return b},range(a2,b2){q.range=[a2,b2];return b},single(){q.single=true;return b},
        insert(row){q.op="insert";q.payload=row;return b},update(row){q.op="update";q.payload=row;return b},delete(){q.op="delete";return b},
        then(res,rej){calls.push(q);let out;
          if(q.op==="select"){let d=db[table]||[];if(q.range)d=d.slice(q.range[0],q.range[1]+1);if(q.limit!==undefined)d=d.slice(0,q.limit);out={data:q.single?d[0]:d,error:db.__error&&db.__error===table?{message:"boom "+table}:null}}
          else if(q.op==="insert"){out={data:q.returning?{id:"new-biz"}:null,error:db.__insertError||null}}
          else out={data:null,error:db.__updateError||null};
          return Promise.resolve(out).then(res,rej)}};
      return b},
    rpc(fn,args){calls.push({rpc:fn,args});if(rpcImpl.__throw)return Promise.reject(new Error("jaringan putus"));return Promise.resolve(rpcImpl[fn]?rpcImpl[fn](args):{data:null,error:null})}};
  return client;
}
const DB=()=>({
  products:[{id:"p1",name:"Gula",category:"Sembako",selling_price:"15000.00",unit_cost:"12000.00",stock:"6.000",min_stock:"3.000",unit:"kg",image_name:null,image_data:null},{id:"p2",name:"Beras",category:"Sembako",selling_price:"70000.00",unit_cost:"60000.00",stock:"3.000",min_stock:"2.000",unit:"karung",image_name:"",image_data:""}],
  sales:[{id:"r1",sold_at:"2026-11-05T20:00:00Z",sale_items:[{id:"i1",product_id:"p1",product_name_snapshot:"Gula",quantity:"4.000",unit_price:"15000.00",unit_cost:"12000.00",line_total:"60000.00"},{id:"i2",product_id:"p2",product_name_snapshot:"Beras",quantity:"2.000",unit_price:"70000.00",unit_cost:"60000.00",line_total:"140000.00"}]}],
  expenses:[{id:"e1",spent_at:"2026-11-01T05:00:00Z",name:"Listrik",category:"Utilitas",amount:"350000.00"}],
  waste_records:[{id:"w1",recorded_at:"2026-11-02T05:00:00Z",ingredient_name:"Minyak bocor",amount:"15500.00",reason:"Kemasan bocor"}],
  stock_movements:[{id:"m1",created_at:"2026-11-05T20:00:00Z",product_id:"p1",product_name_snapshot:"Gula",movement_type:"sale",quantity_delta:"-4.000",balance_after:"6.000",note:"Penjualan"},{id:"m2",created_at:"2026-11-01T05:00:00Z",product_id:"p1",product_name_snapshot:"Gula",movement_type:"opening",quantity_delta:"10.000",balance_after:"10.000",note:"Stok awal"}],
});

// --- pemetaan
let c=fake(DB()), src=createCloudSource(c,B); let {state}=await src.load();
assert.equal(src.kind,"cloud");
assert.deepEqual(state.products[0],{id:"p1",name:"Gula",category:"Sembako",price:15000,cost:12000,stock:6,minStock:3,unit:"kg",imageName:"",imageData:""});
assert.equal(typeof state.products[0].price,"number");
assert.equal(state.sales.length,2); assert.equal(state.sales[0].receiptId,"r1"); assert.equal(state.sales[0].id,"i1"); assert.equal(state.sales[0].total,60000);
assert.equal(state.sales[0].date,"2026-11-06","UTC 20:00 = 03:00 WIB hari berikutnya");
assert.equal(state.expenses[0].date,"2026-11-01"); assert.equal(state.waste[0].ingredient,"Minyak bocor");
assert.equal(state.movements[0].type,"penjualan"); assert.equal(state.movements[1].type,"awal"); assert.equal(state.movements[0].balance,6);
assert.equal(mapMovement({id:"x",created_at:"2026-11-01T00:00:00Z",movement_type:"waste",quantity_delta:"-1",product_name_snapshot:"A",balance_after:null}).type,"penyesuaian");
assert.equal(c.calls.filter(x=>x.table).every(x=>x.filters.some(f=>f[0]==="business_id"&&f[1]===B)),true,"semua query dibatasi business_id");

// --- jendela waktu + paginasi: Supabase membatasi 1000 baris per permintaan, jadi semua halaman harus diambil
{
  const fixedNow=new Date("2026-11-08T00:00:00Z"), c2=fake(DB()); await createCloudSource(c2,B,{now:()=>fixedNow}).load();
  const q=Object.fromEntries(c2.calls.filter(x=>x.table).map(x=>[x.table,x]));
  assert.deepEqual(q.sales.gte,["sold_at","2026-08-10T00:00:00.000Z"]); assert.equal(q.expenses.gte[0],"spent_at"); assert.equal(q.waste_records.gte[0],"recorded_at");
  assert.equal(q.products.gte,undefined); assert.deepEqual(q.sales.range,[0,999]); assert.equal(q.stock_movements.limit,1000);
  assert.ok(q.sales.orders.length===2&&q.sales.orders[1]==="id","urutan stabil (tie-breaker id) agar halaman tidak tumpang tindih");
  const c3=fake(DB()); await createCloudSource(c3,B,{now:()=>fixedNow,windowDays:30}).load();
  assert.equal(c3.calls.find(x=>x.table==="sales").gte[1],"2026-10-09T00:00:00.000Z");

  // 2.500 produk -> 3 halaman, semuanya termuat, tanpa pemberitahuan
  const many=DB(); many.products=Array.from({length:2500},(_,i)=>({...many.products[0],id:"p"+i,name:"P"+i}));
  const c4=fake(many); const l4=await createCloudSource(c4,B).load();
  assert.equal(l4.state.products.length,2500); assert.equal(l4.notice,undefined);
  assert.deepEqual(c4.calls.filter(x=>x.table==="products").map(x=>x.range),[[0,999],[1000,1999],[2000,2999]]);
  // tepat 1000 baris -> perlu satu halaman tambahan untuk memastikan tidak ada sisa
  const exact=DB(); exact.products=Array.from({length:1000},(_,i)=>({...exact.products[0],id:"e"+i,name:"E"+i}));
  const c5=fake(exact); assert.equal((await createCloudSource(c5,B).load()).state.products.length,1000); assert.equal(c5.calls.filter(x=>x.table==="products").length,2);
  // melewati batas halaman -> terpotong DAN pengguna diberi tahu (tidak diam-diam)
  const l6=await createCloudSource(fake(many),B,{maxPages:2}).load();
  assert.equal(l6.state.products.length,2000); assert.match(l6.notice,/produk.*2000 baris terbaru/);
}

// --- galat saat memuat -> melempar (UI menampilkan layar galat)
c=fake({...DB(),__error:"expenses"}); await assert.rejects(()=>createCloudSource(c,B).load(),/boom expenses/);

// --- penjualan: parameter RPC benar, lalu muat ulang
c=fake(DB()); src=createCloudSource(c,B); await src.load(); c.calls.length=0;
let r=await src.recordSale([{productId:"p1",qty:2},{productId:"p2",qty:1}]);
assert.equal(r.ok,true); assert.deepEqual(c.calls[0],{rpc:"create_sale",args:{p_business:B,p_lines:[{product_id:"p1",quantity:2},{product_id:"p2",quantity:1}]}});
assert.ok(c.calls.filter(x=>x.table==="products").length>=1,"memuat ulang setelah menulis");
// kesalahan dari database diteruskan apa adanya (sudah berbahasa Indonesia)
c=fake(DB(),{create_sale:()=>({data:null,error:{message:"Stok Beras tidak cukup (tersisa 3, diminta 99)."}})}); src=createCloudSource(c,B); await src.load();
r=await src.recordSale([{productId:"p2",qty:99}]); assert.equal(r.ok,false); assert.match(r.error,/Stok Beras tidak cukup/);
// validasi dasar tanpa memanggil server
c=fake(DB()); src=createCloudSource(c,B); await src.load(); c.calls.length=0;
assert.equal((await src.recordSale([])).ok,false); assert.equal((await src.recordSale([{productId:"p1",qty:1.5}])).ok,false); assert.equal(c.calls.length,0);

// --- batalkan: id item -> id struk
r=await src.voidSale("i2"); assert.equal(r.ok,true); assert.deepEqual(c.calls.find(x=>x.rpc==="void_sale").args,{p_sale:"r1"});
assert.equal((await src.voidSale("tidak-ada")).ok,false);

// --- produk
c=fake(DB()); src=createCloudSource(c,B); await src.load(); c.calls.length=0;
r=await src.addProduct({name:"Kopi",category:"Minuman kemasan",price:5000,cost:3000,stock:10,minStock:2,unit:"pcs"});
assert.equal(r.ok,true); assert.deepEqual(c.calls[0],{rpc:"create_product",args:{p_business:B,p_name:"Kopi",p_category:"Minuman kemasan",p_price:5000,p_cost:3000,p_stock:10,p_min_stock:2,p_unit:"pcs",p_image_name:"",p_image_data:""}});
r=await src.updateProduct("p1",{name:"Beras",category:"x",price:1,cost:1,minStock:1,unit:"kg"}); assert.equal(r.ok,false); assert.match(r.error,/sudah ada/);
c.calls.length=0; r=await src.updateProduct("p1",{name:"Gula Pasir",category:"Sembako",price:16000,cost:12500,minStock:4,unit:"kg"});
const upd=c.calls.find(x=>x.op==="update"); assert.equal(r.ok,true); assert.equal(upd.table,"products"); assert.deepEqual(upd.filters,[["id","p1"]]);
assert.equal(upd.payload.selling_price,16000); assert.ok(!("stock" in upd.payload),"stok tidak diubah lewat update produk");
c=fake({...DB(),__updateError:{message:"duplicate key",code:"23505"}}); src=createCloudSource(c,B); await src.load();
r=await src.updateProduct("p1",{name:"Gula Pasir",category:"x",price:1,cost:1,minStock:1,unit:"kg"}); assert.equal(r.ok,false); assert.match(r.error,/sudah dipakai/);
assert.equal((await src.updateProduct("nope",{name:"A",category:"x",price:1,cost:1,minStock:1,unit:"kg"})).ok,false);

// --- penerimaan, opname, hapus
c=fake(DB()); src=createCloudSource(c,B); await src.load(); c.calls.length=0;
await src.receiveStock({productId:"p1",qty:5,unitCost:14000,note:"F1"}); await src.adjustStock({productId:"p1",newStock:8}); await src.deleteProduct("p2");
assert.deepEqual(c.calls.filter(x=>x.rpc).map(x=>x.rpc),["receive_stock","adjust_stock","delete_product"]);
assert.deepEqual(c.calls.find(x=>x.rpc==="receive_stock").args,{p_product:"p1",p_quantity:5,p_unit_cost:14000,p_note:"F1"});
assert.equal(c.calls.find(x=>x.rpc==="adjust_stock").args.p_note,null);

// --- biaya & barang rusak: validasi bersama + payload
c=fake(DB()); src=createCloudSource(c,B); await src.load(); c.calls.length=0;
assert.equal((await src.addExpense({name:"",amount:5,category:"x"})).ok,false); assert.equal(c.calls.length,0);
r=await src.addExpense({name:"Sewa",amount:1000000,category:"Sewa"}); const ins=c.calls.find(x=>x.op==="insert");
assert.equal(r.ok,true); assert.equal(ins.table,"expenses"); assert.equal(ins.payload.business_id,B); assert.equal(ins.payload.amount,1000000); assert.match(ins.payload.spent_at,/^\d{4}-\d{2}-\d{2}T/);
r=await src.deleteExpense("e1"); assert.equal(r.ok,true); {const d=c.calls.find(x=>x.op==="delete"); assert.equal(d.table,"expenses"); assert.deepEqual(d.filters,[["id","e1"],["business_id",B]]);}
assert.equal((await src.deleteExpense("tidak-ada")).ok,false);
r=await src.deleteWaste("w1"); assert.equal(r.ok,true); assert.equal(c.calls.filter(x=>x.op==="delete").at(-1).table,"waste_records");
r=await src.addWaste({ingredient:"Telur",amount:9000,reason:"Rusak"}); assert.equal(c.calls.filter(x=>x.op==="insert").at(-1).table,"waste_records");

// --- jaringan putus -> pesan, bukan crash
c=fake(DB(),{__throw:true}); src=createCloudSource(c,B); await src.load();
r=await src.recordSale([{productId:"p1",qty:1}]); assert.equal(r.ok,false); assert.match(r.error,/Gagal menghubungi server: jaringan putus/);

// --- replaceAll tidak didukung di cloud
assert.equal((await src.replaceAll({products:[],sales:[],expenses:[],waste:[],movements:[]},"x")).ok,false);

// --- ensureBusiness
assert.equal(await ensureBusiness(fake({businesses:[{id:"b-ada"}]}),"u1"),"b-ada");
c=fake({businesses:[]}); assert.equal(await ensureBusiness(c,"u1","Toko X"),"new-biz"); assert.deepEqual(c.calls.find(x=>x.op==="insert").payload,{owner_id:"u1",name:"Toko X"});
await assert.rejects(()=>ensureBusiness(fake({businesses:[],__insertError:{message:"ditolak"}}),"u1"),/ditolak/);
console.log("cloud OK");
