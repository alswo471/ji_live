import { pathToFileURL } from 'node:url';

export const REQUIRED_RELEASE_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'NEXT_PUBLIC_RIGHTS_CONTACT_URL',
  'SUPABASE_SECRET_KEY',
  'TURNSTILE_SECRET_KEY',
  'COMMUNITY_HMAC_SECRET',
  'COMMUNITY_RETENTION_SECRET',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_ACCESS_TOKEN',
];

const REQUIRED_PROCESSING_FACTS = [
  'COMMUNITY_PROCESSOR_LEGAL_NAME',
  'COMMUNITY_PROCESSOR_COUNTRY',
  'COMMUNITY_PROCESSING_PURPOSE',
  'COMMUNITY_OVERSEAS_TRANSFER_METHOD',
  'COMMUNITY_PROCESSING_RETENTION',
  'COMMUNITY_RETENTION_SCHEDULE_CONFIRMED',
];

export function assertCommunityReleaseConfig(env) {
  for (const name of [...REQUIRED_RELEASE_ENV, ...REQUIRED_PROCESSING_FACTS]) {
    if (!env[name]?.trim())
      throw new Error(`Missing release configuration: ${name}`);
  }
  if (env.NEXT_PUBLIC_COMMUNITY_ENABLED !== 'true') {
    throw new Error(
      'Community release requires NEXT_PUBLIC_COMMUNITY_ENABLED=true',
    );
  }
  if (env.COMMUNITY_RETENTION_SCHEDULE_CONFIRMED !== 'true') {
    throw new Error('COMMUNITY_RETENTION_SCHEDULE_CONFIRMED must be true');
  }
  let contact;
  let supabase;
  try {
    contact = new URL(env.NEXT_PUBLIC_RIGHTS_CONTACT_URL);
    supabase = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    throw new Error('Invalid release URL configuration');
  }
  if (contact.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_RIGHTS_CONTACT_URL must use HTTPS');
  }
  if (supabase.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must use HTTPS');
  }
  if (env.COMMUNITY_RETENTION_SECRET.length < 32) {
    throw new Error(
      'COMMUNITY_RETENTION_SECRET must be at least 32 characters',
    );
  }
}

export async function verifyCommunityProjectRegion(env, request = fetch) {
  assertCommunityReleaseConfig(env);
  const response = await request(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(env.SUPABASE_PROJECT_REF)}`,
    { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } },
  );
  if (!response.ok) throw new Error('Unable to verify Supabase project region');
  const data = await response.json();
  if (data?.region !== 'ap-northeast-2') {
    throw new Error('Supabase project region must be ap-northeast-2');
  }
}

export async function verifyCommunityAdminConfigured(env, request = fetch) {
  assertCommunityReleaseConfig(env);
  const response = await request(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/community_admins?select=user_id&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    },
  );
  if (!response.ok)
    throw new Error('Unable to verify community admin configuration');
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('At least one community admin must be configured');
  }
}

async function main() {
  await verifyCommunityProjectRegion(process.env);
  await verifyCommunityAdminConfigured(process.env);
  process.stdout.write('Community release configuration verified.\n');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Release check failed'}\n`,
    );
    process.exitCode = 1;
  });
}
