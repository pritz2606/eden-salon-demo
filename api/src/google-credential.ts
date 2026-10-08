import { exchangeVercelOidcToken, getVercelOidcToken } from '@vercel/oidc';
import { IdentityPoolClient } from 'google-auth-library';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';
import { config } from './config';

const requestOidcToken = new AsyncLocalStorage<string>();

/**
 * Vercel's Nest adapter forwards requests to an internal HTTP server; async
 * context from the outer function does not cross that socket. Bind the forwarded
 * platform token to this request instead of saving it in process-wide state.
 * Google still verifies the exchanged token against the configured provider's
 * issuer, audience, production subject, and attribute condition.
 */
export function vercelOidcRequestContext(request: Request, _response: Response, next: NextFunction): void {
  if (process.env.FIREBASE_AUTH_MODE !== 'vercel-oidc') { next(); return; }
  const token = request.header('x-vercel-oidc-token');
  if (token && token.length <= 16384 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    requestOidcToken.run(token, next);
  } else next();
}

/**
 * Optional keyless Vercel -> Google Workload Identity Federation credentials.
 * Constructing the client never retrieves a token. Google invokes the supplier
 * during an authenticated request, when Vercel's request-scoped token exists.
 * The Google library caches/refreshes its short-lived access token; the Vercel
 * subject token itself is retrieved afresh for each exchange.
 */
export function vercelGoogleAuth(): IdentityPoolClient | undefined {
  const mode = process.env.FIREBASE_AUTH_MODE;
  if (!mode || mode === 'adc') return undefined;
  if (mode !== 'vercel-oidc') throw new Error('FIREBASE_AUTH_MODE must be adc or vercel-oidc.');
  if (config.demo) throw new Error('Vercel OIDC requires FIREBASE_MODE=cloud.');
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Vercel OIDC cannot be combined with a credential file or service-account JSON.');
  }

  const required = [
    'GCP_PROJECT_NUMBER', 'GCP_WORKLOAD_IDENTITY_POOL_ID',
    'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', 'GCP_SERVICE_ACCOUNT_EMAIL',
  ] as const;
  for (const name of required) {
    if (!process.env[name]) throw new Error(`Vercel OIDC requires ${name}.`);
  }
  const projectNumber = process.env.GCP_PROJECT_NUMBER!;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID!;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID!;
  const account = process.env.GCP_SERVICE_ACCOUNT_EMAIL!;
  if (!/^\d{6,30}$/.test(projectNumber)) throw new Error('GCP_PROJECT_NUMBER must be a numeric project number.');
  const resourceId = /^[a-z][a-z0-9-]{3,31}$/;
  if (!resourceId.test(poolId) || !resourceId.test(providerId) || poolId.startsWith('gcp-') || providerId.startsWith('gcp-')) {
    throw new Error('The workload identity pool and provider IDs must be valid Google resource IDs.');
  }
  const accountId = account.split('@')[0];
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(accountId) ||
      account !== `${accountId}@${config.projectId}.iam.gserviceaccount.com`) {
    throw new Error('GCP_SERVICE_ACCOUNT_EMAIL must name a service account in FIREBASE_PROJECT_ID.');
  }

  // Configure the provider with Google's default audience (no custom allowed
  // audiences). Vercel exchanges its token for this specific provider audience.
  const audience = `https://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  return new IdentityPoolClient({
    audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
    scopes: ['https://www.googleapis.com/auth/datastore'],
    subject_token_supplier: {
      getSubjectToken: () => {
        const token = requestOidcToken.getStore();
        return token ? exchangeVercelOidcToken({ token, audience }) : getVercelOidcToken({ audience });
      },
    },
  });
}
