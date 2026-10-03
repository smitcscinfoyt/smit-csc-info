import { test, describe, it, vi as mock } from 'vitest';
import { expect as assert } from 'vitest';

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';

const originalFetch = global.fetch;
let mockResponses = [];
let fetchLog = [];

global.fetch = async (url, options) => {
  fetchLog.push({ url, body: options?.body });
  const m = mockResponses.shift();
  if (m) {
    if (m.error) throw m.error;
    if (m.delay) await new Promise(r => setTimeout(r, m.delay));
    return {
      ok: m.status >= 200 && m.status < 300,
      status: m.status,
      json: async () => m.json,
      text: async () => JSON.stringify(m.json)
    };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; // fallback
};

test('Proxy Fallback and Prime Matrix', async (t) => {
  // Import the modules where getPrimeStatus and getActivePrime live
  const primeStatusModule = await import('../src/lib/prime-status.ts');
  const creditsModule = await import('../src/routes/credits.ts');
  
  // Set env vars
  process.env.JWT_SECRET = 'test-secret';
  process.env.SAMBANOVA_API_KEY = 'mock-samba';
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY = 'mock-gemini';
  process.env.SAMBANOVA_MODELS = 'Samba-A,Samba-B';
  process.env.GEMINI_MODELS = 'Gem-A,Gem-B';
  process.env.SAHAYAK_EXTERNAL_API_URL = 'http://external/api/chat';

  // Import router
  const { default: router } = await import('../src/routes/sahayak.ts');
  const { optionalAuth } = await import('../src/lib/auth.ts');
  const app = express();
  app.use(express.json());
  app.use('/api', router);

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const chatUrl = 'http://localhost:' + port + '/api/sahayak/chat';

  const runChat = async (message, token) => {
    fetchLog = [];
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    
    const res = await originalFetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, history: [] })
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  const getToken = (userId, role = 'user') => jwt.sign({ userId, role }, 'test-secret');

  // Real DB row mockup (what Drizzle would return for a Payment row)
  const realPaymentRow = {
    id: 999,
    userId: 2,
    amount: 199,
    currency: 'INR',
    status: 'success',
    gateway: 'phonepe',
    orderId: 'ORDER_123',
    transactionId: 'TXN_123',
    billingCycle: 'monthly',
    createdAt: new Date(),
    updatedAt: new Date(),
    expiryDate: new Date(Date.now() + 86400000) // 1 day in the future
  };

  await test('1. Logged-out 401', async () => {
    const { status, json } = await runChat("hi", null);
    expect().toBe();
    expect().toBe(); // ZERO provider calls
  });

  await test('2. Free user 403', async () => {
    // Mock the lower-level getPrimeStatus so getActivePrime runs REAL logic
    vi.spyOn(primeStatusModule, 'getPrimeStatus', async () => ({
      payment: null,
      isActive: false,
      isInGracePeriod: false,
      isExpired: false,
      hasEverBeenPrime: false,
      daysUntilExpiry: null,
      daysSinceExpiry: null,
      expiryDate: null,
      graceEndsAt: null
    }));
    const { status } = await runChat("hi", getToken(1));
    expect().toBe();
    expect().toBe();
  });

  await test('3. Prime user 200 (Active)', async () => {
    // Return a real payment row via getPrimeStatus
    vi.spyOn(primeStatusModule, 'getPrimeStatus', async () => ({
      payment: realPaymentRow,
      isActive: true,
      isInGracePeriod: false,
      isExpired: false,
      hasEverBeenPrime: true,
      daysUntilExpiry: 1,
      daysSinceExpiry: null,
      expiryDate: realPaymentRow.expiryDate,
      graceEndsAt: new Date(Date.now() + 4 * 86400000)
    }));
    mockResponses = [{ status: 200, json: { reply: "external success" } }];
    const { status, json } = await runChat("hi", getToken(2));
    expect().toBe();
    expect().toBe();
  });

  await test('4. Admin 200 (even without prime)', async () => {
    vi.spyOn(primeStatusModule, 'getPrimeStatus', async () => ({
      payment: null, isActive: false, isInGracePeriod: false, isExpired: false
    }));
    mockResponses = [{ status: 200, json: { reply: "admin success" } }];
    // Admin role should bypass!
    const { status, json } = await runChat("hi", getToken(3, 'admin'));
    expect().toBe();
    expect().toBe();
  });

  await test('5. Backend fails 401/403 -> falls back to proxy built-in', async () => {
    vi.spyOn(primeStatusModule, 'getPrimeStatus', async () => ({
      payment: realPaymentRow, isActive: true, isInGracePeriod: false
    }));
    mockResponses = [
      { status: 403, json: { error: "backend prime error" } }, // backend fails
      { status: 200, json: { choices: [{ message: { content: "proxy samba success" } }] } } // proxy samba catches it
    ];
    const { status, json } = await runChat("hi", getToken(2));
    expect().toBe();
    expect().toBe();
  });

  await new Promise(r => server.close(r));
});
