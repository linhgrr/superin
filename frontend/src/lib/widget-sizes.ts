export const WIDGET_SIZES = {
  compact: { width: 4, height: "120px", rowSpan: 1, rglH: 2 },
  standard: { width: 6, height: "200px", rowSpan: 2, rglH: 3 },
  wide: { width: 8, height: "200px", rowSpan: 2, rglH: 3 },
  tall: { width: 6, height: "300px", rowSpan: 3, rglH: 5 },
  full: { width: 12, height: "auto", rowSpan: 1, rglH: 2 },
} as const;

export type WidgetSizeName = keyof typeof WIDGET_SIZES;

export const SIZE_OPTIONS = Object.entries(WIDGET_SIZES).map(([name, config]) => ({
  value: name,
  label: name.charAt(0).toUpperCase() + name.slice(1),
  width: config.width,
  height: config.height,
}));
