"use client";
import {useEffect} from "react";

/** Batas galat tingkat halaman: kesalahan tak terduga tidak lagi menampilkan layar putih. */
export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{console.error(error)},[error]);
  return <div className="boot"><div className="card" role="alert"><div className="card-title">Terjadi kesalahan</div>
    <p className="muted" style={{fontSize:13,lineHeight:1.7}}>Aplikasi mengalami masalah tak terduga. Data Anda tidak dihapus. Coba muat ulang bagian ini.</p>
    <div className="actions"><button className="btn" onClick={reset}>Coba lagi</button><button className="btn secondary" onClick={()=>window.location.reload()}>Muat ulang halaman</button></div></div></div>;
}
