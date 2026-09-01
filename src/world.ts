/** A synthetic task universe for the routing study. Everything here is
 * seeded and reproducible: the point is not real data but a rigorous
 * harness in which the routing question can be asked and answered
 * honestly. Examples carry a domain and a difficulty; the models in
 * models.ts turn those into correctness and confidence deterministically. */

export interface Example {
  id: string;
  domain: string;
  /** 0 (easy) to 1 (hard); harder examples lower every model's odds */
  difficulty: number;
}

export const DOMAINS = ['ledger', 'network', 'timeline', 'identity'] as const;
export type Domain = (typeof DOMAINS)[number];

/** Domains that have a trained specialist. `timeline` deliberately has
 * none, so the study can check that routing does not hurt an unspecialised
 * domain (the interference question). */
export const SPECIALISED: readonly Domain[] = ['ledger', 'network', 'identity'];

export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 0x100000000;
  };
}

/** Generate a balanced corpus: `perDomain` examples in each domain. */
export function generateCorpus(perDomain: number, seed: number): Example[] {
  const rand = seeded(seed);
  const out: Example[] = [];
  for (const domain of DOMAINS) {
    for (let i = 0; i < perDomain; i++) {
      out.push({ id: `${domain}-${i}`, domain, difficulty: rand() });
    }
  }
  return out;
}
