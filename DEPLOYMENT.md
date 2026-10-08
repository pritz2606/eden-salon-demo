# Deploy Eden Salon demo

This guide describes the prepared deployment configuration. It does not establish that a deployment is live or that Google IAM trust has already been configured. The application remains an independent portfolio sample, with fictional services, staff, and appointments.

## Two Vercel projects

Import the same sanitized Git repository twice, preserving its `api/` and `web/` directories. Use Node.js 22 for both projects. Each directory has its own package manifest and lockfile; the combined root development package is not the deployment package.

| Vercel project | Root Directory | Framework | Dependency installation | Build |
| --- | --- | --- | --- | --- |
| Backend | `api` | NestJS | `npm ci` | The NestJS preset uses `api/vercel.json`; the source also provides `npm run build` |
| Frontend | `web` | Next.js | `npm ci` | `npm run build`, configured in `web/vercel.json` |

Choose stable production domains for both projects before setting origin variables. Configure the API's `WEB_ORIGIN` with the exact HTTPS frontend origin, and configure the frontend's `EDEN_API_ORIGIN` with the API's HTTPS origin without an `/api` suffix. Multiple explicitly approved frontend origins can be comma-separated; do not use wildcards or transient preview domains.

Vercel project roots and framework detection are described in [Vercel monorepo deployment](https://vercel.com/docs/monorepos) and [Vercel NestJS deployment](https://vercel.com/docs/frameworks/backend/nestjs).

## API production environment

Set these variables on the **backend Vercel project**, scoped to **Production**. Use your own resource identifiers and independently generated secrets; no credential values belong in this repository.

| Variable | Required value or purpose |
| --- | --- |
| `FIREBASE_MODE` | `cloud` |
| `FIREBASE_AUTH_MODE` | `vercel-oidc` |
| `FIREBASE_PROJECT_ID` | The dedicated real Google/Firebase project ID; no `demo-` prefix |
| `GCP_PROJECT_NUMBER` | Numeric Google project number used in the workload identity provider resource |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | Workload identity pool ID |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | OIDC provider ID in that pool |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Dedicated service account in `FIREBASE_PROJECT_ID` |
| `WEB_ORIGIN` | Exact public frontend HTTPS origin, for example `https://FRONTEND_DOMAIN` |
| `ADMIN_EMAIL` | The administrator email configured for this portfolio project |
| `ADMIN_PASSWORD` | Unique password, at least 12 characters; emulator defaults are rejected |
| `ADMIN_JWT_SECRET` | Unique random secret of at least 32 characters |
| `MANAGE_TOKEN_SECRET` | A different random secret of at least 32 characters |
| `API_HOST` | `0.0.0.0` for public hosting; local runners retain `127.0.0.1` |

Let the Vercel runtime provide its platform variables and port. Leave `EDEN_LOCAL_PREVIEW`, `FIRESTORE_EMULATOR_HOST`, `GOOGLE_APPLICATION_CREDENTIALS`, and `FIREBASE_SERVICE_ACCOUNT_JSON` unset. Workstation OAuth ADC files are for local development and must not be uploaded to Vercel. The API rejects mixed emulator/cloud configuration and mixed file/federation credentials.

The administrator still signs in with the protected application password session. Google federation authorizes the server's database access; it does not introduce customer or administrator Google sign-in.

## Keyless Google trust

Enable Firestore, Security Token Service, and IAM Service Account Credentials APIs in the dedicated Google project. Create a service account for this API and grant it `roles/datastore.user` on that project. Enable Vercel OIDC for the **backend** project; use its actual issuer mode and stable identifiers. This source exchanges the platform token for the Google provider's default audience, rather than storing a downloaded service-account key. See [Vercel's Google OIDC configuration](https://vercel.com/docs/oidc/gcp).

Create a dedicated Google workload identity pool and OIDC provider. Prefer the team issuer `https://oidc.vercel.com/VERCEL_OWNER_SLUG`, matching the backend project's issuer setting. Select **Default audience** and leave custom allowed audiences empty. The audience used by this implementation is:

```text
https://iam.googleapis.com/projects/GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID
```

Map the claims and restrict the provider to the exact backend production identity:

```text
google.subject = assertion.sub
attribute.owner_id = assertion.owner_id
attribute.project_id = assertion.project_id
attribute.environment = assertion.environment
```

```text
assertion.owner_id == 'VERCEL_OWNER_ID' &&
assertion.project_id == 'VERCEL_API_PROJECT_ID' &&
assertion.environment == 'production' &&
assertion.sub == 'owner:VERCEL_OWNER_SLUG:project:VERCEL_API_PROJECT_NAME:environment:production' &&
assertion.aud == 'https://iam.googleapis.com/projects/GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID'
```

Replace every placeholder with the actual value. Do not grant the frontend, all owner projects, previews, or a whole pool access. The issuer verifies the token source; the condition also pins the stable owner/project IDs and production subject. Claim definitions come from [Vercel's OIDC reference](https://vercel.com/docs/oidc/reference).

On the service account, grant `roles/iam.workloadIdentityUser` to this **exact subject principal**, with the Google project **number**, not project ID:

```text
principal://iam.googleapis.com/projects/GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/subject/owner:VERCEL_OWNER_SLUG:project:VERCEL_API_PROJECT_NAME:environment:production
```

This allows the trusted production workload to impersonate the account with short-lived credentials. A Vercel project or owner rename changes the subject and can change the issuer; deliberately update the trust policy before relying on the new identity. See [Google's federated service-account access](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers).

## Frontend production environment

On the **frontend Vercel project**, set only the server-side bridge variable:

```text
EDEN_API_ORIGIN=https://API_PRODUCTION_DOMAIN
```

Use the stable API production origin. The browser calls relative `/api` routes on the frontend; the Next.js server forwards requests and protected cookies to NestJS. Do not prefix this variable with `NEXT_PUBLIC_`, and do not place administrator secrets or Google credentials in frontend configuration.

If Vercel Deployment Protection guards the API, explicitly arrange permitted server access before opening the site; an interactive Vercel login page is not an API response. The application bridge currently does not configure a protection-bypass secret. Production access must still enforce the application's origin checks and administrator/guest authorization.

## Firestore and catalogue

Deploy the supplied `firestore.rules` to the selected Firebase project. They deny all direct browser database reads and writes. Backend Firestore access uses IAM through the federated service account; it does not depend on permissive browser rules.

Cloud startup does not automatically create sample records. Populate the dedicated sample catalogue deliberately. If the project is new and empty, the existing local `seed:cloud` command can perform the guarded fictional setup using locally authorized ADC and explicit `EDEN_SAMPLE_DATA=true`; follow the README. Do not transfer the local OAuth credential file to the hosted backend.

## Live admin connections

The API's Vercel mode renews live booking streams after **240 seconds**, before the configured **300-second** function duration limit. The Next.js stream bridge also exports `maxDuration = 300`. On a renewal or connection failure, the admin page checks its session, reconnects, and receives a fresh snapshot. Expired or revoked sessions close the stream and clear protected appointment data.

Streaming must remain unbuffered through the hosting path. Automatic reconnection has a brief gap; updates cannot be displayed while disconnected. The regular JSON bridge has a 60-second function limit and a 45-second upstream allowance for cold starts. Platform limits and Fluid Compute settings should match the checked-in configuration; see [Vercel function duration settings](https://vercel.com/docs/functions/configuring-functions/duration).

## Publish sequence

1. Create a sanitized repository containing source, package manifests, lockfiles, public assets, rules, and documentation. Review the actual file list before pushing; `.gitignore` does not remove files already tracked, and `.vercelignore` protects CLI uploads rather than Git history.
2. Create both Vercel projects with their correct root directories. Record their production domains and the backend OIDC owner/project identifiers.
3. Configure the dedicated Google service account, restricted federation provider, exact subject binding, and Firestore rules.
4. Add backend Production variables and publish the backend. Cloud database authorization is exercised during HTTP requests, when Vercel's token is available.
5. Set frontend `EDEN_API_ORIGIN`, ensure backend `WEB_ORIGIN` matches the frontend production domain, then publish the frontend.
6. Before announcing the site, verify its production catalogue, booking and private management flows, protected admin login, live connection, cancellation, and sign-out. A successful build alone does not confirm database access or a live deployment.

This guide adds no deployed resources and contains no production secrets. Continue using the root `npm run dev` for emulator mode or `npm run dev:cloud` for the explicitly configured local cloud preview.
