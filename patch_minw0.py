import re

with open('artifacts/smit-csc-info/src/components/ai-sahayak-widget.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('flex max-w-[88%]', 'flex min-w-0 max-w-[88%]')

with open('artifacts/smit-csc-info/src/components/ai-sahayak-widget.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
