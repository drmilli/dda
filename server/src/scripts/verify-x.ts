/**
 * Pre-flight X credential check. Read-only — never posts.
 *   npm run x:verify
 */
import { env } from '../lib/env.js';
import { hasXCreds, verifyCredentials } from '../publisher/x-client.js';

async function main() {
  if (!hasXCreds()) {
    console.error('✗ X credentials incomplete. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET.');
    process.exit(1);
  }
  try {
    const me = await verifyCredentials();
    console.log(`✓ Authenticated as @${me.username} (id ${me.id})`);
    console.log(`  PUBLISHER_DRY_RUN=${env.PUBLISHER_DRY_RUN}  →  ${env.PUBLISHER_DRY_RUN ? 'posts are SIMULATED' : 'posts are LIVE'}`);
    if (env.PUBLISHER_DRY_RUN) {
      console.log('  To go live: set PUBLISHER_DRY_RUN=false (only after confirming the account + tier).');
    }
    process.exit(0);
  } catch (e) {
    console.error('✗', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
void main();
