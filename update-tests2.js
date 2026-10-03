const fs = require('fs');

let c = fs.readFileSync('artifacts/api-server/tests/proxy.test.mjs', 'utf8');

const inject2 = \`
  await t.test('Gemini Base URL handling', async () => {
    // Empty string
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL = '';
    mock.method(db, 'getActivePrime', async () => ({ id: 1 }));
    mockResponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: "gemini empty string fallback ok" }] } }] } }];
    let { status, json } = await runChat('hi', getToken(2));
    assert.strictEqual(status, 200);
    assert.strictEqual(json.reply, 'gemini empty string fallback ok');
    assert.ok(fetchLog[0].url.startsWith('https://generativelanguage.googleapis.com'));

    // Unset
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    mockResponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: "gemini unset fallback ok" }] } }] } }];
    ({ status, json } = await runChat('hi', getToken(2)));
    assert.strictEqual(status, 200);
    assert.strictEqual(json.reply, 'gemini unset fallback ok');
    assert.ok(fetchLog[0].url.startsWith('https://generativelanguage.googleapis.com'));
  });
\`;

c = c.replace("await t.test('4. Admin", inject2 + "\\n  await t.test('4. Admin");
fs.writeFileSync('artifacts/api-server/tests/proxy.test.mjs', c);
