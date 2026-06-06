'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  Tamb: 25,    // temperatura ambiente esterno (°C)  → T2 (sorgente calda)
  Tset: 4,     // temperatura desiderata in camera (°C) → T1 (sorgente fredda)
  W:    120,   // potenza elettrica del compressore (W)
  kLeak:2.0,   // dispersione termica della camera (W/°C)
  eta:  0.45,  // efficienza rispetto al limite di Carnot
  paused:false,
};

const TIME_SCALE = 8;       // accelerazione temporale della simulazione
const Cth = 6000;           // capacità termica della camera (J/°C)
const HYST = 0.5;           // isteresi del termostato (°C)
const COP_CAP = 7;          // tetto realistico al COP

let Tcam = 25;              // temperatura attuale della camera (°C)
let compOn = false;         // stato compressore (termostato)
let simT = 0;               // tempo simulato (s)
let flow = 0;               // fase animazione refrigerante
let pulse = 0;              // fase pulsazioni
let hist = [];             // {t, Tcam}
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout, last=0;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#dfe4ea',
    txt:   d?'rgba(225,238,250,0.96)':'rgba(20,40,70,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,90,125,0.9)',
    accent:d?'#00d4ff':'#0a78b0',
    edge:  d?'rgba(238,245,252,0.92)':'rgba(35,55,85,0.9)',
    grille:d?'rgba(150,160,175,0.5)':'rgba(120,130,145,0.65)',
    metalT:d?'#9aa6b6':'#aeb8c6',          // corpo compressore (chiaro)
    metalD:d?'#5d6b7e':'#7c889a',          // compressore (scuro)
    cord:  d?'rgba(225,232,240,0.85)':'rgba(35,45,60,0.85)',
    panel: d?'rgba(244,249,255,0.92)':'rgba(252,253,255,0.95)',
    cold:  [40,70,160],                     // T1 — blu (ramo freddo)
    coldL: [90,130,225],
    hot:   [190,20,40],                     // T2 — rosso (ramo caldo)
    hotL:  [230,70,90],
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();
const rgb=(a)=>`rgb(${a[0]},${a[1]},${a[2]})`;
const rgba=(a,al)=>`rgba(${a[0]},${a[1]},${a[2]},${al})`;

// ═══ Fisica (ciclo a compressione di vapore) ══════════════════════════════════
const K=273.15;
function copCarnot(){
  const Tc=Tcam+K, Th=P.Tamb+K;
  const dT=Math.max(1, Th-Tc);
  return Tc/dT;
}
function copReal(){ return Math.min(COP_CAP, P.eta*copCarnot()); }
function rates(){
  if(!compOn) return {Qc:0, Qh:0, W:0, cop:copReal()};
  const cop=copReal();
  const Qc=cop*P.W;
  const Qh=Qc+P.W;
  return {Qc, Qh, W:P.W, cop};
}
function step(dt){
  if(P.paused) return;
  const dts=dt*TIME_SCALE;
  if(Tcam >= P.Tset+HYST) compOn=true;
  else if(Tcam <= P.Tset-HYST) compOn=false;
  if(P.Tset>=P.Tamb-0.05){ compOn=false; }
  const Qleak = P.kLeak*(P.Tamb - Tcam);
  const r=rates();
  const dTdt = (Qleak - r.Qc)/Cth;
  Tcam += dTdt*dts;
  Tcam = Math.max(-40, Math.min(P.Tamb+2, Tcam));
  simT += dts;
  hist.push({t:simT, Tcam});
  while(hist.length && hist[0].t < simT-120) hist.shift();
}

// ═══ Proiezione assonometrica (cabinet 3D) ════════════════════════════════════
let V={};
function setupView(W,H){
  const Wb=1.0, Hb=1.62, Db=0.82;
  const th=0.52, depthK=0.66;
  const cx=depthK*Math.cos(th), cy=depthK*Math.sin(th);
  const spanX=Wb+Db*cx, spanY=Hb+Db*cy;
  const labelColW=W*0.22;
  const thermoW=W*0.11;                 // colonna riservata al termometro (destra)
  const availW=W-labelColW-thermoW, availH=H-H*0.11;
  let sc=Math.min(availW/spanX, availH/spanY)*0.97;
  const boxW=spanX*sc, boxH=spanY*sc;
  const ox=labelColW+(availW-boxW)/2;
  const oy=H*0.055+boxH;
  V={Wb,Hb,Db,sc,ox,oy,cx,cy,labelColW};
}
function prj(x,y,z){ return [V.ox+(x+z*V.cx)*V.sc, V.oy-(y+z*V.cy)*V.sc]; }

// ═══ Serpentine (liste di punti world) ════════════════════════════════════════
function hSerp(xL,xR,ys,z){            // serpentina orizzontale (evaporatore)
  const p=[];
  for(let i=0;i<ys.length;i++){
    const a=(i%2===0)?[xL,xR]:[xR,xL];
    p.push({x:a[0],y:ys[i],z}); p.push({x:a[1],y:ys[i],z});
  }
  return p;
}
function vSerp(yB,yT,xs,z){            // serpentina verticale (condensatore)
  const p=[];
  for(let i=0;i<xs.length;i++){
    const a=(i%2===0)?[yB,yT]:[yT,yB];
    p.push({x:xs[i],y:a[0],z}); p.push({x:xs[i],y:a[1],z});
  }
  return p;
}

// ═══ Coordinate dei componenti ════════════════════════════════════════════════
function anchors(){
  // evaporatore e condensatore sulla faccia FRONTALE (z=0); griglia poco dietro
  const zEv=0.0, zCo=0.0, zG=0.16, zc=0.10;
  return {
    zEv, zCo, zG, zc,
    // evaporatore (pannello + serpentina orizzontale, in alto al centro)
    evPanel:{x0:0.33,x1:0.85,y0:1.30,y1:1.535},
    evXL:0.39, evXR:0.80, evRows:[1.49,1.45,1.41,1.37],
    inlet:{x:0.39,y:1.49,z:zEv},
    // condensatore (serpentina verticale, centro-destra) + griglia di dissipazione
    coXs:[0.78,0.65,0.52], coYB:0.32, coYT:1.07,
    // centrata dietro la serpentina (offset prospettico compensato sul piano z=zG)
    grille:{x0:0.36,x1:0.76,y0:0.20,y1:1.09},
    // compressore (cilindro, basso-fronte)
    comp:{x:0.50,yB:0.02,yT:0.21,z:zc,r:0.105},
  };
}

// ═══ Costruzione del circuito (in ordine di flusso) ═══════════════════════════
function buildLoop(){
  const A=anchors();
  // RAMO FREDDO (blu): valvola → evaporatore → aspirazione → compressore
  let cold=[];
  cold.push(A.inlet);
  const ev=hSerp(A.evXL,A.evXR,A.evRows,A.zEv);
  cold=cold.concat(ev.slice(1));                 // evita doppione su inlet
  cold.push({x:0.30,y:1.32,z:0});                // uscita verso pipe frontale
  cold.push({x:0.30,y:0.32,z:0});                // discesa (freccia T1)
  cold.push({x:A.comp.x,y:A.comp.yT,z:A.comp.z});// in cima al compressore
  // RAMO CALDO (rosso): compressore → condensatore → linea liquido → valvola
  const cf=A.coXs[0];                            // colonna di ingresso del condensatore
  let hot=[];
  hot.push({x:0.60,y:0.09,z:0});                 // uscita laterale compressore
  hot.push({x:cf,y:0.09,z:A.zCo});               // mandata orizzontale (freccia T2)
  hot.push({x:cf,y:A.coYB,z:A.zCo});             // su fino al fondo condensatore
  const co=vSerp(A.coYB,A.coYT,A.coXs,A.zCo);
  hot=hot.concat(co.slice(1));
  hot.push({x:0.46,y:1.20,z:A.zCo});             // linea del liquido che risale
  hot.push({x:0.40,y:1.47,z:A.zEv});             // rientro verso la valvola
  return {cold,hot,A};
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function projPts(pts){ return pts.map(p=>prj(p.x,p.y,p.z)); }
// polilinea con angoli arrotondati (curve a U morbide nelle serpentine)
function strokePath(ctx,pts,col,lw,rad=10){
  const P2 = Array.isArray(pts[0]) ? pts : projPts(pts);
  ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(P2[0][0],P2[0][1]);
  for(let i=1;i<P2.length-1;i++){
    const prev=P2[i-1],cur=P2[i],nxt=P2[i+1];
    const d1=Math.hypot(cur[0]-prev[0],cur[1]-prev[1]);
    const d2=Math.hypot(nxt[0]-cur[0],nxt[1]-cur[1]);
    const r=Math.max(0,Math.min(rad,d1/2,d2/2));
    ctx.arcTo(cur[0],cur[1],nxt[0],nxt[1],r);
  }
  const L=P2.length-1; ctx.lineTo(P2[L][0],P2[L][1]);
  ctx.stroke();
}
function arrowHead(ctx,x1,y1,x2,y2,col,size){
  ctx.fillStyle=col; const a=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-size*Math.cos(a-0.45), y2-size*Math.sin(a-0.45));
  ctx.lineTo(x2-size*Math.cos(a+0.45), y2-size*Math.sin(a+0.45));
  ctx.closePath(); ctx.fill();
}

function clamp01(x){ return Math.max(0,Math.min(1,x)); }
// quanto è "freddo" l'interno: 0 alla temperatura ambiente, 1 alla temperatura desiderata
function coldFrac(){ const d=P.Tamb-P.Tset; return d>0.5?clamp01((P.Tamb-Tcam)/d):0; }
// quanto è "caldo" l'ambiente esterno (slider T2)
function ambRed(){ return clamp01((P.Tamb-5)/35); }

// sfondo: ambiente esterno rossastro tanto più T2 è alta
function drawAmbient(ctx,W,H){
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  const red=ambRed();
  const c=prj(0.5,V.Hb*0.5,V.Db*0.5);
  const rg=ctx.createRadialGradient(c[0],c[1],H*0.16, c[0],c[1],H*0.9);
  rg.addColorStop(0,'rgba(200,55,40,0)');
  rg.addColorStop(0.55,`rgba(195,50,38,${(0.03+0.10*red).toFixed(3)})`);
  rg.addColorStop(1,`rgba(170,28,22,${(0.05+0.34*red).toFixed(3)})`);
  ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
  // didascalia ambiente
  ctx.fillStyle=rgba([210,80,70],0.85+0.15*red); ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='right';
  ctx.fillText(`AMBIENTE ESTERNO · ${P.Tamb.toFixed(0)} °C`, W-14, H-12);
}

// interno della camera: vira al blu man mano che la temperatura scende
function drawInterior(ctx){
  const f=coldFrac();
  const A=prj(0,0,0),B=prj(V.Wb,0,0),C=prj(V.Wb,V.Hb,0),D=prj(0,V.Hb,0);
  // facce visibili del volume (fronte + un velo su lato/alto per dare profondità fredda)
  const E=prj(0,0,V.Db),F=prj(V.Wb,0,V.Db),G=prj(V.Wb,V.Hb,V.Db),Hh=prj(0,V.Hb,V.Db);
  ctx.save();
  // velo profondità (lato destro + soffitto) più tenue
  ctx.fillStyle=`rgba(80,140,235,${(0.04+0.16*f).toFixed(3)})`;
  ctx.beginPath(); ctx.moveTo(B[0],B[1]); ctx.lineTo(F[0],F[1]); ctx.lineTo(G[0],G[1]); ctx.lineTo(C[0],C[1]); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(D[0],D[1]); ctx.lineTo(C[0],C[1]); ctx.lineTo(G[0],G[1]); ctx.lineTo(Hh[0],Hh[1]); ctx.closePath(); ctx.fill();
  // faccia frontale con gradiente verticale (più freddo in basso)
  const g=ctx.createLinearGradient(0,D[1],0,A[1]);
  g.addColorStop(0,`rgba(125,175,255,${(0.05+0.16*f).toFixed(3)})`);
  g.addColorStop(1,`rgba(70,130,232,${(0.07+0.42*f).toFixed(3)})`);
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.lineTo(C[0],C[1]); ctx.lineTo(D[0],D[1]); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// termometro: mostra T interna spostarsi da T_ambiente (alto) a T_set (basso)
function drawThermometer(ctx){
  // a DESTRA del frigorifero (oltre lo spigolo destro-posteriore)
  const top=prj(V.Wb,V.Hb,V.Db), bot=prj(V.Wb,0,0);
  const boxRight=V.ox+(V.Wb+V.Db*V.cx)*V.sc;
  const w=13, bulbR=13;
  const tx=boxRight+24;
  const yT=top[1]+16, yB=bot[1]-26;
  const colCold=[70,130,232], colHot=[210,70,55];
  const lerpC=(t)=>[Math.round(colCold[0]+(colHot[0]-colCold[0])*t),Math.round(colCold[1]+(colHot[1]-colCold[1])*t),Math.round(colCold[2]+(colHot[2]-colCold[2])*t)];
  // tubo + bulbo (fondo scuro)
  ctx.fillStyle=dk()?'rgba(10,16,30,0.85)':'rgba(225,232,242,0.92)';
  ctx.beginPath(); ctx.roundRect(tx,yT,w,yB-yT,w/2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx+w/2,yB+bulbR-2,bulbR,0,Math.PI*2); ctx.fill();
  // scala gradiente di riferimento (rosso in alto → blu in basso)
  const gr=ctx.createLinearGradient(0,yT,0,yB);
  gr.addColorStop(0,rgba(colHot,0.30)); gr.addColorStop(1,rgba(colCold,0.30));
  ctx.fillStyle=gr; ctx.beginPath(); ctx.roundRect(tx,yT,w,yB-yT,w/2); ctx.fill();
  // livello attuale
  const frac=clamp01((Tcam-P.Tset)/Math.max(0.5,P.Tamb-P.Tset)); // 0=set, 1=amb
  const yLev=yB-frac*(yB-yT);
  const cur=lerpC(frac);
  ctx.fillStyle=rgb(cur);
  ctx.beginPath(); ctx.arc(tx+w/2,yB+bulbR-2,bulbR-2,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(tx+2,yLev,w-4,(yB-yLev)+2,(w-4)/2); ctx.fill();
  // tacche ambiente / set (a destra del tubo)
  ctx.strokeStyle=rgba(colHot,0.8); ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(tx+w,yT); ctx.lineTo(tx+w+4,yT); ctx.stroke();
  ctx.strokeStyle=rgba(colCold,0.8);
  ctx.beginPath(); ctx.moveTo(tx+w,yB); ctx.lineTo(tx+w+4,yB); ctx.stroke();
  // etichette amb (sopra) / set (sotto il bulbo), centrate sul tubo
  ctx.textAlign='center'; ctx.font='8px "Space Mono",monospace';
  ctx.fillStyle=rgba(colHot,0.95); ctx.fillText(`amb ${P.Tamb.toFixed(0)}°`, tx+w/2, yT-6);
  ctx.fillStyle=rgba(colCold,0.95); ctx.fillText(`set ${P.Tset.toFixed(0)}°`, tx+w/2, yB+bulbR*2+2);
  // valore corrente accanto al livello (a destra)
  ctx.textAlign='left'; ctx.font='bold 11px "Space Mono",monospace'; ctx.fillStyle=rgb(cur);
  ctx.fillText(`${Tcam.toFixed(1)}°`, tx+w+7, yLev+4);
  ctx.beginPath(); ctx.moveTo(tx+w,yLev); ctx.lineTo(tx+w+5,yLev); ctx.strokeStyle=rgb(cur); ctx.lineWidth=1.4; ctx.stroke();
}

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  T=pal();
  setupView(W,H);
  drawAmbient(ctx,W,H);
  const {cold,hot,A}=buildLoop();
  const {Wb,Hb,Db}=V;
  drawInterior(ctx);

  // ── griglia di dissipazione del condensatore (dietro) ──
  ctx.strokeStyle=T.grille; ctx.lineWidth=2;
  const gN=15;
  for(let i=0;i<=gN;i++){
    const y=A.grille.y0+(A.grille.y1-A.grille.y0)*i/gN;
    const p1=prj(A.grille.x0,y,A.zG), p2=prj(A.grille.x1,y,A.zG);
    ctx.beginPath(); ctx.moveTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.stroke();
  }

  // ── armadio wireframe 3D ──
  drawCabinet(ctx);

  // ── tubazioni (casing + colore) ──
  strokePath(ctx,cold,T.bg,10);  strokePath(ctx,hot,T.bg,10);   // alone di fondo
  strokePath(ctx,cold,rgb(T.cold),5);
  strokePath(ctx,hot,rgb(T.hot),5);

  // ── refrigerante che scorre ──
  drawRefrigerant(ctx,cold,hot);

  // ── compressore (cilindro) + cavo ──
  drawCompressor(ctx,A);

  // ── valvola di espansione (blocco blu scuro) ──
  const inl=prj(A.inlet.x,A.inlet.y,A.zEv);
  ctx.fillStyle=rgb(T.cold);
  ctx.beginPath(); ctx.roundRect(inl[0]-4,inl[1]-8,20,16,3); ctx.fill();
  ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillText('valvola', inl[0]+20, inl[1]+3);

  // ── frecce T1 / T2 + etichette ──
  drawFlowArrows(ctx,A);

  // ── etichette laterali con leader ──
  drawLabels(ctx,A,W,H);

  // ── termometro: T interna tra ambiente e desiderata ──
  drawThermometer(ctx);

  // ── intestazione ──
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 13px "Space Mono",monospace';
  ctx.fillText('Ciclo a compressione di vapore   ·   Q_caldo = Q_freddo + W', 14, 22);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  const r=rates();
  ctx.fillText(`COP = ${r.cop.toFixed(2)}  (Carnot ${copCarnot().toFixed(2)})   ·   compressore ${compOn?'● ON':'○ OFF'}`, 14, 38);
}

function drawCabinet(ctx){
  const {Wb,Hb,Db}=V;
  // 8 vertici
  const A=prj(0,0,0),  B=prj(Wb,0,0),  C=prj(Wb,Hb,0),  D=prj(0,Hb,0);
  const E=prj(0,0,Db), F=prj(Wb,0,Db), G=prj(Wb,Hb,Db), Hh=prj(0,Hb,Db);
  ctx.strokeStyle=T.edge; ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.lineJoin='round';
  const edges=[[A,B],[B,C],[C,D],[D,A], [E,F],[F,G],[G,Hh],[Hh,E], [A,E],[B,F],[C,G],[D,Hh]];
  ctx.beginPath();
  for(const e of edges){ ctx.moveTo(e[0][0],e[0][1]); ctx.lineTo(e[1][0],e[1][1]); }
  ctx.stroke();
}

function drawEvPanel(ctx,A){
  const p=A.evPanel;
  const c0=prj(p.x0,p.y0,A.zEv), c1=prj(p.x1,p.y0,A.zEv), c2=prj(p.x1,p.y1,A.zEv), c3=prj(p.x0,p.y1,A.zEv);
  ctx.fillStyle=T.panel;
  ctx.beginPath(); ctx.moveTo(c0[0],c0[1]); ctx.lineTo(c1[0],c1[1]); ctx.lineTo(c2[0],c2[1]); ctx.lineTo(c3[0],c3[1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(150,160,175,0.5)'; ctx.lineWidth=1.2; ctx.stroke();
}

function drawRefrigerant(ctx,cold,hot){
  const all=cold.concat(hot);                 // loop chiuso
  const pp=all.map(p=>prj(p.x,p.y,p.z));
  const segs=[];
  for(let i=0;i<pp.length;i++){
    const a=pp[i], b=pp[(i+1)%pp.length];
    segs.push({x1:a[0],y1:a[1],x2:b[0],y2:b[1], cold:i<cold.length-1});
  }
  // colore: indici nel ramo freddo = blu chiaro, altrimenti rosso chiaro
  const speed = compOn ? (0.7 + P.W/300*1.6) : 0;
  let total=0; const len=segs.map(s=>{const l=Math.hypot(s.x2-s.x1,s.y2-s.y1); total+=l; return l;});
  if(total<=0) return;
  flow=(flow+speed)%total; if(flow<0) flow+=total;
  const N=Math.round(total/20);
  for(let k=0;k<N;k++){
    let s=(flow+k*total/N)%total;
    for(let i=0;i<segs.length;i++){
      if(s<=len[i]){ const f=len[i]>0?s/len[i]:0; const sg=segs[i];
        const x=sg.x1+(sg.x2-sg.x1)*f, y=sg.y1+(sg.y2-sg.y1)*f;
        const col=sg.cold?T.coldL:T.hotL;
        ctx.fillStyle=rgb(col); ctx.shadowColor=rgb(col); ctx.shadowBlur=compOn?6:0;
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
        break; }
      s-=len[i];
    }
  }
  ctx.shadowBlur=0;
}

function drawCompressor(ctx,A){
  const c=A.comp;
  const top=prj(c.x,c.yT,c.z), bot=prj(c.x,c.yB,c.z);
  const rx=c.r*V.sc, ry=rx*0.42;
  if(compOn){ ctx.shadowColor='rgba(255,200,80,0.55)'; ctx.shadowBlur=14; }
  // corpo
  const grd=ctx.createLinearGradient(top[0]-rx,0,top[0]+rx,0);
  grd.addColorStop(0,T.metalD); grd.addColorStop(0.5,T.metalT); grd.addColorStop(1,T.metalD);
  ctx.fillStyle=grd;
  ctx.beginPath();
  ctx.moveTo(top[0]-rx,top[1]); ctx.lineTo(bot[0]-rx,bot[1]);
  ctx.ellipse(bot[0],bot[1],rx,ry,0,Math.PI,0,true);
  ctx.lineTo(top[0]+rx,top[1]);
  ctx.ellipse(top[0],top[1],rx,ry,0,0,Math.PI*2);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur=0;
  // coperchio
  ctx.fillStyle=T.metalT; ctx.beginPath(); ctx.ellipse(top[0],top[1],rx,ry,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(60,75,95,0.7)'; ctx.lineWidth=1.4; ctx.stroke();
  // cavo + spina
  ctx.strokeStyle=T.cord; ctx.lineWidth=2.6; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(bot[0]+rx*0.4,bot[1]);
  ctx.bezierCurveTo(bot[0]+rx*1.6,bot[1]+38, bot[0]-rx*1.4,bot[1]+30, bot[0]-rx*2.6,bot[1]+52);
  ctx.stroke();
  const px=bot[0]-rx*2.6, py=bot[1]+52;
  ctx.fillStyle=T.cord; ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=T.cord; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(px-2,py-6); ctx.lineTo(px-2,py-11); ctx.moveTo(px+2,py-6); ctx.lineTo(px+2,py-11); ctx.stroke();
  // rotore
  if(compOn){
    const ang=pulse*6;
    ctx.strokeStyle='#ffd24d'; ctx.lineWidth=2.4;
    for(let i=0;i<3;i++){ const a=ang+i*2*Math.PI/3;
      ctx.beginPath(); ctx.moveTo(top[0],top[1]); ctx.lineTo(top[0]+Math.cos(a)*rx*0.55, top[1]+Math.sin(a)*ry*0.55); ctx.stroke(); }
  }
}

function drawFlowArrows(ctx,A){
  // freccia T1 (blu, discesa nel ramo freddo)
  const a1=prj(0.30,1.05,0), a2=prj(0.30,0.58,0);
  ctx.strokeStyle=rgb(T.coldL); ctx.lineWidth=4.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(a1[0],a1[1]); ctx.lineTo(a2[0],a2[1]); ctx.stroke();
  arrowHead(ctx,a1[0],a1[1],a2[0],a2[1],rgb(T.coldL),13);
  ctx.textAlign='right';
  ctx.fillStyle=rgb(T.cold); ctx.font='bold 22px "Space Mono",monospace';
  ctx.fillText('T1', a1[0]-14, (a1[1]+a2[1])/2-26);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`${P.Tset.toFixed(0)} °C`, a1[0]-14, (a1[1]+a2[1])/2-10);

  // freccia T2 (rosso, mandata orizzontale al fondo)
  const cf=A.coXs[0];
  const b1=prj(0.62,0.09,A.zCo), b2=prj(cf-0.04,0.09,A.zCo);
  arrowHead(ctx,b1[0],b1[1],b2[0],b2[1],rgb(T.hotL),13);
  const tlab=prj(A.coXs[0]+0.06,0.64,A.zCo);
  ctx.textAlign='left';
  ctx.fillStyle=rgb(T.hot); ctx.font='bold 22px "Space Mono",monospace';
  ctx.fillText('T2', tlab[0]+6, tlab[1]);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`${P.Tamb.toFixed(0)} °C`, tlab[0]+6, tlab[1]+15);
}

function drawLabels(ctx,A,W,H){
  const items=[
    {t:'EVAPORATORE', sub:'serpentina fredda', anc:prj(A.evXL,1.45,A.zEv), col:T.coldL},
    {t:'CONDENSATORE',sub:'serpentina calda',  anc:prj(A.coXs[2],0.66,A.zCo), col:T.hotL},
    {t:'COMPRESSORE', sub:`${P.W} W`,           anc:prj(A.comp.x-A.comp.r,0.12,A.comp.z), col:T.metalT},
  ];
  const lx=16;
  for(const it of items){
    const y=it.anc[1];
    // testo principale (maiuscoletto Space Mono, colore del componente)
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle = (typeof it.col==='string')?it.col:rgb(it.col);
    ctx.font='bold 13px "Space Mono",monospace';
    if(ctx.letterSpacing!==undefined) ctx.letterSpacing='1.5px';
    ctx.fillText(it.t, lx, y-5);
    const tw=ctx.measureText(it.t).width;
    if(ctx.letterSpacing!==undefined) ctx.letterSpacing='0px';
    // sottotitolo
    ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace';
    ctx.fillText(it.sub, lx, y+9);
    // leader: tratto orizzontale + pallino al componente
    const col=(typeof it.col==='string')?it.col:rgba(it.col,0.7);
    ctx.strokeStyle=col; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.moveTo(lx+Math.max(tw, 86)+12, y); ctx.lineTo(it.anc[0], it.anc[1]); ctx.stroke();
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(it.anc[0],it.anc[1],3,0,Math.PI*2); ctx.fill();
  }
  ctx.textBaseline='alphabetic';
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}

function drawTemp(){
  const cv=gCanvas[0]; if(!cv||!cv.width)return;
  const ctx=gCtx[0],W=cv.width,H=cv.height;
  const PAD={t:14,b:16,l:26,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const win=120, t1=Math.max(simT,win*0.25), t0=t1-win;
  const Tmax=P.Tamb+3, Tmin=Math.min(P.Tset-3,-5);
  const yOf=v=>PAD.t+gH-(v-Tmin)/(Tmax-Tmin)*gH;
  ctx.setLineDash([3,3]); ctx.lineWidth=0.8;
  ctx.strokeStyle='rgba(230,70,90,0.55)'; ctx.beginPath(); ctx.moveTo(PAD.l,yOf(P.Tamb)); ctx.lineTo(PAD.l+gW,yOf(P.Tamb)); ctx.stroke();
  ctx.strokeStyle='rgba(90,140,255,0.6)'; ctx.beginPath(); ctx.moveTo(PAD.l,yOf(P.Tset)); ctx.lineTo(PAD.l+gW,yOf(P.Tset)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle=T.accent; ctx.lineWidth=1.5; ctx.beginPath(); let first=true;
  for(const h of hist){ if(h.t<t0)continue; const x=PAD.l+(h.t-t0)/win*gW, y=yOf(h.Tcam); first?(ctx.moveTo(x,y),first=false):ctx.lineTo(x,y); }
  ctx.stroke();
  ctx.fillStyle='rgba(230,90,110,0.85)'; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('T2 amb',PAD.l+2,yOf(P.Tamb)-2);
  ctx.fillStyle='rgba(110,150,255,0.9)'; ctx.fillText('T1 set',PAD.l+2,yOf(P.Tset)-2);
  ctx.fillStyle=T.gText; ctx.fillText('°C',PAD.l-22,PAD.t+8);
}

function drawEnergy(){
  const cv=gCanvas[1]; if(!cv||!cv.width)return;
  const ctx=gCtx[1],W=cv.width,H=cv.height;
  const PAD={t:18,b:22,l:10,r:10};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const r=rates();
  const max=Math.max(1,r.Qh,P.W);
  const bars=[{v:r.Qc,c:T.coldL,l:'Q_fre'},{v:r.W,c:[255,210,80],l:'W'},{v:r.Qh,c:T.hotL,l:'Q_cal'}];
  const bw=gW/3*0.5;
  bars.forEach((b,i)=>{
    const cx=PAD.l+gW*(i+0.5)/3, bh=b.v/max*gH;
    ctx.fillStyle=rgba(b.c,0.85); ctx.fillRect(cx-bw/2,PAD.t+gH-bh,bw,bh);
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(b.l,cx,PAD.t+gH+10);
    ctx.fillStyle=rgb(b.c); ctx.font='8px "Space Mono",monospace'; ctx.fillText(b.v.toFixed(0)+'W',cx,PAD.t+gH-bh-3);
  });
}

// 3: diagramma p–V del ciclo
function logpT(t){ return -2400/(t+K); }
function fracP(t){ const a=logpT(-35),b=logpT(55); return Math.max(0.08,Math.min(0.95,(logpT(t)-a)/(b-a))); }
function drawPV(){
  const cv=gCanvas[2]; if(!cv||!cv.width)return;
  const ctx=gCtx[2],W=cv.width,H=cv.height;
  const PAD={t:14,b:18,l:22,r:10};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const yLow=PAD.t+gH-fracP(Tcam)*gH;
  const yHigh=PAD.t+gH-fracP(P.Tamb)*gH;
  const xOf=v=>PAD.l+v*gW;
  // volumi relativi dei 4 stati
  const V1=0.93,V2=0.46,V3=0.12,V4=0.58;
  const p1=[xOf(V1),yLow], p2=[xOf(V2),yHigh], p3=[xOf(V3),yHigh], p4=[xOf(V4),yLow];
  // linee p_alta / p_bassa
  ctx.setLineDash([2,3]); ctx.lineWidth=0.7;
  ctx.strokeStyle='rgba(230,80,100,0.4)'; ctx.beginPath(); ctx.moveTo(PAD.l,yHigh); ctx.lineTo(PAD.l+gW,yHigh); ctx.stroke();
  ctx.strokeStyle='rgba(100,150,255,0.4)'; ctx.beginPath(); ctx.moveTo(PAD.l,yLow); ctx.lineTo(PAD.l+gW,yLow); ctx.stroke();
  ctx.setLineDash([]);
  // ciclo
  ctx.lineWidth=1.7; ctx.strokeStyle=T.accent; ctx.beginPath();
  ctx.moveTo(p4[0],p4[1]); ctx.lineTo(p1[0],p1[1]);                                  // 4→1 evaporazione (p bassa)
  ctx.quadraticCurveTo(p1[0]-(p1[0]-p2[0])*0.15, (p1[1]+p2[1])/2, p2[0],p2[1]);      // 1→2 compressione
  ctx.lineTo(p3[0],p3[1]);                                                           // 2→3 condensazione (p alta)
  ctx.quadraticCurveTo(p3[0], (p3[1]+p4[1])/2, p4[0],p4[1]);                          // 3→4 laminazione
  ctx.stroke();
  // frecce di verso
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  function ah(a,b){ const m=mid(a,b); const an=Math.atan2(b[1]-a[1],b[0]-a[0]); ctx.fillStyle=T.accent;
    ctx.beginPath(); ctx.moveTo(m[0],m[1]); ctx.lineTo(m[0]-6*Math.cos(an-0.5),m[1]-6*Math.sin(an-0.5)); ctx.lineTo(m[0]-6*Math.cos(an+0.5),m[1]-6*Math.sin(an+0.5)); ctx.closePath(); ctx.fill(); }
  ah(p4,p1); ah(p2,p3);
  // punti + numeri
  const pts=[p1,p2,p3,p4];
  pts.forEach((p,i)=>{ ctx.fillStyle=(i===1||i===2)?rgb(T.hotL):rgb(T.coldL); ctx.beginPath(); ctx.arc(p[0],p[1],3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(String(i+1), p[0]+(i===0?8:i===3?8:-8), p[1]+(i<2?-6:12)); });
  ctx.fillStyle='rgba(230,80,100,0.7)'; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('p_alta',PAD.l+2,yHigh-2);
  ctx.fillStyle='rgba(100,150,255,0.75)'; ctx.fillText('p_bassa',PAD.l+2,yLow+8);
  ctx.fillStyle=T.gText; ctx.textAlign='right'; ctx.fillText('V',PAD.l+gW-2,PAD.t+gH-3);
  ctx.textAlign='left'; ctx.fillText('p',PAD.l+2,PAD.t+7);
}

function drawGraphs(){ drawTemp(); drawEnergy(); drawPV(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';
  const secT=Lab.Section('Temperature');
  cont.appendChild(secT.el);
  secT.add(Lab.Slider({ label:'Ambiente esterno (T2)', min:5, max:40, step:1, value:P.Tamb, unit:' °C', onChange(v){P.Tamb=v;} }));
  secT.add(Lab.Slider({ label:'Set camera (T1)', min:-20, max:15, step:1, value:P.Tset, unit:' °C', onChange(v){P.Tset=v;} }));
  const secM=Lab.Section('Macchina');
  cont.appendChild(secM.el);
  secM.add(Lab.Slider({ label:'Potenza compressore', min:40, max:300, step:10, value:P.W, unit:' W', onChange(v){P.W=v;} }));
  secM.add(Lab.Slider({ label:'Efficienza (vs Carnot)', min:0.2, max:0.7, step:0.05, value:P.eta, unit:'', onChange(v){P.eta=v;} }));
  secM.add(Lab.Slider({ label:'Dispersione camera', min:0.5, max:6, step:0.5, value:P.kLeak, unit:' W/°C', onChange(v){P.kLeak=v;} }));
}

function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  const TITLES=['Temperatura camera T(t)','Bilancio energetico','Ciclo p–V'];
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
    {key:'tcam', label:'T camera'},
    {key:'cop',  label:'COP'},
    {key:'qc',   label:'Q freddo'},
    {key:'w',    label:'W elettrico'},
    {key:'qh',   label:'Q caldo'},
    {key:'st',   label:'Compressore'},
  ]);
  const btnPlay=document.getElementById('btnPlay');
  btnPlay.addEventListener('click',()=>{ P.paused=!P.paused; btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.Tamb=25; P.Tset=4; P.W=120; P.eta=0.45; P.kLeak=2.0; P.paused=false;
    Tcam=P.Tamb; compOn=false; simT=0; hist=[]; btnPlay.textContent='⏸  PAUSA'; buildControls();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(200,Math.floor(ar.height-rb.height-gaH-4));
    simCanvas.style.width=Math.floor(ar.width)+'px'; simCanvas.style.height=h+'px';
    simCanvas.width=Math.floor(ar.width); simCanvas.height=h;
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
    pulse+=dt;
    step(dt);
    draw(simCanvas);
    drawGraphs();
    const r=rates();
    readout.set('tcam', Tcam.toFixed(1)+' °C');
    readout.set('cop', r.cop.toFixed(2));
    readout.set('qc', r.Qc.toFixed(0)+' W');
    readout.set('w', (compOn?P.W:0).toFixed(0)+' W');
    readout.set('qh', r.Qh.toFixed(0)+' W');
    readout.set('st', compOn?'● ON':'○ OFF');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
