/**
 * Pro-rata allocation: distribute loanAmount across offers so sum(confirmed) === loanAmount.
 * Used when loan closes at ≥50% (manual) or 100% (auto) with possible over-subscription.
 *
 * Algorithm:
 * - For each offer: confirmed = floor((offeredAmount / totalOffered) * loanAmount * 100) / 100
 * - Allocate remainder (cent by cent) to lenders with largest rounding remainder first
 */

export interface OfferForProRata {
  id: number;
  amount: number;
}

export function calculateProRata(
  loanAmount: number,
  offers: OfferForProRata[]
): Map<number, number> {
  const result = new Map<number, number>();
  if (offers.length === 0) return result;

  const totalOffered = offers.reduce((s, o) => s + Number(o.amount), 0);
  if (totalOffered <= 0) return result;

  // Single lender: full amount
  if (offers.length === 1) {
    result.set(offers[0].id, Math.round(loanAmount * 100) / 100);
    return result;
  }

  const loanAmountRounded = Math.round(loanAmount * 100) / 100;
  const confirmedByOffer: { offerId: number; confirmed: number; remainder: number }[] = [];

  for (const o of offers) {
    const amt = Number(o.amount);
    const ratio = amt / totalOffered;
    const exact = ratio * loanAmountRounded;
    const confirmed = Math.floor(exact * 100) / 100;
    const remainder = exact - confirmed;
    confirmedByOffer.push({ offerId: o.id, confirmed, remainder });
    result.set(o.id, confirmed);
  }

  let sumConfirmed = confirmedByOffer.reduce((s, x) => s + x.confirmed, 0);
  const remainderCents = Math.round((loanAmountRounded - sumConfirmed) * 100);
  if (remainderCents <= 0) return result;

  // Sort by remainder descending; add 0.01 to top N until sum === loanAmount
  confirmedByOffer.sort((a, b) => b.remainder - a.remainder);
  let toAdd = remainderCents;
  for (const x of confirmedByOffer) {
    if (toAdd <= 0) break;
    const current = result.get(x.offerId)!;
    result.set(x.offerId, Math.round((current + 0.01) * 100) / 100);
    toAdd -= 1;
  }

  return result;
}
