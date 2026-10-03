const fs = require('fs');

let c = fs.readFileSync('artifacts/api-server/tests/proxy.test.mjs', 'utf8');

c = c.replace(/..\\/artifacts\\/api-server\\/dist/g, '../dist');

const inject2 = `
  await t.test('Gemini Base URL handling', async () => {
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL = '';
    mock.method(db, 'getActivePrime', async () => ({ id: 1 }));
    mockResponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: "gemini empty string fallback ok" }] } }] } }];
    let { status, json } = await runChat('hi', getToken(2));
    assert.strictEqual(status, 200);
    assert.strictEqual(json.reply, 'gemini empty string fallback ok');
    assert.ok(fetchLog[0].url.startsWith('https://generativelanguage.googleapis.com'));

    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    mockResponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: "gemini unset fallback ok" }] } }] } }];
    let res2 = await runChat('hi', getToken(2));
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.json.reply, 'gemini unset fallback ok');
    assert.ok(fetchLog[0].url.startsWith('https://generativelanguage.googleapis.com'));
  });
`;

c = c.replace("await t.test('5. Backend fails", inject2 + "\n  await t.test('5. Backend fails");
fs.writeFileSync('artifacts/api-server/tests/proxy.test.mjs', c);
