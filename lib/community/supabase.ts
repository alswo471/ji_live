import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCommunityPublicConfig, getCommunityServerConfig } from './config';

let browserClient: SupabaseClient | undefined;

export function getBrowserSupabase() {
  const config = getCommunityPublicConfig();
  browserClient ??= createClient(config.supabaseUrl, config.supabasePublishableKey);
  return browserClient;
}

export function getServerSupabase() {
  const config = getCommunityServerConfig();
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
