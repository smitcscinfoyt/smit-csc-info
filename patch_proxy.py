import re

with open("artifacts/api-server/src/routes/sahayak.ts", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add let isSambaNovaDisabled = false;
content = re.sub(
    r'(const sahayakRateLimiter = createRateLimiter\(\{ windowMs: 60_000, max: 15 \}\);)',
    r'\1\n\nlet isSambaNovaDisabled = false;',
    content
)

# 2. OVERALL_DEADLINE_MS
content = re.sub(
    r'const OVERALL_DEADLINE_MS = 20000;',
    r'const OVERALL_DEADLINE_MS = 45000;',
    content
)

# 3. backend fetch timeout
content = re.sub(
    r'signal: AbortSignal\.timeout\(16000\), // backend has 22s limit, proxy waits 24s max',
    r'signal: AbortSignal.timeout(35000), // backend has 30s limit, proxy waits 35s max',
    content
)
# (In case the comment was slightly different)
content = re.sub(
    r'signal: AbortSignal\.timeout\(16000\),?.*',
    r'signal: AbortSignal.timeout(35000), // backend has 30s limit, proxy waits 35s max',
    content
)

# 4. SambaNova loop
# Wrap 'if (sambaKey) {' -> 'if (sambaKey && !isSambaNovaDisabled) {'
content = re.sub(
    r'if\s*\(\s*sambaKey\s*\)\s*\{(\s*const sambaModelsStr)',
    r'if (sambaKey && !isSambaNovaDisabled) {\1',
    content
)

# Add 402 check and break in SambaNova loop
samba_fetch_block = r'''          if (upstream.ok) {
            const json = (await upstream.json()) as any;
            const reply = (json?.choices?\.\[0\]\?\.message\?\.content as string) \?\? "";
            if (reply) {
              res.json({ reply });
              sambaSuccess = true;
              break;
            }
            logger.warn({ provider: 'sambanova', model: sambaModel, status: upstream.status, reason: 'empty_reply' }, "sahayak sambanova: empty reply");
          } else {
            logger.warn({ provider: 'sambanova', model: sambaModel, status: upstream.status, reason: 'http_error' }, "sahayak sambanova upstream non-OK");
            if (upstream.status === 404 || upstream.status === 429 || upstream.status >= 500) continue;
          }'''

samba_replacement = r'''          if (upstream.status === 402) {
            logger.warn({ provider: 'sambanova', status: upstream.status }, "sahayak sambanova is disabled (402). Skipping for future requests.");
            isSambaNovaDisabled = true;
            break;
          }

          if (upstream.ok) {
            const json = (await upstream.json()) as any;
            const reply = (json?.choices?.[0]?.message?.content as string) ?? "";
            if (reply) {
              res.json({ reply });
              sambaSuccess = true;
              break;
            }
            logger.warn({ provider: 'sambanova', model: sambaModel, status: upstream.status, reason: 'empty_reply' }, "sahayak sambanova: empty reply");
          } else {
            logger.warn({ provider: 'sambanova', model: sambaModel, status: upstream.status, reason: 'http_error' }, "sahayak sambanova upstream non-OK");
            if (upstream.status === 404 || upstream.status === 429 || upstream.status >= 500) continue;
            break;
          }'''

# Replace it
content = content.replace(samba_fetch_block, samba_replacement)

with open("artifacts/api-server/src/routes/sahayak.ts", "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied")
