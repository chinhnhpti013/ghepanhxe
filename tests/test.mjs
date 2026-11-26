/* Kiểm thử phần logic của màn hình 3 ngoài trình duyệt.
   Trích khối <script> cuối của index.html rồi chạy với pdf-lib / DOM giả lập,
   nên bắt được lỗi đọc .docx/.xlsx và lỗi dựng trang mà không cần mở Chrome. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = blocks[blocks.length - 1];
if (!/MÀN HÌNH 3/.test(code)) { console.error('khong lay dung khoi script man hinh 3'); process.exit(1); }

// ───────────────────────── pdf-lib giả lập: ghi lại mọi lệnh vẽ
const log = { pages: [], text: [], rect: 0, line: 0, img: 0 };
const mkPage = (w, h) => {
  const pg = {
    _w: w, _h: h, _rot: 0,
    getSize: () => ({ width: pg._w, height: pg._h }),
    getRotation: () => ({ angle: pg._rot }),
    setRotation: d => { pg._rot = d.angle; },
    drawText: (t, o) => {
      if (typeof t !== 'string') throw new Error('drawText nhan khong phai chuoi: ' + typeof t);
      if (!isFinite(o.x) || !isFinite(o.y)) throw new Error(`drawText toa do xau x=${o.x} y=${o.y} ("${t}")`);
      if (!o.font) throw new Error('drawText thieu font: ' + t);
      if (!isFinite(o.size) || o.size <= 0) throw new Error('drawText co chu xau: ' + o.size);
      log.text.push(t);
    },
    drawRectangle: o => { if (!isFinite(o.x) || !isFinite(o.y) || !isFinite(o.width) || !isFinite(o.height))
                            throw new Error('drawRectangle toa do xau'); log.rect++; },
    drawLine: o => { if (!isFinite(o.start.x) || !isFinite(o.end.x)) throw new Error('drawLine toa do xau'); log.line++; },
    drawImage: (im, o) => { if (!im) throw new Error('drawImage khong co anh');
                            if (!isFinite(o.width) || o.width <= 0) throw new Error('drawImage be ngang xau: ' + o.width);
                            log.img++; }
  };
  return pg;
};
const mkFont = () => ({ widthOfTextAtSize: (s, sz) => String(s).length * sz * 0.5 });
const PDFLib = {
  rgb: (r, g, b) => ({ r, g, b }),
  degrees: a => ({ angle: a }),
  PDFDocument: {
    create: async () => {
      const pgs = [];
      return {
        registerFontkit() {},
        embedFont: async () => mkFont(),
        embedPng: async b => ({ width: 200, height: 120, _n: b.length }),
        embedJpg: async b => ({ width: 200, height: 120, _n: b.length }),
        addPage(sz) { const p = mkPage(sz[0], sz[1]); pgs.push(p); log.pages.push(sz); return p; },
        getPages: () => pgs,
        getPageCount: () => pgs.length,
        getPageIndices: () => pgs.map((_, i) => i),
        copyPages: async (src, idx) => idx.map(() => mkPage(595, 842)),
        save: async () => new Uint8Array(1024)
      };
    },
    load: async () => {
      const pgs = [mkPage(595, 842)];
      return { getPageCount: () => 1, getPageIndices: () => [0], getPages: () => pgs };
    }
  }
};

// ───────────────────────── các hàm toàn cục mà index.html đã có sẵn
const ctx = {
  console, Blob, Response, File, TextDecoder, TextEncoder, DecompressionStream,
  Uint8Array, DataView, Math, JSON, Date, Promise, Array, Object, String, Number,
  isFinite, parseInt, parseFloat, Error, RegExp, Set, Map, crypto,
  DOMParser,
  window: { DecompressionStream, isSecureContext: true },
  document: { createElement: () => ({ getContext: () => ({}) }), addEventListener() {} },
  PDFLib, fontkit: {},
  $: () => null,
  esc: s => String(s),
  uid: () => 'i' + Math.random().toString(36).slice(2),
  extOf: n => { const i = String(n).lastIndexOf('.'); return i < 0 ? '' : String(n).slice(i).toLowerCase(); },
  fmtBytes: b => (b / 1024).toFixed(1) + ' KB',
  loadImage: async () => { throw new Error('loadImage duoc goi (anh emf/wmf?)'); },
  saveBlob() {}, busyBtn() {}, freeBtn() {}, toast() {},
  zipStore: files => new Blob([new Uint8Array(files.reduce((s, f) => s + f.data.length, 0))]),
  loadPdfjs: async () => { throw new Error('loadPdfjs duoc goi'); },
  MM: 2.8346, A4: { w: 595, h: 842 },
  BLUE: () => PDFLib.rgb(0, 0, 1), GRAY: () => PDFLib.rgb(.5, .5, .5),
  WHITE: () => PDFLib.rgb(1, 1, 1), LGRAY: () => PDFLib.rgb(.7, .7, .7),
  BLACK: () => PDFLib.rgb(0, 0, 0), DGRAY: () => PDFLib.rgb(.3, .3, .3),
  state: { step: 3 }, updateActionBar() {},
  fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'man-hinh-3.js' });

// ───────────────────────── chạy thử
const fileOf = p => {
  const b = fs.readFileSync(p);
  return new File([b], path.basename(p));
};
let fail = 0, skipped = 0;
const ok   = (m, d) => console.log('  \u2713 ' + m + (d ? '  \u2014 ' + d : ''));
const bad  = (m, e) => { fail++; console.log('  \u2717 ' + m + '\n      ' + (e && e.stack || e)); };
/* docs/*.docx|xlsx|pdf bi gitignore (tai lieu noi bo), nen ban clone tu GitHub
   khong co. Thieu file mau la BO QUA, khong phai loi code. */
const skip = (m, f) => { skipped++; console.log('  \u2013 ' + m + '  (bo qua: khong co ' + f + ')'); };
const fixture = rel => { const p = path.join(ROOT, rel); return fs.existsSync(p) ? p : null; };

console.log('\n== tien ich ==');
try {
  const T = ctx;
  // khai bang const/let o top-level KHONG thanh thuoc tinh cua global object,
  // phai eval trong chinh context do (giong mot <script> khac trong cung trang)
  const ev = e => vm.runInContext(e, ctx);
  const eq = (a, b, m) => { if (String(a) !== String(b)) throw new Error(`${m}: ra "${a}", can "${b}"`); };
  eq(T.tzColIdx('A1'), 0, 'tzColIdx A1');
  eq(T.tzColIdx('B3'), 1, 'tzColIdx B3');
  eq(T.tzColIdx('Z9'), 25, 'tzColIdx Z9');
  eq(T.tzColIdx('AA1'), 26, 'tzColIdx AA1');
  eq(T.tzColIdx('BC12'), 54, 'tzColIdx BC12');
  eq(T.tzSerialDate(45000), '15/03/2023', 'tzSerialDate 45000');
  eq(T.tzSerialDate(44927), '01/01/2023', 'tzSerialDate 44927');
  eq(T.tzSerialDate(45000.5), '15/03/2023 12:00', 'tzSerialDate co gio');
  eq(T.tzSerialDate(1), '01/01/1900', 'tzSerialDate 1');
  eq(T.tzNumFmt(3), '3', 'tzNumFmt 3');
  eq(T.tzNumFmt(0.1 + 0.2), '0.3', 'tzNumFmt 0.3');
  eq(JSON.stringify(T.tzRanges('1-3, 5, 8-10', 9)), '[{"a":1,"b":3},{"a":5,"b":5},{"a":8,"b":9}]', 'tzRanges');
  eq(JSON.stringify(T.tzRanges('7-2', 9)), '[{"a":2,"b":7}]', 'tzRanges nguoc');
  eq(JSON.stringify(T.tzRanges('abc, 99', 9)), '[]', 'tzRanges rac bi bo');
  eq(JSON.stringify(T.tzRanges('8-99', 9)), '[{"a":8,"b":9}]', 'tzRanges kep ve total');
  eq(T.tzClean('A\u0000B\tC\u4e2d\ud83d\ude00'), 'AB    C', 'tzClean');
  eq(ev("tzSafe('a/b:c*d')"), 'a b c d', 'tzSafe');
  eq(ev("tzBase('x.y.docx')"), 'x.y', 'tzBase');
  eq(ev("tzEllip({widthOfTextAtSize:(s,z)=>s.length*z},'abcdefghij',10,45)"), 'abc…', 'tzEllip');
  eq(ev("Object.keys(TOOLS).length"), '11', 'so cong cu');
  eq(ev("Object.keys(TOOLS).every(k=>typeof TOOLS[k].run==='function')"), 'true', 'moi cong cu co run()');
  ok('tzColIdx / tzSerialDate / tzNumFmt / tzRanges / tzClean / tzSafe');
} catch (e) { bad('tien ich', e); }

console.log('\n== doc ZIP (DecompressionStream) ==');
const zipSrc = fixture('docs/tao-anh.docx');
if (!zipSrc) skip('doc ZIP', 'docs/tao-anh.docx');
else try {
  const u8 = new Uint8Array(fs.readFileSync(zipSrc));
  const zip = ctx.tzUnzip(u8);
  const must = ['word/document.xml', '[Content_Types].xml'];
  for (const m of must) if (!zip.has(m)) throw new Error('thieu muc ' + m);
  const xml = await ctx.tzZXml(zip, 'word/document.xml');
  if (!xml || !xml.documentElement) throw new Error('khong parse duoc document.xml');
  ok('tzUnzip + tzInflate + tzZXml', `${zip.size} muc trong zip`);
} catch (e) { bad('doc ZIP', e); }

console.log('\n== Word -> PDF ==');
for (const f of ['docs/tao-anh.docx', 'docs/Bo cuc ghep anh.docx',
                 'docs/BM.PTI.CG.02.08a Bien ban giam dinh.docx',
                 'docs/HD sử dụng Ghép ảnh GĐ.docx']) {
  const p = fixture(f);
  if (!p) { skip(path.basename(f), f); continue; }
  log.pages = []; log.text = []; log.rect = 0; log.img = 0;
  try {
    const bytes = await ctx.tzDocxToPdf(fileOf(p), { size: 'doc', sz: 0, withImg: true }, () => {});
    if (!log.pages.length) throw new Error('khong ra trang nao');
    if (!log.text.length)  throw new Error('khong ve chu nao');
    const joined = log.text.join(' ');
    ok(path.basename(f), `${log.pages.length} trang, ${log.text.length} doan chu, `
       + `${log.rect} o bang, ${log.img} anh, trang dau ${log.pages[0].map(x => x.toFixed(0)).join('x')}pt`);
    if (/[\u0000-\u0008]/.test(joined)) bad(f + ': con ky tu dieu khien trong chu');
  } catch (e) { bad(f, e); }
}

console.log('\n== Excel -> PDF ==');
for (const f of ['docs/thong_tin_giam_dinh_xe.xlsx', 'input/Bao_gia.xlsx']) {
  const p = fixture(f);
  if (!p) { skip(path.basename(f), f); continue; }
  log.pages = []; log.text = []; log.rect = 0;
  try {
    const c = await ctx.tzXlsxOpen(fileOf(p));
    const doc = await PDFLib.PDFDocument.create();
    const F = { reg: mkFont(), bold: mkFont() };
    let rows = 0, cells = 0;
    for (const sh of c.sheets) {
      const s = await ctx.tzXlsxSheet(c, sh);
      rows += s.rows.length;
      cells += s.rows.reduce((t, r) => t + r.filter(x => x).length, 0);
      ctx.tzXlsxDraw(doc, F, s, { land: true, sz: 9, fit: true, head: true, grid: true });
    }
    if (!log.pages.length) throw new Error('khong ra trang nao');
    ok(path.basename(f), `${c.sheets.length} sheet, ${rows} hang, ${cells} o co du lieu, `
       + `${log.pages.length} trang, ${log.text.length} doan chu`);
    const sample = log.text.filter(t => t.trim()).slice(0, 6).join(' | ');
    console.log('      chu mau: ' + sample.slice(0, 160));
  } catch (e) { bad(f, e); }
}

const tail = skipped ? ` (${skipped} muc bo qua vi thieu file mau)` : '';
console.log(fail ? `\n${fail} muc KHONG DAT${tail}\n` : `\nTat ca cac muc dat.${tail}\n`);
process.exit(fail ? 1 : 0);
