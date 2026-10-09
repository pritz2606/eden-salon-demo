# Eden Salon demo

A separate full stack portfolio sample by Pritam Badagi, inspired by Eden Salon in Margao. The application is an independent concept, not Eden's official website. No sample booking reaches the real salon.

## Live demo

- [Open Eden Salon demo](https://eden-salon-demo.vercel.app)
- [Administrator sign-in](https://eden-salon-demo.vercel.app/admin)
- [Source on GitHub](https://github.com/pritz2606/eden-salon-demo)

The frontend and API are separate Vercel projects, backed by Cloud Firestore. The API uses a dedicated Google service identity through restricted Workload Identity Federation. Production administrator credentials are configured privately; emulator login defaults do not apply to the hosted site. See [DEPLOYMENT.md](DEPLOYMENT.md) for configuration and redeployment details.

## Features

- Six routes: Home, Services, About, Book, Manage, and Admin.
- Editorial salon photography, an animated CSS 3D botanical sculpture, responsive layouts, and reduced-motion support.
- Service and stylist selection, India-time availability, customer details, confirmation, and private booking management.
- Cancellation releases reserved time atomically.
- A protected day calendar with staff columns, status filters, appointment detail, cancellation, completion, and booked-value totals. Firestore changes update the calendar, list, totals, and open appointment details live.

## Run

Requirements: Node.js 22+ and Java 21+. Run these commands from this directory:

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:3100. The runner starts the official Google Firestore emulator, the NestJS API, and Next.js. First launch downloads Google's checksum-verified Firestore emulator (approximately 137 MB). No Firebase account, service-account file, or cloud billing is needed for this local demo.

The emulator takes periodic snapshots in ignored `.emulator-data/` and restores the latest one on the next start. Use Ctrl+C to stop the runner and save a final snapshot. An abrupt computer shutdown may lose changes since the last snapshot.

Admin demo: http://127.0.0.1:3100/admin. Use the page's demo login button, or email `owner@eden.demo` and password `EdenDemo2026!`. These defaults work only in emulator mode. All customers, stylists, services, prices, hours, and policies are example data. The administrator's booked-value metric is not a payment report.

## Architecture

- `web/`: Next.js App Router frontend with a same-origin API bridge. It never receives Firestore credentials.
- `api/`: NestJS, Firebase Admin, strict DTO validation, signed HttpOnly admin cookies, revocable database-backed sessions, request limits, and origin checks.
- `scripts/`: Local emulator lifecycle, verified artifact download, periodic persistence, and a combined development runner.
- `RESEARCH.md`: Verified public salon sources and the limits of the review.

Firestore is the actual database in both modes. Local development uses its official emulator; the application has no browser-storage or JSON database substitute. Session storage holds only the current guest's private management code for convenience.

Each appointment locks every occupied 15-minute increment for one stylist, including a 15-minute turnaround. Firestore transactions acquire all locks together, prevent overlapping bookings with different durations, and release owned locks on cancellation. Idempotency prevents retries creating duplicate appointments. Prices and durations are read from the database on the server.

Guest management requires the booking reference and a private bearer access code. Only the code hash is stored; management links put the code in the URL fragment. Do not post private management links or real customer information in a LinkedIn demo.

The admin page uses an authenticated server-sent event stream for the selected date. NestJS listens to Firestore and sends the same safe booking fields as the regular admin endpoint through the Next.js bridge. The browser reconnects after a connection failure and receives a fresh day snapshot; the manual Refresh button is still available. Signing out or session expiry closes the stream and removes protected appointment data from the page. Firebase credentials stay on the server and direct browser database access remains denied.

## Checks and production build

With the local database and API running:

```powershell
npm run check:booking
npm run build
```

The integration check verifies actual concurrent requests, overlapping durations and buffers, cancellation and rebooking, retry identity, invalid input, private guest access, administrator access, cookie protection, logout revocation, and status transitions. It cleans up its own sample reservations.

## Connect a real Firestore project

The source supports `FIREBASE_MODE=cloud`. See `.env.example`. Configure a real Firebase project, server authorization through Application Default Credentials (ADC), an administrator identity, unique secrets, and the HTTPS frontend origin. Demo seeding and default credentials are disabled in cloud mode. Deploy the supplied `firestore.rules` to the real Firebase project to deny direct browser access; the local emulator applies them automatically, but this project does not deploy cloud rules for you. NestJS uses the Admin SDK. Populate the salon catalogue deliberately before accepting any live bookings.

For keyless authorization on your workstation, install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install), then run:

```powershell
gcloud auth application-default login
```

Complete the Google sign-in with an account that has Firestore access to your selected project. Set `FIREBASE_PROJECT_ID` explicitly, and leave `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_SERVICE_ACCOUNT_JSON` unset to use this local ADC identity. No downloaded service-account key is needed. Signing in to the Firebase website in your browser alone does not authorize the NestJS process; Google documents the separate [local ADC setup](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment). Firestore server access uses [IAM permissions](https://cloud.google.com/firestore/native/docs/security/iam), such as the data read/write role `roles/datastore.user`.

If Google reports a missing quota project, use `gcloud auth application-default set-quota-project YOUR_PROJECT_ID` with a project for which your account has the required quota permission; see [ADC troubleshooting](https://cloud.google.com/docs/authentication/troubleshoot-adc). Standard Google CLI sign-in stores ADC in your user profile. This project's bundled sign-in helper instead stores its OAuth credentials in the ignored local `.runtime/google-cloud-auth/` directory. The private, ignored `.env.cloud` must select that same identity using its absolute ADC file path in `GOOGLE_APPLICATION_CREDENTIALS`, or by setting `CLOUDSDK_CONFIG` to the custom directory. These are user OAuth credentials, not a downloaded service-account key; keep this directory and `.env.cloud` out of Git and the frontend. The API's startup read fails if authorization is unavailable. Unique passwords and strong secrets remain required.

To preview a real Firestore project locally, explicitly set `EDEN_LOCAL_PREVIEW=true` alongside `FIREBASE_MODE=cloud`, unset `FIRESTORE_EMULATOR_HOST`, and set `WEB_ORIGIN=http://127.0.0.1:3100,http://localhost:3100`. Every configured origin must be an exact HTTP origin using the literal hostname `localhost` or `127.0.0.1` and a valid port; network hosts, aliases, paths, queries, and fragments are rejected. The NestJS API stays bound to `127.0.0.1`. This exception disables the admin cookie's `Secure` flag for the loopback HTTP preview while retaining HttpOnly, SameSite=Strict, origin checks, and session revocation. Cloud seeding and emulator default credentials remain disabled. This is a real cloud database connection, so reservations change the selected Firebase project.

For a deployed site, unset `EDEN_LOCAL_PREVIEW` and configure an HTTPS `WEB_ORIGIN`; cloud cookies then require HTTPS again. The preview flag does not change the emulator runner into a cloud runner.

The prepared `npm run dev:cloud` flow reads `.env.cloud`, compiles NestJS, verifies Cloud Firestore health, and starts the loopback Next.js preview without launching an emulator. Complete Google backend authorization and configure that private file before running it. The optional `npm run firebase:login` helper uses the official Google Cloud CLI installed under `.runtime/google-cloud-sdk/`; Firebase website sign-in alone remains insufficient.

For a new portfolio sample database, the separate `npm run seed:cloud` command creates the fictional catalogue, team, and six sample appointments only when `EDEN_SAMPLE_DATA=true` is explicitly set. It refuses an existing initialization marker or any existing documents in the salon catalogue, staff, booking, and slot-lock collections. It performs the guarded setup in one Firestore transaction and does not overwrite existing salon data. Run it once after authorization and before opening the preview:

```powershell
npm run build:api
$env:EDEN_SAMPLE_DATA = 'true'
npm run seed:cloud
Remove-Item Env:EDEN_SAMPLE_DATA
npm run dev:cloud
```

The normal cloud API startup never seeds sample data automatically. The seed command writes to the real project selected by `.env.cloud`, so use the dedicated sample project rather than an existing salon database.

Environment variables are passed by the process manager or hosting service. `npm run dev` is emulator-only: it loads a local `.env` file, starts the emulator, and supplies local database settings. Use `npm run dev:cloud` for the explicit local cloud preview. The Vercel setup uses separate projects rooted at `api/` and `web/`, each with its own package manifest and lockfile. Keep credentials out of Git and outside the public frontend.

See [DEPLOYMENT.md](DEPLOYMENT.md) for production configuration and keyless Google Workload Identity Federation. Provisioning a Firebase project and publishing the website are separate setup steps. The API binds to loopback locally; `API_HOST=0.0.0.0` is available for a host that requires a public binding. Public hosting requires explicit cloud mode, HTTPS frontend origins, and unique administrator credentials. Configure the backend's HTTPS address as `EDEN_API_ORIGIN` on the Next.js server.

For live admin updates in deployment, both the host and any reverse proxy must support long-lived streaming responses without buffering `/api/admin/bookings/live`. The bridge forwards chunks as they arrive and cancels its upstream connection when the browser disconnects. If a hosting platform imposes a response duration limit, the browser reconnects; it cannot display new changes while the connection is unavailable.

## Scope

This version implements reservations, cancellation, and the administrator calendar. Email/SMS delivery, payments, and real salon integration are not configured. Dates and cancellation policies are enforced by the backend; the demo uses India time, a 60-day booking window, a lunch break, and cancellation before appointment start.
