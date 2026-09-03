export type CommunityPublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  turnstileSiteKey: string;
};

export type CommunityServerConfig = {
  supabaseUrl: string;
  supabaseSecretKey: string;
  turnstileSecretKey: string;
  communityHmacSecret: string;
};

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(name);
  return value;
}

function getSupabaseUrl() {
  const value = getRequiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL');
  try {
    new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL');
  }
  return value;
}

export function getCommunityPublicConfig(): CommunityPublicConfig {
  return {
    supabaseUrl: getSupabaseUrl(),
    supabasePublishableKey: getRequiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    turnstileSiteKey: getRequiredEnvironmentVariable('NEXT_PUBLIC_TURNSTILE_SITE_KEY'),
  };
}

export function getCommunityServerConfig(): CommunityServerConfig {
  const supabaseSecretKey = getRequiredEnvironmentVariable('SUPABASE_SECRET_KEY');
  const turnstileSecretKey = getRequiredEnvironmentVariable('TURNSTILE_SECRET_KEY');
  const communityHmacSecret = getRequiredEnvironmentVariable('COMMUNITY_HMAC_SECRET');

  return {
    supabaseUrl: getSupabaseUrl(),
    supabaseSecretKey,
    turnstileSecretKey,
    communityHmacSecret,
  };
}

export function isCommunityEnabled() {
  return process.env.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true';
}
