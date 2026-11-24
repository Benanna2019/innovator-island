# Innovator Island: the AWS original vs. Convex

Source: [aws-samples/aws-serverless-workshop-innovator-island](https://github.com/aws-samples/aws-serverless-workshop-innovator-island). The repo was archived after its last push in January 2025. It is MIT-0 licensed. The workshop instructions are on AWS Workshop Studio. The Vue frontend shipped as a zip (`theme-park-frontend-202310.zip`) and was never in the repo, so we write our own UI.

## What the original does

| Module | AWS pieces | Behaviour |
| --- | --- | --- |
| 0 setup | Cloud9, an install script | Sets up the tooling |
| 1 app deploy | Amplify Console, API Gateway, Lambda (`getInitState`, `getUploadURL`), DynamoDB, S3 | Hosts the park map SPA, loads the ride list, and hands out a presigned upload URL |
| 1 ride controller ("FATcontroller") | EventBridge `rate(1 minute)`, Lambda, DynamoDB, SNS | Every minute, moves each ride's `wait` toward a random `targetWait` by `waitChangeRate`, randomly closes rides (`closureProbability`), and publishes a summary to SNS |
| 2 realtime | SNS, Lambda, DynamoDB, IoT Core (MQTT over websockets, Cognito identity pool) | Stores the latest summary and pushes it to every browser |
| 3 photos | S3, then Lambda (OpenCV chroma key), then S3, then Lambda (Jimp composite: background plus a branding frame), then S3, then Lambda (post-process), then DynamoDB and IoT | A guest uploads a green-screen selfie and gets back a branded ride photo, in realtime |
| 4 translate | AWS Translate, run once as a local script | Generates `translations.json` for the UI (fr, es, ja, and others) |
| 5 park stats | A Lambda simulator, Kinesis Firehose, S3, Athena, QuickSight | Simulates up to 30k visitors' Entry, Ride (with rating) and Exit events over a 12-hour day, for analytics |
| 6 EventBridge | An event bus, rules, Lambdas (`publish`, `outages`, `metrics`), CloudWatch | Fans ride wait times out as events. When a ride goes out of service it enriches an "outage" alert (a reason from a per-ride table, cached for 180s). Wait times also become metrics |
| 0 cleanup | A script | Tears down the stacks |

## Mapping table

| AWS (original) | Our equivalent | Why |
| --- | --- | --- |
| Amplify Console hosting plus CloudFront | A Cloudflare Worker serving TanStack Start (SSR plus static assets) | Our standard host |
| API Gateway plus Lambda (`getInitState`) | A Convex `query` (`rides.list`) | No REST layer is needed, and the query is reactive |
| DynamoDB single table (`partitionKey`/`sortKey`) | Convex tables with indexes: `parks`, `rides`, `rideStates`, `visitors`, `parkEvents`, `photos`, `outages` | Typed schema in place of overloaded keys |
| EventBridge schedule `rate(1 minute)` | `convex/crons.ts`, an interval that calls `internal.park.tick` | Built-in crons |
| SNS topic fan-out | A single `parkEvents` table as the event log. The tick mutation inserts events, and subscribers run through `ctx.scheduler.runAfter(0, …)` or `@convex-dev/workpool` | Durable, transactional fan-out without a broker |
| IoT Core MQTT, Cognito identity pool, browser websocket client | Convex reactive `useQuery` (`rides.list`, `photos.forGuest`, `outages.active`) | Realtime is built in, so there are no topics or credentials to manage |
| S3 presigned PUT (`getUploadURL`) | Convex file storage: `ctx.storage.generateUploadUrl()` behind a mutation, rate limited with `@convex-dev/rate-limiter` | Same "upload straight from the browser" pattern |
| S3-triggered Lambda chain (chroma key, then composite, then post-process) | `@convex-dev/workflow`, started by the `photos.submit` mutation, with steps `chromaKey`, then `composite`, then `finalize` (Node actions using pure-JS image code such as `jimp`, which needs no OpenCV) | Explicit, retryable steps in place of implicit bucket triggers. The workflow is the comparison's main lesson |
| OpenCV HSV `inRange` mask | A pure-TS HSV threshold over RGBA pixels, with the same default range `(36,50,50)` to `(70,255,255)` | No native binary on Convex |
| CloudFront-hosted backgrounds and frame | Assets of our own in `public/` or Convex storage (we don't hotlink AWS's) | The original CDN may disappear |
| AWS Translate script, then `translations.json` | Translation JSON committed to the repo (en, fr, es, ja) plus a small typed `t()` helper. An optional regeneration script could use Cloudflare Workers AI (`m2m100`) | Same build-time step, without AWS |
| EventBridge rules (`waitTimes`, `waitTimesSummary`, `outage`) | An `EventBus` class with static `publish` and `subscribe` functions over `parkEvents`, and a typed event union (`RideWaitChanged`, `RideClosed`, `RideReopened`, `OutageRaised`, `VisitorEntered`, `VisitorRode`, `VisitorExited`) | One typed event model that both phases share |
| Outages Lambda with a warm-container cache (180s) | An `outages` table with `lastAlertAt`. The handler is idempotent because it checks the row instead of an in-memory cache | Lambda's warm cache was a bug waiting to happen (it also checks `hasOwnProperty("rideId")` instead of the real id) |
| CloudWatch metrics (`wait-times`) | `@convex-dev/aggregate` over `rideStates` history, plus a small stats panel | Queryable in the app itself |
| Kinesis Firehose, S3, Athena, QuickSight (park stats) | A scaled-down simulator (`simulate.visitorsTick`, a few hundred visitors, not 30k) writing `parkEvents`, plus aggregates for rides per hour, average rating and current headcount | Same lesson at a size that suits a free tier |
| CloudFormation, SAM, Cloud9, setup and cleanup scripts | `convex dev`, `wrangler` (or alchemy, matching memories), `pnpm` scripts | Nothing to provision |
| Effect | Actions and services wrap the image pipeline and EventBus dispatch in `Effect` with tagged errors (`UploadTooLarge`, `NotAnImage`, `ChromaKeyFailed`) | House style |

## Module list (smallest diff, in build order)

1. Scaffold: `app/`, TanStack Start, Convex and a Worker (biome, vitest, wrangler). Add CI workflow `innovator-island.yml`, filtered to this path.
2. Domain and seed: `convex/schema.ts` defines `parks`, `rides` (static config: name, min, max and rate values, closure probability, map coordinates), `rideStates`, `parkEvents`, `visitors`, `photos` and `outages`. Seed the 16 rides from `initRideState.json`, with our own names (no AWS service puns are needed, though keeping them is fine under MIT-0).
3. Ride controller: `RideController.step(ride, rng)` is a pure, unit-tested function that ports `updateRideState`. A cron calls `park.tick`, which writes `rideStates` and emits events.
4. Realtime map UI: a park map with ride markers, wait-time badges and a closed state, all updating live through `useQuery`. Use an accessible list view as well as the map.
5. Event bus and outages: the `EventBus` class, an outage subscriber, and an outage banner (`aria-live="polite"`).
6. Photos: upload form (label, `accept="image/*"`, `capture="user"`), then a workflow (chroma key, composite, finalize), then a live "your photo is ready" gallery. Include size and type validation with first-error focus.
7. Translations: language picker for en, fr, es and ja, with the choice stored in a cookie.
8. Park stats: a small simulator cron, aggregates, and a stats page.
9. Write README.md (how to run, and what changed per module) and `original/NOTES.md`.

UI rules apply: labels on every input, autocomplete and input types, focus-visible, focus on the first error, `aria-live` errors, `prefers-reduced-motion`, and no cursive or italics.

## What we drop on purpose

- Cloud9, CloudFormation, SAM, IAM policies and the setup and cleanup scripts. They are infrastructure ceremony, and Convex plus Wrangler replace them.
- Cognito identity pools. They only existed so browsers could connect to IoT. Guests stay anonymous, identified by a random guest id in a cookie. Real auth is out of scope.
- QuickSight and Athena dashboards. A small stats page replaces them.
- The 30k-visitor scale and Firehose batching. The simulator is scaled down to stay well within Convex free and dev limits.
- The Vue frontend. It was never in the repo, so we write a new React UI and copy nothing.
- Hotlinked AWS CloudFront images. We use our own assets.

## Phase 2 hooks (not built now)

Phase 2 is an agent-run, RollerCoaster Tycoon-style simulation. Phase 1 keeps these seams clean so that phase doesn't need a rewrite:

- Everything that happens is a `parkEvents` row with a typed payload. Agents will read the same log and append to it.
- Decisions are separated from effects. `RideController.step` and the simulator's visitor choices are pure functions of state plus an RNG. Phase 2 swaps in agent policies for operators (pricing, opening and closing rides, staffing) and guests (which ride to choose next) behind the same interface.
- `parks` is a table from day one, so there can be many parks and many sims. Nothing assumes a single park.
- The `tick` is a single entry point, so it can later be driven by a cron, a workflow or an agent loop.
- Money, build and placement (park tiles, ride construction, finances) are left out on purpose. We add them as new tables and events in phase 2.

## Deploying

Not deployed. To run your own copy, see the README. Use a Convex dev deployment while experimenting, and pass the Convex URL at build time.
