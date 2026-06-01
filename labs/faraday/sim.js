'use strict';

const TWO_PI = Math.PI * 2;

/* ── Parameters ──────────────────────────────────────────── */
let P = {
  N:          25,    // numero di spire
  R:          1.0,   // raggio bobina (unità fisiche)
  strength:   4.0,   // momento di dipolo (unità normalizzate)
  resistance: 1.0,   // resistenza (Ω)
  omega:      0.8,   // velocità oscillazione
};

/* ── Canvas ──────────────────────────────────────────────── */
const simCanvas   = document.getElementById('simCanvas');
const ctx         = simCanvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
let SW=0, SH=0, GW=0, GH=0, DPR=1, dark=true;

/* ── Layout (recomputed in resize) ───────────────────────── */
let scale=110;    // px per physics unit
let CX=0, CY=0;  // coil center in screen px
let coilR=0;      // coil radius in px
let coilL=0;      // coil half-length in px

/* ── Magnet state ────────────────────────────────────────── */
let magRel  = 2.0;    // magnet position relative to coil (physics units along x)
let magXPrv = 0;      // previous screen x (for velocity)
let dragging = false;
let dragOff  = 0;

/* ── Physics state ───────────────────────────────────────── */
let running = true;
let animT   = 0;
let simT    = 0;
let phi     = 0;
let emf     = 0;
let current = 0;
const HIST_MAX = 500;
let histT=[], histPhi=[], histEMF=[];

let _lastTs = null;

/* ── Physics ─────────────────────────────────────────────── */
function computePhi(d) {
  // Φ = N · k · R² / (R² + d²)^(3/2)
  const R2 = P.R * P.R;
  return P.N * P.strength * R2 / Math.pow(R2 + d*d, 1.5);
}

function computeEMF(d, vd) {
  // ε = −dΦ/dt = −(dΦ/dd)·(dd/dt) = N·k·R²·3d·vd / (R²+d²)^(5/2)
  const R2 = P.R * P.R;
  const denom = Math.pow(R2 + d*d, 2.5);
  return P.N * P.strength * R2 * 3 * d * vd / denom;
}

function magScreenX() { return CX + magRel * scale; }

/* ── Field line drawing ──────────────────────────────────── */
// Dipole field lines: r = A·sin²(θ), θ from +x axis
function drawFieldLines() {
  const mx = magScreenX();
  const Avals = [0.35, 0.75, 1.5, 2.8, 5.0];
  const col = dark ? 'rgba(110,155,255,0.28)' : 'rgba(0,50,200,0.15)';
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;

  for (const A_u of Avals) {
    const A = A_u * scale;
    for (const ysign of [-1, 1]) {
      ctx.beginPath();
      for (let k=0; k<=160; k++) {
        const th = Math.PI * k / 160;
        const r  = A * Math.sin(th) * Math.sin(th);
        const px = mx + r * Math.cos(th);
        const py = CY + ysign * r * Math.sin(th);
        k===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
      }
      ctx.stroke();

      // Arrowhead near θ = π/2 (peak of each line)
      const th1 = Math.PI * 0.53, th2 = Math.PI * 0.55;
      const r1  = A * Math.sin(th1)**2, r2 = A * Math.sin(th2)**2;
      const ax  = mx + r1*Math.cos(th1), ay = CY + ysign*r1*Math.sin(th1);
      const bx  = mx + r2*Math.cos(th2), by = CY + ysign*r2*Math.sin(th2);
      ctx.fillStyle = col;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(by-ay, bx-ax));
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(-6,-3); ctx.lineTo(-6,3); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

/* ── Coil drawing ────────────────────────────────────────── */
function drawCoil() {
  const nVis    = Math.min(Math.max(P.N, 1), 12);
  const spacing = coilL * 2 / (nVis + 1);
  const front   = dark ? '#4a92d8' : '#1a5fa8';
  const back    = dark ? '#2a547a' : '#7aaad0';
  const body    = dark ? 'rgba(18,36,72,0.55)' : 'rgba(170,195,230,0.50)';

  // Body fill
  ctx.fillStyle = body;
  ctx.fillRect(CX - coilL, CY - coilR, coilL*2, coilR*2);

  // Back arcs (darker, drawn first)
  ctx.strokeStyle = back; ctx.lineWidth = 1.5;
  for (let k=0; k<nVis; k++) {
    const wx = CX - coilL + (k + 0.5) * spacing;
    ctx.beginPath();
    ctx.ellipse(wx, CY, spacing*0.42, coilR, 0, Math.PI, 0, false);
    ctx.stroke();
  }

  // Top and bottom edges
  ctx.strokeStyle = front; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CX-coilL, CY-coilR); ctx.lineTo(CX+coilL, CY-coilR);
  ctx.moveTo(CX-coilL, CY+coilR); ctx.lineTo(CX+coilL, CY+coilR);
  ctx.stroke();

  // Front arcs (brighter)
  ctx.strokeStyle = front; ctx.lineWidth = 2;
  for (let k=0; k<nVis; k++) {
    const wx = CX - coilL + (k + 0.5) * spacing;
    ctx.beginPath();
    ctx.ellipse(wx, CY, spacing*0.42, coilR, 0, 0, Math.PI, false);
    ctx.stroke();
  }

  // Current indicators (dots = out of page, crosses = into page)
  if (Math.abs(current) > 0.005) {
    const alpha = Math.min(1, Math.abs(current) / 3);
    const col = `rgba(255,210,40,${0.25 + alpha*0.75})`;
    // current>0 means N pole approaching from right → induced I counterclockwise (from right)
    // top of coil → current goes INTO page (×), bottom → OUT OF page (•)
    const topSym = current > 0 ? '×' : '•';
    const botSym = current > 0 ? '•' : '×';
    ctx.fillStyle = col;
    ctx.font = 'bold 13px "Space Mono",monospace';
    ctx.textAlign = 'center';
    for (let k=0; k<nVis; k++) {
      const wx = CX - coilL + (k + 0.5) * spacing;
      ctx.fillText(topSym, wx, CY - coilR - 6);
      ctx.fillText(botSym, wx, CY + coilR + 16);
    }
  }
}

/* ── Bar magnet ──────────────────────────────────────────── */
function drawMagnet() {
  const mx  = magScreenX();
  const hl  = Math.min(85, scale * 0.85);
  const hh  = 16;

  // S pole (left, blue)
  ctx.fillStyle = '#3068b0';
  roundRect(ctx, mx - hl, CY - hh, hl, hh*2, [4,0,0,4]);
  ctx.fill();
  // N pole (right, red)
  ctx.fillStyle = '#c03030';
  roundRect(ctx, mx, CY - hh, hl, hh*2, [0,4,4,0]);
  ctx.fill();
  // Dividing line
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mx, CY-hh); ctx.lineTo(mx, CY+hh); ctx.stroke();
  // Border
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, mx - hl, CY - hh, hl*2, hh*2, 4);
  ctx.stroke();
  // Labels
  ctx.font = 'bold 13px "DM Sans",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText('S', mx - hl/2, CY + 5);
  ctx.fillText('N', mx + hl/2, CY + 5);
}

/* ── Galvanometer ────────────────────────────────────────── */
function drawGalvanometer(gx, gy) {
  const r = Math.max(32, Math.min(52, SH * 0.13));

  // Dial background
  ctx.fillStyle  = dark ? '#18243a' : '#eef2ff';
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(gx, gy, r, 0, TWO_PI); ctx.fill(); ctx.stroke();

  // Scale arc (upper semicircle)
  const arcColor = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)';
  ctx.strokeStyle = arcColor; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(gx, gy, r*0.82, Math.PI*1.08, Math.PI*1.92, false);
  ctx.stroke();

  // Tick marks
  for (let t = -5; t <= 5; t++) {
    const ang  = Math.PI*1.5 + (t/5)*Math.PI*0.44;
    const tick = (t===0||Math.abs(t)===5) ? r*0.16 : r*0.08;
    ctx.strokeStyle = arcColor; ctx.lineWidth = (t===0) ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(gx + r*0.82*Math.cos(ang), gy + r*0.82*Math.sin(ang));
    ctx.lineTo(gx + (r*0.82-tick)*Math.cos(ang), gy + (r*0.82-tick)*Math.sin(ang));
    ctx.stroke();
  }

  // "+", "−", "0" labels
  ctx.fillStyle = arcColor;
  ctx.font = `${Math.round(r*0.22)}px "Space Mono",monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('0', gx, gy - r*0.60);
  ctx.fillText('+', gx - r*0.68, gy - r*0.10);
  ctx.fillText('−', gx + r*0.68, gy - r*0.10);

  // Needle
  const maxAng   = Math.PI * 0.43;
  const rawAngle = -current * 1.2;
  const needAng  = Math.PI*1.5 + Math.max(-maxAng, Math.min(maxAng, rawAngle));
  ctx.strokeStyle = dark ? '#f0d040' : '#b08000';
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx + r*0.82*Math.cos(needAng), gy + r*0.82*Math.sin(needAng));
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Pivot
  ctx.fillStyle = dark ? '#cccccc' : '#555555';
  ctx.beginPath(); ctx.arc(gx, gy, 3, 0, TWO_PI); ctx.fill();

  // Label
  ctx.fillStyle = arcColor;
  ctx.font = `11px "Space Mono",monospace`;
  ctx.fillText('G', gx, gy + r + 15);
}

/* ── Connecting wires ────────────────────────────────────── */
function drawWires(gx, gy) {
  const wc = dark ? 'rgba(200,200,80,0.45)' : 'rgba(100,100,0,0.35)';
  ctx.strokeStyle = wc; ctx.lineWidth = 1.5;

  // Top wire: coil right-top → galvanometer top
  const cx2 = CX + coilL + 16;
  ctx.beginPath();
  ctx.moveTo(CX+coilL, CY-coilR);
  ctx.lineTo(cx2, CY-coilR);
  ctx.lineTo(cx2, gy - r_galv(gx,gy) - 4);
  ctx.lineTo(gx, gy - r_galv(gx,gy) - 4);
  ctx.stroke();

  // Bottom wire: coil right-bottom → galvanometer bottom
  const cx3 = CX + coilL + 32;
  ctx.beginPath();
  ctx.moveTo(CX+coilL, CY+coilR);
  ctx.lineTo(cx3, CY+coilR);
  ctx.lineTo(cx3, gy + r_galv(gx,gy) + 4);
  ctx.lineTo(gx, gy + r_galv(gx,gy) + 4);
  ctx.stroke();
}

function r_galv(gx, gy) {
  return Math.max(32, Math.min(52, SH * 0.13));
}

/* ── Axis guide ──────────────────────────────────────────── */
function drawAxisGuide() {
  // Horizontal guide line through coil axis (dashed)
  const gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.strokeStyle = gc; ctx.lineWidth = 1;
  ctx.setLineDash([4,8]);
  ctx.beginPath();
  ctx.moveTo(30, CY); ctx.lineTo(SW - 30, CY);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ── Distance label ──────────────────────────────────────── */
function drawDistLabel() {
  const d = magRel;
  const mx = magScreenX();
  if (mx <= CX + 5) return;
  const tc = dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.32)';
  // Arrow between magnet center and coil center
  const mid = (mx + CX) / 2;
  ctx.strokeStyle = tc; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX+2, CY+coilR+22); ctx.lineTo(mx-2, CY+coilR+22);
  ctx.stroke();
  // Arrowheads
  ctx.fillStyle = tc;
  for (const [ox, dir] of [[CX+2, -1],[mx-2, 1]]) {
    ctx.save(); ctx.translate(ox, CY+coilR+22); ctx.rotate(dir > 0 ? 0 : Math.PI);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-5,-3); ctx.lineTo(-5,3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = tc;
  ctx.font = '10px "Space Mono",monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`d = ${Math.abs(d).toFixed(2)} R`, mid, CY + coilR + 36);
}

/* ── Main draw ───────────────────────────────────────────── */
function drawSim() {
  ctx.fillStyle = dark ? '#0d1117' : '#f0f2f5';
  ctx.fillRect(0, 0, SW, SH);

  const gx = SW * 0.83, gy = SH * 0.48;

  drawAxisGuide();
  drawFieldLines();
  drawWires(gx, gy);
  drawCoil();
  drawMagnet();
  drawGalvanometer(gx, gy);
  drawDistLabel();

  // Lenz's law hint
  if (Math.abs(current) > 0.02) {
    const dir = current > 0 ? 'N polo si avvicina → repulsione' : 'N polo si allontana → attrazione';
    const tc = dark ? 'rgba(255,210,40,0.6)' : 'rgba(140,100,0,0.7)';
    ctx.fillStyle = tc;
    ctx.font = '10px "DM Sans",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dir, CX, 18);
  }
}

/* ── Graph ───────────────────────────────────────────────── */
function drawGraph() {
  gctx.fillStyle = dark ? '#161b22' : '#f8f9fc';
  gctx.fillRect(0, 0, GW, GH);
  const half = Math.floor(GW/2) - 4;
  drawHistPanel(0, half, histPhi, '#6090e0', 'Flusso  Φ (Wb)');
  drawHistPanel(half+8, GW-half-8, histEMF, '#e07070', 'FEM  ε (V)');
}

function drawHistPanel(offX, pw, data, color, title) {
  const pad={l:44,r:8,t:20,b:24};
  const iw=pw-pad.l-pad.r, ih=GH-pad.t-pad.b;
  if (iw<10||ih<10) return;
  const tc=dark?'rgba(255,255,255,0.35)':'rgba(0,0,0,0.35)';
  const gc=dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)';
  const n=data.length;

  gctx.fillStyle=dark?'rgba(255,255,255,0.55)':'rgba(0,0,0,0.50)';
  gctx.font='10px "Space Mono",monospace'; gctx.textAlign='left';
  gctx.fillText(title, offX+pad.l, 13);

  if (n<2) return;
  const tMin=histT[0], tMax=histT[n-1];
  if (tMax<=tMin) return;
  const dMin=Math.min(...data), dMax=Math.max(...data);
  const rng=(dMax-dMin)||0.5;
  const yMin=dMin-rng*0.12, yMax=dMax+rng*0.12;
  const tx=t=>offX+pad.l+(t-tMin)/(tMax-tMin)*iw;
  const ty=v=>pad.t+ih-(v-yMin)/(yMax-yMin)*ih;

  for (let i=0;i<=4;i++) {
    const y=pad.t+i*ih/4;
    gctx.strokeStyle=gc; gctx.lineWidth=0.5;
    gctx.beginPath(); gctx.moveTo(offX+pad.l,y); gctx.lineTo(offX+pad.l+iw,y); gctx.stroke();
    gctx.fillStyle=tc; gctx.font='9px "Space Mono",monospace'; gctx.textAlign='right';
    gctx.fillText((yMax-(yMax-yMin)*i/4).toFixed(2), offX+pad.l-3, y+3);
  }

  if (yMin<0&&yMax>0) {
    const y0=ty(0);
    gctx.strokeStyle=dark?'rgba(255,255,255,0.18)':'rgba(0,0,0,0.18)';
    gctx.lineWidth=1; gctx.setLineDash([4,4]);
    gctx.beginPath(); gctx.moveTo(offX+pad.l,y0); gctx.lineTo(offX+pad.l+iw,y0); gctx.stroke();
    gctx.setLineDash([]);
  }

  gctx.strokeStyle=color; gctx.lineWidth=1.8; gctx.beginPath();
  for (let k=0;k<n;k++) {
    const x=tx(histT[k]), y=ty(data[k]);
    k===0?gctx.moveTo(x,y):gctx.lineTo(x,y);
  }
  gctx.stroke();

  gctx.strokeStyle=tc; gctx.lineWidth=1;
  gctx.beginPath();
  gctx.moveTo(offX+pad.l,pad.t); gctx.lineTo(offX+pad.l,pad.t+ih); gctx.lineTo(offX+pad.l+iw,pad.t+ih);
  gctx.stroke();
  gctx.fillStyle=tc; gctx.font='9px "Space Mono",monospace'; gctx.textAlign='right';
  gctx.fillText('t='+tMax.toFixed(1)+'s', offX+pad.l+iw, pad.t+ih+14);
  gctx.textAlign='start';
}

/* ── Readout ─────────────────────────────────────────────── */
function updateReadout() {
  const d = magRel;
  const items = [
    {label:'d',    value: d.toFixed(2)+' R'},
    {label:'Φ',    value: phi.toFixed(3)+' Wb'},
    {label:'ε',    value: emf.toFixed(3)+' V'},
    {label:'I',    value: current.toFixed(3)+' A'},
    {label:'N',    value: P.N},
    {label:'R',    value: P.R.toFixed(1)+' m'},
  ];
  readoutEl.innerHTML = items.map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Utility ─────────────────────────────────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  const [tl,tr,br,bl] = Array.isArray(r) ? r : [r,r,r,r];
  ctx.beginPath();
  ctx.moveTo(x+tl, y);
  ctx.lineTo(x+w-tr, y); ctx.arc(x+w-tr, y+tr, tr, -Math.PI/2, 0);
  ctx.lineTo(x+w, y+h-br); ctx.arc(x+w-br, y+h-br, br, 0, Math.PI/2);
  ctx.lineTo(x+bl, y+h); ctx.arc(x+bl, y+h-bl, bl, Math.PI/2, Math.PI);
  ctx.lineTo(x, y+tl); ctx.arc(x+tl, y+tl, tl, Math.PI, -Math.PI/2);
  ctx.closePath();
}

/* ── Resize ──────────────────────────────────────────────── */
function resize() {
  DPR  = window.devicePixelRatio || 1;
  dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const area = simCanvas.parentElement;
  const rd   = area.querySelector('.readout-bar');
  const gaH  = graphArea.clientHeight || 190;
  const rdH  = rd ? rd.clientHeight || 48 : 48;
  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);
  simCanvas.width  = SW*DPR;  simCanvas.height = SH*DPR;
  simCanvas.style.width  = SW+'px'; simCanvas.style.height = SH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  GW = area.clientWidth; GH = gaH;
  graphCanvas.width  = GW*DPR; graphCanvas.height = GH*DPR;
  graphCanvas.style.width  = GW+'px'; graphCanvas.style.height = GH+'px';
  gctx.setTransform(DPR,0,0,DPR,0,0);

  scale  = Math.max(60, Math.min(130, SW*0.11, SH*0.28));
  CX     = SW * 0.40;
  CY     = SH * 0.50;
  coilR  = P.R * scale;
  coilL  = Math.min(coilR * 1.6, scale * 0.9);
}

/* ── Interaction (drag when paused) ─────────────────────── */
function initInteraction() {
  const hl = () => Math.min(85, scale * 0.85);

  simCanvas.addEventListener('mousedown', e => {
    if (running) return;
    const rect = simCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left), my = (e.clientY - rect.top);
    const mgx = magScreenX();
    if (Math.abs(my - CY) < 24 && mx > mgx - hl() && mx < mgx + hl()) {
      dragging = true;
      dragOff  = mx - mgx;
    }
  });
  simCanvas.addEventListener('mousemove', e => {
    const rect = simCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left), my = (e.clientY - rect.top);
    if (dragging) {
      const newMgx = mx - dragOff;
      magRel = (newMgx - CX) / scale;
      magRel = Math.max(-3.0, Math.min(5.0, magRel));
    } else if (!running) {
      const mgx = magScreenX();
      simCanvas.style.cursor =
        (Math.abs(my-CY) < 24 && mx > mgx-hl() && mx < mgx+hl()) ? 'grab' : 'default';
    }
  });
  simCanvas.addEventListener('mouseup',    () => { dragging = false; });
  simCanvas.addEventListener('mouseleave', () => { dragging = false; });
}

/* ── Running ─────────────────────────────────────────────── */
function setRunning(v) {
  running = v;
  const btn = document.getElementById('btnPlay');
  if (btn) btn.textContent = running ? '⏸  PAUSA' : '▶  AVVIA';
  if (!running) simCanvas.style.cursor = 'grab';
  else          simCanvas.style.cursor = 'default';
}

/* ── Main loop ───────────────────────────────────────────── */
function loop(ts) {
  requestAnimationFrame(loop);
  if (_lastTs===null){_lastTs=ts;return;}
  const dt = Math.min((ts - _lastTs)/1000, 0.05);
  _lastTs = ts;

  const prevMgx = magScreenX();

  if (running && !dragging) {
    animT += dt;
    // d(t) = d_offset + d_amp * sin(ω·t)
    const d_amp    = 1.8;
    const d_offset = 2.0;
    magRel = d_offset + d_amp * Math.sin(P.omega * animT);
    magRel = Math.max(-3.0, Math.min(5.0, magRel));
  }

  // Analytical EMF: ε = N·k·R²·3d·vd / (R²+d²)^(5/2)
  const d  = magRel;
  const vd = (magScreenX() - prevMgx) / scale / Math.max(dt, 0.001); // physics units/s
  phi     = computePhi(d);
  emf     = computeEMF(d, vd);
  current = emf / P.resistance;

  simT += dt;
  histT.push(simT); histPhi.push(phi); histEMF.push(emf);
  if (histT.length > HIST_MAX) { histT.shift(); histPhi.shift(); histEMF.shift(); }

  // Update coil geometry if R changed via slider
  coilR = P.R * scale;
  coilL = Math.min(coilR * 1.6, scale * 0.9);

  drawSim();
  drawGraph();
  updateReadout();
}

/* ── Controls ────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const secCoil = Lab.Section('Bobina');
  secCoil.add(Lab.Slider({label:'Spire N', min:1, max:100, step:1, value:P.N,
    onChange(v){P.N=v;}}).el);
  secCoil.add(Lab.Slider({label:'Raggio R', unit:' m', min:0.5, max:2.0, step:0.1, value:P.R,
    onChange(v){P.R=v; coilR=P.R*scale; coilL=Math.min(coilR*1.6,scale*0.9);}}).el);
  secCoil.add(Lab.Slider({label:'Resistenza', unit:' Ω', min:0.1, max:5.0, step:0.1, value:P.resistance,
    onChange(v){P.resistance=v;}}).el);
  ctrl.appendChild(secCoil.el);

  const secMag = Lab.Section('Magnete');
  secMag.add(Lab.Slider({label:'Intensità', unit:'', min:0.5, max:10.0, step:0.5, value:P.strength,
    onChange(v){P.strength=v;}}).el);
  secMag.add(Lab.Slider({label:'Velocità oscill.', unit:'×', min:0.1, max:3.0, step:0.1, value:P.omega,
    onChange(v){P.omega=v;}}).el);
  ctrl.appendChild(secMag.el);
}

function resetSim() {
  animT = 0; simT = 0; magRel = 2.0;
  phi = 0; emf = 0; current = 0;
  histT = []; histPhi = []; histEMF = [];
}

/* ── Init ────────────────────────────────────────────────── */
Lab.initTheme('themeToggle');
window.addEventListener('resize', resize);
document.addEventListener('themechange', () => {
  dark = document.documentElement.getAttribute('data-theme') !== 'light';
});

resize();
buildControls();
initInteraction();
requestAnimationFrame(loop);

document.getElementById('btnPlay').addEventListener('click', () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', () => { resetSim(); });
