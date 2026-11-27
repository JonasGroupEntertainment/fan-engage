/** Heading above the waiting rewards on the admin Redemption Queue. */
export function needsActionHeading(count: number): string {
  const noun = count === 1 ? "reward" : "rewards";
  return `Needs action: ${count} ${noun} waiting to be fulfilled or refunded`;
}
