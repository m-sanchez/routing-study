/** The three systems the study compares, and the routing that separates
 * them. Routing is done by careful-router over a capability registry: each
 * example declares the capability (domain) it needs, and the router picks
 * the cheapest model that qualifies. Specialists are priced below the
 * generalist, so on a domain with a specialist the specialist wins; on an
 * unspecialised domain only the generalist qualifies. The router's own
 * decision record is what routes every example - nothing here reaches past
 * it. */

import { route } from '@m-sanchez/careful-router';
import type { ModelRecord } from '@m-sanchez/careful-router';
import type { Answer, Model } from './models.ts';
import type { Example } from './world.ts';

export interface Scored {
  id: string;
  domain: string;
  correct: boolean;
  confidence: number;
  /** which model answered (for routing analysis) */
  routedTo: string;
}

const M = 1_000_000;

/** Build the careful-router registry from the model set. The generalist is
 * priced above the specialists so a qualifying specialist is always the
 * cheaper, and therefore chosen, option. */
export function registry(models: Model[]): ModelRecord[] {
  return models.map((m) => {
    const isGeneralist = m.capabilities.length > 1;
    return {
      id: m.id,
      provider: isGeneralist ? 'generalist' : 'specialist',
      contextWindow: 100_000,
      maxOutput: 4_096,
      inUsdMicrosPerMTok: (isGeneralist ? 5 : 1) * M,
      outUsdMicrosPerMTok: (isGeneralist ? 25 : 5) * M,
      capabilities: m.capabilities,
      boundary: 'external' as const
    };
  });
}

/** Generalist-only: every example goes to the one generalist. */
export function runGeneralist(generalist: Model, corpus: Example[]): Scored[] {
  return corpus.map((ex) => score(ex, generalist.answer(ex), generalist.id));
}

/** Router-selected: careful-router chooses per example by declared domain. */
export function runRouted(models: Model[], corpus: Example[]): Scored[] {
  const reg = registry(models);
  const byId = new Map(models.map((m) => [m.id, m]));
  return corpus.map((ex) => {
    const record = route({ task: `answer a ${ex.domain} question`, requires: [ex.domain] }, reg);
    const chosenId =
      record.outcome.kind === 'selected' ? record.outcome.model : mustFallback(models).id;
    const model = byId.get(chosenId)!;
    return score(ex, model.answer(ex), model.id);
  });
}

/** Oracle: always the correct specialist (or the generalist where none
 * exists). The upper bound routing could reach with perfect dispatch. */
export function runOracle(models: Model[], corpus: Example[]): Scored[] {
  const specialistFor = new Map<string, Model>();
  for (const m of models) if (m.capabilities.length === 1) specialistFor.set(m.capabilities[0], m);
  const generalist = mustFallback(models);
  return corpus.map((ex) => {
    const model = specialistFor.get(ex.domain) ?? generalist;
    return score(ex, model.answer(ex), model.id);
  });
}

function score(ex: Example, a: Answer, routedTo: string): Scored {
  return { id: ex.id, domain: ex.domain, correct: a.correct, confidence: a.confidence, routedTo };
}

function mustFallback(models: Model[]): Model {
  const g = models.find((m) => m.capabilities.length > 1);
  if (!g) throw new Error('the registry needs a generalist to fall back to');
  return g;
}
