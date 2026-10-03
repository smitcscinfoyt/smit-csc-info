import os

with open("artifacts/api-server/src/routes/sahayak.ts", "r", encoding="utf-8") as f:
    ts = f.read()

ts = ts.replace("catch (err) {", "catch (err: any) {")

with open("artifacts/api-server/src/routes/sahayak.ts", "w", encoding="utf-8") as f:
    f.write(ts)
