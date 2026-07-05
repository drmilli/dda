import type { Confidence, ModuleId, PublishTier } from '../types/index.js';

/**
 * The legal firewall (docs/publisher.md). Routes each finding by confidence
 * tier. Default is DENY — anything not explicitly cleared for an auto tier
 * goes to a human. Never assert intent autonomously.
 */
export interface RoutableFinding {
  module: ModuleId;
  confidence: Confidence;
}

// Heuristics the caller populates from the finding's semantics.
export interface FindingFlags {
  namesPerson: boolean;
  isIntentAssertion: boolean; // "scam"/"rugpull"/motive
  isConclusion: boolean; // interpretive vs. raw fact (relevant for M5/M6)
  isObjectiveFact: boolean; // relevant for M3
}

export function routeFinding(result: RoutableFinding, flags: FindingFlags): PublishTier {
  if (flags.namesPerson || result.module === 'M4') return 'human';
  if (flags.isIntentAssertion) return 'human'; // must never exist autonomously
  if ((result.module === 'M5' || result.module === 'M6') && flags.isConclusion) return 'human';
  if (result.module === 'M3' && flags.isObjectiveFact) return 'auto_hedged';
  if ((result.module === 'M1' || result.module === 'M2') && result.confidence === 'high') {
    return 'auto';
  }
  return 'human'; // default-deny
}
