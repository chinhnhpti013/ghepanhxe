# -*- coding: utf-8 -*-
"""Mọi id mà hai khối script cuối (màn hình 3 · Công cụ file và màn hình 4 · Quét
tài liệu) gọi qua $() phải thực sự được khai ở đâu đó trong index.html — kể cả các
id dựng động bằng innerHTML. Không chạy được trình duyệt thì đây là cách bắt lỗi
gõ sai tên id."""
import io, os, re, sys

IDX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'index.html')
s = io.open(IDX, encoding='utf-8').read()

blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s, re.S)
# Hai khoi cuoi: man hinh 3 (tien to tz) va man hinh 4 (tien to sc)
tzcode = blocks[-2] + "\n" + blocks[-1]

# id khai trong HTML tinh VA trong moi chuoi innerHTML cua toan bo file
declared = set(re.findall(r'\bid="([A-Za-z0-9_\-]+)"', s))
declared |= set(re.findall(r"\bid='([A-Za-z0-9_\-]+)'", s))
# id ghep tu bien, vd id="tzSpB_${k}" / 'tzSpB_' + k
prefixes = set(re.findall(r'\bid="([A-Za-z0-9_]+)\$\{', s))
prefixes |= set(re.findall(r"\$\('([A-Za-z0-9_]+)' \+ ", tzcode))
prefixes |= set(re.findall(r"\$\('([A-Za-z0-9_]+)' \+", tzcode))

used = set(re.findall(r"\$\('([A-Za-z0-9_\-]+)'\)", tzcode))
missing = sorted(i for i in used if i not in declared)

print('id duoc khai trong file     :', len(declared))
print('id man hinh 3+4 goi qua $() :', len(used))
print('tien to id ghep dong        :', sorted(prefixes))
if missing:
    print('\n!! GOI $() NHUNG KHONG CO ID:')
    for m in missing:
        ctx = [l.strip() for l in tzcode.split('\n') if "$('" + m + "')" in l][:1]
        print('   %-14s  %s' % (m, ctx[0][:90] if ctx else ''))
    sys.exit(1)
print('\nTat ca id deu ton tai.')

# nguoc lai: id nao cua man hinh 3 khai ra ma khong ai dung
tz_ids = {i for i in declared if i.startswith(('tz', 'tw', 'tg', 'tool', 'sc'))}
unused = sorted(i for i in tz_ids if ("'" + i + "'") not in tzcode and ('"' + i + '"') not in tzcode)
if unused:
    print('id khai ra nhung khong goi  :', unused)

# ham goi tu onclick trong HTML phai ton tai trong script
handlers = set(re.findall(r'on(?:click|change|input)="([A-Za-z_$][\w$]*)\(', s))
alljs = '\n'.join(blocks)
# Phai dung (?![\w$]) chu khong phai \b: dau $ la mot dinh danh hop le cua JS
# (ham $ cua chinh du an), ma \b khong nhan ra bien gioi giua '$' va dau cach,
# nen \b se bao ham $ "thieu dinh nghia" va lam ca phep kiem bao do oan.
nofn = sorted(h for h in handlers
              if not re.search(r'\b(?:function|const|let|var)\s+' + re.escape(h) + r'(?![\w$])',
                               alljs))
print('ham onclick thieu dinh nghia:', nofn if nofn else 'khong co')
sys.exit(1 if nofn else 0)
