import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export function isMissingColumn(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || error?.code === 'PGRST200';
}