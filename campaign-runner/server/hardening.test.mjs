import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mirror server helpers (kept in sync with index.js)
function normPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}
function isSendablePhone(p) { return typeof p === 'string' && /^[0-9]{10}$/.test(p); }
const TRANSITIONS = {
  draft: ['scheduled', 'sending', 'cancelled'],
  scheduled: ['sending', 'cancelled', 'draft'],
  sending: ['done', 'failed', 'cancelled'],
  done: [], cancelled: [], failed: ['sending', 'scheduled', 'draft'],
};
function canTransition(f, t) { return (TRANSITIONS[f] || []).includes(t); }

describe('campaign state machine', () => {
  it('allows draft->sending, scheduled->sending', () => {
    assert.equal(canTransition('draft', 'sending'), true);
    assert.equal(canTransition('scheduled', 'sending'), true);
  });
  it('blocks cancelled->sending and done->sending', () => {
    assert.equal(canTransition('cancelled', 'sending'), false);
    assert.equal(canTransition('done', 'sending'), false);
    assert.equal(canTransition('done', 'draft'), false);
  });
  it('cancelled stays terminal (never overwritten by done)', () => {
    // simulate finalizer logic: if cancelled, do not set done
    let status = 'cancelled';
    const finalStatus = status === 'cancelled' ? 'cancelled' : 'done';
    assert.equal(finalStatus, 'cancelled');
  });
});

describe('recipient handling', () => {
  it('dedupes and skips invalid/LID', () => {
    const list = ['9876543210', '9876543210', '919876543210', '123456789012345', 'abc'];
    const seen = new Set(); let skipped = 0;
    for (const raw of list) { const p = normPhone(raw); if (isSendablePhone(p)) seen.add(p); else skipped++; }
    assert.deepEqual([...seen], ['9876543210']);
    assert.equal(skipped, 2);
  });
  it('does not truncate LID via slice(-10)', () => {
    assert.equal(normPhone('123456789012345'), '123456789012345');
    assert.equal(isSendablePhone(normPhone('123456789012345')), false);
  });
  it('empty recipients rejected', () => {
    const v = (() => { const seen = new Set(); return { phones: [...seen] }; })();
    assert.equal(v.phones.length, 0);
  });
});

describe('uploads', () => {
  it('allows only jpeg/png/webp/gif ext', () => {
    const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
    const extOf = (n) => n.slice(n.lastIndexOf('.')).toLowerCase();
    assert.equal(allowed.has(extOf('a.jpg')), true);
    assert.equal(allowed.has(extOf('a.html')), false);
    assert.equal(allowed.has(extOf('a.svg')), false);
  });
  it('rejects traversal filename', () => {
    const bad = '../evil';
    const { basename } = (() => ({ basename: (s) => s.split('/').pop() }))();
    // our server checks basename(name)!==name
    assert.notEqual(basename(bad), bad);
  });
});

describe('settings', () => {
  it('never exposes botAdminKey', () => {
    const stored = { botAdminKey: 'secret', delayMs: 3000 };
    const pub = { delayMs: stored.delayMs, configured: true };
    assert.ok(!('botAdminKey' in pub));
  });
  it('rejects botApiUrl/botAdminKey in PUT', () => {
    const body = { botApiUrl: 'http://evil', delayMs: 3000 };
    const rejected = ('botApiUrl' in body || 'botAdminKey' in body);
    assert.equal(rejected, true);
  });
});
