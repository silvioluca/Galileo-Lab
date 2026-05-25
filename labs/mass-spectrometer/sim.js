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

/* ── Physical constants ──────────────────────────────────────────────────── */
const E_C = 1.602e-19;   // C per elementary charge
const U_M = 1.661e-27;   // kg per atomic mass unit

/* ── Parameters ──────────────────────────────────────────────────────────── */
// Setup: B into page (⊗). Positive ions enter downward through slit.
// Lorentz force curves them to the right → semicircle → screen at same height.
// r = m·v / (q·B).   Hit position x = 2r from entry slit.
const P = {
  B:  0.50,   // T (into page, always > 0)
  v:  10,     // ×10⁵ m/s
  q:  1,      // elementary charges (integer)
  m1: 20,     // u  (isotope 1, cyan)
  m2: 22,     // u  (isotope 2, orange)
};

function vSI()           { return P.v * 1e5; }
function larmor(m_u)     { return (m_u * U_M * vSI()) / (P.q * E_C * P.B); }

/* ── Geometry ────────────────────────────────────────────────────────────── */
let r1 = 0, r2 = 0;     // radii in metres
let DIV_Y  = 0;          // y of the divider / screen line (canvas px)
let ENTRY_X = 0;         // x of the entry slit (canvas px)
let PX_PER_M = 1;        // canvas pixels per metre — fixed at default params

// Reference values used to fix the scale (default P).
// PX_PER_M is computed once so changing params makes arcs grow/shrink visually.
const REF_M1 = 20, REF_M2 = 22, REF_B = 0.50, REF_V = 10, REF_Q = 1;

function compute() {
  r1 = larmor(P.m1);
  r2 = larmor(P.m2);
}

function computeLayout() {
  DIV_Y   = Math.round(SH * 0.20);
  ENTRY_X = Math.round(SW * 0.12);
  // Scale fixed to reference default — never changes when P changes.
  const r1ref = (REF_M1 * U_M * REF_V * 1e5) / (REF_Q * E_C * REF_B);
  const r2ref = (REF_M2 * U_M * REF_V * 1e5) / (REF_Q * E_C * REF_B);
  const rMax  = Math.max(r1ref, r2ref);
  const maxH  = SH - DIV_Y - 38;
  const maxW  = SW - ENTRY_X - 24;
  PX_PER_M = Math.min(maxH / rMax, maxW / (2 * rMax)) * 0.86;
}

function rPx(r_m)    { return r_m * PX_PER_M; }
function hitX(r_m)   { return ENTRY_X + 2 * rPx(r_m); }
function arcCX(r_m)  { return ENTRY_X + rPx(r_m); }

/* ── Arrow helper ────────────────────────────────────────────────────────── */
function arrowHead(c, x0, y0, x1, y1, tip) {
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x1 - tip * Math.cos(a - 0.42), y1 - tip * Math.sin(a - 0.42));
  c.lineTo(x1 - tip * Math.cos(a + 0.42), y1 - tip * Math.sin(a + 0.42));
  c.closePath(); c.fill();
}

/* ── Animation state ─────────────────────────────────────────────────────── */
let animFrac = 0;
const ANIM_DT = 1 / 160;

/* ── Main draw ───────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);

  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);

  drawBField(dark);
  drawScreen(dark);
  drawPaths(dark);
  drawAnimParticles(dark);
  drawScreenMarkers(dark);
  drawDimLines(dark);
  drawFieldLabel(dark);

  ctx.restore();
}

/* ── B field ⊗ grid ─────────────────────────────────────────────────────── */
function drawBField(dark) {
  const alpha = dark ? 0.20 : 0.15;
  const col   = dark ? `rgba(0,212,255,${alpha})` : `rgba(0,80,160,${alpha})`;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = col;
  ctx.lineWidth = 1;
  const STEP = 55;
  for (let x = STEP / 2; x < SW; x += STEP) {
    for (let y = DIV_Y + STEP / 2; y < SH - 4; y += STEP) {
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 2 * Math.PI); ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y - 3.5); ctx.lineTo(x + 3.5, y + 3.5);
      ctx.moveTo(x + 3.5, y - 3.5); ctx.lineTo(x - 3.5, y + 3.5);
      ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  ctx.restore();
}

/* ── Screen / divider line ───────────────────────────────────────────────── */
function drawScreen(dark) {
  const y = DIV_Y;

  // Main divider (the screen)
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke();

  // Cover the slit gap so it looks like a barrier with a hole
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, y - 10, ENTRY_X - 4, 10);            // left of slit
  ctx.fillRect(ENTRY_X + 5, y - 10, SW - ENTRY_X - 5, 10); // right of slit

  // "schermo" label
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.28)';
  ctx.font = '9px "Space Mono", monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('schermo →', SW - 10, y - 14);

  // Entry slit arrow (v₀ downward)
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = dark ? 'rgba(0,212,255,0.60)' : 'rgba(0,100,180,0.65)';
  ctx.lineWidth = 1.5;
  arrowHead(ctx, ENTRY_X, y - 32, ENTRY_X, y - 2, 7);
  ctx.font = '9px "Space Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('v₀', ENTRY_X, y - 32);
  ctx.restore();

  // "selettore v" hint top-left
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)';
  ctx.font = '8px "Space Mono", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('← selettore di velocità', 8, y / 2);
}

/* ── Dashed semicircular paths ───────────────────────────────────────────── */
function drawPaths(dark) {
  drawArc(r1, dark ? '#00d4ff' : '#0088cc');
  drawArc(r2, dark ? '#ff9944' : '#cc5500');
}

function drawArc(r_m, col) {
  const cx = arcCX(r_m), cy = DIV_Y, rp = rPx(r_m);
  if (rp < 2) return;
  ctx.save();
  // Clip to the B-field region (below divider) so arcs never bleed into the top area.
  ctx.beginPath(); ctx.rect(0, DIV_Y, SW, SH - DIV_Y); ctx.clip();
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  // Arc from angle π (left=entry) to 0 (right=exit), anticlockwise → bottom semicircle ✓
  ctx.beginPath(); ctx.arc(cx, cy, rp, Math.PI, 0, true); ctx.stroke();
  ctx.restore();
}

/* ── Animated particles ──────────────────────────────────────────────────── */
function drawAnimParticles(dark) {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, DIV_Y, SW, SH - DIV_Y); ctx.clip();
  drawMovingParticle(r1, animFrac,              '#00d4ff', dark);
  drawMovingParticle(r2, (animFrac + 0.38) % 1, '#ff9944', dark);
  ctx.restore();
}

function drawMovingParticle(r_m, frac, col, dark) {
  const rp = rPx(r_m);
  if (rp < 2) return;
  const cx = arcCX(r_m);
  const angle = Math.PI * (1 - frac); // π → 0, through bottom
  const sx = cx + rp * Math.cos(angle);
  const sy = DIV_Y + rp * Math.sin(angle);
  if (sy < DIV_Y) return;

  // Glow
  const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 11);
  grd.addColorStop(0, col + 'aa');
  grd.addColorStop(1, col + '00');
  ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 2 * Math.PI);
  ctx.fillStyle = grd; ctx.fill();

  ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();

  // Charge sign
  ctx.fillStyle = '#000';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('+', sx, sy + 0.5);
}

/* ── Screen tick markers ─────────────────────────────────────────────────── */
function drawScreenMarkers(dark) {
  drawTick(r1, '#00d4ff', `m₁=${P.m1} u`, dark, 'above');
  drawTick(r2, '#ff9944', `m₂=${P.m2} u`, dark, 'above');

  // Δx brace between the two hit positions
  const x1 = hitX(r1), x2 = hitX(r2);
  if (Math.abs(x2 - x1) > 6) {
    const xL = Math.min(x1, x2), xR = Math.max(x1, x2);
    const y  = DIV_Y;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = dark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xL, y + 6); ctx.lineTo(xR, y + 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xL, y + 3); ctx.lineTo(xL, y + 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xR, y + 3); ctx.lineTo(xR, y + 9); ctx.stroke();
    ctx.font = '8px "Space Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`Δx = ${(Math.abs(r2 - r1) * 2e2).toFixed(1)} cm`, (xL + xR) / 2, y + 11);
    ctx.restore();
  }
}

function drawTick(r_m, col, label, dark, pos) {
  const hx = hitX(r_m), y = DIV_Y;
  if (hx > SW - 2) return;   // off-screen → skip tick
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(hx, y - 9); ctx.lineTo(hx, y + 9); ctx.stroke();
  ctx.font = 'bold 9px "Space Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, hx, y - 11);
  ctx.restore();
}

/* ── Dimension lines (2r₁, 2r₂) under arcs ──────────────────────────────── */
function drawDimLines(dark) {
  const yBase = DIV_Y + Math.min(Math.max(rPx(r1), rPx(r2)) * 0.95, SH - DIV_Y - 60);
  drawDimLine(r1, yBase + 10,  `2r₁ = ${(2 * r1 * 100).toFixed(1)} cm`, '#00d4ff', dark);
  drawDimLine(r2, yBase + 28, `2r₂ = ${(2 * r2 * 100).toFixed(1)} cm`, '#ff9944', dark);
}

function drawDimLine(r_m, y, label, col, dark) {
  const x0 = ENTRY_X, x1 = Math.min(hitX(r_m), SW - 4);
  if (y > SH - 8) return;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = col;
  ctx.globalAlpha = 0.48;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, y - 3); ctx.lineTo(x0, y + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y - 3); ctx.lineTo(x1, y + 3); ctx.stroke();
  ctx.globalAlpha = 0.72;
  ctx.font = '8px "Space Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, (x0 + x1) / 2, y - 2);
  ctx.restore();
}

/* ── B label ─────────────────────────────────────────────────────────────── */
function drawFieldLabel(dark) {
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,80,160,0.60)';
  ctx.font = 'bold 10px "Space Mono", monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(`B = ${P.B.toFixed(2)} T  ⊗`, SW - 10, DIV_Y + 10);
}

/* ── Graph: r vs m (linear) ──────────────────────────────────────────────── */
function drawGraphs() {
  if (!GW || !GH) return;
  const dark   = dk();
  const axCol  = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)';
  const lblCol = dark ? 'rgba(255,255,255,0.48)' : 'rgba(0,0,0,0.42)';

  gctx.clearRect(0, 0, gc.width, gc.height);

  const panW = Math.floor(GW / 2);
  drawPanelRvsM(0, panW, dark, axCol, lblCol);
  drawPanelRvsB(panW, panW, dark, axCol, lblCol);
}

function drawPanelRvsM(ox, pw, dark, axCol, lblCol) {
  const PAD = { t: 22, b: 28, l: 50, r: 8 };
  const iW = pw - PAD.l - PAD.r;
  const iH = GH - PAD.t - PAD.b;

  gctx.fillStyle = dark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.012)';
  gctx.fillRect(ox * DPR, 0, pw * DPR, GH * DPR);

  const mMax = Math.max(P.m1, P.m2, 1) * 1.55;
  const rMax = larmor(mMax) * 100; // cm

  function gx(m)    { return (ox + PAD.l + m / mMax * iW) * DPR; }
  function gy(r_cm) { return (PAD.t + (1 - r_cm / rMax) * iH) * DPR; }

  grid4(gctx, ox, pw, PAD, iW, iH, dark);
  axes(gctx, ox, pw, PAD, iW, iH, axCol);

  // r = m·v/(qB) line (grey)
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.20)';
  gctx.lineWidth = 1.5 * DPR;
  gctx.beginPath(); gctx.moveTo(gx(0), gy(0)); gctx.lineTo(gx(mMax), gy(rMax)); gctx.stroke();

  // Isotope dots
  dot(gctx, gx(P.m1), gy(r1 * 100), 5, '#00d4ff');
  dot(gctx, gx(P.m2), gy(r2 * 100), 5, '#ff9944');

  // Δr bracket
  if (Math.abs(r2 - r1) > 1e-4) {
    const y1 = gy(r1 * 100), y2 = gy(r2 * 100);
    const xb = (ox + pw - PAD.r - 18) * DPR;
    gctx.save();
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)';
    gctx.lineWidth = DPR;
    gctx.beginPath(); gctx.moveTo(xb, y1); gctx.lineTo(xb, y2); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(xb - 3*DPR, y1); gctx.lineTo(xb + 3*DPR, y1); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(xb - 3*DPR, y2); gctx.lineTo(xb + 3*DPR, y2); gctx.stroke();
    gctx.fillStyle = dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.35)';
    gctx.font = `${7.5 * DPR}px "Space Mono", monospace`;
    gctx.textAlign = 'left'; gctx.textBaseline = 'middle';
    gctx.fillText('Δr', xb + 4*DPR, (y1 + y2) / 2);
    gctx.restore();
  }

  // Labels
  axisLabels(gctx, ox, pw, PAD, iW, iH, lblCol, 'm  [u]', 'r  [cm]', rMax, 'cm');

  gctx.fillStyle = dark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.38)';
  gctx.font = `bold ${9 * DPR}px "Space Mono", monospace`;
  gctx.textAlign = 'left'; gctx.textBaseline = 'top';
  gctx.fillText('r = mv / (qB)', (ox + PAD.l) * DPR, 5 * DPR);
}

function drawPanelRvsB(ox, pw, dark, axCol, lblCol) {
  const PAD = { t: 22, b: 28, l: 50, r: 8 };
  const iW = pw - PAD.l - PAD.r;
  const iH = GH - PAD.t - PAD.b;

  // Separator
  gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
  gctx.beginPath(); gctx.moveTo(ox * DPR, 0); gctx.lineTo(ox * DPR, GH * DPR); gctx.stroke();

  gctx.fillStyle = dark ? 'rgba(255,255,255,0.005)' : 'rgba(0,0,0,0.008)';
  gctx.fillRect(ox * DPR, 0, pw * DPR, GH * DPR);

  const bMax  = 3.0;
  const rMax1 = larmor_at(P.m1, 0.05) * 100; // at B_min
  const rMaxPl = Math.max(larmor_at(P.m1, 0.05), larmor_at(P.m2, 0.05)) * 100 * 1.15;

  function gx(b)    { return (ox + PAD.l + b / bMax * iW) * DPR; }
  function gy(r_cm) { return (PAD.t + (1 - r_cm / rMaxPl) * iH) * DPR; }
  function larmor_at(m, b) { return (m * U_M * vSI()) / (P.q * E_C * b); }

  grid4(gctx, ox, pw, PAD, iW, iH, dark);
  axes(gctx, ox, pw, PAD, iW, iH, axCol);

  // r(B) hyperbolic curves for m1 and m2
  drawHyperbola(gctx, gx, gy, P.m1, bMax, '#00d4ff');
  drawHyperbola(gctx, gx, gy, P.m2, bMax, '#ff9944');

  // Current B marker
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth = DPR; gctx.setLineDash([3 * DPR, 3 * DPR]);
  gctx.beginPath(); gctx.moveTo(gx(P.B), PAD.t * DPR); gctx.lineTo(gx(P.B), (PAD.t + iH) * DPR); gctx.stroke();
  gctx.setLineDash([]);

  // Dots at current B
  dot(gctx, gx(P.B), gy(r1 * 100), 4.5, '#00d4ff');
  dot(gctx, gx(P.B), gy(r2 * 100), 4.5, '#ff9944');

  axisLabels(gctx, ox, pw, PAD, iW, iH, lblCol, 'B  [T]', 'r  [cm]', rMaxPl, 'cm');

  gctx.fillStyle = dark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.38)';
  gctx.font = `bold ${9 * DPR}px "Space Mono", monospace`;
  gctx.textAlign = 'left'; gctx.textBaseline = 'top';
  gctx.fillText('r = mv / (qB)', (ox + PAD.l) * DPR, 5 * DPR);
}

function drawHyperbola(c, gx, gy, m_u, bMax, col) {
  c.save();
  c.strokeStyle = col; c.lineWidth = 1.5 * DPR; c.globalAlpha = 0.65;
  c.beginPath();
  let first = true;
  for (let bi = 1; bi <= 80; bi++) {
    const b = 0.05 + (bi / 80) * (bMax - 0.05);
    const r_cm = (m_u * U_M * vSI()) / (P.q * E_C * b) * 100;
    const px = gx(b), py = gy(r_cm);
    if (py < 0 || py > (GH + 10) * DPR) { first = true; continue; }
    first ? c.moveTo(px, py) : c.lineTo(px, py);
    first = false;
  }
  c.stroke(); c.restore();
}

/* ── Graph helpers ───────────────────────────────────────────────────────── */
function grid4(c, ox, pw, PAD, iW, iH, dark) {
  c.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  c.lineWidth = DPR;
  for (let g = 0; g <= 4; g++) {
    const y = (PAD.t + g * iH / 4) * DPR;
    c.beginPath(); c.moveTo((ox + PAD.l) * DPR, y); c.lineTo((ox + PAD.l + iW) * DPR, y); c.stroke();
  }
}
function axes(c, ox, pw, PAD, iW, iH, axCol) {
  c.strokeStyle = axCol; c.lineWidth = DPR;
  c.beginPath();
  c.moveTo((ox + PAD.l) * DPR, PAD.t * DPR);
  c.lineTo((ox + PAD.l) * DPR, (PAD.t + iH) * DPR);
  c.lineTo((ox + PAD.l + iW) * DPR, (PAD.t + iH) * DPR);
  c.stroke();
}
function dot(c, px, py, r, col) {
  c.beginPath(); c.arc(px, py, r * DPR, 0, 2 * Math.PI);
  c.fillStyle = col; c.fill();
}
function axisLabels(c, ox, pw, PAD, iW, iH, lblCol, xLabel, yLabel, rMax, unit) {
  c.fillStyle = lblCol;
  c.font = `${8 * DPR}px "Space Mono", monospace`;
  c.textAlign = 'center'; c.textBaseline = 'top';
  c.fillText(xLabel, (ox + PAD.l + iW / 2) * DPR, (PAD.t + iH + 14) * DPR);
  c.save();
  c.translate((ox + 10) * DPR, (PAD.t + iH / 2) * DPR);
  c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(yLabel, 0, 0);
  c.restore();
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const v = rMax * (1 - g / 4);
    c.fillText(v < 10 ? v.toFixed(2) : v.toFixed(1), (ox + PAD.l - 3) * DPR, (PAD.t + g * iH / 4) * DPR);
  }
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const dr = Math.abs(r2 - r1);
  document.getElementById('readout').innerHTML = [
    { label: 'r₁',  value: (r1 * 100).toFixed(2) + ' cm' },
    { label: 'r₂',  value: (r2 * 100).toFixed(2) + ' cm' },
    { label: 'Δr',  value: (dr * 100).toFixed(2) + ' cm' },
    { label: 'Δx',  value: (dr * 200).toFixed(2) + ' cm' },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  animFrac = (animFrac + ANIM_DT) % 1;
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const bSec = Lab.Section('Campo Magnetico');
  bSec.add(Lab.Slider({ label: 'B  [T]  (nel piano, ⊗)', min: 0.05, max: 3, step: 0.01, value: P.B,
    onChange: v => { P.B = v; refresh(); } }));
  ctrl.appendChild(bSec.el);

  const vSec = Lab.Section('Velocità  (da selettore)');
  vSec.add(Lab.Slider({ label: 'v₀  [×10⁵ m/s]', min: 1, max: 100, step: 1, value: P.v,
    onChange: v => { P.v = v; refresh(); } }));
  ctrl.appendChild(vSec.el);

  const iSec = Lab.Section('Ione');
  iSec.add(Lab.Slider({ label: 'Carica q  [e]', min: 1, max: 4, step: 1, value: P.q,
    onChange: v => { P.q = v; refresh(); } }));
  ctrl.appendChild(iSec.el);

  const mSec = Lab.Section('Isotopi');
  mSec.add(Lab.Slider({ label: 'Massa m₁  [u]', min: 1, max: 200, step: 1, value: P.m1,
    onChange: v => { P.m1 = v; refresh(); } }));
  mSec.add(Lab.Slider({ label: 'Massa m₂  [u]', min: 1, max: 200, step: 1, value: P.m2,
    onChange: v => { P.m2 = v; refresh(); } }));
  ctrl.appendChild(mSec.el);
}

function refresh() { compute(); }

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
}

window.addEventListener('resize', () => { resizeCanvases(); refresh(); });

function init() {
  resizeCanvases();
  buildControls();
  compute();
  computeLayout();
  requestAnimationFrame(loop);
}

init();
