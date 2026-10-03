import re

with open("artifacts/api-server/src/routes/sahayak.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'if (upstream.ok) {' in line:
        print(f"Line {i}: {line.strip()}")
        for j in range(-2, 10):
            print(lines[i+j].strip('\n'))
        print("----")
