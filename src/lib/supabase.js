/*
 * Cliente único do Supabase para todo o app.
 * As credenciais vêm do .env (prefixo VITE_ para o Vite expor ao navegador).
 * A chave "publishable" é pública por natureza: quem protege os dados é o RLS
 * e as RPCs `security definer` do banco (ver supabase/schema.sql).
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Permite que o build da demo continue funcionando sem .env (ex.: GitHub Pages).
export const isSupabaseConfigured = Boolean(url && key)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ausentes — usando apenas a demo em memória.')
}

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true, // PWA: mantém o aluno logado entre aberturas
        autoRefreshToken: true,
        detectSessionInUrl: true, // magic link / OAuth
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null

/** Lança um erro claro se alguém tentar usar a API sem configurar o .env. */
export function requireSupabase() {
  if (!supabase) throw new Error('SUPABASE_NAO_CONFIGURADO')
  return supabase
}
