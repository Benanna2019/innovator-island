// Generates the key pair Convex Auth signs session tokens with and sets JWT_PRIVATE_KEY and JWKS on the CURRENT
// Convex deployment (the one `npx convex env` points at: .env.local, or CONVEX_DEPLOYMENT, or --prod flags you pass).
// Neither value is printed or written to disk. Run it once per deployment; running it again rotates the key and
// signs everyone out.
//
//   node scripts/setup-auth-keys.mjs [extra convex env flags, e.g. --deployment-name my-staging]
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'

const extra = process.argv.slice(2)
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
// Convex env values cannot hold newlines in some shells, and the auth library accepts spaces in their place.
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trimEnd().replace(/\n/g, ' ')
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey.export({ format: 'jwk' }) }] })

function set(name, value) {
  try {
    // `--` keeps a value that starts with a dash from being read as a flag. stdio is ignored so nothing is echoed.
    execFileSync('npx', ['convex', 'env', 'set', ...extra, name, '--', value], { stdio: 'ignore' })
  } catch (error) {
    // Do not print the error object: its message includes the command line, which holds the value.
    console.error(`Could not set ${name} (exit status ${error.status ?? 'unknown'}). Is this folder linked to a Convex deployment?`)
    process.exit(1)
  }
  console.log(`Set ${name}`)
}

set('JWT_PRIVATE_KEY', pem)
set('JWKS', jwks)
console.log('Done. Also set SITE_URL (see README), then push functions with `npx convex dev --once`.')
