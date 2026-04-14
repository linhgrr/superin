/**
 * generateGradient — creates a CSS gradient from a catalog app color.
 */

const FALLBACK_GRADIENT = "var(--color-border)";



export function generateGradient(color: string | null | undefined): string {
  if (!color) return FALLBACK_GRADIENT;
  return color;
}
