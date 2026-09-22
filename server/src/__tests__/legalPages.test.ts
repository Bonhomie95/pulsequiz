import request from 'supertest';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

it.each(['terms', 'privacy', 'rules', 'support', 'delete-account'])(
  'serves /%s as public HTML',
  async (page) => {
    const res = await request(app).get(`/${page}`).expect(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('PulseQuiz');
  },
);

it('the official rules carry the store sponsor disclaimer', async () => {
  const res = await request(app).get('/rules').expect(200);
  expect(res.text).toMatch(/Apple Inc\. and Google LLC are not sponsors/);
  expect(res.text).toMatch(/NO PURCHASE NECESSARY/);
});
