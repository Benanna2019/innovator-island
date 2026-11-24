# Upstream notes

We link to the upstream project and do not vendor it.

## Source

- Repo: https://github.com/aws-samples/aws-serverless-workshop-innovator-island
- Archived after its last push in January 2025.
- Workshop instructions: AWS Workshop Studio (the repo only has the code).
- Frontend: the Vue app shipped separately as `theme-park-frontend-202310.zip` and is not in the repo. Our UI is new and copies nothing from it.

## License and credit

The upstream code is MIT-0 (MIT No Attribution). That license does not require attribution, but we give it anyway. The backend behaviour ported here comes from the upstream Lambdas:

- `getInitState` and `getUploadURL` (module 1)
- the FATcontroller ride-state update, `updateRideState` (module 1)
- the OpenCV chroma key and the Jimp composite (module 3)
- the `outages` Lambda (module 6)
- the park simulator (module 5)

We port the behaviour and write our own code, and we do not hotlink the AWS CloudFront assets, which may go away. See "Visual assets" below for the few assets we reuse.

## Module map

| Upstream module | Ours | Where |
| --- | --- | --- |
| 1 app deploy, ride controller | `rides.list`, `park.tick`, `RideController.step` | `app/convex/rides.ts`, `app/convex/park.ts`, `app/src/domain/ride-controller.ts` |
| 2 realtime | `useQuery` | `app/src/routes/index.tsx` |
| 3 photos | workflow with three Node actions | `app/convex/photos.ts`, `app/convex/photoWorkflow.ts`, `app/convex/photoSteps.ts` |
| 4 translate | committed JSON and `t()` | `app/src/i18n/` |
| 5 park stats | simulator and aggregate | `app/convex/simulate.ts`, `app/convex/stats.ts` |
| 6 EventBridge | `EventBus` over `parkEvents` | `app/convex/lib/eventBus.ts`, `app/convex/subscribers.ts` |

## Quirks we saw upstream

- The outages Lambda caches alerts in a warm container for 180 seconds and checks `hasOwnProperty("rideId")` instead of comparing the real ride id.
- The chroma key default is an OpenCV `inRange` of HSV (36,50,50) to (70,255,255), where hue runs 0 to 179.
- The workshop leans on CloudFormation, SAM, Cloud9 and IAM policies for setup. We drop all of that.

See [../PLAN.md](../PLAN.md) for the full mapping table.

## Visual assets

The UI reuses the original park look. See [app/public/park/SOURCES.md](../app/public/park/SOURCES.md) for details.

- The park map (`park-map.webp`) and the ride and facility coordinates are from the original workshop (MIT-0, Amazon.com, Inc. or its affiliates). The AWS workshop logo is not used: the header has our own CSS wordmark. The map was recovered from a vendored copy at github.com/ojasnaik/theme-park-app because the original CloudFront domain is gone.
- The 16 ride icons in `app/public/park/rides/` are AI-generated for this project in the map's style. The original ride icons were not recoverable.
