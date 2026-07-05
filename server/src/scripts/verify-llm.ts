/**
 * Pre-flight LLM check — confirms the API key + model work with a tiny call.
 *   npm run llm:verify
 */
import { env } from '../lib/env.js';
import { verifyLlm } from '../lib/llm.js';

async function main() {
  if (!env.LLM_API_KEY) {
    console.error('✗ LLM_API_KEY not set — summaries will use the deterministic template.');
    process.exit(1);
  }
  try {
    const { model } = await verifyLlm();
    console.log(`✓ LLM reachable — model "${model}" responded.`);
    process.exit(0);
  } catch (e) {
    console.error('✗', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
void main();
