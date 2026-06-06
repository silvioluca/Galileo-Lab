'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  A1:1.0,  w1:1.2,  ph1:0,           // oscillatore 1 (ampiezza rel., ω rad/s, fase °)
  compare:false,
  A2:0.7,  w2:1.8,  ph2:90,          // oscillatore 2
  showV:true, showA:true,            // vettori velocità / accelerazione
  series:{x:true, v:false, a:false}, // curve mostrate nel grafico 1
  speed:1.0,
};
const AMAX=1.5;
const COL=['#ffb84d','#9b8cff'];

let tSim=0, running=true;
let oscs=[];   // [{A,w,ph,col, hist:[]}]
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    ring:  d?'rgba(150,175,205,0.4)':'rgba(60,95,130,0.45)',
    vcol:  d?'#4fd0ff':'#0a78b0',
    acol:  d?'#ff5d73':'#d61f4a',
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function theta(o){ return o.w*tSim + o.ph*Math.PI/180; }
function state(o){
  const th=theta(o);
  return { th, x:o.A*Math.cos(th), y:o.A*Math.sin(th),
           vx:-o.A*o.w*Math.sin(th), vSHM:-o.A*o.w*Math.sin(th),
           aSHM:-o.A*o.w*o.w*Math.cos(th) };
}
function reset(){
  tSim=0;
  const defs=P.compare?[0,1]:[0];
  oscs=defs.map(i=>({A:i?P.A2:P.A1, w:i?P.w2:P.w1, ph:i?P.ph2:P.ph1, col:COL[i], hist:[]}));
}
function step(dt){
  if(!running) return;
  tSim+=dt;
  for(const o of oscs){ const s=state(o);
    o.hist.push({t:tSim, x:s.x, v:s.vSHM, a:s.aSHM});
    if(o.hist.length>2400) o.hist.shift(); }
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function vec(ctx,x1,y1,x2,y2,col,lbl){
  if(Math.hypot(x2-x1,y2-y1)<3) return;
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-8*Math.cos(a-0.4),y2-8*Math.sin(a-0.4));
  ctx.lineTo(x2-8*Math.cos(a+0.4),y2-8*Math.sin(a+0.4));
  ctx.closePath(); ctx.fill();
  if(lbl){ ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(lbl,x2+ (x2>x1?8:-8),y2-6); }
}

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);

  const cxC=W*0.30, cyC=H*0.42;
  const Rref=Math.min(W*0.20,H*0.34);
  const sc=Rref/AMAX;                         // unità → px
  const yProj=cyC+Rref+46;                    // asse del moto armonico (orizzontale)

  // cerchio di riferimento + assi
  ctx.strokeStyle=T.ring; ctx.lineWidth=1;
  oscs.forEach(o=>{ ctx.beginPath(); ctx.arc(cxC,cyC,o.A*sc,0,Math.PI*2); ctx.stroke(); });
  ctx.setLineDash([3,4]); ctx.strokeStyle=T.ring; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(cxC-Rref-10,cyC); ctx.lineTo(cxC+Rref+10,cyC); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cxC,cyC-Rref-10); ctx.lineTo(cxC,cyC+Rref+10); ctx.stroke();
  ctx.setLineDash([]);

  // asse del moto armonico
  ctx.strokeStyle=T.ring; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cxC-Rref-10,yProj); ctx.lineTo(cxC+Rref+10,yProj); ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('moto armonico  x = A·cos(ωt+φ)', cxC, yProj+24);

  oscs.forEach((o,oi)=>{
    const s=state(o);
    const px=cxC+s.x*sc, py=cyC-s.y*sc;       // particella sul cerchio (y schermo invertita)
    // raggio (fasore)
    ctx.strokeStyle=o.col; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cxC,cyC); ctx.lineTo(px,py); ctx.stroke();
    // proiezione verticale sull'asse armonico
    ctx.strokeStyle='rgba(150,175,205,0.45)'; ctx.lineWidth=0.8; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px,yProj); ctx.stroke(); ctx.setLineDash([]);

    // vettori sulla particella (circolare)
    if(P.showV){ // velocità tangente: (-sinθ, cosθ) → schermo y invertita
      const k=18; vec(ctx,px,py, px - Math.sin(s.th)*o.w*k, py - Math.cos(s.th)*o.w*k, T.vcol, oi===0?'v':null);
    }
    if(P.showA){ // accelerazione centripeta: verso il centro
      const k=10; const aMag=o.w*o.w*o.A;
      vec(ctx,px,py, px+(cxC-px)/Math.max(1,Math.hypot(cxC-px,cyC-py))*aMag*k, py+(cyC-py)/Math.max(1,Math.hypot(cxC-px,cyC-py))*aMag*k, T.acol, oi===0?'a':null);
    }

    // particella
    ctx.fillStyle=o.col; ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1; ctx.stroke();

    // punto del moto armonico sull'asse + vettori v,a (orizzontali)
    const hx=px, hy=yProj;
    ctx.fillStyle=o.col; ctx.beginPath(); ctx.arc(hx,hy,6,0,Math.PI*2); ctx.fill();
    if(P.showV) vec(ctx,hx,hy, hx+s.vSHM*sc*0.5, hy, T.vcol, null);
    if(P.showA) vec(ctx,hx,hy-12, hx+s.aSHM*sc*0.5, hy-12, T.acol, null);
  });

  // intestazione
  ctx.textAlign='left';
  ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('La proiezione del moto circolare uniforme è un moto armonico', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  ctx.fillText('v = −Aω·sin(ωt+φ)     a = −Aω²·cos(ωt+φ) = −ω²·x', 14, 42);

  // legenda oscillatori (T, f, ω, fase)
  oscs.forEach((o,oi)=>{
    const ly=60+oi*16; const Tp=2*Math.PI/o.w;
    ctx.fillStyle=o.col; ctx.beginPath(); ctx.arc(20,ly-3,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.txt; ctx.font='10px "Space Mono",monospace';
    ctx.fillText(`A=${o.A.toFixed(2)}  ω=${o.w.toFixed(2)} rad/s  T=${Tp.toFixed(2)} s  φ=${o.ph}°`, 30, ly);
  });
}

function drawGrid(ctx,W,H){
  ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let gx=0;gx<=W;gx+=40){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
  for(let gy=0;gy<=H;gy+=40){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
function tWin(){ return Math.max(8, tSim+0.5); }

// 1: x(t), v(t), a(t) selezionabili (pulsanti), ogni serie normalizzata
function drawXt(){
  const cv=gCanvas[0]; if(!cv||!cv.width)return;
  const ctx=gCtx[0],W=cv.width,H=cv.height;
  const PAD={t:18,b:16,l:22,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const win=tWin(), zero=PAD.t+gH/2;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4; ctx.beginPath(); ctx.moveTo(PAD.l,zero); ctx.lineTo(PAD.l+gW,zero); ctx.stroke();

  const maxX=Math.max(1e-6,...oscs.map(o=>o.A));
  const maxV=Math.max(1e-6,...oscs.map(o=>o.A*o.w));
  const maxA=Math.max(1e-6,...oscs.map(o=>o.A*o.w*o.w));
  const SER=[['x',maxX,'#ffd24d'],['v',maxV,T.vcol],['a',maxA,T.acol]];

  for(const [key,mx,col] of SER){
    if(!P.series[key]) continue;
    oscs.forEach((o,oi)=>{
      if(!o.hist.length)return;
      ctx.strokeStyle=col; ctx.lineWidth=1.4; ctx.setLineDash(oi?[4,3]:[]);
      ctx.beginPath();
      o.hist.forEach((h,i)=>{ const x=PAD.l+h.t/win*gW, y=zero-h[key]/mx*(gH*0.44); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
      ctx.stroke(); ctx.setLineDash([]);
    });
  }
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillText('t',PAD.l+gW-8,PAD.t+gH+11);
}

// 2: spazio delle fasi v–x (ellissi)
function drawPhase(){
  const cv=gCanvas[1]; if(!cv||!cv.width)return;
  const ctx=gCtx[1],W=cv.width,H=cv.height;
  const PAD={t:14,b:14,l:14,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const cx=PAD.l+gW/2, cy=PAD.t+gH/2;
  const half=Math.min(gW,gH)*0.46;            // area quadrata → rapporto 1:1
  const maxA=Math.max(1e-6,...oscs.map(o=>o.A))*1.1;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4;
  ctx.beginPath(); ctx.moveTo(cx-half,cy); ctx.lineTo(cx+half,cy); ctx.moveTo(cx,cy-half); ctx.lineTo(cx,cy+half); ctx.stroke();
  // traccio (x, v/ω): x²+(v/ω)²=A² → vera circonferenza di raggio A
  for(const o of oscs){
    ctx.strokeStyle=o.col; ctx.lineWidth=1.2; ctx.beginPath();
    for(let i=0;i<=64;i++){ const a=i/64*Math.PI*2;
      const X=cx+o.A*Math.cos(a)/maxA*half, Y=cy+o.A*Math.sin(a)/maxA*half; i===0?ctx.moveTo(X,Y):ctx.lineTo(X,Y); }
    ctx.closePath(); ctx.stroke();
    const s=state(o); ctx.fillStyle=o.col;
    ctx.beginPath(); ctx.arc(cx+s.x/maxA*half, cy-(s.vSHM/o.w)/maxA*half,3,0,Math.PI*2); ctx.fill();
  }
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.fillText('v/ω',cx+4,PAD.t+9); ctx.fillText('x',cx+half-8,cy-3);
}

// 3: Lissajous x1–x2 (confronto) oppure a(t)
function drawThird(){
  const cv=gCanvas[2]; if(!cv||!cv.width)return;
  const ctx=gCtx[2],W=cv.width,H=cv.height;
  const PAD={t:14,b:14,l:14,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  if(oscs.length>1){
    const cx=PAD.l+gW/2, cy=PAD.t+gH/2;
    const half=Math.min(gW,gH)*0.46;          // area quadrata → 1:1
    const o1=oscs[0], o2=oscs[1];
    const Tcommon=2*Math.PI/Math.min(o1.w,o2.w)*8;   // abbastanza per chiudere la figura
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.1; ctx.beginPath();
    for(let i=0;i<=480;i++){ const tt=i/480*Tcommon;
      const X=cx+o1.A*Math.cos(o1.w*tt+o1.ph*Math.PI/180)/AMAX*half;
      const Y=cy-o2.A*Math.cos(o2.w*tt+o2.ph*Math.PI/180)/AMAX*half;
      i===0?ctx.moveTo(X,Y):ctx.lineTo(X,Y); }
    ctx.stroke();
    const s1=state(o1), s2=state(o2);
    ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(cx+s1.x/AMAX*half, cy-s2.x/AMAX*half,3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.fillText('Lissajous x₁–x₂',PAD.l+2,PAD.t+7);
  } else {
    // a(t)
    const win=tWin(), zero=PAD.t+gH/2;
    const mv=Math.max(...oscs.map(o=>o.A*o.w*o.w))*1.1||1;
    ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4; ctx.beginPath(); ctx.moveTo(PAD.l,zero); ctx.lineTo(PAD.l+gW,zero); ctx.stroke();
    for(const o of oscs){ if(!o.hist.length)continue;
      ctx.strokeStyle=T.acol; ctx.lineWidth=1.4; ctx.beginPath();
      o.hist.forEach((h,i)=>{ const x=PAD.l+h.t/win*gW, y=zero-h.a/mv*(gH*0.46); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }); ctx.stroke(); }
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.fillText('a(t)',PAD.l+2,PAD.t+7); ctx.fillText('t',PAD.l+gW-8,PAD.t+gH+11);
  }
}
function drawGraphs(){ drawXt(); drawPhase(); drawThird(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const s1=Lab.Section('Oscillatore 1');
  cont.appendChild(s1.el);
  s1.add(Lab.Slider({ label:'Ampiezza A', min:0.3, max:1.5, step:0.05, value:P.A1, unit:'', onChange(v){P.A1=v; reset();} }));
  s1.add(Lab.Slider({ label:'Pulsazione ω', min:0.3, max:3, step:0.1, value:P.w1, unit:' rad/s', onChange(v){P.w1=v; reset();} }));
  s1.add(Lab.Slider({ label:'Fase φ', min:0, max:360, step:15, value:P.ph1, unit:'°', onChange(v){P.ph1=v; reset();} }));

  const sc=Lab.Section('Confronto');
  cont.appendChild(sc.el);
  sc.add(Lab.Toggle({ label:'Aggiungi secondo oscillatore', value:P.compare, onChange(v){P.compare=v; buildControls(); reset();} }));
  if(P.compare){
    sc.add(Lab.Slider({ label:'Ampiezza A (2)', min:0.3, max:1.5, step:0.05, value:P.A2, unit:'', onChange(v){P.A2=v; reset();} }));
    sc.add(Lab.Slider({ label:'Pulsazione ω (2)', min:0.3, max:3, step:0.1, value:P.w2, unit:' rad/s', onChange(v){P.w2=v; reset();} }));
    sc.add(Lab.Slider({ label:'Fase φ (2)', min:0, max:360, step:15, value:P.ph2, unit:'°', onChange(v){P.ph2=v; reset();} }));
  }

  const sv=Lab.Section('Visualizzazione');
  cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label:'Vettore velocità', value:P.showV, onChange(v){P.showV=v;} }));
  sv.add(Lab.Toggle({ label:'Vettore accelerazione', value:P.showA, onChange(v){P.showA=v;} }));
  sv.add(Lab.Slider({ label:'Velocità simulazione', min:0.2, max:2.5, step:0.1, value:P.speed, unit:'×', onChange(v){P.speed=v;} }));
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  const TITLES=['Posizione x(t)','Spazio delle fasi (v,x)','Lissajous / a(t)'];
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div');
    title.textContent=TITLES[i];
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas');
    cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv);
    // pulsanti x/v/a sul primo grafico
    if(i===0){
      const bar=document.createElement('div');
      bar.style.cssText='position:absolute;top:2px;right:4px;z-index:2;display:flex;gap:3px;';
      const SER=[['x','#ffd24d'],['v','#4fd0ff'],['a','#ff5d73']];
      for(const [key,col] of SER){
        const b=document.createElement('button');
        b.textContent=key;
        const sty=act=>`font-family:"Space Mono",monospace;font-size:9px;width:16px;height:14px;line-height:12px;padding:0;border-radius:3px;cursor:pointer;border:1px solid ${col};background:${act?col:'transparent'};color:${act?'#06090f':col};`;
        b.style.cssText=sty(P.series[key]);
        b.addEventListener('click',()=>{ P.series[key]=!P.series[key]; b.style.cssText=sty(P.series[key]); });
        bar.appendChild(b);
      }
      panel.appendChild(bar);
    }
    ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d');
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();
  reset();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'t', label:'Tempo'},
    {key:'x', label:'x (armonico)'},
    {key:'T', label:'Periodo'},
    {key:'f', label:'Frequenza'},
  ]);

  const btn=document.getElementById('btnPlay');
  btn.addEventListener('click',()=>{ running=!running; btn.textContent=running?'⏸  PAUSA':'▶  PLAY'; });
  document.getElementById('btnReset').addEventListener('click',()=>{ reset(); });

  function resize(){
    const parent=simCanvas.parentElement; if(!parent)return;
    const ga=document.getElementById('graphArea'); const rb=document.getElementById('readout');
    const gaH=ga?ga.offsetHeight:0, rbH=rb?rb.offsetHeight:0;
    const w=parent.clientWidth, h=Math.max(140,(parent.clientHeight||0)-gaH-rbH);
    if(w>0){ simCanvas.style.width=w+'px'; simCanvas.style.height=h+'px'; simCanvas.width=w; simCanvas.height=h; }
    for(const cv of gCanvas){ if(!cv)continue; const p=cv.parentElement;
      const pw=p.clientWidth, ph=p.clientHeight;
      if(pw>0&&ph>0){ cv.style.width=pw+'px'; cv.style.height=ph+'px'; cv.width=pw; cv.height=ph; } }
    draw(simCanvas); drawGraphs();
  }
  resize();
  new ResizeObserver(resize).observe(simCanvas.parentElement);
  window.addEventListener('load', resize);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  let last=performance.now();
  function frame(now){
    let dt=(now-last)/1000; if(!Number.isFinite(dt)||dt<0) dt=0; dt=Math.min(dt,0.05);
    last=now;
    step(dt*P.speed);
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const o=oscs[0]; const s=state(o); const Tp=2*Math.PI/o.w;
    readout.set('t', tSim.toFixed(2)+' s');
    readout.set('x', s.x.toFixed(2));
    readout.set('T', Tp.toFixed(2)+' s');
    readout.set('f', (1/Tp).toFixed(3)+' Hz');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
