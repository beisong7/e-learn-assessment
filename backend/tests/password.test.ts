import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('password hashing', () => {
  it('uses independent salts and verifies correct passwords only', async () => {
    const first = await hashPassword('test-only-password');
    const second = await hashPassword('test-only-password');
    expect(first).not.toBe(second);
    expect(first).not.toContain('test-only-password');
    expect(await verifyPassword('test-only-password', first)).toBe(true);
    expect(await verifyPassword('incorrect-password', first)).toBe(false);
  });
  it('rejects malformed hashes and unrecognized cost settings', async () => {
    expect(await verifyPassword('example', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('example', 'scrypt$999999999$8$1$bad$bad')).toBe(false);
  });
});
