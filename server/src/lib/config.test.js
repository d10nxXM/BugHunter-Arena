import { describe, it, expect } from 'vitest';
import { parseConfig, config } from './config.js';

const base = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key-secret',
  ALLOWED_ORIGIN: 'http://localhost:5173',
  PORT: '4000',
  LLM_API_KEY: '',
  DEMO_MODE: 'false',
  LOG_LEVEL: 'warn',
  AI_TIMEOUT_MS: '9000',
};

function messageOf(env) {
  try {
    parseConfig(env);
  } catch (err) {
    return err.message;
  }
  return null;
}

describe('parseConfig', () => {
  it('maps a valid env to typed config fields', () => {
    expect(parseConfig(base)).toMatchObject({
      supabaseUrl: 'https://abc.supabase.co',
      supabaseServiceKey: 'service-key-secret',
      allowedOrigin: 'http://localhost:5173',
      port: 4000,
      llmApiKey: '',
      demoMode: false,
      logLevel: 'warn',
      aiTimeoutMs: 9000,
    });
  });

  it('converts PORT and AI_TIMEOUT_MS to numbers', () => {
    const result = parseConfig(base);
    expect(typeof result.port).toBe('number');
    expect(typeof result.aiTimeoutMs).toBe('number');
  });

  it('applies defaults for optional variables', () => {
    const result = parseConfig({
      SUPABASE_URL: base.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: base.SUPABASE_SERVICE_KEY,
    });
    expect(result.aiTimeoutMs).toBe(15000);
    expect(result.port).toBe(3000);
    expect(result.demoMode).toBe(false);
    expect(result.llmApiKey).toBe('');
    expect(result.logLevel).toBe('info');
    expect(result.allowedOrigin).toBe('http://localhost:5173');
  });

  describe('aiStatus', () => {
    it('is "unavailable" when the LLM key is empty', () => {
      expect(parseConfig({ ...base, LLM_API_KEY: '' }).aiStatus).toBe(
        'unavailable',
      );
    });

    it('is "unavailable" when the LLM key is missing', () => {
      const env = { ...base };
      delete env.LLM_API_KEY;
      expect(parseConfig(env).aiStatus).toBe('unavailable');
    });

    it('is "available" when a key is set', () => {
      expect(parseConfig({ ...base, LLM_API_KEY: 'sk-test' }).aiStatus).toBe(
        'available',
      );
    });

    it('is "demo" when DEMO_MODE is true, even with a key', () => {
      const result = parseConfig({
        ...base,
        DEMO_MODE: 'true',
        LLM_API_KEY: 'sk-test',
      });
      expect(result.demoMode).toBe(true);
      expect(result.aiStatus).toBe('demo');
    });

    it('is "demo" when DEMO_MODE is true and the key is empty', () => {
      expect(parseConfig({ ...base, DEMO_MODE: 'true' }).aiStatus).toBe('demo');
    });
  });

  describe('invalid input', () => {
    it('throws on an empty env', () => {
      expect(() => parseConfig({})).toThrow();
    });

    it('throws naming SUPABASE_URL when it is missing', () => {
      const env = { ...base };
      delete env.SUPABASE_URL;
      expect(() => parseConfig(env)).toThrow(/SUPABASE_URL/);
    });

    it('throws naming SUPABASE_URL when it is not a URL', () => {
      expect(() => parseConfig({ ...base, SUPABASE_URL: 'not-a-url' })).toThrow(
        /SUPABASE_URL/,
      );
    });

    it('throws naming SUPABASE_SERVICE_KEY when it is missing or empty', () => {
      expect(() => parseConfig({ ...base, SUPABASE_SERVICE_KEY: '' })).toThrow(
        /SUPABASE_SERVICE_KEY/,
      );
      const env = { ...base };
      delete env.SUPABASE_SERVICE_KEY;
      expect(() => parseConfig(env)).toThrow(/SUPABASE_SERVICE_KEY/);
    });

    it('throws on a DEMO_MODE value other than "true" or "false"', () => {
      expect(() => parseConfig({ ...base, DEMO_MODE: 'yes' })).toThrow(
        /DEMO_MODE/,
      );
    });

    it('throws on a non-numeric PORT', () => {
      expect(() => parseConfig({ ...base, PORT: 'abc' })).toThrow(/PORT/);
    });

    it('throws on a non-positive or non-numeric AI_TIMEOUT_MS', () => {
      expect(() => parseConfig({ ...base, AI_TIMEOUT_MS: '-5' })).toThrow(
        /AI_TIMEOUT_MS/,
      );
      expect(() => parseConfig({ ...base, AI_TIMEOUT_MS: 'abc' })).toThrow(
        /AI_TIMEOUT_MS/,
      );
    });

    it('throws on an unknown LOG_LEVEL', () => {
      expect(() => parseConfig({ ...base, LOG_LEVEL: 'loud' })).toThrow(
        /LOG_LEVEL/,
      );
    });

    it('does not put secret or invalid values in the error message', () => {
      const message = messageOf({
        ...base,
        SUPABASE_URL: 'bad-url-value-123',
        SUPABASE_SERVICE_KEY: 'super-secret-service-key',
        LLM_API_KEY: 'sk-super-secret-llm',
        DEMO_MODE: 'maybe-demo-value',
      });
      expect(message).toBeTypeOf('string');
      expect(message).toMatch(/SUPABASE_URL/);
      expect(message).not.toContain('bad-url-value-123');
      expect(message).not.toContain('super-secret-service-key');
      expect(message).not.toContain('sk-super-secret-llm');
      expect(message).not.toContain('maybe-demo-value');
    });
  });
});

describe('config (built from process.env under vitest)', () => {
  it('uses the fixed test environment', () => {
    expect(config).toMatchObject({
      supabaseUrl: 'http://localhost:54321',
      supabaseServiceKey: 'test-service-key',
      allowedOrigin: 'http://localhost:5173',
      port: 3000,
      llmApiKey: '',
      demoMode: false,
      aiStatus: 'unavailable',
      aiTimeoutMs: 15000,
      logLevel: 'silent',
    });
  });
});
