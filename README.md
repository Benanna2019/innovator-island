# Innovator Island on Convex

This is AWS's [Innovator Island serverless workshop](https://github.com/aws-samples/aws-serverless-workshop-innovator-island) (archived, MIT-0), rebuilt with **TanStack Start + Convex + Cloudflare Workers**, using Effect and classes with static functions. It's a theme-park app with:

- live ride wait times on the original illustrated park map
- ride outages
- green-screen ride photos
- translations (en, fr, es, ja)
- park stats from a visitor simulator

It's a learning comparison. Read it next to the original:

- [PLAN.md](./PLAN.md): the design, what was dropped, and the hooks for a future agent-run park sim.
- [MODULES.md](./MODULES.md): each module, AWS original vs. ours.
- [FRICTION.md](./FRICTION.md): Convex rough edges we hit.
- [original/NOTES.md](./original/NOTES.md): upstream links and quirks.

## AWS → Convex / Cloudflare

| AWS (original) | Here |
| --- | --- |
| Amplify Console + CloudFront hosting a Vue SPA | TanStack Start on a Cloudflare Worker (SSR + static assets) |
| API Gateway + Lambda (`getInitState`) | Convex query `rides.list` (reactive) |
| DynamoDB single table | Typed Convex tables: `parks`, `rides`, `rideStates`, `parkEvents`, `visitors`, `photos`, `outages` |
| EventBridge `rate(1 minute)` + ride-controller Lambda | `convex/crons.ts` calls `park.tick`, which runs the pure `RideController.step` |
| SNS / EventBridge fan-out | `EventBus` class over the `parkEvents` log, with scheduled subscribers |
| IoT Core MQTT + Cognito identity pool | Convex reactive `useQuery`. Guests are anonymous, identified by a random id in a cookie |
| S3 presigned upload | Convex file storage `generateUploadUrl`, rate limited per guest and globally |
| S3-triggered Lambda chain (OpenCV chroma key → Jimp composite → post-process) | `@convex-dev/workflow`: `chromaKey` → `composite` → `finalize` Node actions (pure JS) |
| CloudWatch metrics, Kinesis Firehose → Athena → QuickSight | `@convex-dev/aggregate` plus a `/stats` page |
| AWS Translate script | Committed i18n JSON with a typed `t()` |
| CloudFormation / SAM / Cloud9 | `npx convex dev` and `wrangler` |

## Run it locally with your own Convex project

You need Node 22+, pnpm and a free [Convex](https://convex.dev) account.

```sh
cd app
pnpm install
npx convex dev --once --configure new --project innovator-island --dev-deployment cloud   # first time: creates YOUR dev deployment and writes app/.env.local
npx convex run seed:run        # creates the park and 16 rides (safe to repeat)
pnpm dev                       # Convex watcher + Vite on http://localhost:3002
```

`app/.env.local` is created by `convex dev` and is gitignored. [`app/.env.example`](./app/.env.example) lists the variable names. Nothing in this repo points at anyone's deployment.

Checks (in `app/`): `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

The ride tick runs every minute and the simulator every three minutes, both kept small for a free tier. Pause them with `npx convex run park:setSimulation '{"enabled": false}'`.

### Deploy your own copy

There is no deploy script on purpose. To try it on your own accounts:

1. Run `npx convex deploy` for your Convex production deployment.
2. Build with `VITE_CONVEX_URL=<your convex url> pnpm build`.
3. Run `npx wrangler deploy` with your own Cloudflare login.

Read the limitations below first.

## Security notes and known limitations

- **No accounts.** Guests are anonymous. The guest id is a random UUID in an httpOnly cookie, and it is a bearer secret: whoever has it can see that guest's photo gallery.
- **The only public mutations are the photo upload pair** (`photos.generateUploadUrl`, `photos.submit`). Anyone who can reach your Convex deployment can call them.
  - They are rate limited per guest and globally (60 uploads a minute).
  - Server-side checks reject non-PNG/JPEG files, files over 5 MB and images over 8 MP.
  - A daily job deletes unreferenced uploads, and park events are kept for 3 days.
  - On a public deployment, expect strangers to be able to use your storage up to those limits.
- **Admin functions are internal.** Seeding, the simulation switch, ticks and cleanup can't be called from a browser. Run them with `npx convex run`.
- **No secrets are needed in code.** Configuration comes from environment variables, and none are committed.

## License and credits

- **Code:** MIT. See [LICENSE](./LICENSE).
- **Upstream:** ported from aws-samples/aws-serverless-workshop-innovator-island, MIT-0, © Amazon.com, Inc. or its affiliates.
- **Assets:** the park map is the original workshop map, and the 16 ride icons were AI-generated for this project. Details are in [app/public/park/SOURCES.md](./app/public/park/SOURCES.md).
- **Trademarks:** AWS names and branding are trademarks of Amazon and are not used.
