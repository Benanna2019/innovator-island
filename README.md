# Innovator Island on Convex

A port of AWS's [serverless workshop "Innovator Island"](https://github.com/aws-samples/aws-serverless-workshop-innovator-island) (archived, MIT-0) to TanStack Start, Convex and a Cloudflare Worker. Read it next to the original: [PLAN.md](./PLAN.md) has the design and what we dropped, [MODULES.md](./MODULES.md) compares each module, [FRICTION.md](./FRICTION.md) lists the Convex rough edges we hit, and [original/NOTES.md](./original/NOTES.md) has the upstream links.

Status: phase 1 is built (modules 1 to 8 of the plan), plus logins, an operator console and a lot of simulated demo data. This repo has no deployment of its own. Phase 2, an agent-run park simulation, is not started.

## What it does

- `/` shows a live park map and ride list with wait times, plus an outage banner.
- `/photos` takes a green-screen selfie and turns it into a branded ride photo, shown in a live gallery. You must be signed in.
- `/stats` shows park headcount, rides per hour, average rating, guests in the park over 24 hours and guests by language.
- `/sign-in` signs in with email and password. On a demo deployment it also has a "Sign in as demo guest" button. The demo admin signs in with its email and password only.
- `/admin` is the operator console (admins only): pause the simulation, trigger or clear a ride outage, edit a ride's longest wait and closure chance, and reset the demo data.
- About 300 simulated guests with names, home languages and avatars walk, queue, ride and eat. The map shows "N in line" on each ride and a few guests walking. Each ride page lists who is in line and who rode lately.
- A language picker switches between English, French, Spanish and Japanese.

## AWS → Convex / Cloudflare

| AWS (original) | Here |
| --- | --- |
| Amplify Console + CloudFront hosting a Vue SPA | TanStack Start on a Cloudflare Worker (SSR + static assets) |
| API Gateway + Lambda (`getInitState`) | Convex query `rides.list` (reactive) |
| DynamoDB single table | Typed Convex tables such as `parks`, `rides`, `rideStates`, `parkEvents`, `visitors`, `guests`, `photos`, `outages` and `users` |
| EventBridge `rate(1 minute)` + ride-controller Lambda | `convex/crons.ts` calls `park.tick`, which runs the pure `RideController.step` |
| SNS / EventBridge fan-out | `EventBus` class over the `parkEvents` log, with scheduled subscribers |
| IoT Core MQTT + Cognito identity pool | Convex reactive `useQuery`, and Convex Auth (password) for sign-in |
| S3 presigned upload | Convex file storage `generateUploadUrl`, login required, rate limited per user and globally |
| S3-triggered Lambda chain (OpenCV chroma key → Jimp composite → post-process) | `@convex-dev/workflow`: `chromaKey` → `composite` → `finalize` Node actions (pure JS) |
| CloudWatch metrics, Kinesis Firehose → Athena → QuickSight | `@convex-dev/aggregate` plus a `/stats` page |
| AWS Translate script | Committed i18n JSON with a typed `t()` |
| CloudFormation / SAM / Cloud9 | `npx convex dev` and `wrangler` |

## Run it

You need Node 22 or newer and pnpm.

```sh
cd app
pnpm install
npx convex dev --once --configure new --project innovator-island --dev-deployment cloud   # first time only
node scripts/setup-auth-keys.mjs   # first time only: the keys Convex Auth signs sessions with, set without printing them
npx convex env set SITE_URL http://localhost:3002
npx convex dev --once              # pushes the functions
npx convex run seed:run            # creates the park and 16 rides, safe to repeat
pnpm dev                           # Convex watcher and the Vite dev server on http://localhost:3002
```

`convex dev` writes `app/.env.local` with the dev deployment URL. It is gitignored, and [`app/.env.example`](./app/.env.example) lists the variable names. Everything runs against a Convex dev deployment, never production.

### Auth setup for your own deployment

Sign-in uses [Convex Auth](https://labs.convex.dev/auth) with the Password provider. Each Convex deployment needs its own keys and a few env vars. Run these in `app/`, with the deployment you want selected (`.env.local`, or pass `--deployment-name <name>` / `--prod` to each command and to the script):

1. `node scripts/setup-auth-keys.mjs` generates an RSA key pair and sets `JWT_PRIVATE_KEY` and `JWKS` on the deployment. It never prints or saves them. Run it once per deployment. Running it again rotates the key and signs everyone out.
2. `npx convex env set SITE_URL <the public URL of the web app>` (for example `http://localhost:3002`, or the deployed Worker URL). `CONVEX_SITE_URL` is a Convex system variable and `convex/auth.config.ts` already reads it.
3. `npx convex dev --once` (or your deploy step) to push the functions.

Env vars the backend reads:

| Variable | Needed for | Notes |
| --- | --- | --- |
| `JWT_PRIVATE_KEY`, `JWKS` | all sign-in | Set by `scripts/setup-auth-keys.mjs` |
| `SITE_URL` | all sign-in | The web app's public URL |
| `DEMO_MODE` | demo deployments | `true` turns on the demo buttons, `demo:ensureAccounts`, `seed:demo` and the admin "reset demo data". Anything else is off. It also closes password sign-up (see below) |
| `DEMO_ADMIN_PASSWORD`, `DEMO_GUEST_PASSWORD` | `demo:ensureAccounts` | Passwords for the demo accounts. Never committed or printed |

Roles: every user is `guest` unless their `role` is `admin`. Sign-up makes guests. The only admin is the demo admin below, or a user you promote by editing the `users` table in the Convex dashboard (set `role` to `admin`).

### A demo deployment

A demo deployment has a password-free "Sign in as demo guest" button, a seeded park and sample data. Turn it on like this, without echoing the passwords:

```sh
npx convex env set DEMO_MODE true
npx convex env set DEMO_ADMIN_PASSWORD -- "$(openssl rand -base64 18)"
npx convex env set DEMO_GUEST_PASSWORD -- "$(openssl rand -base64 18)"
npx convex run demo:ensureAccounts   # creates or updates the four demo accounts
npx convex run seed:demo             # 300 guests, 3 days of history, past outages, sample photos. Safe to repeat
```

Demo accounts (all `@innovator-island.demo`):

| Account | Role |
| --- | --- |
| `demo-admin@` | admin |
| `demo-guest1@`, `demo-guest2@`, `demo-guest3@` | guest, each with four placeholder ticket-stub photos |

How demo sign-in stays safe: the `demo` provider only works while `DEMO_MODE` is `true`, and the browser sends only a `who` name from a fixed list (`guest-1`, `guest-2`, `guest-3`). The admin is not on that list, so the passwordless sign-in can never reach it: the demo admin signs in on the form with `demo-admin@innovator-island.demo` and the password held in `DEMO_ADMIN_PASSWORD`, which the deployment owner keeps private. The server maps `who` to a seeded email, so a client can never ask for another user or an arbitrary email. `demo:ensureAccounts` refuses unless demo mode is on and both password variables are set (at least 8 characters). While demo mode is on, password sign-up is closed so strangers cannot mint accounts. The seeded accounts sign in with email and password.

`seed:demo` refuses unless `DEMO_MODE` is `true`. Running it again adds nothing: guests are found by a stable slug, the history is guarded by `parks.demoSeededAt`, and photos are topped up to four per demo guest. It runs the work in batches (40 guests, 3 hours of history per mutation) to stay under Convex limits. The admin console's "reset demo data" (or `npx convex run seed:reset`) wipes guests, events, visitors and outages and seeds them again. It does not delete user-uploaded photos or the demo guests' sample photos. A reset pauses the simulation while it runs and puts the switch back afterwards, only one can run at a time, and they are limited to one every five minutes. A daily cron (`seed:topUpHistory`) adds the missing hours of history when the last seed is over a day old, and the daily prune removes exited visitor rows together with their arrival events, so the history does not decay and `visitors` stays in step with the stats.

### Turning demo mode off

For real use set `DEMO_MODE` to `false` (or remove it): `npx convex env set DEMO_MODE false`. The demo buttons disappear, the demo provider refuses, and sign-up opens. The demo accounts still exist as ordinary password accounts, so delete them (and their passwords) from the dashboard if the deployment is not a demo.

Checks, all run in `app/`:

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Other scripts:

| Command | What it does |
| --- | --- |
| `pnpm assets` | Regenerates our background, frame and the green-screen test fixture |
| `node scripts/setup-auth-keys.mjs` | Sets `JWT_PRIVATE_KEY` and `JWKS` on the current Convex deployment, without printing them |
| `npx convex run park:setSimulation '{"enabled": false}'` | Pauses the ride tick and the simulators. Use `true` to resume (admins can do this on `/admin`) |
| `npx convex run simulate:visitorsTick` | Runs one simulator step by hand |

The crons are cheap on purpose: the ride tick runs every minute and the simulator every three minutes. Each simulator run writes at most 60 named-guest rows (`MAX_GUEST_UPDATES` in `convex/simulate.ts`), at most 300 anonymous visitors are in the park, and ride waits drift up when more guests are in line. Pause them when you are not looking at the app.

### Deploy your own copy

There is no deploy script on purpose, and nothing in this repo points at anyone's deployment. To try it on your own accounts:

1. Create your Convex deployment and do the auth setup above on it (`--prod` if you use production). Leave `DEMO_MODE` off unless it is a throwaway demo.
2. Run `npx convex deploy`.
3. Build with `VITE_CONVEX_URL=<your convex url> pnpm build`, and check `dist/server/.dev.vars` does not hold your `.env.local`.
4. Run `npx wrangler deploy` with your own Cloudflare login, then set `SITE_URL` to the Worker URL.

Read the security notes below first.

## What changed per module

Each section says what the AWS original did, what we do, and why.

### 1. App hosting and the init API

AWS: Amplify Console and CloudFront host a Vue SPA. An API Gateway route calls the `getInitState` Lambda, which reads DynamoDB.
Ours: a TanStack Start app that will run as a Cloudflare Worker, and a Convex query `rides.list`.
Why: a query is reactive, so the REST layer and the polling disappear. The Vue frontend was never in the upstream repo, so the React UI is written from scratch.

### 2. Ride controller

AWS: EventBridge fires `rate(1 minute)` and the FATcontroller Lambda moves each ride's wait toward a random target and sometimes closes it.
Ours: `convex/crons.ts` calls `internal.park.tick`, which runs the pure function `RideController.step` (in `src/domain/ride-controller.ts`) for every ride. Unit tests pin it with a seeded RNG.
Why: the cron is built in, and a pure step function is easy to test and to swap for an agent policy in phase 2.

### 3. Realtime

AWS: SNS, a Lambda, IoT Core MQTT over websockets, and a Cognito identity pool so browsers can connect.
Ours: `useQuery` on `rides.list`, `outages.active` and `photos.mine`.
Why: Convex queries push updates, so there are no topics, credentials or client libraries to manage. Browsers are anonymous until they sign in, and only uploading photos needs an account. Convex Auth replaces the Cognito identity pool.

### 4. Event bus and outages

AWS: EventBridge rules fan ride events out to `publish`, `metrics` and `outages` Lambdas. The outages Lambda cached recent alerts in a warm container for 180 seconds.
Ours: an `EventBus` class (`convex/lib/eventBus.ts`) over the `parkEvents` table. `publish` inserts a typed event and schedules its subscribers. Subscribers live in `convex/subscribers.ts`. The outage handler checks the `outages` row instead of an in-memory cache.
Why: the log is durable and transactional, and a repeat delivery is harmless because handlers record which events they have handled. Upstream's warm cache was lost whenever a container was recycled, and it matched on `hasOwnProperty("rideId")` instead of the real id.

### 5. Photos

AWS: the browser PUTs a selfie to S3 through a presigned URL from the `getUploadURL` Lambda. An S3 trigger runs an OpenCV Lambda (chroma key), whose output triggers a Jimp Lambda (composite with a background and frame), whose output triggers a post-process Lambda that writes DynamoDB and notifies the browser over IoT.
Ours:

- `photos.generateUploadUrl` returns a Convex storage upload URL. It needs a login, and it is rate limited per user and across all users with `@convex-dev/rate-limiter`.
- `photos.submit` validates what was really stored (type and size), then starts the `processPhoto` workflow from `@convex-dev/workflow`.
- The workflow runs three Node actions, `chromaKey`, `composite` and `finalize` (`convex/photoSteps.ts`), each wrapping a pure-JS step in `src/domain/image/pipeline.ts` written with Effect. Failures are tagged errors: `UploadTooLarge`, `NotAnImage` and `ChromaKeyFailed`.
- The chroma key is plain TypeScript over RGBA pixels with the upstream default HSV range (36,50,50) to (70,255,255), on OpenCV's scale. It fails with `ChromaKeyFailed` when under 2 percent of the photo is green.
- Our background and frame are generated PNGs (`scripts/make-assets.ts`) embedded as base64, so the Node action needs no file or network access. We do not hotlink the AWS CloudFront assets.

Why: the workflow is the main lesson. The AWS chain is implicit, because each step is a bucket trigger that you find by reading IAM and S3 notification config. Here the order is code you can read, each step is retryable, and the workflow history shows where a photo stopped. There is no native OpenCV binary on Convex, and a threshold over pixels is all `inRange` was doing.

The form has a labelled file input (`accept="image/*"`, `capture="user"`), checks the file on the client and again on the server, moves focus to the input when something is wrong, and announces errors and progress through `aria-live` regions.

### 6. Translations

AWS: a script calls AWS Translate once and writes `translations.json`.
Ours: committed JSON for English, French, Spanish and Japanese in `src/i18n/`, and a typed `t()`. A missing key in any language is a type error, and a test checks that placeholders match across languages. The language is a cookie, read on the server so the first paint is already translated, and `<html lang>` follows it.
Why: the same build-time step without an AWS dependency. The French, Spanish and Japanese text was written by hand and has not been reviewed by a native speaker. Ride names and outage reasons come from the database and stay in English.

### 7. Park stats

AWS: a Lambda simulates up to 30,000 visitors a day into Kinesis Firehose, S3, Athena and a QuickSight dashboard.
Ours: `simulate.visitorsTick` keeps at most 300 visitors in the park and writes `VisitorEntered`, `VisitorRode` (with a 1 to 5 rating) and `VisitorExited` events. `@convex-dev/aggregate` counts them by type and time, so headcount, rides per hour and average rating are range queries. `/stats` reads them live.
Why: the lesson is the same, event log in, numbers out, at a size that fits a free tier. The decisions (who arrives, who rides what, how they rate it) are pure functions in `src/domain/simulator.ts`. `parks.simulationEnabled` pauses everything.

## Things worth knowing

- The three image steps store intermediate blobs and the original selfie. `photos.onWorkflowComplete` deletes them when the workflow ends, whether it succeeded or failed.
- Uploads need a login. Photos belong to the signed-in user (`photos.userId`), and `photos.mine` returns only that user's gallery. The old guest-id cookie is gone.
- A rejected upload is returned as a result from `photos.submit`, not thrown. A throw would roll back the delete of the bad file.
- The Convex friction we hit is in [FRICTION.md](./FRICTION.md).

## Security notes

- **Uploads need a login.** `generateUploadUrl` and `submit` check the signed-in user on the server. Upload URLs are throttled per user (a burst of 3, then 2 a minute) across all users (20 a minute and 300 a day), and by pending photos (at most 3 not yet finished per user), so a pile of new accounts still cannot flood storage. The demo guest accounts are shared, so one visitor can use up a guest's bucket for the others. `submit` also refuses a storage id that already belongs to another photo. Type, size, magic-byte and pixel checks are unchanged, and the daily sweeper still deletes unreferenced blobs.
- **Roles are checked on the server.** Every admin function (`convex/admin.ts`) starts with `requireAdmin`, which reads the user's role from the database. The `/admin` page only decides what to show. Everything else in the backend is internal.
- **Demo mode must be off for real use.** With `DEMO_MODE=true` anyone can sign in as a demo guest, and anyone who knows the demo admin password is an admin who can edit rides, pause the simulation or wipe the demo data. Admin writes are throttled for everyone together (30 a minute, and one reset every five minutes) as defence in depth. Use demo mode only on a throwaway deployment, and never share one deployment between a demo and real data.
- **No email verification.** Password sign-up does not confirm the email address, so when `DEMO_MODE` is off anyone can register with someone else's address. That is fine for a demo and not for real users: add verification (Convex Auth supports an email provider) before opening sign-up to the public.
- **Secrets stay out of the repo and the terminal.** `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` and the demo passwords live in Convex env vars. `scripts/setup-auth-keys.mjs` and the commands above never print them.
- **Named guests are fake people.** Their names, languages and avatars are public on purpose. Real users' emails and names are never returned by a public query (`viewer.me` returns only the caller's own).
- **Legacy photo rows.** `photos.guestId` and an optional `photos.userId` stay in the schema so a deployment that already held guest-cookie photos still validates. Those rows are not shown to anyone.

## License and credits

- **Code:** MIT. See [LICENSE](./LICENSE).
- **Upstream:** ported from aws-samples/aws-serverless-workshop-innovator-island, MIT-0, © Amazon.com, Inc. or its affiliates.
- **Assets:** the park map is the original workshop map, and the 16 ride icons were AI-generated for this project. Details are in [app/public/park/SOURCES.md](./app/public/park/SOURCES.md).
- **Demo data:** the simulated guests are made up.
- **Trademarks:** AWS names and branding are trademarks of Amazon and are not used.
