'use strict';

const sc   = document.getElementById('simCanvas');
const gc   = document.getElementById('graphCanvas');
const ctx  = sc.getContext('2d');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Physics (μ₀ = ε₀ = 1) ──────────────────────────────────────────────────
   AC: I(t) = I₀·sin(ωt),  E(t) = -cos(ωt)·E_max  (90° lag)
   DC: I(t) = I₀ (costante),  E(t) = (t·f)%1       (rampa lineare)
   In entrambi i casi: I_d = ε₀·dΦ_E/dt = I_c  →  ∮ B·dl uguale nel filo e nel gap
   ─────────────────────────────────────────────────────────────────────────── */

const P = {
  I0: 1.0,   // peak current [normalized]
  f:  0.35,  // frequency [Hz] — in DC: charging rate
  R:  85,    // plate radius / loop radius [px]
  d:  65,    // half-separation [px] — plates at x = CX ± d
  ac: true,  // true = AC, false = DC
};

/* ── State ───────────────────────────────────────────────────────────────── */
let simT    = 0;
let loopZ   = 195;   // Amperian loop position along wire [px from CX]
let running = true;
let prevTS  = null;

const HIST  = 320;
const hIc   = new Float32Array(HIST);
const hE    = new Float32Array(HIST);
let   hHead = 0, hFull = false;

/* ── Layout ──────────────────────────────────────────────────────────────── */
let CX = 0, CY = 0;

/* ── Physics functions ───────────────────────────────────────────────────── */
function Ic() {
  if (P.ac) return P.I0 * Math.sin(2 * Math.PI * P.f * simT);
  return P.I0;                    // DC: constant conduction current
}
function Enorm() {
  if (P.ac) return -Math.cos(2 * Math.PI * P.f * simT);   // 90° lag, ±1
  return (simT * P.f) % 1;       // DC: linear ramp 0→1 (E grows as cap charges)
}

// B_z at screen-relative position (wx, wy): + = out of screen, – = into screen
// wx = x – CX (along wire axis), wy = y – CY (transverse, + = below wire)
function Bz(wx, wy) {
  const r = Math.abs(wy);
  if (r < 1) return 0;
  const inGap = Math.abs(wx) < P.d;
  const geo   = (inGap && r < P.R) ? r / (2 * Math.PI * P.R * P.R) : 1 / (2 * Math.PI * r);
  return Ic() * geo * (wy > 0 ? 1 : -1);
}

function loopCirculation() {
  // ∮ B·dl for circular loop of radius P.R at position loopZ
  return Math.abs(loopZ) < P.d ? Ic() : Ic(); // always equal: I_d = I_c
}

function fmt(v) {
  if (!isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a < 0.005) return '0.00';
  return v.toFixed(2);
}

/* ── drawSim ─────────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);
  drawGrid(dark);
  drawGapShade(dark);
  drawBdots(dark);
  drawWire(dark);
  drawPlates(dark);
  drawEfield(dark);
  drawCurrentArrows(dark);
  drawLoop(dark);
  ctx.restore();
}

function drawGrid(dark) {
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.05)' : 'rgba(0,80,180,0.07)';
  ctx.lineWidth = 1;
  for (let x = 40; x < SW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
  for (let y = 40; y < SH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); }
  ctx.restore();
}

// Faint shading in the capacitor gap so the region is visually distinct
function drawGapShade(dark) {
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(180,200,255,0.045)' : 'rgba(100,140,255,0.07)';
  ctx.fillRect(CX - P.d, 0, 2 * P.d, SH);
  ctx.restore();
}

/* ── B field dots (⊙ / ⊗) ───────────────────────────────────────────────── */
function drawBdots(dark) {
  const step = 42;
  const Bref = P.I0 / (2 * Math.PI * P.R); // B at plate edge with peak current
  ctx.save();
  for (let sx = step * 0.5; sx < SW; sx += step) {
    for (let sy = step * 0.5; sy < SH; sy += step) {
      const wx = sx - CX, wy = sy - CY;
      if (Math.abs(wy) < 10) continue; // skip wire region
      const bz    = Bz(wx, wy);
      const alpha = Math.min(0.85, Math.abs(bz) / Bref * 0.85);
      if (alpha < 0.04) continue;
      ctx.globalAlpha = alpha;
      drawDot(sx, sy, bz > 0, dark);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawDot(sx, sy, outOfScreen, dark) {
  const R   = 5;
  const col = outOfScreen
    ? (dark ? '#00d4ff' : '#0064c8')
    : (dark ? '#ff5090' : '#c82850');
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(sx, sy, R, 0, 2 * Math.PI); ctx.stroke();
  if (outOfScreen) {
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, 2 * Math.PI); ctx.fill();
  } else {
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx - R * 0.65, sy - R * 0.65); ctx.lineTo(sx + R * 0.65, sy + R * 0.65);
    ctx.moveTo(sx + R * 0.65, sy - R * 0.65); ctx.lineTo(sx - R * 0.65, sy + R * 0.65);
    ctx.stroke();
  }
}

/* ── Wire ────────────────────────────────────────────────────────────────── */
function drawWire(dark) {
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(220,225,235,0.75)' : 'rgba(50,50,70,0.70)';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(0, CY);         ctx.lineTo(CX - P.d, CY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX + P.d, CY);  ctx.lineTo(SW, CY);       ctx.stroke();
  ctx.restore();
}

/* ── Capacitor plates ────────────────────────────────────────────────────── */
function drawPlates(dark) {
  ctx.save();
  const E = Enorm();
  for (const side of [-1, 1]) {
    const px = CX + side * P.d;

    // Main plate ellipse (perspective: thin)
    ctx.fillStyle   = dark ? 'rgba(160,190,255,0.82)' : 'rgba(70,100,200,0.78)';
    ctx.strokeStyle = dark ? 'rgba(200,220,255,0.95)' : 'rgba(50,70,180,0.95)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath(); ctx.ellipse(px, CY, 10, P.R, 0, 0, 2 * Math.PI);
    ctx.fill(); ctx.stroke();

    // Charge label below plate (E > 0 means field points right → left plate is +)
    const charge = (side === -1)
      ? (E > 0.05 ? '+' : E < -0.05 ? '−' : '·')
      : (E > 0.05 ? '−' : E < -0.05 ? '+' : '·');
    ctx.fillStyle  = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
    ctx.font       = 'bold 18px sans-serif';
    ctx.textAlign  = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(charge, px, CY + P.R + 8);
  }
  ctx.restore();
}

/* ── E field arrows ──────────────────────────────────────────────────────── */
function drawEfield(dark) {
  const E = Enorm();
  if (Math.abs(E) < 0.02) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.abs(E));
  const col  = dark ? '#ffdd44' : '#b08000';
  const nRow = 5;
  for (let ri = 0; ri < nRow; ri++) {
    const sy = CY - P.R * 0.75 + P.R * 1.5 * ri / (nRow - 1);
    const halfH = Math.sqrt(Math.max(0, P.R * P.R - (sy - CY) ** 2));
    if (halfH < 15) continue;
    const x1 = CX - P.d + 14, x2 = CX + P.d - 14;
    arrow(E > 0 ? x1 : x2, sy, E > 0 ? x2 : x1, sy, col);
  }
  // "E" label above the gap
  ctx.globalAlpha = Math.min(1, Math.abs(E));
  ctx.fillStyle = col;
  ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('E', CX, CY - P.R - 10);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function arrow(x1, y1, x2, y2, col) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy);
  if (l < 4) return;
  const ux = dx / l, uy = dy / l, ah = 7;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * ah + uy * ah * 0.4, y2 - uy * ah - ux * ah * 0.4);
  ctx.lineTo(x2 - ux * ah - uy * ah * 0.4, y2 - uy * ah + ux * ah * 0.4);
  ctx.closePath(); ctx.fill();
}

/* ── Current direction arrows on wire ───────────────────────────────────── */
function drawCurrentArrows(dark) {
  const ic = Ic();
  if (Math.abs(ic) < 0.02) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.abs(ic) / P.I0);
  const col = dark ? 'rgba(230,235,245,0.90)' : 'rgba(40,40,60,0.80)';
  const dir = ic > 0 ? 1 : -1;
  const sp  = 90;
  // Left segment
  for (let sx = sp; sx < CX - P.d - 20; sx += sp)
    arrow(sx - dir * 18, CY, sx + dir * 18, CY, col);
  // Right segment
  for (let sx = CX + P.d + 45; sx < SW - 20; sx += sp)
    arrow(sx - dir * 18, CY, sx + dir * 18, CY, col);
  // "i" label
  ctx.fillStyle = col; ctx.font = 'italic bold 13px "DM Sans",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('i', CX - P.d * 1.6, CY - 6);
  ctx.fillText('i', CX + P.d * 1.6, CY - 6);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ── Amperian loop ───────────────────────────────────────────────────────── */
function drawLoop(dark) {
  const sx     = CX + loopZ;
  const inGap  = Math.abs(loopZ) < P.d;
  const circ   = loopCirculation();

  // Green = conduction current, orange = displacement current
  const col = inGap
    ? (dark ? '#ff9940' : '#cc6000')
    : (dark ? '#40dd88' : '#007744');

  ctx.save();

  // Perspective ellipse (thin = depth cue)
  ctx.strokeStyle = col; ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.ellipse(sx, CY, P.R * 0.16, P.R, 0, 0, 2 * Math.PI);
  ctx.stroke();

  // Small arrowhead on the top of the loop (shows traversal direction)
  const tipY = CY - P.R;
  const aw   = 7;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(sx + aw, tipY + aw);
  ctx.lineTo(sx,      tipY - 4);
  ctx.lineTo(sx - aw, tipY + aw);
  ctx.closePath(); ctx.fill();

  // ∮ B·dl label above
  ctx.font = 'bold 11px "Space Mono",monospace';
  ctx.fillStyle = col;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`∮ B·dl = ${fmt(circ)}`, sx, tipY - 8);

  // Enclosed current type label
  ctx.font = '9px "Space Mono",monospace';
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.50)';
  ctx.fillText(inGap ? 'racchiude I_d' : 'racchiude I_c', sx, tipY + 2);

  // Shaded surface area (shows which surface the loop bounds)
  ctx.save();
  ctx.fillStyle = inGap
    ? (dark ? 'rgba(255,153,64,0.08)' : 'rgba(200,100,0,0.07)')
    : (dark ? 'rgba(64,221,136,0.08)' : 'rgba(0,120,68,0.07)');
  ctx.beginPath();
  ctx.ellipse(sx, CY, P.R * 0.16, P.R, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  // "B" label with circular arrow cue outside the gap (right side of loop)
  if (!inGap) {
    ctx.font = 'italic bold 13px "DM Sans",sans-serif';
    ctx.fillStyle = dark ? 'rgba(64,221,136,0.75)' : 'rgba(0,100,50,0.75)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('B', sx + P.R * 0.2 + 6, CY);
  }

  ctx.restore();
}

/* ── Graph: I_c(t), I_d(t), E(t) ────────────────────────────────────────── */
function drawGraphs() {
  if (!GW || !GH) return;
  const dark   = dk();
  const axCol  = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
  const lblCol = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.40)';
  gctx.clearRect(0, 0, gc.width, gc.height);

  const PAD  = { t: 22, b: 28, l: 46, r: 14 };
  const iW   = GW - PAD.l - PAD.r, iH = GH - PAD.t - PAD.b;
  const vMax = P.I0 * 1.35;
  const vMin = P.ac ? -vMax : -vMax * 0.08;  // DC: only positive range
  const hLen = hFull ? HIST : hHead;

  const gx = f => (PAD.l + f * iW) * DPR;
  const gy = v => (PAD.t + (1 - (v - vMin) / (vMax - vMin)) * iH) * DPR;

  // Background
  gctx.fillStyle = dark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)';
  gctx.fillRect(gx(0), PAD.t * DPR, iW * DPR, iH * DPR);

  // Gridlines
  gctx.lineWidth = DPR;
  for (let g = 0; g <= 4; g++) {
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const yy = (PAD.t + g * iH / 4) * DPR;
    gctx.beginPath(); gctx.moveTo(gx(0), yy); gctx.lineTo(gx(1), yy); gctx.stroke();
  }
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  gctx.beginPath(); gctx.moveTo(gx(0), gy(0)); gctx.lineTo(gx(1), gy(0)); gctx.stroke();

  // Axes
  gctx.strokeStyle = axCol;
  gctx.beginPath();
  gctx.moveTo(gx(0), PAD.t * DPR); gctx.lineTo(gx(0), (PAD.t + iH) * DPR);
  gctx.lineTo(gx(1), (PAD.t + iH) * DPR); gctx.stroke();

  if (hLen > 1) {
    // E(t) — dashed yellow, scaled to same axis as I
    gctx.strokeStyle = dark ? 'rgba(255,210,50,0.65)' : 'rgba(160,110,0,0.65)';
    gctx.lineWidth = 1.5 * DPR;
    gctx.setLineDash([5 * DPR, 3 * DPR]);
    gctx.beginPath();
    for (let i = 0; i < hLen; i++) {
      const idx = (hHead - hLen + i + HIST) % HIST;
      i === 0 ? gctx.moveTo(gx(i / (HIST - 1)), gy(hE[idx] * P.I0))
              : gctx.lineTo(gx(i / (HIST - 1)), gy(hE[idx] * P.I0));
    }
    gctx.stroke();
    gctx.setLineDash([]);

    // I_c(t) — solid cyan (and I_d, same value)
    gctx.strokeStyle = dark ? 'rgba(0,212,255,0.90)' : 'rgba(0,100,200,0.90)';
    gctx.lineWidth = 2 * DPR;
    gctx.beginPath();
    for (let i = 0; i < hLen; i++) {
      const idx = (hHead - hLen + i + HIST) % HIST;
      i === 0 ? gctx.moveTo(gx(i / (HIST - 1)), gy(hIc[idx]))
              : gctx.lineTo(gx(i / (HIST - 1)), gy(hIc[idx]));
    }
    gctx.stroke();
  }

  // Y ticks
  gctx.fillStyle = lblCol; gctx.font = `${8 * DPR}px "Space Mono",monospace`;
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
  const yTicks = P.ac ? [-P.I0, 0, P.I0] : [0, P.I0 * 0.5, P.I0];
  for (const v of yTicks) gctx.fillText(v.toFixed(1), (PAD.l - 3) * DPR, gy(v));

  // Title
  gctx.fillStyle = dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.36)';
  gctx.font = `bold ${9 * DPR}px "Space Mono",monospace`;
  gctx.textAlign = 'left'; gctx.textBaseline = 'top';
  gctx.fillText(P.ac ? 'I_c(t) = I_d(t)  vs  tempo' : 'DC — I costante, E cresce', gx(0), 4 * DPR);

  // Legend
  const legY = (PAD.t + 2) * DPR;
  gctx.font = `${8 * DPR}px "Space Mono",monospace`;
  gctx.textAlign = 'right'; gctx.textBaseline = 'top';
  gctx.fillStyle = dark ? 'rgba(0,212,255,0.85)' : 'rgba(0,100,200,0.85)';
  gctx.fillText('I_c = I_d', (PAD.l + iW - 2) * DPR, legY);
  gctx.fillStyle = dark ? 'rgba(255,210,50,0.75)' : 'rgba(160,110,0,0.75)';
  gctx.fillText(P.ac ? 'E (norm.)' : 'E (cresce)', (PAD.l + iW - 2) * DPR, legY + 12 * DPR);
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const ic    = Ic();
  const inGap = Math.abs(loopZ) < P.d;
  document.getElementById('readout').innerHTML = [
    { label: '∮ B·dl',    value: fmt(ic)                   },
    { label: 'I_c = I_d', value: fmt(ic)                   },
    { label: 'E (norm.)', value: fmt(Enorm())               },
    { label: 'modo',      value: P.ac ? 'AC' : 'DC'        },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop(ts) {
  if (running && prevTS !== null) {
    const dt = Math.min((ts - prevTS) / 1000, 0.05);
    simT += dt;
    hIc[hHead] = Ic();
    hE[hHead]  = Enorm();
    hHead = (hHead + 1) % HIST;
    if (hHead === 0) hFull = true;
  }
  prevTS = ts;
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Drag (loop position) ────────────────────────────────────────────────── */
let drag = null;

function evX(e) {
  const r  = sc.getBoundingClientRect();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  return cx - r.left - CX;
}

sc.addEventListener('mousedown', e => {
  const x = evX(e);
  if (Math.abs(x - loopZ) < 30) drag = { startX: x, startZ: loopZ };
});
sc.addEventListener('touchstart', e => {
  e.preventDefault();
  const x = evX(e);
  if (Math.abs(x - loopZ) < 30) drag = { startX: x, startZ: loopZ };
}, { passive: false });

function onMove(e) {
  if (!drag) return;
  const x = evX(e);
  loopZ = Math.max(-(SW / 2 - 35), Math.min(SW / 2 - 35, drag.startZ + x - drag.startX));
}
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });
window.addEventListener('mouseup',  () => { drag = null; });
window.addEventListener('touchend', () => { drag = null; });

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const src = Lab.Section('Sorgente');
  src.add(Lab.RadioGroup({
    label: 'Tipo corrente',
    options: [
      { label: 'AC', value: 'ac', hint: 'sinusoidale' },
      { label: 'DC', value: 'dc', hint: 'costante' },
    ],
    value: P.ac ? 'ac' : 'dc',
    onChange: v => {
      P.ac = v === 'ac';
      simT = 0; hHead = 0; hFull = false;
      buildControls();
    },
  }));
  src.add(Lab.Slider({ label: 'Corrente I₀', min: 0.2, max: 3, step: 0.1, value: P.I0,
    onChange: v => { P.I0 = v; } }));
  src.add(Lab.Slider({
    label: P.ac ? 'Frequenza f [Hz]' : 'Vel. carica [1/s]',
    min: 0.1, max: 2.0, step: 0.05, value: P.f,
    onChange: v => { P.f = v; },
  }));
  ctrl.appendChild(src.el);

  const cap = Lab.Section('Condensatore');
  cap.add(Lab.Slider({ label: 'Raggio armature [px]', min: 40, max: 130, step: 5, value: P.R,
    onChange: v => { P.R = v; } }));
  cap.add(Lab.Slider({ label: 'Semidistanza d [px]', min: 25, max: 130, step: 5, value: P.d,
    onChange: v => { P.d = v; } }));
  ctrl.appendChild(cap.el);

  const sim = Lab.Section('Simulazione');
  sim.add(Lab.Toggle({ label: 'Pausa', value: !running,
    onChange: v => { running = !v; } }));
  ctrl.appendChild(sim.el);
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
