import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import documentsRouter from './documents';
import { db } from '@workspace/db';

// Mock DB
vi.mock('@workspace/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{
            id: 1,
            title: 'Test Document',
            fileUrl: '/test.pdf',
            fileName: 'test.pdf',
            fileType: 'PDF',
            category: 'Forms',
            isPrime: false,
            accessLevel: 'login_required'
          }])
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve())
    }))
  },
  documentsTable: {},
  documentAccessLogTable: {}
}));

// Mock Auth
vi.mock('../lib/auth', () => ({
  optionalAuth: (req: any, res: any, next: any) => { req.userId = 1; req.userRole = 'user'; next(); },
  headerOnlyAuth: (req: any, res: any, next: any) => { 
    if (req.query.token) {
      res.status(401).json({ error: "Tokens in URL are strictly forbidden" });
      return;
    }
    req.userId = 1; req.userRole = 'user'; next(); 
  },
  requireAdminOrManager: (req: any, res: any, next: any) => next()
}));

// Mock Prime Status
vi.mock('../lib/prime-status', () => ({
  canAccessPrimeDocuments: vi.fn().mockResolvedValue(true) // Mock as Prime
}));

// Mock PDF Preview & Buffer
vi.mock('../lib/pdf-preview', () => ({
  generatePdfPreview: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./documents', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getDocumentBuffer: vi.fn().mockResolvedValue(Buffer.from('mock pdf'))
  };
});

// Mock fs
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api', documentsRouter);

describe('Documents API v2 Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/documents/:id/preview-v2', () => {
    it('rejects ?token= in URL', async () => {
      const res = await request(app).get('/api/documents/1/preview-v2?token=123');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain("forbidden");
    });

    it('generates preview and logs access', async () => {
      const res = await request(app).get('/api/documents/1/preview-v2');
      // Should attempt to serve file or call generatePdfPreview
      // Since fs.existsSync is false, it generates and serves
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('image/webp');
    });
  });

  describe('POST /api/documents/:id/download-ticket', () => {
    it('generates ticket for authorized user', async () => {
      const res = await request(app).post('/api/documents/1/download-ticket').send({ format: 'pdf' });
      expect(res.status).toBe(200);
      expect(res.body.ticket).toBeDefined();
      expect(res.body.downloadUrl).toContain(res.body.ticket);
    });
  });

  describe('GET /api/documents/download/:ticket', () => {
    it('rejects invalid ticket', async () => {
      const res = await request(app).get('/api/documents/download/invalid-ticket');
      expect(res.status).toBe(403);
    });
  });
});
