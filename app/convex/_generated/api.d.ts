/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as demoData from "../demoData.js";
import type * as demoPhotos from "../demoPhotos.js";
import type * as events from "../events.js";
import type * as guests from "../guests.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_config from "../lib/config.js";
import type * as lib_demoAuth from "../lib/demoAuth.js";
import type * as lib_eventBus from "../lib/eventBus.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_parkStats from "../lib/parkStats.js";
import type * as lib_runStep from "../lib/runStep.js";
import type * as outages from "../outages.js";
import type * as park from "../park.js";
import type * as photoSteps from "../photoSteps.js";
import type * as photoWorkflow from "../photoWorkflow.js";
import type * as photos from "../photos.js";
import type * as rides from "../rides.js";
import type * as seed from "../seed.js";
import type * as simulate from "../simulate.js";
import type * as stats from "../stats.js";
import type * as subscribers from "../subscribers.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  crons: typeof crons;
  demo: typeof demo;
  demoData: typeof demoData;
  demoPhotos: typeof demoPhotos;
  events: typeof events;
  guests: typeof guests;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/config": typeof lib_config;
  "lib/demoAuth": typeof lib_demoAuth;
  "lib/eventBus": typeof lib_eventBus;
  "lib/limits": typeof lib_limits;
  "lib/parkStats": typeof lib_parkStats;
  "lib/runStep": typeof lib_runStep;
  outages: typeof outages;
  park: typeof park;
  photoSteps: typeof photoSteps;
  photoWorkflow: typeof photoWorkflow;
  photos: typeof photos;
  rides: typeof rides;
  seed: typeof seed;
  simulate: typeof simulate;
  stats: typeof stats;
  subscribers: typeof subscribers;
  viewer: typeof viewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  parkStats: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"parkStats">;
};
