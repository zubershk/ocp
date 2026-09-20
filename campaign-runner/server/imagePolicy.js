import { isIP } from 'net';
import { lookup } from 'dns/promises';

// ------------------------------------------------------------------
// Centralized image URL policy for campaign-runner (layer 1 of 3).
// Reusable, side-effect-free validators: no fetch, no state.
// All three layers (campaign, bot, evolution) independently enforce the
// same allowlist + private-network rules; this module is the campaign
// copy.
// ------------------------------------------------------------------

function getAllowlist() {
  const raw = process.env.IMAGE_ALLOWLIST || process.env.ALLOWED_IMAGE_HOSTS || '';
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function isAllowedHost(hostname, allowlist = getAllowlist()) {
  if (!allowlist.length) return false; // strict uploads-only when not configured
  const h = hostname.toLowerCase();
  for (const entry of allowlist) {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2).toLowerCase();
      if (h === suffix || h.endsWith('.' + suffix)) return true;
    } else if (h === entry) {
      return true;
    }
  }
  return false;
}

export function isPrivateIP(ip) {
  if (!ip) return true;
  // Normalize IPv4-mapped IPv6 ::ffff:127.0.0.1
  const normalized = ip.toLowerCase().replace(/^::ffff:/, '');
  // IPv4
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 192.0.2/24, 198.51.100/24, 203.0.113/24
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    if (a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255) return true;
    return false;
  }
  // IPv6
  if (isIP(normalized) === 6) {
    const lower = normalized.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique local
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('ff')) return true; // multicast
    // IPv4-mapped already stripped, but check original
    return false;
  }
  // non-IP hostname → not private by this check (DNS step handles it)
  return false;
}

export async function resolveHostnameIsPrivate(hostname) {
  // Literal IP: check directly without DNS
  if (isIP(hostname)) {
    return isPrivateIP(hostname);
  }
  // Try DNS lookup (A/AAAA); if fails, treat as private to fail closed
  try {
    const addrs = await lookup(hostname, { all: true, verbatim: true });
    if (!addrs.length) return true;
    for (const r of addrs) {
      if (isPrivateIP(r.address)) return true;
    }
    return false;
  } catch {
    return true; // fail closed on DNS error
  }
}

export function validateExternalImageUrl(urlStr) {
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error('invalid image URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('image URL must be https');
  }
  // Prefer https; allow http only if explicitly needed — currently allow both but recommend https
  if (url.username || url.password) {
    throw new Error('image URL must not contain credentials');
  }
  // Block non-standard ports (only 80/443 or implicit)
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('image URL must use default port');
  }
  const hostname = url.hostname;
  if (!hostname) throw new Error('invalid image URL host');
  // Host literal IP check before DNS
  if (isIP(hostname) && isPrivateIP(hostname)) {
    throw new Error('image host not allowed');
  }
  // Allowlist enforcement: when IMAGE_ALLOWLIST is set, only those hosts pass;
  // when empty, external URLs are rejected (uploads-only mode)
  const allowlist = getAllowlist();
  if (!allowlist.length) {
    throw new Error('external image URLs not allowed — use uploads library');
  }
  if (!isAllowedHost(hostname, allowlist)) {
    throw new Error('image host not allowed');
  }
  return url;
}

// Synchronous wrapper for resolveImagePayload: we cannot block on DNS in sync path,
// so this validates everything except DNS resolution. DNS private-IP check is
// performed async via resolveHostnameIsPrivate where needed; evolution sink
// does full DNS + redirect re-validation. Campaign gate at least blocks
// literal private IPs and non-allowlisted hosts without DNS.
export function validateExternalImageUrlSync(urlStr) {
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error('invalid image URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('image URL must be https');
  }
  if (url.username || url.password) {
    throw new Error('image URL must not contain credentials');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('image URL must use default port');
  }
  const hostname = url.hostname;
  if (!hostname) throw new Error('invalid image URL host');
  if (isIP(hostname) && isPrivateIP(hostname)) {
    throw new Error('image host not allowed');
  }
  const allowlist = getAllowlist();
  if (!allowlist.length) {
    throw new Error('external image URLs not allowed — use uploads library');
  }
  if (!isAllowedHost(hostname, allowlist)) {
    throw new Error('image host not allowed');
  }
  return url;
}
