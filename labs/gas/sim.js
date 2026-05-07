'use strict';

/* ── Costanti fisiche ────────────────────────────────────── */
/* R = 8.314 J/(mol·K) = 8.314 kPa·L/(mol·K)
   Con P in kPa e V in L: PV = nRT vale direttamente (1 kPa·L = 1 J) */
const R_GAS = 8.314;

const GAS_TYPES = [
  { id:'mono', name:'Monoatomico (He, Ar)', Cv: 3*R_GAS/2, Cp: 5*R_GAS/2 },
  { id:'bi',   name:'Biatomico (N₂, O₂)',  Cv: 5*R_GAS/2, Cp: 7*R_GAS/2 },
];

/* ── Stato ───────────────────────────────────────────────── */
const params = {
  transform: 'isobaric',
  n:       1.0,   // mol
  gasType: 0,
  P1:      100,   // kPa
  T1:      300,   // K
  T2:      500,   // K   (isobara, isocora)
  P2:      250,   // kPa (isoterma)
};

/* ── Canvas ──────────────────────────────────────────────── */
const canvas      = document.getElementById('simCanvas');
const ctx         = canvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
let cw=0, ch=0, gw=0, gh=0;

function resizeCanvases() {
  const dpr    = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const graphH = graphArea.offsetHeight;
  const hH     = document.getElementById('resizeHandle').offsetHeight;
  const rH     = readoutEl.offsetHeight;
  cw = parent.clientWidth;
  ch = Math.max(100, parent.clientHeight - graphH - rH - hH);
  canvas.width  = cw*dpr; canvas.height = ch*dpr;
  canvas.style.width  = cw+'px'; canvas.style.height = ch+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  gw = graphArea.clientWidth; gh = graphArea.clientHeight;
  graphCanvas.width  = gw*dpr; graphCanvas.height = gh*dpr;
  graphCanvas.style.width  = gw+'px'; graphCanvas.style.height = gh+'px';
  gctx.setTransform(dpr,0,0,dpr,0,0);
}

/* ── Fisica ──────────────────────────────────────────────── */
function getStates() {
  const { n, P1, T1, T2, P2, transform } = params;
  const V1 = (n * R_GAS * T1) / P1;    // L  (PV = nRT, con P[kPa] V[L])
  let s2;
  switch (transform) {
    case 'isobaric':  s2 = { P: P1, V: (n*R_GAS*T2)/P1, T: T2 }; break;
    case 'isochoric': s2 = { P: (n*R_GAS*T2)/V1, V: V1,  T: T2 }; break;
    case 'isothermal':s2 = { P: P2, V: (n*R_GAS*T1)/P2,  T: T1 }; break;
  }
  return { s1: { P:P1, V:V1, T:T1 }, s2 };
}

function getThermo(s1, s2) {
  const { n, transform, gasType } = params;
  const Cv = GAS_TYPES[gasType].Cv;
  let W, dU, Q;
  switch (transform) {
    case 'isobaric':
      W  = s1.P * (s2.V - s1.V);         // kPa·L = J
      dU = n * Cv * (s2.T - s1.T);
      Q  = dU + W;
      break;
    case 'isochoric':
      W  = 0;
      dU = n * Cv * (s2.T - s1.T);
      Q  = dU;
      break;
    case 'isothermal':
      W  = n * R_GAS * s1.T * Math.log(s2.V / s1.V);
      dU = 0;
      Q  = W;
      break;
  }
  return { W, dU, Q };
}

/* ── Colore per temperatura ──────────────────────────────── */
/* 100K → blu, ~700K → arancio, 1500K → rosso */
function tempColor(T, alpha=1) {
  const t = Math.max(0, Math.min(1, (T - 100) / 1400));
  let r, g, b;
  if (t < 0.5) {
    const u = t * 2;
    r = Math.round(26 * (1-u) + u * 230);
    g = Math.round(102*(1-u) + u * 100);
    b = Math.round(255*(1-u) + u * 0);
  } else {
    const u = (t - 0.5) * 2;
    r = Math.round(230);
    g = Math.round(100*(1-u) + u * 30);
    b = Math.round(u * 0);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── Generatore pseudocasuale deterministico ─────────────── */
function seededRand(seed) {
  let s = (seed|0) ^ 0x7f4a9b3c;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ── Scena principale ────────────────────────────────────── */
function drawScene() {
  ctx.clearRect(0, 0, cw, ch);
  const dark = document.documentElement.dataset.theme !== 'light';
  const { s1, s2 } = getStates();

  const Vmax   = Math.max(s1.V, s2.V) * 1.15;
  const cylW   = Math.max(55, Math.min(95, cw * 0.17));
  const cylH   = Math.min(ch * 0.62, 320);
  const cylTop = (ch - cylH) * 0.30;
  const cx1    = cw * 0.22;
  const cx2    = cw * 0.75;

  drawGrid(dark);
  drawCylinder(cx1, cylTop, cylW, cylH, s1, Vmax, dark);
  drawCylinder(cx2, cylTop, cylW, cylH, s2, Vmax, dark);
  drawStateLabels(cx1, cylTop, cylH, s1, '1', dark);
  drawStateLabels(cx2, cylTop, cylH, s2, '2', dark);
  drawTransformArrow(cx1+cylW/2, cx2-cylW/2, cylTop+cylH*0.45, s1, dark);

  updateReadout(s1, s2, getThermo(s1, s2));
}

function drawGrid(dark) {
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x=0; x<=cw; x+=50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ch); ctx.stroke(); }
  for (let y=0; y<=ch; y+=50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cw,y); ctx.stroke(); }
}

function drawCylinder(cx, top, w, maxH, state, Vmax, dark) {
  const { P, V, T } = state;
  const gasH   = Math.max(5, (V / Vmax) * maxH);
  const bottom = top + maxH;
  const pistonY = bottom - gasH;

  // Riempimento gas (gradiente colorato per T)
  const grd = ctx.createLinearGradient(cx, pistonY, cx, bottom);
  grd.addColorStop(0, tempColor(T, 0.60));
  grd.addColorStop(1, tempColor(T, 0.25));
  ctx.fillStyle = grd;
  ctx.fillRect(cx - w/2, pistonY, w, gasH);

  // Particelle gas
  if (gasH > 10) {
    const rand  = seededRand(Math.round(V*80 + T));
    const nPart = Math.max(6, Math.min(50, Math.round(30 * (V/Vmax))));
    const pR    = Math.max(1.5, Math.min(3.5, 1.8 * Math.sqrt(T/300)));
    ctx.fillStyle = tempColor(T, 0.90);
    for (let i=0; i<nPart; i++) {
      const px = cx - w/2 + pR*2 + rand()*(w - pR*4);
      const py = pistonY + pR*2 + rand()*(gasH - pR*4);
      if (py > pistonY && py < bottom) {
        ctx.beginPath(); ctx.arc(px, py, pR, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  // Pareti cilindro
  const wallCol = dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,130,200,0.60)';
  ctx.strokeStyle = wallCol; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx-w/2, top);    ctx.lineTo(cx-w/2, bottom);
  ctx.moveTo(cx+w/2, top);    ctx.lineTo(cx+w/2, bottom);
  ctx.moveTo(cx-w/2, bottom); ctx.lineTo(cx+w/2, bottom);
  ctx.stroke();

  // Pistone
  const pH = 10;
  ctx.fillStyle = dark ? 'rgba(80,170,255,0.85)' : 'rgba(0,90,200,0.75)';
  ctx.fillRect(cx-w/2+2, pistonY - pH/2, w-4, pH);
  ctx.strokeStyle = wallCol; ctx.lineWidth = 1.5;
  ctx.strokeRect(cx-w/2+2, pistonY - pH/2, w-4, pH);

  // Blocco pistone per isocora (tacche ai lati)
  if (params.transform === 'isochoric') {
    ctx.strokeStyle = dark ? 'rgba(255,200,0,0.85)' : 'rgba(180,130,0,0.90)';
    ctx.lineWidth = 2.5;
    const ext = w/2 + 12;
    [-1,1].forEach(s => {
      const lx = cx + s*ext;
      ctx.beginPath();
      ctx.moveTo(lx, pistonY-7); ctx.lineTo(lx, pistonY+7);
      ctx.moveTo(lx, pistonY-7); ctx.lineTo(lx - s*6, pistonY-7);
      ctx.stroke();
    });
  }
}

function drawStateLabels(cx, cylTop, cylH, state, num, dark) {
  const { P, V, T } = state;
  const bottom = cylTop + cylH;
  const fS  = Math.max(10, Math.min(13, cw*0.022));
  const col = dark ? 'rgba(200,230,255,0.90)' : 'rgba(10,30,70,0.90)';
  const sub = dark ? 'rgba(140,190,240,0.70)' : 'rgba(30,60,130,0.65)';

  ctx.textAlign = 'center';

  // Titolo sopra
  ctx.font = `700 ${fS}px 'DM Sans', sans-serif`;
  ctx.fillStyle = col;
  ctx.fillText(`Stato ${num}`, cx, cylTop - 22);

  ctx.font = `${fS-2}px 'Space Mono', monospace`;
  ctx.fillStyle = sub;
  ctx.fillText(`P = ${P.toFixed(1)} kPa`, cx, cylTop - 8);

  // Valori sotto
  ctx.font = `${fS-1}px 'Space Mono', monospace`;
  ctx.fillStyle = sub;
  ctx.fillText(`V = ${V.toFixed(2)} L`,   cx, bottom + 16);
  ctx.fillText(`T = ${T.toFixed(0)} K`,   cx, bottom + 30);

  // Barra temperatura
  const bW = Math.min(70, cw*0.12), bH = 5;
  const bX = cx - bW/2, bY = bottom + 40;
  const frac = Math.max(0, Math.min(1, (T-100)/1400));
  const bg = ctx.createLinearGradient(bX, 0, bX+bW, 0);
  bg.addColorStop(0, '#1a66ff'); bg.addColorStop(1, '#ff3300');
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  ctx.fillRect(bX, bY, bW, bH);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = bg;
  ctx.fillRect(bX, bY, bW*frac, bH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = tempColor(T, 0.90);
  ctx.beginPath(); ctx.arc(bX + bW*frac, bY + bH/2, 5, 0, Math.PI*2); ctx.fill();
}

function drawTransformArrow(x1, x2, y, s1, dark) {
  const labels = { isobaric:'ISOBARA', isochoric:'ISOCORA', isothermal:'ISOTERMA' };
  const constLabels = {
    isobaric:   `P = ${params.P1} kPa`,
    isochoric:  `V = ${s1.V.toFixed(2)} L`,
    isothermal: `T = ${params.T1} K`,
  };
  const midX = (x1+x2) / 2;

  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.50)' : 'rgba(0,130,200,0.55)';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6,4]);
  ctx.beginPath(); ctx.moveTo(x1+8, y); ctx.lineTo(x2-8, y); ctx.stroke();
  ctx.setLineDash([]);

  // Punta freccia
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.75)' : 'rgba(0,130,200,0.75)';
  ctx.beginPath();
  ctx.moveTo(x2-8, y-6); ctx.lineTo(x2+1, y); ctx.lineTo(x2-8, y+6);
  ctx.fill();

  const fS = Math.max(9, Math.min(12, cw*0.020));
  ctx.textAlign = 'center';
  ctx.font = `700 ${fS}px 'Space Mono', monospace`;
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.85)' : 'rgba(0,100,180,0.85)';
  ctx.fillText(labels[params.transform], midX, y - 13);
  ctx.font = `${fS-1}px 'Space Mono', monospace`;
  ctx.fillStyle = dark ? 'rgba(180,220,255,0.50)' : 'rgba(30,80,160,0.50)';
  ctx.fillText(constLabels[params.transform], midX, y + 1);
}

/* ── Readout ─────────────────────────────────────────────── */
function updateReadout(s1, s2, th) {
  const sgn = v => v >= 0 ? '+' : '';
  const items = [
    { label:'P₁', value:`${s1.P.toFixed(1)} kPa` },
    { label:'V₁', value:`${s1.V.toFixed(2)} L`   },
    { label:'T₁', value:`${s1.T.toFixed(0)} K`   },
    { label:'P₂', value:`${s2.P.toFixed(1)} kPa` },
    { label:'V₂', value:`${s2.V.toFixed(2)} L`   },
    { label:'T₂', value:`${s2.T.toFixed(0)} K`   },
    { label:'W',  value:`${sgn(th.W)}${th.W.toFixed(0)} J`  },
    { label:'ΔU', value:`${sgn(th.dU)}${th.dU.toFixed(0)} J` },
    { label:'Q',  value:`${sgn(th.Q)}${th.Q.toFixed(0)} J`  },
  ];
  readoutEl.innerHTML = items.map(it =>
    `<span class="readout-item"><span class="readout-label">${it.label}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Grafici ─────────────────────────────────────────────── */
function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0,0,gw,gh);
  const dark = document.documentElement.dataset.theme !== 'light';
  const pw = Math.floor(gw/3);
  drawPVPanel(0,    0, pw,       gh, dark);
  drawVTPanel(pw,   0, pw,       gh, dark);
  drawPTPanel(pw*2, 0, gw-pw*2, gh, dark);
}

const GP = { l:40, r:10, t:20, b:28 };

function panelBase(gc, ox, oy, pw, ph, dark) {
  gc.fillStyle = dark ? '#0b1018' : '#f0f2f5';
  gc.fillRect(ox, oy, pw, ph);
  const l=ox+GP.l, t=oy+GP.t, iW=pw-GP.l-GP.r, iH=ph-GP.t-GP.b;
  gc.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; gc.lineWidth=1;
  for (let i=0; i<=4; i++) {
    const x=l+(i/4)*iW; gc.beginPath(); gc.moveTo(x,t); gc.lineTo(x,t+iH); gc.stroke();
    const y=t+(i/4)*iH; gc.beginPath(); gc.moveTo(l,y); gc.lineTo(l+iW,y); gc.stroke();
  }
  if (ox > 0) {
    gc.strokeStyle = dark ? 'rgba(0,212,255,0.07)' : 'rgba(0,100,160,0.07)';
    gc.beginPath(); gc.moveTo(ox,oy); gc.lineTo(ox,oy+ph); gc.stroke();
  }
  return { l, t, iW, iH };
}

function panelTitle(gc, ox, oy, pw, title, dark) {
  gc.fillStyle = dark ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  gc.font = `10px 'Space Mono', monospace`; gc.textAlign='center';
  gc.fillText(title, ox+pw/2, oy+13);
}

function fmtTick(v) {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10)   return v.toFixed(1);
  return v.toFixed(2);
}

function axisLabels(gc, l, t, iW, iH, xMin, xMax, yMin, yMax, xUnit, yUnit, dark) {
  const tc = dark ? '#6b8099' : '#4a6278';
  gc.fillStyle = tc; gc.font = `9px 'Space Mono', monospace`;
  gc.textAlign='center';
  gc.fillText(fmtTick(xMin),           l,       t+iH+14);
  gc.fillText(fmtTick((xMin+xMax)/2),  l+iW/2,  t+iH+14);
  gc.fillText(fmtTick(xMax)+' '+xUnit, l+iW,    t+iH+14);
  gc.textAlign='right';
  gc.fillText(fmtTick(yMax)+' '+yUnit, l-3, t+4);
  gc.fillText(fmtTick(yMin),           l-3, t+iH+4);
}

function tx(v, vMin, vMax, l, iW) { return l + (v-vMin)/(vMax-vMin)*iW; }
function ty(v, vMin, vMax, t, iH) { return t + iH - (v-vMin)/(vMax-vMin)*iH; }

function drawDot(gc, x, y, col, lbl, above) {
  gc.fillStyle = col;
  gc.beginPath(); gc.arc(x, y, 4.5, 0, Math.PI*2); gc.fill();
  gc.font = `bold 10px 'Space Mono', monospace`; gc.textAlign='center';
  gc.fillText(lbl, x, above ? y-9 : y+16);
}

function midArrow(gc, x1, y1, x2, y2, col) {
  const ang = Math.atan2(y2-y1, x2-x1);
  const mx  = (x1+x2)/2, my = (y1+y2)/2;
  const hl  = 7;
  gc.fillStyle = col;
  gc.beginPath();
  gc.moveTo(mx + Math.cos(ang)*hl*0.4,  my + Math.sin(ang)*hl*0.4);
  gc.lineTo(mx - Math.cos(ang-0.45)*hl, my - Math.sin(ang-0.45)*hl);
  gc.lineTo(mx - Math.cos(ang+0.45)*hl, my - Math.sin(ang+0.45)*hl);
  gc.closePath(); gc.fill();
}

/* ─ Pannello P-V ─ */
function drawPVPanel(ox, oy, pw, ph, dark) {
  const { l,t,iW,iH } = panelBase(gctx, ox, oy, pw, ph, dark);
  const { s1, s2 } = getStates();
  const Vlo=0, Plo=0;
  const Vhi = Math.max(s1.V, s2.V) * 2.0;
  const Phi = Math.max(s1.P, s2.P) * 2.0;

  const X = v => tx(v, Vlo, Vhi, l, iW);
  const Y = v => ty(v, Plo, Phi, t, iH);

  gctx.lineWidth = 1.5;

  // Curva di riferimento (leggera, tutta la gamma)
  gctx.strokeStyle = dark ? 'rgba(0,212,255,0.12)' : 'rgba(0,130,200,0.10)';
  switch (params.transform) {
    case 'isobaric':
      gctx.beginPath(); gctx.moveTo(X(Vlo), Y(s1.P)); gctx.lineTo(X(Vhi), Y(s1.P)); gctx.stroke();
      break;
    case 'isochoric':
      gctx.beginPath(); gctx.moveTo(X(s1.V), Y(Plo)); gctx.lineTo(X(s1.V), Y(Phi)); gctx.stroke();
      break;
    case 'isothermal': {
      const PV = s1.P * s1.V;
      gctx.beginPath();
      let first=true;
      for (let v=Vhi*0.04; v<=Vhi; v+=Vhi/300) {
        const p = PV/v; if (p>Phi*1.05) continue;
        const cx=X(v), cy=Y(p); first ? gctx.moveTo(cx,cy) : gctx.lineTo(cx,cy); first=false;
      }
      gctx.stroke();
      break;
    }
  }

  // Percorso trasformazione (spesso, colorato)
  gctx.strokeStyle = '#00d4ff'; gctx.lineWidth = 2.2;
  switch (params.transform) {
    case 'isobaric':
      gctx.beginPath();
      gctx.moveTo(X(s1.V), Y(s1.P)); gctx.lineTo(X(s2.V), Y(s2.P));
      gctx.stroke(); break;
    case 'isochoric':
      gctx.beginPath();
      gctx.moveTo(X(s1.V), Y(s1.P)); gctx.lineTo(X(s2.V), Y(s2.P));
      gctx.stroke(); break;
    case 'isothermal': {
      const PV = s1.P * s1.V;
      const vA = Math.min(s1.V,s2.V), vB = Math.max(s1.V,s2.V);
      gctx.beginPath();
      let first=true;
      for (let v=vA; v<=vB; v+=(vB-vA)/150) {
        const p=PV/v; if(p>Phi*1.05) continue;
        const cx=X(v), cy=Y(p); first ? gctx.moveTo(cx,cy) : gctx.lineTo(cx,cy); first=false;
      }
      gctx.lineTo(X(vB), Y(PV/vB));
      gctx.stroke(); break;
    }
  }

  // Freccia a metà percorso
  const midV = params.transform==='isothermal' ? Math.sqrt(s1.V*s2.V) : (s1.V+s2.V)/2;
  const midP = params.transform==='isothermal' ? s1.P*s1.V/midV
             : params.transform==='isobaric'   ? s1.P : (s1.P+s2.P)/2;
  midArrow(gctx, X(s1.V), Y(s1.P), X(s2.V), Y(s2.P), '#00d4ff');

  // Assi
  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth=1; gctx.strokeRect(l,t,iW,iH);
  axisLabels(gctx, l,t,iW,iH, Vlo,Vhi,Plo,Phi, 'L','kPa', dark);

  // Punti
  drawDot(gctx, X(s1.V), Y(s1.P), '#2ecc71', '1', s1.P > s2.P || s1.P===s2.P);
  drawDot(gctx, X(s2.V), Y(s2.P), '#ff6b6b', '2', s2.P > s1.P);

  panelTitle(gctx, ox, oy, pw, 'Diagramma P-V', dark);
}

/* ─ Pannello V-T ─ */
function drawVTPanel(ox, oy, pw, ph, dark) {
  const { l,t,iW,iH } = panelBase(gctx, ox, oy, pw, ph, dark);
  const { s1, s2 } = getStates();
  const Tlo=0, Vlo=0;
  const Thi = Math.max(s1.T, s2.T) * 1.8;
  const Vhi = Math.max(s1.V, s2.V) * 2.0;

  const X = v => tx(v, Tlo, Thi, l, iW);
  const Y = v => ty(v, Vlo, Vhi, t, iH);

  gctx.lineWidth = 1.5;

  // Riferimento
  gctx.strokeStyle = dark ? 'rgba(46,204,113,0.12)' : 'rgba(30,150,80,0.10)';
  switch (params.transform) {
    case 'isobaric': {
      const sl = params.n * R_GAS / params.P1;
      gctx.beginPath(); gctx.moveTo(X(0), Y(0)); gctx.lineTo(X(Thi), Y(sl*Thi)); gctx.stroke();
      break;
    }
    case 'isochoric':
      gctx.beginPath(); gctx.moveTo(X(Tlo), Y(s1.V)); gctx.lineTo(X(Thi), Y(s1.V)); gctx.stroke();
      break;
    case 'isothermal':
      gctx.beginPath(); gctx.moveTo(X(s1.T), Y(Vlo)); gctx.lineTo(X(s1.T), Y(Vhi)); gctx.stroke();
      break;
  }

  // Percorso
  gctx.strokeStyle = '#2ecc71'; gctx.lineWidth = 2.2;
  gctx.beginPath(); gctx.moveTo(X(s1.T), Y(s1.V)); gctx.lineTo(X(s2.T), Y(s2.V)); gctx.stroke();
  midArrow(gctx, X(s1.T), Y(s1.V), X(s2.T), Y(s2.V), '#2ecc71');

  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth=1; gctx.strokeRect(l,t,iW,iH);
  axisLabels(gctx, l,t,iW,iH, Tlo,Thi,Vlo,Vhi, 'K','L', dark);

  drawDot(gctx, X(s1.T), Y(s1.V), '#2ecc71', '1', s1.V > s2.V || s1.V===s2.V);
  drawDot(gctx, X(s2.T), Y(s2.V), '#ff6b6b', '2', s2.V > s1.V);
  panelTitle(gctx, ox, oy, pw, 'Diagramma V-T', dark);
}

/* ─ Pannello P-T ─ */
function drawPTPanel(ox, oy, pw, ph, dark) {
  const { l,t,iW,iH } = panelBase(gctx, ox, oy, pw, ph, dark);
  const { s1, s2 } = getStates();
  const Tlo=0, Plo=0;
  const Thi = Math.max(s1.T, s2.T) * 1.8;
  const Phi = Math.max(s1.P, s2.P) * 2.0;

  const X = v => tx(v, Tlo, Thi, l, iW);
  const Y = v => ty(v, Plo, Phi, t, iH);

  gctx.lineWidth = 1.5;

  // Riferimento
  gctx.strokeStyle = dark ? 'rgba(243,156,18,0.12)' : 'rgba(200,120,0,0.10)';
  switch (params.transform) {
    case 'isobaric':
      gctx.beginPath(); gctx.moveTo(X(Tlo), Y(s1.P)); gctx.lineTo(X(Thi), Y(s1.P)); gctx.stroke();
      break;
    case 'isochoric': {
      const sl = params.n * R_GAS / s1.V;
      gctx.beginPath(); gctx.moveTo(X(0), Y(0)); gctx.lineTo(X(Thi), Y(sl*Thi)); gctx.stroke();
      break;
    }
    case 'isothermal':
      gctx.beginPath(); gctx.moveTo(X(s1.T), Y(Plo)); gctx.lineTo(X(s1.T), Y(Phi)); gctx.stroke();
      break;
  }

  // Percorso
  gctx.strokeStyle = '#f39c12'; gctx.lineWidth = 2.2;
  gctx.beginPath(); gctx.moveTo(X(s1.T), Y(s1.P)); gctx.lineTo(X(s2.T), Y(s2.P)); gctx.stroke();
  midArrow(gctx, X(s1.T), Y(s1.P), X(s2.T), Y(s2.P), '#f39c12');

  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth=1; gctx.strokeRect(l,t,iW,iH);
  axisLabels(gctx, l,t,iW,iH, Tlo,Thi,Plo,Phi, 'K','kPa', dark);

  drawDot(gctx, X(s1.T), Y(s1.P), '#2ecc71', '1', s1.P > s2.P || s1.P===s2.P);
  drawDot(gctx, X(s2.T), Y(s2.P), '#ff6b6b', '2', s2.P > s1.P);
  panelTitle(gctx, ox, oy, pw, 'Diagramma P-T', dark);
}

/* ── Controlli ───────────────────────────────────────────── */
function buildControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  /* Trasformazione */
  const secT = Lab.Section('Trasformazione');
  secT.add(Lab.RadioGroup({ label:'transf', options: [
    { label:'Isobara  (ΔP = 0)',  value:'isobaric'   },
    { label:'Isocora  (ΔV = 0)',  value:'isochoric'  },
    { label:'Isoterma (ΔT = 0)',  value:'isothermal' },
  ], value: params.transform,
    onChange(v) { params.transform=v; buildControls(); requestRedraw(); },
  }));
  el.appendChild(secT.el);

  /* Gas */
  const secG = Lab.Section('Gas');
  secG.add(Lab.SliderInput({ label:'Quantità n', min:0.1, max:5, step:0.1,
    value: params.n, unit:' mol',
    onChange(v) { params.n=v; requestRedraw(); },
  }));
  secG.add(Lab.RadioGroup({ label:'gtype', options:
    GAS_TYPES.map((g,i) => ({ label:g.name, value:i })),
    value: params.gasType,
    onChange(v) { params.gasType=v; requestRedraw(); },
  }));
  el.appendChild(secG.el);

  /* Stato iniziale */
  const secI = Lab.Section('Stato iniziale');
  secI.add(Lab.SliderInput({ label:'Pressione P₁', min:10, max:1000, step:1,
    value: params.P1, unit:' kPa',
    hint: 'pressione iniziale del gas',
    onChange(v) { params.P1=v; requestRedraw(); },
  }));
  secI.add(Lab.SliderInput({ label:'Temperatura T₁', min:100, max:2000, step:5,
    value: params.T1, unit:' K',
    hint: 'temperatura iniziale (V₁ = nRT₁/P₁)',
    onChange(v) { params.T1=v; requestRedraw(); },
  }));
  el.appendChild(secI.el);

  /* Stato finale — dipende dalla trasformazione */
  const secF = Lab.Section('Stato finale');
  if (params.transform === 'isobaric' || params.transform === 'isochoric') {
    secF.add(Lab.SliderInput({ label:'Temperatura T₂', min:100, max:2000, step:5,
      value: params.T2, unit:' K',
      hint: params.transform==='isobaric'
        ? 'P₂ = P₁,  V₂ = nRT₂/P₁'
        : 'V₂ = V₁,  P₂ = nRT₂/V₁',
      onChange(v) { params.T2=v; requestRedraw(); },
    }));
  } else {
    secF.add(Lab.SliderInput({ label:'Pressione P₂', min:10, max:1000, step:1,
      value: params.P2, unit:' kPa',
      hint: 'T₂ = T₁,  V₂ = nRT₁/P₂',
      onChange(v) { params.P2=v; requestRedraw(); },
    }));
  }
  el.appendChild(secF.el);
}

/* ── Ridisegno ───────────────────────────────────────────── */
let _pending = false;
function requestRedraw() {
  if (!_pending) {
    _pending = true;
    requestAnimationFrame(() => { _pending=false; drawScene(); drawGraphs(); });
  }
}

/* ── Handle resize ───────────────────────────────────────── */
function initResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  let drag=false, startY=0, startH=0;
  handle.addEventListener('mousedown', e => {
    drag=true; startY=e.clientY; startH=graphArea.offsetHeight;
    document.body.style.userSelect='none';
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    graphArea.style.height = Math.max(80, Math.min(500, startH+(startY-e.clientY)))+'px';
    resizeCanvases(); requestRedraw();
  });
  document.addEventListener('mouseup', () => { if(drag){drag=false; document.body.style.userSelect='';} });
}

/* ── Fullscreen ──────────────────────────────────────────── */
function initFullscreen() {
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    !document.fullscreenElement
      ? (graphArea.requestFullscreen?.() ?? graphArea.webkitRequestFullscreen?.())
      : (document.exitFullscreen?.()  ?? document.webkitExitFullscreen?.());
  });
  document.addEventListener('fullscreenchange', () => { resizeCanvases(); requestRedraw(); });
}

new MutationObserver(() => requestRedraw())
  .observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });

/* ── Init ────────────────────────────────────────────────── */
function init() {
  Lab.initTheme();
  buildControls();
  graphArea.style.height = (window.innerWidth < 800 ? 130 : 240) + 'px';
  resizeCanvases();
  requestRedraw();

  new ResizeObserver(() => { resizeCanvases(); requestRedraw(); }).observe(canvas.parentElement);
  initResizeHandle();
  initFullscreen();

  document.getElementById('btnPlay').addEventListener('click', requestRedraw);
  document.getElementById('btnReset').addEventListener('click', () => {
    params.transform='isobaric'; params.n=1.0; params.gasType=0;
    params.P1=100; params.T1=300; params.T2=500; params.P2=250;
    buildControls(); requestRedraw();
  });
}

init();
