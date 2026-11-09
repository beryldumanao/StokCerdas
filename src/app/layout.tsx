import type {Metadata,Viewport} from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StokCerdas — Kendali Stok dan Laba Toko Retail",
  description: "Dashboard stok, penjualan, dan insight restok untuk toko kelontong, sembako, dan perlengkapan rumah tangga.",
};
export const viewport: Viewport = {width: "device-width", initialScale: 1};

// Terapkan tema tersimpan sebelum render pertama agar tidak berkedip.
const THEME_BOOT = `try{var t=localStorage.getItem("stokcerdas-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="id" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html: THEME_BOOT}}/></head><body>{children}</body></html>;
}
