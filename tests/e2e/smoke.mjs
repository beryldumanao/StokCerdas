// Uji asap UI di browser sungguhan (Chromium via Playwright) terhadap seluruh aplikasi mode lokal.
// Ikon (lucide-react) dan grafik (recharts) diganti stub agar bundel kecil; logika, state, dan DOM aplikasi asli.
// Jalankan: npm run test:e2e   (sekali saja: npx playwright install chromium)
import {build} from "esbuild";
import {chromium} from "playwright";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=join(ROOT,"src");
const OUT=mkdtempSync(join(tmpdir(),"stokcerdas-e2e-"));

// --- stub ikon & grafik, dibuat dari nama yang benar-benar diimpor aplikasi
const walk=d=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?walk(p):/\.tsx?$/.test(f)?[p]:[]});
const icons=new Set();
for(const f of walk(SRC))for(const m of readFileSync(f,"utf8").matchAll(/import \{([^}]*)\} from "lucide-react"/g))m[1].split(",").map(s=>s.trim()).filter(Boolean).forEach(n=>icons.add(n));
writeFileSync(join(OUT,"lucide.jsx"),`import React from "react";const mk=n=>p=>React.createElement("svg",{"data-icon":n,width:p.size||16,height:p.size||16,"aria-hidden":true});\n${[...icons].map(n=>`export const ${n}=mk("${n}");`).join("\n")}\n`);
writeFileSync(join(OUT,"recharts.jsx"),`import React from "react";const B=n=>({children})=>React.createElement("div",{"data-chart":n},children);export const Area=B("Area"),AreaChart=B("AreaChart"),CartesianGrid=B("CartesianGrid"),ResponsiveContainer=B("ResponsiveContainer"),Tooltip=B("Tooltip"),XAxis=B("XAxis"),YAxis=B("YAxis");\n`);
writeFileSync(join(OUT,"ssr.js"),`export const createBrowserClient=()=>{throw new Error("tidak dipakai di mode lokal")};\n`);
writeFileSync(join(OUT,"entry.jsx"),`import React from "react";import {createRoot} from "react-dom/client";import Page from "@/app/page";createRoot(document.getElementById("root")).render(React.createElement(Page));\n`);
writeFileSync(join(OUT,"app.css"),readFileSync(join(SRC,"app/globals.css"),"utf8").replace(/@import url[^;]*;/g,"").replace(/@tailwind [a-z]+;/g,""));
writeFileSync(join(OUT,"index.html"),`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><script>try{var t=localStorage.getItem("stokcerdas-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}</script></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`);
await build({entryPoints:[join(OUT,"entry.jsx")],bundle:true,outfile:join(OUT,"bundle.js"),jsx:"automatic",nodePaths:[join(ROOT,"node_modules")],
  alias:{"@":SRC,"lucide-react":join(OUT,"lucide.jsx"),"recharts":join(OUT,"recharts.jsx"),"@supabase/ssr":join(OUT,"ssr.js")},
  define:{"process.env.NODE_ENV":'"development"',"process.env.NEXT_PUBLIC_SUPABASE_URL":"undefined","process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY":"undefined"},logLevel:"warning"});

// --- server statis kecil
const TYPES={".html":"text/html",".js":"text/javascript",".css":"text/css"};
const server=createServer((req,res)=>{const f=join(OUT,req.url==="/"?"index.html":req.url.split("?")[0]);try{res.setHeader("content-type",TYPES[f.slice(f.lastIndexOf("."))]||"text/plain");res.end(readFileSync(f))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,r));
const URL_=`http://localhost:${server.address().port}/index.html`;

let b;
try{
 b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:1366,height:900},locale:"id-ID",timezoneId:"Asia/Bangkok"});
 const page=await ctx.newPage();
 const errors=[];
 page.on("console",m=>{if(m.type()==="error"&&!/fonts|ERR_|favicon|unrecognized in this browser|incorrect casing/.test(m.text()))errors.push(m.text())});
 page.on("pageerror",e=>errors.push("PAGEERROR "+e.message));
 page.on("dialog",d=>d.accept());
 const toast=async re=>{await page.waitForSelector(".toast");const t=await page.textContent(".toast");assert.match(t,re,"toast: "+t)};
 const click=name=>page.getByRole("button",{name,exact:false}).first().click();
 await page.goto(URL_);

 await page.waitForSelector('text=Ringkasan Bisnis');
 assert.match(await page.textContent('.sidebar'),/MODE LOKAL/);
 // tab Masalah & Solusi berada di dalam <main>
 await page.getByRole('button',{name:'Masalah & Solusi'}).first().click();
 assert.equal(await page.locator('main.main >> text=Masalah yang kami selesaikan').count(),1,'ProblemTab harus di dalam main');
 const order=await page.evaluate(()=>{const s=[...document.querySelectorAll('main.main section')].find(x=>x.textContent.includes('Masalah yang kami selesaikan'));const f=document.querySelector('footer');return !!(s&&f&&(s.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING))});
 assert.equal(order,true,'footer harus berada di bawah konten tab');
 // AksiCerdas: panel Kesehatan Stok
 await page.getByRole('button',{name:'AksiCerdas'}).first().click();
 await page.waitForSelector('text=Kesehatan Stok'); assert.ok(await page.locator('text=Skor kesehatan stok').count()>=1);
 // Transaksi: penjualan multi-item
 await page.getByRole('button',{name:'Transaksi'}).first().click();
 const rowsBefore=await page.locator('tbody tr').count();
 await click('Penjualan baru'); await page.waitForSelector('text=Catat penjualan');
 await click('Tambah item');
 const selects=page.locator('.sale-line select'); assert.equal(await selects.count(),2);
 await selects.nth(1).selectOption({index:2});
 await page.locator('.sale-line input').nth(0).fill('1'); await page.locator('.sale-line input').nth(1).fill('1');
 await click('Simpan data'); await toast(/Penjualan tersimpan \(2 item/);
 assert.equal(await page.locator('tbody tr').count(),rowsBefore+2,'dua baris baru');
 // stok tidak cukup: tolak, tidak ada baris baru
 await page.waitForSelector('.toast',{state:'detached'});
 await click('Penjualan baru'); await page.locator('.sale-line input').nth(0).fill('9999'); await page.waitForSelector('.field-warn');
 await click('Simpan data'); await toast(/tidak cukup/); assert.equal(await page.locator('tbody tr').count(),rowsBefore+2);
 await page.getByRole('button',{name:'Tutup'}).click();
 // batalkan struk (confirm diterima otomatis)
 await page.getByRole('button',{name:'Batalkan'}).first().click(); await toast(/dibatalkan/);
 assert.equal(await page.locator('tbody tr').count(),rowsBefore,'struk dibatalkan');
 // persediaan: terima barang, opname, riwayat
 await page.getByRole('button',{name:'Persediaan'}).first().click();
 await page.locator('tbody tr').first().getByRole('button',{name:'Terima'}).click(); await page.waitForSelector('text=Terima barang dari pemasok');
 await page.locator('.modal .field input[type=number]').nth(0).fill('5'); await click('Simpan data'); await toast(/diterima/);
 await page.locator('tbody tr').first().getByRole('button',{name:'Opname'}).click(); await page.waitForSelector('text=Stok opname >> nth=-1');
 const cur=await page.locator('.modal .field input[type=number]').first().inputValue();
 await page.locator('.modal .field input[type=number]').first().fill(String(Number(cur)+1)); await click('Simpan data'); await toast(/disesuaikan/);
 assert.ok(await page.locator('text=Riwayat pergerakan stok').count()>=1);
 const ledger=await page.locator('section:has-text("Riwayat pergerakan stok") tbody tr').count(); assert.ok(ledger>=4,'riwayat terisi: '+ledger);
 await click('Periksa integritas'); await toast(/Data konsisten/);
 assert.ok(await page.locator('text=Penyimpanan browser terpakai').count()>=1,'meter penyimpanan lokal tampil');
 // katalog: edit produk (stok tidak bisa diubah) + hapus produk terjual ditolak
 await page.getByRole('button',{name:'Katalog Produk'}).first().click();
 await page.getByRole('button',{name:'Edit'}).first().click(); await page.waitForSelector('text=Edit produk');
 assert.equal(await page.locator('.modal input[disabled]').count(),1,'stok dinonaktifkan saat edit');
 await page.locator('.modal .field input').first().fill('Produk Diedit'); await click('Simpan data'); await toast(/Produk diperbarui/);
 assert.ok(await page.locator('text=Produk Diedit').count()>=1);
 // dampak bisnis: kalkulator bereaksi terhadap masukan dan laporan CSV bisa diunduh
 await page.getByRole('button',{name:'Dampak Bisnis'}).first().click(); await page.waitForSelector('text=Kalkulator estimasi manfaat');
 assert.equal(await page.locator('main.main >> text=Dampak bisnis untuk toko ini').count(),1,'tab Dampak di dalam main');
 const cash=()=>page.locator('section.card',{hasText:'Manfaat tunai per bulan'}).locator('.metric-value').textContent();
 const c0=await cash(); await page.locator('#imp-stockoutsPerMonth').fill('40'); const c1=await cash(); assert.notEqual(c0,c1,'manfaat tunai berubah saat masukan berubah');
 await page.locator('#imp-stockoutsPerMonth').fill('0'); await page.waitForSelector('text=Belum ada kejadian stok habis');
 await page.getByRole('button',{name:'Kembalikan ke data toko'}).click();
 if(process.env.SHOTS_DIR){await page.screenshot({path:join(process.env.SHOTS_DIR,'impact.png'),fullPage:true})}
 const [dl]=await Promise.all([page.waitForEvent('download'),click('Unduh laporan dampak')]);
 const csvText=readFileSync(await dl.path(),'utf8'); assert.ok(csvText.includes('Kejadian stok habis 30 hari')&&csvText.includes('ESTIMASI'),'isi CSV laporan dampak');
 // biaya
 await page.getByRole('button',{name:'Biaya & Penyesuaian'}).first().click();
 // persistensi: muat ulang -> data tetap
 await page.reload(); await page.waitForSelector('text=Ringkasan Bisnis'); await page.getByRole('button',{name:'Katalog Produk'}).first().click();
 assert.ok(await page.locator('text=Produk Diedit').count()>=1,'data bertahan setelah reload');
 // gelap: tema tersimpan dan tidak berkedip
 await page.locator('.theme-toggle').click(); await page.screenshot({path:'dark.png'});
 await page.reload(); await page.waitForSelector('text=Katalog Produk'); assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 // mobile
 await page.setViewportSize({width:390,height:844}); await page.getByRole('button',{name:'Transaksi'}).last().click(); await click('Penjualan baru'); await page.screenshot({path:'mobile.png'});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1); assert.equal(overflow,false,'tidak ada scroll horizontal di ponsel');
 assert.deepEqual(errors,[],'tidak ada galat konsol: '+errors.join(' | '));
 console.log("UJI ASAP UI LULUS");
}catch(e){console.error("UJI ASAP UI GAGAL:",e.message);process.exitCode=1}
finally{await b?.close();server.close()}
