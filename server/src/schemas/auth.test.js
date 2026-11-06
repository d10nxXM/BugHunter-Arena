import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  ProfileParamsSchema,
  RefreshSchema,
  RESERVED_HANDLES,
  SignupSchema,
} from './auth.js';

const valid = {
  handle: 'dion_m',
  email: 'dion@example.com',
  password: 'correct horse',
};

const issue = (schema, input) => {
  const r = schema.safeParse(input);
  return r.success ? null : r.error.issues[0];
};

describe('SignupSchema', () => {
  it('accepts a valid body and defaults claimUserId to null', () => {
    expect(SignupSchema.parse(valid)).toEqual({ ...valid, claimUserId: null });
  });

  it('lowercases and trims handle and email, never the password', () => {
    const out = SignupSchema.parse({
      handle: '  Dion_M ',
      email: ' Dion@Example.COM ',
      password: '  Spaced Pass  ',
    });
    expect(out.handle).toBe('dion_m');
    expect(out.email).toBe('dion@example.com');
    expect(out.password).toBe('  Spaced Pass  ');
  });

  it.each(['ab', 'a'.repeat(21), 'dion-m', 'dion m', 'dión', ''])(
    'rejects handle %j',
    (handle) => {
      expect(issue(SignupSchema, { ...valid, handle })?.path).toEqual([
        'handle',
      ]);
    },
  );

  it('accepts handles of 3 and 20 characters', () => {
    expect(SignupSchema.safeParse({ ...valid, handle: 'abc' }).success).toBe(
      true,
    );
    expect(
      SignupSchema.safeParse({ ...valid, handle: 'a'.repeat(20) }).success,
    ).toBe(true);
  });

  it('rejects every reserved handle, also in uppercase', () => {
    for (const handle of RESERVED_HANDLES) {
      if (handle.length < 3) continue; // 'me' and 'u' already fail the format
      expect(
        issue(SignupSchema, { ...valid, handle: handle.toUpperCase() })
          ?.message,
      ).toMatch(/reserved/);
    }
    expect(issue(SignupSchema, { ...valid, handle: 'me' })).not.toBeNull();
  });

  it.each([
    ['too short', 'a'.repeat(9)],
    ['too long', 'a'.repeat(73)],
    ['over 72 bytes', 'é'.repeat(37)],
    ['empty', ''],
  ])('rejects a password that is %s', (_label, password) => {
    const i = issue(SignupSchema, { ...valid, password });
    expect(i.path).toEqual(['password']);
    expect(i.message).toBe('Password must be 10 to 72 characters.');
  });

  it('accepts passwords of 10 and 72 characters', () => {
    for (const password of ['a'.repeat(10), 'a'.repeat(72)]) {
      expect(SignupSchema.safeParse({ ...valid, password }).success).toBe(true);
    }
  });

  it.each(['not-an-email', '', `${'a'.repeat(250)}@x.io`])(
    'rejects email %j',
    (email) => {
      expect(issue(SignupSchema, { ...valid, email })?.path).toEqual(['email']);
    },
  );

  it('error messages never echo the input', () => {
    const i = issue(SignupSchema, { ...valid, password: 'secret123' });
    expect(i.message).not.toContain('secret123');
  });

  it('claimUserId must be a UUID or null', () => {
    expect(
      SignupSchema.safeParse({ ...valid, claimUserId: 'abc' }).success,
    ).toBe(false);
    expect(
      SignupSchema.parse({
        ...valid,
        claimUserId: '11111111-1111-4111-8111-111111111111',
      }).claimUserId,
    ).toBe('11111111-1111-4111-8111-111111111111');
  });
});

describe('LoginSchema and RefreshSchema', () => {
  it('login needs an email and a non-empty password', () => {
    expect(
      LoginSchema.safeParse({ email: valid.email, password: 'x' }).success,
    ).toBe(true);
    expect(
      LoginSchema.safeParse({ email: valid.email, password: '' }).success,
    ).toBe(false);
    expect(
      LoginSchema.safeParse({ email: 'nope', password: 'x' }).success,
    ).toBe(false);
  });

  it('refresh needs a token of 1-2048 characters', () => {
    expect(RefreshSchema.safeParse({ refreshToken: 'abc' }).success).toBe(true);
    expect(RefreshSchema.safeParse({ refreshToken: '' }).success).toBe(false);
    expect(RefreshSchema.safeParse({}).success).toBe(false);
    expect(
      RefreshSchema.safeParse({ refreshToken: 'a'.repeat(2049) }).success,
    ).toBe(false);
  });
});

describe('ProfileParamsSchema', () => {
  it('lowercases and checks the format only', () => {
    expect(ProfileParamsSchema.parse({ handle: 'Dion_M' })).toEqual({
      handle: 'dion_m',
    });
    expect(ProfileParamsSchema.safeParse({ handle: 'a-b' }).success).toBe(
      false,
    );
  });
});
