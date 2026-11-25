# Module by module: AWS original vs. Convex

A port of AWS's [serverless workshop "Innovator Island"](https://github.com/aws-samples/aws-serverless-workshop-innovator-island) (archived, MIT-0) to TanStack Start, Convex and a Cloudflare Worker. Read it next to the original: [PLAN.md](./PLAN.md) has the full mapping table and what we dropped, and [original/NOTES.md](./original/NOTES.md) has the upstream links.

Status: phase 1 is built (modules 1 to 8 of the plan). Nothing is deployed. Phase 2, an agent-run park simulation, is not started.

## What it does

- `/` shows a live park map and ride list with wait times, plus an outage banner.
- `/photos` takes a green-screen selfie and turns it into a branded ride photo, shown in a live gallery.
- `/stats` shows park headcount, rides per hour and average rating from a visitor simulator.
- A language picker switches between English, French, Spanish and Japanese.

## Run it

You need Node 22 or newer and pnpm.

```sh
cd app
pnpm install
npx convex dev --once --configure new --project innovator-island --dev-deployment cloud   # first time only
npx convex run seed:run        # creates the park and 16 rides, safe to repeat
pnpm dev                       # Convex watcher and the Vite dev server on http://localhost:3002
```

`convex dev` writes `app/.env.local` with the dev deployment URL. It is gitignored. Everything runs against a Convex dev deployment, never production.

Checks, all run in `app/`:

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Other scripts:

| Command | What it does |
| --- | --- |
| `pnpm assets` | Regenerates our background, frame and the green-screen test fixture |
| `npx convex run park:setSimulation '{"enabled": false}'` | Pauses the ride tick and the visitor simulator. Use `true` to resume |
| `npx convex run simulate:visitorsTick` | Runs one simulator step by hand |

The crons are cheap on purpose: the ride tick runs every minute and the simulator every three minutes, with at most 300 visitors in the park. Pause them with the command above when you are not looking at the app.

There is no deploy script on purpose. See the README for deploying your own copy.

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
Why: Convex queries push updates, so there are no topics, credentials or client libraries to manage. Browsers are anonymous until they sign in, and only uploading photos needs an account. Convex Auth (password, plus a demo-only guest sign-in) replaces the Cognito identity pool, and `photos.mine` returns only the signed-in user's gallery.

### 4. Event bus and outages

AWS: EventBridge rules fan ride events out to `publish`, `metrics` and `outages` Lambdas. The outages Lambda cached recent alerts in a warm container for 180 seconds.
Ours: an `EventBus` class (`convex/lib/eventBus.ts`) over the `parkEvents` table. `publish` inserts a typed event and schedules its subscribers. Subscribers live in `convex/subscribers.ts`. The outage handler checks the `outages` row instead of an in-memory cache.
Why: the log is durable and transactional, and a repeat delivery is harmless because handlers record which events they have handled. Upstream's warm cache was lost whenever a container was recycled, and it matched on `hasOwnProperty("rideId")` instead of the real id.

### 5. Photos

AWS: the browser PUTs a selfie to S3 through a presigned URL from the `getUploadURL` Lambda. An S3 trigger runs an OpenCV Lambda (chroma key), whose output triggers a Jimp Lambda (composite with a background and frame), whose output triggers a post-process Lambda that writes DynamoDB and notifies the browser over IoT.
Ours:

- `photos.generateUploadUrl` returns a Convex storage upload URL, login required, rate limited per user and globally with `@convex-dev/rate-limiter`.
- `photos.submit` validates what was really stored (type and size), then starts the `processPhoto` workflow from `@convex-dev/workflow`.
- The workflow runs three Node actions, `chromaKey`, `composite` and `finalize` (`convex/photoSteps.ts`), each wrapping a pure-JS step in `src/domain/image/pipeline.ts` written with Effect. Failures are tagged errors: `UploadTooLarge`, `NotAnImage` and `ChromaKeyFailed`.
- The chroma key is plain TypeScript over RGBA pixels with the upstream default HSV range (36,50,50) to (70,255,255), on OpenCV's scale. It fails with `ChromaKeyFailed` when under 2 percent of the photo is green.
- Our background and frame are generated PNGs (`scripts/make-assets.ts`) embedded as base64, so the Node action needs no file or network access. We do not hotlink the AWS CloudFront assets.

Why: the workflow is the main lesson. The AWS chain is implicit, because each step is a bucket trigger that you find by reading IAM and S3 notification config. Here the order is code you can read, each step is retryable, and the workflow history shows where a photo stopped. There is no native OpenCV binary on Convex, and a threshold over pixels is all `inRange` was doing.

The form has a labelled file input (`accept="image/jpeg,image/png"`, `capture="user"`), checks the file on the client and again on the server, moves focus to the input when something is wrong, and announces errors and progress through `aria-live` regions.

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
- A rejected upload is returned as a result from `photos.submit`, not thrown. A throw would roll back the delete of the bad file.
- The Convex friction we hit is in [FRICTION.md](./FRICTION.md).
