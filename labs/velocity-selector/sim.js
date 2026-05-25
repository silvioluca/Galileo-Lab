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

/* ── Parameters ──────────────────────────────────────────────────────────── */
// Physics: x right, y up. E along +y. B along +z (out of screen). m = 1 kg implicit.
// Forces are both vertical: F_E = qE,  F_B = −q·vx·B  (vx constant, dvx/dt = 0).
// Parabolic trajectory: x=vx·t, y=y0+vy0·t+½·ay·t²,  ay=q(E−vx·B).
// Balance at v_sel: vx = E/B  →  v0 = E/(B·cos θ).
const P = {
  E:          5.0,    // electric field [N/C]
  B:          2.0,    // magnetic field [T], +z out of screen
  v0:         2.5,    // entry speed [m/s]
  q:          1.0,    // charge [C]
  d:          2.0,    // plate separation [m]
  L:          10.0,   // capacitor length [m]
  y0:         0.0,    // entry y position [m]
  angle:      0,      // entry angle from horizontal [°]
  showForces: false,
  beamMode:   false,
};

/* ── Trajectory computation (analytical — exact parabola) ────────────────── */
function computeTrajForV(v0) {
  const rad = P.angle * Math.PI / 180;
  const vx  = v0 * Math.cos(rad);
  const vy0 = v0 * Math.sin(rad);
  const ay  = P.q * (P.E - vx * P.B);
  const hd  = P.d / 2;
  const y0c = Math.max(-hd * 0.98, Math.min(hd * 0.98, P.y0));
  const N   = 300;
  const tMax = Math.abs(vx) > 0.01 ? P.L / Math.abs(vx) : 30;
  const dt  = tMax / N;

  const path = [];
  let hitPlate = false;

  for (let i = 0; i <= N; i++) {
    const t = i * dt;
    const x = vx * t;
    const y = y0c + vy0 * t + 0.5 * ay * t * t;

    if (y >= hd || y <= -hd) {
      const yT = y >= hd ? hd : -hd;
      if (i > 0) {
        const tp = (i - 1) * dt;
        const yp = y0c + vy0 * tp + 0.5 * ay * tp * tp;
        const f  = (yT - yp) / (y - yp);
        path.push({ x: vx * (tp + f * dt), y: yT });
      }
      hitPlate = true;
      break;
    }
    path.push({ x, y });
    if (x >= P.L) break;
  }

  if (path.length === 0) path.push({ x: 0, y: y0c });
  const last = path[path.length - 1];
  return { path, exitX: last.x, exitY: last.y, hitPlate, vx, vy0, ay, y0c };
}

/* ── Single-particle state ───────────────────────────────────────────────── */
let traj      = null;
let animIdx   = 0;
let animSpeed = 1;

function computeTraj() {
  traj      = computeTrajForV(P.v0);
  animIdx   = 0;
  animSpeed = Math.max(1, Math.floor(traj.path.length / 120));
}

/* ── Beam state (7 particles, centered on v_sel) ─────────────────────────── */
const BEAM_RATIOS = [1/3, 1/2, 2/3, 1, 3/2, 2, 3]; // relative to center
let beamTrajs = [];
let beamT = 0, beamMaxT = 5, beamDT = 0.04;

function vSel() {
  const cosA = Math.cos(P.angle * Math.PI / 180);
  return (Math.abs(P.B) > 0.01 && Math.abs(cosA) > 0.01)
    ? P.E / (P.B * cosA) : null;
}

function computeBeamTrajs() {
  const vs = vSel();
  const center = (vs !== null && vs > 0.2 && vs < 30) ? vs : P.v0;

  beamTrajs = [];
  for (let i = 0; i < BEAM_RATIOS.length; i++) {
    const v = center * BEAM_RATIOS[i];
    if (v < 0.05) continue;
    const hue = 240 - i * 40;           // blue(240) → green(120) → red(0)
    const td  = computeTrajForV(v);
    beamTrajs.push({ ...td, v, color: `hsl(${hue},85%,62%)` });
  }

  const minVx = Math.min(...beamTrajs.filter(t => t.vx > 0.01).map(t => t.vx));
  beamMaxT = isFinite(minVx) ? P.L / minVx * 1.05 : 20;
  beamDT   = beamMaxT / 150;
  beamT    = 0;
}

/* ── Canvas coordinate mapping ───────────────────────────────────────────── */
const PADPX = 28;
function wx(x) { return PADPX + (x + 1) / (P.L + 2) * (SW - 2 * PADPX); }
function wy(y) {
  const hr = P.d / 2 + Math.max(0.4, P.d * 0.4);
  return SH / 2 - (y / hr) * (SH / 2 - PADPX);
}

/* ── Arrow helper ────────────────────────────────────────────────────────── */
function arrow(c, x0, y0, x1, y1, tip) {
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x1 - tip * Math.cos(a - 0.45), y1 - tip * Math.sin(a - 0.45));
  c.lineTo(x1 - tip * Math.cos(a + 0.45), y1 - tip * Math.sin(a + 0.45));
  c.closePath(); c.fill();
}

/* ── Main draw ───────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);

  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);

  drawCapacitor(dark);
  drawEField(dark);
  drawBField(dark);

  if (P.beamMode) {
    drawBeamTrajectories(dark);
    drawBeamParticles(dark);
  } else if (traj) {
    drawTrajectory(dark);
    drawExitMarker(dark);
    if (P.showForces) drawForceArrows(dark);
    drawAnimParticle(dark);
  }

  drawFieldLabels(dark);
  ctx.restore();
}

/* ── Capacitor ───────────────────────────────────────────────────────────── */
function drawCapacitor(dark) {
  const x0 = wx(0), x1 = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  const pH = 8;

  ctx.fillStyle = dark ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.018)';
  ctx.fillRect(x0, yt, x1 - x0, yb - yt);

  ctx.fillStyle = dark ? '#c04040' : '#992222';
  ctx.fillRect(x0, yt - pH, x1 - x0, pH);
  ctx.fillStyle = dark ? '#4466cc' : '#224499';
  ctx.fillRect(x0, yb, x1 - x0, pH);

  ctx.font = 'bold 12px "Space Mono", monospace';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  ctx.fillStyle = dark ? '#ff8888' : '#cc2222';
  ctx.fillText('+', x0 - 7, yt - pH / 2);
  ctx.fillStyle = dark ? '#88aaff' : '#2244cc';
  ctx.fillText('−', x0 - 7, yb + pH / 2);

  // Center line
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(x0, wy(0)); ctx.lineTo(x1, wy(0)); ctx.stroke();
  ctx.restore();

  // Entry velocity arrow at the given angle
  const hd  = P.d / 2;
  const y0c = Math.max(-hd * 0.98, Math.min(hd * 0.98, P.y0));
  const rad = P.angle * Math.PI / 180;
  const L   = 32; // px
  // Canvas y is inverted: upward world → negative canvas y → tail_sy = wy(y0c) + L*sin(rad)
  const tailSx = wx(0) - L * Math.cos(rad);
  const tailSy = wy(y0c) + L * Math.sin(rad);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = dark ? 'rgba(0,212,255,0.4)' : 'rgba(0,100,180,0.4)';
  ctx.lineWidth = 1.5;
  arrow(ctx, tailSx, tailSy, wx(0), wy(y0c), 6);
  ctx.restore();
}

/* ── E field arrows ──────────────────────────────────────────────────────── */
function drawEField(dark) {
  if (Math.abs(P.E) < 0.01) return;
  const x0 = wx(0), x1 = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  const W = x1 - x0, H = yb - yt;
  const sgn = Math.sign(P.E);
  const alpha = Math.min(0.55, 0.12 + Math.abs(P.E) / 15 * 0.43);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle =
    dark ? `rgba(255,210,60,${alpha})` : `rgba(170,120,0,${alpha})`;
  ctx.lineWidth = 1.2;
  const NX = Math.max(3, Math.round(W / 65));
  const NY = Math.max(2, Math.round(H / 52));
  for (let i = 1; i <= NX; i++) {
    const cx = x0 + i * W / (NX + 1);
    for (let j = 1; j <= NY; j++) {
      const cy = yt + j * H / (NY + 1);
      const al = Math.min(H / (NY + 1) * 0.62, 26);
      arrow(ctx, cx, cy + sgn * al / 2, cx, cy - sgn * al / 2, 5);
    }
  }
  ctx.restore();
}

/* ── B field symbols ─────────────────────────────────────────────────────── */
function drawBField(dark) {
  if (Math.abs(P.B) < 0.01) return;
  const x0 = wx(0), x1 = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  const W = x1 - x0, H = yb - yt;
  const out = P.B > 0;
  const alpha = Math.min(0.6, 0.13 + Math.abs(P.B) / 5 * 0.47);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle =
    dark ? `rgba(0,212,255,${alpha})` : `rgba(0,80,160,${alpha})`;
  ctx.lineWidth = 1;
  const NX = Math.max(3, Math.round(W / 58));
  const NY = Math.max(2, Math.round(H / 48));
  for (let i = 1; i <= NX; i++) {
    for (let j = 1; j <= NY; j++) {
      const cx = x0 + i * W / (NX + 1);
      const cy = yt + j * H / (NY + 1);
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.stroke();
      if (out) {
        ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, 2 * Math.PI); ctx.fill();
      } else {
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx + 3, cy + 3);
        ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx - 3, cy + 3);
        ctx.stroke(); ctx.lineWidth = 1;
      }
    }
  }
  ctx.restore();
}

/* ── Single-particle trajectory (dashed) ─────────────────────────────────── */
function drawTrajectory(dark) {
  const path = traj.path;
  if (path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(255,245,80,0.78)' : 'rgba(150,110,0,0.82)';
  ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(wx(path[0].x), wy(path[0].y));
  for (let i = 1; i < path.length; i++) ctx.lineTo(wx(path[i].x), wy(path[i].y));
  ctx.stroke();
  ctx.restore();
}

/* ── Exit marker ─────────────────────────────────────────────────────────── */
function drawExitMarker(dark) {
  const { exitY, hitPlate } = traj;
  const xl = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  const sy = wy(exitY);

  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(255,245,80,0.28)' : 'rgba(150,110,0,0.28)';
  ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(xl, yt); ctx.lineTo(xl, yb); ctx.stroke();
  ctx.restore();

  if (!hitPlate) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = dark ? '#ffdd55' : '#906800';
    ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xl - 5, sy); ctx.lineTo(xl + 10, sy); ctx.stroke();
    ctx.font = '9px "Space Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`y_out = ${exitY.toFixed(3)} m`, xl + 13, sy);
    ctx.restore();
  }
}

/* ── Force vectors on animated particle ──────────────────────────────────── */
function drawForceArrows(dark) {
  const pt = traj.path[Math.min(animIdx, traj.path.length - 1)];
  const sx = wx(pt.x), sy = wy(pt.y);

  const FE =  P.q * P.E;           // Coulomb: vertical
  const FB = -P.q * traj.vx * P.B; // Lorentz: vertical (vx constant)
  const fMax = Math.max(Math.abs(FE), Math.abs(FB), 0.1);
  const SCALE = P.d * 0.30;        // max arrow in world units = 30% of half-sep

  // F_E — yellow, slightly left of particle
  if (Math.abs(FE) > 0.01) {
    const tipY = wy(pt.y + (FE / fMax) * SCALE);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = dark ? '#ffdd44' : '#aa8800';
    ctx.lineWidth = 2;
    arrow(ctx, sx - 9, sy, sx - 9, tipY, 7);
    ctx.font = 'bold 9px "Space Mono", monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('F_E', sx - 16, (sy + tipY) / 2);
    ctx.restore();
  }

  // F_B — magenta, slightly right of particle
  if (Math.abs(FB) > 0.01) {
    const tipY = wy(pt.y + (FB / fMax) * SCALE);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = dark ? '#ff66aa' : '#cc1166';
    ctx.lineWidth = 2;
    arrow(ctx, sx + 9, sy, sx + 9, tipY, 7);
    ctx.font = 'bold 9px "Space Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('F_B', sx + 16, (sy + tipY) / 2);
    ctx.restore();
  }
}

/* ── Animated single particle ────────────────────────────────────────────── */
function drawAnimParticle(dark) {
  const { x, y } = traj.path[Math.min(animIdx, traj.path.length - 1)];
  const sx = wx(x), sy = wy(y);

  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
  g.addColorStop(0, dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,140,210,0.45)');
  g.addColorStop(1, 'rgba(0,212,255,0)');
  ctx.beginPath(); ctx.arc(sx, sy, 12, 0, 2 * Math.PI);
  ctx.fillStyle = g; ctx.fill();

  ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#00d4ff'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = '#000';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(P.q >= 0 ? '+' : '−', sx, sy + 0.5);
}

/* ── Beam: dashed trajectories ───────────────────────────────────────────── */
function drawBeamTrajectories(dark) {
  for (const bt of beamTrajs) {
    if (bt.path.length < 2) continue;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = bt.color;
    ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(wx(bt.path[0].x), wy(bt.path[0].y));
    for (let i = 1; i < bt.path.length; i++)
      ctx.lineTo(wx(bt.path[i].x), wy(bt.path[i].y));
    ctx.stroke();
    ctx.restore();
  }
}

/* ── Beam: animated particles (analytical positions) ─────────────────────── */
function drawBeamParticles(dark) {
  for (const bt of beamTrajs) {
    const x = bt.vx * beamT;
    if (x < -0.01 || x > P.L + 0.01) continue;
    const y = bt.y0c + bt.vy0 * beamT + 0.5 * bt.ay * beamT * beamT;
    if (y < -P.d / 2 - 0.01 || y > P.d / 2 + 0.01) continue;
    const sx = wx(x), sy = wy(y);
    ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = bt.color; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
}

/* ── Field labels & v_sel annotation ─────────────────────────────────────── */
function drawFieldLabels(dark) {
  const x0 = wx(0), x1 = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  ctx.font = '9px "Space Mono", monospace';

  if (Math.abs(P.E) > 0.01) {
    ctx.fillStyle = dark ? 'rgba(255,210,60,0.75)' : 'rgba(150,110,0,0.82)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('E', x1 + 7, (yt + yb) / 2);
  }
  if (Math.abs(P.B) > 0.01) {
    ctx.fillStyle = dark ? 'rgba(0,212,255,0.72)' : 'rgba(0,80,160,0.78)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`B = ${Math.abs(P.B).toFixed(2)} ${P.B >= 0 ? '⊙' : '⊗'} ẑ`, x1 - 4, yb - 3);
  }

  const vs = vSel();
  if (vs !== null && vs > 0 && isFinite(vs)) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.28)';
    ctx.font = '8px "Space Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const label = P.angle !== 0
      ? `v_sel = E/(B·cosθ) = ${vs.toFixed(2)} m/s`
      : `v_sel = E/B = ${vs.toFixed(2)} m/s`;
    ctx.fillText(label, x0, yt - 12);
  }
}

/* ── Graph: F_y vs v₀ ───────────────────────────────────────────────────── */
function drawGraphs() {
  if (!GW || !GH) return;
  const dark   = dk();
  const axCol  = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)';
  const lblCol = dark ? 'rgba(255,255,255,0.48)' : 'rgba(0,0,0,0.42)';
  gctx.clearRect(0, 0, gc.width, gc.height);

  const PAD = { t: 24, b: 30, l: 50, r: 14 };
  const iW  = GW - PAD.l - PAD.r;
  const iH  = GH - PAD.t - PAD.b;

  gctx.fillStyle = dark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.012)';
  gctx.fillRect(0, 0, GW * DPR, GH * DPR);

  const vs   = vSel();
  const cosA = Math.cos(P.angle * Math.PI / 180);
  const vMax = Math.max(P.v0 * 1.7, vs !== null ? Math.abs(vs) * 1.7 : 0, 6);

  // F_y(v0) = q*(E − v0·cosθ·B)
  const fAt0   = P.q * P.E;
  const fAtMax = P.q * (P.E - vMax * cosA * P.B);
  const fAbs   = Math.max(Math.abs(fAt0), Math.abs(fAtMax), 0.5);
  const fMin   = -fAbs * 1.2, fMax_ = fAbs * 1.2, fRng = fMax_ - fMin;

  function gx(v) { return (PAD.l + v / vMax * iW) * DPR; }
  function gy(f) { return (PAD.t + (1 - (f - fMin) / fRng) * iH) * DPR; }

  // Grid
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  gctx.lineWidth = DPR;
  for (let g = 0; g <= 4; g++) {
    const y = (PAD.t + g * iH / 4) * DPR;
    gctx.beginPath(); gctx.moveTo(PAD.l * DPR, y); gctx.lineTo((PAD.l + iW) * DPR, y); gctx.stroke();
  }

  // F = 0 dashed
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';
  gctx.lineWidth = DPR; gctx.setLineDash([3 * DPR, 3 * DPR]);
  gctx.beginPath(); gctx.moveTo(PAD.l * DPR, gy(0)); gctx.lineTo((PAD.l + iW) * DPR, gy(0)); gctx.stroke();
  gctx.setLineDash([]);

  // Axes
  gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
  gctx.beginPath();
  gctx.moveTo(PAD.l * DPR, PAD.t * DPR); gctx.lineTo(PAD.l * DPR, (PAD.t + iH) * DPR);
  gctx.lineTo((PAD.l + iW) * DPR, (PAD.t + iH) * DPR); gctx.stroke();

  // F_y(v0) line — orange
  gctx.strokeStyle = dark ? '#ff9944' : '#cc5500';
  gctx.lineWidth = 2 * DPR;
  gctx.beginPath(); gctx.moveTo(gx(0), gy(fAt0)); gctx.lineTo(gx(vMax), gy(fAtMax)); gctx.stroke();

  // v_sel marker
  if (vs !== null && vs >= 0 && vs <= vMax) {
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.28)';
    gctx.lineWidth = DPR; gctx.setLineDash([3 * DPR, 3 * DPR]);
    gctx.beginPath(); gctx.moveTo(gx(vs), PAD.t * DPR); gctx.lineTo(gx(vs), (PAD.t + iH) * DPR); gctx.stroke();
    gctx.setLineDash([]);
    gctx.fillStyle = lblCol;
    gctx.font = `${8 * DPR}px "Space Mono", monospace`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText('v_sel', gx(vs), (PAD.t + iH + 3) * DPR);
  }

  // Beam dots on graph
  if (P.beamMode) {
    for (const bt of beamTrajs) {
      if (bt.v > vMax) continue;
      const fv = P.q * (P.E - bt.vx * P.B);
      if (fv < fMin || fv > fMax_) continue;
      gctx.beginPath(); gctx.arc(gx(bt.v), gy(fv), 3.5 * DPR, 0, 2 * Math.PI);
      gctx.fillStyle = bt.color; gctx.fill();
    }
  }

  // v0 cyan marker
  if (P.v0 >= 0 && P.v0 <= vMax) {
    gctx.strokeStyle = '#00d4ff'; gctx.lineWidth = 1.5 * DPR;
    gctx.beginPath(); gctx.moveTo(gx(P.v0), PAD.t * DPR); gctx.lineTo(gx(P.v0), (PAD.t + iH) * DPR); gctx.stroke();
    const fv0 = P.q * (P.E - P.v0 * cosA * P.B);
    if (fv0 >= fMin && fv0 <= fMax_) {
      gctx.beginPath(); gctx.arc(gx(P.v0), gy(fv0), 4 * DPR, 0, 2 * Math.PI);
      gctx.fillStyle = '#00d4ff'; gctx.fill();
    }
    gctx.fillStyle = dark ? 'rgba(0,212,255,0.65)' : 'rgba(0,100,180,0.7)';
    gctx.font = `${8 * DPR}px "Space Mono", monospace`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText('v₀', gx(P.v0), (PAD.t + iH + 3) * DPR);
  }

  // Axis labels
  gctx.fillStyle = lblCol;
  gctx.font = `${8 * DPR}px "Space Mono", monospace`;
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('v₀  [m/s]', (PAD.l + iW / 2) * DPR, (PAD.t + iH + 16) * DPR);

  gctx.save();
  gctx.translate(10 * DPR, (PAD.t + iH / 2) * DPR);
  gctx.rotate(-Math.PI / 2);
  gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
  gctx.fillText('F_y  [N]', 0, 0);
  gctx.restore();

  gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const v = fMax_ - g * fRng / 4;
    gctx.fillText(v.toFixed(1), (PAD.l - 3) * DPR, (PAD.t + g * iH / 4) * DPR);
  }

  // Title
  const titleStr = P.angle !== 0
    ? `F_y = q(E − v₀·cosθ·B)  [θ=${P.angle}°]`
    : 'F_y = q(E − v₀·B)';
  gctx.fillStyle = dark ? 'rgba(255,153,68,0.82)' : 'rgba(170,80,0,0.78)';
  gctx.font = `bold ${9 * DPR}px "Space Mono", monospace`;
  gctx.textAlign = 'left'; gctx.textBaseline = 'top';
  gctx.fillText(titleStr, PAD.l * DPR, 5 * DPR);
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const vs = vSel();

  if (P.beamMode) {
    document.getElementById('readout').innerHTML = [
      { label: 'v_sel',  value: vs !== null ? vs.toFixed(3) + ' m/s' : '∞' },
      { label: 'flusso', value: `${beamTrajs.length} particelle` },
      { label: 'selezionate', value: `${beamTrajs.filter(b => !b.hitPlate).length}` },
    ].map(r =>
      `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
    ).join('');
    return;
  }

  if (!traj) return;
  const { exitY, hitPlate, y0c } = traj;
  const dy = exitY - y0c;
  const stato = hitPlate              ? 'intercettata'
              : Math.abs(dy) < 0.002  ? 'selezionata ✓'
              : dy > 0                ? 'deflessa ↑'
                                      : 'deflessa ↓';

  document.getElementById('readout').innerHTML = [
    { label: 'v_sel',    value: vs !== null ? vs.toFixed(3) + ' m/s' : '∞' },
    { label: 'y_uscita', value: hitPlate ? '—' : exitY.toFixed(3) + ' m' },
    { label: 'Δy',       value: hitPlate ? '—' : dy.toFixed(3) + ' m' },
    { label: 'stato',    value: stato },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (P.beamMode) {
    beamT = (beamT + beamDT) % beamMaxT;
  } else if (traj) {
    animIdx = (animIdx + animSpeed) % traj.path.length;
  }
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const eSec = Lab.Section('Campo Elettrico');
  eSec.add(Lab.Slider({ label: 'E  [N/C]', min: 0, max: 15, step: 0.1, value: P.E,
    onChange: v => { P.E = v; refresh(); } }));
  ctrl.appendChild(eSec.el);

  const bSec = Lab.Section('Campo Magnetico');
  bSec.add(Lab.Slider({ label: 'B  [T]  (+ = uscente)', min: -5, max: 5, step: 0.05, value: P.B,
    onChange: v => { P.B = v; refresh(); } }));
  ctrl.appendChild(bSec.el);

  const pSec = Lab.Section('Particella');
  pSec.add(Lab.Slider({ label: 'Carica q  [C]', min: -2, max: 2, step: 0.1, value: P.q,
    onChange: v => { P.q = v; refresh(); } }));
  pSec.add(Lab.Slider({ label: 'Velocità v₀  [m/s]', min: 0.1, max: 15, step: 0.05, value: P.v0,
    onChange: v => { P.v0 = v; refresh(); } }));
  pSec.add(Lab.Slider({ label: 'Angolo θ  [°]', min: -60, max: 60, step: 1, value: P.angle,
    onChange: v => { P.angle = v; refresh(); } }));
  pSec.add(Lab.Slider({ label: 'Altezza y₀  [m]', min: -2.4, max: 2.4, step: 0.05, value: P.y0,
    onChange: v => { P.y0 = v; refresh(); } }));
  ctrl.appendChild(pSec.el);

  const gSec = Lab.Section('Geometria');
  gSec.add(Lab.Slider({ label: 'd  [m]  (distanza piastre)', min: 1, max: 5, step: 0.1, value: P.d,
    onChange: v => { P.d = v; refresh(); } }));
  gSec.add(Lab.Slider({ label: 'L  [m]  (lunghezza)', min: 3, max: 20, step: 0.5, value: P.L,
    onChange: v => { P.L = v; refresh(); } }));
  ctrl.appendChild(gSec.el);

  const visSec = Lab.Section('Visualizzazione');
  visSec.add(Lab.Toggle({ label: 'Vettori F_E / F_B', value: P.showForces,
    onChange: v => { P.showForces = v; } }));
  visSec.add(Lab.Toggle({ label: 'Modalità flusso', value: P.beamMode,
    onChange: v => { P.beamMode = v; if (v) computeBeamTrajs(); } }));
  ctrl.appendChild(visSec.el);
}

function refresh() {
  computeTraj();
  if (P.beamMode) computeBeamTrajs();
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
}

window.addEventListener('resize', () => { resizeCanvases(); refresh(); });

function init() {
  resizeCanvases();
  buildControls();
  computeTraj();
  requestAnimationFrame(loop);
}

init();
