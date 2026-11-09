import {Activity,Boxes,Lightbulb,Target,TrendingUp,Wallet} from "lucide-react";
import type {StockHealth} from "@/lib/analytics";
import {Metric} from "./ui";

export function ProblemTab({health,fmt}:{health:StockHealth;fmt:(n:number)=>string}){
 const problems:[string,string,string,string][]=[
  ["Kehabisan stok saat pelanggan datang","Pemilik mengandalkan ingatan atau buku catatan, sehingga baru sadar barang habis setelah pembeli menanyakannya. Penjualan hilang dan pelanggan pindah toko.","Hari stok tersisa dan status Kritis/Waspada per produk, plus saran jumlah beli",`Laba berisiko hilang: ${fmt(health.marginAtRisk)}`],
  ["Modal tertahan di barang yang tidak laku","Pembelian berdasarkan perkiraan membuat uang menumpuk di rak, padahal modal usaha kecil sangat terbatas.","Deteksi stok lambat dan nilai modal yang menganggur",`Modal tertahan: ${fmt(health.deadCapital)}`],
  ["Untung-rugi tidak terlihat jelas","Barang rusak, hilang, dan biaya kecil jarang dicatat, sehingga laba yang dikira besar ternyata tipis.","Laba operasional setelah biaya dan barang rusak, plus simulasi harga dan volume","Laba estimasi di halaman Ringkasan"],
 ];
 const innovations:[string,string][]=[
  ["Ukuran dinamis, bukan angka minimum tetap","Status stok dihitung dari kecepatan jual tiap produk. Produk laris dengan stok “banyak” tetap diperingatkan, dan produk lambat dengan stok “aman” tetap ditandai."],
  ["Dampak dalam rupiah, bukan jargon","Pemilik toko melihat “laba berisiko hilang” dan “modal tertahan” langsung dalam rupiah, bukan grafik rumit atau istilah akuntansi."],
  ["Transparan dan bisa disesuaikan","Semua rekomendasi berbasis aturan yang rumusnya ditampilkan di layar, dengan asumsi waktu pengadaan dan stok pengaman yang dapat disesuaikan. Tidak ada kotak hitam."],
  ["Satu alur kerja untuk toko kecil","Catat penjualan sekali, lalu stok, laba, peringatan restok, dan laporan CSV ikut terbarui. Tidak perlu input ganda atau keahlian akuntansi."],
 ];
 return <>
  <section className="page-panel tint-panel" style={{marginBottom:16}}><div style={{display:"flex",gap:12,alignItems:"flex-start"}}><div className="metric-icon"><Target size={18}/></div><div><div className="card-title">Masalah yang kami selesaikan</div><div className="card-desc" style={{lineHeight:1.75,fontSize:13}}>Toko kelontong, sembako, dan perlengkapan rumah tangga umumnya mengelola stok dengan catatan manual. Hasilnya dua kerugian yang berulang setiap bulan: <b>barang laris kehabisan</b> dan <b>barang tidak laku menumpuk</b> hingga menahan modal. StokCerdas mengubah catatan penjualan harian menjadi keputusan beli yang jelas, dalam rupiah.</div></div></div></section>
  <div className="grid metrics" style={{marginBottom:16}}>
   <Metric title="UMKM terhadap PDB" value="±60%" foot="60,51% (BRI, Jan 2025); ±Rp9.580 T pada 2023 (Kementerian UMKM, Jun 2025)" icon={<TrendingUp size={17}/>}/>
   <Metric title="Serapan tenaga kerja" value="hingga 97%" foot="Dari total tenaga kerja nasional (CNBC Indonesia, 24 Jan 2025)" icon={<Boxes size={17}/>}/>
   <Metric title="Skor stok toko Anda" value={`${health.score}/100`} foot="Dihitung langsung dari data di aplikasi ini" icon={<Activity size={17}/>}/>
   <Metric title="Laba berisiko + modal tertahan" value={fmt(health.marginAtRisk+health.deadCapital)} foot="Nilai yang bisa diselamatkan dengan keputusan restok lebih tepat" icon={<Wallet size={17}/>}/>
  </div>
  <section className="page-panel" style={{marginBottom:16}}><div className="card-title">Masalah → Fitur → Bukti dari data</div><div className="card-desc">Setiap masalah dipetakan ke fitur yang menjawabnya dan angka yang bisa diperiksa langsung.</div>
   <div className="table-wrap" style={{whiteSpace:"normal"}}><table style={{whiteSpace:"normal"}}><thead><tr><th>MASALAH</th><th>KENAPA TERJADI</th><th>FITUR STOKCERDAS</th><th>BUKTI DI APLIKASI</th></tr></thead><tbody>{problems.map(([a,b,c,d])=><tr key={a}><td style={{minWidth:170}}><b>{a}</b></td><td style={{minWidth:240,lineHeight:1.6}}>{b}</td><td style={{minWidth:200,lineHeight:1.6}}>{c}</td><td style={{minWidth:150}}><span className="pill">{d}</span></td></tr>)}</tbody></table></div></section>
  <section className="page-panel" style={{marginBottom:16}}><div className="card-title">Apa yang baru di StokCerdas</div>
   {innovations.map(([t,d])=><div className="insight" key={t}><div className="insight-icon"><Lightbulb size={18}/></div><div><b>{t}</b><p>{d}</p></div></div>)}</section>
  <section className="page-panel"><div className="card-title">Status validasi &amp; batasan</div><div className="card-desc" style={{lineHeight:1.75,fontSize:12}}>Angka UMKM di atas mencakup seluruh sektor, bukan hanya retail. Gambaran masalah stok (kehabisan, kelebihan, pencatatan manual rawan salah) bersumber dari <a href="https://ukmindonesia.id/baca-deskripsi-posts/stok-barang-sering-kacau-saatnya-umkm-kenali-software-inventory-management" target="_blank" rel="noreferrer" className="accent-text">UKM Indonesia</a> dan belum disertai statistik. Data di aplikasi ini adalah data demo. Hipotesis masalah akan divalidasi lewat wawancara pemilik toko (panduan ada di README). Skor dan rekomendasi adalah alat bantu keputusan, bukan prediksi yang dijamin akurat.</div></section>
 </>}
