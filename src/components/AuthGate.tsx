"use client";
import {FormEvent,ReactNode,useEffect,useMemo,useState} from "react";
import {cloudConfigured,getSupabase} from "@/lib/supabase";
import {createCloudSource,ensureBusiness} from "@/lib/cloud";
import type {SupabaseLike} from "@/lib/cloud";
import {createLocalSource} from "@/lib/source";
import type {DataSource,KV} from "@/lib/source";

export type Ctx={source:DataSource;user?:{email:string};onSignOut?:()=>void};
type Session={id:string;email:string};

const safeStorage=():KV|null=>{try{const s=window.localStorage;s.getItem("x");return s}catch{return null}};
const AUTH_ERRORS:Record<string,string>={"Invalid login credentials":"Email atau kata sandi salah.","Email not confirmed":"Email belum dikonfirmasi. Cek kotak masuk Anda.","User already registered":"Email ini sudah terdaftar. Silakan masuk."};
const authMsg=(m:string)=>AUTH_ERRORS[m]||m;

/**
 * Memilih sumber data:
 *  - Supabase belum dikonfigurasi  -> mode lokal (data di browser).
 *  - Supabase dikonfigurasi        -> wajib login; data per akun lewat CloudSource. Tombol "coba mode demo lokal" tetap tersedia.
 */
export default function AuthGate({children}:{children:(c:Ctx)=>ReactNode}){
 const client=useMemo(()=>getSupabase(),[]);
 const [useLocal,setUseLocal]=useState(!cloudConfigured);
 const [local,setLocal]=useState<DataSource|null>(null);
 const [session,setSession]=useState<Session|null|undefined>(undefined);
 const [cloud,setCloud]=useState<DataSource|null>(null);
 const [err,setErr]=useState("");
 const [attempt,setAttempt]=useState(0);

 useEffect(()=>{if(useLocal&&!local)setLocal(createLocalSource(safeStorage()))},[useLocal,local]);

 useEffect(()=>{
  if(useLocal||!client)return;
  let alive=true;
  const toSession=(s:any):Session|null=>s?{id:s.user.id,email:s.user.email||""}:null;
  client.auth.getSession().then(({data})=>{if(alive)setSession(toSession(data.session))}).catch(e=>{if(alive){setErr(e instanceof Error?e.message:"Gagal memeriksa sesi.");setSession(null)}});
  const {data:sub}=client.auth.onAuthStateChange((_e,s)=>{if(alive)setSession(toSession(s))});
  return()=>{alive=false;sub.subscription.unsubscribe()};
 },[client,useLocal]);

 useEffect(()=>{
  setCloud(null);setErr("");
  if(useLocal||!client||!session)return;
  let alive=true;
  ensureBusiness(client as unknown as SupabaseLike,session.id).then(id=>{if(alive)setCloud(createCloudSource(client as unknown as SupabaseLike,id))}).catch(e=>{if(alive)setErr(e instanceof Error?e.message:"Gagal menyiapkan bisnis.")});
  return()=>{alive=false};
 },[client,session?.id,useLocal,attempt]);

 if(useLocal)return local?<>{children({source:local,onSignOut:cloudConfigured?()=>{setLocal(null);setUseLocal(false)}:undefined})}</>:<Boot text="Memuat…"/>;
 if(session===undefined)return <Boot text="Memeriksa sesi…"/>;
 if(session===null)return <LoginForm client={client as any} initialError={err} onLocal={()=>setUseLocal(true)}/>;
 if(err)return <div className="boot"><div className="card"><div className="card-title">Bisnis tidak bisa disiapkan</div><p className="muted" style={{fontSize:13,lineHeight:1.7}}>{err}</p><div className="actions"><button className="btn" onClick={()=>setAttempt(a=>a+1)}>Coba lagi</button><button className="btn secondary" onClick={()=>client?.auth.signOut()}>Keluar</button></div></div></div>;
 if(!cloud)return <Boot text="Menyiapkan bisnis…"/>;
 return <>{children({source:cloud,user:{email:session.email},onSignOut:()=>{client?.auth.signOut()}})}</>;
}

function Boot({text}:{text:string}){return <div className="boot" role="status" aria-live="polite"><div className="muted">{text}</div></div>}

function LoginForm({client,initialError,onLocal}:{client:any;initialError:string;onLocal:()=>void}){
 const [mode,setMode]=useState<"login"|"register">("login");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [msg,setMsg]=useState(initialError);
 const [info,setInfo]=useState("");
 const [busy,setBusy]=useState(false);
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setMsg("");setInfo("");
  if(!/^\S+@\S+\.\S+$/.test(email.trim())){setMsg("Masukkan email yang valid.");return}
  if(password.length<8){setMsg("Kata sandi minimal 8 karakter.");return}
  setBusy(true);
  try{
   if(mode==="login"){const {error}=await client.auth.signInWithPassword({email:email.trim(),password});if(error)setMsg(authMsg(error.message))}
   else{const {data,error}=await client.auth.signUp({email:email.trim(),password});if(error)setMsg(authMsg(error.message));else if(!data.session)setInfo("Pendaftaran berhasil. Cek email Anda untuk konfirmasi, lalu masuk.")}
  }catch(x){setMsg(x instanceof Error?x.message:"Terjadi kesalahan jaringan.")}
  finally{setBusy(false)}
 };
 return <div className="boot"><form className="card auth-card" onSubmit={submit} noValidate>
  <div className="brand" style={{padding:0,marginBottom:6}}><div className="brandmark">S</div><div>stokcerdas<small>RETAIL BUSINESS INTELLIGENCE</small></div></div>
  <div className="card-title" style={{fontSize:18,marginTop:14}}>{mode==="login"?"Masuk ke toko Anda":"Buat akun toko"}</div>
  <div className="card-desc">Data stok dan penjualan tersimpan per akun dan tidak bisa dilihat akun lain.</div>
  <div className="form-grid" style={{gridTemplateColumns:"1fr",marginTop:16}}>
   <div className="field"><label htmlFor="auth-email">Email</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
   <div className="field"><label htmlFor="auth-pass">Kata sandi</label><input id="auth-pass" type="password" autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)}/></div>
  </div>
  {msg&&<div role="alert" className="field-warn" style={{marginTop:10,fontSize:12}}>{msg}</div>}
  {info&&<div role="status" className="accent-text" style={{marginTop:10,fontSize:12}}>{info}</div>}
  <div className="actions"><button className="btn" type="submit" disabled={busy}>{busy?"Memproses…":mode==="login"?"Masuk":"Daftar"}</button><button className="btn secondary" type="button" onClick={()=>{setMode(mode==="login"?"register":"login");setMsg("");setInfo("")}}>{mode==="login"?"Belum punya akun?":"Sudah punya akun?"}</button></div>
  <div className="muted" style={{fontSize:11,marginTop:16,lineHeight:1.6}}>Hanya ingin mencoba? <button type="button" className="linklike" onClick={onLocal}>Pakai mode demo lokal</button> (data hanya di browser ini).</div>
 </form></div>;
}
