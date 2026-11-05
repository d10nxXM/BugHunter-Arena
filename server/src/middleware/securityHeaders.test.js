import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders, SECURITY_HEADERS } from './securityHeaders.js';

describe('securityHeaders', () => {
  it('exports exactly the expected header values', () => {
    expect(SECURITY_HEADERS).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Cross-Origin-Resource-Policy': 'same-site',
    });
  });

  it('sets every header and calls next', async () => {
    const app = express();
    app.use(securityHeaders);
    app.get('/x', (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/x');
    expect(res.status).toBe(200);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers[name.toLowerCase()]).toBe(value);
    }
  });
});
