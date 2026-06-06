'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  cycle: 'otto',     // otto | diesel | brayton | stirling | ericsson | carnot
  ratio: 8,          // rapporto compressione/pressione/volume
  heat:  2.0,        // fattore combustione / cutoff / volume
  Th:    900,        // K (cicli isotermi)
  Tc:    300,        // K
  gas:   'dia',      // mono | dia
  speed: 0.5,
};
let u=0;             // posizione nel ciclo [0,4)
let paused=false;
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout, t=0;

const CYCLE_NAMES={otto:'Otto',diesel:'Diesel',brayton:'Brayton',stirling:'Stirling',ericsson:'Ericsson',carnot:'Carnot'};
// colori ed etichette per tipo di trasformazione
const KIND={
  adiabatic: {c:'#ff6b4d', lbl:'adiabatica'},
  isochoric: {c:'#4f9dff', lbl:'isocòra'},
  isobaric:  {c:'#37d67a', lbl:'isòbara'},
  isothermal:{c:'#c77dff', lbl:'isoterma'},
};

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    metal: d?'#5a6675':'#8a96a5',
    metalD:d?'#39424e':'#69757f',
    cyl:   d?'rgba(40,50,64,0.6)':'rgba(180,195,210,0.6)',
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    curve: d?'#ffd24d':'#d08800',
    dot:   d?'#ff5d73':'#d61f4a',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();
function gamma(){ return P.gas==='mono'?5/3:7/5; }

// ═══ Costruzione del ciclo ════════════════════════════════════════════════════
// ritorna { pts:[{V,P}], kinds:[], names:[], eff }
function buildCycle(){
  const g=gamma(), r=P.ratio, k=P.heat, Th=P.Th, Tc=P.Tc;
  let pts,kinds,names,eff;
  if(P.cycle==='otto'){
    pts=[{V:1,P:1},{V:1/r,P:Math.pow(r,g)},{V:1/r,P:Math.pow(r,g)*k},{V:1,P:k}];
    kinds=['adiabatic','isochoric','adiabatic','isochoric'];
    names=['Compressione adiabatica','Riscaldamento isocoro','Espansione adiabatica','Raffreddamento isocoro'];
    eff=1-1/Math.pow(r,g-1);
  } else if(P.cycle==='diesel'){
    const al=Math.max(1.05,k);
    pts=[{V:1,P:1},{V:1/r,P:Math.pow(r,g)},{V:al/r,P:Math.pow(r,g)},{V:1,P:Math.pow(al,g)}];
    kinds=['adiabatic','isobaric','adiabatic','isochoric'];
    names=['Compressione adiabatica','Combustione isobara','Espansione adiabatica','Raffreddamento isocoro'];
    eff=1-(1/Math.pow(r,g-1))*((Math.pow(al,g)-1)/(g*(al-1)));
  } else if(P.cycle==='brayton'){
    const rp=r, b=k;
    const V2=Math.pow(1/rp,1/g);
    pts=[{V:1,P:1},{V:V2,P:rp},{V:V2*b,P:rp},{V:V2*b*Math.pow(rp,1/g),P:1}];
    kinds=['adiabatic','isobaric','adiabatic','isobaric'];
    names=['Compressione adiabatica','Riscaldamento isobaro','Espansione adiabatica','Raffreddamento isobaro'];
    eff=1-Math.pow(rp,-(g-1)/g);
  } else if(P.cycle==='stirling'){
    pts=[{V:1/r,P:Th*r},{V:1,P:Th},{V:1,P:Tc},{V:1/r,P:Tc*r}];
    kinds=['isothermal','isochoric','isothermal','isochoric'];
    names=['Espansione isoterma (Th)','Raffreddamento isocoro','Compressione isoterma (Tc)','Riscaldamento isocoro'];
    eff=1-Tc/Th;
  } else if(P.cycle==='ericsson'){
    const Ph=r, Pl=1;
    pts=[{V:Th/Ph,P:Ph},{V:Th/Pl,P:Pl},{V:Tc/Pl,P:Pl},{V:Tc/Ph,P:Ph}];
    kinds=['isothermal','isobaric','isothermal','isobaric'];
    names=['Espansione isoterma (Th)','Raffreddamento isobaro','Compressione isoterma (Tc)','Riscaldamento isobaro'];
    eff=1-Tc/Th;
  } else { // carnot
    const e=Math.pow(Th/Tc,1/(g-1));
    pts=[{V:1,P:Th},{V:r,P:Th/r},{V:r*e,P:Tc/(r*e)},{V:e,P:Tc/e}];
    kinds=['isothermal','adiabatic','isothermal','adiabatic'];
    names=['Espansione isoterma (Th)','Espansione adiabatica','Compressione isoterma (Tc)','Compressione adiabatica'];
    eff=1-Tc/Th;
  }
  return {pts,kinds,names,eff};
}

// stato lungo il segmento seg a frazione f
function segState(cy, seg, f){
  const a=cy.pts[seg], b=cy.pts[(seg+1)%4], kind=cy.kinds[seg], g=gamma();
  let V,Pp;
  if(Math.abs(b.V-a.V)<1e-9){ V=a.V; Pp=a.P+(b.P-a.P)*f; }     // isocoro
  else {
    V=a.V+(b.V-a.V)*f;
    if(kind==='isobaric') Pp=a.P;
    else if(kind==='isothermal') Pp=a.P*a.V/V;
    else if(kind==='adiabatic') Pp=a.P*Math.pow(a.V/V,g);
    else Pp=a.P+(b.P-a.P)*f;
  }
  return {V,P:Pp,T:Pp*V};
}
// campiona l'intero ciclo
function cycleSamples(cy,nPer=26){
  const out=[];
  for(let s=0;s<4;s++) for(let i=0;i<nPer;i++) out.push(segState(cy,s,i/nPer));
  out.push(segState(cy,0,0));
  return out;
}
// lavoro netto = ∮P dV (area, shoelace)
function netWork(samples){
  let A=0;
  for(let i=0;i<samples.length-1;i++){ A+=(samples[i].V*samples[i+1].P - samples[i+1].V*samples[i].P); }
  return Math.abs(A/2);
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);

  const cy=buildCycle();
  if(!Number.isFinite(u)) u=0;
  const seg=((Math.floor(u)%4)+4)%4, f=u-Math.floor(u);
  const st=segState(cy,seg,f);

  // limiti V,P del ciclo
  const samp=cycleSamples(cy);
  let Vmin=1e9,Vmax=-1e9,Pmin=1e9,Pmax=-1e9;
  for(const s of samp){ Vmin=Math.min(Vmin,s.V);Vmax=Math.max(Vmax,s.V);Pmin=Math.min(Pmin,s.P);Pmax=Math.max(Pmax,s.P); }

  const split=W*0.42;
  drawPiston(ctx, 0, 0, split, H, st, cy, seg, Vmin, Vmax);
  drawPV(ctx, split, 0, W-split, H, cy, samp, st, Vmin,Vmax,Pmin,Pmax);

  // intestazione
  ctx.fillStyle=T.accent; ctx.font='bold 15px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillText(`Ciclo ${CYCLE_NAMES[P.cycle]} · η = ${(cy.eff*100).toFixed(1)}%`, 14, 24);
  ctx.fillStyle=T.sub; ctx.font='11px "DM Sans",sans-serif';
  ctx.fillText(cy.names[seg], 14, 42);
}

function drawGrid(ctx,W,H){
  ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}

function tempColor(Tn){ // Tn normalizzato 0..1
  const r=Math.round(60+195*Tn), g=Math.round(120-40*Tn+ (Tn<0.5?0:0)), b=Math.round(255-215*Tn);
  return `rgb(${r},${Math.max(20,g)},${Math.max(20,b)})`;
}
// rettangolo arrotondato
function rr(ctx,x,y,w,h,r){ r=Math.min(r,Math.abs(w)/2,Math.abs(h)/2);
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
// gradiente metallico orizzontale con riflesso
function metalH(ctx,x0,x1){ const g=ctx.createLinearGradient(x0,0,x1,0);
  g.addColorStop(0,T.metalD); g.addColorStop(0.30,T.metal);
  g.addColorStop(0.45,'rgba(240,246,252,0.55)'); g.addColorStop(0.62,T.metal); g.addColorStop(1,T.metalD); return g; }

// ── motore (cilindro + testata + pistone + biella + manovella) ──
function drawPiston(ctx,x,y,W,H,st,cy,seg,Vmin,Vmax){
  const cx=x+W/2;
  const bore=Math.min(W*0.34,86), wall=8, cylX=cx-bore/2;
  const headTop=y+H*0.07, headH=32, chamberTop=headTop+headH;
  const BDC=y+H*0.60, travel=BDC-chamberTop-10;
  const vf=(st.V-Vmin)/(Vmax-Vmin+1e-9);
  const gasH=12+travel*(0.08+0.88*vf);
  const pistonTop=chamberTop+gasH, pistonH=bore*0.42;
  const crankCY=y+H*0.84, crankR=Math.min(travel*0.5,24);
  const theta=u/4*Math.PI*2 - Math.PI/2;

  // scambio termico
  const a=cy.pts[seg], b=cy.pts[(seg+1)%4];
  const Ta=a.P*a.V, Tb=b.P*b.V;
  const heatIn = Tb>Ta+1e-6 || (cy.kinds[seg]==='isothermal' && b.V>a.V);
  const heatOut= Tb<Ta-1e-6 || (cy.kinds[seg]==='isothermal' && b.V<a.V);

  // fase nel ciclo
  const f=u-Math.floor(u);
  const openCycle=(P.cycle==='otto'||P.cycle==='diesel');   // motori a combustione interna (4 tempi)
  // ignizione: solo Otto, istante all'inizio della combustione (seg 1)
  const ignite = P.cycle==='otto' && seg===1 && f<0.14;
  // iniezione Diesel: durante la combustione isobara (seg 1)
  const inject = P.cycle==='diesel' && seg===1;
  // ricambio gas durante il raffreddamento 4→1 (seg 3): prima scarico poi aspirazione
  const exhaustAmt = (openCycle && seg===3 && f<0.55) ? Math.sin(f/0.55*Math.PI) : 0;
  const intakeAmt  = (openCycle && seg===3 && f>=0.45) ? Math.sin((f-0.45)/0.55*Math.PI) : 0;
  const maxLift=7;

  const blockX=cylX-wall, blockW=bore+wall*2;
  const vxIn=cx-bore*0.27, vxEx=cx+bore*0.27;   // valvola aspirazione (sx) / scarico (dx)

  const pinY=pistonTop+pistonH*0.6;
  const cpx=cx+Math.cos(theta)*crankR, cpy=crankCY+Math.sin(theta)*crankR;

  // ── basamento (carter) dietro la manovella ──
  ctx.fillStyle=metalH(ctx,blockX-12,blockX+blockW+12);
  rr(ctx,blockX-12,BDC-6,blockW+24,crankCY-BDC+crankR+34,8); ctx.fill();
  ctx.strokeStyle=T.metalD; ctx.lineWidth=1; ctx.stroke();

  // alette di raffreddamento (barre arrotondate sfumate)
  for(let fy=chamberTop+10; fy<BDC-6; fy+=11){
    ctx.fillStyle=metalH(ctx,blockX-9,blockX+blockW+9);
    rr(ctx,blockX-9,fy,blockW+18,6,3); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.12)'; ctx.fillRect(blockX-9,fy+5,blockW+18,1);
  }

  // pareti cilindro (canna) con riflesso + ombra interna del cilindro
  ctx.fillStyle=metalH(ctx,blockX,blockX+blockW);
  ctx.fillRect(blockX,chamberTop,wall,BDC-chamberTop);
  ctx.fillRect(cylX+bore,chamberTop,wall,BDC-chamberTop);

  // gas in camera (sopra il pistone, colore per T)
  const Tn=Math.max(0,Math.min(1,(st.P*st.V)/cycleTmax(cy)));
  ctx.fillStyle=tempColor(Tn);
  ctx.fillRect(cylX,chamberTop,bore,pistonTop-chamberTop);
  // bagliore di combustione (Q in) sul cielo del pistone
  if(heatIn){
    const gg=ctx.createRadialGradient(cx,chamberTop+6,2,cx,chamberTop+6,bore*0.7);
    gg.addColorStop(0,'rgba(255,240,170,0.55)'); gg.addColorStop(0.5,'rgba(255,150,40,0.25)'); gg.addColorStop(1,'rgba(255,80,0,0)');
    ctx.fillStyle=gg; ctx.fillRect(cylX,chamberTop,bore,pistonTop-chamberTop);
  }
  // ombra interna canna (bordi)
  const sh=ctx.createLinearGradient(cylX,0,cylX+bore,0);
  sh.addColorStop(0,'rgba(0,0,0,0.30)'); sh.addColorStop(0.12,'rgba(0,0,0,0)');
  sh.addColorStop(0.88,'rgba(0,0,0,0)'); sh.addColorStop(1,'rgba(0,0,0,0.30)');
  ctx.fillStyle=sh; ctx.fillRect(cylX,chamberTop,bore,pistonTop-chamberTop);

  // ── condotti di aspirazione (sx, carburante) e scarico (dx, fumi) ──
  if(openCycle){
    const pipeY=headTop+4, pipeH=14;
    // condotto aspirazione (verde-azzurro)
    ctx.fillStyle=dk()?'rgba(80,180,140,0.35)':'rgba(40,140,100,0.35)';
    ctx.fillRect(blockX-34,pipeY,34,pipeH);
    ctx.strokeStyle=T.metalD; ctx.lineWidth=1; ctx.strokeRect(blockX-34,pipeY,34,pipeH);
    // condotto scarico (grigio)
    ctx.fillStyle=dk()?'rgba(140,150,160,0.30)':'rgba(110,120,130,0.35)';
    ctx.fillRect(blockX+blockW,pipeY,34,pipeH);
    ctx.strokeStyle=T.metalD; ctx.lineWidth=1; ctx.strokeRect(blockX+blockW,pipeY,34,pipeH);
    // particelle: miscela in entrata
    if(intakeAmt>0.05){
      ctx.fillStyle='rgba(120,230,170,0.9)';
      for(let k=0;k<6;k++){ const pr=((t*1.3+k/6)%1); const px=blockX-32+pr*34, py=pipeY+pipeH/2+Math.sin(k*1.7)*3;
        ctx.beginPath(); ctx.arc(px,py,1.8,0,Math.PI*2); ctx.fill(); }
    }
    // particelle: fumi in uscita
    if(exhaustAmt>0.05){
      for(let k=0;k<6;k++){ const pr=((t*1.1+k/6)%1); const px=blockX+blockW+pr*34, py=pipeY+pipeH/2-pr*6;
        ctx.fillStyle=`rgba(120,120,130,${(1-pr)*0.6*exhaustAmt})`;
        ctx.beginPath(); ctx.arc(px,py,2+pr*4,0,Math.PI*2); ctx.fill(); }
    }
    // etichette condotti
    ctx.font='8px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillStyle='rgba(120,210,160,0.8)'; ctx.fillText('aspirazione', blockX-17, pipeY-3);
    ctx.fillStyle='rgba(150,160,170,0.85)'; ctx.fillText('scarico', blockX+blockW+17, pipeY-3);
  }

  // testata (blocco arrotondato con riflesso, guarnizione e bulloni)
  ctx.fillStyle=metalH(ctx,blockX-4,blockX+blockW+4);
  rr(ctx,blockX-4,headTop,blockW+8,headH,5); ctx.fill();
  ctx.strokeStyle=T.metalD; ctx.lineWidth=1; ctx.stroke();
  // guarnizione testata
  ctx.fillStyle='rgba(200,90,60,0.7)'; ctx.fillRect(blockX-4,chamberTop-2,blockW+8,2.5);
  // bulloni testata
  ctx.fillStyle=T.metalD;
  for(const bxp of [blockX, blockX+blockW]){ ctx.beginPath(); ctx.arc(bxp,headTop+6,3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(bxp-1,headTop+5,1,0,Math.PI*2); ctx.fill(); ctx.fillStyle=T.metalD; }

  // valvole animate con molla
  function valve(vx,lift,openTint){
    const tip=chamberTop-2+lift, topG=headTop-12;
    // molla (spirale schematica)
    ctx.strokeStyle=T.metalD; ctx.lineWidth=1.4; ctx.beginPath();
    const coils=5, y0=topG+2, y1=headTop+6, comp=lift*0.4;
    for(let i=0;i<=coils;i++){ const yy=y0+(y1-y0)*i/coils - comp*(i/coils); const xx=vx+(i%2?4:-4); i===0?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy); }
    ctx.stroke();
    // stelo
    ctx.strokeStyle=T.metal; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(vx,topG); ctx.lineTo(vx,tip); ctx.stroke();
    // fungo valvola
    ctx.fillStyle = lift>0.5 ? openTint : T.metalD;
    ctx.beginPath(); ctx.ellipse(vx,tip,6.5,3,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=0.6; ctx.stroke();
  }
  if(openCycle){
    valve(vxIn, intakeAmt*maxLift, 'rgba(90,210,150,0.95)');
    valve(vxEx, exhaustAmt*maxLift, 'rgba(170,175,185,0.95)');
  } else { valve(vxIn,0,T.metalD); valve(vxEx,0,T.metalD); }

  // candela (Otto) / iniettore (Diesel)
  if(P.cycle==='otto'){
    ctx.fillStyle=metalH(ctx,cx-6,cx+6); rr(ctx,cx-6,headTop-22,12,8,2); ctx.fill();    // dado esagonale
    ctx.fillStyle='#e8e2d0'; rr(ctx,cx-4,headTop-15,8,9,2); ctx.fill();                  // ceramica
    ctx.fillStyle=T.metal; ctx.fillRect(cx-3,headTop-6,6,headH+6);                       // corpo filettato
    ctx.fillStyle=ignite?'#fff7b0':T.metalD; ctx.fillRect(cx-1.5,chamberTop-2,3,4);      // elettrodo
    if(ignite){  // scintilla: singolo istante
      ctx.strokeStyle='#fff7b0'; ctx.lineWidth=1.8;
      for(let i=0;i<7;i++){const aa=i/7*6.28;ctx.beginPath();ctx.moveTo(cx,chamberTop+2);ctx.lineTo(cx+Math.cos(aa)*9,chamberTop+2+Math.sin(aa)*9);ctx.stroke();}
      const fg=ctx.createRadialGradient(cx,chamberTop+3,1,cx,chamberTop+3,16);
      fg.addColorStop(0,'rgba(255,245,150,0.7)'); fg.addColorStop(1,'rgba(255,150,0,0)');
      ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(cx,chamberTop+3,16,0,Math.PI*2); ctx.fill();
    }
  } else if(P.cycle==='diesel'){
    ctx.fillStyle=metalH(ctx,cx-4,cx+4); rr(ctx,cx-4,headTop-18,8,12,2); ctx.fill();
    ctx.fillStyle=T.metal; ctx.fillRect(cx-2,headTop-6,4,headH+6);
    if(inject){  // spruzzo di gasolio a cono + goccioline
      ctx.fillStyle='rgba(255,200,90,0.8)'; ctx.beginPath(); ctx.moveTo(cx,chamberTop+2);
      ctx.lineTo(cx-6,chamberTop+18); ctx.lineTo(cx+6,chamberTop+18); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,160,40,0.7)';
      for(let k=0;k<5;k++){const pr=((t*2+k/5)%1); ctx.beginPath(); ctx.arc(cx+(k-2)*2.4,chamberTop+2+pr*16,1.3,0,Math.PI*2); ctx.fill();}
    }
  }

  // pistone: cielo + cave fasce + mantello + spinotto
  ctx.fillStyle=metalH(ctx,cylX,cylX+bore);
  rr(ctx,cylX+1,pistonTop,bore-2,pistonH,3); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.fillRect(cylX+2,pistonTop+1,bore-4,2);     // cielo lucido
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=2;                                   // fasce elastiche
  for(let i=1;i<=3;i++){ const ry=pistonTop+4+i*4.5; ctx.beginPath(); ctx.moveTo(cylX+2,ry); ctx.lineTo(cylX+bore-2,ry); ctx.stroke(); }
  ctx.fillStyle=T.metalD; ctx.beginPath(); ctx.arc(cx,pinY,6,0,Math.PI*2); ctx.fill();   // boss spinotto
  ctx.fillStyle=T.metal; ctx.beginPath(); ctx.arc(cx,pinY,3,0,Math.PI*2); ctx.fill();

  // ── volano (con corona, fori, tacca), contrappeso, biella, manovella ──
  const Rf=crankR+16;
  const fg2=ctx.createRadialGradient(cx-Rf*0.3,crankCY-Rf*0.3,2,cx,crankCY,Rf);
  fg2.addColorStop(0,T.metal); fg2.addColorStop(1,T.metalD);
  ctx.fillStyle=fg2; ctx.beginPath(); ctx.arc(cx,crankCY,Rf,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=T.metalD; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(cx,crankCY,Rf-2,0,Math.PI*2); ctx.stroke();
  // fori di alleggerimento (ruotano col volano)
  for(let i=0;i<8;i++){ const aa=theta+i/8*Math.PI*2; ctx.fillStyle=T.metalD;
    ctx.beginPath(); ctx.arc(cx+Math.cos(aa)*Rf*0.62, crankCY+Math.sin(aa)*Rf*0.62, 2.4, 0,Math.PI*2); ctx.fill(); }
  // tacca di riferimento
  ctx.strokeStyle=T.accent; ctx.lineWidth=2; ctx.beginPath();
  ctx.moveTo(cx,crankCY); ctx.lineTo(cx+Math.cos(theta)*(Rf-4),crankCY+Math.sin(theta)*(Rf-4)); ctx.stroke();

  // contrappeso opposto al perno
  const cwA=theta+Math.PI;
  ctx.fillStyle=T.metalD; ctx.beginPath();
  ctx.arc(cx,crankCY,crankR+9,cwA-0.95,cwA+0.95); ctx.arc(cx,crankCY,crankR-2,cwA+0.95,cwA-0.95,true);
  ctx.closePath(); ctx.fill();
  // braccio di manovella
  ctx.strokeStyle=T.metal; ctx.lineWidth=7; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx,crankCY); ctx.lineTo(cpx,cpy); ctx.stroke(); ctx.lineCap='butt';

  // biella: fusto rastremato (doppia I) tra spinotto e perno
  const ang2=Math.atan2(cpy-pinY,cpx-cx), perp=ang2+Math.PI/2, w1=2.6;
  ctx.fillStyle=metalH(ctx,cx-9,cx+9);
  ctx.beginPath();
  ctx.moveTo(cx+Math.cos(perp)*w1, pinY+Math.sin(perp)*w1);
  ctx.lineTo(cpx+Math.cos(perp)*w1*1.7, cpy+Math.sin(perp)*w1*1.7);
  ctx.lineTo(cpx-Math.cos(perp)*w1*1.7, cpy-Math.sin(perp)*w1*1.7);
  ctx.lineTo(cx-Math.cos(perp)*w1, pinY-Math.sin(perp)*w1);
  ctx.closePath(); ctx.fill();
  // testa di biella (cappello) + bulloni
  ctx.fillStyle=T.metal; ctx.beginPath(); ctx.arc(cpx,cpy,7,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=T.metalD; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle=T.metalD;
  for(const sgn of [-1,1]){ ctx.beginPath(); ctx.arc(cpx+Math.cos(perp)*sgn*6, cpy+Math.sin(perp)*sgn*6, 1.6,0,Math.PI*2); ctx.fill(); }
  // occhio piccolo (spinotto)
  ctx.fillStyle=T.metal; ctx.beginPath(); ctx.arc(cx,pinY,5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=T.metalD; ctx.beginPath(); ctx.arc(cx,pinY,2.5,0,Math.PI*2); ctx.fill();
  // perno di manovella e perno di banco
  ctx.fillStyle=T.metalD; ctx.beginPath(); ctx.arc(cpx,cpy,3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=T.metal; ctx.beginPath(); ctx.arc(cx,crankCY,5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=T.metalD; ctx.beginPath(); ctx.arc(cx,crankCY,2.5,0,Math.PI*2); ctx.fill();

  // etichette scambio termico
  if(heatIn){ ctx.fillStyle='rgba(255,150,50,0.95)'; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('Q in ▲', cylX+bore+wall+8, chamberTop+18); }
  else if(heatOut){ ctx.fillStyle='rgba(110,180,255,0.95)'; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('Q out ▼', cylX+bore+wall+8, chamberTop+18); }

  // readout V,P,T
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(`V=${st.V.toFixed(2)}  P=${st.P.toFixed(2)}  T=${st.T.toFixed(2)}`, cx, y+H-6);
}
function cycleTmax(cy){ let m=0; for(const p of cy.pts) m=Math.max(m,p.P*p.V); return m||1; }

// ── diagramma P-V ──
function drawPV(ctx,x,y,W,H,cy,samp,st,Vmin,Vmax,Pmin,Pmax){
  const PAD={l:38,r:18,t:30,b:34};
  const gx=x+PAD.l, gy=y+PAD.t, gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  const dV=(Vmax-Vmin)||1, dP=(Pmax-Pmin)||1;
  const X=V=> gx + (V-Vmin)/dV*gW*0.94 + gW*0.03;
  const Y=Pp=> gy+gH - (Pp-Pmin)/dP*gH*0.94 - gH*0.03;

  // assi
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(gx,gy); ctx.lineTo(gx,gy+gH); ctx.lineTo(gx+gW,gy+gH); ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('V', gx+gW/2, gy+gH+24);
  ctx.save(); ctx.translate(x+12,gy+gH/2); ctx.rotate(-Math.PI/2); ctx.fillText('P',0,0); ctx.restore();

  // area racchiusa (lavoro)
  ctx.fillStyle=dk()?'rgba(255,210,90,0.08)':'rgba(210,140,0,0.10)';
  ctx.beginPath(); ctx.moveTo(X(samp[0].V),Y(samp[0].P));
  for(const s of samp) ctx.lineTo(X(s.V),Y(s.P));
  ctx.closePath(); ctx.fill();

  // centroide (per spostare le etichette verso l'esterno)
  let cV=0,cP=0; cy.pts.forEach(p=>{cV+=p.V;cP+=p.P;}); cV/=4; cP/=4;
  const cX=X(cV), cY=Y(cP);

  // ogni trasformazione: colore proprio + freccia di verso + etichetta
  for(let s=0;s<4;s++){
    const kind=cy.kinds[s], col=KIND[kind].c;
    const pp=[]; for(let i=0;i<=24;i++) pp.push(segState(cy,s,i/24));
    ctx.strokeStyle=col; ctx.lineWidth=2.6; ctx.beginPath();
    pp.forEach((q,i)=>{ const px=X(q.V),py=Y(q.P); i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); });
    ctx.stroke();

    // freccia di verso al centro del segmento
    const m0=pp[12], m1=pp[13];
    const ax=X(m0.V), ay=Y(m0.P), bx=X(m1.V), by=Y(m1.P);
    const ang=Math.atan2(by-ay,bx-ax);
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.moveTo(bx,by);
    ctx.lineTo(bx-9*Math.cos(ang-0.4),by-9*Math.sin(ang-0.4));
    ctx.lineTo(bx-9*Math.cos(ang+0.4),by-9*Math.sin(ang+0.4));
    ctx.closePath(); ctx.fill();

    // etichetta spostata verso l'esterno del ciclo
    const mx=(ax+bx)/2, my=(ay+by)/2;
    let ox=mx-cX, oy=my-cY; const ol=Math.hypot(ox,oy)||1; ox/=ol; oy/=ol;
    ctx.fillStyle=col; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(KIND[kind].lbl, mx+ox*16, my+oy*16+3);
  }

  // vertici numerati
  ctx.fillStyle=T.accent; ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='left';
  cy.pts.forEach((p,i)=>{ const px=X(p.V),py=Y(p.P); ctx.beginPath(); ctx.arc(px,py,3.5,0,Math.PI*2); ctx.fill(); ctx.fillText(String(i+1),px+6,py-4); });

  // stato corrente
  ctx.fillStyle=T.dot; ctx.beginPath(); ctx.arc(X(st.V),Y(st.P),5,0,Math.PI*2); ctx.fill();

  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='right';
  ctx.fillText('diagramma di Clapeyron (P–V)', gx+gW, gy-8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}

// 1: T-S schematico (entropia) — usa segmenti: iso-T orizzontali, adiab verticali
function drawTS(){
  const cv=gCanvas[0]; if(!cv||!cv.width)return;
  const ctx=gCtx[0],W=cv.width,H=cv.height;
  const PAD={t:14,b:16,l:24,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const cy=buildCycle(), g=gamma();
  // T e S relativi: S = cv ln(T) + R ln(V) (nR=1, cv=1/(g-1))
  const cvh=1/(g-1);
  const node=cy.pts.map(p=>({T:p.P*p.V, S:cvh*Math.log(p.P*p.V)+Math.log(p.V)}));
  let Tmin=1e9,Tmax=-1e9,Smin=1e9,Smax=-1e9;
  node.forEach(n=>{Tmin=Math.min(Tmin,n.T);Tmax=Math.max(Tmax,n.T);Smin=Math.min(Smin,n.S);Smax=Math.max(Smax,n.S);});
  const X=s=>PAD.l+(s-Smin)/((Smax-Smin)||1)*gW;
  const Y=t2=>PAD.t+gH-(t2-Tmin)/((Tmax-Tmin)||1)*gH;
  ctx.strokeStyle=T.curve; ctx.lineWidth=1.4; ctx.beginPath();
  node.forEach((n,i)=>{ const px=X(n.S),py=Y(n.T); i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); });
  ctx.lineTo(X(node[0].S),Y(node[0].T)); ctx.stroke();
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace';
  ctx.fillText('T',PAD.l+2,PAD.t+7); ctx.fillText('S',PAD.l+gW-8,PAD.t+gH+11);
}

// 2: rendimento vs rapporto
function drawEffR(){
  const cv=gCanvas[1]; if(!cv||!cv.width)return;
  const ctx=gCtx[1],W=cv.width,H=cv.height;
  const PAD={t:14,b:16,l:26,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const g=gamma();
  const effAt=r=>{
    if(P.cycle==='otto') return 1-1/Math.pow(r,g-1);
    if(P.cycle==='diesel'){const al=Math.max(1.05,P.heat); return 1-(1/Math.pow(r,g-1))*((Math.pow(al,g)-1)/(g*(al-1)));}
    if(P.cycle==='brayton') return 1-Math.pow(r,-(g-1)/g);
    return 1-P.Tc/P.Th;
  };
  const rmin=2,rmax=14;
  ctx.strokeStyle=T.accent; ctx.lineWidth=1.4; ctx.beginPath();
  for(let i=0;i<=60;i++){ const r=rmin+(rmax-rmin)*i/60; const x=PAD.l+(r-rmin)/(rmax-rmin)*gW, y=PAD.t+gH-Math.max(0,effAt(r))*gH; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
  ctx.stroke();
  const rc=Math.max(rmin,Math.min(rmax,P.ratio));
  const x=PAD.l+(rc-rmin)/(rmax-rmin)*gW, y=PAD.t+gH-Math.max(0,effAt(rc))*gH;
  ctx.fillStyle=T.dot; ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace';
  ctx.fillText('η',PAD.l+2,PAD.t+7); ctx.fillText('rapporto',PAD.l+gW-34,PAD.t+gH+11);
}

// 3: bilancio energetico Qin/Qout/W
function drawEnergyBar(){
  const cv=gCanvas[2]; if(!cv||!cv.width)return;
  const ctx=gCtx[2],W=cv.width,H=cv.height;
  const PAD={t:16,b:14,l:30,r:8};
  const {gW,gH}=gBase(ctx,W,H,PAD);
  const cy=buildCycle();
  const W_net=netWork(cycleSamples(cy));
  const eff=Math.max(0.001,cy.eff);
  const Qin=W_net/eff, Qout=Qin-W_net;
  const mx=Math.max(Qin,1e-6);
  const bars=[['Q in',Qin,'rgba(255,140,60,0.9)'],['W',W_net,'rgba(120,255,180,0.9)'],['Q out',Qout,'rgba(90,160,255,0.9)']];
  const bw=gW/3*0.6;
  bars.forEach(([lbl,val,col],i)=>{
    const x=PAD.l+gW*(i+0.5)/3-bw/2, h=(val/mx)*gH;
    ctx.fillStyle=col; ctx.fillRect(x,PAD.t+gH-h,bw,h);
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(lbl,x+bw/2,PAD.t+gH+10);
  });
  ctx.textAlign='left'; ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace';
  ctx.fillText('bilancio',PAD.l+2,PAD.t-2);
}

function drawGraphs(){ drawTS(); drawEffR(); drawEnergyBar(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secC=Lab.Section('Ciclo');
  cont.appendChild(secC.el);
  secC.add(Lab.RadioGroup({
    label:'Motore',
    options:[
      {value:'otto',    label:'Otto (benzina)'},
      {value:'diesel',  label:'Diesel'},
      {value:'brayton', label:'Brayton (turbina)'},
      {value:'stirling',label:'Stirling'},
      {value:'ericsson',label:'Ericsson'},
      {value:'carnot',  label:'Carnot (ideale)'},
    ],
    value:P.cycle, onChange(v){ P.cycle=v; u=0; },
  }));
  secC.add(Lab.RadioGroup({
    label:'Gas', options:[{value:'mono',label:'Monoatomico'},{value:'dia',label:'Biatomico'}],
    value:P.gas, onChange(v){ P.gas=v; },
  }));

  const secP=Lab.Section('Parametri');
  cont.appendChild(secP.el);
  secP.add(Lab.Slider({ label:'Rapporto (r / r_p)', min:2, max:14, step:0.5, value:P.ratio, unit:'', onChange(v){P.ratio=v;} }));
  secP.add(Lab.Slider({ label:'Calore / cutoff', min:1.2, max:4, step:0.1, value:P.heat, unit:'', onChange(v){P.heat=v;} }));
  secP.add(Lab.Slider({ label:'T calda (Th)', min:500, max:1500, step:50, value:P.Th, unit:' K', onChange(v){P.Th=v;} }));
  secP.add(Lab.Slider({ label:'T fredda (Tc)', min:250, max:450, step:10, value:P.Tc, unit:' K', onChange(v){P.Tc=v;} }));
  secP.add(Lab.Slider({ label:'Velocità', min:0.1, max:10, step:0.1, value:P.speed, unit:'×', onChange(v){P.speed=v;} }));
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:145px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  const TITLES=['Diagramma T–S','Rendimento η(r)','Bilancio energetico'];
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
    {key:'eff',  label:'Rendimento η'},
    {key:'work', label:'Lavoro netto'},
    {key:'phase',label:'Fase'},
    {key:'gas',  label:'Gas (γ)'},
  ]);

  document.getElementById('btnPlay').addEventListener('click',()=>{
    paused=!paused; document.getElementById('btnPlay').textContent=paused?'▶  PLAY':'⏸  PAUSA';
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.cycle='otto'; P.ratio=8; P.heat=2; P.Th=900; P.Tc=300; P.gas='dia'; P.speed=0.5;
    u=0; paused=false; document.getElementById('btnPlay').textContent='⏸  PAUSA'; buildControls();
  });

  // calcola l'altezza dal contenitore meno i fratelli (readout, grafici) e fissa
  // sia la dimensione CSS (style) sia il buffer → niente loop di feedback col flex
  function resize(){
    const parent=simCanvas.parentElement; if(!parent)return;
    const ga=document.getElementById('graphArea');
    const rb=document.getElementById('readout');
    const gaH=ga?ga.offsetHeight:0, rbH=rb?rb.offsetHeight:0;
    const w=parent.clientWidth;
    const h=Math.max(140,(parent.clientHeight||0)-gaH-rbH);
    if(w>0){
      simCanvas.style.width=w+'px'; simCanvas.style.height=h+'px';
      simCanvas.width=w; simCanvas.height=h;
    }
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
    let dt=(now-last)/1000; if(!Number.isFinite(dt)||dt<0) dt=0; dt=Math.min(dt,0.04);
    last=now; t+=dt;
    if(!paused){ u=(u+P.speed*dt)%4; }
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const cy=buildCycle();
    readout.set('eff', (cy.eff*100).toFixed(1)+' %');
    readout.set('work', netWork(cycleSamples(cy)).toFixed(2)+' u');
    readout.set('phase', cy.names[Math.floor(u)%4]);
    readout.set('gas', P.gas==='mono'?'mono (γ=1.67)':'biat. (γ=1.40)');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// avvia init anche se il DOM è già pronto (evita canvas vuoto al primo caricamento)
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
