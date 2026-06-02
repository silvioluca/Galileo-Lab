'use strict';

// ═══ Dati: righe spettrali (λ in nm, intensità relativa 0–1) ═══════════════════
// Comprende UV (<380), visibile (380–750) e IR (>750). Valori didattici NIST.
const ELEMENTS = {
  H:  { Z:1,  name:'Idrogeno', lines:[[656.3,1.0],[486.1,0.42],[434.0,0.22],[410.2,0.12],[397.0,0.06],[364.6,0.05],[121.6,1.0],[102.6,0.35],[97.3,0.18]] },
  He: { Z:2,  name:'Elio',     lines:[[587.6,1.0],[447.1,0.5],[667.8,0.5],[501.6,0.45],[471.3,0.3],[492.2,0.3],[706.5,0.35],[728.1,0.2],[388.9,0.5],[1083.0,1.0],[318.8,0.2]] },
  Li: { Z:3,  name:'Litio',    lines:[[670.8,1.0],[610.4,0.4],[460.3,0.2],[323.3,0.2],[812.6,0.3]] },
  Na: { Z:11, name:'Sodio',    lines:[[589.0,1.0],[589.6,0.95],[568.8,0.15],[615.4,0.1],[330.3,0.3],[819.5,0.5],[818.3,0.45]] },
  K:  { Z:19, name:'Potassio', lines:[[766.5,1.0],[769.9,0.6],[404.4,0.18],[404.7,0.12],[344.7,0.1]] },
  Ca: { Z:20, name:'Calcio',   lines:[[422.7,1.0],[393.4,0.6],[396.8,0.5],[612.2,0.3],[616.2,0.3],[558.9,0.2],[272.2,0.2]] },
  Ne: { Z:10, name:'Neon',     lines:[[640.2,1.0],[638.3,0.8],[633.4,0.7],[626.6,0.6],[621.7,0.5],[614.3,0.5],[607.4,0.5],[603.0,0.4],[594.5,0.55],[588.2,0.45],[585.2,0.6],[650.7,0.5],[659.9,0.4],[692.9,0.3],[703.2,0.3],[540.1,0.2],[865.4,0.5],[837.8,0.4]] },
  Hg: { Z:80, name:'Mercurio', lines:[[546.1,1.0],[435.8,0.8],[577.0,0.6],[579.1,0.6],[404.7,0.5],[491.6,0.3],[365.0,0.7],[253.7,1.0],[1014.0,0.4]] },
  Ar: { Z:18, name:'Argon',    lines:[[811.5,1.0],[763.5,0.8],[750.4,0.7],[772.4,0.6],[696.5,0.6],[706.7,0.5],[738.4,0.5],[794.8,0.5],[415.9,0.3],[420.1,0.3],[451.1,0.2],[912.3,0.5],[922.5,0.4]] },
};
const EL_KEYS = Object.keys(ELEMENTS);

const VIS_MIN=380, VIS_MAX=750;

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  el:        'H',
  mode:      'emission',
  broaden:   2.0,
  labels:    true,
  bothBands: true,
  fullRange: false,        // mostra anche UV/IR
};
let hoverLambda = null;
let gCanvas=[null,null], gCtx=[null,null];
let readout;

function WMIN(){ return P.fullRange ? 100  : VIS_MIN; }
function WMAX(){ return P.fullRange ? 1100 : VIS_MAX; }

// ═══ Palette theme-aware ══════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:     d?'#06090f':'#e7edf4',
    band:   '#04060c',
    nonvis: d?'#0c1018':'#11151c',     // regioni UV/IR (non visibile)
    txt:    d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:    d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent: d?'#00d4ff':'#0a78b0',
    axis:   d?'rgba(140,175,205,0.6)':'rgba(55,90,125,0.85)',
    gBg:    d?'rgb(3,9,22)':'#eef2f7',
    gAxis:  d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText:  d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
    tick:   d?'rgba(150,180,210,0.55)':'rgba(60,95,130,0.8)',
    frame:  d?'rgba(150,180,210,0.25)':'rgba(60,95,130,0.4)',
  };
}
let T = pal();

// ═══ λ (nm) → RGB ═════════════════════════════════════════════════════════════
function nmToRgb(l) {
  let r=0,g=0,b=0;
  if      (l<380) { r=0.2; g=0; b=0.3; }
  else if (l<440) { r=-(l-440)/(440-380); g=0; b=1; }
  else if (l<490) { r=0; g=(l-440)/(490-440); b=1; }
  else if (l<510) { r=0; g=1; b=-(l-510)/(510-490); }
  else if (l<580) { r=(l-510)/(580-510); g=1; b=0; }
  else if (l<645) { r=1; g=-(l-645)/(645-580); b=0; }
  else if (l<=780){ r=1; g=0; b=0; }
  else            { r=0.35; g=0; b=0; }
  let f=1;
  if (l<420) f=0.3+0.7*(l-380)/40;
  else if (l>700) f=0.3+0.7*(780-l)/80;
  const q=x=>Math.round(255*Math.pow(Math.max(0,Math.min(1,x))*f,0.8));
  return [q(r),q(g),q(b)];
}
// colore per righe, incluse UV/IR (rese visibili con tinta convenzionale)
function colorForLine(l){
  if (l < VIS_MIN) return [185,150,240];   // UV → violetto chiaro
  if (l > VIS_MAX) return [235,95,70];      // IR → rosso scuro
  return nmToRgb(l);
}

function lToX(l, x0, w){ return x0 + (l-WMIN())/(WMAX()-WMIN())*w; }
function xToL(x, x0, w){ return WMIN() + (x-x0)/w*(WMAX()-WMIN()); }
function windowLines(){ return ELEMENTS[P.el].lines.filter(([l])=>l>=WMIN()&&l<=WMAX()); }

// ═══ Rendering ════════════════════════════════════════════════════════════════
function draw(canvas) {
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);

  const el=ELEMENTS[P.el];
  const margin=46, x0=margin, w=W-margin*2;

  ctx.fillStyle=T.accent; ctx.font='bold 22px "Space Mono",monospace';
  ctx.fillText(`${P.el}`, x0, 34);
  ctx.fillStyle=T.txt; ctx.font='15px "DM Sans",sans-serif';
  ctx.fillText(el.name, x0+36, 26);
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  ctx.fillText(`Z=${el.Z} · ${windowLines().length} righe · ${P.fullRange?'UV–vis–IR':'visibile'}`, x0+36, 40);

  const both=P.bothBands;
  const bandH=both?Math.min(120,(H-150)/2):Math.min(190,H-150);
  let y=60;

  if (both||P.mode==='emission'){ drawBandLabel(ctx,'EMISSIONE',x0,y); drawEmission(ctx,x0,y+10,w,bandH); y+=bandH+34; }
  if (both||P.mode==='absorption'){ drawBandLabel(ctx,'ASSORBIMENTO',x0,y); drawAbsorption(ctx,x0,y+10,w,bandH); y+=bandH+34; }

  drawRuler(ctx,x0,y-12,w);

  if (hoverLambda!=null){
    const hx=lToX(hoverLambda,x0,w);
    ctx.strokeStyle=T.axis; ctx.lineWidth=1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(hx,58); ctx.lineTo(hx,y-14); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=T.txt; ctx.font='11px "Space Mono",monospace';
    const reg = hoverLambda<VIS_MIN?' (UV)':hoverLambda>VIS_MAX?' (IR)':'';
    ctx.fillText(`${hoverLambda.toFixed(1)} nm${reg}`, Math.min(hx+5,W-92), 54);
  }
}

function drawBandLabel(ctx,txt,x,y){ ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.fillText(txt,x,y+6); }
function lineWidthFor(i){ return 0.8 + P.broaden*(0.4+i*1.4); }

// disegna le bande grigie UV/IR + etichette regione
function drawNonVisRegions(ctx, x0, y, w, h) {
  if (!P.fullRange) return;
  const xUVend=lToX(VIS_MIN,x0,w), xIRstart=lToX(VIS_MAX,x0,w);
  ctx.save();
  ctx.fillStyle=T.nonvis;
  ctx.fillRect(x0,y,xUVend-x0,h);
  ctx.fillRect(xIRstart,y,(x0+w)-xIRstart,h);
  ctx.fillStyle='rgba(180,180,200,0.35)'; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('UV', (x0+xUVend)/2-8, y+14);
  ctx.fillText('IR', (xIRstart+x0+w)/2-6, y+14);
  ctx.restore();
}

function drawEmission(ctx, x0, y, w, h) {
  ctx.fillStyle=T.band; ctx.fillRect(x0,y,w,h);
  drawNonVisRegions(ctx,x0,y,w,h);
  ctx.save();
  for (const [l,inten] of windowLines()) {
    const x=lToX(l,x0,w);
    const [r,g,b]=colorForLine(l);
    const lw=lineWidthFor(inten);
    const grd=ctx.createLinearGradient(x-lw*4,0,x+lw*4,0);
    grd.addColorStop(0,`rgba(${r},${g},${b},0)`);
    grd.addColorStop(0.5,`rgba(${r},${g},${b},${0.35*inten})`);
    grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
    ctx.fillStyle=grd; ctx.fillRect(x-lw*4,y,lw*8,h);
    ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.globalAlpha=0.5+0.5*inten;
    ctx.fillRect(x-lw/2,y,lw,h); ctx.globalAlpha=1;
  }
  ctx.restore();
  ctx.strokeStyle=T.frame; ctx.lineWidth=1; ctx.strokeRect(x0,y,w,h);
  if (P.labels) drawLineLabels(ctx,x0,y,w,h,false);
}

function drawAbsorption(ctx, x0, y, w, h) {
  // continuo arcobaleno solo nel visibile
  const xVa=lToX(Math.max(VIS_MIN,WMIN()),x0,w), xVb=lToX(Math.min(VIS_MAX,WMAX()),x0,w);
  for (let px=Math.floor(xVa); px<xVb; px++) {
    const l=xToL(px,x0,w);
    const [r,g,b]=nmToRgb(l);
    ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(px,y,1,h);
  }
  drawNonVisRegions(ctx,x0,y,w,h);
  // righe di assorbimento (scure)
  for (const [l,inten] of windowLines()) {
    const x=lToX(l,x0,w);
    const lw=lineWidthFor(inten);
    if (l>=VIS_MIN&&l<=VIS_MAX) ctx.fillStyle=`rgba(0,0,0,${0.55+0.45*inten})`;
    else { const [r,g,b]=colorForLine(l); ctx.fillStyle=`rgba(${r},${g},${b},${0.5+0.5*inten})`; }
    ctx.fillRect(x-lw/2,y,lw,h);
  }
  ctx.strokeStyle=T.frame; ctx.lineWidth=1; ctx.strokeRect(x0,y,w,h);
  if (P.labels) drawLineLabels(ctx,x0,y,w,h,true);
}

// etichette λ DI LATO alla riga, colore fisso (sta sullo sfondo della banda)
function drawLineLabels(ctx, x0, y, w, h, darkBand) {
  ctx.save();
  ctx.font='8px "Space Mono",monospace';
  // emissione: banda scura → testo chiaro. assorbimento: continuo chiaro → testo scuro.
  const colVis = darkBand ? 'rgba(12,16,26,0.92)' : 'rgba(225,238,252,0.9)';
  const shown=[];
  for (const [l,inten] of windowLines()) {
    if (inten<0.3) continue;
    const x=lToX(l,x0,w);
    if (shown.some(sx=>Math.abs(sx-x)<13)) continue;
    shown.push(x);
    // testo verticale appena a destra della riga, vicino al bordo superiore
    ctx.fillStyle = (l<VIS_MIN||l>VIS_MAX) ? 'rgba(210,210,225,0.85)' : colVis;
    ctx.save();
    ctx.translate(x+lineWidthFor(inten)/2+4, y+8);
    ctx.rotate(Math.PI/2);
    ctx.fillText(`${l.toFixed(0)}`, 0, 3);
    ctx.restore();
  }
  ctx.restore();
}

function drawRuler(ctx, x0, y, w) {
  ctx.strokeStyle=T.tick; ctx.fillStyle=T.tick; ctx.lineWidth=1;
  ctx.font='9px "Space Mono",monospace';
  ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x0+w,y); ctx.stroke();
  const step = P.fullRange?100:50;
  const start = Math.ceil(WMIN()/step)*step;
  for (let l=start; l<=WMAX(); l+=step) {
    const x=lToX(l,x0,w);
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+5); ctx.stroke();
    ctx.fillText(`${l}`, x-9, y+16);
  }
  ctx.fillText('nm', x0+w-16, y+16);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}

// Grafico 1: spettro a righe I(λ) con asse Y intensità
function drawLineSpectrum() {
  const cv=gCanvas[0]; if(!cv||!cv.width)return;
  const ctx=gCtx[0],W=cv.width,H=cv.height;
  const PAD={t:16,b:20,l:30,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);

  // asse Y: 0, 0.5, 1.0
  ctx.fillStyle=T.gText; ctx.font='8px "Space Mono",monospace';
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4;
  for (const iv of [0,0.5,1.0]) {
    const yy=PAD.t+gH-iv*gH;
    ctx.beginPath(); ctx.moveTo(PAD.l,yy); ctx.lineTo(PAD.l+gW,yy); ctx.stroke();
    ctx.fillText(iv.toFixed(1), 4, yy+3);
  }
  ctx.fillText('I', 4, PAD.t-4);

  for (const [l,inten] of windowLines()) {
    const x=PAD.l+(l-WMIN())/(WMAX()-WMIN())*gW;
    const [r,g,b]=colorForLine(l);
    ctx.strokeStyle=`rgb(${r},${g},${b})`; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(x,PAD.t+gH); ctx.lineTo(x,PAD.t+gH-inten*gH); ctx.stroke();
  }
  ctx.fillStyle=T.gText;
  ctx.fillText(`${WMIN()}`,PAD.l,PAD.t+gH+11);
  ctx.fillText(`${WMAX()} nm`,PAD.l+gW-34,PAD.t+gH+11);
}

// Grafico 2: energia delle transizioni E=hc/λ — righe orizzontali posizionate
// per energia, dipendenti dall'elemento selezionato.
function drawEnergyLevels() {
  const cv=gCanvas[1]; if(!cv||!cv.width)return;
  const ctx=gCtx[1],W=cv.width,H=cv.height;
  const PAD={t:16,b:16,l:34,r:34};
  const {gW,gH}=gBase(ctx,W,H,PAD);

  const lines=windowLines().map(([l,inten])=>({l,inten,E:1240/l}));
  if(!lines.length)return;
  let Emin=Math.min(...lines.map(o=>o.E)), Emax=Math.max(...lines.map(o=>o.E));
  const pad=Math.max(0.15,(Emax-Emin)*0.08); Emin-=pad; Emax+=pad;
  const yOf=E=>PAD.t + (Emax-E)/(Emax-Emin)*gH;

  // asse Y: tacche energia
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace';
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4;
  const eStep=(Emax-Emin)/3;
  for(let k=0;k<=3;k++){
    const E=Emin+k*eStep, y=yOf(E);
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+gW,y); ctx.stroke();
    ctx.fillText(E.toFixed(1), 3, y+3);
  }
  ctx.fillText('eV', 3, PAD.t-4);

  const yGround=PAD.t+gH;   // stato di arrivo (riferimento basso)

  // livello di arrivo
  ctx.strokeStyle=T.accent; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(PAD.l,yGround); ctx.lineTo(PAD.l+gW,yGround); ctx.stroke();

  // frecce: dal livello di partenza (energia E) giù verso l'arrivo
  const sorted=[...lines].sort((a,b)=>a.E-b.E);
  const n=sorted.length;
  let k=0, lastLabelX=-99;
  for(const o of sorted){
    const y=yOf(o.E);
    const x=PAD.l+gW*(0.10+0.8*(n>1?k/(n-1):0.5)); k++;
    const [r,g,b]=colorForLine(o.l);
    // livello di partenza (tacca orizzontale)
    ctx.strokeStyle=`rgb(${r},${g},${b})`; ctx.lineWidth=0.8+o.inten*1.5;
    ctx.beginPath(); ctx.moveTo(x-7,y); ctx.lineTo(x+7,y); ctx.stroke();
    // freccia verso il basso
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,yGround); ctx.stroke();
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    ctx.beginPath(); ctx.moveTo(x,yGround); ctx.lineTo(x-3,yGround-5); ctx.lineTo(x+3,yGround-5); ctx.closePath(); ctx.fill();
    // etichetta λ in cima, se non si sovrappone
    if(o.inten>=0.25 && Math.abs(x-lastLabelX)>16){
      lastLabelX=x;
      ctx.font='7px "Space Mono",monospace';
      ctx.fillText(`${o.l.toFixed(0)}`, x-8, y-3);
    }
  }
}

function drawGraphs(){ drawLineSpectrum(); drawEnergyLevels(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secE=Lab.Section('Elemento');
  cont.appendChild(secE.el);
  secE.add(Lab.RadioGroup({
    label:'Sorgente',
    options: EL_KEYS.map(k=>({value:k,label:`${k} · ${ELEMENTS[k].name}`})),
    value:P.el,
    onChange(v){ P.el=v; },
  }));

  const secV=Lab.Section('Visualizzazione');
  cont.appendChild(secV.el);
  secV.add(Lab.RadioGroup({
    label:'Bande',
    options:[
      {value:'both',label:'Emissione + Assorbimento'},
      {value:'emission',label:'Solo emissione'},
      {value:'absorption',label:'Solo assorbimento'},
    ],
    value: P.bothBands?'both':P.mode,
    onChange(v){ if(v==='both'){P.bothBands=true;} else {P.bothBands=false;P.mode=v;} },
  }));
  secV.add(Lab.Toggle({
    label:'Mostra UV / IR (non visibile)',
    value:P.fullRange,
    onChange(v){ P.fullRange=v; },
  }));
  secV.add(Lab.Slider({
    label:'Larghezza righe', min:0.5, max:6, step:0.1, value:P.broaden, unit:' px',
    onChange(v){ P.broaden=v; },
  }));
  secV.add(Lab.Toggle({
    label:'Etichette λ',
    value:P.labels,
    onChange(v){ P.labels=v; },
  }));
}

// ═══ Hover λ ══════════════════════════════════════════════════════════════════
function initHover(canvas) {
  canvas.addEventListener('mousemove', e=>{
    const r=canvas.getBoundingClientRect();
    const margin=46, x0=margin, w=r.width-margin*2;
    const x=e.clientX-r.left;
    hoverLambda = (x>=x0&&x<=x0+w) ? xToL(x,x0,w) : null;
  });
  canvas.addEventListener('mouseleave', ()=>{ hoverLambda=null; });
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs() {
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:205px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  const TITLES=['Spettro a righe I(λ)','Transizioni: livelli → arrivo'];
  for(let i=0;i<2;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div');
    title.textContent=TITLES[i];
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas');
    cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv);
    ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d');
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'el',    label:'Elemento'},
    {key:'lines', label:'Righe'},
    {key:'strong',label:'Riga principale'},
    {key:'hint',  label:''},
  ]);

  document.getElementById('btnMode').addEventListener('click',()=>{
    if (P.bothBands){ P.bothBands=false; P.mode='emission'; }
    else if (P.mode==='emission') P.mode='absorption';
    else P.bothBands=true;
    buildControls();
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.el='H'; P.mode='emission'; P.bothBands=true; P.broaden=2.0; P.labels=true; P.fullRange=false;
    hoverLambda=null; buildControls();
  });

  initHover(simCanvas);

  function resize(){
    const area=document.querySelector('.lab-canvas-area');
    if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea');
    const gaH=ga?ga.offsetHeight:0;
    simCanvas.width=Math.floor(ar.width);
    simCanvas.height=Math.max(120,Math.floor(ar.height-rb.height-gaH-4));
    for(const cv of gCanvas){ if(!cv)continue; cv.width=Math.floor(cv.parentElement.clientWidth); cv.height=Math.floor(cv.parentElement.clientHeight); }
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  function frame(){
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const lines=windowLines();
    const strong=lines.reduce((a,b)=>b[1]>a[1]?b:a,[0,0]);
    readout.set('el', `${P.el} · ${ELEMENTS[P.el].name}`);
    readout.set('lines', String(lines.length));
    readout.set('strong', strong[0]?`${strong[0].toFixed(1)} nm`:'—');
    readout.set('hint', P.bothBands?'emissione + assorbimento':(P.mode==='emission'?'emissione':'assorbimento'));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
