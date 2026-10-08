import { existsSync } from 'node:fs';

const cloudMode = process.env.FIREBASE_MODE === 'cloud';
const localPreview = cloudMode && process.env.EDEN_LOCAL_PREVIEW === 'true';
const vercel = process.env.VERCEL === '1';
const host = process.env.API_HOST ?? '127.0.0.1';
const rawPort = process.env.PORT ?? process.env.API_PORT ?? '4100';
const port = Number(rawPort);
if (!['127.0.0.1', '0.0.0.0'].includes(host)) {
  throw new Error('API_HOST must be 127.0.0.1 for local use or 0.0.0.0 for public hosting.');
}
if (!/^[0-9]{1,5}$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT or API_PORT must be an integer between 1 and 65535.');
}
if ((host === '0.0.0.0' || vercel) && (!cloudMode || localPreview)) {
  throw new Error('Public hosting requires FIREBASE_MODE=cloud with EDEN_LOCAL_PREVIEW disabled.');
}
const emulatorHost = cloudMode ? undefined : (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085');
const rawWebOrigins = (process.env.WEB_ORIGIN || 'http://localhost:3100,http://127.0.0.1:3100')
  .split(',').map((value) => value.trim());
const parsedWebOrigins = rawWebOrigins.map((value) => new URL(value));

function exactLoopbackHttpOrigin(raw: string, parsed: URL): boolean {
  // Reject aliases, credentials, paths, queries, fragments, and normalized IP
  // spellings. Only the two literal loopback hostnames are permitted here.
  const match = /^http:\/\/(localhost|127\.0\.0\.1)(?::([0-9]{1,5}))?$/.exec(raw);
  const port = match?.[2] ? Number(match[2]) : 80;
  return Boolean(match) && parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname) &&
    Number.isInteger(port) && port >= 1 && port <= 65535;
}

if (cloudMode) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Cloud mode cannot also set FIRESTORE_EMULATOR_HOST. Remove the emulator variable.');
  }
  const required = ['FIREBASE_PROJECT_ID', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_JWT_SECRET', 'MANAGE_TOKEN_SECRET', 'WEB_ORIGIN'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Cloud mode requires an explicit ${key}.`);
  }
  if (process.env.FIREBASE_PROJECT_ID!.startsWith('demo-')) {
    throw new Error('Cloud mode requires a real Firebase project, not a demo project ID.');
  }
  // applicationDefault() can resolve keyless user ADC created by gcloud, or an
  // attached Google Cloud service identity. ADC startup reads and all actual
  // database operations fail closed without usable Firestore credentials.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    throw new Error('The GOOGLE_APPLICATION_CREDENTIALS file does not exist.');
  }
  if (process.env.ADMIN_PASSWORD!.length < 12 || process.env.ADMIN_PASSWORD === 'EdenDemo2026!') {
    throw new Error('Cloud mode requires a unique admin password of at least 12 characters.');
  }
  for (const key of ['ADMIN_JWT_SECRET', 'MANAGE_TOKEN_SECRET']) {
    if (process.env[key]!.length < 32 || process.env[key]!.includes('local-demo')) {
      throw new Error(`Cloud mode requires a unique ${key} of at least 32 characters.`);
    }
  }
  if (process.env.ADMIN_JWT_SECRET === process.env.MANAGE_TOKEN_SECRET) {
    throw new Error('ADMIN_JWT_SECRET and MANAGE_TOKEN_SECRET must be different.');
  }
  if (localPreview && !parsedWebOrigins.every((origin, index) => exactLoopbackHttpOrigin(rawWebOrigins[index], origin))) {
    throw new Error('EDEN_LOCAL_PREVIEW requires every WEB_ORIGIN to be an exact http://localhost or http://127.0.0.1 origin with a valid port.');
  }
  if (!localPreview && !parsedWebOrigins.every((origin) =>
    origin.protocol === 'https:' && !origin.username && !origin.password &&
    origin.pathname === '/' && !origin.search && !origin.hash && !origin.hostname.includes('*'))) {
    throw new Error('Cloud mode requires explicit HTTPS WEB_ORIGIN values without credentials, paths, queries, fragments, or wildcards.');
  }
} else {
  if (!/^(127\.0\.0\.1|localhost):\d{2,5}$/.test(emulatorHost!)) {
    throw new Error('The demo Firestore emulator must run on localhost.');
  }
  process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
}

const webOrigins = parsedWebOrigins.map((value) => value.origin);

export const config = Object.freeze({
  demo: !cloudMode,
  localPreview,
  vercel,
  host,
  projectId: process.env.FIREBASE_PROJECT_ID || 'demo-eden-salon',
  emulatorHost,
  port,
  webOrigins,
  adminEmail: (process.env.ADMIN_EMAIL || 'owner@eden.demo').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'EdenDemo2026!',
  jwtSecret: process.env.ADMIN_JWT_SECRET || 'local-demo-admin-jwt-secret-only-not-for-cloud',
  manageSecret: process.env.MANAGE_TOKEN_SECRET || 'local-demo-manage-token-secret-only-not-for-cloud',
  secureCookies: cloudMode && !localPreview,
  cookieName: 'eden_admin',
});
