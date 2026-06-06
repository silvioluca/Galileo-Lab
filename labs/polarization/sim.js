'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  I0: 1.0,           // intensità sorgente (relativa)
  n: 2,              // numero di filtri (1..3)
  ang: [0, 30, 90],  // angoli assi di trasmissione (°)
  showPoynting: true,
  showE: true,
  speed: 1.0,
};
let tAnim=0, dragIdx=-1;
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
    filter:d?'rgba(120,150,190,0.85)':'rgba(60,95,130,0.9)',
    axis:  d?'#ffd24d':'#d08800',     // asse di trasmissione
    Efield:d?'#4fd0ff':'#0a78b0',     // campo E
    poynt: d?'#5dff9b':'#0a9a4a',     // vettore di Poynting
    beam:  [255,240,180],             // luce (RGB base)
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();

// ═══ Fisica (legge di Malus) ══════════════════════════════════════════════════
const rad=d=>d*Math.PI/180;
// intensità dopo ogni stadio: [I0, dopo F1, dopo F2, ...]
function stageIntensities(){
  const out=[P.I0];
  let I=P.I0, prevAxis=null;
  for(let i=0;i<P.n;i++){
    if(prevAxis===null){ I=I*0.5; }                       // 1° filtro su luce non polarizzata
    else { const d=rad(P.ang[i]-prevAxis); I=I*Math.cos(d)*Math.cos(d); }   // Malus
    prevAxis=P.ang[i];
    out.push(I);
  }
  return out;
}
function finalI(){ const s=stageIntensities(); return s[s.length-1]; }

// ═══ Rendering ════════════════════════════════════════════════════════════════
function vec(ctx,x1,y1,x2,y2,col,lw=2.4){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-8*Math.cos(a-0.4),y2-8*Math.sin(a-0.4));
  ctx.lineTo(x2-8*Math.cos(a+0.4),y2-8*Math.sin(a+0.4));
  ctx.closePath(); ctx.fill();
}

// geometria del banco ottico
let geom={};
function computeGeom(W,H){
  const cy=H*0.46;
  const Rf=Math.min(H*0.18, 52);
  const scW=2*Rf;                                  // schermo quadrato (lato = diametro fascio)
  const scX=W*0.94-scW;                            // bordo sinistro schermo
  const x0=W*0.08;                                 // sorgente
  const fEnd=scX-26;
  const span=fEnd-x0;
  const fx=[]; for(let i=0;i<P.n;i++) fx.push(x0 + span*(0.16 + 0.66*(P.n>1?i/(P.n-1):0.5)));
  geom={cy,x0,scX,scW,fx,Rf,W,H};
}

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  computeGeom(W,H);
  const {cy,x0,scX,scW,fx,Rf}=geom;
  const S=stageIntensities();
  const beamY=cy;

  // Fascio: forma a "capsula" entrante (cap convesso sul filtro) + tacca concava uscente.
  // Riempimento OPACO (luminosità modulata sul colore) così il cap resta pieno e non viene
  // scurito dal tratto ridotto sottostante; un glow sfocato dà l'effetto luce.
  const [r,g,b]=T.beam;
  function fill(br){ const k=Math.max(0.05,Math.min(1,br)); return `rgb(${Math.round(r*k)},${Math.round(g*k)},${Math.round(b*k)})`; }
  // glow proporzionale all'intensità: dove non passa luce (I≈0) niente alone
  function glow(br){ const a=Math.max(0,Math.min(1,br)); ctx.shadowColor=`rgba(${r},${g},${b},${0.9*a})`; ctx.shadowBlur=Rf*0.55*a; }
  function beamRect(xa,xb,Iv){ if(xb<=xa)return; const br=Iv/P.I0; glow(br); ctx.fillStyle=fill(br); ctx.fillRect(xa,beamY-Rf,xb-xa,2*Rf); }
  function beamCircle(cxF,Iv){ const br=Iv/P.I0; ctx.save(); glow(br); ctx.beginPath(); ctx.arc(cxF,beamY,Rf,0,Math.PI*2); ctx.clip();
    ctx.fillStyle=fill(br); ctx.fillRect(cxF-Rf,beamY-Rf,2*Rf,2*Rf); ctx.restore(); }

  ctx.save();
  // confine al centro del filtro: a sinistra entrante (angoli pieni), a destra uscente (angoli ridotti)
  const xs=[x0, ...fx, scX];
  for(let seg=0; seg<xs.length-1; seg++) beamRect(xs[seg], xs[seg+1], S[Math.min(seg,S.length-1)]);
  // il DISCO del filtro resta all'intensità ENTRANTE → bulge convesso nel tratto successivo (capsula)
  for(let k=0;k<P.n;k++) beamCircle(fx[k], S[k]);
  ctx.restore();
  // velo luminoso centrale additivo, per tratto, scalato sull'intensità (0 se non passa luce)
  ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.shadowBlur=0;
  for(let seg=0; seg<xs.length-1; seg++){
    const br=Math.max(0,Math.min(1,S[Math.min(seg,S.length-1)]/P.I0)); if(br<=0.01) continue;
    const core=ctx.createLinearGradient(0,beamY-Rf,0,beamY+Rf);
    core.addColorStop(0,'rgba(0,0,0,0)');
    core.addColorStop(0.5,`rgba(${r},${g},${b},${0.22*br})`);
    core.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=core; ctx.fillRect(xs[seg],beamY-Rf,xs[seg+1]-xs[seg],2*Rf);
  }
  ctx.restore();

  // sorgente (non polarizzata: raggi in tutte le direzioni)
  ctx.strokeStyle=T.sub; ctx.lineWidth=1.5;
  for(let k=0;k<8;k++){ const a=k/8*Math.PI; ctx.beginPath();
    ctx.moveTo(x0-9*Math.cos(a),beamY-9*Math.sin(a)); ctx.lineTo(x0+9*Math.cos(a),beamY+9*Math.sin(a)); ctx.stroke(); }
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('sorgente', x0, beamY-Rf-6); ctx.fillText('non pol.', x0, beamY-Rf+6);

  // filtri (dischi con asse di trasmissione orientabile)
  for(let i=0;i<P.n;i++) drawFilter(ctx, fx[i], beamY, Rf, P.ang[i], i);

  // ── schermo (pannello come nell'app interferenza): luminosità uniforme = I finale ──
  const If=finalI(), brf=If/P.I0;
  const [sr,sg,sb]=T.beam;
  const scH=2*Rf, scY=beamY-Rf;   // quadrato: lato = diametro del fascio
  // fondo scuro del pannello
  ctx.fillStyle=dk()?'#02040a':'#0a0c12'; ctx.fillRect(scX,scY,scW,scH);
  // illuminazione uniforme con leggera vignettatura
  const il=ctx.createRadialGradient(scX+scW/2,beamY,2, scX+scW/2,beamY,Math.max(scW,scH)*0.7);
  il.addColorStop(0,`rgba(${sr},${sg},${sb},${Math.min(1,brf)})`);
  il.addColorStop(0.7,`rgba(${sr},${sg},${sb},${0.8*brf})`);
  il.addColorStop(1,`rgba(${sr},${sg},${sb},${0.45*brf})`);
  ctx.fillStyle=il; ctx.fillRect(scX,scY,scW,scH);
  // cornice + etichetta
  ctx.strokeStyle=dk()?'rgba(0,212,255,0.45)':'rgba(0,130,200,0.45)'; ctx.lineWidth=1.5; ctx.strokeRect(scX,scY,scW,scH);
  ctx.fillStyle=dk()?'rgba(0,212,255,0.65)':'rgba(0,100,180,0.7)'; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('SCHERMO', scX+scW/2, scY-5);
  ctx.fillStyle=T.accent; ctx.font='bold 12px "Space Mono",monospace';
  ctx.fillText(`${(brf*100).toFixed(1)}%`, scX+scW/2, scY+scH+15);

  // vettore di Poynting (flusso di energia, lungo l'asse) dopo l'ultimo filtro
  if(P.showPoynting){
    const sx=fx[P.n-1]+Rf+8, len=20+brf*70;
    vec(ctx, sx, beamY+Rf+24, sx+len, beamY+Rf+24, T.poynt, 3);
    ctx.fillStyle=T.poynt; ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='left';
    ctx.fillText('S (Poynting) ∝ I', sx, beamY+Rf+18);
  }

  // intestazione
  ctx.textAlign='left';
  ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Legge di Malus: I = I₀·cos²(θ)   (1° filtro: I = I₀/2)', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('trascina un filtro per ruotarne l\'asse di trasmissione', 14, 40);
}

function drawFilter(ctx, x, y, R, angDeg, i){
  // disco (anello) del polaroid
  ctx.strokeStyle=T.filter; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle=dk()?'rgba(120,150,190,0.10)':'rgba(60,95,130,0.10)';
  ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.fill();
  // righe del reticolo polarizzatore (parallele all'asse)
  const a=rad(angDeg), ca=Math.cos(a), sa=Math.sin(a);
  ctx.strokeStyle=dk()?'rgba(150,175,210,0.25)':'rgba(60,95,130,0.25)'; ctx.lineWidth=1;
  for(let o=-R+4;o<=R-4;o+=5){
    // linee parallele all'asse (direzione (ca,-sa)), spostate in perpendicolare (sa,ca)
    const px=x+sa*o, py=y+ca*o;
    const hl=Math.sqrt(Math.max(0,R*R-o*o));
    ctx.beginPath(); ctx.moveTo(px-ca*hl,py+sa*hl); ctx.lineTo(px+ca*hl,py-sa*hl); ctx.stroke();
  }
  // asse di trasmissione (diametro evidenziato)
  ctx.strokeStyle=T.axis; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.moveTo(x-ca*R,y+sa*R); ctx.lineTo(x+ca*R,y-sa*R); ctx.stroke();
  // etichetta
  ctx.fillStyle=T.axis; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(`F${i+1}: ${angDeg.toFixed(0)}°`, x, y+R+16);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}

// 1: intensità per stadio (barre)
function drawStages(){
  const cv=gCanvas[0]; if(!cv||!cv.width)return;
  const ctx=gCtx[0],W=cv.width,H=cv.height;
  const PAD={t:16,b:18,l:22,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const S=stageIntensities();
  const labels=['I₀', ...Array.from({length:P.n},(_,i)=>`F${i+1}`)];
  const bw=gW/S.length*0.6;
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace';
  for(const yv of [0,0.5,1]){ const y=PAD.t+gH-yv*gH; ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4;
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+gW,y); ctx.stroke(); ctx.fillText(yv.toFixed(1),2,y+3); }
  S.forEach((Iv,i)=>{
    const x=PAD.l+gW*(i+0.5)/S.length-bw/2, h=(Iv/P.I0)*gH;
    ctx.fillStyle=i===0?T.sub:T.accent; ctx.fillRect(x,PAD.t+gH-h,bw,h);
    ctx.fillStyle=T.gText; ctx.textAlign='center'; ctx.fillText(labels[i],x+bw/2,PAD.t+gH+10);
  });
  ctx.textAlign='left';
}

// 2: legge di Malus — I finale variando l'ultimo filtro
function drawMalus(){
  const cv=gCanvas[1]; if(!cv||!cv.width)return;
  const ctx=gCtx[1],W=cv.width,H=cv.height;
  const PAD={t:16,b:18,l:22,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const li=P.n-1;
  const base=P.ang.slice();
  const Ifor=ang=>{ const save=P.ang[li]; P.ang[li]=ang; const v=finalI(); P.ang[li]=save; return v; };
  let mx=1e-6; for(let a=0;a<=180;a+=3) mx=Math.max(mx,Ifor(a));
  ctx.strokeStyle=T.accent; ctx.lineWidth=1.4; ctx.beginPath();
  for(let a=0;a<=180;a+=3){ const x=PAD.l+a/180*gW, y=PAD.t+gH-Ifor(a)/Math.max(mx,1e-6)*gH*0.92; a===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
  ctx.stroke();
  // punto corrente
  const ac=((P.ang[li]%180)+180)%180; const x=PAD.l+ac/180*gW, y=PAD.t+gH-Ifor(P.ang[li])/Math.max(mx,1e-6)*gH*0.92;
  ctx.fillStyle=T.axis; ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace';
  ctx.fillText('0°',PAD.l,PAD.t+gH+10); ctx.fillText('180°',PAD.l+gW-16,PAD.t+gH+10);
}

// 3: stato di polarizzazione (vista lungo il fascio) — assi dei filtri + ampiezza E
function drawPolState(){
  const cv=gCanvas[2]; if(!cv||!cv.width)return;
  const ctx=gCtx[2],W=cv.width,H=cv.height;
  gBase(ctx,W,H,{t:14,b:14,l:14,r:8});
  const cx=W/2, cy=H/2, R=Math.min(W,H)*0.40;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4;
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); ctx.stroke();
  const S=stageIntensities();
  for(let i=0;i<P.n;i++){
    const a=rad(P.ang[i]), amp=Math.sqrt(Math.max(0,S[i+1]/P.I0));
    const col=i===P.n-1?T.accent:'rgba(120,150,190,0.6)';
    ctx.strokeStyle=col; ctx.lineWidth=i===P.n-1?2:1.2;
    ctx.beginPath(); ctx.moveTo(cx-Math.cos(a)*R*amp, cy+Math.sin(a)*R*amp); ctx.lineTo(cx+Math.cos(a)*R*amp, cy-Math.sin(a)*R*amp); ctx.stroke();
  }
}

function drawGraphs(){ drawStages(); drawMalus(); drawPolState(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';
  const s=Lab.Section('Sorgente e Filtri');
  cont.appendChild(s.el);
  s.add(Lab.RadioGroup({
    label:'Numero di filtri',
    options:[{value:'1',label:'1'},{value:'2',label:'2'},{value:'3',label:'3'}],
    value:String(P.n), onChange(v){ P.n=Number(v); buildControls(); },
  }));
  for(let i=0;i<P.n;i++){
    s.add(Lab.Slider({ label:`Angolo filtro ${i+1}`, min:0, max:180, step:1, value:P.ang[i], unit:'°',
      onChange(v){ P.ang[i]=v; } }));
  }

  const v=Lab.Section('Visualizzazione');
  cont.appendChild(v.el);
  v.add(Lab.Toggle({ label:'Vettore di Poynting', value:P.showPoynting, onChange(x){P.showPoynting=x;} }));
  v.add(Lab.Slider({ label:'Velocità animazione', min:0.2, max:2.5, step:0.1, value:P.speed, unit:'×', onChange(x){P.speed=x;} }));
}

// ═══ Drag dei filtri (ruota l'asse) ═══════════════════════════════════════════
function initDrag(canvas){
  function pos(e){ const r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*canvas.width, y:(e.clientY-r.top)/r.height*canvas.height}; }
  canvas.addEventListener('mousedown',e=>{
    const p=pos(e); dragIdx=-1;
    for(let i=0;i<P.n;i++){ if(Math.hypot(p.x-geom.fx[i], p.y-geom.cy)<geom.Rf*1.2){ dragIdx=i; break; } }
  });
  window.addEventListener('mousemove',e=>{
    if(dragIdx<0)return; const p=pos(e);
    let a=Math.atan2(-(p.y-geom.cy), p.x-geom.fx[dragIdx])*180/Math.PI;
    a=((a%180)+180)%180; P.ang[dragIdx]=Math.round(a); buildControls();
  });
  window.addEventListener('mouseup',()=>{ dragIdx=-1; });
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  const TITLES=['Intensità per stadio','Legge di Malus I(θ)','Stato di polarizzazione'];
  for(let i=0;i<3;i++){
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
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'final', label:'Intensità finale'},
    {key:'pct',   label:'% trasmessa'},
    {key:'axes',  label:'Assi (°)'},
    {key:'hint',  label:''},
  ]);

  document.getElementById('btnCross').addEventListener('click',()=>{
    P.n=2; P.ang[0]=0; P.ang[1]=90; buildControls();   // polarizzatori incrociati → buio
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.I0=1; P.n=3; P.ang=[0,30,90]; P.showPoynting=true; P.speed=1; buildControls();
  });

  initDrag(simCanvas);

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
    last=now; tAnim+=dt*P.speed*2;
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const If=finalI();
    readout.set('final', If.toFixed(3)+' I₀');
    readout.set('pct', (If/P.I0*100).toFixed(1)+' %');
    readout.set('axes', P.ang.slice(0,P.n).map(a=>a.toFixed(0)).join(' / '));
    readout.set('hint', P.n+' filtr'+(P.n>1?'i':'o'));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
