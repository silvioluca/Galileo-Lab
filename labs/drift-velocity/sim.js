'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const MAT = {
  Cu: {name:'Rame (Cu)',     n:8.47e28, rho:1.68e-8, alpha:0.00404},
  Al: {name:'Alluminio (Al)',n:18.1e28, rho:2.65e-8, alpha:0.00429},
  Ag: {name:'Argento (Ag)',  n:5.86e28, rho:1.59e-8, alpha:0.00380},
  Au: {name:'Oro (Au)',      n:5.90e28, rho:2.44e-8, alpha:0.00340},
};
const P = {
  on: true,        // corrente applicata
  I: 3,            // corrente (A)
  A: 1.0,          // sezione (mm²)
  L: 1.0,          // lunghezza (m)
  T: 293,          // temperatura (K)
  mat: 'Cu',
  zoom: 1,
  paused:false,
};
const e0=1.602e-19, me=9.109e-31, hbar=1.0546e-34;

let tAnim=0, last=0;
let electrons=[], tracer=null, comX=0;
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(225,238,250,0.96)':'rgba(20,40,70,0.95)',
    sub:   d?'rgba(165,195,220,0.82)':'rgba(60,90,125,0.9)',
    accent:d?'#00d4ff':'#0a78b0',
    cond:  d?'rgba(190,150,90,0.10)':'rgba(200,150,70,0.16)',
    condEdge:d?'rgba(220,170,90,0.55)':'rgba(170,120,40,0.6)',
    ion:   d?'rgba(255,150,90,0.85)':'rgba(210,110,40,0.9)',
    elec:  [90,170,255],
    tracer:[255,210,80],
    com:   [95,225,140],
    field: [255,110,90],
    cur:   [255,205,70],
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.3)':'rgba(40,80,130,0.32)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();
const rgb=(a)=>`rgb(${a[0]},${a[1]},${a[2]})`;
const rgba=(a,al)=>`rgba(${a[0]},${a[1]},${a[2]},${al})`;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// colore caratteristico del metallo
const MATCOL={ Cu:[184,115,51], Al:[170,178,188], Ag:[208,213,220], Au:[212,175,55] };
function matColor(){ return MATCOL[P.mat]||[170,178,188]; }
function shade(c,f){ return [clamp(Math.round(c[0]*f),0,255),clamp(Math.round(c[1]*f),0,255),clamp(Math.round(c[2]*f),0,255)]; }

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function mat(){ return MAT[P.mat]; }
function nDens(){ return mat().n; }
function rhoT(){ return mat().rho*(1+mat().alpha*(P.T-293)); }
function Acur(){ return P.A*1e-6; }                 // sezione (m²)
function Ieff(){ return P.on? P.I : 0; }
function vDrift(){ return Ieff()/(nDens()*e0*Acur()); }   // m/s
function Jdens(){ return Ieff()/Acur(); }                 // A/m²
function Efield(){ return rhoT()*Jdens(); }               // V/m
function resistance(){ return rhoT()*P.L/Acur(); }        // Ω
function voltage(){ return Ieff()*resistance(); }         // V
function mobility(){ return 1/(nDens()*e0*rhoT()); }      // m²/(V·s)
function vFermi(){ return hbar/me*Math.pow(3*Math.PI*Math.PI*nDens(),1/3); }  // m/s

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geom(W,H){
  const availW=W*0.84;
  // lunghezza ∝ L, diametro ∝ √A (A = π r²)
  const lenPx=(0.34 + 0.55*clamp((P.L-0.1)/(5-0.1),0,1))*availW*P.zoom;
  const rFrac=(Math.sqrt(P.A)-Math.sqrt(0.5))/(Math.sqrt(5)-Math.sqrt(0.5));
  const rPx=clamp(clamp(0.06+0.12*rFrac,0.055,0.18)*H*P.zoom, 18, H*0.42);
  const cx=W*0.49, cy=H*0.46;
  const x0=cx-lenPx/2, x1=cx+lenPx/2, y0=cy-rPx, y1=cy+rPx;
  G={W,H,x0,x1,y0,y1, cy, rPx, eRx:Math.min(20,rPx*0.55)};
}

// ═══ Animazione ═══════════════════════════════════════════════════════════════
const NE=160;
function vth(){ return 1.4 + 2.6*clamp((P.T-100)/400,0,1); }   // agitazione termica ∝ T
function driftVisPx(){
  if(!P.on) return 0;
  const f=clamp(vDrift()/2.2e-4, 0.05, 3.5);   // 1 ≈ default · amplificata per visibilità
  return -(0.12+0.72*f);                        // elettroni verso sinistra (−x)
}
function newVel(){ const a=Math.random()*Math.PI*2, s=vth()*(0.6+0.7*Math.random()); return [Math.cos(a)*s, Math.sin(a)*s]; }
function initElectrons(){
  electrons=[];
  for(let i=0;i<NE;i++){ const v=newVel();
    electrons.push({x:G.x0+Math.random()*(G.x1-G.x0), y:G.y0+8+Math.random()*(G.y1-G.y0-16), vx:v[0], vy:v[1]}); }
  const v=newVel(); tracer={x:(G.x0+G.x1)/2, y:G.cy, vx:v[0], vy:v[1], trail:[]};
  comX=(G.x0+G.x1)/2;
}
function collProb(dtf){ const tau=clamp(9*(293/P.T),3,30); return clamp(dtf/tau,0,1); }
function step(dt){
  if(P.paused) return;
  if(!electrons.length || electrons[0].x<G.x0-50 || electrons[0].x>G.x1+50) {/*safety*/}
  const dtf=Math.min(dt,0.05)*60;
  const cp=collProb(dtf), dv=driftVisPx();
  const ya=G.y0+6, yb=G.y1-6;
  for(const e of electrons){
    if(Math.random()<cp){ const v=newVel(); e.vx=v[0]; e.vy=v[1]; }
    e.x += (e.vx+dv)*dtf; e.y += e.vy*dtf;
    // rientro su lato opposto a y CASUALE con nuova velocità → flusso continuo (niente ondate)
    if(e.x<G.x0 || e.x>G.x1){ e.x=(e.x<G.x0)?G.x1:G.x0; e.y=ya+Math.random()*(yb-ya); const v=newVel(); e.vx=v[0]; e.vy=v[1]; }
    if(e.y<ya){ e.y=ya; e.vy=Math.abs(e.vy); } if(e.y>yb){ e.y=yb; e.vy=-Math.abs(e.vy); }
    e.x=clamp(e.x,G.x0,G.x1);
  }
  // tracciante (senza wrap, con scia)
  if(tracer){
    if(Math.random()<cp){ const v=newVel(); tracer.vx=v[0]; tracer.vy=v[1]; }
    tracer.x += (tracer.vx+dv)*dtf; tracer.y += tracer.vy*dtf;
    if(tracer.y<ya){ tracer.y=ya; tracer.vy=Math.abs(tracer.vy); } if(tracer.y>yb){ tracer.y=yb; tracer.vy=-Math.abs(tracer.vy); }
    tracer.trail.push([tracer.x,tracer.y]); if(tracer.trail.length>90) tracer.trail.shift();
    if(tracer.x<G.x0+4 || tracer.x>G.x1-4){ tracer.x=clamp(tracer.x,G.x0+6,G.x1-6); tracer.trail=[]; const v=newVel(); tracer.vx=v[0]; tracer.vy=v[1]; tracer.x=(G.x0+G.x1)/2; }
  }
  comX += dv*dtf; if(comX<G.x0) comX+=(G.x1-G.x0); if(comX>G.x1) comX-=(G.x1-G.x0);
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function arrow(ctx,x1,y1,x2,y2,col,lw){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1), s=5+lw;
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-s*Math.cos(a-0.45),y2-s*Math.sin(a-0.45));
  ctx.lineTo(x2-s*Math.cos(a+0.45),y2-s*Math.sin(a+0.45)); ctx.closePath(); ctx.fill();
}

function drawCylinder(ctx){
  const mc=matColor(), eRx=G.eRx, AB=0.40;
  const sc=(f,a)=>{ const c=shade(mc,f); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  // gradiente UNICO (translucido) usato per faccia laterale e per le due basi → stesso colore
  const g=ctx.createLinearGradient(0,G.y0,0,G.y1);
  g.addColorStop(0,sc(0.42,AB)); g.addColorStop(0.30,sc(1.05,AB)); g.addColorStop(0.5,sc(1.30,AB));
  g.addColorStop(0.72,sc(0.9,AB)); g.addColorStop(1,sc(0.42,AB));
  // mezza luna SINISTRA (base) — fuori dal rettangolo
  ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(G.x0,G.cy,eRx,G.rPx,0,Math.PI/2,3*Math.PI/2,false); ctx.closePath(); ctx.fill();
  // faccia laterale (rettangolo)
  ctx.fillStyle=g; ctx.fillRect(G.x0,G.y0,G.x1-G.x0,G.y1-G.y0);
  // contorni: lati lunghi + cucitura circolare a sinistra (la destra è la sezione, disegnata dopo)
  ctx.strokeStyle=sc(0.5,0.8); ctx.lineWidth=1.3;
  ctx.beginPath(); ctx.moveTo(G.x0,G.y0); ctx.lineTo(G.x1,G.y0); ctx.moveTo(G.x0,G.y1); ctx.lineTo(G.x1,G.y1); ctx.stroke();
  ctx.strokeStyle=sc(0.5,0.6); ctx.lineWidth=1.1;
  ctx.beginPath(); ctx.ellipse(G.x0,G.cy,eRx,G.rPx,0,0,Math.PI*2); ctx.stroke();
}
// sezione destra: ELLISSE PIENA con riflesso radiale bianco, sopra tutto (anche sugli elettroni)
function drawSection(ctx){
  const mc=matColor(), eRx=G.eRx;
  const sc=(f,a)=>{ const c=shade(mc,f); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const g=ctx.createLinearGradient(0,G.y0,0,G.y1);
  g.addColorStop(0,sc(0.42,0.92)); g.addColorStop(0.30,sc(1.05,0.92)); g.addColorStop(0.5,sc(1.30,0.92));
  g.addColorStop(0.72,sc(0.9,0.92)); g.addColorStop(1,sc(0.42,0.92));
  ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(G.x1,G.cy,eRx,G.rPx,0,0,Math.PI*2); ctx.fill();
  const sh=ctx.createRadialGradient(G.x1+eRx*0.35,G.cy-G.rPx*0.4,1,G.x1,G.cy,Math.max(eRx,G.rPx)*1.25);
  sh.addColorStop(0,'rgba(255,255,255,0.32)'); sh.addColorStop(0.6,'rgba(255,255,255,0.07)'); sh.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sh; ctx.beginPath(); ctx.ellipse(G.x1,G.cy,eRx,G.rPx,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=sc(0.5,0.7); ctx.lineWidth=1.2; ctx.beginPath(); ctx.ellipse(G.x1,G.cy,eRx,G.rPx,0,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('sezione A', G.x1+eRx+2, G.y0-6);
}

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  T=pal();
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  geom(W,H);

  // conduttore = cilindro (con sezione visibile a destra), colore del metallo
  drawCylinder(ctx);

  // contenuto entro il corpo del cilindro
  ctx.save(); ctx.beginPath(); ctx.rect(G.x0,G.y0,G.x1-G.x0,G.y1-G.y0); ctx.clip();
  const sp=Math.max(26, Math.min(40, (G.y1-G.y0)/4));
  for(let x=G.x0+sp*0.6; x<G.x1; x+=sp) for(let y=G.y0+sp*0.6; y<G.y1; y+=sp){
    ctx.fillStyle=T.ion; ctx.beginPath(); ctx.arc(x,y,3.4,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=rgba([255,180,120],0.5); ctx.lineWidth=0.8; ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.stroke();
  }
  // marcatore centro-di-massa (deriva netta)
  if(P.on){ ctx.fillStyle=rgba(T.com,0.16); ctx.fillRect(comX-7,G.y0,14,G.y1-G.y0);
    ctx.strokeStyle=rgba(T.com,0.7); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(comX,G.y0); ctx.lineTo(comX,G.y1); ctx.stroke(); }
  // scia del tracciante
  if(tracer && tracer.trail.length>1){ ctx.strokeStyle=rgba(T.tracer,0.6); ctx.lineWidth=1.4; ctx.beginPath();
    tracer.trail.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.stroke(); }
  // elettroni
  for(const e of electrons){ ctx.fillStyle=rgba(T.elec,0.92); ctx.beginPath(); ctx.arc(e.x,e.y,2.8,0,Math.PI*2); ctx.fill(); }
  // tracciante
  if(tracer){ ctx.fillStyle=rgb(T.tracer); ctx.beginPath(); ctx.arc(tracer.x,tracer.y,4.5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=dk()?'#000':'#fff'; ctx.lineWidth=1; ctx.stroke(); }
  ctx.restore();

  // sezione destra (ellisse piena) sopra agli elettroni del margine
  drawSection(ctx);

  // terminali batteria (+ sinistra, − destra)
  ctx.fillStyle=T.sub; ctx.font='bold 16px "Space Mono",monospace'; ctx.textAlign='center';
  if(P.on){ ctx.fillStyle=rgb(T.field); ctx.fillText('+', G.x0-14, G.cy+5); ctx.fillStyle=rgb(T.elec); ctx.fillText('−', G.x1+14, G.cy+5); }

  // vettori: corrente convenzionale (→), campo E (→), deriva elettroni (←)
  if(P.on){
    arrow(ctx, G.x0+20, G.y0-18, G.x0+90, G.y0-18, rgb(T.cur), 3);
    ctx.fillStyle=rgb(T.cur); ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('I  (corrente convenzionale)', G.x0+96, G.y0-14);
    arrow(ctx, G.x1-20, G.y1+22, G.x1-90, G.y1+22, rgb(T.elec), 3);
    ctx.fillStyle=rgb(T.elec); ctx.textAlign='right'; ctx.fillText('v_deriva (elettroni, lenta)', G.x1-96, G.y1+26);
    arrow(ctx, G.x0+20, G.y1+22, G.x0+70, G.y1+22, rgb(T.field), 2.4);
    ctx.fillStyle=rgb(T.field); ctx.textAlign='left'; ctx.fillText('E', G.x0+76, G.y1+26);
  }

  drawHeader(ctx,W,H);
}

function drawHeader(ctx,W,H){
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Velocità di deriva:  v_d = I /(n·e·A) = μ·E', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('Moto casuale ~10⁶ m/s (Fermi)  ≫  deriva ~10⁻⁴ m/s   ·   deriva amplificata per la visualizzazione', 14, 40);
  if(!P.on){ ctx.fillStyle=rgb(T.com); ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText('CORRENTE ASSENTE: moto puramente casuale, deriva netta nulla', (G.x0+G.x1)/2, G.y0-34); }
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
// 1: v_d vs I
function drawVdI(){
  const cv=gCanvas[0]; if(!cv||!cv.width)return; const ctx=gCtx[0],W=cv.width,H=cv.height;
  const PAD={t:14,b:18,l:30,r:8}; const {gW,gH}=gBase(ctx,W,H,PAD);
  const Imax=10, vdmax=Imax/(nDens()*e0*Acur());
  const xOf=i=>PAD.l+i/Imax*gW, yOf=v=>PAD.t+gH-v/vdmax*gH*0.9;
  ctx.strokeStyle=rgb(T.elec); ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(Imax),yOf(vdmax)); ctx.stroke();
  ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(xOf(Ieff()), yOf(vDrift()),3.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('v_d',PAD.l+2,PAD.t+7);
  ctx.textAlign='right'; ctx.fillText('I',PAD.l+gW-2,PAD.t+gH-3);
}
// 2: I–V (legge di Ohm)
function drawIV(){
  const cv=gCanvas[1]; if(!cv||!cv.width)return; const ctx=gCtx[1],W=cv.width,H=cv.height;
  const PAD={t:14,b:18,l:26,r:8}; const {gW,gH}=gBase(ctx,W,H,PAD);
  const R=resistance(), Imax=10, Vmax=Imax*R;
  const xOf=v=>PAD.l+(Vmax>0?v/Vmax:0)*gW, yOf=i=>PAD.t+gH-i/Imax*gH*0.9;
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(Vmax),yOf(Imax)); ctx.stroke();
  ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(xOf(voltage()), yOf(Ieff()),3.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('I',PAD.l+2,PAD.t+7);
  ctx.textAlign='right'; ctx.fillText('V',PAD.l+gW-2,PAD.t+gH-3);
  ctx.fillStyle=T.gText; ctx.textAlign='left'; ctx.fillText('R='+resistance().toExponential(1)+'Ω',PAD.l+4,PAD.t+gH-4);
}
// 3: confronto v_Fermi vs v_deriva (scala log)
function drawCompare(){
  const cv=gCanvas[2]; if(!cv||!cv.width)return; const ctx=gCtx[2],W=cv.width,H=cv.height;
  const PAD={t:16,b:24,l:10,r:10}; const {gW,gH}=gBase(ctx,W,H,PAD);
  const lo=-6, hi=7;   // 10^lo .. 10^hi  m/s
  const yOf=v=>{ const lg=Math.log10(Math.max(1e-9,v)); return PAD.t+gH-(clamp(lg,lo,hi)-lo)/(hi-lo)*gH; };
  const bars=[{v:vFermi(), c:T.tracer, l:'v_Fermi'},{v:Math.max(1e-9,vDrift()), c:T.elec, l:'v_deriva'}];
  const bw=gW/2*0.5;
  bars.forEach((b,i)=>{ const cx=PAD.l+gW*(i+0.5)/2, y=yOf(b.v);
    ctx.fillStyle=rgba(b.c,0.85); ctx.fillRect(cx-bw/2, y, bw, PAD.t+gH-y);
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(b.l,cx,PAD.t+gH+10);
    ctx.fillStyle=rgb(b.c); ctx.font='7px "Space Mono",monospace'; ctx.fillText(b.v.toExponential(1),cx,y-3); });
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('m/s (log)',PAD.l+2,PAD.t+6);
}
function drawGraphs(){ drawVdI(); drawIV(); drawCompare(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Conduttore');
  cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Materiale (densità n)',
    options:Object.keys(MAT).map(k=>({value:k, label:MAT[k].name, hint:(MAT[k].n/1e28).toFixed(1)+'·10²⁸'})),
    value:P.mat, onChange(v){ P.mat=v; } }));
  secM.add(Lab.Slider({ label:'Sezione A', min:0.5, max:5, step:0.1, value:P.A, unit:' mm²', onChange(v){P.A=v;} }));
  secM.add(Lab.Slider({ label:'Lunghezza L', min:0.1, max:5, step:0.1, value:P.L, unit:' m', onChange(v){P.L=v;} }));
  secM.add(Lab.Slider({ label:'Temperatura T', min:100, max:500, step:10, value:P.T, unit:' K', onChange(v){P.T=v;} }));
  const secE=Lab.Section('Corrente');
  cont.appendChild(secE.el);
  secE.add(Lab.Slider({ label:'Corrente I', min:0.1, max:10, step:0.1, value:P.I, unit:' A', onChange(v){P.I=v;} }));
}

function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  const TITLES=['v_d in funzione di I','Legge di Ohm I–V','Fermi vs deriva (log)'];
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div'); title.textContent=TITLES[i];
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas'); cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d');
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();
  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'vd', label:'v deriva'},
    {key:'vf', label:'v Fermi (casuale)'},
    {key:'ratio',label:'rapporto v_F/v_d'},
    {key:'J',  label:'Densità J'},
    {key:'mu', label:'Mobilità μ'},
    {key:'R',  label:'Resistenza R'},
  ]);
  const btnField=document.getElementById('btnField');
  function syncBtn(){ btnField.textContent = P.on ? '⚡  CORRENTE: ON' : '○  CORRENTE: OFF'; }
  btnField.addEventListener('click',()=>{ P.on=!P.on; syncBtn(); }); syncBtn();
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.on=true; P.I=3; P.A=1.0; P.L=1.0; P.T=293; P.mat='Cu'; P.zoom=1; P.paused=false; buildControls(); syncBtn(); initElectrons();
  });
  // zoom con la rotella
  simCanvas.style.cursor='zoom-in';
  simCanvas.addEventListener('wheel',e=>{ e.preventDefault(); P.zoom=clamp(P.zoom*(1-e.deltaY*0.0012),0.5,3.2); },{passive:false});

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(220,Math.floor(ar.height-rb.height-gaH-4));
    simCanvas.style.width=Math.floor(ar.width)+'px'; simCanvas.style.height=h+'px';
    simCanvas.width=Math.floor(ar.width); simCanvas.height=h;
    geom(simCanvas.width,simCanvas.height);
    if(!electrons.length) initElectrons();
    for(const cv of gCanvas){ if(!cv)continue; cv.width=Math.floor(cv.parentElement.clientWidth); cv.height=Math.floor(cv.parentElement.clientHeight); }
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(resize);

  last=performance.now();
  function frame(now){
    let dt=(now-last)/1000; last=now;
    if(!Number.isFinite(dt)||dt<0) dt=0; dt=Math.min(dt,0.05);
    tAnim+=dt;
    step(dt);
    draw(simCanvas);
    drawGraphs();
    readout.set('vd', P.on? vDrift().toExponential(2)+' m/s' : '0');
    readout.set('vf', vFermi().toExponential(2)+' m/s');
    readout.set('ratio', P.on? (vFermi()/vDrift()).toExponential(1) : '∞');
    readout.set('J', P.on? Jdens().toExponential(2)+' A/m²' : '0');
    readout.set('mu', mobility().toExponential(2)+' m²/Vs');
    readout.set('R', resistance().toExponential(2)+' Ω');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
