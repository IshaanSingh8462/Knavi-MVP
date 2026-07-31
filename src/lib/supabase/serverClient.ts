import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseServerConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function getScopedClient(accessToken: string): SupabaseClient {
  if (!isSupabaseServerConfigured) {
    throw new Error('Supabase is not configured on the server. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getRequestUser(
  authHeader: string | undefined
): Promise<{ user: User; client: SupabaseClient } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  if (!token) return null;

  const client = getScopedClient(token);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  return { user: data.user, client };
}
