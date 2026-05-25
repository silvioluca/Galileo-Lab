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
// Physics in right-hand coords: x right, y up, z out of screen.
// Bz > 0 → B along +z; v_⊥ creates circular orbit in XY; vz creates helix along z.
const P = {
  Bz:        1.5,
  v0:        120,   // in-plane speed (starts along +x)
  vz:        0,     // initial z velocity (along B field)
  q:         1.0,
  m:         1.0,
  showTrail: true,
  showForce: false,
};

/* ── Camera ──────────────────────────────────────────────────────────────── */
let camTheta = 0.45;   // azimuth (rad)
let camPhi   = 0.35;   // elevation (rad)
let zoom     = 1.0;
let panX     = 0;
let panY     = 0;

/* ── State ───────────────────────────────────────────────────────────────── */
let particle = null;
let paused   = false;

const TRAIL_LEN = 1500;
const SUBSTEPS  = 4;
const DT        = 1 / 60;

const NBUF  = 500;
const vpHist = new Float32Array(NBUF).fill(NaN); // v_perp history
const rHist  = new Float32Array(NBUF).fill(NaN); // r_L history
let histHead  = 0;
let histCount = 0;

/* ── Particle init ───────────────────────────────────────────────────────── */
function initParticle() {
  vpHist.fill(NaN); rHist.fill(NaN);
  histHead = 0; histCount = 0;
  particle = {
    x: 0, y: 0, z: 0,
    vx: P.v0, vy: 0, vz: P.vz,
    trail: [],
    color: '#00d4ff',
  };
}

/* ── Physics: F = q(v×B) in right-hand coords ───────────────────────────── */
// B = (0, 0, Bz); v×B = (vy·Bz, −vx·Bz, 0)
function accel(vx, vy, vz) {
  const qm = P.q / P.m;
  return [qm * vy * P.Bz, -qm * vx * P.Bz, 0];
}

/* ── RK4 step (6D state) ─────────────────────────────────────────────────── */
function rk4Step(p, dt) {
  const [c1,d1,e1] = accel(p.vx,           p.vy,           p.vz          );
  const [c2,d2,e2] = accel(p.vx+.5*dt*c1, p.vy+.5*dt*d1, p.vz+.5*dt*e1);
  const [c3,d3,e3] = accel(p.vx+.5*dt*c2, p.vy+.5*dt*d2, p.vz+.5*dt*e2);
  const [c4,d4,e4] = accel(p.vx+dt*c3,    p.vy+dt*d3,    p.vz+dt*e3   );

  const a1=p.vx, b1=p.vy, f1=p.vz;
  const a2=p.vx+.5*dt*c1, b2=p.vy+.5*dt*d1, f2=p.vz+.5*dt*e1;
  const a3=p.vx+.5*dt*c2, b3=p.vy+.5*dt*d2, f3=p.vz+.5*dt*e2;
  const a4=p.vx+dt*c3,    b4=p.vy+dt*d3,    f4=p.vz+dt*e3;

  p.x  += dt*(a1+2*a2+2*a3+a4)/6;
  p.y  += dt*(b1+2*b2+2*b3+b4)/6;
  p.z  += dt*(f1+2*f2+2*f3+f4)/6;
  p.vx += dt*(c1+2*c2+2*c3+c4)/6;
  p.vy += dt*(d1+2*d2+2*d3+d4)/6;
  p.vz += dt*(e1+2*e2+2*e3+e4)/6;

  p.trail.push({ x: p.x, y: p.y, z: p.z });
  if (p.trail.length > TRAIL_LEN) p.trail.shift();
}

/* ── Simulation step ─────────────────────────────────────────────────────── */
function step() {
  const dt = DT / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) rk4Step(particle, dt);

  const vp = Math.hypot(particle.vx, particle.vy);
  const wc = Math.abs(P.q * P.Bz / P.m);
  vpHist[histHead]  = vp;
  rHist[histHead]   = wc > 0.01 ? vp / wc : NaN;
  histHead  = (histHead + 1) % NBUF;
  histCount = Math.min(histCount + 1, NBUF);
}

/* ── 3D projection (orthographic orbit camera) ───────────────────────────── */
function proj(wx, wy, wz) {
  // Rotate around Y (azimuth)
  const ct = Math.cos(camTheta), st = Math.sin(camTheta);
  const x1 = wx*ct - wz*st;
  const z1 = wx*st + wz*ct;
  // Rotate around X (elevation)
  const cp = Math.cos(camPhi), sp = Math.sin(camPhi);
  const y1 =  wy*cp - z1*sp;
  const z2 =  wy*sp + z1*cp;
  return {
    sx: SW/2 + panX + x1*zoom,
    sy: SH/2 + panY - y1*zoom,
    depth: z2,
  };
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save();
  ctx.scale(DPR, DPR);

  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);

  drawBField(dark);
  if (particle) {
    if (P.showTrail) {
      drawShadowTrail(particle, dark);
      drawTrail(particle);
    }
    drawParticle(particle, dark);
    if (P.showForce) drawForceVector(particle, dark);
  }
  drawAxesGizmo(dark);
  drawHint(dark);

  ctx.restore();
}

function drawBField(dark) {
  if (Math.abs(P.Bz) < 0.01) return;
  const a   = Math.min(0.28, Math.abs(P.Bz) / 3 * 0.28);
  const col = dark ? `rgba(0,212,255,${a})` : `rgba(0,100,180,${a * 0.85})`;
  const L   = 45;
  const S   = 75;
  const sgn = Math.sign(P.Bz);

  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = col;
  ctx.lineWidth = 1;

  for (let gx = -225; gx <= 225; gx += S) {
    for (let gy = -225; gy <= 225; gy += S) {
      const tail = proj(gx, gy, -sgn * L);
      const head = proj(gx, gy,  sgn * L);
      const ang = Math.atan2(head.sy - tail.sy, head.sx - tail.sx);
      ctx.beginPath(); ctx.moveTo(tail.sx, tail.sy); ctx.lineTo(head.sx, head.sy); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(head.sx, head.sy);
      ctx.lineTo(head.sx - 5*Math.cos(ang-0.5), head.sy - 5*Math.sin(ang-0.5));
      ctx.lineTo(head.sx - 5*Math.cos(ang+0.5), head.sy - 5*Math.sin(ang+0.5));
      ctx.closePath(); ctx.fill();
    }
  }

  // B field label (top-right)
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.72)' : 'rgba(0,100,180,0.72)';
  ctx.font = 'bold 11px "Space Mono", monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(`B = ${Math.abs(P.Bz).toFixed(2)} ${P.Bz >= 0 ? '⊙' : '⊗'} ẑ`, SW - 10, 10);
  ctx.restore();
}

// Axes gizmo fixed in top-left corner — rotates with camera but stays on screen.
function drawAxesGizmo(dark) {
  const OX = 100, OY = 100; // anchor (CSS px from top-left)
  const L  = 38;           // arm length in CSS px
  const ct = Math.cos(camTheta), st = Math.sin(camTheta);
  const cp = Math.cos(camPhi),   sp = Math.sin(camPhi);

  // Project a unit world vector to a 2D screen offset (no zoom/pan, fixed scale L)
  function axisDir(wx, wy, wz) {
    const x1 = wx*ct - wz*st;
    const z1 = wx*st + wz*ct;
    const y1 = wy*cp - z1*sp;
    return { dx: x1 * L, dy: -y1 * L };
  }

  const axes = [
    { d: axisDir(1,0,0), col: '#ff5555', lbl: 'X' },
    { d: axisDir(0,1,0), col: '#55cc55', lbl: 'Y' },
    { d: axisDir(0,0,1), col: '#00d4ff', lbl: 'Z' },
  ];

  ctx.save();
  for (const { d, col, lbl } of axes) {
    const ex = OX + d.dx, ey = OY + d.dy;
    const ang = Math.atan2(d.dy, d.dx);
    const alpha = dark ? 'cc' : 'aa';
    ctx.strokeStyle = col + alpha;
    ctx.fillStyle   = col + alpha;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(OX, OY); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 7*Math.cos(ang-0.4), ey - 7*Math.sin(ang-0.4));
    ctx.lineTo(ex - 7*Math.cos(ang+0.4), ey - 7*Math.sin(ang+0.4));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = col;
    ctx.font = 'bold 10px "Space Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(lbl, ex + 11*Math.cos(ang), ey + 11*Math.sin(ang));
  }
  ctx.restore();
}

function drawForceVector(p, dark) {
  const Fx = P.q * p.vy * P.Bz;
  const Fy = -P.q * p.vx * P.Bz;
  const Fmag = Math.hypot(Fx, Fy);
  if (Fmag < 0.5) return;

  // Fixed arrow length in world units (stays proportional to zoom)
  const ARROW = 55;
  const scale = ARROW / Fmag;
  const { sx: x0, sy: y0 } = proj(p.x, p.y, p.z);
  const { sx: x1, sy: y1 } = proj(p.x + Fx*scale, p.y + Fy*scale, p.z);

  const ang = Math.atan2(y1 - y0, x1 - x0);
  const col = dark ? '#ff9944' : '#cc5500';

  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 10*Math.cos(ang-0.4), y1 - 10*Math.sin(ang-0.4));
  ctx.lineTo(x1 - 10*Math.cos(ang+0.4), y1 - 10*Math.sin(ang+0.4));
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 10px "Space Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('F', x1 + 12*Math.cos(ang), y1 + 12*Math.sin(ang));
  ctx.restore();
}

function drawShadowTrail(p, dark) {
  const T = p.trail;
  if (T.length < 2) return;
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let pt = proj(T[0].x, T[0].y, 0);
  ctx.moveTo(pt.sx, pt.sy);
  for (let i = 1; i < T.length; i++) {
    pt = proj(T[i].x, T[i].y, 0);
    ctx.lineTo(pt.sx, pt.sy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTrail(p) {
  const T = p.trail;
  if (T.length < 2) return;
  const BATCHES = 8;
  ctx.save();
  ctx.lineWidth = 1.5;
  for (let b = 0; b < BATCHES; b++) {
    const s = Math.floor(b       * T.length / BATCHES);
    const e = Math.floor((b + 1) * T.length / BATCHES);
    if (e <= s + 1) continue;
    ctx.globalAlpha = ((b + 1) / BATCHES) * 0.68;
    ctx.strokeStyle = p.color;
    ctx.beginPath();
    let pt = proj(T[s].x, T[s].y, T[s].z);
    ctx.moveTo(pt.sx, pt.sy);
    for (let i = s + 1; i < e; i++) {
      pt = proj(T[i].x, T[i].y, T[i].z);
      ctx.lineTo(pt.sx, pt.sy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticle(p, dark) {
  const { sx, sy } = proj(p.x, p.y, p.z);

  // Glow
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
  g.addColorStop(0, dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,120,200,0.45)');
  g.addColorStop(1, 'rgba(0,212,255,0)');
  ctx.beginPath(); ctx.arc(sx, sy, 14, 0, 2*Math.PI);
  ctx.fillStyle = g; ctx.fill();

  // Body
  ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 2*Math.PI);
  ctx.fillStyle = p.color; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.stroke();

  // Sign
  ctx.fillStyle = '#000';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(P.q >= 0 ? '+' : '−', sx, sy + 0.5);

  // Shadow dot + dashed stem at z=0
  const { sx: shx, sy: shy } = proj(p.x, p.y, 0);
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.18)' : 'rgba(0,120,200,0.15)';
  ctx.lineWidth = 0.7;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(sx, sy); ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.arc(shx, shy, 3, 0, 2*Math.PI);
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.22)' : 'rgba(0,120,200,0.18)';
  ctx.fill();
}

function drawHint(dark) {
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
  ctx.font = '8px "Space Mono", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('drag: ruota · scroll: zoom · ctrl+drag: pan · dbl: reset vista', 8, SH - 6);
}

/* ── Graphs ──────────────────────────────────────────────────────────────── */
function drawGraphs() {
  if (!GW || !GH) return;
  const dark   = dk();
  const amber  = dark ? '#ffb830' : '#c07000';
  const axCol  = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
  const lblCol = dark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.45)';

  gctx.clearRect(0, 0, gc.width, gc.height);

  const PAD  = { t: 22, b: 28, l: 44, r: 10 };
  const panW = Math.floor(GW / 2);
  const n    = histCount;
  const start = (histHead - n + NBUF) % NBUF;
  const vps = new Array(n), rs = new Array(n);
  for (let i = 0; i < n; i++) {
    vps[i] = vpHist[(start + i) % NBUF];
    rs[i]  = rHist[(start + i)  % NBUF];
  }

  panelGraph(0,    panW, 'v_⊥  [px/s]', '#00d4ff', vps, PAD, axCol, lblCol);
  panelGraph(panW, panW, 'r_L  [px]',   amber,     rs,  PAD, axCol, lblCol);
}

function panelGraph(ox, pw, ylabel, lineCol, data, PAD, axCol, lblCol) {
  const iW   = pw  - PAD.l - PAD.r;
  const iH   = GH  - PAD.t - PAD.b;
  const dark = dk();

  gctx.fillStyle = dark ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.015)';
  gctx.fillRect(ox * DPR, 0, pw * DPR, GH * DPR);

  if (ox > 0) {
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath(); gctx.moveTo(ox*DPR, 0); gctx.lineTo(ox*DPR, GH*DPR); gctx.stroke();
  }

  const valid = data.filter(isFinite);
  if (valid.length < 2) return;

  const lo  = Math.min(...valid) * 0.85;
  const hi  = Math.max(...valid) * 1.15;
  const rng = hi - lo || 1;
  const mY0 = (PAD.t + iH) * DPR;

  const mX = i => (ox + PAD.l + (i / (data.length - 1)) * iW) * DPR;
  const mY = v => (PAD.t + (1 - (v - lo) / rng) * iH) * DPR;

  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  gctx.lineWidth = DPR;
  for (let g = 0; g <= 4; g++) {
    const y = (PAD.t + g*iH/4) * DPR;
    gctx.beginPath(); gctx.moveTo((ox+PAD.l)*DPR, y); gctx.lineTo((ox+PAD.l+iW)*DPR, y); gctx.stroke();
  }

  gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
  gctx.beginPath();
  gctx.moveTo((ox+PAD.l)*DPR, PAD.t*DPR); gctx.lineTo((ox+PAD.l)*DPR, mY0);
  gctx.lineTo((ox+PAD.l+iW)*DPR, mY0); gctx.stroke();

  gctx.fillStyle = lblCol;
  gctx.font = `${9*DPR}px "Space Mono", monospace`;
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const v = hi - g*rng/4;
    gctx.fillText(v < 10 ? v.toFixed(1) : v.toFixed(0), (ox+PAD.l-3)*DPR, (PAD.t+g*iH/4)*DPR);
  }

  gctx.font = `${8*DPR}px "Space Mono", monospace`;
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('t →', (ox+PAD.l+iW/2)*DPR, (PAD.t+iH+3)*DPR);

  gctx.save();
  gctx.translate((ox+10)*DPR, (PAD.t+iH/2)*DPR);
  gctx.rotate(-Math.PI/2);
  gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
  gctx.fillText(ylabel, 0, 0);
  gctx.restore();

  gctx.strokeStyle = lineCol; gctx.lineWidth = 1.5*DPR;
  gctx.beginPath();
  let first = true;
  for (let i = 0; i < data.length; i++) {
    if (!isFinite(data[i])) { first = true; continue; }
    first ? gctx.moveTo(mX(i), mY(data[i])) : gctx.lineTo(mX(i), mY(data[i]));
    first = false;
  }
  gctx.stroke();
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  if (!particle) return;
  const vp  = Math.hypot(particle.vx, particle.vy);
  const vpa = Math.abs(particle.vz);
  const wc  = Math.abs(P.q * P.Bz / P.m);
  const rL  = wc > 0.01 ? (vp / wc).toFixed(1) : '∞';
  const Tc  = wc > 0.01 ? (2 * Math.PI / wc).toFixed(3) : '∞';
  const pitch = (wc > 0.01 && vp > 0.1)
    ? ((2 * Math.PI * vp / wc) * (vpa / vp)).toFixed(1) + ' px'
    : '—';

  document.getElementById('readout').innerHTML = [
    { label: 'v_⊥',   value: vp.toFixed(1) + ' px/s' },
    { label: 'v_∥',   value: particle.vz.toFixed(1) + ' px/s' },
    { label: 'ω_c',   value: wc.toFixed(3) + ' rad/s' },
    { label: 'r_L',   value: rL + ' px' },
    { label: 'T_c',   value: Tc + ' s' },
    { label: 'passo', value: pitch },
  ].map(it =>
    `<span class="readout-item"><span class="readout-label">${it.label}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Mouse / zoom interaction ────────────────────────────────────────────── */
let drag = null;

sc.addEventListener('mousedown', e => {
  e.preventDefault();
  const mode = (e.ctrlKey || e.button === 2) ? 'pan' : 'orbit';
  drag = { mode, x0: e.clientX, y0: e.clientY, th0: camTheta, ph0: camPhi, px0: panX, py0: panY };
});
sc.addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (drag.mode === 'orbit') {
    camTheta = drag.th0 + dx * 0.008;
    camPhi   = Math.max(-1.48, Math.min(1.48, drag.ph0 - dy * 0.008));
  } else {
    panX = drag.px0 + dx;
    panY = drag.py0 + dy;
  }
});
sc.addEventListener('mouseup',    () => { drag = null; });
sc.addEventListener('mouseleave', () => { drag = null; });
sc.addEventListener('contextmenu', e => e.preventDefault());
sc.addEventListener('wheel', e => {
  e.preventDefault();
  zoom = Math.max(0.1, Math.min(25, zoom * (e.deltaY > 0 ? 0.92 : 1.087)));
}, { passive: false });
sc.addEventListener('dblclick', () => {
  camTheta = 0.45; camPhi = 0.35; zoom = 1.0; panX = 0; panY = 0;
});

/* ── Touch support ───────────────────────────────────────────────────────── */
let touch0 = null, pinch0 = null;
sc.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0];
    touch0 = { x0: t.clientX, y0: t.clientY, th0: camTheta, ph0: camPhi };
    pinch0 = null;
  } else if (e.touches.length === 2) {
    pinch0 = { d0: Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY), z0: zoom };
    touch0 = null;
  }
}, { passive: false });
sc.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && touch0) {
    const t = e.touches[0];
    camTheta = touch0.th0 + (t.clientX - touch0.x0) * 0.008;
    camPhi   = Math.max(-1.48, Math.min(1.48, touch0.ph0 - (t.clientY - touch0.y0) * 0.008));
  } else if (e.touches.length === 2 && pinch0) {
    const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    zoom = Math.max(0.1, Math.min(25, pinch0.z0 * d / pinch0.d0));
  }
}, { passive: false });
sc.addEventListener('touchend', () => { touch0 = null; pinch0 = null; });

/* ── Controls ────────────────────────────────────────────────────────────── */
let pauseBtn;

function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const magSec = Lab.Section('Campo Magnetico B');
  magSec.add(Lab.Slider({ label: 'B_z  (+ = uscente)', min: -3, max: 3, step: 0.05, value: P.Bz,
    onChange: v => { P.Bz = v; } }));
  ctrl.appendChild(magSec.el);

  const pSec = Lab.Section('Particella');
  pSec.add(Lab.Slider({ label: 'Carica q', min: -2, max: 2, step: 0.1, value: P.q,
    onChange: v => { P.q = v; } }));
  pSec.add(Lab.Slider({ label: 'Massa m', min: 0.5, max: 5, step: 0.1, value: P.m,
    onChange: v => { P.m = v; } }));
  pSec.add(Lab.Slider({ label: 'v_⊥  (piano XY)  [px/s]', min: 0, max: 300, step: 5, value: P.v0,
    onChange: v => { P.v0 = v; initParticle(); } }));
  pSec.add(Lab.Slider({ label: 'v_∥  (lungo B)  [px/s]', min: -200, max: 200, step: 5, value: P.vz,
    onChange: v => { P.vz = v; initParticle(); } }));
  ctrl.appendChild(pSec.el);

  const visSec = Lab.Section('Visualizzazione');
  visSec.add(Lab.Toggle({ label: 'Traiettoria', value: P.showTrail,
    onChange: v => { P.showTrail = v; } }));
  visSec.add(Lab.Toggle({ label: 'Vettore forza F', value: P.showForce,
    onChange: v => { P.showForce = v; } }));
  ctrl.appendChild(visSec.el);

  const cmdSec = Lab.Section('Comandi');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:4px;';

  pauseBtn = document.createElement('button');
  pauseBtn.className = 'btn-primary'; pauseBtn.style.flex = '1';
  pauseBtn.textContent = '⏸  PAUSA';
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶  RIPRENDI' : '⏸  PAUSA';
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-secondary'; resetBtn.style.flex = '1';
  resetBtn.textContent = '↺  RESET';
  resetBtn.addEventListener('click', initParticle);

  const camBtn = document.createElement('button');
  camBtn.className = 'btn-secondary'; camBtn.style.cssText = 'flex:1;margin-top:6px;';
  camBtn.textContent = '⊙  VISTA';
  camBtn.addEventListener('click', () => {
    camTheta = 0.45; camPhi = 0.35; zoom = 1.0; panX = 0; panY = 0;
  });

  row.append(pauseBtn, resetBtn);
  cmdSec.el.appendChild(row);
  cmdSec.el.appendChild(camBtn);
  ctrl.appendChild(cmdSec.el);
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  const rd   = area.querySelector('.readout-bar');
  const rdH  = rd ? rd.clientHeight || 48 : 48;
  const gaH  = ga.clientHeight || 200;

  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);

  sc.width  = Math.round(SW * DPR); sc.height = Math.round(SH * DPR);
  sc.style.width  = SW + 'px';      sc.style.height = SH + 'px';

  GW = area.clientWidth; GH = gaH;
  gc.width  = Math.round(GW * DPR); gc.height = Math.round(GH * DPR);
  gc.style.width  = GW + 'px';      gc.style.height = GH + 'px';
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (!paused) {
    step();
    drawSim();
    drawGraphs();
    updateReadout();
  }
  requestAnimationFrame(loop);
}

/* ── Init ────────────────────────────────────────────────────────────────── */
function init() {
  resizeCanvases();
  buildControls();
  initParticle();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => { resizeCanvases(); initParticle(); });
init();
