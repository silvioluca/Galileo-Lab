'use strict';

/* ── Canvas ──────────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const gc   = document.getElementById('graphCanvas');
const ctx  = sc.getContext('2d');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Core materials ──────────────────────────────────────────────────────── */
const CORES = [
  { label: 'Aria',           k: 0.08,  hint: 'k ≈ 8%',    df: 'rgba(70,90,120,0.18)',  lf: 'rgba(160,175,200,0.28)' },
  { label: 'Ferrite',        k: 0.97,  hint: 'k ≈ 97%',   df: '#2d1004',               lf: '#7a4028'                },
  { label: 'Ferro laminato', k: 0.995, hint: 'k ≈ 99.5%', df: '#141420',               lf: '#505068'                },
];

/* ── Parameters ──────────────────────────────────────────────────────────── */
const P = {
  V1:    120,
  N1:    100,
  N2:    200,
  f:     50,
  core:  1,
  ac:    true,
  speed: 0.10,   // time scale (0.1 = 10× slower than real time)
};

const ratio   = () => P.N2 / P.N1;
const kc      = () => CORES[P.core].k;
const V2peak  = () => P.ac ? ratio() * P.V1 * kc() : 0;
const V1rms   = () => P.ac ? P.V1 / Math.SQRT2 : P.V1;
const V2rms   = () => P.ac ? V2peak() / Math.SQRT2 : 0;
const v1at    = t  => P.ac ? P.V1     * Math.sin(2 * Math.PI * P.f * t) : P.V1;
const v2at    = t  => P.ac ? V2peak() * Math.sin(2 * Math.PI * P.f * t) : 0;
// Φ(t) = -V₁/(N₁·ω) · cos(ωt)  from Faraday V₁ = N₁·dΦ/dt; Φ=0 for DC (dΦ/dt=0 → V₂=0)
const phiPeak = () => P.ac ? P.V1 / (P.N1 * 2 * Math.PI * P.f) : 0;
const phiAt   = t  => P.ac ? -phiPeak() * Math.cos(2 * Math.PI * P.f * t) : 0;

/* ── Time ────────────────────────────────────────────────────────────────── */
let simT = 0;
let lastTS = null;

/* ── Layout (H-frame core, recomputed on resize) ─────────────────────────── */
// Geometry: rectangular frame with central window.
// Left leg = primary coil, right leg = secondary coil.
let CX, CY, CH;
let legW, barH, winW;
let frameL, frameR, frameT, frameB;
let winL, winR, coilT, coilB, coilH_px;
let legLcx, legRcx;    // leg center x
let rx;                 // horizontal radius of coil ellipses
let priWireX, secWireX, leftLineX, rightLineX;

function computeLayout() {
  CX  = SW * 0.50;
  CY  = SH * 0.47;
  CH  = Math.min(SH * 0.62, 200);

  legW = Math.max(22, Math.min(40, SW * 0.055));
  barH = Math.max(18, CH * 0.14);
  winW = legW * 3.2;

  const frameW = 2 * legW + winW;
  frameL = CX - frameW / 2;
  frameR = CX + frameW / 2;
  frameT = CY - CH / 2;
  frameB = CY + CH / 2;

  winL   = frameL + legW;
  winR   = frameR - legW;
  legLcx = frameL + legW / 2;
  legRcx = frameR - legW / 2;
  coilT  = frameT + barH;
  coilB  = frameB - barH;
  coilH_px = coilB - coilT;

  rx = legW * 1.40;           // ellipse horizontal radius — bulge outside the frame
  priWireX  = frameL;        // arc endpoints on the outer left face of the core
  secWireX  = frameR;        // arc endpoints on the outer right face of the core
  leftLineX  = priWireX - 40;
  rightLineX = secWireX + 40;
}

/* ── Color helpers ───────────────────────────────────────────────────────── */
const CYAN = (dark, a = 1) => dark ? `rgba(0,212,255,${a})`  : `rgba(0,110,200,${a})`;
const ORNG = (dark, a = 1) => dark ? `rgba(255,153,68,${a})` : `rgba(180,75,0,${a})`;

/* ── Main draw ───────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);
  drawGrid(dark);
  drawTransformer(dark);
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

function drawTransformer(dark) {
  const wireTop = frameT - 30, wireBot = frameB + 30;

  // Drawing order: core first → coil arcs ON TOP (clipped to their leg area).
  // Clipping keeps arcs off the window while they remain visible over the core.

  // 1. Core frame
  drawCore(dark);

  // 2. Flux animation in the window area
  drawFlux(dark);

  // 3. Primary coil arcs: outer face frameL → inner face winL, bulge left
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, winL + 1, SH); ctx.clip();
  drawCoilArcs(frameL, winL, coilT, coilB, P.N1, CYAN(dark), true);
  ctx.restore();

  // 4. Secondary coil arcs: outer face frameR → inner face winR, bulge right
  ctx.save();
  ctx.beginPath(); ctx.rect(winR - 1, 0, SW - winR + 1, SH); ctx.clip();
  drawCoilArcs(frameR, winR, coilT, coilB, P.N2, ORNG(dark), false);
  ctx.restore();

  // 4. Circuit wires
  const lw = 2;
  ctx.save();
  ctx.lineWidth = lw;

  // Primary outer spine and top/bottom connectors
  ctx.strokeStyle = CYAN(dark);
  ctx.beginPath();
  ctx.moveTo(priWireX, wireTop); ctx.lineTo(priWireX, coilT);
  ctx.moveTo(priWireX, coilB);  ctx.lineTo(priWireX, wireBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftLineX, wireTop); ctx.lineTo(priWireX, wireTop);
  ctx.moveTo(leftLineX, wireBot); ctx.lineTo(priWireX, wireBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftLineX, wireTop); ctx.lineTo(leftLineX, CY - 22);
  ctx.moveTo(leftLineX, CY + 22); ctx.lineTo(leftLineX, wireBot);
  ctx.stroke();

  // Secondary outer spine and top/bottom connectors
  ctx.strokeStyle = ORNG(dark);
  ctx.beginPath();
  ctx.moveTo(secWireX, wireTop); ctx.lineTo(secWireX, coilT);
  ctx.moveTo(secWireX, coilB);  ctx.lineTo(secWireX, wireBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(secWireX, wireTop); ctx.lineTo(rightLineX, wireTop);
  ctx.moveTo(secWireX, wireBot); ctx.lineTo(rightLineX, wireBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightLineX, wireTop); ctx.lineTo(rightLineX, CY - 22);
  ctx.moveTo(rightLineX, CY + 22); ctx.lineTo(rightLineX, wireBot);
  ctx.stroke();
  ctx.restore();

  // 5. Source and load
  drawSource(leftLineX, CY, dark);
  drawLoad(rightLineX, CY, dark);

  // 6. Animated current dots
  if (P.ac) {
    const span = wireBot - wireTop;
    const frac  = ((2 * Math.PI * P.f * simT) % (2 * Math.PI)) / (2 * Math.PI);
    const frac2 = (frac + 0.5) % 1;
    ctx.beginPath(); ctx.arc(priWireX, wireTop + frac  * span, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = CYAN(dark, 0.85); ctx.fill();
    ctx.beginPath(); ctx.arc(secWireX, wireTop + frac2 * span, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = ORNG(dark, 0.85); ctx.fill();
  }

  // 7. Labels
  ctx.save();

  // Primary: static peak + RMS (no instantaneous — too fast to read)
  ctx.fillStyle = CYAN(dark);
  ctx.font = 'bold 10px "Space Mono",monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`V₁ = ${P.V1.toFixed(0)} V pk`, leftLineX - 24, CY - 24);
  ctx.font = '8px "Space Mono",monospace';
  ctx.fillStyle = CYAN(dark, 0.65);
  ctx.fillText(`≈ ${V1rms().toFixed(1)} V rms`, leftLineX - 24, CY - 12);
  // N₁ label
  ctx.fillStyle = CYAN(dark, 0.60);
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`N₁ = ${P.N1}`, priWireX, frameT - 5);

  // Secondary: static
  ctx.fillStyle = ORNG(dark);
  ctx.font = 'bold 10px "Space Mono",monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(`V₂ = ${V2peak().toFixed(1)} V pk`, rightLineX + 24, CY - 24);
  ctx.font = '8px "Space Mono",monospace';
  ctx.fillStyle = ORNG(dark, 0.65);
  ctx.fillText(`≈ ${V2rms().toFixed(1)} V rms`, rightLineX + 24, CY - 12);
  // N₂ label
  ctx.fillStyle = ORNG(dark, 0.60);
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`N₂ = ${P.N2}`, secWireX, frameT - 5);

  // Turns ratio + efficiency below frame
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.28)';
  ctx.font = '8px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`n = ${ratio().toFixed(3)}   η = ${(kc() * 100).toFixed(1)} %`, CX, frameB + 10);

  // AC/DC badge (inside window top)
  ctx.fillStyle = CYAN(dark, 0.40);
  ctx.font = 'bold 8px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(P.ac ? '∿  AC' : '⎓  DC', CX, coilT + 4);

  ctx.restore();
}

/* ── Coil arcs ───────────────────────────────────────────────────────────── */
// Each arc: quadratic bezier from outerX (core outer face) to innerX (window face).
// Control point pushed outward by rx → arc bulges outside the core.
// 1 visible arc per 10 real turns, max 30 arcs.
function drawCoilArcs(outerX, innerX, coilTop, coilBot, N, col, goLeft) {
  const MAX_VIS = 30;
  const visN  = Math.min(Math.ceil(N / 10), MAX_VIS);
  const turnH = (coilBot - coilTop) / visN;
  const cpX   = goLeft ? outerX - rx : outerX + rx;

  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.8;

  for (let i = 0; i < visN; i++) {
    const y1 = coilTop + i * turnH;
    const y2 = coilTop + (i + 1) * turnH;
    ctx.beginPath();
    ctx.moveTo(outerX, y1);
    ctx.quadraticCurveTo(cpX, (y1 + y2) * 0.5, innerX, y2);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── Core H-frame ────────────────────────────────────────────────────────── */
// Filled rectangle with an inner window cut out using evenodd fill.
// Drawn on top of coil arcs — covers the inner arc portions automatically.
function drawCore(dark) {
  const core = CORES[P.core];
  ctx.save();

  // Fill frame (outer rect minus inner window) using evenodd rule
  ctx.fillStyle = dark ? core.df : core.lf;
  ctx.beginPath();
  // Outer rectangle (CW)
  ctx.moveTo(frameL, frameT); ctx.lineTo(frameR, frameT);
  ctx.lineTo(frameR, frameB); ctx.lineTo(frameL, frameB); ctx.closePath();
  // Inner window (CCW = hole)
  ctx.moveTo(winL, coilT); ctx.lineTo(winL, coilB);
  ctx.lineTo(winR, coilB); ctx.lineTo(winR, coilT); ctx.closePath();
  ctx.fill('evenodd');

  // Borders
  const sc_col = dark ? 'rgba(0,212,255,0.28)' : 'rgba(0,80,160,0.30)';
  ctx.strokeStyle = sc_col; ctx.lineWidth = 1.5;
  ctx.strokeRect(frameL, frameT, frameR - frameL, frameB - frameT);
  ctx.strokeRect(winL, coilT, winR - winL, coilB - coilT);

  // Material label in window
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)';
  ctx.font = '7px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(CORES[P.core].label, CX, CY);

  ctx.restore();
}

/* ── Magnetic flux in window ─────────────────────────────────────────────── */
function drawFlux(dark) {
  const phi = 2 * Math.PI * P.f * simT;
  const amp = P.ac
    ? Math.abs(Math.sin(phi)) * 0.55 + 0.10
    : (P.core > 0 ? 0.30 : 0.06);
  const dir = P.ac ? (Math.sin(phi) >= 0 ? 1 : -1) : 1;
  const col = dark ? `rgba(0,212,255,${amp})` : `rgba(0,80,160,${amp})`;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const y = coilT + (i + 0.5) * coilH_px / n;
    ctx.beginPath(); ctx.moveTo(winL + 4, y); ctx.lineTo(winR - 4, y); ctx.stroke();
  }
  const mx = CX, my = CY;
  ctx.beginPath();
  ctx.moveTo(mx, my); ctx.lineTo(mx + dir * 6, my - 3);
  ctx.moveTo(mx, my); ctx.lineTo(mx + dir * 6, my + 3);
  ctx.stroke();
  ctx.restore();
}

/* ── AC source / DC battery ──────────────────────────────────────────────── */
function drawSource(x, y, dark) {
  const R = 17;
  ctx.save();
  ctx.strokeStyle = CYAN(dark); ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  if (P.ac) {
    ctx.strokeStyle = CYAN(dark); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let xi = -11; xi <= 11; xi++) {
      const yn = -Math.sin((xi / 11) * Math.PI) * 7;
      xi === -11 ? ctx.moveTo(x + xi, y + yn) : ctx.lineTo(x + xi, y + yn);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = CYAN(dark);
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x - 5, y - 7); ctx.lineTo(x - 5, y + 7); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 2, y - 4); ctx.lineTo(x + 2, y + 4); ctx.stroke();
  }
  ctx.restore();
}

/* ── Load resistor ───────────────────────────────────────────────────────── */
function drawLoad(x, y, dark) {
  const w = 16, h = 30;
  ctx.save();
  ctx.strokeStyle = ORNG(dark); ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.lineWidth = 1.8;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = ORNG(dark, 0.55);
  ctx.font = '8px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('R', x, y);
  ctx.restore();
}

/* ── Graph ───────────────────────────────────────────────────────────────── */
function drawGraphs() {
  if (!GW || !GH) return;
  const dark   = dk();
  const axCol  = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
  const lblCol = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.40)';
  const PHICOL = dark ? 'rgba(160,110,255,1)' : 'rgba(100,40,200,1)';

  gctx.clearRect(0, 0, gc.width, gc.height);

  const PAD = { t: 22, b: 28, l: 50, r: 10 };
  const iH  = GH - PAD.t - PAD.b;
  const GAP = 10;
  const p1W = Math.round(GW * 0.58) - GAP / 2;
  const p2X = p1W + GAP;
  const p2W = GW - p2X;
  const win = P.ac ? 3 / P.f : 0.08;

  function fmtTick(v, yMax) {
    if (yMax >= 10)  return v.toFixed(0);
    if (yMax >= 1)   return v.toFixed(1);
    if (yMax >= 0.1) return v.toFixed(2);
    return v.toExponential(1);
  }

  function panel(x0, pW, yMax, title, yLabel, curves) {
    const iW = pW - PAD.l - PAD.r;
    const gx = f => ((x0 + PAD.l) + f * iW) * DPR;
    const gy = v => (PAD.t + (1 - (v + yMax) / (2 * yMax)) * iH) * DPR;

    gctx.fillStyle = dark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)';
    gctx.fillRect(gx(0), PAD.t * DPR, iW * DPR, iH * DPR);

    gctx.lineWidth = DPR;
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    for (let g = 0; g <= 4; g++) {
      const yy = (PAD.t + g * iH / 4) * DPR;
      gctx.beginPath(); gctx.moveTo(gx(0), yy); gctx.lineTo(gx(1), yy); gctx.stroke();
    }
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)';
    gctx.beginPath(); gctx.moveTo(gx(0), gy(0)); gctx.lineTo(gx(1), gy(0)); gctx.stroke();
    gctx.strokeStyle = axCol;
    gctx.beginPath();
    gctx.moveTo(gx(0), PAD.t * DPR); gctx.lineTo(gx(0), (PAD.t + iH) * DPR);
    gctx.lineTo(gx(1), (PAD.t + iH) * DPR); gctx.stroke();

    const N = Math.round(iW);
    curves.forEach(({ fn, col, dash }) => {
      gctx.save();
      gctx.strokeStyle = col; gctx.lineWidth = 1.8 * DPR;
      if (dash) gctx.setLineDash([4 * DPR, 4 * DPR]);
      gctx.beginPath();
      for (let xi = 0; xi <= N; xi++) {
        const t = simT - win + (xi / N) * win;
        xi === 0 ? gctx.moveTo(gx(xi / N), gy(fn(t))) : gctx.lineTo(gx(xi / N), gy(fn(t)));
      }
      gctx.stroke(); gctx.restore();
    });

    gctx.fillStyle = lblCol;
    gctx.font = `${8 * DPR}px "Space Mono",monospace`;
    gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = yMax * (1 - 2 * g / 4);
      gctx.fillText(fmtTick(v, yMax), (x0 + PAD.l - 3) * DPR, gy(v));
    }
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText('t  [s]', gx(0.5), (PAD.t + iH + 14) * DPR);
    gctx.save();
    gctx.translate((x0 + 10) * DPR, (PAD.t + iH / 2) * DPR); gctx.rotate(-Math.PI / 2);
    gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
    gctx.fillText(yLabel, 0, 0);
    gctx.restore();
    gctx.fillStyle = dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.36)';
    gctx.font = `bold ${9 * DPR}px "Space Mono",monospace`;
    gctx.textAlign = 'left'; gctx.textBaseline = 'top';
    gctx.fillText(title, gx(0), 5 * DPR);
  }

  // ── Panel 1: Tensione ─────────────────────────────────────────────────────
  const vMax = Math.max(P.V1, Math.abs(V2peak()), 10) * 1.25;
  panel(0, p1W, vMax, 'Tensione vs Tempo', 'V  [V]', [
    { fn: v1at, col: CYAN(dark) },
    { fn: v2at, col: ORNG(dark) },
    ...(P.ac ? [
      { fn: () => V1rms(), col: CYAN(dark, 0.35), dash: true },
      { fn: () => V2rms(), col: ORNG(dark, 0.35), dash: true },
    ] : []),
  ]);
  const lx1 = (p1W - PAD.r - 4) * DPR;
  gctx.font = `${8 * DPR}px "Space Mono",monospace`;
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
  [[CYAN(dark), 'V₁', 9], [ORNG(dark), 'V₂', 19]].forEach(([col, lbl, ly]) => {
    gctx.strokeStyle = col; gctx.lineWidth = 2 * DPR;
    gctx.beginPath(); gctx.moveTo(lx1 - 28 * DPR, ly * DPR); gctx.lineTo(lx1 - 14 * DPR, ly * DPR); gctx.stroke();
    gctx.fillStyle = lblCol; gctx.fillText(lbl, lx1 - 32 * DPR, ly * DPR);
  });

  // ── Panel 2: Flusso magnetico ─────────────────────────────────────────────
  const phi_pk_mwb = Math.max(phiPeak() * 1000, 0.001);
  panel(p2X, p2W, phi_pk_mwb * 1.25, 'Flusso Φ vs Tempo', 'Φ  [mWb]', [
    { fn: t => phiAt(t) * 1000, col: PHICOL },
  ]);
  if (!P.ac) {
    const iW2 = p2W - PAD.l - PAD.r;
    gctx.fillStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)';
    gctx.font = `${8 * DPR}px "Space Mono",monospace`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
    gctx.fillText('dΦ/dt = 0  →  V₂ = 0',
      (p2X + PAD.l + iW2 / 2) * DPR, (PAD.t + iH / 2) * DPR);
  }
}

/* ── Readout ──────────────────────────────────────────────────────────────── */
function updateReadout() {
  document.getElementById('readout').innerHTML = [
    { label: 'V₁ pk',  value: `${P.V1.toFixed(0)} V` },
    { label: 'V₁ rms', value: P.ac ? `${V1rms().toFixed(1)} V` : `${P.V1.toFixed(0)} V` },
    { label: 'V₂ pk',  value: `${V2peak().toFixed(1)} V` },
    { label: 'V₂ rms', value: P.ac ? `${V2rms().toFixed(1)} V` : '0.0 V' },
    { label: 'Φ pk',    value: P.ac ? `${(phiPeak()*1000).toFixed(2)} mWb` : '0 mWb' },
    { label: 'n',       value: ratio().toFixed(4) },
    { label: P.ac ? 'f' : 'modo', value: P.ac ? `${P.f} Hz` : 'DC' },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop(ts) {
  if (lastTS !== null) {
    simT += Math.min((ts - lastTS) / 1000, 0.04) * P.speed;
  }
  lastTS = ts;
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const sSec = Lab.Section('Sorgente');
  sSec.add(Lab.Slider({ label: 'V₁ picco  [V]', min: 10, max: 500, step: 5, value: P.V1,
    onChange: v => { P.V1 = v; } }));
  sSec.add(Lab.Slider({ label: 'Frequenza  [Hz]', min: 1, max: 1000, step: 1, value: P.f,
    onChange: v => { P.f = v; } }));
  sSec.add(Lab.Slider({ label: 'Velocità sim.  [×]', min: 0.01, max: 2, step: 0.01, value: P.speed,
    onChange: v => { P.speed = v; } }));
  sSec.add(Lab.Toggle({ label: 'AC / DC', value: P.ac,
    onChange: v => { P.ac = v; simT = 0; } }));
  ctrl.appendChild(sSec.el);

  const nSec = Lab.Section('Avvolgimenti');
  nSec.add(Lab.Slider({ label: 'Spire primario N₁', min: 1, max: 500, step: 1, value: P.N1,
    onChange: v => { P.N1 = v; } }));
  nSec.add(Lab.Slider({ label: 'Spire secondario N₂', min: 1, max: 500, step: 1, value: P.N2,
    onChange: v => { P.N2 = v; } }));
  ctrl.appendChild(nSec.el);

  const cSec = Lab.Section('Nucleo magnetico');
  cSec.add(Lab.RadioGroup({
    label: 'Materiale',
    options: CORES.map((c, i) => ({ label: c.label, value: i, hint: c.hint })),
    value: P.core,
    onChange: v => { P.core = +v; },
  }));
  ctrl.appendChild(cSec.el);
}

/* ── Resize ───────────────────────────────────────────────────────────────── */
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
}

window.addEventListener('resize', () => { resizeCanvases(); computeLayout(); });

function init() {
  resizeCanvases();
  buildControls();
  computeLayout();
  requestAnimationFrame(loop);
}

init();
