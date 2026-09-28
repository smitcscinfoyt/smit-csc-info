import test, { mock } from 'node:test';
import assert from 'node:assert';
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
  const { execSync } = await import('child_process');
  execSync('npx tsc -p artifacts/api-server/tsconfig.json');

  const db = await import('../artifacts/api-server/dist/lib/db.js');
  
  // Set env vars
  process.env.JWT_SECRET = 'test-secret';
  process.env.SAMBANOVA_API_KEY = 'mock-samba';
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY = 'mock-gemini';
  process.env.SAMBANOVA_MODELS = 'Samba-A,Samba-B';
  process.env.GEMINI_MODELS = 'Gem-A,Gem-B';
  process.env.SAHAYAK_EXTERNAL_API_URL = 'http://external/api/chat';

  // Import router
  const { default: router } = await import('../artifacts/api-server/dist/routes/sahayak.js');
  const { optionalAuth } = await import('../artifacts/api-server/dist/lib/auth.js');
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

  await t.test('1. Logged-out 401', async () => {
    const { status, json } = await runChat("hi", null);
    assert.strictEqual(status, 401);
    assert.ok(json.error.includes("લોગ ઇન કરો"));
    assert.strictEqual(fetchLog.length, 0); // ZERO provider calls
  });

  await t.test('2. Free user 403', async () => {
    mock.method(db, 'getActivePrime', async () => null);
    const { status, json } = await runChat("hi", getToken(1));
    assert.strictEqual(status, 403);
    assert.ok(json.error.includes("Prime મેમ્બર્સ માટે છે"));
    assert.strictEqual(fetchLog.length, 0);
  });

  await t.test('3. Prime user 200', async () => {
    mock.method(db, 'getActivePrime', async () => ({ id: 1, userId: 2, status: 'active' }));
    mockResponses = [
      { status: 200, json: { reply: "external success" } } // external mock
    ];
    const { status, json } = await runChat("hi", getToken(2));
    assert.strictEqual(status, 200);
    assert.strictEqual(json.reply, "external success");
  });

  await t.test('4. Admin 200 (even without prime)', async () => {
    mock.method(db, 'getActivePrime', async () => null);
    mockResponses = [
      { status: 200, json: { reply: "admin success" } }
    ];
    const { status, json } = await runChat("hi", getToken(3, 'admin'));
    assert.strictEqual(status, 200);
    assert.strictEqual(json.reply, "admin success");
  });

  await t.test('5. Backend fails 401/403 -> falls back to proxy built-in', async () => {
    mock.method(db, 'getActivePrime', async () => ({ id: 1 }));
    mockResponses = [
      { status: 403, json: { error: "backend prime error" } }, // backend fails
      { status: 200, json: { choices: [{ message: { content: "proxy samba success" } }] } } // proxy samba catches it
    ];
    const { status, json } = await runChat("hi", getToken(2));
    assert.strictEqual(status, 200);
    assert.strictEqual(json.reply, "proxy samba success");
  });

  await t.test('6. All proxy providers fail -> Gujarati offline message', async () => {
    mock.method(db, 'getActivePrime', async () => ({ id: 1 }));
    mockResponses = [
      { status: 500, json: {} }, // backend
      { status: 500, json: {} }, // samba a
      { status: 500, json: {} }, // samba b
      { status: 500, json: {} }, // gemini a
      { status: 500, json: {} }  // gemini b
    ];
    const { status, json } = await runChat("contact info", getToken(2));
    assert.strictEqual(status, 200);
    assert.ok(json.reply.includes("SAGAR Kindarakhediya — Smit CSC Info:"));
    assert.ok(!json.reply.includes("Helpline")); // CSC Helpline removed
  });

  await new Promise(r => server.close(r));
});
