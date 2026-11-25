# Convex friction log: Innovator Island

## 2026-11-24

- **Non-interactive project creation worked.** `npx convex dev --once --configure new --project innovator-island --dev-deployment cloud` created a cloud dev deployment with one team and no prompts. No workaround needed. It also wrote `.env.local` (gitignored) with `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`.
- **`wrangler types` reads `.env.local`.** Locally the generated `ProcessEnv` includes the Convex vars, but CI has no `.env.local`, so the same typecheck sees different types. Workaround: `env.d.ts` declares only what code relies on, and the router reads `import.meta.env.VITE_CONVEX_URL` (typed by `vite/client`) so both pass.
- **Subscribers and generated types.** `EventBus.publish` schedules `internal.events.dispatch`, and `events.ts` imports `EventBus`, so `_generated/api` and the bus import each other. It typechecks because the handlers return plain values, but an unannotated return type there would risk an implicit-any cycle. Keep handler return types simple.
- **`eq("resolvedAt", undefined)` on an index** matches rows where the optional field is missing. It works (the outages query relies on it) but isn't obvious from the docs. A test covers it.

## Steps 6 to 8 (photos, translations, stats)

- **Throwing from a mutation rolls back its writes, including `ctx.storage.delete`.** The first `photos.submit` threw a `ConvexError` after deleting a rejected upload, and the blob was still there. A test caught it. Fix: return `{ ok: false, code }` for expected rejections and reserve throws for bugs.
- **Workflow failures cross the boundary as a string.** `onComplete` gets `result.error` as plain text, so a tagged Effect error is lost. `runStep` writes the tag into the message (`ChromaKeyFailed: ...`) and `onWorkflowComplete` reads it back. Also, the failure kind is `"failed"`, not `"error"`, which the README example's branches suggest. TypeScript caught it.
- **`vResultValidator` is re-exported by `@convex-dev/workflow`.** Importing it from `@convex-dev/workpool` fails because pnpm does not hoist the transitive package. Import it from the workflow package.
- **Step return types need annotating.** `step.runAction` results are inferred through `internal.*`, so Node actions need explicit return types (`Promise<Id<"_storage">>`) or the types cycle or widen to `string`.
- **Component tests need every component registered by name.** `convexTest` needs `aggregateTest.register(t, "parkStats")`, `rateLimiterTest.register(t, "rateLimiter")` and `workflowTest.register(t, "workflow")`. The names must match `convex.config.ts`. The workflow and rate limiter helpers register their own workpool and batch worker.
- **Node action bundling of `jimp` worked first try**, with no `externalPackages` entry. A 640x480 round trip through three actions took a few seconds on the dev deployment.
- **Aggregates are not wired to the table automatically.** There is no trigger unless you add `convex-helpers` triggers, so `EventBus.publish` calls `parkStats.insert` for visitor events itself. A direct `ctx.db.insert("parkEvents")` elsewhere would silently skip the aggregate.
- **Dev deployments run crons without you.** The cron and simulator keep writing once pushed, so we added `parks.simulationEnabled` and left the dev deployment paused after testing.
- **`convex dev --once` also writes `_generated/api.d.ts`**, so the generated file changes in every commit that adds a module.

## Review fixes

- **A subscriber registry that only one module imports cannot drive `publish`.** `subscribers.ts` registers on import and only `events.ts` imports it, so `publish` cannot ask the registry whether anyone listens. We keep a static `DISPATCHED_TYPES` set in `eventBus.ts` and a test asserts it equals the registry, so the two cannot drift.
- **Aggregates need an explicit delete on retention.** Deleting `parkEvents` rows does not touch the `parkStats` aggregate, so `events.prune` calls `deleteIfExists` for visitor events in the same mutation. The stats totals now cover the retention window (3 days), and the page intro says so.
- **Storage has no "what references this blob" query.** The orphan sweeper needs one index per `_storage` id field on `photos` (four), and it pages through `ctx.db.system.query("_storage")` oldest first, which convex-test supports.
- **`finishAllScheduledFunctions` runs the real workflow in tests.** A test that submits a photo and then flushes timers sees the pipeline fail on dummy bytes and delete the original, so the sweeper test must not flush.
- **Scheduled function names in `_scheduled_functions` are `events:dispatch`**, without `.js`.
- **No `httpAction` was needed.** Size and type are still only checked after upload (the file is already in storage by then), so the daily sweeper plus magic-byte and pixel checks in the pipeline are the backstop.

## Logins and demo data

- **Customising the `users` table.** `authTables` already defines `users`, so a `role` field means redefining it after the spread and keeping the `email` index by hand. The auth library's `profile()` runs on every sign-in, so putting `role` there would reset an admin to guest on each login. A missing role means guest instead, and `demo:ensureAccounts` sets roles in a separate mutation.
- **`Password`'s `profile` runs for every flow**, including sign-in, so closing sign-up in demo mode is a check on `params.flow === "signUp"` inside it.
- **`ConvexCredentials` has no test helper.** `convex-test` cannot run `signIn` end to end, so the demo check is a plain function that takes an injected account lookup. The allow-list and demo-mode tests call it directly, and the live path was checked once against the dev deployment with `ConvexHttpClient`.
- **Identity in tests.** `t.withIdentity({ subject: "<userId>|<session>" })` is enough for `getAuthUserId`, as the auth library reads the user id from the first part of the subject. The handle it returns is narrower than the full tester type (no `run` helpers in the type), so test helpers type it with a `Pick`.
- **A schema push validates existing rows.** Replacing `photos.guestId` with a required `userId` failed on the dev deployment's old test rows. Clearing the table needs `convex import --replace`, which is a destructive command, so the schema keeps `guestId` and `userId` optional instead. A fresh deployment never has legacy rows.
- **`convex codegen` pushes to the dev deployment.** It printed "Uploading functions" while only meant to generate types, so a bad schema fails there too.
- **Backdating events goes through the aggregate.** `EventBus.publish` takes an `at` option so seeded history lands in `parkStats` in the right place, and the retention prune and the reset both remove the aggregate rows with the events. A test checks the aggregate counts equal the table counts after seeding and after reset.
- **Seeding in batches.** Aggregate inserts touch several documents each, so history goes in three hours per mutation and guests forty per mutation, driven by an action. The seed is idempotent by a stable slug per guest, an hour key per history visitor, and `parks.demoSeededAt` for the whole history.
- **Node action files cannot hold mutations.** The ticket-stub photo seeder needs `jimp` and so lives in a `"use node"` file (`demoPhotos.ts`), and its queries and mutations live in `demoData.ts`.
- **`convex env set` takes the value as an argument**, so a value starting with a dash needs `--` before it, and the value shows in the process list while the command runs. The setup script passes values as arguments with output ignored and catches errors without printing them, because the error message contains the command line.
- **`pnpm` was not on the PATH** in this shell, and `pnpm@10` refused a `node_modules` made by pnpm 11. `npx pnpm@11 <command>` worked.
