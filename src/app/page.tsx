"use client";
import AuthGate from "@/components/AuthGate";
import Dashboard from "@/components/Dashboard";

/** Halaman tunggal: AuthGate memilih sumber data (lokal atau Supabase), Dashboard menampilkannya. */
export default function Page(){
  return <AuthGate>{ctx=><Dashboard {...ctx}/>}</AuthGate>;
}
