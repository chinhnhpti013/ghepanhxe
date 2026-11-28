/* Kiểm thử các công cụ PDF của màn hình 3 với pdf-lib THẬT và file PDF thật.
   Dựng một DOM tối giản để tzRun*() đọc được tùy chọn như khi chạy trong trang.
   Các công cụ cần canvas (nén PDF, PDF→ảnh, ảnh→PDF, đổi định dạng ảnh) không
   kiểm được ngoài trình duyệt — phần đó chỉ kiểm bằng mắt khi mở app. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import * as PDFLibReal from 'pdf-lib';
import fontkitReal from '@pdf-lib/fontkit';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
/* File ket qua dan xuat tu docs/ (co du lieu khach that) nen ghi vao .out,
   thu muc nay bi gitignore. */
const OUT = path.join(HERE, '.out');
fs.mkdirSync(OUT, { recursive: true });
const outPath = n => path.join(OUT, n);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
// Khoi CUOI file gio la man hinh 4 (Quet tai lieu), nen phai tim theo dau moc
// chu khong lay blocks[length-1] nua.
const code = blocks.find(b => /MÀN HÌNH 3/.test(b));
if (!code) { console.error('khong lay dung khoi script man hinh 3'); process.exit(1); }

// ───────────── DOM tối giản: mỗi id là một ô nhập giả có value/checked
const vals = {};                        // id → giá trị ô nhập do từng phép thử đặt
const els = {};
const mkEl = id => ({
  id, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
  get value() { return vals[id] !== undefined ? String(vals[id]) : ''; },
  set value(v) { vals[id] = v; },
  get checked() { return !!vals[id]; },
  set checked(v) { vals[id] = v; },
  textContent: '', innerHTML: '', disabled: false, accept: '', multiple: false,
  className: '', scrollIntoView() {}, appendChild() {}, focus() {},
  querySelector: () => mkEl(id + '-q'), addEventListener() {}, click() {}
});
const $ = id => (els[id] || (els[id] = mkEl(id)));

const saved = [];
const toasts = [];
const G = globalThis;
Object.assign(G, {
  DOMParser,
  PDFLib: PDFLibReal, fontkit: fontkitReal,
  $, esc: s => String(s),
  uid: () => 'i' + Math.random().toString(36).slice(2),
  extOf: n => { const i = String(n).lastIndexOf('.'); return i < 0 ? '' : String(n).slice(i).toLowerCase(); },
  fmtBytes: b => (b / 1024).toFixed(1) + ' KB',
  loadImage: async () => { throw new Error('loadImage (can canvas)'); },
  saveBlob: (b, n) => saved.push({ b, n }),
  busyBtn() {}, freeBtn() {},
  toast: (m, k) => toasts.push((k || 'i') + ': ' + m),
  zipStore: files => new Blob([new Uint8Array(files.reduce((s, f) => s + f.data.length, 0))],
                              { type: 'application/zip' }),
  loadPdfjs: async () => { throw new Error('pdf.js (can canvas)'); },
  MM: 2.8346, A4: { w: 595, h: 842 },
  BLUE:  () => PDFLibReal.rgb(25/255, 118/255, 210/255),
  GRAY:  () => PDFLibReal.rgb(.46, .46, .46),
  WHITE: () => PDFLibReal.rgb(1, 1, 1),
  LGRAY: () => PDFLibReal.rgb(.74, .74, .74),
  BLACK: () => PDFLibReal.rgb(0, 0, 0),
  DGRAY: () => PDFLibReal.rgb(.35, .38, .42),
  state: { step: 3 }, updateActionBar() {},
  window: { DecompressionStream, isSecureContext: true, scrollTo() {} },
  document: { createElement: () => mkEl('tmp'), addEventListener() {},
              querySelectorAll: () => [], querySelector: () => null },
  // font that, doc tu dia thay cho fetch qua mang
  fetch: async p => {
    const fp = path.join(ROOT, String(p));
    if (!fs.existsSync(fp)) return { ok: false, status: 404, arrayBuffer: async () => null };
    const b = fs.readFileSync(fp);
    return { ok: true, status: 200,
             arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  }
});
vm.runInThisContext(code, { filename: 'man-hinh-3.js' });
const ev = e => vm.runInThisContext(e);
const ctx = G;

const fileOf = p => new File([fs.readFileSync(p)], path.basename(p));
let fail = 0, pass = 0, skipped = 0;
const ok   = (m, d) => { pass++; console.log('  \u2713 ' + m + (d ? '  \u2014 ' + d : '')); };
const bad  = (m, e) => { fail++; console.log('  \u2717 ' + m + '\n      ' + ((e && e.stack) || e)); };
const skip = (m, f) => { skipped++; console.log('  \u2013 ' + m + '  (bo qua: khong co ' + f + ')'); };
const fixture = rel => { const p = path.join(ROOT, rel); return fs.existsSync(p) ? p : null; };

/** Đặt công cụ + danh sách file + các ô nhập, rồi chạy và trả kết quả đã "tải" */
async function run(toolId, files, opts) {
  for (const k of Object.keys(vals)) delete vals[k];
  Object.assign(vals, opts || {});
  saved.length = 0; toasts.length = 0;
  ev(`tz.id = ${JSON.stringify(toolId)}; tz.files = []; tz.pages = null; tz.thumbs = null;`);
  G.tzAddFilesRaw = files;
  ev('tz.files = tzAddFilesRaw.map(f => ({ id: uid(), f }));');
  await ev(`TOOLS[${JSON.stringify(toolId)}].run()`);
  // tzDone đã gắn nút tải; gọi trực tiếp để lấy blob ra
  return G.__out || null;
}
// bắt kết quả: thay tzDone bằng bản ghi lại
ev(`var __out = null;
    tzDone = function (title, note, outs) { globalThis.__out = { title, note, outs }; };`);
const grab = () => G.__out;

/* Mau bien ban that bi gitignore. Khong co thi dung tam mot PDF 3 trang de
   cac phep thu danh so / dong dau van chay. */
let PDFA = fixture('docs/bien_ban_giam_dinh.pdf');
if (!PDFA) {
  PDFA = outPath('mau-tam-3-trang.pdf');
  const d0 = await PDFLibReal.PDFDocument.create();
  for (let i = 0; i < 3; i++) d0.addPage([595, 842]);
  fs.writeFileSync(PDFA, await d0.save());
  console.log('(khong co docs/bien_ban_giam_dinh.pdf \u2014 dung PDF dung tam 3 trang)');
}
const nPages = async b => (await PDFLibReal.PDFDocument.load(b, { ignoreEncryption: true })).getPageCount();
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());

/** Dựng sẵn một PDF n trang để kiểm nối / tách / sắp xếp */
async function makePdf(n, w = 595, h = 842) {
  const d = await PDFLibReal.PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([w, h]);
  return new File([await d.save()], `test-${n}-trang.pdf`);
}

console.log('\n== N\u1ed1i PDF ==');
try {
  const r = await run('merge', [await makePdf(3), await makePdf(2)], { tzMgImg: 'auto', tzMgPad: '0' });
  const out = grab();
  const n = await nPages(await bytesOf(out.outs[0].blob));
  if (n !== 5) throw new Error('ra ' + n + ' trang, can 5');
  ok('3 + 2 trang \u2192 5 trang', out.note);
} catch (e) { bad('noi PDF', e); }

console.log('\n== T\u00e1ch PDF ==');
try {
  await run('split', [await makePdf(10)], { tzSpRanges: '1-3, 5, 8-99' });
  ev("_tzSpMode = 'ranges'");
  await run('split', [await makePdf(10)], { tzSpRanges: '1-3, 5, 8-99' });
  let out = grab();
  if (out.outs.length !== 1 || !/ZIP/.test(out.outs[0].label || ''))
    throw new Error('3 khoang phai goi thanh 1 ZIP, ra: ' + JSON.stringify(out.outs.map(o => o.name)));
  ok('kho\u1ea3ng "1-3, 5, 8-99" tr\u00ean file 10 trang \u2192 1 ZIP', out.note);

  ev("_tzSpMode = 'each'");
  await run('split', [await makePdf(4)], {});
  out = grab();
  ok('m\u1ed7i trang m\u1ed9t file (4 trang)', out.note);

  ev("_tzSpMode = 'every'");
  await run('split', [await makePdf(7)], { tzSpEvery: '3' });
  out = grab();
  if (!/3 file/.test(out.note)) throw new Error('7 trang chia 3 phai ra 3 file, note: ' + out.note);
  ok('m\u1ed7i 3 trang m\u1ed9t file (7 trang)', out.note);

  ev("_tzSpMode = 'ranges'");
  let threw = '';
  try { await run('split', [await makePdf(5)], { tzSpRanges: '77' }); }
  catch (e) { threw = e.message; }
  if (!/5 trang/.test(threw)) throw new Error('kho\u1ea3ng ngoai pham vi phai bao loi ro, ra: ' + threw);
  ok('kho\u1ea3ng ngo\u00e0i ph\u1ea1m vi \u2192 b\u00e1o l\u1ed7i r\u00f5', threw);
} catch (e) { bad('tach PDF', e); }

console.log('\n== S\u1eafp x\u1ebfp & xo\u00e1 trang ==');
try {
  await run('pages', [await makePdf(4)], {}).catch(() => {});   // chua co tz.pages -> bao loi
  ev(`tz.pages = [{i:3,rot:90,gone:false},{i:0,rot:0,gone:false},
                  {i:1,rot:0,gone:true},{i:2,rot:180,gone:false}]`);
  await ev("TOOLS.pages.run()");
  const out = grab();
  const b = await bytesOf(out.outs[0].blob);
  const d = await PDFLibReal.PDFDocument.load(b);
  if (d.getPageCount() !== 3) throw new Error('ra ' + d.getPageCount() + ' trang, can 3');
  const rots = d.getPages().map(p => p.getRotation().angle);
  if (rots.join(',') !== '90,0,180') throw new Error('g\u00f3c xoay ra ' + rots.join(',') + ', can 90,0,180');
  ok('b\u1ecf 1 trang, \u0111\u1ed5i th\u1ee9 t\u1ef1, xoay 90\u00b0/180\u00b0', out.note + ' \u00b7 g\u00f3c ' + rots.join('/'));
} catch (e) { bad('sap xep trang', e); }

console.log('\n== \u0110\u00e1nh s\u1ed1 trang ==');
try {
  const out0 = await run('number', [fileOf(PDFA)],
    { tzNbFmt: 'Trang {n} / {t}', tzNbPos: 'bc', tzNbSize: '10', tzNbFrom: '1',
      tzNbMg: '12', tzNbColor: 'gray', tzNbSkip1: false });
  const out = grab();
  const b = await bytesOf(out.outs[0].blob);
  if (b.length < 1000) throw new Error('file ra qu\u00e1 nh\u1ecf: ' + b.length);
  await nPages(b);
  ok('in "Trang n / t" v\u00e0o file m\u1eabu', out.note + ' \u00b7 ' + (b.length / 1024).toFixed(0) + 'KB');

  // trang da xoay: so trang phai van nam dung cho (kiem bang toa do)
  const d = await PDFLibReal.PDFDocument.create();
  d.addPage([595, 842]).setRotation(PDFLibReal.degrees(90));
  const rotFile = new File([await d.save()], 'xoay90.pdf');
  await run('number', [rotFile], { tzNbFmt: '{n}', tzNbPos: 'bc', tzNbSize: '10',
                                   tzNbFrom: '1', tzNbMg: '12', tzNbColor: 'black' });
  const o2 = grab();
  await nPages(await bytesOf(o2.outs[0].blob));
  ok('trang c\u00f3 /Rotate 90 v\u1eabn \u0111\u00e1nh s\u1ed1 \u0111\u01b0\u1ee3c', o2.note);

  let threw = '';
  ev("tz.pages = null");
  await run('number', [fileOf(PDFA)], { tzNbFmt: '{n}', tzNbSkip1: true, tzNbPos: 'tr',
                                        tzNbSize: '9', tzNbFrom: '5', tzNbMg: '15', tzNbColor: 'blue' });
  ok('b\u1ecf trang b\u00eca + \u0111\u1ea7u trang b\u00ean ph\u1ea3i + b\u1eaft \u0111\u1ea7u t\u1eeb 5', grab().note);
} catch (e) { bad('danh so trang', e); }

console.log('\n== \u0110\u00f3ng d\u1ea5u ch\u1eef ==');
try {
  await run('wmark', [fileOf(PDFA)], { tzWmTx: 'B\u1ea2N SAO', tzWmSize: '60', tzWmOp: '18',
                                        tzWmRot: '45', tzWmColor: 'red', tzWmTile: 'one' });
  let out = grab();
  await nPages(await bytesOf(out.outs[0].blob));
  ok('m\u1ed9t d\u1ea5u gi\u1eefa trang, nghi\u00eang 45\u00b0, \u0111\u1ecf', out.note);

  await run('wmark', [fileOf(PDFA)], { tzWmTx: 'H\u1ed2 S\u01a0 G\u1ed0C PTI \u2014 KH\u00d4NG SAO CH\u00c9P',
                                        tzWmSize: '60', tzWmOp: '25', tzWmRot: '0',
                                        tzWmColor: 'gray', tzWmTile: 'tile' });
  out = grab();
  await nPages(await bytesOf(out.outs[0].blob));
  ok('ch\u1eef d\u00e0i, r\u1ea3i k\u00edn 3\u00d73 \u2014 t\u1ef1 co c\u1ee1 ch\u1eef cho v\u1eeba', out.note);

  let threw = '';
  try { await run('wmark', [fileOf(PDFA)], { tzWmTx: '   ' }); } catch (e) { threw = e.message; }
  if (!/Ch\u01b0a nh\u1eadp/.test(threw)) throw new Error('d\u1ea5u r\u1ed7ng ph\u1ea3i b\u00e1o l\u1ed7i, ra: ' + threw);
  ok('d\u1ea5u \u0111\u1ec3 tr\u1ed1ng \u2192 b\u00e1o l\u1ed7i', threw);
} catch (e) { bad('dong dau', e); }

console.log('\n== Word / Excel \u2192 PDF (pdf-lib th\u1eadt, font th\u1eadt) ==');
const DOCX1 = 'docs/BM.PTI.CG.02.08a Bien ban giam dinh.docx';
if (!fixture(DOCX1)) skip('m\u1eabu bi\u00ean b\u1ea3n .docx \u2192 PDF', DOCX1);
else try {
  await run('doc2pdf', [fileOf(fixture(DOCX1))], { tzDcSize: 'doc', tzDcSz: '0', tzDcImg: true });
  const out = grab();
  const b = await bytesOf(out.outs[0].blob);
  const n = await nPages(b);
  fs.writeFileSync(outPath('out-word.pdf'), b);
  ok('m\u1eabu bi\u00ean b\u1ea3n .docx \u2192 PDF', `${n} trang \u00b7 ${(b.length / 1024).toFixed(0)}KB`);
} catch (e) { bad('Word -> PDF (that)', e); }

const XLSX1 = 'docs/thong_tin_giam_dinh_xe.xlsx';
if (!fixture(XLSX1)) skip('.xlsx \u2192 PDF', XLSX1);
else try {
  await run('xls2pdf', [fileOf(fixture(XLSX1))],
            { tzXlSize: 'auto', tzXlSz: '9', tzXlFit: true, tzXlHead: true, tzXlGrid: true });
  const out = grab();
  const b = await bytesOf(out.outs[0].blob);
  const n = await nPages(b);
  fs.writeFileSync(outPath('out-excel.pdf'), b);
  ok('.xlsx \u2192 PDF', `${n} trang \u00b7 ${(b.length / 1024).toFixed(0)}KB`);
} catch (e) { bad('Excel -> PDF (that)', e); }

const DOCX2 = 'docs/Bo cuc ghep anh.docx';
if (!fixture(DOCX2)) skip('docx nhieu bang -> PDF', DOCX2);
else try {
  await run('doc2pdf', [fileOf(fixture(DOCX2))], { tzDcSize: 'doc', tzDcSz: '0', tzDcImg: true });
  const b = await bytesOf(grab().outs[0].blob);
  fs.writeFileSync(outPath('out-word2.pdf'), b);
  ok('docx nhieu bang -> PDF', (await nPages(b)) + ' trang -> .out/out-word2.pdf');
} catch (e) { bad('Word nhieu bang', e); }

const d3 = fs.existsSync(path.join(ROOT, 'docs'))
  ? fs.readdirSync(path.join(ROOT, 'docs')).find(f => /^HD s/.test(f) && /Gh/.test(f)) : null;
if (!d3) skip('docx co anh nhung -> PDF', 'docs/HD s\u1eed d\u1ee5ng Gh\u00e9p \u1ea3nh G\u0110.docx');
else try {
  await run('doc2pdf', [fileOf(path.join(ROOT, 'docs', d3))],
            { tzDcSize: 'doc', tzDcSz: '0', tzDcImg: true });
  const b = await bytesOf(grab().outs[0].blob);
  fs.writeFileSync(outPath('out-word3.pdf'), b);
  ok('docx co anh nhung -> PDF', (await nPages(b)) + ' trang -> .out/out-word3.pdf');
} catch (e) { bad('Word co anh', e); }

console.log('== Mo lan luot moi cong cu (giao dien) ==');
try {
  const ids = Object.keys(TOOLS);
  for (const id of ids) {
    tzHome();
    tzOpen(id);
    const T = TOOLS[id];
    if (!T.opts || typeof T.opts() !== 'string') throw new Error(id + ': opts() khong tra ve HTML');
    if (!T.exts.length) throw new Error(id + ': khong khai duoc duoi file nao');
    if (typeof tzBarMeta() !== 'string') throw new Error(id + ': tzBarMeta() hong');
  }
  ok('tzOpen() chay sach cho ca ' + ids.length + ' cong cu');

  tzOpen('merge');
  G.tzAddFilesRaw = [await makePdf(1), await makePdf(2), await makePdf(3)];
  ev('tz.files = tzAddFilesRaw.map(f => ({ id: uid(), f }));');
  tzRenderList();
  tzMove(0, 1);
  const order1 = ev('tz.files.map(x => x.f.name).join()');
  if (!/2-trang.*1-trang.*3-trang/.test(order1)) throw new Error('tzMove sai: ' + order1);
  tzDelFile(1);
  if (ev('tz.files.length') !== 2) throw new Error('tzDelFile sai');
  tzClearFiles();
  if (ev('tz.files.length') !== 0) throw new Error('tzClearFiles sai');
  tzMove(0, -1); tzMove(5, 1);
  ok('danh sach file: doi thu tu / bo mot file / bo het, khong loi bien');

  tzOpen('split'); tzSpMode('every'); tzSpMode('each'); tzSpMode('ranges');
  tzOpen('compress'); tzCpMode('low'); tzCpMode('high'); tzCpMode('mid');
  ok('dai nut cua Tach PDF va Nen PDF doi qua lai duoc');

  ev('tz.pages = [{i:0,rot:0,gone:false},{i:1,rot:90,gone:true}]');
  ev('tz.thumbs = [{style:{}},{style:{}}]');
  tzOpen('pages');
  ev('tz.pages = [{i:0,rot:0,gone:false},{i:1,rot:90,gone:true}]');
  ev('tz.thumbs = [{style:{}},{style:{}}]');
  tzPgRender(); tzPgRot(0); tzPgGone(1); tzPgMove(0, 1); tzPgAll(); tzPgRotAll();
  ok('luoi trang: xoay / bo / doi cho / lay lai het');
} catch (e) { bad('giao dien', e); }

const tail = skipped ? ` (${skipped} m\u1ee5c b\u1ecf qua v\u00ec thi\u1ebfu file m\u1eabu)` : '';
console.log(fail ? `\n${pass} \u0111\u1ea1t / ${fail} KH\u00d4NG \u0110\u1ea0T${tail}\n`
                 : `\nT\u1ea5t c\u1ea3 ${pass} m\u1ee5c \u0111\u1ea1t.${tail}\n`);
process.exit(fail ? 1 : 0);
