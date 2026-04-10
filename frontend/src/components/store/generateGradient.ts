/**
 * generateGradient — creates a CSS gradient from a catalog app color.
 */

const FALLBACK_GRADIENT =
  "linear-gradient(135deg, var(--color-foreground-muted) 0%, var(--color-border) 100%)";

/**
 * Parse an oklch() color string and return its L, C, H components.
 */
function parseOklch(color: string): { l: number; c: number; h: number } | null {
  const match = color.match(/oklch\(([\d.]+)\s+([\d.]+)\s+(\d+)\)/);
  if (!match) return null;
  return {
    l: parseFloat(match[1]),
    c: parseFloat(match[2]),
    h: parseInt(match[3]),
  };
}

/**
 * Generate a gradient from an oklch color string.
 * Falls back to a muted gradient if no color is provided.
 */
export function generateGradient(color: string | null | undefined): string {
  if (!color) return FALLBACK_GRADIENT;
  if (color.includes("gradient")) return color;

  const parsed = parseOklch(color);
  if (!parsed) return `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`;

  const { l, c, h } = parsed;
  const l2 = Math.max(0.4, l - 0.07);
  const c2 = c * 1.1;
  return `linear-gradient(135deg, ${color} 0%, oklch(${l2} ${c2} ${h}) 100%)`;
}
