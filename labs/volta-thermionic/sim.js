'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const MAT = {
  Cs:{name:'Cesio',     phi:2.10, col:[200,205,210]},
  Na:{name:'Sodio',     phi:2.28, col:[190,195,205]},
  Ca:{name:'Calcio',    phi:2.87, col:[170,178,188]},
  W :{name:'Tungsteno', phi:4.55, col:[150,158,168]},
  Cu:{name:'Rame',      phi:4.70, col:[184,115,51]},
  Pt:{name:'Platino',   phi:6.35, col:[212,216,222]},
};
const P = {
  mode:'volta',
  matA:'Na', matB:'Cu', matC:'Ca', three:false,
  T: 2000, V: 1.0,
  paused:false,
};
const e0=1.602e-19, kB=1.381e-23, A_R=1.2e6;

let tAnim=0, last=0;
let voltDots=[], cross=[], emit=[], spawnAcc=0, eFlow=0;
let gCanvas=[null,null,null], gCtx=[null,null,null], gTitle=[null,null,null];
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
    edge:  d?'rgba(225,235,248,0.55)':'rgba(40,60,90,0.6)',
    tube:  d?'rgba(150,180,215,0.08)':'rgba(120,150,195,0.12)',
    elec:  [90,170,255],
    plus:  [255,110,90],
    minus: [90,170,255],
    cur:   [255,205,70],
    vac:   d?'rgba(190,210,235,0.7)':'rgba(50,80,120,0.7)',
    fermi: [95,225,140],
    wire:  d?'rgba(185,205,230,0.8)':'rgba(60,90,125,0.85)',
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
function shade(c,f){ return [clamp(Math.round(c[0]*f),0,255),clamp(Math.round(c[1]*f),0,255),clamp(Math.round(c[2]*f),0,255)]; }

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function metals(){ return P.three? [P.matA,P.matB,P.matC] : [P.matA,P.matB]; }
function phiOf(k){ return MAT[k].phi; }
function Vtotal(){ const l=metals(); return phiOf(l[l.length-1])-phiOf(l[0]); }   // d.d.p. estremi (V)
function richardson(Tk,phi){ return A_R*Tk*Tk*Math.exp(-phi*e0/(kB*Tk)); }
function Jemit(){ return richardson(P.T, phiOf(P.matA)); }
function diodeI(V){
  const Is=Jemit();
  if(V>=0) return Is*Math.min(1, Math.pow(Math.max(0,V)/0.8,1.5));   // spazio di carica → saturazione
  const Vth=Math.max(0.05, kB*P.T/e0);                               // frenante (esponenziale)
  return Is*Math.exp(V/Vth);
}
function hotColor(Tk){
  const t=clamp((Tk-700)/2300,0,1);
  return [clamp(Math.round(120+135*t),0,255), clamp(Math.round(20+205*t),0,255), clamp(Math.round(-40+280*t*t),0,255)];
}

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geomVolta(W,H){
  const list=metals(), N=list.length;
  const y0=H*0.30, y1=H*0.64, total=W*0.56, x0=W*0.05, bw=total/N;
  const blocks=[]; for(let i=0;i<N;i++) blocks.push({x0:x0+i*bw, x1:x0+(i+1)*bw, k:list[i]});
  G={mode:'volta', y0,y1, blocks, W,H};
}
function geomTherm(W,H){
  const x0=W*0.15, x1=W*0.83, y0=H*0.16, y1=H*0.50, cy=(y0+y1)/2;
  const filX=x0+(x1-x0)*0.15, anoX=x0+(x1-x0)*0.86;
  G={mode:'thermionic', tx0:x0,tx1:x1,ty0:y0,ty1:y1, cy, filX, anoX, W,H};
}
function initSim(){
  voltDots=[]; cross=[]; emit=[]; spawnAcc=0;
  if(!G.W) return;
  if(P.mode==='volta'){
    geomVolta(G.W,G.H);                       // assicura la geometria corretta prima di usarla
    for(const b of G.blocks){ const arr=[]; for(let i=0;i<26;i++) arr.push(rnd(b)); voltDots.push(arr); }
  } else { geomTherm(G.W,G.H); }
}
function rnd(b){ return {x:b.x0+6+Math.random()*(b.x1-b.x0-12), y:G.y0+6+Math.random()*(G.y1-G.y0-12), vx:(Math.random()-0.5)*2.4, vy:(Math.random()-0.5)*2.4}; }
// mantiene gli array di elettroni allineati al numero di blocchi (evita crash al cambio catena)
function ensureDots(){
  if(!G.blocks) return;
  if(voltDots.length!==G.blocks.length){
    voltDots=[]; for(const b of G.blocks){ const a=[]; for(let i=0;i<26;i++) a.push(rnd(b)); voltDots.push(a); }
  }
}

function step(dt){
  if(P.paused) return;
  if(G.W){ if(P.mode==='volta') geomVolta(G.W,G.H); else geomTherm(G.W,G.H); }  // geometria sempre coerente con la modalità
  const dtf=Math.min(dt,0.05)*60;
  if(P.mode==='volta'){ ensureDots(); stepVolta(dtf); } else stepTherm(dtf);
}
function bounce(d,b,dtf){ d.x+=d.vx*dtf; d.y+=d.vy*dtf;
  if(d.x<b.x0+5){d.x=b.x0+5;d.vx=Math.abs(d.vx);} if(d.x>b.x1-5){d.x=b.x1-5;d.vx=-Math.abs(d.vx);}
  if(d.y<G.y0+5){d.y=G.y0+5;d.vy=Math.abs(d.vy);} if(d.y>G.y1-5){d.y=G.y1-5;d.vy=-Math.abs(d.vy);}
}
function stepVolta(dtf){
  for(let i=0;i<G.blocks.length;i++) for(const d of (voltDots[i]||[])) bounce(d,G.blocks[i],dtf);
  // trasferimento a ogni giunzione: verso il metallo a φ maggiore
  for(let j=0;j<G.blocks.length-1;j++){
    const dphi=phiOf(G.blocks[j+1].k)-phiOf(G.blocks[j].k);
    if(Math.abs(dphi)<0.02) continue;
    spawnAcc += Math.min(0.4, Math.abs(dphi)*0.05)*dtf;
  }
  while(spawnAcc>=1){ spawnAcc-=1;
    const j=Math.floor(Math.random()*(G.blocks.length-1));
    const dphi=phiOf(G.blocks[j+1].k)-phiOf(G.blocks[j].k);
    if(Math.abs(dphi)>0.02){ const jx=G.blocks[j].x1;
      cross.push({x:jx, y:G.y0+10+Math.random()*(G.y1-G.y0-20), dir:dphi>0?1:-1, t:0}); }
  }
  for(const c of cross){ c.x+=c.dir*2.0*dtf; c.t+=dtf; }
  const xL=G.blocks[0].x0+2, xR=G.blocks[G.blocks.length-1].x1-2;
  cross=cross.filter(c=> c.t<55 && c.x>xL && c.x<xR);   // resta dentro i metalli
}
function stepTherm(dtf){
  eFlow += dtf;
  const I=diodeI(P.V), rate=clamp(I/4000,0,1.5);
  spawnAcc += rate*1.6*dtf;
  while(spawnAcc>=1){ spawnAcc-=1; if(rate>0.001){
    const ang=(Math.random()-0.5)*1.1;
    emit.push({x:G.filX+4, y:G.cy+(Math.random()-0.5)*(G.ty1-G.ty0)*0.5, vx:1.2+Math.random()*1.6, vy:Math.sin(ang)*1.0, life:1});
  }}
  const acc = P.V>=0 ? 1+P.V*0.25 : Math.max(0.2,1+P.V*0.5);   // accelerazione/frenata
  for(const e of emit){ e.x+=e.vx*acc*dtf; e.y+=e.vy*dtf;
    if(P.V<-0.3 && e.x>G.filX+(G.anoX-G.filX)*0.55) e.vx-=0.05*dtf*(-P.V);   // frenata: rallenta/torna
    if(e.x>=G.anoX-3){ e.dead=true; } if(e.x<G.filX || e.x>G.W||e.life<=0){ e.dead=true; } e.life-=0.004*dtf; }
  emit=emit.filter(e=>!e.dead);
  if(emit.length>200) emit.splice(0,emit.length-200);
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  T=pal();
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  if(P.mode==='volta'){ geomVolta(W,H); ensureDots(); drawVolta(ctx); } else { geomTherm(W,H); drawTherm(ctx); }
}

function drawVolta(ctx){
  // blocchi
  for(const b of G.blocks){ const c=MAT[b.k].col;
    const g=ctx.createLinearGradient(0,G.y0,0,G.y1);
    g.addColorStop(0,rgb(shade(c,0.7))); g.addColorStop(0.4,rgb(shade(c,1.1))); g.addColorStop(1,rgb(shade(c,0.6)));
    ctx.fillStyle=g; ctx.fillRect(b.x0,G.y0,b.x1-b.x0,G.y1-G.y0);
    ctx.strokeStyle=T.edge; ctx.lineWidth=1.4; ctx.strokeRect(b.x0,G.y0,b.x1-b.x0,G.y1-G.y0);
    ctx.fillStyle=T.txt; ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(MAT[b.k].name, (b.x0+b.x1)/2, G.y1+15);
    ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.fillText('φ='+phiOf(b.k).toFixed(2), (b.x0+b.x1)/2, G.y1+27);
  }
  // elettroni
  for(let i=0;i<G.blocks.length;i++) for(const d of (voltDots[i]||[])){ ctx.fillStyle=rgba(T.elec,0.9); ctx.beginPath(); ctx.arc(d.x,d.y,2.5,0,Math.PI*2); ctx.fill(); }
  for(const c of cross){ ctx.fillStyle=rgb(T.elec); ctx.beginPath(); ctx.arc(c.x,c.y,3,0,Math.PI*2); ctx.fill(); }
  // giunzioni: segni + frecce
  for(let j=0;j<G.blocks.length-1;j++){
    const jx=G.blocks[j].x1, dphi=phiOf(G.blocks[j+1].k)-phiOf(G.blocks[j].k);
    ctx.strokeStyle=rgba([255,255,255],0.4); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(jx,G.y0); ctx.lineTo(jx,G.y1); ctx.stroke();
    if(Math.abs(dphi)<0.02) continue;
    const leftPlus = dphi>0;   // φ destra > φ sinistra → sinistra +, destra −
    const nm=Math.round(clamp(Math.abs(dphi)*2,1,5));
    ctx.font='bold 13px "Space Mono",monospace'; ctx.textBaseline='middle';
    for(let i=0;i<nm;i++){ const y=G.y0+16+(G.y1-G.y0-32)*i/Math.max(1,nm-1);
      ctx.fillStyle=rgb(leftPlus?T.plus:T.minus); ctx.textAlign='right'; ctx.fillText(leftPlus?'+':'−', jx-5, y);
      ctx.fillStyle=rgb(leftPlus?T.minus:T.plus); ctx.textAlign='left';  ctx.fillText(leftPlus?'−':'+', jx+5, y);
    }
    ctx.textBaseline='alphabetic';
  }
  // diagramma a bande
  drawBands(ctx);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Effetto Volta:  V(estremi) = (φ_ultimo − φ_primo)/e', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('Legge di Volta: la d.d.p. tra gli estremi dipende solo dai metalli alle estremità, non da quelli intermedi.', 14, 40);
}

function drawBands(ctx){
  const list=G.blocks.map(b=>b.k), N=list.length;
  const x=G.W*0.66, w=G.W*0.30, y0=G.y0, y1=G.y1, h=y1-y0;
  const maxPhi=Math.max.apply(null,list.map(phiOf))*1.25, sc=h/maxPhi;
  ctx.strokeStyle=T.vac; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x+w,y0); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('vuoto', x+2, y0-4);
  const colW=w/N*0.6;
  list.forEach((k,i)=>{ const px=x+w*(i+0.5)/N-colW/2, phi=phiOf(k), fy=y0+phi*sc, c=MAT[k].col;
    ctx.fillStyle=rgba(c,0.5); ctx.fillRect(px,fy,colW,y1-fy);
    ctx.strokeStyle=rgb(T.fermi); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(px,fy); ctx.lineTo(px+colW,fy); ctx.stroke();
    ctx.fillStyle=T.txt; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(phi.toFixed(2), px+colW/2, fy-3);
  });
  ctx.fillStyle=rgb(T.fermi); ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('E_F', x+w-22, y0+6);
}

function drawTherm(ctx){
  const hc=hotColor(P.T);
  // ampolla
  ctx.fillStyle=T.tube; roundRect(ctx,G.tx0,G.ty0,G.tx1-G.tx0,G.ty1-G.ty0,14); ctx.fill();
  ctx.strokeStyle=T.edge; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('tubo a vuoto', (G.tx0+G.tx1)/2, G.ty0-7);
  // alone di calore
  const gl=ctx.createRadialGradient(G.filX,G.cy,3,G.filX,G.cy,(G.ty1-G.ty0)*0.8);
  gl.addColorStop(0,rgba(hc,0.45)); gl.addColorStop(1,rgba(hc,0));
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(G.filX,G.cy,(G.ty1-G.ty0)*0.8,0,Math.PI*2); ctx.fill();
  // FILAMENTO a spirale (come una lampadina)
  drawFilament(ctx,G.filX,G.ty0+14,G.ty1-14,hc);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('FILAMENTO ('+MAT[P.matA].name+')', G.filX, G.ty1+13);
  // anodo
  ctx.fillStyle=dk()?'#5d6b7e':'#7c889a'; ctx.fillRect(G.anoX-2,G.ty0+10,7,(G.ty1-G.ty0)-20);
  ctx.fillStyle=T.sub; ctx.fillText('ANODO', G.anoX+2, G.ty1+13);
  // elettroni
  for(const e of emit){ ctx.fillStyle=rgba(T.elec,Math.max(0.3,e.life)); ctx.beginPath(); ctx.arc(e.x,e.y,2.8,0,Math.PI*2); ctx.fill(); }
  // circuito con tensione variabile + amperometro
  drawCircuit(ctx);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Effetto termoionico:  J = A·T²·e^(−φ/kT)', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`T = ${P.T} K   φ = ${phiOf(P.matA).toFixed(2)} eV   J_sat = ${fmtJ(Jemit())}`, 14, 40);
}
function drawFilament(ctx,x,y0,y1,hc){
  const n=8, amp=8, seg=n*10;
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle=rgb(shade(hc,0.9)); ctx.lineWidth=4; ctx.beginPath();
  for(let i=0;i<=seg;i++){ const t=i/seg, yy=y0+(y1-y0)*t, xx=x+Math.sin(t*n*Math.PI*2)*amp; i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }
  ctx.stroke();
  ctx.strokeStyle=rgb(shade(hc,1.4)); ctx.lineWidth=1.6; ctx.beginPath();
  for(let i=0;i<=seg;i++){ const t=i/seg, yy=y0+(y1-y0)*t, xx=x+Math.sin(t*n*Math.PI*2)*amp; i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }
  ctx.stroke();
  // morsetti del filamento
  ctx.strokeStyle=T.wire; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0-8); ctx.moveTo(x,y1); ctx.lineTo(x,y1+8); ctx.stroke();
}
function drawCircuit(ctx){
  const yB=G.ty1+50, cyA=G.ty1-10;
  ctx.strokeStyle=T.wire; ctx.lineWidth=2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(G.anoX,cyA); ctx.lineTo(G.anoX,yB); ctx.moveTo(G.filX,G.ty1+8); ctx.lineTo(G.filX,yB); ctx.stroke();
  const aX=G.anoX-(G.anoX-G.filX)*0.30, gX=G.filX+(G.anoX-G.filX)*0.30;
  ctx.beginPath(); ctx.moveTo(G.anoX,yB); ctx.lineTo(aX+15,yB); ctx.moveTo(aX-15,yB); ctx.lineTo(gX+18,yB); ctx.moveTo(gX-18,yB); ctx.lineTo(G.filX,yB); ctx.stroke();
  // amperometro
  ctx.fillStyle=T.gBg; ctx.beginPath(); ctx.arc(aX,yB,15,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=1.6; ctx.stroke();
  const I=clamp(diodeI(P.V)/Math.max(1,Jemit()),0,1), ang=-Math.PI/2+(I-0.5)*1.5;
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(aX,yB); ctx.lineTo(aX+11*Math.cos(ang),yB+11*Math.sin(ang)); ctx.stroke();
  ctx.fillStyle=rgb(T.cur); ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('A',aX,yB+0.5); ctx.textBaseline='alphabetic';
  // generatore variabile
  ctx.strokeStyle=T.wire; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(gX-7,yB-9); ctx.lineTo(gX-7,yB+9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gX+7,yB-6); ctx.lineTo(gX+7,yB+6); ctx.stroke();
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(gX,yB,17,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle=T.txt; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(`${P.V>=0?'+':''}${P.V.toFixed(2)} V`, gX, yB+32);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.fillText('amperometro',aX,yB-22); ctx.fillText('tensione anodica',gX,yB-22);
  // flusso
  if(diodeI(P.V)>1){ const segs=[[G.anoX,cyA,G.anoX,yB],[G.anoX,yB,G.filX,yB],[G.filX,yB,G.filX,G.ty1+8]];
    let total=0; const len=segs.map(s=>{const l=Math.hypot(s[2]-s[0],s[3]-s[1]); total+=l; return l;});
    const ph=(tAnim*60*I)%total; ctx.fillStyle=rgb(T.cur); const N=Math.round(total/26);
    for(let k=0;k<N;k++){ let s=(ph+k*total/N)%total; for(let i=0;i<segs.length;i++){ if(s<=len[i]){ const f=s/len[i],sg=segs[i];
      const x=sg[0]+(sg[2]-sg[0])*f,y=sg[1]+(sg[3]-sg[1])*f; if(Math.hypot(x-aX,y-yB)>19&&Math.hypot(x-gX,y-yB)>21){ ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); } break; } s-=len[i]; } } }
}
function fmtJ(j){ if(j<1) return j.toExponential(2)+' A/m²'; if(j<1e4) return j.toFixed(0)+' A/m²'; return (j/1e4).toFixed(1)+' A/cm²'; }

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
function setTitles(){
  const t = P.mode==='volta'
    ? ['V(estremi) in funzione di φ_ultimo','Livelli energetici','Potenziale vs distanza']
    : ['J in funzione di T','Caratteristica I–V (diodo)','Richardson: ln(J/T²) vs 1/T'];
  for(let i=0;i<3;i++) if(gTitle[i]) gTitle[i].textContent=t[i];
}
function drawGraphs(){ if(P.mode==='volta') graphsVolta(); else graphsTherm(); }

function graphsVolta(){
  const list=metals(), phi0=phiOf(list[0]);
  // 1: V(estremi) vs φ_ultimo
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height; const PAD={t:14,b:18,l:26,r:8};
    const gH=H-PAD.t-PAD.b, gW=W-PAD.l-PAD.r; ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
    const zy=PAD.t+gH/2; ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
    ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.stroke(); ctx.beginPath(); ctx.moveTo(PAD.l,zy); ctx.lineTo(PAD.l+gW,zy); ctx.stroke();
    const xmax=7,vmax=7,xOf=p=>PAD.l+p/xmax*gW,yOf=v=>zy-v/vmax*(gH/2*0.9);
    ctx.strokeStyle=rgb(T.accent); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0-phi0)); ctx.lineTo(xOf(xmax),yOf(xmax-phi0)); ctx.stroke();
    ctx.fillStyle=rgb(T.plus); ctx.beginPath(); ctx.arc(xOf(phiOf(list[list.length-1])),yOf(Vtotal()),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('V',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('φ',PAD.l+gW-2,zy-3);
  }
  // 2: livelli energetici (barre φ)
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height; const PAD={t:16,b:22,l:10,r:10};
    const {gW,gH}=gBase(ctx,W,H,PAD); const max=6.8;
    const bw=gW/list.length*0.5; list.forEach((k,i)=>{ const cx=PAD.l+gW*(i+0.5)/list.length, bh=phiOf(k)/max*gH;
      ctx.fillStyle=rgba(MAT[k].col,0.85); ctx.fillRect(cx-bw/2,PAD.t+gH-bh,bw,bh);
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(k,cx,PAD.t+gH+10);
      ctx.fillStyle=rgb(MAT[k].col); ctx.fillText(phiOf(k).toFixed(2),cx,PAD.t+gH-bh-3); });
  }
  // 3: POTENZIALE vs distanza (step, V_i = φ_0 − φ_i)
  if(gCanvas[2]&&gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height; const PAD={t:14,b:18,l:26,r:8};
    const gH=H-PAD.t-PAD.b, gW=W-PAD.l-PAD.r; ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
    const Vs=list.map(k=>phi0-phiOf(k)); const vmax=Math.max(0.5,Math.max.apply(null,Vs.map(Math.abs)));
    const zy=PAD.t+gH/2; ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
    ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.stroke(); ctx.beginPath(); ctx.moveTo(PAD.l,zy); ctx.lineTo(PAD.l+gW,zy); ctx.stroke();
    const N=list.length, segW=gW/N, yOf=v=>zy-v/vmax*(gH/2*0.85);
    ctx.strokeStyle=rgb(T.accent); ctx.lineWidth=2; ctx.beginPath();
    for(let i=0;i<N;i++){ const x0=PAD.l+i*segW, x1=PAD.l+(i+1)*segW, y=yOf(Vs[i]);
      if(i===0) ctx.moveTo(x0,y); else ctx.lineTo(x0,y);   // salto verticale alla giunzione
      ctx.lineTo(x1,y); }
    ctx.stroke();
    // etichette metalli + livelli
    ctx.font='7px "Space Mono",monospace';
    for(let i=0;i<N;i++){ const cx=PAD.l+(i+0.5)*segW; ctx.fillStyle=rgb(MAT[list[i]].col); ctx.textAlign='center';
      ctx.fillText(list[i], cx, PAD.t+gH-3); ctx.fillStyle=T.gText; ctx.fillText(Vs[i].toFixed(2), cx, yOf(Vs[i])-4); }
    ctx.fillStyle=T.gText; ctx.textAlign='left'; ctx.fillText('V',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('x',PAD.l+gW-2,zy-3);
  }
}

function graphsTherm(){
  const Tmax=3000, phi=phiOf(P.matA);
  // 1: J vs T (log)
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height; const PAD={t:14,b:18,l:24,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const lo=-2,hi=8;
    const xOf=t=>PAD.l+t/Tmax*gW, yOf=j=>PAD.t+gH-(clamp(Math.log10(Math.max(1e-3,j)),lo,hi)-lo)/(hi-lo)*gH;
    ctx.strokeStyle=rgb(T.plus); ctx.lineWidth=1.5; ctx.beginPath(); let f=true;
    for(let t=300;t<=Tmax;t+=40){ const x=xOf(t),y=yOf(richardson(t,phi)); f?(ctx.moveTo(x,y),f=false):ctx.lineTo(x,y);} ctx.stroke();
    ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(xOf(P.T),yOf(Jemit()),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('J(log)',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('T',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 2: caratteristica I–V del diodo
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height; const PAD={t:14,b:18,l:24,r:8};
    const gH=H-PAD.t-PAD.b, gW=W-PAD.l-PAD.r; ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
    const Vmin=-2,Vmax=3, zf=(0-Vmin)/(Vmax-Vmin), zx=PAD.l+zf*gW;
    ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6; ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(zx,PAD.t); ctx.lineTo(zx,PAD.t+gH); ctx.stroke();
    const Is=Math.max(1e-9,Jemit()), xOf=v=>PAD.l+(v-Vmin)/(Vmax-Vmin)*gW, yOf=i=>PAD.t+gH-clamp(i/Is,0,1)*gH*0.9;
    ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=1.6; ctx.beginPath(); let f=true;
    for(let i=0;i<=80;i++){ const v=Vmin+(Vmax-Vmin)*i/80, x=xOf(v), y=yOf(diodeI(v)); f?(ctx.moveTo(x,y),f=false):ctx.lineTo(x,y);} ctx.stroke();
    ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(xOf(P.V),yOf(diodeI(P.V)),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('I',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('V',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 3: Richardson plot
  if(gCanvas[2]&&gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height; const PAD={t:14,b:18,l:28,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const xs=[1/3000,1/600];
    const f=t=>Math.log(A_R)-phi*e0/(kB*t), ymax=Math.log(A_R), ymin=f(600);
    const xOf=it=>PAD.l+(it-xs[0])/(xs[1]-xs[0])*gW, yOf=y=>PAD.t+gH-(y-ymin)/(ymax-ymin)*gH*0.95;
    ctx.strokeStyle=rgb(T.plus); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(xOf(xs[0]),yOf(f(3000))); ctx.lineTo(xOf(xs[1]),yOf(f(600))); ctx.stroke();
    ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(xOf(1/P.T),yOf(f(P.T)),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('ln(J/T²)',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('1/T',PAD.l+gW-2,PAD.t+gH-3);
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function matRadio(label,val,cb){ return Lab.RadioGroup({ label,
  options:Object.keys(MAT).map(k=>({value:k,label:MAT[k].name,hint:MAT[k].phi.toFixed(2)+' eV'})), value:val, onChange:cb }); }
function reControls(){ setTimeout(buildControls,0); }   // rebuild differito → il menù si aggiorna sul click
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Effetto'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Fenomeno', options:[{value:'volta',label:'Effetto Volta'},{value:'thermionic',label:'Effetto termoionico'}],
    value:P.mode, onChange(v){ if(v===P.mode)return; P.mode=v; setTitles(); initSim(); buildReadout(); reControls(); } }));
  if(P.mode==='volta'){
    const sa=Lab.Section('Metallo A'); cont.appendChild(sa.el); sa.add(matRadio('φ',P.matA,v=>{P.matA=v;}));
    const sb=Lab.Section('Metallo B'); cont.appendChild(sb.el); sb.add(matRadio('φ',P.matB,v=>{P.matB=v;}));
    const sc=Lab.Section('Catena'); cont.appendChild(sc.el);
    sc.add(Lab.Toggle({ label:'Terzo metallo (catena)', value:P.three, onChange(v){ P.three=v; initSim(); reControls(); } }));
    if(P.three) sc.add(matRadio('Metallo C — φ',P.matC,v=>{P.matC=v;}));
  } else {
    const sa=Lab.Section('Catodo (filamento)'); cont.appendChild(sa.el); sa.add(matRadio('φ',P.matA,v=>{P.matA=v;}));
    const st=Lab.Section('Parametri'); cont.appendChild(st.el);
    st.add(Lab.Slider({ label:'Temperatura T', min:300, max:3000, step:50, value:P.T, unit:' K', onChange(v){P.T=v;} }));
    st.add(Lab.Slider({ label:'Tensione anodo V', min:-2, max:3, step:0.05, value:P.V, unit:' V', onChange(v){P.V=v;} }));
  }
}

function buildReadout(){
  const el=document.getElementById('readout'); el.innerHTML='';
  const fields = P.mode==='volta'
    ? [{key:'pa',label:'φ_A'},{key:'pb',label:'φ_B'},{key:'pc',label:'φ_C'},{key:'v',label:'V estremi'},{key:'lo',label:'estremo +'},{key:'hi',label:'estremo −'}]
    : [{key:'phi',label:'φ catodo'},{key:'T',label:'Temperatura'},{key:'V',label:'Tensione'},{key:'J',label:'J saturazione'},{key:'I',label:'Corrente diodo'},{key:'note',label:'Stato'}];
  readout=new Lab.Readout(el, fields);
}

function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div');
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas'); cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d'); gTitle[i]=title;
  }
  setTitles();
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout();
  const simCanvas=document.getElementById('simCanvas');
  document.getElementById('btnMode').addEventListener('click',()=>{ P.mode=P.mode==='volta'?'thermionic':'volta'; setTitles(); initSim(); buildReadout(); buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.mode='volta'; P.matA='Na'; P.matB='Cu'; P.matC='Ca'; P.three=false; P.T=2000; P.V=1.0; P.paused=false;
    buildControls(); buildReadout(); setTitles(); initSim();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(220,Math.floor(ar.height-rb.height-gaH-4));
    simCanvas.style.width=Math.floor(ar.width)+'px'; simCanvas.style.height=h+'px';
    simCanvas.width=Math.floor(ar.width); simCanvas.height=h;
    if(P.mode==='volta') geomVolta(simCanvas.width,simCanvas.height); else geomTherm(simCanvas.width,simCanvas.height);
    if(P.mode==='volta' && !voltDots.length) initSim();
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
    try{
    step(dt); draw(simCanvas); drawGraphs();
    if(P.mode==='volta'){
      const l=metals();
      readout.set('pa', phiOf(P.matA).toFixed(2)+' eV'); readout.set('pb', phiOf(P.matB).toFixed(2)+' eV');
      readout.set('pc', P.three? phiOf(P.matC).toFixed(2)+' eV' : '—');
      readout.set('v', (Vtotal()>=0?'+':'')+Vtotal().toFixed(2)+' V');
      const lo = phiOf(l[0])<phiOf(l[l.length-1])? MAT[l[0]].name : MAT[l[l.length-1]].name;
      const hi = phiOf(l[0])<phiOf(l[l.length-1])? MAT[l[l.length-1]].name : MAT[l[0]].name;
      readout.set('lo', lo); readout.set('hi', hi);
    } else {
      readout.set('phi', phiOf(P.matA).toFixed(2)+' eV'); readout.set('T', P.T+' K'); readout.set('V', (P.V>=0?'+':'')+P.V.toFixed(2)+' V');
      readout.set('J', fmtJ(Jemit())); readout.set('I', fmtJ(diodeI(P.V)));
      readout.set('note', Jemit()<1e-3?'emissione trascurabile':(P.V<0?'frenante':'conduzione'));
    }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
