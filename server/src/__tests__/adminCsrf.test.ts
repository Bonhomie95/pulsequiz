/**
 * When the admin panel is hosted on a different site than the API, the session
 * cookie has to be SameSite=None — so a custom header takes over CSRF duty.
 * The flag is read at import time, hence the env set before app is loaded.
 */
import request from 'supertest';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  process.env.ADMIN_COOKIE_CROSS_SITE = 'true';
  process.env.FRONTEND_ORIGIN = 'https://admin.example.com';
  jest.resetModules();
  ({ default: app } = await import('../app'));
});

afterAll(() => {
  delete process.env.ADMIN_COOKIE_CROSS_SITE;
});

describe('admin CSRF header (cross-site hosting)', () => {
  it('refuses a write without the header', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'someone@example.com', password: 'whatever12345' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/header/i);
  });

  it('lets the same write through with the header', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .set('X-Admin-Request', '1')
      .send({ email: 'someone@example.com', password: 'whatever12345' });
    // Wrong credentials, but it reached the handler rather than the guard.
    expect(res.status).not.toBe(403);
  });

  it('leaves reads alone', async () => {
    const res = await request(app).get('/api/admin/questions');
    expect(res.status).toBe(401); // auth required, not CSRF-blocked
  });
});
