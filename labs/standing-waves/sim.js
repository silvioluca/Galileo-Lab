'use strict';

const simCanvas = document.getElementById('simCanvas');
const readoutEl = document.getElementById('readout');
const ctx = simCanvas.getContext('2d');

let cw = 0, ch = 0;

/* ── params ─────────────────────────────────────────── */
const params = {
  type: 'string',       // 'string' | 'closed-open' | 'open-open'
  length: 1.0,          // m
  tension: 40,          // N  (string only)
  mu: 0.005,            // kg/m  (string only)
  frequency: 89,        // Hz  ≈ 2nd harmonic default (T=40N, μ=0.005, L=1m → f2≈89Hz)
  Q: 25,                // resonance quality factor
};

/* ── animation state ─────────────────────────────────── */
let running = false;
let animT    = 0;
let lastMs   = 0;
let rafId    = null;
let builtAmp = 0;       // 0..1, builds toward target at resonance

/* ── readout ─────────────────────────────────────────── */
let readout = null;

/* ── helpers ─────────────────────────────────────────── */
function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function waveSpeed() {
  if (params.type === 'string') {
    const v = Math.sqrt(params.tension / params.mu);
    return Number.isFinite(v) && v > 0 ? v : 100;
  }
  return 343;
}

/* resonance frequencies and their mode index */
function getResonances() {
  const v = waveSpeed();
  const L = params.length;
  const out = [];
  if (params.type === 'closed-open') {
    for (let n = 1; n <= 12; n++) {
      const fn = (2 * n - 1) * v / (4 * L);
      out.push({ n: 2 * n - 1, f: fn });
    }
  } else {
    for (let n = 1; n <= 12; n++) {
      out.push({ n, f: n * v / (2 * L) });
    }
  }
  return out;
}

/* lorentzian amplitude factor 0..1 relative to nearest resonance */
function resonanceAmp(f, res) {
  if (!res.length) return { amp: 0, nearest: { n: 1, f: 1 } };
  let nearest = res[0], minD = Infinity;
  for (const r of res) {
    const d = Math.abs(f - r.f);
    if (d < minD) { minD = d; nearest = r; }
  }
  const gamma = nearest.f / params.Q;
  const x = (f - nearest.f) / (gamma / 2);
  return { amp: 1 / Math.sqrt(1 + x * x), nearest };
}

/* mode shape at normalised position u = x/L (0..1) */
function modeShape(type, modeN, u) {
  if (type === 'string')      return Math.sin(modeN * Math.PI * u);
  if (type === 'closed-open') return Math.sin(modeN * Math.PI * u / 2);   // modeN = 1,3,5...
  /* open-open */             return Math.cos(modeN * Math.PI * u);
}

/* ── canvas sizing ───────────────────────────────────── */
function resizeCanvas() {
  const dpr    = window.devicePixelRatio || 1;
  const parent = simCanvas.parentElement;
  const rH     = readoutEl.offsetHeight || 0;
  cw = parent.clientWidth  || 0;
  ch = Math.max(120, (parent.clientHeight || 0) - rH);
  if (!Number.isFinite(cw) || !Number.isFinite(ch)) return;
  simCanvas.width        = Math.round(cw * dpr);
  simCanvas.height       = Math.round(ch * dpr);
  simCanvas.style.width  = cw + 'px';
  simCanvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ── drawing ─────────────────────────────────────────── */
const ACCENT   = '#00d4ff';
const GREEN    = '#2ecc71';
const AMBER    = '#ffb400';
const RED      = '#ff4757';

function wavColor(resAmpVal) {
  /* interpolate red→amber→green based on resonance */
  const t = Math.max(0, Math.min(1, resAmpVal));
  if (t < 0.5) {
    const s = t * 2;
    return `rgb(${Math.round(255 + s*(255-255))},${Math.round(71+s*(180-71))},${Math.round(87+s*(0-87))})`;
  }
  const s = (t - 0.5) * 2;
  return `rgb(${Math.round(255+s*(46-255))},${Math.round(180+s*(204-180))},${Math.round(0+s*(113))})`;
}

function draw() {
  if (!(cw > 0 && ch > 0)) return;
  ctx.clearRect(0, 0, cw, ch);
  const dk = isDark();

  const res     = getResonances();
  const { amp: rAmp, nearest } = resonanceAmp(params.frequency, res);
  const effAmp  = running ? builtAmp : rAmp;

  const wH  = Math.floor(ch * 0.56);   // wave panel height
  const spH = ch - wH;                  // spectrum panel height

  drawWave(0, 0, cw, wH, dk, effAmp, nearest, res);
  drawSpectrum(0, wH, cw, spH, dk, res, rAmp, nearest);
  updateReadout(nearest, res);
}

/* ── wave panel ───────────────────────────────────────── */
function drawWave(x0, y0, W, H, dk, effAmp, nearest, res) {
  const PAD   = 48;
  const midY  = y0 + H / 2;
  const waveH = H * 0.38;  /* max pixel displacement */
  const N     = 300;
  const wX0   = x0 + PAD;
  const wW    = W - PAD * 2;
  const color = wavColor(effAmp);
  const v     = waveSpeed();
  const k     = 2 * Math.PI * params.frequency / v;
  const omega = 2 * Math.PI * params.frequency;

  /* tube / string body */
  ctx.save();
  if (params.type === 'string') {
    /* two anchor dots */
    ctx.fillStyle = dk ? 'rgba(100,140,200,0.6)' : 'rgba(60,100,160,0.6)';
    ctx.beginPath(); ctx.arc(wX0, midY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(wX0 + wW, midY, 5, 0, Math.PI * 2); ctx.fill();
    /* resting line */
    ctx.strokeStyle = dk ? 'rgba(100,140,200,0.2)' : 'rgba(60,100,160,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wX0, midY); ctx.lineTo(wX0 + wW, midY); ctx.stroke();
  } else {
    /* tube silhouette */
    const tubeH = waveH * 0.65;
    ctx.strokeStyle = dk ? 'rgba(100,140,200,0.35)' : 'rgba(60,100,160,0.25)';
    ctx.lineWidth = 1.5;
    /* top wall */
    ctx.beginPath();
    if (params.type === 'closed-open') {
      ctx.moveTo(wX0, midY - tubeH); ctx.lineTo(wX0 + wW, midY - tubeH);
    } else {
      ctx.moveTo(wX0 + 6, midY - tubeH); ctx.lineTo(wX0 + wW - 6, midY - tubeH);
    }
    ctx.stroke();
    /* bottom wall */
    ctx.beginPath();
    if (params.type === 'closed-open') {
      ctx.moveTo(wX0, midY + tubeH); ctx.lineTo(wX0 + wW, midY + tubeH);
    } else {
      ctx.moveTo(wX0 + 6, midY + tubeH); ctx.lineTo(wX0 + wW - 6, midY + tubeH);
    }
    ctx.stroke();
    /* closed end (left wall) */
    if (params.type === 'closed-open') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = dk ? 'rgba(100,140,200,0.6)' : 'rgba(60,100,160,0.5)';
      ctx.beginPath(); ctx.moveTo(wX0, midY - tubeH); ctx.lineTo(wX0, midY + tubeH); ctx.stroke();
    }
    /* open end labels */
    ctx.fillStyle = dk ? 'rgba(100,140,200,0.5)' : 'rgba(60,100,160,0.4)';
    ctx.font = '10px Space Mono, monospace';
    ctx.textAlign = 'center';
    if (params.type === 'closed-open') {
      ctx.fillText('C', wX0, midY - tubeH - 6);
      ctx.fillText('A', wX0 + wW, midY - tubeH - 6);
    } else {
      ctx.fillText('A', wX0, midY - tubeH - 6);
      ctx.fillText('A', wX0 + wW, midY - tubeH - 6);
    }
  }
  ctx.restore();

  /* wave curve */
  const travelAmp = waveH * 0.18 * (1 - effAmp); /* residual traveling wave */
  const standAmp  = waveH * effAmp;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.2;
  ctx.shadowColor = color;
  ctx.shadowBlur  = effAmp > 0.6 ? 12 * effAmp : 0;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const u  = i / N;
    const px = wX0 + u * wW;
    /* standing wave component */
    const standing = standAmp * modeShape(params.type, nearest.n, u) * Math.cos(omega * animT);
    /* traveling wave component */
    const xm = u * params.length;
    const traveling = travelAmp * Math.sin(k * xm - omega * animT);
    const py = midY - (standing + traveling);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  /* nodes when near resonance */
  if (effAmp > 0.25) {
    const n = nearest.n;
    const type = params.type;
    let nodePositions = [];
    if (type === 'string') {
      /* sin(nπu) = 0 → u = i/n, i=0..n */
      for (let i = 0; i <= n; i++) nodePositions.push(i / n);
    } else if (type === 'closed-open') {
      /* sin(nπu/2) = 0 → u = 2k/n, k=0,1,... while 2k/n ≤ 1 */
      for (let k = 0; 2 * k <= n; k++) nodePositions.push(2 * k / n);
    } else {
      /* cos(nπu) = 0 → u = (2i-1)/(2n), i=1..n */
      for (let i = 1; i <= n; i++) nodePositions.push((2 * i - 1) / (2 * n));
    }
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = effAmp * 0.7;
    for (const u of nodePositions) {
      const px = wX0 + u * wW;
      ctx.beginPath(); ctx.arc(px, midY, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* resonance label */
  if (effAmp > 0.55) {
    ctx.save();
    ctx.font = 'bold 11px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.globalAlpha = (effAmp - 0.55) / 0.45;
    const nLabel = ordinalLabel(nearest.n);
    ctx.fillText(`${nLabel} armonica  ·  n = ${nearest.n}`, x0 + W / 2, y0 + 18);
    ctx.restore();
  }

  /* endpoint labels */
  ctx.save();
  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = dk ? 'rgba(110,140,180,0.6)' : 'rgba(60,90,140,0.5)';
  if (params.type === 'string') {
    ctx.fillText('NODO', wX0, midY + waveH + 20);
    ctx.fillText('NODO', wX0 + wW, midY + waveH + 20);
  } else if (params.type === 'closed-open') {
    ctx.fillText('NODO', wX0, midY + waveH + 22);
    ctx.fillText('VENTRE', wX0 + wW, midY + waveH + 22);
  } else {
    ctx.fillText('VENTRE', wX0, midY + waveH + 22);
    ctx.fillText('VENTRE', wX0 + wW, midY + waveH + 22);
  }
  ctx.restore();
}

function ordinalLabel(n) {
  const map = ['', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª'];
  return map[n] || `${n}ª`;
}

/* ── spectrum panel ───────────────────────────────────── */
function drawSpectrum(x0, y0, W, H, dk, res, rAmp, nearest) {
  const PAD   = { left: 48, right: 16, top: 14, bottom: 26 };
  const sW    = W - PAD.left - PAD.right;
  const sH    = H - PAD.top - PAD.bottom;
  if (sW <= 0 || sH <= 0) return;

  const v = waveSpeed();
  const fMax = Math.min(res[res.length - 1].f * 1.3, res[4]?.f * 6 || 1200);
  const toX  = f => x0 + PAD.left + (f / fMax) * sW;
  const toY  = a => y0 + PAD.top + sH * (1 - a);

  /* background */
  ctx.fillStyle = dk ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.03)';
  ctx.fillRect(x0 + PAD.left, y0 + PAD.top, sW, sH);

  /* axes */
  ctx.strokeStyle = dk ? 'rgba(100,130,180,0.2)' : 'rgba(60,90,140,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 + PAD.left, y0 + PAD.top);
  ctx.lineTo(x0 + PAD.left, y0 + PAD.top + sH);
  ctx.lineTo(x0 + PAD.left + sW, y0 + PAD.top + sH);
  ctx.stroke();

  /* axis labels */
  ctx.fillStyle = dk ? 'rgba(100,130,180,0.5)' : 'rgba(60,90,140,0.4)';
  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('A', x0 + 4, y0 + PAD.top + 4);
  ctx.textAlign = 'center';
  ctx.fillText('Hz', x0 + PAD.left + sW, y0 + PAD.top + sH + 18);

  /* response curve (sampled) */
  const nPts = 600;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= nPts; i++) {
    const f = (i / nPts) * fMax;
    let amp = 0;
    for (const r of res) {
      const gamma = r.f / params.Q;
      const d = (f - r.f) / (gamma / 2);
      amp = Math.max(amp, 1 / Math.sqrt(1 + d * d));
    }
    const px = toX(f);
    const py = toY(amp);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.3)' : 'rgba(0,153,204,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  /* fill */
  ctx.lineTo(toX(fMax), toY(0));
  ctx.lineTo(toX(0), toY(0));
  ctx.closePath();
  ctx.fillStyle = dk ? 'rgba(0,212,255,0.05)' : 'rgba(0,153,204,0.04)';
  ctx.fill();
  ctx.restore();

  /* resonance frequency tick labels */
  ctx.save();
  ctx.font = '8px Space Mono, monospace';
  ctx.textAlign = 'center';
  for (const r of res) {
    if (r.f > fMax) break;
    const px = toX(r.f);
    const isNearest = r.n === nearest.n;
    ctx.fillStyle = isNearest
      ? (dk ? 'rgba(0,212,255,0.8)' : 'rgba(0,130,180,0.8)')
      : (dk ? 'rgba(100,130,180,0.4)' : 'rgba(60,90,140,0.3)');
    ctx.fillText(`f${r.n}`, px, y0 + PAD.top + sH + 18);
    /* tick */
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, y0 + PAD.top + sH);
    ctx.lineTo(px, y0 + PAD.top + sH + 4);
    ctx.stroke();
  }
  ctx.restore();

  /* current frequency line */
  const f = params.frequency;
  if (f > 0 && f < fMax) {
    const px = toX(f);
    const color = wavColor(rAmp);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px, y0 + PAD.top);
    ctx.lineTo(px, y0 + PAD.top + sH);
    ctx.stroke();
    ctx.setLineDash([]);
    /* freq label */
    ctx.fillStyle  = color;
    ctx.font       = '9px Space Mono, monospace';
    ctx.textAlign  = px > x0 + PAD.left + sW - 40 ? 'right' : 'left';
    ctx.fillText(`${f.toFixed(0)} Hz`, px + (ctx.textAlign === 'left' ? 4 : -4), y0 + PAD.top + 10);
    ctx.restore();
  }

  /* "SPETTRO" label */
  ctx.fillStyle = dk ? 'rgba(100,130,180,0.35)' : 'rgba(60,90,140,0.3)';
  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('RISPOSTA IN FREQUENZA', x0 + PAD.left + 4, y0 + PAD.top + 10);
}

function updateReadout(nearest, res) {
  const v  = waveSpeed();
  const f  = params.frequency;
  const df = f - nearest.f;
  const pct = nearest.f > 0 ? (df / nearest.f * 100) : 0;
  if (readout) {
    readout.set('freq',  `${f.toFixed(1)} Hz`);
    readout.set('speed', `${v.toFixed(0)} m/s`);
    readout.set('harm',  `n = ${nearest.n}  (${nearest.f.toFixed(1)} Hz)`);
    readout.set('delta', `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
  }
}

/* ── animation loop ──────────────────────────────────── */
function tick(ms) {
  if (!running) return;
  const dt = Math.min((ms - lastMs) / 1000, 0.1);
  lastMs   = ms;
  animT   += dt;

  const res   = getResonances();
  const { amp: rAmp } = resonanceAmp(params.frequency, res);
  const tau   = rAmp > 0.5 ? 0.8 : 2.5;  /* build up fast near resonance */
  builtAmp    = builtAmp + (rAmp - builtAmp) * Math.min(1, dt / tau);
  if (!Number.isFinite(builtAmp)) builtAmp = 0;

  draw();
  rafId = requestAnimationFrame(tick);
}

function startAnim() {
  if (running) return;
  running = true;
  lastMs  = performance.now();
  rafId   = requestAnimationFrame(ms => { lastMs = ms; tick(ms); });
}
function stopAnim() {
  running = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}
function resetAnim() {
  stopAnim();
  animT    = 0;
  builtAmp = 0;
  draw();
}

/* ── controls ────────────────────────────────────────── */
let freqSlider = null;
let tensionSub = null;

function buildControls() {
  const panel = document.getElementById('controls');

  /* type selector */
  const typeSection = Lab.Section('Tipo di sistema');
  const typeRadio = Lab.RadioGroup({
    label: 'Tipo di sistema',
    options: [
      { label: 'Corda fissata',      value: 'string',      hint: 'f = nv/2L' },
      { label: 'Tubo chiuso-aperto', value: 'closed-open', hint: 'f = (2n−1)v/4L' },
      { label: 'Tubo aperto-aperto', value: 'open-open',   hint: 'f = nv/2L' },
    ],
    value: params.type,
    onChange(v) {
      params.type = v;
      if (v === 'string') tensionSub.show(); else tensionSub.hide();
      updateFreqSliderRange();
      draw();
    },
  });
  typeSection.add(typeRadio);
  panel.appendChild(typeSection.el);

  /* geometry */
  const geoSection = Lab.Section('Geometria');
  const lenSlider = Lab.Slider({
    label: 'Lunghezza', min: 0.3, max: 3.0, value: params.length, step: 0.05, unit: ' m',
    onChange(v) { params.length = v; updateFreqSliderRange(); draw(); },
  });
  geoSection.add(lenSlider);
  panel.appendChild(geoSection.el);

  /* string-only sub panel */
  tensionSub = Lab.SubPanel();
  const tenSlider = Lab.Slider({
    label: 'Tensione', min: 1, max: 200, value: params.tension, step: 1, unit: ' N',
    onChange(v) { params.tension = v; updateFreqSliderRange(); draw(); },
  });
  const muSlider = Lab.Slider({
    label: 'Densità lineare', min: 0.001, max: 0.05, value: params.mu, step: 0.001, unit: ' kg/m',
    onChange(v) { params.mu = v; updateFreqSliderRange(); draw(); },
  });
  tensionSub.add(tenSlider);
  tensionSub.add(muSlider);
  panel.appendChild(tensionSub.el);

  /* frequency */
  const freqSection = Lab.Section('Frequenza impulso');
  freqSlider = Lab.Slider({
    label: 'Frequenza', min: 1, max: 800, value: params.frequency, step: 1, unit: ' Hz',
    onChange(v) { params.frequency = v; builtAmp *= 0.3; draw(); },
  });
  freqSection.add(freqSlider);

  /* snap-to-harmonic buttons */
  const snapRow = document.createElement('div');
  snapRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;';
  for (let n = 1; n <= 6; n++) {
    const btn = document.createElement('button');
    btn.className = 'btn-secondary';
    btn.style.cssText = 'width:auto;padding:4px 9px;font-size:10px;flex:1;min-width:30px;';
    btn.textContent = `f${n}`;
    btn.addEventListener('click', () => snapToHarmonic(n));
    snapRow.appendChild(btn);
  }
  freqSection.el.appendChild(snapRow);
  panel.appendChild(freqSection.el);

  /* quality factor */
  const qSection = Lab.Section('Qualità risonanza');
  const qSlider = Lab.Slider({
    label: 'Fattore Q', min: 5, max: 80, value: params.Q, step: 1, unit: '',
    onChange(v) { params.Q = v; draw(); },
  });
  qSection.add(qSlider);
  panel.appendChild(qSection.el);
}

function updateFreqSliderRange() {
  if (!freqSlider) return;
  const res  = getResonances();
  const fMax = Math.min(res[5]?.f * 1.5 || 800, 2000);
  /* slider max isn't directly settable via Lab.Slider API, so just clamp */
  if (params.frequency > fMax) {
    params.frequency = fMax;
    freqSlider.setValue(fMax);
  }
}

function snapToHarmonic(n) {
  const res = getResonances();
  const r   = res.find(r => r.n === n) || res[0];
  if (!r) return;
  params.frequency = Math.round(r.f * 10) / 10;
  if (freqSlider) freqSlider.setValue(params.frequency);
  builtAmp = 0;
  draw();
}

/* ── readout bar ─────────────────────────────────────── */
function setupReadout() {
  readout = new Lab.Readout(readoutEl, [
    { key: 'freq',  label: 'FREQUENZA' },
    { key: 'speed', label: 'VELOCITÀ ONDA' },
    { key: 'harm',  label: 'ARMONICA VICINA' },
    { key: 'delta', label: 'Δf / fₙ' },
  ]);
}

/* ── play / reset ────────────────────────────────────── */
function initButtons() {
  const btnPlay  = document.getElementById('btnPlay');
  const btnReset = document.getElementById('btnReset');

  btnPlay.addEventListener('click', () => {
    if (running) {
      stopAnim();
      btnPlay.textContent = '▶  AVVIA';
      btnPlay.classList.remove('running');
    } else {
      startAnim();
      btnPlay.textContent = '⏹  FERMA';
      btnPlay.classList.add('running');
    }
  });

  btnReset.addEventListener('click', () => {
    resetAnim();
    btnPlay.textContent = '▶  AVVIA';
    btnPlay.classList.remove('running');
  });
}

/* ── observers + init ────────────────────────────────── */
new MutationObserver(() => draw())
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

new ResizeObserver(() => { resizeCanvas(); draw(); })
  .observe(simCanvas.parentElement);

Lab.initTheme();
buildControls();
setupReadout();
initButtons();
resizeCanvas();
draw();
