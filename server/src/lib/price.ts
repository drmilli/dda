/**
 * Token USD price via the Jupiter price API. Best-effort — returns null if the
 * token isn't priced (common for brand-new launches), and triage treats an
 * unpriced token as failing the mcap floor.
 */
export async function getPriceUsd(mint: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, { price?: string } | null> };
    const p = json.data?.[mint]?.price;
    return p ? Number(p) : null;
  } catch {
    return null;
  }
}

export function marketCapUsd(priceUsd: number | null, uiSupply: number): number | null {
  if (priceUsd == null) return null;
  return priceUsd * uiSupply;
}
