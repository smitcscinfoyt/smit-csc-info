with open('artifacts/smit-csc-info/src/components/ai-sahayak-widget.tsx', 'r', encoding='utf-8') as f:
    for line in f:
        if 'animate-spin' in line:
            print(next(f).strip().encode('utf-8'))
