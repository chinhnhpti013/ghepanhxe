/* Màn hình 4 — Quét tài liệu. Kiểm phần TOÁN (tìm mép giấy · chỉnh thẳng phối
   cảnh · làm rõ) và cả luồng nạp trang → xuất PDF / JPG / Word.

   Chạy khối <script> CUỐI của index.html bằng Node + vm.runInThisContext, kèm
   khối màn hình 3 phía trước vì màn hình 4 dùng lại tzImgPage / tzPack / tzFonts
   / tzClean của nó. Dùng node-canvas làm canvas thật.

   PHẢI dùng runInThisContext, không dùng vm.createContext: pdf-lib kiểm
   `instanceof Array`, mà mảng tạo trong realm khác không qua được phép kiểm đó. */
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
const OUT  = path.join(HERE, '.out');
fs.mkdirSync(OUT, { recursive: true });
const outPath = n => path.join(OUT, n);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code3 = blocks.find(b => /MÀN HÌNH 3/.test(b));
const code4 = blocks.find(b => /MÀN HÌNH 4/.test(b));
if (!code3 || !code4) { console.error('khong lay dung khoi script man hinh 3 / 4'); process.exit(1); }

// zipStore() + crc32() nằm ở khối script giữa file, lôi nguyên văn ra để thử
// ghi .docx bằng CHÍNH mã của app (không viết lại bản khác trong test).
const alljs = blocks.join('\n');
const zipSrc = alljs.slice(alljs.indexOf('const _CRC_TAB'), alljs.indexOf('function resetApp()'));
if (!/function zipStore/.test(zipSrc)) { console.error('khong lay dung zipStore'); process.exit(1); }

// ───────────────────────── DOM tối giản, canvas là canvas THẬT
const vals = {};
const urls = [];
const mkEl = (id, tag) => {
  if (tag === 'canvas') {
    const cv = Canvas.createCanvas(1, 1);
    // node-canvas khong co API cua DOM — them cho du thu app dung toi
    cv.addEventListener = () => {};
    cv.setPointerCapture = () => {};
    cv.style = {};
    cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height });
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
    id, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => true },
    get value() { return vals[id] !== undefined ? String(vals[id]) : ''; },
    set value(v) { vals[id] = v; },
    get checked() { return !!vals[id]; },
    set checked(v) { vals[id] = v; },
    textContent: '', innerHTML: '', placeholder: '', disabled: false, accept: '', multiple: false,
    className: '', scrollIntoView() {}, appendChild() {}, focus() {}, select() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    querySelector: () => mkEl(id + '-q'), addEventListener() {}, click() {},
  };
};
const els = {};
// Ba id nay la canvas that trong app — phai tra canvas that, khong phai o nhap gia
const CANVAS_IDS = new Set(['scCropCv', 'scPlCv', 'scLoupeCv']);
const $ = id => (els[id] || (els[id] = mkEl(id, CANVAS_IDS.has(id) ? 'canvas' : null)));

const URLstub = {
  createObjectURL: () => { const u = 'blob:test/' + urls.length; urls.push(u); return u; },
  revokeObjectURL: () => {},
};

Object.assign(globalThis, {
  DOMParser, PDFLib: PDFLibReal, fontkit: fontkitReal, $,
  esc: s => String(s),
  uid: () => 'i' + Math.random().toString(36).slice(2),
  extOf: n => { const i = String(n).lastIndexOf('.'); return i < 0 ? '' : String(n).slice(i).toLowerCase(); },
  fmtBytes: b => (b / 1024).toFixed(1) + ' KB',
  busyBtn() {}, freeBtn() {}, toast() {}, confirm: () => true,
  openOverlay() {}, closeModal() {},
  APP_VERSION: 'v2.0-test',
  MM: 2.8346, A4: { w: 595, h: 842 },
  BLUE:  () => PDFLibReal.rgb(.1, .46, .82), GRAY: () => PDFLibReal.rgb(.46, .46, .46),
  WHITE: () => PDFLibReal.rgb(1, 1, 1),      LGRAY: () => PDFLibReal.rgb(.74, .74, .74),
  BLACK: () => PDFLibReal.rgb(0, 0, 0),      DGRAY: () => PDFLibReal.rgb(.35, .38, .42),
  state: { step: 4 }, updateActionBar() {}, goStep() {},
  openSign() {},
  window: { URL: URLstub, DecompressionStream, isSecureContext: true, scrollTo() {},
            devicePixelRatio: 1, addEventListener() {},
            requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 0) },
  document: { createElement: t => mkEl('tmp', t), addEventListener() {},
              querySelectorAll: () => [], querySelector: () => null,
              head: { appendChild() {} } },
  loadPdfjs: async () => pdfjs,
  loadImage: async file => Canvas.loadImage(Buffer.from(await file.arrayBuffer())),
  fetch: async p => {
    const fp = path.join(ROOT, String(p));
    if (!fs.existsSync(fp)) return { ok: false, status: 404, arrayBuffer: async () => null };
    const b = fs.readFileSync(fp);
    return { ok: true, status: 200,
             arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  },
});

// `saveBlob` ghi lại file cuối cùng được tải, để các phép thử soi kết quả
let saved = null;
globalThis.saveBlob = (blob, name) => { saved = { blob, name }; };

// localStorage và navigator của Node 24 là thuộc tính CHỈ ĐỌC của globalThis,
// Object.assign sẽ ném lỗi — phải đặt bằng defineProperty.
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
  _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; },
  setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; },
} });

vm.runInThisContext(zipSrc, { filename: 'zip-store.js' });
vm.runInThisContext(code3, { filename: 'man-hinh-3.js' });
vm.runInThisContext(code4, { filename: 'man-hinh-4.js' });
const ev = e => vm.runInThisContext(e);

let fail = 0, pass = 0;
const ok  = (m, d) => { pass++; console.log('  ✓ ' + m + (d ? '  — ' + d : '')); };
const bad = (m, e) => { fail++; console.log('  ✗ ' + m + '\n      ' + ((e && e.stack) || e)); };
const bytesOf = async b => new Uint8Array(await b.arrayBuffer());
const near = (a, b, tol) => Math.abs(a - b) <= tol;
/** scIntake() tu goi scRunQueue(), nen goi scRunQueue() lan nua se tra ve ngay
 *  (co co _scRunning). Phai doi scn.busy ha xuong moi biet da xu ly xong. */
async function waitIdle(ms) {
  const t0 = Date.now();
  for (;;) {
    if (!ev('scn.busy') && !ev('scn.pages.some(p => p.dirty || p.busy)')) return;
    if (Date.now() - t0 > (ms || 60000)) throw new Error('hang doi xu ly khong xong sau ' + (ms || 60000) + 'ms');
    await new Promise(r => setTimeout(r, 30));
  }
}

// ───────────────────────── ảnh mẫu: "tờ giấy" trắng nằm xiên trên nền tối
/** @param q 4 góc của tờ giấy trong ảnh (TL,TR,BR,BL); marks = vẽ dấu nhận biết */
function sheetCanvas(w, h, q, marks) {
  const cv = Canvas.createCanvas(w, h);
  const x = cv.getContext('2d');
  x.fillStyle = '#2B2F36'; x.fillRect(0, 0, w, h);          // nền bàn tối
  x.save();
  x.beginPath();
  x.moveTo(q[0][0], q[0][1]);
  for (let i = 1; i < 4; i++) x.lineTo(q[i][0], q[i][1]);
  x.closePath();
  x.clip();
  x.fillStyle = '#F4F2EC'; x.fill();                         // giấy ngà
  if (marks) {
    // ô đen ở GÓC TRÊN-TRÁI của tờ giấy, để biết trang quét ra có đúng chiều
    const cx0 = q[0], cx1 = q[1], cx3 = q[3];
    const px = (u, v) => [
      cx0[0] + (cx1[0] - cx0[0]) * u + (cx3[0] - cx0[0]) * v,
      cx0[1] + (cx1[1] - cx0[1]) * u + (cx3[1] - cx0[1]) * v];
    const a = px(.08, .08), b = px(.34, .08), c = px(.34, .26), d = px(.08, .26);
    x.beginPath();
    x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.lineTo(d[0], d[1]);
    x.closePath();
    x.fillStyle = '#101418'; x.fill();
  }
  x.restore();
  return cv;
}
const cvFile = async (cv, name) => new File(
  [cv.toBuffer('image/jpeg', { quality: .95 })], name, { type: 'image/jpeg' });

/** Độ sáng trung bình của một ô chữ nhật theo tỉ lệ (0..1) */
function meanBox(cv, u0, v0, u1, v1) {
  const x0 = Math.round(u0 * cv.width), y0 = Math.round(v0 * cv.height);
  const x1 = Math.round(u1 * cv.width), y1 = Math.round(v1 * cv.height);
  const d = cv.getContext('2d').getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
  return s / (d.length / 4);
}

/** Trung bình TỪNG KÊNH của một ô — dùng để kiểm bộ lọc có giữ được màu không. */
function meanRGB(cv, u0, v0, u1, v1) {
  const x0 = Math.round(u0 * cv.width), y0 = Math.round(v0 * cv.height);
  const x1 = Math.round(u1 * cv.width), y1 = Math.round(v1 * cv.height);
  const d = cv.getContext('2d').getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return { r: r / n, g: g / n, b: b / n };
}

/** Trang chụp bằng điện thoại: nền trắng, bóng tối dần sang phải, 9 dòng chữ đen
 *  và một con dấu đỏ ở góc dưới-phải. */
function pageWithStamp() {
  const cv = Canvas.createCanvas(360, 480);
  const x = cv.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 360, 480);
  const g2 = x.createLinearGradient(0, 0, 360, 0);
  g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.45)');
  x.fillStyle = g2; x.fillRect(0, 0, 360, 480);
  x.fillStyle = '#1A1A1A';
  for (let i = 0; i < 9; i++) x.fillRect(40, 60 + i * 44, 280, 11);
  x.fillStyle = '#C62828'; x.fillRect(216, 384, 108, 62);        // con dấu đỏ
  x.strokeStyle = '#1B46B0'; x.lineWidth = 5;                    // chữ ký bút bi xanh
  x.beginPath(); x.moveTo(60, 420); x.bezierCurveTo(110, 370, 140, 460, 190, 400); x.stroke();
  return cv;
}

/** Đếm điểm ảnh "xám nhờ nhờ" (không ra trắng cũng không ra mực) trên một dải ngang.
 *  Nét càng sắc thì con số này càng nhỏ — đây là thước đo độ NÉT của bộ lọc. */
function fuzzyCount(cv, u0, v0, u1, v1) {
  const x0 = Math.round(u0 * cv.width), y0 = Math.round(v0 * cv.height);
  const x1 = Math.round(u1 * cv.width), y1 = Math.round(v1 * cv.height);
  const d = cv.getContext('2d').getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const L = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
    if (L > 70 && L < 205) n++;
  }
  return n;
}

// ════════════════════════════════════════════════════════
async function main() {

console.log('\n== Hệ 8 ẩn & ma trận phối cảnh ==');
try {
  const I = ev('scHomo([[0,0],[10,0],[10,20],[0,20]], [[0,0],[10,0],[10,20],[0,20]])');
  const want = [1, 0, 0, 0, 1, 0, 0, 0];
  const dev = Math.max(...want.map((v, i) => Math.abs(I[i] - v)));
  if (dev > 1e-9) throw new Error('ma trận đồng nhất sai, lệch ' + dev);
  ok('4 góc trùng nhau → ma trận đồng nhất', 'lệch tối đa ' + dev.toExponential(1));
} catch (e) { bad('ma trận đồng nhất', e); }

try {
  // tứ giác xiên: kiểm bằng cách bắn lại 4 góc đích qua ma trận, phải ra 4 góc nguồn
  const src = [[12, 30], [180, 10], [200, 140], [25, 160]];
  const dst = [[0, 0], [100, 0], [100, 150], [0, 150]];
  globalThis.__src = src; globalThis.__dst = dst;
  const H = ev('scHomo(__dst, __src)');
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const u = dst[i][0], v = dst[i][1];
    const w = H[6] * u + H[7] * v + 1;
    const x = (H[0] * u + H[1] * v + H[2]) / w, y = (H[3] * u + H[4] * v + H[5]) / w;
    worst = Math.max(worst, Math.hypot(x - src[i][0], y - src[i][1]));
  }
  if (worst > 1e-6) throw new Error('bắn lại góc lệch ' + worst);
  ok('tứ giác xiên → 4 góc bắn lại đúng chỗ', 'lệch tối đa ' + worst.toExponential(1) + ' px');
} catch (e) { bad('ma trận phối cảnh', e); }

try {
  const bad1 = ev('scHomo([[0,0],[10,0],[10,20],[0,20]], [[5,5],[5,5],[5,5],[5,5]])');
  if (bad1 !== null) throw new Error('4 góc chập một điểm mà vẫn trả ma trận');
  ok('4 góc suy biến → trả null, không ném lỗi');
} catch (e) { bad('tứ giác suy biến', e); }

console.log('\n== Khổ trang kết quả ==');
try {
  globalThis.__q = [[0, 0], [1000, 0], [1000, 1500], [0, 1500]];
  let r = ev('scOutSize(__q, 2000)');
  if (!near(r.w / r.h, 1000 / 1500, .01)) throw new Error('tỉ lệ sai: ' + r.w + 'x' + r.h);
  if (Math.max(r.w, r.h) > 1500 * 1.16) throw new Error('phóng to quá ảnh thật: ' + r.h);
  const r2 = ev('scOutSize(__q, 1000)');
  if (Math.max(r2.w, r2.h) !== 1000) throw new Error('không tôn trọng cạnh dài: ' + r2.h);
  ok('giữ tỉ lệ & không phóng to quá ảnh thật',
     `cạnh dài 2000 → ${r.w}×${r.h} · cạnh dài 1000 → ${r2.w}×${r2.h}`);
} catch (e) { bad('scOutSize', e); }

console.log('\n== Mờ hộp (tổng chạy) ==');
try {
  const n = 40 * 30;
  globalThis.__flat = new Float32Array(n).fill(120);
  let b = ev('scBlur(__flat, 40, 30, 5)');
  let dev = 0;
  for (let i = 0; i < n; i++) dev = Math.max(dev, Math.abs(b[i] - 120));
  if (dev > 1e-3) throw new Error('ảnh phẳng bị đổi, lệch ' + dev);
  // một điểm sáng duy nhất phải lan ra nhưng giữ nguyên TỔNG
  const sp = new Float32Array(n);
  sp[15 * 40 + 20] = 255;
  globalThis.__sp = sp;
  const b2 = ev('scBlur(__sp, 40, 30, 3)');
  let sum = 0;
  for (let i = 0; i < n; i++) sum += b2[i];
  if (!near(sum, 255, 1.5)) throw new Error('tổng không bảo toàn: ' + sum);
  if (!(b2[15 * 40 + 20] > 0 && b2[15 * 40 + 20] < 255)) throw new Error('điểm sáng không lan');
  ok('ảnh phẳng giữ nguyên · điểm sáng lan mà vẫn bảo toàn tổng',
     'tổng sau khi mờ = ' + sum.toFixed(2));
} catch (e) { bad('scBlur', e); }

console.log('\n== Tìm mép giấy ==');
const CASES = [
  { nm: 'giấy nằm ngay, chừa viền', q: [[90, 70], [710, 70], [710, 930], [90, 930]] },
  { nm: 'giấy quay nghiêng ~7°',    q: [[120, 110], [700, 40], [780, 880], [200, 950]] },
  { nm: 'giấy chụp xiên (phối cảnh)', q: [[170, 150], [640, 90], [735, 905], [95, 835]] },
];
for (const c of CASES) {
  try {
    const cv = sheetCanvas(800, 1000, c.q, true);
    globalThis.__cv = cv;
    const got = ev('scDetectQuad(__cv)');
    if (!got) throw new Error('không tìm ra mép giấy nào');
    let worst = 0;
    for (let i = 0; i < 4; i++) worst = Math.max(worst, Math.hypot(got[i][0] - c.q[i][0], got[i][1] - c.q[i][1]));
    if (worst > 14) throw new Error('góc lệch tới ' + worst.toFixed(1) + 'px: '
      + JSON.stringify(got.map(p => p.map(Math.round))));
    ok(c.nm, 'lệch tối đa ' + worst.toFixed(1) + ' px so với mép thật');
  } catch (e) { bad(c.nm, e); }
}
try {
  // ảnh toàn một màu: KHÔNG được bịa ra tứ giác
  const cv = Canvas.createCanvas(400, 400);
  const x = cv.getContext('2d');
  x.fillStyle = '#9AA0A6'; x.fillRect(0, 0, 400, 400);
  globalThis.__cv = cv;
  if (ev('scDetectQuad(__cv)') !== null) throw new Error('ảnh trống mà vẫn ra tứ giác');
  ok('ảnh một màu → trả null (để nguyên cả ảnh, không cắt bừa)');
} catch (e) { bad('ảnh một màu', e); }

console.log('\n== Chỉnh thẳng phối cảnh ==');
try {
  const q = [[170, 150], [640, 90], [735, 905], [95, 835]];
  const cv = sheetCanvas(800, 1000, q, true);
  globalThis.__cv = cv; globalThis.__q = q;
  const out = await ev('scWarp(__cv, __q, 480, 700, null)');
  if (out.width !== 480 || out.height !== 700) throw new Error('khổ ra sai: ' + out.width + 'x' + out.height);
  const tl = meanBox(out, .10, .10, .32, .24);     // ô đen phải nằm ở góc trên-trái
  const tr = meanBox(out, .62, .10, .92, .24);
  const bm = meanBox(out, .30, .70, .70, .92);
  if (!(tl < 90)) throw new Error('ô đen không ra góc trên-trái (độ sáng ' + tl.toFixed(0) + ')');
  if (!(tr > 170 && bm > 170)) throw new Error('phần giấy trống bị tối: ' + tr.toFixed(0) + ' / ' + bm.toFixed(0));
  fs.writeFileSync(outPath('sc-warp.jpg'), out.toBuffer('image/jpeg', { quality: .9 }));
  ok('giấy chụp xiên → trang chữ nhật, dấu nhận biết đúng góc',
     `ô đen ${tl.toFixed(0)} · giấy trống ${tr.toFixed(0)}/${bm.toFixed(0)} (0 đen – 255 trắng)`);
} catch (e) { bad('scWarp', e); }

console.log('\n== Bộ lọc làm rõ ==');
for (const m of ['auto', 'gray', 'bw', 'color', 'cbw', 'none']) {
  try {
    // trang có bóng tối dần từ trái sang phải — đúng kiểu chụp bằng điện thoại
    const cv = Canvas.createCanvas(360, 480);
    const x = cv.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 360, 480);
    const g2 = x.createLinearGradient(0, 0, 360, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.45)');
    x.fillStyle = g2; x.fillRect(0, 0, 360, 480);
    x.fillStyle = '#1A1A1A';
    for (let i = 0; i < 9; i++) x.fillRect(40, 60 + i * 44, 280, 11);   // "dòng chữ"
    const before = { l: meanBox(cv, .05, .02, .2, .08), r: meanBox(cv, .8, .02, .95, .08) };
    globalThis.__cv = cv;
    ev(`scEnhance(__cv, ${JSON.stringify(m)})`);
    const after = { l: meanBox(cv, .05, .02, .2, .08), r: meanBox(cv, .8, .02, .95, .08) };
    const ink = meanBox(cv, .2, .14, .8, .16);
    if (m === 'none') {
      if (Math.abs(after.r - before.r) > .6) throw new Error('"none" mà vẫn đổi ảnh');
      ok('none — để nguyên ảnh gốc', `nền trái/phải ${after.l.toFixed(0)}/${after.r.toFixed(0)}`);
      continue;
    }
    if (m === 'bw') {
      const d = cv.getContext('2d').getImageData(0, 0, 360, 480).data;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] !== 0 && d[i] !== 255) throw new Error('"bw" ra màu trung gian: ' + d[i]);
    }
    // nền phải sáng đều lên (bóng bị xoá), nét chữ vẫn phải tối hơn nền rõ rệt
    if (!(after.r > before.r + 25)) throw new Error('bóng chưa bị xoá: '
      + before.r.toFixed(0) + ' → ' + after.r.toFixed(0));
    if (!(after.r - ink > 60)) throw new Error('nét chữ không còn tương phản: nền '
      + after.r.toFixed(0) + ' vs chữ ' + ink.toFixed(0));
    fs.writeFileSync(outPath('sc-filter-' + m + '.jpg'), cv.toBuffer('image/jpeg', { quality: .9 }));
    ok(m + ' — xoá bóng, giữ tương phản chữ',
       `nền phải ${before.r.toFixed(0)} → ${after.r.toFixed(0)} · nét chữ ${ink.toFixed(0)}`);
  } catch (e) { bad('bộ lọc ' + m, e); }
}

console.log('\n== Bộ lọc "Màu — nét nhất" ==');
try {
  // Bộ lọc này phải làm được CẢ HAI việc mà bw và color mỗi bên chỉ làm được một:
  // nền trắng tinh + chữ đen hẳn (như bw) NHƯNG con dấu đỏ vẫn còn màu (như color).
  const a = pageWithStamp(), b = pageWithStamp();
  globalThis.__cv = a; ev('scEnhance(__cv, "cbw")');
  globalThis.__cv = b; ev('scEnhance(__cv, "bw")');
  // Khoảng giấy TRỐNG giữa hai dòng chữ (dòng chữ nằm ở y = 60 + 44·i, cao 11px),
  // lấy ở nửa phải là chỗ bóng tối nhất
  const paper = meanRGB(a, .45, .615, .85, .660);
  const ink   = meanBox(a, .20, .497, .80, .512);     // nằm trọn trong dòng chữ thứ 5
  const st    = meanRGB(a, .64, .83, .86, .90);        // giữa con dấu
  const stBw  = meanRGB(b, .64, .83, .86, .90);
  if (!(paper.r > 248 && paper.g > 248 && paper.b > 248))
    throw new Error('nền chưa trắng tinh: ' + JSON.stringify(paper));
  if (!(ink < 60)) throw new Error('chữ chưa đen hẳn: ' + ink.toFixed(0));
  if (!(st.r - st.g > 70 && st.r - st.b > 70))
    throw new Error('con dấu mất màu đỏ: ' + JSON.stringify(st));
  if (Math.abs(stBw.r - stBw.g) > 2)
    throw new Error('phép so sánh sai — "bw" lẽ ra phải cho ảnh không màu');
  // Chữ ký bút bi xanh phải CÒN MÀU XANH và đủ đậm
  const pen = meanRGB(a, .17, .845, .23, .875);
  if (!(pen.b - pen.r > 45)) throw new Error('chữ ký bút xanh mất màu: ' + JSON.stringify(pen));
  // ĐỘ NÉT: đếm điểm xám nhờ nhờ trên dải cắt ngang 9 dòng chữ, so thẳng với bw.
  // Bản đầu dùng một mặt nạ mềm nên chỗ này nhiều gấp nhiều lần bw — đúng cái người dùng
  // thấy là "mờ". Nay chỉ được phép hơn bw một chút (mép chữ có khử răng cưa).
  // Chỉ đo ở vùng CHỮ ĐEN (4 dòng trên cùng) — con dấu đỏ và bút xanh cố ý không phải
  // trắng-hoặc-đen nên đưa vào đây là đo nhầm màu thành "mờ".
  const fz = fuzzyCount(a, .10, .10, .90, .45), fzBw = fuzzyCount(b, .10, .10, .90, .45);
  if (fz > fzBw + 288 * 168 * .02)
    throw new Error(`nét chưa đủ sắc: ${fz} điểm xám, bw chỉ ${fzBw}`);
  fs.writeFileSync(outPath('sc-filter-cbw-stamp.jpg'), a.toBuffer('image/jpeg', { quality: .9 }));
  ok('cbw — nét ngang bw, nền trắng tinh, dấu đỏ và bút xanh vẫn còn màu',
     `nền ${paper.r.toFixed(0)} · chữ ${ink.toFixed(0)} · dấu R${st.r.toFixed(0)} G${st.g.toFixed(0)} B${st.b.toFixed(0)}`
     + ` (bw xoá thành ${stBw.r.toFixed(0)}) · bút R${pen.r.toFixed(0)} B${pen.b.toFixed(0)}`
     + ` · điểm xám ${fz} so với bw ${fzBw}`);
} catch (e) { bad('bộ lọc cbw — giữ màu con dấu', e); }

console.log('\n== Nạp trang & xử lý ==');
vals.scQual = '1400';
vals.scFiltAll = 'auto';
vals.scPgSize = 'auto';
vals.scPgPad = '0';
vals.scPgQ = '82';
vals.scName = 'Tai lieu thu';
try {
  const f1 = await cvFile(sheetCanvas(800, 1000, [[90, 70], [710, 70], [710, 930], [90, 930]], true), 'trang-1.jpg');
  const f2 = await cvFile(sheetCanvas(1000, 800, [[80, 60], [920, 60], [920, 740], [80, 740]], true), 'trang-2.jpg');
  globalThis.__fs = [f1, f2];
  await ev('scIntake(__fs)');
  await waitIdle();
  const n = ev('scn.pages.length');
  const done = ev('scn.pages.filter(p => p.out).length');
  const dims = ev('scn.pages.map(p => p.ow + "x" + p.oh).join(" · ")');
  const errs = ev('scn.pages.map(p => p.err).filter(Boolean).join("; ")');
  if (n !== 2) throw new Error('số trang sai: ' + n);
  if (errs) throw new Error('có trang lỗi: ' + errs);
  if (done !== 2) throw new Error('chỉ xử lý xong ' + done + '/2 trang');
  if (!ev('scn.pages.every(p => p.thumb)')) throw new Error('thiếu ảnh nhỏ');
  ok('2 ảnh → 2 trang đã cắt viền, chỉnh thẳng, làm rõ', dims);
} catch (e) { bad('scIntake + scRunQueue', e); }

console.log('\n== Xuất PDF / JPG ==');
try {
  saved = null;
  await ev('scExportPdf()');
  if (!saved) throw new Error('không tải file nào');
  const doc = await PDFLibReal.PDFDocument.load(await bytesOf(saved.blob));
  const sz = doc.getPages().map(p => `${Math.round(p.getWidth())}×${Math.round(p.getHeight())}`);
  if (doc.getPageCount() !== 2) throw new Error('số trang PDF sai: ' + doc.getPageCount());
  // "A4 tự chọn chiều": trang dọc ra 595×842, trang ngang ra 842×595
  if (sz[0] !== '595×842' || sz[1] !== '842×595') throw new Error('khổ trang sai: ' + sz.join(' '));
  if (!/\.pdf$/.test(saved.name)) throw new Error('tên file sai: ' + saved.name);
  fs.writeFileSync(outPath('sc-tai-lieu.pdf'), await bytesOf(saved.blob));
  ok('xuất PDF 2 trang, A4 tự chọn chiều', `${saved.name} · ${sz.join(' + ')} pt · ${(saved.blob.size / 1024).toFixed(1)} KB`);
} catch (e) { bad('scExportPdf', e); }

try {
  saved = null;
  ev('scn.pdf = null');
  await ev('scExportJpg()');
  if (!saved) throw new Error('không tải file nào');
  if (!/\.zip$/.test(saved.name)) throw new Error('2 trang mà không gói ZIP: ' + saved.name);
  ok('xuất JPG nhiều trang → một file ZIP', `${saved.name} · ${(saved.blob.size / 1024).toFixed(1)} KB`);
} catch (e) { bad('scExportJpg', e); }

try {
  // xoá còn 1 trang → phải tải thẳng .jpg, không gói ZIP
  ev('scDel(1)');
  saved = null;
  ev('scn.pdf = null');
  await ev('scExportJpg()');
  if (!saved || !/\.jpg$/.test(saved.name)) throw new Error('1 trang mà vẫn gói ZIP: ' + (saved && saved.name));
  ok('xuất JPG một trang → tải thẳng ảnh', saved.name);
} catch (e) { bad('scExportJpg 1 trang', e); }

console.log('\n== Chữ ký · ghi chú · đóng dấu ==');
try {
  globalThis.__ovs = [
    { id: 'a', type: 'stamp', x: .5, y: .3, rot: -12, size: .05, text: 'BẢN SAO', color: '#C62828' },
    { id: 'b', type: 'text',  x: .5, y: .9, rot: 0,  size: .03, text: 'Ghi chú thử', color: '#0D47A1' },
  ];
  ev('scn.pages[0].ovs = __ovs');
  const before = ev('scn.pages[0].out.size');
  saved = null;
  ev('scn.pdf = null');
  await ev('scExportPdf()');
  if (!saved) throw new Error('không tải file nào');
  const cv = await ev('scComposite(scn.pages[0])');
  // ô giữa trang phải có nét đỏ của con dấu
  const d = cv.getContext('2d').getImageData(
    Math.round(cv.width * .3), Math.round(cv.height * .26),
    Math.round(cv.width * .4), Math.round(cv.height * .09)).data;
  let red = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i + 1] < 90 && d[i + 2] < 90) red++;
  if (red < 40) throw new Error('không thấy nét đỏ của con dấu (' + red + ' điểm)');
  fs.writeFileSync(outPath('sc-dau-ghichu.jpg'), cv.toBuffer('image/jpeg', { quality: .9 }));
  ok('dấu + ghi chú in lên trang mà KHÔNG sửa ảnh trang gốc',
     `${red} điểm đỏ của dấu · page.out vẫn ${(before / 1024).toFixed(1)} KB`);
} catch (e) { bad('scDrawOvs / scComposite', e); }

try {
  globalThis.__o = [{ id: 'x', type: 'sig', x: .5, y: .5, rot: 0, w: .3, data: 'x', _img: {}, _ar: 2 }];
  const plain = ev('scOvPlain(__o)');
  if ('_img' in plain[0] || '_ar' in plain[0]) throw new Error('còn khoá tạm: ' + Object.keys(plain[0]));
  ok('scOvPlain bỏ ảnh đã giải mã trước khi lưu IndexedDB', 'khoá còn lại: ' + Object.keys(plain[0]).join(', '));
} catch (e) { bad('scOvPlain', e); }

console.log('\n== Chữ nhận dạng → .txt / .docx ==');
try {
  const TXT = 'Giấy chứng nhận đăng kiểm\nBiển số: 14A-123.45\nNgày: 28/11/2026';
  els.scOcrTx = mkEl('scOcrTx');
  vals.scOcrTx = TXT;
  saved = null;
  ev('scOcrDocx()');
  if (!saved || !/\.docx$/.test(saved.name)) throw new Error('không tải .docx: ' + (saved && saved.name));
  // mở lại bằng CHÍNH tzUnzip của app
  globalThis.__u8 = await bytesOf(saved.blob);
  const files = ev('tzUnzip(__u8)');            // tra ve Map: ten -> {method, raw}
  const names = [...files.keys()];
  for (const need of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])
    if (!files.get(need)) throw new Error('thiếu phần ' + need + ' (có: ' + names.join(', ') + ')');
  const part = files.get('word/document.xml');
  if (part.method !== 0) throw new Error('phan docx bi nen, zipStore phai ghi kieu store');
  const xml = new TextDecoder().decode(part.raw);
  for (const line of TXT.split('\n'))
    if (xml.indexOf(line) < 0) throw new Error('mất dòng: ' + line);
  if (!/<w:document/.test(xml)) throw new Error('không phải document.xml của Word');
  fs.writeFileSync(outPath('sc-ocr.docx'), await bytesOf(saved.blob));
  ok('.docx mở lại được bằng tzUnzip, đủ 3 phần, giữ nguyên tiếng Việt',
     names.join(' · ') + ' · ' + (saved.blob.size / 1024).toFixed(1) + ' KB');
} catch (e) { bad('scOcrDocx', e); }

try {
  saved = null;
  ev('scOcrTxt()');
  // Blob.text() theo chuan tu BO BOM khi giai ma, nen phai soi tung byte
  const b0 = await bytesOf(saved.blob);
  if (!(b0[0] === 0xEF && b0[1] === 0xBB && b0[2] === 0xBF))
    throw new Error('thiếu BOM — Notepad sẽ hiện tiếng Việt thành rác');
  ok('.txt có BOM UTF-8 để Notepad mở đúng tiếng Việt', saved.name);
} catch (e) { bad('scOcrTxt', e); }

try {
  globalThis.__recs = { lang: 'vie', pages: [{ idx: 0, text: 'Xin chào', words: [
    { text: 'Xin',  bbox: { x0: 100, y0: 120, x1: 220, y1: 175 } },
    { text: 'chào', bbox: { x0: 240, y0: 120, x1: 400, y1: 175 } },
  ] }] };
  ev('scn.ocr = __recs');
  saved = null;
  await ev('scOcrPdf()');
  if (!saved || !/\(tim kiem duoc\)\.pdf$/.test(saved.name)) throw new Error('tên file sai: ' + (saved && saved.name));
  const doc = await PDFLibReal.PDFDocument.load(await bytesOf(saved.blob));
  if (doc.getPageCount() !== 1) throw new Error('số trang sai: ' + doc.getPageCount());
  const raw = new TextDecoder('latin1').decode(await bytesOf(saved.blob));
  if (raw.indexOf('/Image') < 0) throw new Error('không nhúng ảnh trang');
  const p0 = doc.getPages()[0];
  if (Math.round(Math.max(p0.getWidth(), p0.getHeight())) !== 842)
    throw new Error('cạnh dài trang không bằng cạnh dài A4: ' + p0.getHeight());
  fs.writeFileSync(outPath('sc-tim-kiem-duoc.pdf'), await bytesOf(saved.blob));
  ok('PDF tìm kiếm được: ảnh trang + lớp chữ vô hình',
     `${Math.round(p0.getWidth())}×${Math.round(p0.getHeight())} pt · ${(saved.blob.size / 1024).toFixed(1)} KB`);
} catch (e) { bad('scOcrPdf', e); }

console.log('\n== Màn hình cắt viền (chạy thử các nút) ==');
try {
  await ev('scCropOpen(0)');
  await waitIdle();
  const q = ev('scCrop.quad');
  if (!q || q.length !== 4) throw new Error('không dựng được 4 góc để kéo');
  ev('scCropDraw()');
  ev('scCropFull()');
  ev('scCropDetect()');
  ev('scCropLoupe({ x: 40, y: 50 })');
  const before = ev('JSON.stringify(scn.pages[0].quad)');
  // kéo hẳn 4 góc sang một khung khác rồi bấm Xong — phải ghi lại đúng khung đó
  ev('scCrop.quad = [[40,50],[520,44],[516,700],[36,690]]; scCropDraw();');
  ev('scCropDone()');
  await waitIdle();
  const after = ev('JSON.stringify(scn.pages[0].quad)');
  if (before === after) throw new Error('bấm Xong mà 4 góc của trang không đổi');
  if (after !== JSON.stringify([[40,50],[520,44],[516,700],[36,690]]))
    throw new Error('4 góc ghi lại không đúng khung vừa kéo: ' + after);
  ok('mở · vẽ · tự nhận diện · cả ảnh · kính lúp · Xong — không ném lỗi',
     '4 góc của trang đã cập nhật theo khung vừa chỉnh');
} catch (e) { bad('màn hình cắt viền', e); }

console.log('\n== Màn hình ký · ghi chú · đóng dấu (chạy thử các nút) ==');
try {
  await ev('scPlOpen(0)');
  if (!ev('scPl.base')) throw new Error('scPlOpen không dựng được ảnh nền (scPl.base rỗng)');
  ev('scn.pages[0].ovs = []; scPl.ovs = []; scPl.sel = -1;');   // bắt đầu từ trang trống
  ev("scPlAdd('stamp')");
  ev("scPlAdd('date')");
  if (ev('scPl.ovs.length') !== 2) throw new Error('không thêm được vật');
  ev('scPlSel(0)');
  const sl = ev("parseInt($('scPlSize').value, 10)");
  if (!(sl >= 4 && sl <= 95)) throw new Error('thanh trượt cỡ ra ngoài khoảng: ' + sl);
  vals.scPlSize = '60';  ev('scPlSizeChange()');
  vals.scPlRot  = '-15'; ev('scPlRotChange()');
  vals.scPlText = 'ĐÃ ĐỐI CHIẾU'; ev('scPlTextChange()');
  vals.scPlColor = '#2E7D32'; ev('scPlColorChange()');
  ev('scPlDel(1)');
  await ev('scPlDone()');
  const ovs = ev('scn.pages[0].ovs');
  if (ovs.length !== 1) throw new Error('số vật in lên trang sai: ' + ovs.length);
  if (ovs[0].text !== 'ĐÃ ĐỐI CHIẾU' || ovs[0].rot !== -15 || ovs[0].color !== '#2E7D32')
    throw new Error('không ghi nhận chỉnh sửa: ' + JSON.stringify(ovs[0]));
  ok('thêm · chọn · đổi cỡ · nghiêng · đổi chữ · đổi màu · xoá · Xong',
     'còn 1 dấu "' + ovs[0].text + '" nghiêng ' + ovs[0].rot + '°');
} catch (e) { bad('màn hình ký · ghi chú · đóng dấu', e); }

try {
  // chữ ký vẽ xong phải được nhớ lại trong máy để lần sau chọn lại
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  ev('scSigDone(' + JSON.stringify(PNG) + ')');
  const l = ev('scSigList()');
  if (!l.length || l[0] !== PNG) throw new Error('chữ ký không được nhớ lại');
  ev('scSigDone(' + JSON.stringify(PNG) + ')');
  if (ev('scSigList().length') !== 1) throw new Error('ký lại cùng một nét mà sinh ra 2 bản ghi');
  ok('chữ ký điện tử được nhớ trong máy, ký trùng không nhân đôi', l.length + ' chữ ký đã lưu');
} catch (e) { bad('chữ ký điện tử', e); }

console.log('\n== Xoay trang ==');
try {
  const w0 = ev('scn.pages[0].sw'), h0 = ev('scn.pages[0].sh');
  ev('scRot(0)');
  await waitIdle();
  const w1 = ev('scn.pages[0].sw'), h1 = ev('scn.pages[0].sh');
  if (ev('scn.pages[0].quad') === null) throw new Error('xoay xong mà không tìm lại mép giấy');
  if (ev('scn.pages[0].rot') !== 90) throw new Error('góc xoay không được ghi lại');
  if (w1 !== h0 || h1 !== w0)
    throw new Error('xoay 90° mà khung ảnh không đổi chỗ: ' + w0 + 'x' + h0 + ' -> ' + w1 + 'x' + h1);
  ok('xoay 90° → khung ảnh đổi chỗ, mép giấy tìm lại trên khung mới',
     w0 + '×' + h0 + ' → ' + w1 + '×' + h1);
} catch (e) { bad('scRot', e); }

console.log('\n== Giữ cả ảnh (bỏ cắt viền) ==');
try {
  ev('scFullAll()');
  await waitIdle();
  const sw = ev('scn.pages[0].sw'), sh = ev('scn.pages[0].sh');
  const q = ev('JSON.stringify(scn.pages[0].quad)');
  if (q !== JSON.stringify([[0, 0], [sw, 0], [sw, sh], [0, sh]]))
    throw new Error('4 góc không phải cả ảnh: ' + q);
  ok('bỏ cắt viền → 4 góc đúng bằng cả ảnh', `${sw}×${sh}`);
} catch (e) { bad('scFullAll', e); }

console.log('\n' + (fail ? `✗ ${fail} mục KHÔNG đạt (${pass} đạt).` : `Tất cả ${pass} mục đạt.`));
console.log('File kết quả xem ở tests/.out/');
process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
