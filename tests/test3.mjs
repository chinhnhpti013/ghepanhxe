/* Bốn công cụ còn lại cần canvas + pdf.js: Nén PDF · PDF→ảnh · ảnh→PDF · đổi định dạng ảnh.
   Dùng node-canvas và pdfjs-dist đúng bản 3.11.174 mà app nạp từ CDN. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as PDFLibReal from 'pdf-lib';
import fontkitReal from '@pdf-lib/fontkit';
import { DOMParser } from '@xmldom/xmldom';

const require = createRequire(import.meta.url);
const Canvas = require('canvas');
const pdfjs  = require('pdfjs-dist/legacy/build/pdf.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, '.out');
fs.mkdirSync(OUT, { recursive: true });
const outPath = n => path.join(OUT, n);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = blocks[blocks.length - 1];

// ── DOM tối giản, createElement('canvas') trả canvas THẬT
const vals = {};
const mkEl = (id, tag) => {
  if (tag === 'canvas') {
    const cv = Canvas.createCanvas(1, 1);
    cv.toBlob = (cb, type, q) => {
      try {
        const buf = type === 'image/png' ? cv.toBuffer('image/png')
                                         : cv.toBuffer('image/jpeg', { quality: q || .9 });
        cb(new Blob([buf], { type: type || 'image/jpeg' }));
      } catch (e) { cb(null); }
    };
    return cv;
  }
  return {
    id, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    get value() { return vals[id] !== undefined ? String(vals[id]) : ''; },
    set value(v) { vals[id] = v; },
    get checked() { return !!vals[id]; },
    set checked(v) { vals[id] = v; },
    textContent: '', innerHTML: '', disabled: false, accept: '', multiple: false,
    className: '', scrollIntoView() {}, appendChild() {}, focus() {},
    querySelector: () => mkEl(id + '-q'), addEventListener() {}, click() {}
  };
};
const els = {};
const $ = id => (els[id] || (els[id] = mkEl(id)));

Object.assign(globalThis, {
  DOMParser, PDFLib: PDFLibReal, fontkit: fontkitReal, $,
  esc: s => String(s),
  uid: () => 'i' + Math.random().toString(36).slice(2),
  extOf: n => { const i = String(n).lastIndexOf('.'); return i < 0 ? '' : String(n).slice(i).toLowerCase(); },
  fmtBytes: b => (b / 1024).toFixed(1) + ' KB',
  saveBlob() {}, busyBtn() {}, freeBtn() {}, toast() {},
  zipStore: files => new Blob([new Uint8Array(files.reduce((s, f) => s + f.data.length, 0))],
                              { type: 'application/zip' }),
  MM: 2.8346, A4: { w: 595, h: 842 },
  BLUE:  () => PDFLibReal.rgb(.1, .46, .82), GRAY: () => PDFLibReal.rgb(.46, .46, .46),
  WHITE: () => PDFLibReal.rgb(1, 1, 1),      LGRAY: () => PDFLibReal.rgb(.74, .74, .74),
  BLACK: () => PDFLibReal.rgb(0, 0, 0),      DGRAY: () => PDFLibReal.rgb(.35, .38, .42),
  state: { step: 3 }, updateActionBar() {},
  window: { DecompressionStream, isSecureContext: true, scrollTo() {},
            requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 0),
            cancelAnimationFrame: id => clearTimeout(id) },
  document: { createElement: t => mkEl('tmp', t), addEventListener() {},
              querySelectorAll: () => [], querySelector: () => null },
  // app nap pdf.js tu CDN; o day tra thang ban da cai
  loadPdfjs: async () => pdfjs,
  // app dung <img> + objectURL; o day doc thang bang node-canvas
  loadImage: async file => {
    const buf = Buffer.from(await file.arrayBuffer());
    return await Canvas.loadImage(buf);   // node-canvas: naturalWidth la getter chi doc
  },
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
ev('var __out = null; tzDone = function (t, n, o) { globalThis.__out = { t, n, o }; };');

let fail = 0, pass = 0;
const ok  = (m, d) => { pass++; console.log('  \u2713 ' + m + (d ? '  \u2014 ' + d : '')); };
const bad = (m, e) => { fail++; console.log('  \u2717 ' + m + '\n      ' + ((e && e.stack) || e)); };
const bytesOf = async b => new Uint8Array(await b.arrayBuffer());

async function run(toolId, files, opts) {
  for (const k of Object.keys(vals)) delete vals[k];
  Object.assign(vals, opts || {});
  globalThis.__out = null;
  globalThis.__files = files;
  ev(`tz.id = ${JSON.stringify(toolId)}; tz.pages = null; tz.thumbs = null;
      tz.files = __files.map(f => ({ id: uid(), f }));`);
  await ev(`TOOLS[${JSON.stringify(toolId)}].run()`);
  return globalThis.__out;
}

/** PDF nhiều trang có chữ + một hình, để nén và đổi sang ảnh cho ra thứ nhìn được */
async function samplePdf(n) {
  const d = await PDFLibReal.PDFDocument.create();
  const f = await d.embedFont(PDFLibReal.StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = d.addPage([595, 842]);
    p.drawText('Trang ' + i, { x: 60, y: 760, size: 32, font: f });
    p.drawRectangle({ x: 60, y: 300, width: 400, height: 380,
                      color: PDFLibReal.rgb(.1, .46, .82) });
  }
  return new File([await d.save()], `mau-${n}-trang.pdf`);
}
/** Ảnh JPG/PNG thật bằng node-canvas */
function sampleImg(w, h, name, type) {
  const cv = Canvas.createCanvas(w, h);
  const x = cv.getContext('2d');
  x.fillStyle = '#1976D2'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#fff'; x.font = 'bold 48px sans-serif'; x.fillText(name, 30, 90);
  const buf = type === 'png' ? cv.toBuffer('image/png') : cv.toBuffer('image/jpeg', { quality: .95 });
  return new File([buf], name + '.' + type);
}

console.log('\n== N\u00e9n PDF ==');
for (const m of ['low', 'mid', 'high']) {
  try {
    ev(`_tzCpMode = '${m}'`);
    const src = await samplePdf(3);
    const out = await run('compress', [src], {});
    const b = await bytesOf(out.o[0].blob);
    const d = await PDFLibReal.PDFDocument.load(b);
    if (d.getPageCount() !== 3) throw new Error('ra ' + d.getPageCount() + ' trang, can 3');
    const sz = d.getPage(0).getSize();
    if (Math.abs(sz.width - 595) > 1 || Math.abs(sz.height - 842) > 1)
      throw new Error('kho trang doi thanh ' + JSON.stringify(sz));
    fs.writeFileSync(outPath('out-compress-' + m + '.pdf'), b);
    ok('m\u1ee9c ' + m, out.n);
  } catch (e) { bad('nen PDF ' + m, e); }
}

console.log('\n== PDF \u2192 JPG / PNG ==');
try {
  const out = await run('pdf2img', [await samplePdf(1)],
                        { tzP2Fmt: 'jpg', tzP2Dpi: '150', tzP2Q: '90' });
  const b = Buffer.from(await out.o[0].blob.arrayBuffer());
  if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error('khong phai JPEG');
  const im = await Canvas.loadImage(b);
  if (Math.abs(im.width - Math.round(595 * 150 / 72)) > 2)
    throw new Error('be ngang ' + im.width + ' khong khop 150 DPI');
  fs.writeFileSync(outPath('out-pdf2img.jpg'), b);
  ok('1 trang \u2192 1 \u1ea3nh JPG', `${im.width}\u00d7${im.height} px \u00b7 ${out.n}`);

  const out2 = await run('pdf2img', [await samplePdf(3)],
                         { tzP2Fmt: 'png', tzP2Dpi: '96', tzP2Q: '90' });
  if (!/ZIP/.test(out2.o[0].label || '')) throw new Error('3 trang phai goi ZIP');
  ok('3 trang \u2192 ZIP ch\u1ee9a 3 \u1ea3nh PNG', out2.n);
} catch (e) { bad('PDF -> anh', e); }

console.log('\n== JPG / PNG \u2192 PDF ==');
for (const [size, label] of [['auto', 'A4 t\u1ef1 ch\u1ecdn chi\u1ec1u'], ['a4', 'A4 d\u1ecdc'],
                             ['a4l', 'A4 ngang'], ['fit', 'v\u1eeba kh\u1ed5 \u1ea3nh']]) {
  try {
    const out = await run('img2pdf',
      [sampleImg(1200, 800, 'ngang', 'jpg'), sampleImg(800, 1200, 'doc', 'png')],
      { tzI2Size: size, tzI2Pad: '8', tzI2Jpg: true });
    const b = await bytesOf(out.o[0].blob);
    const d = await PDFLibReal.PDFDocument.load(b);
    if (d.getPageCount() !== 2) throw new Error('ra ' + d.getPageCount() + ' trang, can 2');
    const s0 = d.getPage(0).getSize(), s1 = d.getPage(1).getSize();
    if (size === 'auto' && !(s0.width > s0.height && s1.height > s1.width))
      throw new Error('auto khong chon dung chieu: ' + JSON.stringify([s0, s1]));
    if (size === 'a4' && Math.abs(s0.width - 595) > 1) throw new Error('a4 sai kho');
    if (size === 'a4l' && Math.abs(s0.width - 842) > 1) throw new Error('a4l sai kho');
    if (size === 'fit' && Math.abs(s0.width - 900) > 2) throw new Error('fit sai kho: ' + s0.width);
    if (size === 'auto') fs.writeFileSync(outPath('out-img2pdf.pdf'), b);
    ok(label, `${Math.round(s0.width)}\u00d7${Math.round(s0.height)} + ` +
              `${Math.round(s1.width)}\u00d7${Math.round(s1.height)} pt`);
  } catch (e) { bad('anh -> PDF ' + size, e); }
}

console.log('\n== \u0110\u1ed5i \u0111\u1ecbnh d\u1ea1ng / n\u00e9n \u1ea3nh ==');
try {
  const out = await run('imgconv', [sampleImg(2400, 1600, 'to', 'png')],
                        { tzIcFmt: 'jpg', tzIcQ: '80', tzIcMax: '1200' });
  const b = Buffer.from(await out.o[0].blob.arrayBuffer());
  if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error('khong ra JPEG');
  const im = await Canvas.loadImage(b);
  if (im.width !== 1200) throw new Error('thu nho sai: ' + im.width);
  if (!/\.jpg$/.test(out.o[0].name)) throw new Error('duoi file sai: ' + out.o[0].name);
  ok('PNG 2400px \u2192 JPG c\u1ea1nh d\u00e0i 1200px', `${im.width}\u00d7${im.height} \u00b7 ${out.n}`);

  const out2 = await run('imgconv', [sampleImg(600, 400, 'nho', 'jpg')],
                         { tzIcFmt: 'png', tzIcQ: '85', tzIcMax: '0' });
  const b2 = Buffer.from(await out2.o[0].blob.arrayBuffer());
  if (!(b2[0] === 0x89 && b2[1] === 0x50)) throw new Error('khong ra PNG');
  const im2 = await Canvas.loadImage(b2);
  if (im2.width !== 600) throw new Error('kich thuoc 0 phai giu nguyen, ra ' + im2.width);
  ok('JPG \u2192 PNG, gi\u1eef nguy\u00ean k\u00edch th\u01b0\u1edbc', `${im2.width}\u00d7${im2.height} \u00b7 ${out2.n}`);
} catch (e) { bad('doi dinh dang anh', e); }

console.log('\n== N\u1ed1i PDF c\u00f3 xen \u1ea3nh ==');
try {
  const out = await run('merge',
    [await samplePdf(2), sampleImg(1200, 800, 'xen', 'jpg'), await samplePdf(1)],
    { tzMgImg: 'auto', tzMgPad: '0' });
  const d = await PDFLibReal.PDFDocument.load(await bytesOf(out.o[0].blob));
  if (d.getPageCount() !== 4) throw new Error('ra ' + d.getPageCount() + ' trang, can 4');
  fs.writeFileSync(outPath('out-merge-mix.pdf'), await bytesOf(out.o[0].blob));
  ok('2 trang PDF + 1 \u1ea3nh + 1 trang PDF \u2192 4 trang', out.n);
} catch (e) { bad('noi co anh', e); }

/* Nen mot PDF that cua may nay: ban anh da xuat trong output/, hoac mau bien ban.
   Ca hai deu bi gitignore nen ban clone tu GitHub khong co -> bo qua. */
console.log('== Nen PDF tren file that (nhieu anh) ==');
const outDir = path.join(ROOT, 'output');
const real = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(f => /\.pdf$/i.test(f)) : [];
const bbPdf = path.join(ROOT, 'docs/bien_ban_giam_dinh.pdf');
const src = real.length ? path.join(outDir, real[0]) : (fs.existsSync(bbPdf) ? bbPdf : null);
if (!src) console.log('  \u2013 bo qua: khong co PDF that nao trong output/ hay docs/');
else try {
  ev("_tzCpMode = 'mid'");
  const f = new File([fs.readFileSync(src)], path.basename(src));
  const out = await run('compress', [f], {});
  const b = await bytesOf(out.o[0].blob);
  fs.writeFileSync(outPath('out-compress-real.pdf'), b);
  ok(path.basename(src), out.n);
} catch (e) { bad('nen file that', e); }

console.log(fail ? `\n${pass} \u0111\u1ea1t / ${fail} KH\u00d4NG \u0110\u1ea0T\n` : `\nT\u1ea5t c\u1ea3 ${pass} m\u1ee5c \u0111\u1ea1t.\n`);
process.exit(fail ? 1 : 0);
