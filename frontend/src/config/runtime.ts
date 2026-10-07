// Runtime deployment configuration (D1). Single place that resolves the
// API base URL. Rules:
// - explicit value (incl. "") wins; "" means same-origin/nginx-proxy mode.
// - unset in dev: localhost default with a console warning (dev-only).
// - unset in PROD: throw at startup — a production bundle must never
//   silently point at a developer loopback (Vite inlines VITE_* at build).
// - explicit localhost in PROD: allowed (operator's choice) but warned.
export interface RuntimeConfig {
  apiBaseUrl: string;
  isProd: boolean;
  explicitLocalhost: boolean;
}

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/i;

export function loadRuntimeConfig(): RuntimeConfig {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const isProd = import.meta.env.PROD === true;
  if (raw == null) {
    if (isProd) {
      throw new Error(
        'VITE_API_BASE_URL is not set. Production builds require an explicit API origin ' +
          '(set it for Vercel) or an explicit empty string for same-origin/nginx-proxy mode (Docker).',
      );
    }
    // eslint-disable-next-line no-console
    console.warn('[runtime] VITE_API_BASE_URL unset — using http://localhost:8090 for local dev only.');
    return { apiBaseUrl: 'http://localhost:8090', isProd, explicitLocalhost: false };
  }
  const apiBaseUrl = String(raw).replace(/\/+$/, '');
  const explicitLocalhost = apiBaseUrl !== '' && LOCALHOST_RE.test(apiBaseUrl);
  if (explicitLocalhost && isProd) {
    // eslint-disable-next-line no-console
    console.warn('[runtime] API base points at localhost in a production build. This is only valid for on-device deployments.');
  }
  return { apiBaseUrl, isProd, explicitLocalhost };
}
