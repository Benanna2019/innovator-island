// Vars that are not in wrangler.jsonc, so `wrangler types` does not generate them.
declare namespace Cloudflare {
  interface Env {
    CONVEX_URL: string
  }
}
