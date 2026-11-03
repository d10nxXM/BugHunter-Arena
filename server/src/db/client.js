import { createClient } from '@supabase/supabase-js';
import { config } from '../lib/config.js';

/**
 * Supabase client with the service key. Server only: the service key
 * bypasses RLS, so this module must never be imported by client code.
 */
export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
