# -*- coding: utf-8 -*-
"""Trích các khối <script> nội tuyến của index.html ra file rời để node --check,
và báo tên khai báo top-level bị trùng giữa các khối (các <script> cổ điển dùng
chung một phạm vi toàn cục nên khai lại là lỗi)."""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
IDX = os.path.join(os.path.dirname(HERE), 'index.html')
OUT = os.path.join(HERE, '.out', 'blocks')
os.makedirs(OUT, exist_ok=True)
s = io.open(IDX, encoding='utf-8').read()

blocks = []
for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s, re.S):
    line = s.count('\n', 0, m.start(1)) + 1
    blocks.append((line, m.group(1)))

print('so khoi script noi tuyen:', len(blocks))
decl = {}
dup = []
for i, (line, code) in enumerate(blocks):
    p = os.path.join(OUT, 'b%02d.js' % i)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(code)
    print('  b%02d.js  dong %d  %d ky tu' % (i, line, len(code)))
    for dm in re.finditer(r'^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)',
                          code, re.M):
        name = dm.group(1)
        if name in decl and decl[name] != i:
            dup.append((name, decl[name], i))
        decl.setdefault(name, i)

if dup:
    print('\n!! TEN KHAI BAO TRUNG giua cac khoi script:')
    for n, a, b in dup:
        print('   %-22s b%02d <-> b%02d' % (n, a, b))
    sys.exit(1)
print('\nkhong co ten top-level trung giua cac khoi.')
