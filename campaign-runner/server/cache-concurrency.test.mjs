import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

// Two independent campaign-runner processes ("replicas") share one Postgres
// campaign_state row. Each hydrates the same version, then two HTTP clients
// write the SAME key concurrently with different values. Optimistic concurrency
// must ensure only one write lands and the loser refreshes to the winner —
// never a silent last-writer-wins clobber based on stale state.

const DB_URL = process.env.CAMPAIGN_DATABASE_URL
  || 'postgresql://ocp:password@localhost:5432/ocp?sslmode=disable';
const ADMIN = 'testkey123'; // matches the key used by the other integration tests' data
const PORTS = [3231, 3232];
const BASES = PORTS.map(p => `http://127.0.0.1:${p}`);
const SEED = {
  delayMs: 5000, batchSize: 3, dailySendCap: 250, brandName: 'seed',
  brandLogo: '', brandColor: '#ea580c', footerText: '', defaultCountryCode: '91',
};

let db = null;
let originalRow = null;
const procs = [];
const stderrBufs = [];

async function readRow() {
  const r = await db.query("SELECT value, xmin::text AS ver FROM campaign_state WHERE key = 'settings'");
  return r.rows[0];
}
async function seedRow(value) {
  await db.query(
    `INSERT INTO campaign_state (key, value, updated_at) VALUES ('settings', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify({ data: value })],
  );
}
function startServer(port, idx) {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');
  const stderr = [];
  stderrBufs[idx] = stderr;
  const proc = spawn(process.execPath, [join(here, 'index.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BOT_ADMIN_KEY: ADMIN,
      BOT_API_URL: 'http://127.0.0.1:1',
      CAMPAIGN_DATABASE_URL: DB_URL,
      CAMPAIGN_PG_ENABLED: 'true',
      // Disable periodic refresh so it cannot mask the conflict by pulling the
      // winner's value into the loser before its own write is attempted.
      CAMPAIGN_PG_REFRESH_MS: '60000',
      // No CAMPAIGN_ENCRYPTION_KEY: derive it from BOT_ADMIN_KEY, matching the
      // key used to encrypt existing campaign_state rows in the test DB.
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  proc.stderr.on('data', d => stderr.push(d.toString()));
  return proc;
}
async function waitForHealth(base, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`server ${base} did not start`);
}
async function api(base, path, opts = {}) {
  const { headers: oh, ...rest } = opts;
  const res = await fetch(`${base}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN, ...(oh || {}) },
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await predicate();
    if (v) return v;
    await delay(50);
  }
  throw new Error(`timeout waiting for ${label}`);
}

describe('cross-replica same-key write concurrency (real Postgres)', () => {
  before(async () => {
    db = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });
    await db.connect();
    originalRow = await readRow();
    await seedRow(SEED);
  });

  after(async () => {
    for (const p of procs) { try { p.kill('SIGKILL'); } catch {} }
    await delay(200);
    try {
      if (originalRow) {
        await db.query("UPDATE campaign_state SET value = $1::jsonb, updated_at = NOW() WHERE key = 'settings'",
          [JSON.stringify(originalRow.value)]);
      } else {
        await db.query("DELETE FROM campaign_state WHERE key = 'settings'");
      }
    } catch {}
    try { await db.end(); } catch {}
  });

  it('keeps one winner and makes the loser refresh instead of clobbering', async () => {
    procs.push(...PORTS.map((p, i) => startServer(p, i)));
    await Promise.all(BASES.map(b => waitForHealth(b)));

    // Both replicas hydrated the seeded row, so both caches sit on the same
    // xmin version V0.
    const baseRow = await readRow();
    assert.ok(baseRow, 'seeded settings row exists');
    assert.equal(baseRow.value.data.delayMs, 5000);

    // Two clients concurrently POST different values for the SAME key.
    const [rA, rB] = await Promise.all([
      api(BASES[0], '/api/settings', { method: 'PUT', body: JSON.stringify({ delayMs: 6000 }) }),
      api(BASES[1], '/api/settings', { method: 'PUT', body: JSON.stringify({ delayMs: 7000 }) }),
    ]);
    assert.equal(rA.status, 200);
    assert.equal(rB.status, 200);

    // Exactly one write must land. A plain last-writer-wins implementation
    // would also "land" one write, but it would not log a conflict nor make the
    // loser refresh — the checks below are what distinguish safe from unsafe.
    const winner = await waitFor(async () => {
      const row = await readRow();
      const d = row?.value?.data?.delayMs;
      return (d === 6000 || d === 7000) ? d : null;
    }, 10000, 'winning write to reach Postgres');

    // DB holds the winner's full value; no stale/merged document.
    const finalRow = await readRow();
    assert.equal(finalRow.value.data.delayMs, winner);
    assert.equal(finalRow.value.data.brandName, 'seed');

    // Both replicas converge to the DB winner: the loser refreshed to it
    // instead of keeping its own (now rejected) value.
    for (const base of BASES) {
      await waitFor(async () => {
        const s = await api(base, '/api/settings');
        return s.status === 200 && s.data.delayMs === winner ? true : null;
      }, 10000, `replica ${base} to converge to delayMs=${winner}`);
    }

    // Optimistic concurrency must have rejected the loser with a clear,
    // structured conflict record and refreshed its cache to the winner.
    const logs = stderrBufs.map(b => b.join('')).join('\n');
    assert.match(logs, /"op":"store-write-conflict"/);
    assert.match(logs, /"action":"refreshed-to-winner"/);
  });
});
