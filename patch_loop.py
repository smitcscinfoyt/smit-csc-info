import re

with open("artifacts/api-server/src/routes/sahayak.ts", "r", encoding="utf-8") as f:
    content = f.read()

samba_fetch_block = r'''          if (upstream.ok) {
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

if samba_fetch_block in content:
    content = content.replace(samba_fetch_block, samba_replacement)
    with open("artifacts/api-server/src/routes/sahayak.ts", "w", encoding="utf-8") as f:
        f.write(content)
    print("Loop replaced")
else:
    print("Block not found!")
