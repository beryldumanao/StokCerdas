import {createBrowserClient} from "@supabase/ssr";

/**
 * Klien Supabase untuk browser. Hanya memakai URL dan ANON key (aman di browser karena dibatasi RLS).
 * JANGAN PERNAH menaruh service-role key di sini atau di variabel NEXT_PUBLIC_*.
 * Jika variabel lingkungan belum diisi, aplikasi otomatis berjalan di mode lokal.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const cloudConfigured = Boolean(url && anon);

let client: ReturnType<typeof createBrowserClient> | null = null;
export function getSupabase() {
  if (!cloudConfigured) return null;
  client ??= createBrowserClient(url as string, anon as string);
  return client;
}
