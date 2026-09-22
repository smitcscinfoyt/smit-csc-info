import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Documents API Routes', () => {
  const PREVIEW_V2 = '/api/documents/1/preview-v2';
  const PREVIEW = '/api/documents/1/preview';

  describe('GET /documents/:id/preview-v2', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app).get(PREVIEW_V2);
      expect(res.status).toBe(401);
    });

    it('should reject ?token= queries', async () => {
      const res = await request(app).get(`${PREVIEW_V2}?token=fake_token`);
      expect(res.status).toBe(401);
    });
  });

  describe('Legacy Routes flag=true', () => {
    let originalFlag: string | undefined;
    beforeAll(() => {
      originalFlag = process.env.DOCS_UPGRADE_ENABLED;
      process.env.DOCS_UPGRADE_ENABLED = 'true';
    });
    afterAll(() => {
      process.env.DOCS_UPGRADE_ENABLED = originalFlag;
    });

    it('GET /preview should return 401 for logged-out users', async () => {
      const res = await request(app).get(PREVIEW);
      expect(res.status).toBe(401);
    });
  });
});
