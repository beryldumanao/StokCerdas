// Jalankan: npm test (butuh Node >= 22.6)
import {analyzeStock} from "../src/lib/analytics.ts";
import assert from "node:assert/strict";
const P=(id,stock,cost=10,price=15)=>({id,name:id,category:"x",price,cost,stock,minStock:1,unit:"pcs"});
const S=(productId,qty)=>({id:productId+qty+Math.random(),date:"2026-11-01",productId,productName:productId,qty,price:15,cost:10,total:qty*15});
// 10 hari: A terjual 20 (2/hari) stok 4 -> cover 2 hari (<3) kritis; B terjual 10 (1/hari) stok 4 -> 4 hari waspada;
// C terjual 5 stok 50 -> aman; D tidak terjual stok 5 -> lambat; E stok 0 tanpa penjualan -> aman
const h=analyzeStock([P("A",4),P("B",4),P("C",50),P("D",5),P("E",0)],[S("A",20),S("B",10),S("C",5)],10);
const by=Object.fromEntries(h.rows.map(r=>[r.product.id,r]));
assert.equal(by.A.status,"kritis"); assert.equal(by.A.daysCover,2);
assert.equal(by.A.marginAtRisk,Math.round(1*2*5)); // kekurangan 1 hari x 2/hari x laba 5
assert.equal(by.A.suggestedQty,Math.ceil(2*5)-4);  // 6
assert.equal(by.B.status,"waspada");
assert.equal(by.C.status,"aman"); assert.equal(by.C.suggestedQty,0);
assert.equal(by.D.status,"lambat"); assert.equal(h.deadCapital,50);
assert.equal(by.E.status,"aman");
assert.equal(h.tiedCapital,(4+4+50+5)*10);
assert.equal(h.score,Math.round((0+0.6+1+0.5+1)/5*100)); // 62
assert.equal(analyzeStock([],[],7).score,100);
console.log("OK",h.score,h.marginAtRisk,h.restockBudget);
