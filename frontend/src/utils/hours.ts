import { RESTAURANT } from '../data/outlets';

/**
 * Delivery window is 11:00 AM – 04:00 AM (crosses midnight).
 * Parses "11:00 AM to 04:00 AM" from RESTAURANT.deliveryHours so the
 * website never shows a stale hard-coded status.
 */
function parseWindow(): { openMin: number; closeMin: number } {
  const m = RESTAURANT.deliveryHours.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*to\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return { openMin: 11 * 60, closeMin: 4 * 60 };
  const to24 = (h: number, mm: number, ap: string) => {
    const hh = h % 12 + (ap.toUpperCase() === 'PM' ? 12 : 0);
    return hh * 60 + mm;
  };
  return {
    openMin: to24(+m[1], +m[2], m[3]),
    closeMin: to24(+m[4], +m[5], m[6]),
  };
}

export type OpenStatus = 'open' | 'closed';

export function getOpenStatus(now = new Date()): { status: OpenStatus; label: string } {
  const { openMin, closeMin } = parseWindow();
  const cur = now.getHours() * 60 + now.getMinutes();
  // Window crosses midnight (e.g. 660 → 240): open if after open OR before close.
  const open = cur >= openMin || cur < closeMin;
  if (open) {
    const until = cur < closeMin ? closeMin : openMin + 24 * 60; // minutes until closing
    const h = Math.floor((until - cur) / 60);
    const mm = (until - cur) % 60;
    const left = h > 0 ? `${h}h ${mm}m` : `${mm}m`;
    return { status: 'open', label: `Delivering now · closes in ${left}` };
  }
  const opensIn = openMin - cur;
  const h = Math.floor(opensIn / 60);
  const mm = opensIn % 60;
  const label = h > 0 ? `Opens in ${h}h ${mm}m · free delivery till 4 AM` : `Opens in ${mm}m`;
  return { status: 'closed', label };
}
