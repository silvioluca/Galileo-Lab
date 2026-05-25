'use strict';

const sc   = document.getElementById('simCanvas');
const gc   = document.getElementById('graphCanvas');
const ctx  = sc.getContext('2d');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Physics (μ₀ = 1) ────────────────────────────────────────────────────── */
// B from infinite wire: Bφ = I/(2πr)  →  ∮ B·dl = I_enc

const P = {
  loop:       'circle',  // 'circle' | 'rect' | 'blob'
  R:          130,
  fieldLines: false,
};

/* ── State ───────────────────────────────────────────────────────────────── */
let sources = [
  { x:  50, y: -30, I:  1 },
  { x: -60, y:  40, I: -1 },
];
let loopX = 0, loopY = 0;

let cachedCirc  = 0;
let cachedCumul = new Array(201).fill(0);
let circDirty   = true;

/* ── Layout ──────────────────────────────────────────────────────────────── */
let CX = 0, CY = 0;
let viewZoom = 1;
const toSc = (px, py) => [CX + px, CY + py];

/* ── Blob ────────────────────────────────────────────────────────────────── */
function blobR2D(t) { return 1 + 0.22 * Math.cos(2 * t) + 0.12 * Math.sin(3 * t); }

/* ── Field ───────────────────────────────────────────────────────────────── */
function computeField(x, y) {
  let bx = 0, by = 0;
  for (const w of sources) {
    const dx = x - w.x, dy = y - w.y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 0.01) continue;
    const c = w.I / (2 * Math.PI * r2);
    bx -= c * dy;
    by += c * dx;
  }
  return [bx, by];
}

/* ── Loop geometry ───────────────────────────────────────────────────────── */
function loopPoint(t) {
  const R = P.R;
  if (P.loop === 'circle') {
    return [loopX + R * Math.cos(t), loopY + R * Math.sin(t)];
  }
  if (P.loop === 'rect') {
    const s  = ((t / (2 * Math.PI) * 4 + 4) % 4);
    const si = Math.floor(s), u = s - si;
    const C  = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    return [
      loopX + (C[si][0] + u * (C[(si + 1) % 4][0] - C[si][0])) * R,
      loopY + (C[si][1] + u * (C[(si + 1) % 4][1] - C[si][1])) * R,
    ];
  }
  const r = R * blobR2D(t);
  return [loopX + r * Math.cos(t), loopY + r * Math.sin(t)];
}

function isInsideLoop(lx, ly) {
  const R = P.R;
  if (P.loop === 'circle') return lx * lx + ly * ly < R * R;
  if (P.loop === 'rect')   return Math.abs(lx) < R && Math.abs(ly) < R;
  const r = Math.sqrt(lx * lx + ly * ly + 1e-9);
  return r < R * blobR2D(Math.atan2(ly, lx));
}

/* ── Circulation integral ────────────────────────────────────────────────── */
const NI = 200;

function recompute() {
  let sum = 0;
  const cumul = [0];
  for (let i = 0; i < NI; i++) {
    const t1 = 2 * Math.PI * i / NI, t2 = 2 * Math.PI * (i + 1) / NI;
    const [x1, y1] = loopPoint(t1), [x2, y2] = loopPoint(t2);
    const [bx, by] = computeField((x1 + x2) * 0.5, (y1 + y2) * 0.5);
    sum += bx * (x2 - x1) + by * (y2 - y1);
    cumul.push(sum);
  }
  cachedCirc  = sum;
  cachedCumul = cumul;
}

function exactCirc() {
  let I = 0;
  for (const w of sources) if (isInsideLoop(w.x - loopX, w.y - loopY)) I += w.I;
  return I;
}

/* ── Colour helpers ──────────────────────────────────────────────────────── */
function circCol(t, dark) {
  if (t > 0) return dark ? `rgba(0,212,255,${0.2 + 0.8 * t})`  : `rgba(0,100,200,${0.2 + 0.8 * t})`;
  if (t < 0) return dark ? `rgba(255,80,120,${0.2 - 0.8 * t})` : `rgba(200,40,80,${0.2 - 0.8 * t})`;
  return dark ? 'rgba(200,200,200,0.18)' : 'rgba(100,100,100,0.18)';
}

function fmt(v) {
  if (!isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a < 0.005) return '0.00';
  if (a > 999)   return v.toExponential(1);
  return v.toFixed(2);
}

/* ── drawSim ─────────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);
  ctx.save();
  ctx.translate(CX, CY); ctx.scale(viewZoom, viewZoom); ctx.translate(-CX, -CY);
  drawGrid(dark);
  if (P.fieldLines) drawFieldLines(dark);
  drawLoop(dark);
  drawFieldArrows(dark);
  drawSources(dark);
  ctx.restore();
  ctx.restore();
}

function drawGrid(dark) {
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.055)' : 'rgba(0,80,180,0.07)';
  ctx.lineWidth = 1;
  for (let x = 40; x < SW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
  for (let y = 40; y < SH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); }
  ctx.restore();
}

/* ── Amperian loop ───────────────────────────────────────────────────────── */
function drawLoop(dark) {
  const NS = 120;
  ctx.save();

  // Dynamic scale so avg segment gives ~0.5 tanh saturation
  const totalAbs = Math.max(Math.abs(cachedCirc), 0.1);
  const scale    = 0.6 * NS / totalAbs;

  for (let i = 0; i < NS; i++) {
    const t1 = 2 * Math.PI * i / NS, t2 = 2 * Math.PI * (i + 1) / NS;
    const [x1, y1] = loopPoint(t1), [x2, y2] = loopPoint(t2);
    const [bx, by] = computeField((x1 + x2) * 0.5, (y1 + y2) * 0.5);
    const contrib  = bx * (x2 - x1) + by * (y2 - y1);
    ctx.strokeStyle = circCol(Math.tanh(contrib * scale), dark);
    ctx.lineWidth = 3.5;
    const [sx1, sy1] = toSc(x1, y1), [sx2, sy2] = toSc(x2, y2);
    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
  }

  // Dashed outline
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
  const [scx, scy] = toSc(loopX, loopY);
  if (P.loop === 'circle') {
    ctx.beginPath(); ctx.arc(scx, scy, P.R, 0, 2 * Math.PI); ctx.stroke();
  } else if (P.loop === 'rect') {
    ctx.strokeRect(scx - P.R, scy - P.R, 2 * P.R, 2 * P.R);
  } else {
    ctx.beginPath();
    for (let i = 0; i <= NS; i++) {
      const [x, y] = loopPoint(2 * Math.PI * i / NS);
      const [sx, sy] = toSc(x, y);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Direction arrow at t=0 (right side, pointing downward = CW traversal on screen)
  {
    const [ax1, ay1] = loopPoint(-0.13), [ax2, ay2] = loopPoint(0.13);
    const [sax1, say1] = toSc(ax1, ay1), [sax2, say2] = toSc(ax2, ay2);
    drawArrow(sax1, say1, sax2, say2, dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)');
  }

  // Labels
  const topY = scy - P.R * (P.loop === 'blob' ? 1.28 : 1) - 14;
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.70)';
  ctx.font = 'bold 12px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`∮ B·dl = ${fmt(cachedCirc)}`, scx, topY);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)';
  ctx.font = '9px "Space Mono",monospace';
  ctx.fillText(`μ₀·I_enc = ${fmt(exactCirc())}`, scx, topY + 14);

  // Crosshair at loop centre
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(scx - 8, scy); ctx.lineTo(scx + 8, scy);
  ctx.moveTo(scx, scy - 8); ctx.lineTo(scx, scy + 8);
  ctx.stroke();
  ctx.restore();
}

/* ── Field arrows on loop boundary ──────────────────────────────────────── */
function drawFieldArrows(dark) {
  const N = 16;
  ctx.save();
  for (let i = 0; i < N; i++) {
    const [px, py] = loopPoint(2 * Math.PI * i / N);
    const [bx, by] = computeField(px, py);
    const mag = Math.sqrt(bx * bx + by * by);
    if (mag < 1e-9) continue;
    const len = Math.min(22, 6 / mag);
    const [sx, sy] = toSc(px, py);
    drawArrow(sx, sy, sx + (bx / mag) * len, sy + (by / mag) * len,
      dark ? 'rgba(255,255,180,0.55)' : 'rgba(0,60,150,0.45)');
  }
  ctx.restore();
}

function drawArrow(x1, y1, x2, y2, col) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy);
  if (l < 2) return;
  const ux = dx / l, uy = dy / l, ah = 5;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * ah + uy * ah * 0.4, y2 - uy * ah - ux * ah * 0.4);
  ctx.lineTo(x2 - ux * ah - uy * ah * 0.4, y2 - uy * ah + ux * ah * 0.4);
  ctx.closePath(); ctx.fill();
}

/* ── Field lines ─────────────────────────────────────────────────────────── */
function drawFieldLines(dark) {
  const col = dark ? 'rgba(0,212,255,0.20)' : 'rgba(0,80,160,0.18)';
  for (const w of sources) {
    const dir = Math.sign(w.I) || 1;
    for (const r0 of [20, 55, 110]) {
      for (let i = 0; i < 8; i++) {
        const a = 2 * Math.PI * i / 8;
        traceFieldLine(w.x + r0 * Math.cos(a), w.y + r0 * Math.sin(a), dir, col);
      }
    }
  }
}

function traceFieldLine(startX, startY, dir, col) {
  let x = startX, y = startY;
  const maxR = Math.min(SW, SH) * 0.55;
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX + x, CY + y);
  for (let i = 0; i < 1500; i++) {
    const [bx, by] = computeField(x, y);
    const mag = Math.sqrt(bx * bx + by * by);
    if (mag < 1e-10) break;
    x += dir * bx / mag * 4;
    y += dir * by / mag * 4;
    ctx.lineTo(CX + x, CY + y);
    if (i > 30 && Math.hypot(x - startX, y - startY) < 8) { ctx.closePath(); break; }
    if (Math.hypot(x, y) > maxR) break;
  }
  ctx.stroke(); ctx.restore();
}

/* ── Wires ───────────────────────────────────────────────────────────────── */
function drawSources(dark) {
  for (const w of sources) {
    const [sx, sy] = toSc(w.x, w.y);
    const inside = isInsideLoop(w.x - loopX, w.y - loopY);
    ctx.save();
    ctx.fillStyle   = w.I > 0 ? (dark ? '#ff5555' : '#cc2222') : (dark ? '#5599ff' : '#2244cc');
    ctx.strokeStyle = inside ? (dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)') : 'rgba(150,150,150,0.4)';
    ctx.lineWidth   = inside ? 2.5 : 1.5;
    if (!inside) ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'white'; ctx.fillStyle = 'white'; ctx.lineWidth = 1.5;
    if (w.I > 0) { // ⊙ out of page
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, 2 * Math.PI); ctx.stroke();
    } else { // ⊗ into page
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy - 6); ctx.lineTo(sx + 6, sy + 6);
      ctx.moveTo(sx + 6, sy - 6); ctx.lineTo(sx - 6, sy + 6);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }
}

/* ── Graph: cumulative line integral ─────────────────────────────────────── */
function drawGraphs() {
  if (!GW || !GH || cachedCumul.length < 2) return;
  const dark   = dk();
  const axCol  = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
  const lblCol = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.40)';
  gctx.clearRect(0, 0, gc.width, gc.height);

  const N   = cachedCumul.length - 1;
  const ex  = exactCirc();
  const vMax = Math.max(...cachedCumul.map(v => Math.abs(v)), Math.abs(ex), 0.5) * 1.3;

  const PAD = { t: 22, b: 28, l: 52, r: 14 };
  const iW  = GW - PAD.l - PAD.r, iH = GH - PAD.t - PAD.b;
  const gx  = f => (PAD.l + f * iW) * DPR;
  const gy  = v => (PAD.t + (1 - (v + vMax) / (2 * vMax)) * iH) * DPR;

  gctx.fillStyle = dark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)';
  gctx.fillRect(gx(0), PAD.t * DPR, iW * DPR, iH * DPR);

  gctx.lineWidth = DPR;
  for (let g = 0; g <= 4; g++) {
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const yy = (PAD.t + g * iH / 4) * DPR;
    gctx.beginPath(); gctx.moveTo(gx(0), yy); gctx.lineTo(gx(1), yy); gctx.stroke();
  }
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  gctx.beginPath(); gctx.moveTo(gx(0), gy(0)); gctx.lineTo(gx(1), gy(0)); gctx.stroke();

  // Exact value dashed line
  if (Math.abs(ex) > 0.001) {
    gctx.strokeStyle = dark ? 'rgba(255,200,60,0.55)' : 'rgba(160,100,0,0.55)';
    gctx.setLineDash([6 * DPR, 4 * DPR]);
    gctx.beginPath(); gctx.moveTo(gx(0), gy(ex)); gctx.lineTo(gx(1), gy(ex)); gctx.stroke();
    gctx.setLineDash([]);
  }

  gctx.strokeStyle = axCol;
  gctx.beginPath();
  gctx.moveTo(gx(0), PAD.t * DPR); gctx.lineTo(gx(0), (PAD.t + iH) * DPR);
  gctx.lineTo(gx(1), (PAD.t + iH) * DPR); gctx.stroke();

  // Cumulative curve
  gctx.strokeStyle = dark ? 'rgba(0,212,255,0.90)' : 'rgba(0,100,200,0.90)';
  gctx.lineWidth = 1.8 * DPR;
  gctx.beginPath();
  for (let i = 0; i <= N; i++) {
    i === 0 ? gctx.moveTo(gx(i / N), gy(cachedCumul[i])) : gctx.lineTo(gx(i / N), gy(cachedCumul[i]));
  }
  gctx.stroke();

  // Y ticks
  gctx.fillStyle = lblCol;
  gctx.font = `${8 * DPR}px "Space Mono",monospace`;
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const v = vMax * (1 - 2 * g / 4);
    gctx.fillText(Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1), (PAD.l - 3) * DPR, gy(v));
  }

  // X axis labels
  gctx.fillStyle = lblCol; gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('0',  gx(0),   (PAD.t + iH + 3) * DPR);
  gctx.fillText('2π', gx(1), (PAD.t + iH + 3) * DPR);

  // Title
  gctx.fillStyle = dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.36)';
  gctx.font = `bold ${9 * DPR}px "Space Mono",monospace`;
  gctx.textAlign = 'left'; gctx.textBaseline = 'top';
  gctx.fillText('∫₀^θ B·dl  vs  θ', gx(0), 4 * DPR);

  // Legend: exact
  if (Math.abs(ex) > 0.001) {
    gctx.fillStyle = dark ? 'rgba(255,200,60,0.80)' : 'rgba(160,100,0,0.80)';
    gctx.font = `${8 * DPR}px "Space Mono",monospace`;
    gctx.textAlign = 'right'; gctx.textBaseline = 'top';
    gctx.fillText(`μ₀·I_enc = ${fmt(ex)}`, (PAD.l + iW - 2) * DPR, (PAD.t + 2) * DPR);
  }
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const ex  = exactCirc();
  const enc = sources.filter(w => isInsideLoop(w.x - loopX, w.y - loopY)).length;
  document.getElementById('readout').innerHTML = [
    { label: '∮ B·dl',    value: fmt(cachedCirc) },
    { label: 'μ₀·I_enc', value: fmt(ex)    },
    { label: 'fili interni',         value: `${enc}`       },
    { label: 'fili totali',          value: `${sources.length}` },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (circDirty) { recompute(); circDirty = false; }
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Drag ────────────────────────────────────────────────────────────────── */
let drag = null;
const GRAB = 18;

function evPhy(e) {
  const r  = sc.getBoundingClientRect();
  const ex = e.touches ? e.touches[0].clientX : e.clientX;
  const ey = e.touches ? e.touches[0].clientY : e.clientY;
  return [(ex - r.left - CX) / viewZoom, (ey - r.top - CY) / viewZoom];
}

sc.addEventListener('mousedown', e => {
  const [px, py] = evPhy(e);
  if (Math.hypot(px - loopX, py - loopY) < GRAB) { drag = { type: 'loop' }; return; }
  for (let i = 0; i < sources.length; i++) {
    if (Math.hypot(px - sources[i].x, py - sources[i].y) < GRAB) { drag = { type: 'wire', i }; return; }
  }
});
sc.addEventListener('touchstart', e => {
  e.preventDefault();
  const [px, py] = evPhy(e);
  if (Math.hypot(px - loopX, py - loopY) < GRAB) { drag = { type: 'loop' }; return; }
  for (let i = 0; i < sources.length; i++) {
    if (Math.hypot(px - sources[i].x, py - sources[i].y) < GRAB) { drag = { type: 'wire', i }; return; }
  }
}, { passive: false });

function onMove(e) {
  if (!drag) return;
  const [px, py] = evPhy(e);
  if (drag.type === 'loop') { loopX = px; loopY = py; }
  else { sources[drag.i].x = px; sources[drag.i].y = py; }
  circDirty = true;
}
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });
window.addEventListener('mouseup',  () => { drag = null; });
window.addEventListener('touchend', () => { drag = null; });

sc.addEventListener('wheel', e => {
  e.preventDefault();
  viewZoom = Math.max(0.2, Math.min(6, viewZoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
}, { passive: false });
sc.addEventListener('dblclick', () => { viewZoom = 1; });

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const visSec = Lab.Section('Visualizzazione');
  visSec.add(Lab.Toggle({ label: 'Linee di campo B', value: P.fieldLines,
    onChange: v => { P.fieldLines = v; } }));
  ctrl.appendChild(visSec.el);

  const loopSec = Lab.Section('Percorso amperiano');
  loopSec.add(Lab.RadioGroup({
    label: 'Forma',
    options: [
      { label: 'Circolare',    value: 'circle', hint: 'Simmetria radiale' },
      { label: 'Rettangolare', value: 'rect',   hint: 'Sezione quadrata'  },
      { label: 'Amorfa',       value: 'blob',   hint: 'Forma irregolare'  },
    ],
    value: P.loop,
    onChange: v => { P.loop = v; circDirty = true; },
  }));
  loopSec.add(Lab.Slider({
    label: 'Raggio / semilato  [px]', min: 40, max: 220, step: 5, value: P.R,
    onChange: v => { P.R = v; circDirty = true; },
  }));
  ctrl.appendChild(loopSec.el);

  const wireSec = Lab.Section('Fili conduttori');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;';

  sources.forEach((w, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;font:11px "Space Mono",monospace;';
    const lbl = document.createElement('span');
    lbl.style.cssText = `flex:1;color:${w.I > 0 ? '#ff8080' : '#8099ff'};`;
    lbl.textContent = `Filo ${i + 1}: I=${w.I > 0 ? '+' : ''}${w.I}`;
    const rm = document.createElement('button');
    rm.textContent = '\xd7';
    rm.style.cssText = 'background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.35);color:#ff8080;border-radius:3px;cursor:pointer;padding:1px 6px;font-size:12px;line-height:1.4;';
    rm.onclick = () => { sources.splice(i, 1); circDirty = true; buildControls(); };
    row.append(lbl, rm);
    wrap.appendChild(row);
  });

  if (sources.length < 8) {
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:5px;margin-top:4px;';
    [['I=+1', 1], ['I=+2', 2], ['I=−1', -1], ['I=−2', -2]].forEach(([lbl, I]) => {
      const btn = document.createElement('button');
      btn.textContent = lbl;
      btn.style.cssText = `flex:1;padding:3px 0;font-size:10px;border-radius:3px;cursor:pointer;` +
        `background:${I > 0 ? 'rgba(255,80,80,0.1)' : 'rgba(80,120,255,0.1)'};` +
        `border:1px solid ${I > 0 ? 'rgba(255,80,80,0.3)' : 'rgba(80,120,255,0.3)'};` +
        `color:${I > 0 ? '#ff8080' : '#8099ff'};`;
      btn.onclick = () => {
        const a = Math.random() * 2 * Math.PI, r0 = P.R * 0.5 * Math.random();
        sources.push({ x: loopX + r0 * Math.cos(a), y: loopY + r0 * Math.sin(a), I });
        circDirty = true; buildControls();
      };
      addRow.appendChild(btn);
    });
    wrap.appendChild(addRow);
  }

  wireSec.add(wrap);
  ctrl.appendChild(wireSec.el);
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  const rd   = area.querySelector('.readout-bar');
  const rdH  = rd ? rd.clientHeight || 48 : 48;
  const gaH  = ga.clientHeight || 190;

  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);

  sc.width  = Math.round(SW * DPR); sc.height = Math.round(SH * DPR);
  sc.style.width  = SW + 'px';      sc.style.height = SH + 'px';

  GW = area.clientWidth; GH = gaH;
  gc.width  = Math.round(GW * DPR); gc.height = Math.round(GH * DPR);
  gc.style.width  = GW + 'px';      gc.style.height = GH + 'px';

  CX = SW / 2; CY = SH / 2;
}

window.addEventListener('resize', resizeCanvases);

function init() {
  resizeCanvases();
  buildControls();
  requestAnimationFrame(loop);
}

init();
