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

/* ── Physics box (arbitrary units) ──────────────────────────────────────── */
const BW = 400;
const BH = 280;

/* ── Parameters ──────────────────────────────────────────────────────────── */
const P = {
  N:          80,
  r:          3,      // particle radius (starts at minimum)
  sigma:      4.0,    // velocity std-dev per component; T ∝ σ²
  e:          1.0,    // coefficient of restitution (1=elastic, 0=perfectly inelastic)
  thermostat: false,  // velocity-rescaling thermostat (keeps σ = P.sigma)
  substeps:   6,
};

/* ── State ───────────────────────────────────────────────────────────────── */
let particles = [];
let paused    = false;
let scX = 1, scY = 1;   // physics → CSS-pixel scale

/* ── Statistics (ring buffer) ────────────────────────────────────────────── */
const NBUF     = 3000;
const pathBuf  = new Float32Array(NBUF);
const speedBuf = new Float32Array(NBUF);
let   nPath = 0, nSpeed = 0;

/* ── Temperature history ─────────────────────────────────────────────────── */
const NTEMP   = 300;   // ~5 s at 60 fps
const tempBuf = new Float32Array(NTEMP);
let   tempIdx = 0;

/* ── Pressure measurement ────────────────────────────────────────────────── */
let wallImpulseAcc = 0;   // accumulated |Δp| from wall bounces
let wallStepCount  = 0;   // substeps elapsed since last measurement
let measuredP      = 0;   // last computed pressure

/* ── Box-Muller Gaussian ─────────────────────────────────────────────────── */
function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/* ── Init particles ──────────────────────────────────────────────────────── */
function initParticles() {
  particles = [];
  pathBuf.fill(0); speedBuf.fill(0);
  nPath = 0; nSpeed = 0;

  tempBuf.fill(0); tempIdx = 0;
  wallImpulseAcc = 0; wallStepCount = 0; measuredP = 0;

  const maxTries = P.N * 600;
  for (let tries = 0; particles.length < P.N && tries < maxTries; tries++) {
    const x = P.r + Math.random() * (BW - 2 * P.r);
    const y = P.r + Math.random() * (BH - 2 * P.r);
    if (particles.some(q => Math.hypot(x - q.x, y - q.y) < 2 * P.r + 0.5)) continue;
    particles.push({
      x, y,
      vx: gauss() * P.sigma,
      vy: gauss() * P.sigma,
      fromX: x, fromY: y,
      pathLen: 0,
      hue: Math.random() * 360,
    });
  }
}

/* ── Record a path-length sample on collision ────────────────────────────── */
function record(p) {
  if (p.pathLen < 0.5) return;
  pathBuf[nPath % NBUF]   = p.pathLen;
  speedBuf[nSpeed % NBUF] = Math.hypot(p.vx, p.vy);
  nPath++; nSpeed++;
  p.fromX = p.x; p.fromY = p.y;
  p.pathLen = 0;
}

/* ── Physics step ────────────────────────────────────────────────────────── */
function step() {
  const r    = P.r;
  const dmin = 2 * r;
  const N    = particles.length;

  // Move + wall bounces
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.pathLen += Math.hypot(p.vx, p.vy);

    // Wall bounces are always elastic; accumulate impulse for pressure measurement
    if (p.x < r)    { wallImpulseAcc += 2*Math.abs(p.vx); p.x = r;    p.vx =  Math.abs(p.vx); record(p); }
    if (p.x > BW-r) { wallImpulseAcc += 2*Math.abs(p.vx); p.x = BW-r; p.vx = -Math.abs(p.vx); record(p); }
    if (p.y < r)    { wallImpulseAcc += 2*Math.abs(p.vy); p.y = r;    p.vy =  Math.abs(p.vy); record(p); }
    if (p.y > BH-r) { wallImpulseAcc += 2*Math.abs(p.vy); p.y = BH-r; p.vy = -Math.abs(p.vy); record(p); }
  }
  wallStepCount++;

  // Pair collisions O(N²)
  for (let i = 0; i < N - 1; i++) {
    const a = particles[i];
    for (let j = i + 1; j < N; j++) {
      const b  = particles[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= dmin * dmin || d2 < 1e-8) continue;

      const d  = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const dvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (dvn >= 0) continue; // separating

      // Equal-mass impulse with restitution e: factor=(1+e)/2
      // e=1 → elastic (full exchange), e=0 → perfectly inelastic (average normal velocity)
      const f = (1 + P.e) * 0.5;
      a.vx += f * dvn * nx; a.vy += f * dvn * ny;
      b.vx -= f * dvn * nx; b.vy -= f * dvn * ny;

      // Overlap correction
      const ov = (dmin - d) * 0.5;
      a.x -= ov * nx; a.y -= ov * ny;
      b.x += ov * nx; b.y += ov * ny;

      record(a);
      record(b);
    }
  }
}

/* ── Derived quantities ──────────────────────────────────────────────────── */
function computeSigma() {
  if (!particles.length) return P.sigma;
  let s = 0;
  for (const p of particles) s += p.vx * p.vx + p.vy * p.vy;
  return Math.sqrt(s / (2 * particles.length));
}

function lambdaTheory() {
  // 2D hard-disk mean free path: λ = A / (√2 · N · 2r)
  return (BW * BH) / (Math.SQRT2 * particles.length * 2 * P.r);
}

function lambdaMeasured() {
  const n = Math.min(nPath, NBUF);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += pathBuf[i];
  return s / n;
}

function pressureTheory() {
  // 2D ideal gas: P = N σ² / A  (units: mass·length⁻¹·time⁻²)
  const s = computeSigma();
  return particles.length * s * s / (BW * BH);
}

function applyThermostat() {
  if (!P.thermostat || !particles.length) return;
  const s = computeSigma();
  if (s < 1e-6) return;
  const scale = P.sigma / s;
  for (const p of particles) { p.vx *= scale; p.vy *= scale; }
}

/* ── Draw simulation canvas ──────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save();
  ctx.scale(DPR, DPR);

  // Background
  ctx.fillStyle = dark ? '#050a14' : '#d8e8f4';
  ctx.fillRect(0, 0, SW, SH);

  // Box border
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.22)' : 'rgba(0,80,160,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, SW - 1, SH - 1);

  const sig  = computeSigma();
  const vRef = sig * 3;
  const pr   = P.r * scX;

  // Trails — current free path segment
  ctx.lineWidth = 1;
  for (const p of particles) {
    ctx.strokeStyle = dark
      ? `hsla(${p.hue},70%,65%,0.14)`
      : `hsla(${p.hue},60%,35%,0.14)`;
    ctx.beginPath();
    ctx.moveTo(p.fromX * scX, p.fromY * scY);
    ctx.lineTo(p.x    * scX, p.y    * scY);
    ctx.stroke();
  }

  // Particles — colored by speed (blue=slow, red=fast)
  for (const p of particles) {
    const t   = Math.min(1, Math.hypot(p.vx, p.vy) / vRef);
    const hue = 240 - t * 240;
    const lum = dark ? 48 + t * 30 : 36 + t * 22;
    ctx.fillStyle = `hsl(${hue}, 82%, ${lum}%)`;
    ctx.beginPath(); ctx.arc(p.x * scX, p.y * scY, pr, 0, Math.PI * 2); ctx.fill();

    // Specular highlight
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.50)';
    ctx.beginPath();
    ctx.arc(p.x * scX - pr * 0.3, p.y * scY - pr * 0.3, pr * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ── Draw graphs ─────────────────────────────────────────────────────────── */
function drawGraphs() {
  if (!GW || !GH) return;
  const dark  = dk();
  const PAD     = { t: 22, b: 28, l: 44, r: 10 };
  const panW    = Math.floor(GW / 3);   // three equal panels
  const amber   = dark ? '#ffb830' : '#c07000';
  const axCol   = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';
  const lblCol  = dark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.44)';
  const barFill = dark ? 'rgba(0,212,255,0.48)' : 'rgba(0,100,200,0.42)';

  gctx.clearRect(0, 0, gc.width, gc.height);

  const sig = computeSigma();
  const lam = lambdaTheory();
  const nP  = Math.min(nPath,  NBUF);
  const nS  = Math.min(nSpeed, NBUF);

  /* ── Panel 1: Path length distribution P(ℓ) ─────────────────────────── */
  {
    const iW = panW - PAD.l - PAD.r;
    const iH = GH   - PAD.t  - PAD.b;

    gctx.fillStyle = dark ? 'rgba(0,212,255,0.03)' : 'rgba(0,120,200,0.04)';
    gctx.fillRect(0, 0, panW * DPR, GH * DPR);

    const BINS = 30;
    const xMax = lam * 4.5;
    const binW = xMax / BINS;
    const bins = new Float32Array(BINS);
    let maxBin = 0;

    for (let i = 0; i < nP; i++) {
      const b = Math.floor(pathBuf[i] / xMax * BINS);
      if (b >= 0 && b < BINS) { bins[b]++; if (bins[b] > maxBin) maxBin = bins[b]; }
    }

    // theoretical peak at ℓ=0: n * (binW/λ)
    const yMax = Math.max(maxBin, nP * (binW / Math.max(lam, 1)), 1) * 1.12;

    const mX  = v => (PAD.l + v / xMax * iW)       * DPR;
    const mY  = y => (PAD.t + (1 - y / yMax) * iH) * DPR;
    const mY0 = (PAD.t + iH) * DPR;

    // Bars
    for (let b = 0; b < BINS; b++) {
      if (!bins[b]) continue;
      gctx.fillStyle = barFill;
      gctx.fillRect(mX(b * binW), mY(bins[b]), mX((b + 1) * binW) - mX(b * binW) - 1, mY0 - mY(bins[b]));
    }

    // Theoretical exponential: P(ℓ) = (1/λ) e^{-ℓ/λ}
    if (nP >= 40 && lam > 0) {
      gctx.strokeStyle = amber; gctx.lineWidth = 1.8 * DPR;
      gctx.beginPath();
      for (let px = 0; px <= iW; px++) {
        const l = px / iW * xMax;
        const y = nP * (binW / lam) * Math.exp(-l / lam);
        const sx = (PAD.l + px) * DPR;
        px === 0 ? gctx.moveTo(sx, mY(y)) : gctx.lineTo(sx, mY(y));
      }
      gctx.stroke();
    }

    // λ dashed marker
    if (lam > 0 && lam < xMax) {
      const lx = mX(lam);
      gctx.strokeStyle = amber; gctx.lineWidth = DPR; gctx.setLineDash([3, 3]);
      gctx.beginPath(); gctx.moveTo(lx, PAD.t * DPR); gctx.lineTo(lx, mY0); gctx.stroke();
      gctx.setLineDash([]);
      gctx.fillStyle = amber;
      gctx.font = `${9 * DPR}px Space Mono, monospace`;
      gctx.textAlign = 'center'; gctx.textBaseline = 'top';
      gctx.fillText('λ', lx, (PAD.t + iH + 3) * DPR);
    }

    // Axes
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath();
    gctx.moveTo(PAD.l * DPR, PAD.t * DPR); gctx.lineTo(PAD.l * DPR, mY0);
    gctx.moveTo(PAD.l * DPR, mY0);         gctx.lineTo((PAD.l + iW) * DPR, mY0);
    gctx.stroke();

    // Title
    gctx.fillStyle = lblCol; gctx.font = `${10 * DPR}px Space Mono, monospace`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText('Cammini liberi  P(ℓ) = (1/λ) e^{-ℓ/λ}', (PAD.l + iW / 2) * DPR, 4 * DPR);

    // Sample count
    gctx.fillStyle = dark ? 'rgba(0,212,255,0.70)' : 'rgba(0,80,180,0.70)';
    gctx.font = `${9 * DPR}px Space Mono, monospace`;
    gctx.textAlign = 'left'; gctx.textBaseline = 'top';
    gctx.fillText(`n = ${nPath}`, PAD.l * DPR, 4 * DPR);

    if (nP < 40) {
      gctx.fillStyle = lblCol; gctx.font = `${10 * DPR}px Space Mono, monospace`;
      gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
      gctx.fillText('raccogliendo dati…', (PAD.l + iW / 2) * DPR, (PAD.t + iH / 2) * DPR);
    }
  }

  /* ── Panel 2: Speed distribution f(v) [Maxwell-Boltzmann 2D] ────────── */
  {
    const ox  = panW;
    const iW  = panW - PAD.l - PAD.r;
    const iH  = GH   - PAD.t  - PAD.b;

    gctx.fillStyle = dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.02)';
    gctx.fillRect(ox * DPR, 0, panW * DPR, GH * DPR);

    // Panel divider
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath(); gctx.moveTo(ox * DPR, 0); gctx.lineTo(ox * DPR, GH * DPR); gctx.stroke();

    const BINS  = 30;
    const vMax  = sig * 4.5;
    const binW  = vMax / BINS;
    const bins  = new Float32Array(BINS);
    let maxBin  = 0;

    for (let i = 0; i < nS; i++) {
      const b = Math.floor(speedBuf[i] / vMax * BINS);
      if (b >= 0 && b < BINS) { bins[b]++; if (bins[b] > maxBin) maxBin = bins[b]; }
    }

    // 2D Maxwell-Boltzmann peak at v=σ: n * binW * (1/σ) * exp(-1/2)
    const mbPeak = nS * binW * Math.exp(-0.5) / Math.max(sig, 0.01);
    const yMax   = Math.max(maxBin, mbPeak, 1) * 1.12;

    const mX  = v => (ox + PAD.l + v / vMax * iW)  * DPR;
    const mY  = y => (PAD.t + (1 - y / yMax) * iH) * DPR;
    const mY0 = (PAD.t + iH) * DPR;

    // Bars
    for (let b = 0; b < BINS; b++) {
      if (!bins[b]) continue;
      gctx.fillStyle = barFill;
      gctx.fillRect(mX(b * binW), mY(bins[b]), mX((b + 1) * binW) - mX(b * binW) - 1, mY0 - mY(bins[b]));
    }

    // Theoretical 2D MB: f(v) = (v/σ²) exp(−v²/2σ²)  [Rayleigh]
    if (nS >= 40 && sig > 0) {
      gctx.strokeStyle = amber; gctx.lineWidth = 1.8 * DPR;
      gctx.beginPath();
      for (let px = 1; px <= iW; px++) {
        const v  = px / iW * vMax;
        const y  = nS * binW * (v / (sig * sig)) * Math.exp(-v * v / (2 * sig * sig));
        const sx = (ox + PAD.l + px) * DPR;
        px === 1 ? gctx.moveTo(sx, mY(y)) : gctx.lineTo(sx, mY(y));
      }
      gctx.stroke();
    }

    // v̂ = σ (mode of 2D MB distribution)
    if (sig < vMax) {
      const vx = mX(sig);
      gctx.strokeStyle = amber; gctx.lineWidth = DPR; gctx.setLineDash([3, 3]);
      gctx.beginPath(); gctx.moveTo(vx, PAD.t * DPR); gctx.lineTo(vx, mY0); gctx.stroke();
      gctx.setLineDash([]);
      gctx.fillStyle = amber;
      gctx.font = `${9 * DPR}px Space Mono, monospace`;
      gctx.textAlign = 'center'; gctx.textBaseline = 'top';
      gctx.fillText('v̂=σ', vx, (PAD.t + iH + 3) * DPR);
    }

    // v_mean = σ√(π/2)
    const vmean = sig * Math.sqrt(Math.PI / 2);
    if (vmean < vMax) {
      const vx = mX(vmean);
      gctx.strokeStyle = dark ? 'rgba(180,255,180,0.60)' : 'rgba(0,120,0,0.55)';
      gctx.lineWidth = DPR; gctx.setLineDash([2, 4]);
      gctx.beginPath(); gctx.moveTo(vx, PAD.t * DPR); gctx.lineTo(vx, mY0); gctx.stroke();
      gctx.setLineDash([]);
      gctx.fillStyle = dark ? 'rgba(180,255,180,0.80)' : 'rgba(0,120,0,0.80)';
      gctx.font = `${9 * DPR}px Space Mono, monospace`;
      gctx.textAlign = 'center'; gctx.textBaseline = 'top';
      gctx.fillText('⟨v⟩', vx, (PAD.t + iH + 3) * DPR);
    }

    // Axes
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath();
    gctx.moveTo((ox + PAD.l) * DPR, PAD.t * DPR); gctx.lineTo((ox + PAD.l) * DPR, mY0);
    gctx.moveTo((ox + PAD.l) * DPR, mY0);         gctx.lineTo((ox + PAD.l + iW) * DPR, mY0);
    gctx.stroke();

    // Title
    gctx.fillStyle = lblCol; gctx.font = `${10 * DPR}px Space Mono, monospace`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText('Velocità  f(v) = (v/σ²) e^{−v²/2σ²}', (ox + PAD.l + iW / 2) * DPR, 4 * DPR);

    // Sample count
    gctx.fillStyle = dark ? 'rgba(0,212,255,0.70)' : 'rgba(0,80,180,0.70)';
    gctx.font = `${9 * DPR}px Space Mono, monospace`;
    gctx.textAlign = 'left'; gctx.textBaseline = 'top';
    gctx.fillText(`n = ${nSpeed}`, (ox + PAD.l) * DPR, 4 * DPR);

    if (nS < 40) {
      gctx.fillStyle = lblCol; gctx.font = `${10 * DPR}px Space Mono, monospace`;
      gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
      gctx.fillText('raccogliendo dati…', (ox + PAD.l + iW / 2) * DPR, (PAD.t + iH / 2) * DPR);
    }
  }

  /* ── Panel 3: Temperature history σ(t) ──────────────────────────────── */
  {
    const ox  = 2 * panW;
    const iW  = GW - ox - PAD.l - PAD.r;
    const iH  = GH - PAD.t - PAD.b;

    gctx.fillStyle = dark ? 'rgba(255,180,50,0.025)' : 'rgba(180,100,0,0.03)';
    gctx.fillRect(ox * DPR, 0, (GW - ox) * DPR, GH * DPR);

    // Panel divider
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath(); gctx.moveTo(ox * DPR, 0); gctx.lineTo(ox * DPR, GH * DPR); gctx.stroke();

    const sigMax  = Math.max(P.sigma * 1.6, sig * 1.6, 1);
    const nT      = Math.min(tempIdx, NTEMP);
    const startI  = tempIdx >= NTEMP ? tempIdx % NTEMP : 0;

    const mX  = k => (ox + PAD.l + k / NTEMP * iW)       * DPR;
    const mY  = v => (PAD.t + (1 - v / sigMax) * iH)     * DPR;
    const mY0 = (PAD.t + iH) * DPR;

    // Target σ = P.sigma dashed line (amber)
    gctx.strokeStyle = amber; gctx.lineWidth = DPR; gctx.setLineDash([3, 3]);
    gctx.beginPath();
    gctx.moveTo((ox + PAD.l) * DPR, mY(P.sigma));
    gctx.lineTo((ox + PAD.l + iW) * DPR, mY(P.sigma));
    gctx.stroke(); gctx.setLineDash([]);
    gctx.fillStyle = amber; gctx.font = `${9 * DPR}px Space Mono, monospace`;
    gctx.textAlign = 'left'; gctx.textBaseline = 'bottom';
    gctx.fillText('σ₀', (ox + PAD.l + 2) * DPR, mY(P.sigma) - 1);

    // σ(t) line (cyan)
    if (nT > 1) {
      gctx.strokeStyle = dark ? '#00d4ff' : '#0080c0'; gctx.lineWidth = 1.5 * DPR;
      gctx.beginPath();
      for (let k = 0; k < nT; k++) {
        const v  = tempBuf[(startI + k) % NTEMP];
        const sx = mX(k);
        k === 0 ? gctx.moveTo(sx, mY(v)) : gctx.lineTo(sx, mY(v));
      }
      gctx.stroke();
    }

    // y-axis tick at current σ
    gctx.fillStyle = dark ? 'rgba(0,212,255,0.70)' : 'rgba(0,80,180,0.70)';
    gctx.font = `${9 * DPR}px Space Mono, monospace`;
    gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
    gctx.fillText(sig.toFixed(2), (ox + PAD.l - 2) * DPR, mY(sig));

    // Axes
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath();
    gctx.moveTo((ox + PAD.l) * DPR, PAD.t * DPR); gctx.lineTo((ox + PAD.l) * DPR, mY0);
    gctx.moveTo((ox + PAD.l) * DPR, mY0);         gctx.lineTo((ox + PAD.l + iW) * DPR, mY0);
    gctx.stroke();

    // Title
    gctx.fillStyle = lblCol; gctx.font = `${10 * DPR}px Space Mono, monospace`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText('Temperatura  σ(t)', (ox + PAD.l + iW / 2) * DPR, 4 * DPR);

    // Thermostat badge
    if (P.thermostat) {
      gctx.fillStyle = dark ? 'rgba(255,180,50,0.85)' : 'rgba(180,100,0,0.85)';
      gctx.font = `bold ${9 * DPR}px Space Mono, monospace`;
      gctx.textAlign = 'right'; gctx.textBaseline = 'top';
      gctx.fillText('THERM ON', (ox + PAD.l + iW) * DPR, 4 * DPR);
    }
  }
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const sig   = computeSigma();
  const lT    = lambdaTheory().toFixed(1);
  const lM    = lambdaMeasured().toFixed(1);
  const pct   = (particles.length * Math.PI * P.r * P.r / (BW * BH) * 100).toFixed(1);
  const vmean = (sig * Math.sqrt(Math.PI / 2)).toFixed(2);
  const pT = pressureTheory().toFixed(4);
  const pM = measuredP.toFixed(4);
  const items = [
    { label: 'λ teorico',  value: `${lT} u` },
    { label: 'λ misurato', value: `${lM} u` },
    { label: 'σ',          value: sig.toFixed(2) },
    { label: 'P = Nσ²/A',  value: pT },
    { label: 'P misurata', value: pM },
  ];
  document.getElementById('readout').innerHTML = items.map(it =>
    `<span class="readout-item"><span class="readout-label">${it.label}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area   = sc.parentElement;
  const ga     = document.getElementById('graphArea');
  const rd     = area.querySelector('.readout-bar');
  const availW = area.clientWidth;
  const gaH    = ga.clientHeight  || 200;
  const rdH    = rd ? rd.clientHeight || 48 : 48;
  const availH = Math.max(80, area.clientHeight - gaH - rdH);

  const ASPECT = BW / BH;
  if (availW / availH > ASPECT) { SH = availH; SW = Math.round(SH * ASPECT); }
  else                          { SW = availW; SH = Math.round(SW / ASPECT); }

  sc.width  = Math.round(SW * DPR); sc.height = Math.round(SH * DPR);
  sc.style.width  = SW + 'px'; sc.style.height = SH + 'px';
  sc.style.alignSelf = 'center';

  scX = SW / BW; scY = SH / BH;

  GW = area.clientWidth; GH = ga.clientHeight || 200;
  gc.width  = Math.round(GW * DPR); gc.height = Math.round(GH * DPR);
  gc.style.width  = GW + 'px'; gc.style.height = GH + 'px';
}

/* ── Controls ────────────────────────────────────────────────────────────── */
let pauseBtn;

function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const gasSec = Lab.Section('Gas molecolare');
  gasSec.add(Lab.Slider({ label: 'N particelle', min: 20, max: 200, value: P.N, step: 5,
    onChange: v => { P.N = v; initParticles(); } }));
  gasSec.add(Lab.Slider({ label: 'Raggio r', min: 3, max: 14, value: P.r, step: 0.5, unit: ' u',
    onChange: v => { P.r = v; initParticles(); } }));
  gasSec.add(Lab.Slider({ label: 'Temperatura (σ)', min: 1, max: 12, value: P.sigma, step: 0.5,
    onChange: v => { P.sigma = v; initParticles(); } }));
  gasSec.add(Lab.Slider({ label: 'Elasticità (e)', min: 0, max: 1, value: P.e, step: 0.05,
    onChange: v => { P.e = v; } }));
  gasSec.add(Lab.Toggle({ label: 'Termostato (σ fisso)', value: P.thermostat,
    onChange: v => { P.thermostat = v; } }));
  ctrl.appendChild(gasSec.el);

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
  resetBtn.addEventListener('click', () => initParticles());

  row.append(pauseBtn, resetBtn);
  cmdSec.el.appendChild(row);
  ctrl.appendChild(cmdSec.el);
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (!paused) {
    for (let s = 0; s < P.substeps; s++) step();

    applyThermostat();

    // Sample current σ into temperature history
    tempBuf[tempIdx % NTEMP] = computeSigma();
    tempIdx++;

    // Update measured pressure every 120 substeps (~0.3 s at 60 fps × 6 substeps)
    if (wallStepCount >= 120) {
      measuredP = wallImpulseAcc / (2 * (BW + BH) * wallStepCount);
      wallImpulseAcc = 0; wallStepCount = 0;
    }

    drawSim();
    drawGraphs();
    updateReadout();
  }
  requestAnimationFrame(loop);
}

/* ── Init ────────────────────────────────────────────────────────────────── */
function init() {
  resizeCanvases();
  initParticles();
  buildControls();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resizeCanvases);
init();
