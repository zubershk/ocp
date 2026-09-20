import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedHost, isPrivateIP, validateExternalImageUrlSync } from './imagePolicy.js';

describe('isPrivateIP', () => {
  it('rejects loopback and private', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1', '0.0.0.0', '169.254.1.1', '::1', '::', 'fc00::1', 'fe80::1', '255.255.255.255']) {
      assert.equal(isPrivateIP(ip), true, ip + ' should be private');
    }
  });
  it('allows public', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '142.250.80.14']) {
      assert.equal(isPrivateIP(ip), false, ip + ' should be public');
    }
  });
});

describe('isAllowedHost', () => {
  it('strict when allowlist empty', () => {
    assert.equal(isAllowedHost('example.com', []), false);
    assert.equal(isAllowedHost('s3.amazonaws.com', []), false);
  });
  it('exact and wildcard', () => {
    const allow = ['cdn.example.com', '*.s3.amazonaws.com'];
    assert.equal(isAllowedHost('cdn.example.com', allow), true);
    assert.equal(isAllowedHost('evil.com', allow), false);
    assert.equal(isAllowedHost('bucket.s3.amazonaws.com', allow), true);
    assert.equal(isAllowedHost('s3.amazonaws.com', allow), true);
    assert.equal(isAllowedHost('not-s3.amazonaws.com.evil.com', allow), false);
  });
});

describe('validateExternalImageUrlSync', () => {
  const allowEnv = 'cdn.example.com,*.allowed.com';
  const withAllow = (fn) => {
    const prev = process.env.IMAGE_ALLOWLIST;
    process.env.IMAGE_ALLOWLIST = allowEnv;
    try { fn(); } finally {
      if (prev === undefined) delete process.env.IMAGE_ALLOWLIST;
      else process.env.IMAGE_ALLOWLIST = prev;
    }
  };

  it('rejects when allowlist empty (uploads-only)', () => {
    const prev = process.env.IMAGE_ALLOWLIST;
    delete process.env.IMAGE_ALLOWLIST;
    delete process.env.ALLOWED_IMAGE_HOSTS;
    assert.throws(() => validateExternalImageUrlSync('https://cdn.example.com/img.jpg'), /external image URLs not allowed/);
    if (prev !== undefined) process.env.IMAGE_ALLOWLIST = prev;
  });

  it('allows allowlisted host', () => withAllow(() => {
    assert.doesNotThrow(() => validateExternalImageUrlSync('https://cdn.example.com/img.jpg'));
    assert.doesNotThrow(() => validateExternalImageUrlSync('https://foo.allowed.com/img.jpg'));
  }));

  it('rejects non-allowlisted host', () => withAllow(() => {
    assert.throws(() => validateExternalImageUrlSync('https://evil.com/img.jpg'), /host not allowed/);
  }));

  it('rejects private IP literals', () => withAllow(() => {
    for (const u of ['http://127.0.0.1/img.jpg', 'http://10.0.0.1/img.jpg', 'http://192.168.1.1/img.jpg', 'http://0.0.0.0/img.jpg', 'http://[::1]/img.jpg']) {
      assert.throws(() => validateExternalImageUrlSync(u), /not allowed/, u);
    }
  }));

  it('rejects credentials and non-default ports', () => withAllow(() => {
    assert.throws(() => validateExternalImageUrlSync('https://user:pass@cdn.example.com/img.jpg'), /credentials/);
    assert.throws(() => validateExternalImageUrlSync('https://cdn.example.com:8080/img.jpg'), /default port/);
  }));

  it('rejects non-https scheme', () => {
    assert.throws(() => validateExternalImageUrlSync('ftp://cdn.example.com/img.jpg'), /https/);
    assert.throws(() => validateExternalImageUrlSync('file:///etc/passwd'), /https/);
  });

  it('handles 0x encoded IP via URL hostname', () => withAllow(() => {
    // URL parser normalizes 0x7f.0.0.1 to 127.0.0.1 in Node 20
    const u = 'http://0x7f.0.0.1/img.jpg';
    try {
      validateExternalImageUrlSync(u);
      // If not thrown, ensure it resolves to private via hostname check (may normalize)
      assert.fail('should reject 0x encoded loopback');
    } catch (e) {
      assert.match(e.message, /not allowed|invalid/);
    }
  }));
});
