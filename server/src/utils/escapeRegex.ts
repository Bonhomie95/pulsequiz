/** Escape a string so it can be embedded in a RegExp / Mongo $regex literally. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
