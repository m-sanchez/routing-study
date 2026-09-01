/** The models under study, as deterministic synthetic behaviours.
 *
 * A GENERALIST is competent everywhere and roughly honest about it. A
 * SPECIALIST is excellent on its own domain and poor off it, and - the
 * planted problem the study exists to surface - overconfident everywhere.
 * Each model, given an example, returns whether it was correct and how
 * confident it was, deterministically from a per-model seed so the whole
 * study reproduces. */

import { seeded } from './world.ts';
import type { Domain, Example } from './world.ts';

export interface Answer {
  correct: boolean;
  /** the model's stated confidence in [0, 1] */
  confidence: number;
}

export interface Model {
  id: string;
  /** domains this model is competent in (its capability record) */
  capabilities: Domain[];
  answer: (example: Example) => Answer;
  /** explicit price in micro-USD per MTok, overriding the default tier.
   * Only the failure arms set this: the main study derives price from the
   * capability record so nothing is hand-placed on the scale. */
  price?: { inMicros: number; outMicros: number };
}

/** Draw a deterministic coin for (model, example) so a given model always
 * answers a given example the same way. */
function coin(modelId: string, exampleId: string): number {
  let h = 2166136261;
  const s = `${modelId}:${exampleId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return seeded(h >>> 0)();
}

/** A generalist: accuracy `base`, tapering with difficulty; confidence
 * tracks true reliability with a small honest jitter. */
export function generalist(id: string, base: number): Model {
  return {
    id,
    capabilities: ['ledger', 'network', 'timeline', 'identity'],
    answer: (ex) => {
      const pCorrect = clamp(base - 0.2 * ex.difficulty);
      const correct = coin(id, ex.id) < pCorrect;
      // roughly calibrated: confidence near the true probability
      const confidence = clamp(pCorrect + (coin(id + '-c', ex.id) - 0.5) * 0.15);
      return { correct, confidence };
    }
  };
}

/** A specialist for `domain`: strong on-domain, weak off-domain, and
 * OVERCONFIDENT regardless - it reports high confidence whether or not it
 * is in its lane. */
export function specialist(id: string, domain: Domain, onDomain: number, offDomain: number): Model {
  return {
    id,
    capabilities: [domain],
    answer: (ex) => {
      const inLane = ex.domain === domain;
      const pCorrect = clamp((inLane ? onDomain : offDomain) - 0.2 * ex.difficulty);
      const correct = coin(id, ex.id) < pCorrect;
      // the planted flaw: confidence is high and flat, not tied to reliability
      const confidence = clamp(0.95 + (coin(id + '-c', ex.id) - 0.5) * 0.06);
      return { correct, confidence };
    }
  };
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, x));
}
