// Derive a Tailwind-style shade ramp from a single brand hex colour so that
// admin "primary colour" edits actually restyle the storefront (which uses
// bg-brand-* / text-brand-* extensively), not just the shadcn primary token.

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((c) => clamp(c).toString(16).padStart(2, '0')).join('');
}

// Mix towards white (t>0) or black (t<0).
function mix(rgb: [number, number, number], t: number): [number, number, number] {
  const target = t >= 0 ? 255 : 0;
  const a = Math.abs(t);
  return [
    rgb[0] + (target - rgb[0]) * a,
    rgb[1] + (target - rgb[1]) * a,
    rgb[2] + (target - rgb[2]) * a,
  ];
}

const SHADES: Record<number, number> = {
  50: 0.95, 100: 0.88, 200: 0.75, 300: 0.58, 400: 0.32,
  500: 0, 600: -0.12, 700: -0.28, 800: -0.42, 900: -0.55,
};

/** Return a brand shade ramp keyed 50..900 derived from `primary`. */
export function brandRamp(primary: string): Record<number, string> {
  const base = parseHex(primary) ?? [234, 88, 12]; // fallback OCP orange
  const out: Record<number, string> = {};
  for (const [shade, t] of Object.entries(SHADES)) {
    out[Number(shade)] = toHex(mix(base, t));
  }
  return out;
}
