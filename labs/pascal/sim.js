'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  mode:'sfera',           // 'sfera' | 'martinetto' | 'botte'
  // sfera forata
  sfP:80,                 // pressione applicata (kPa)
  sfN:10,                 // numero di fori
  // martinetto idraulico
  mtF1:50,                // forza in ingresso (N)
  mtR1:2,                 // raggio pistone piccolo (cm)
  mtR2:8,                 // raggio pistone grande (cm)
  mtStroke:4,             // corsa del pistone piccolo (cm)
  // botte di Pascal
  btH:4,                  // altezza del tubo (m)
  btR:1.0,                // raggio del tubo (cm)
  btBurst:60,             // soglia di rottura (kPa)
  paused:false,
};
const RHO=1000, Gacc=9.81;     // acqua

let tAnim=0, last=0, sfWater=1;       // sfWater: frazione d'acqua nella sfera
let gCanvas=[null,null,null], gCtx=[null,null,null], gTitle=[null,null,null];
let readout, readoutKeys=[];

const TITLES={
  sfera:     ['Pressione ai fori','v = √(2P/ρ)','Trasmissione radiale'],
  martinetto:['F₂ vs rapporto A₂/A₁','Spostamenti  d₁ , d₂','Lavoro  W₁ = W₂'],
  botte:     ['p = ρ·g·h','Acqua nel tubo (mL)','Pressione vs soglia'],
};

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(225,238,250,0.96)':'rgba(20,40,70,0.95)',
    sub:   d?'rgba(165,195,220,0.82)':'rgba(60,90,125,0.9)',
    accent:d?'#00d4ff':'#0a78b0',
    glass: d?'rgba(200,218,238,0.78)':'rgba(80,110,150,0.72)',
    water: [70,140,235],
    oil:   [210,160,60],
    metal: d?[150,165,185]:[110,130,155],
    wood:  [150,95,55],
    press: [230,70,60],
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

// ═══ Helpers ══════════════════════════════════════════════════════════════════
function drawGrid(ctx,W,H){ ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();} }
function arrow(ctx,x1,y1,x2,y2,col,lw,lbl){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw||2.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1), s=6+(lw||2.5);
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-s*Math.cos(a-0.42),y2-s*Math.sin(a-0.42)); ctx.lineTo(x2-s*Math.cos(a+0.42),y2-s*Math.sin(a+0.42)); ctx.closePath(); ctx.fill();
  if(lbl){ ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(lbl,(x1+x2)/2,Math.min(y1,y2)-6); }
}
function dimV(ctx,x,ya,yb,col,label,labSide){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(x,ya); ctx.lineTo(x,yb);
  ctx.moveTo(x-4,ya); ctx.lineTo(x+4,ya); ctx.moveTo(x-4,yb); ctx.lineTo(x+4,yb); ctx.stroke();
  const side=labSide||-1;
  ctx.font='9px "Space Mono",monospace'; ctx.textAlign=side<0?'right':'left';
  ctx.fillText(label, x+side*6, (ya+yb)/2+3);    // etichetta orizzontale
}
function crackLine(ctx,x0,y0,x1,y1){          // crepa a zig-zag deterministica
  ctx.beginPath(); ctx.moveTo(x0,y0); const n=5;
  for(let i=1;i<=n;i++){ const tt=i/n, zz=(i%2?1:-1)*5; ctx.lineTo(x0+(x1-x0)*tt+zz, y0+(y1-y0)*tt); }
  ctx.stroke();
}
function header(ctx,t1,t2){
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText(t1,14,22);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.fillText(t2,14,38);
}

// ═══ Modalità 1 — Sfera forata ════════════════════════════════════════════════
function vEffSfera(){ return Math.sqrt(2*P.sfP*1000/RHO); }
function drawSfera(ctx,W,H){
  const cx=W*0.38, cy=H*0.52, R=Math.min(W,H)*0.15;
  const KV=18, GPX=9.81*KV;                          // scala visiva: i getti raggiungono i margini
  const lw=clamp(2+P.sfP/40,2,6.5);                  // maggiore portata → getto più spesso
  const N=P.sfN;
  const waterTop=cy+R-2*R*sfWater;                    // pelo libero interno (cala col tempo)
  const nw=R*0.46, joinY=cy-Math.sqrt(Math.max(0,R*R-(nw/2)*(nw/2))), neckTop=cy-R-R*0.95;
  const headM=3*sfWater;                              // testa idrostatica (uguale per tutti i fori, cala col livello)
  const vh=Math.sqrt(2*(P.sfP*1000 + RHO*Gacc*headM)/RHO);

  // ── sfera (vetro) + acqua interna che diminuisce ──
  ctx.fillStyle=rgba(T.water,0.06); ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
  if(sfWater>0.001){ ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.clip();
    ctx.fillStyle=rgba(T.water,0.5); ctx.fillRect(cx-R, waterTop, 2*R, (cy+R)-waterTop);
    ctx.strokeStyle=rgba(T.water,0.85); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(cx-R,waterTop); ctx.lineTo(cx+R,waterTop); ctx.stroke();
    ctx.restore(); }
  ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(cx-R*0.32,cy-R*0.3,R*0.3,0,Math.PI*2); ctx.fill();
  // bordo della sfera con APERTURA in corrispondenza dell'imboccatura
  const aR=Math.atan2(joinY-cy, nw/2), aL=Math.atan2(joinY-cy,-nw/2);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(cx,cy,R, aR, aL+Math.PI*2, false); ctx.stroke();

  // ── collo incastrato sull'apertura superiore ──
  ctx.fillStyle=rgba(T.metal,0.16); ctx.fillRect(cx-nw/2, neckTop, nw, joinY-neckTop);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cx-nw/2,joinY); ctx.lineTo(cx-nw/2,neckTop);
  ctx.moveTo(cx+nw/2,joinY); ctx.lineTo(cx+nw/2,neckTop); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-nw/2-5,joinY); ctx.lineTo(cx-nw/2,joinY); ctx.moveTo(cx+nw/2,joinY); ctx.lineTo(cx+nw/2+5,joinY); ctx.stroke();   // flangia
  // pistone proporzionale alla pressione (statico, lo regola l'utente)
  const ply=neckTop + (joinY-neckTop-16)*clamp(P.sfP/200,0,1);
  ctx.fillStyle=rgb(T.metal); ctx.fillRect(cx-nw/2, ply, nw, 12); ctx.fillRect(cx-4, ply-30, 8, 30);
  arrow(ctx, cx, ply-50, cx, ply-34, rgb(T.press), 3, 'F');

  // ── getti parabolici dai fori sommersi (gravità; raggiungono i margini) ──
  for(let i=0;i<N;i++){
    const ang=-Math.PI/2 + Math.PI*2*(i+0.5)/N;
    const c=Math.cos(ang), s=Math.sin(ang);
    const ox=cx+c*R, oy=cy+s*R;
    ctx.fillStyle=T.bg; ctx.beginPath(); ctx.arc(ox,oy,3,0,Math.PI*2); ctx.fill();   // foro
    if(sfWater<=0.001 || oy<waterTop-1) continue;                                    // sopra il pelo: niente getto
    const vx=c*vh*KV, vy=s*vh*KV;                                                     // stessa velocità da ogni foro
    ctx.strokeStyle=rgba(T.water,0.85); ctx.lineWidth=lw; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(ox,oy); let tend=0;
    for(let t=0.01;t<8;t+=0.02){ const xx=ox+vx*t, yy=oy+vy*t+0.5*GPX*t*t; ctx.lineTo(xx,yy); tend=t;
      if(xx<-4||xx>W+4||yy>H+4) break; }
    ctx.stroke();
    for(let k=0;k<4;k++){ const ph=((tAnim*0.7+k/4)%1)*tend; const xx=ox+vx*ph, yy=oy+vy*ph+0.5*GPX*ph*ph;
      if(xx<0||xx>W||yy>H) continue; ctx.fillStyle=rgba(T.water,0.95); ctx.beginPath(); ctx.arc(xx,yy,lw*0.72,0,Math.PI*2); ctx.fill(); }
  }

  header(ctx,'Sfera forata di Pascal:  p uguale in tutte le direzioni',
    'getti uguali in ogni direzione (anche verso l\'alto) · il livello cala e li accorcia · acqua: '+(sfWater*100).toFixed(0)+'%');
}

// ═══ Modalità 2 — Martinetto idraulico ════════════════════════════════════════
function mtCalc(){
  const A1=Math.PI*Math.pow(P.mtR1/100,2), A2=Math.PI*Math.pow(P.mtR2/100,2);
  const p=P.mtF1/A1, F2=p*A2;
  return {A1,A2,p,F2,gain:A2/A1};
}
function drawMartinetto(ctx,W,H){
  const {A1,A2,p,F2,gain}=mtCalc();
  const scale=6;                                       // px per cm
  const topY=H*0.30, baseY=H*0.74, chH=Math.max(14,H*0.05);
  const x1=W*0.34, x2=W*0.66;
  const w1=Math.max(14,P.mtR1*2*scale), w2=Math.max(22,P.mtR2*2*scale);
  const d1=P.mtStroke, d2=d1*(A1/A2);                  // spostamento impostato dall'utente
  const rest=topY+(baseY-topY)*0.42, ph=11;
  const ps1=clamp(rest+d1*scale, topY+18, baseY-6);    // pistone piccolo: lo abbassa l'utente
  const ps2=clamp(rest-d2*scale, topY+18, baseY-6);    // pistone grande: sale (poco)

  // ── fluido (entro le pareti) ──
  ctx.fillStyle=rgba(T.oil,0.5);
  ctx.fillRect(x1-w1/2, ps1, w1, baseY-ps1);                       // colonna piccola
  ctx.fillRect(x2-w2/2, ps2, w2, baseY-ps2);                       // colonna grande
  ctx.fillRect(x1-w1/2, baseY, (x2+w2/2)-(x1-w1/2), chH);          // canale di fondo

  // ── pareti: tubo a U con due diametri (cime aperte per i pistoni) ──
  ctx.strokeStyle=T.glass; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(x1-w1/2,topY); ctx.lineTo(x1-w1/2,baseY+chH); ctx.lineTo(x2+w2/2,baseY+chH); ctx.lineTo(x2+w2/2,topY);  // esterne + fondo
  ctx.moveTo(x1+w1/2,topY); ctx.lineTo(x1+w1/2,baseY); ctx.lineTo(x2-w2/2,baseY); ctx.lineTo(x2-w2/2,topY);          // interne + soffitto canale
  ctx.stroke();

  // ── livello di riposo + quote di spostamento delle piattaforme ──
  ctx.strokeStyle=T.sub; ctx.setLineDash([4,3]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x1-w1/2,rest); ctx.lineTo(x1+w1/2,rest);
  ctx.moveTo(x2-w2/2,rest); ctx.lineTo(x2+w2/2,rest); ctx.stroke(); ctx.setLineDash([]);
  dimV(ctx, x1-w1/2-16, rest, ps1, T.sub, 'd₁='+d1.toFixed(1)+' cm', -1);
  dimV(ctx, x2+w2/2+16, ps2, rest, T.sub, 'd₂='+d2.toFixed(2)+' cm', +1);

  // ── pistoni (larghi quanto il cilindro) ──
  ctx.fillStyle=rgb(T.metal);
  ctx.fillRect(x1-w1/2, ps1-ph, w1, ph); ctx.fillRect(x1-4, ps1-ph-22, 8, 22);   // piccolo + stelo
  ctx.fillRect(x2-w2/2, ps2-ph, w2, ph);
  const loadTop=ps2-ph-26; ctx.fillStyle=rgba(T.metal,0.85); ctx.fillRect(x2-w2*0.3, loadTop, w2*0.6, 26);   // carico

  // ── forze: lunghezza proporzionale al valore (contenuta nel cilindro), etichette FUORI dai cilindri ──
  const maxLen=64, fs=maxLen/Math.max(P.mtF1,F2,1);
  const l1=clamp(P.mtF1*fs, 14, Math.max(14, ps1-ph-12-topY));
  const l2=clamp(F2*fs,     14, Math.max(14, loadTop-12-topY));
  arrow(ctx, x1, ps1-ph-8-l1, x1, ps1-ph-8, rgb(T.press), 3);     // F₁ verso il basso sul pistone
  arrow(ctx, x2, loadTop-8, x2, loadTop-8-l2, T.accent, 3);       // F₂ verso l'alto (solleva il carico)
  ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillStyle=rgb(T.press); ctx.fillText('F₁ = '+P.mtF1.toFixed(0)+' N', x1, topY-9);   // sopra il cilindro
  ctx.fillStyle=T.accent;     ctx.fillText('F₂ = '+F2.toFixed(0)+' N', x2, topY-9);

  // ── aree (sotto la struttura) ──
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('A₁ = '+(A1*1e4).toFixed(1)+' cm²', x1, baseY+chH+16);
  ctx.fillText('A₂ = '+(A2*1e4).toFixed(1)+' cm²', x2, baseY+chH+16);

  header(ctx,'Martinetto idraulico:  p = F₁/A₁ = F₂/A₂',
    'F₂ = F₁·(A₂/A₁) = '+gain.toFixed(1)+'×F₁   ·   carico max ≈ '+(F2/Gacc).toFixed(1)+' kg   ·   p = '+(p/1000).toFixed(1)+' kPa');
}

// ═══ Modalità 3 — Botte di Pascal ═════════════════════════════════════════════
function btCalc(){
  const Hb=0.9;                                     // altezza botte (m)
  const p=RHO*Gacc*(P.btH+Hb);                      // pressione (gauge) alla base
  const vol=Math.PI*Math.pow(P.btR/100,2)*P.btH*1e6;// mL nel tubo
  return {Hb,p,vol,burst:p>P.btBurst*1000};
}
function drawBotte(ctx,W,H){
  const {Hb,p,vol,burst}=btCalc();
  const topY=H*0.07, groundY=H*0.88, cx=W*0.46;
  const bh=clamp(0.42*(groundY-topY),130,210), bw=clamp(bh*0.82,90,W*0.34), by0=groundY-bh;   // botte FISSA, più alta che larga
  const halfAt=f=> bw/2*(0.80+0.20*Math.sin(Math.PI*clamp(f,0,1)));   // pancia centrale
  const yAt=f=> by0 + clamp(f,0,1)*bh;
  const availTube=by0-topY-6, pxTube=availTube/10;                    // il tubo si allunga SENZA schiacciare la botte
  const th=clamp(P.btH*pxTube, 8, availTube), tw=clamp(P.btR*2*5,6,30), tx=cx, tyTop=by0-th;

  // ── acqua interna ──
  ctx.save(); ctx.beginPath();
  ctx.moveTo(cx-halfAt(0),by0);
  for(let f=0;f<=1.0001;f+=0.1) ctx.lineTo(cx-halfAt(f),yAt(f));
  for(let f=1;f>=-0.0001;f-=0.1) ctx.lineTo(cx+halfAt(f),yAt(f));
  ctx.closePath(); ctx.clip();
  const wg=ctx.createLinearGradient(0,by0,0,groundY); wg.addColorStop(0,rgba(T.water,0.42)); wg.addColorStop(1,rgba([40,95,180],0.6));
  ctx.fillStyle=wg; ctx.fillRect(cx-bw,by0-2,2*bw,bh+4); ctx.restore();

  // ── doghe ──
  ctx.strokeStyle=rgba(T.wood,0.5); ctx.lineWidth=1.4;
  for(let k=-3;k<=3;k++){ const fx=k/3.6; ctx.beginPath();
    for(let f=0;f<=1.0001;f+=0.1){ const x=cx+fx*halfAt(f), y=yAt(f); f===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke(); }
  // ── profilo ──
  ctx.strokeStyle=rgb(T.wood); ctx.lineWidth=3; ctx.lineJoin='round'; ctx.beginPath();
  for(let f=0;f<=1.0001;f+=0.05){ const x=cx-halfAt(f), y=yAt(f); f===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
  for(let f=1;f>=-0.0001;f-=0.05){ ctx.lineTo(cx+halfAt(f),yAt(f)); } ctx.closePath(); ctx.stroke();
  // ── cerchiature ──
  ctx.strokeStyle=rgba(T.metal,0.95); ctx.lineWidth=5;
  for(const f of [0.07,0.5,0.93]){ const hw=halfAt(f), y=yAt(f); ctx.beginPath(); ctx.moveTo(cx-hw-2,y); ctx.lineTo(cx+hw+2,y); ctx.stroke(); }

  // ── tubo di vetro (gradiente, riflesso, imbuto, menisco) incastrato nel coperchio ──
  const tg=ctx.createLinearGradient(tx-tw/2,0,tx+tw/2,0);
  tg.addColorStop(0,rgba([40,95,180],0.75)); tg.addColorStop(0.45,rgba(T.water,0.6)); tg.addColorStop(1,rgba([40,95,180],0.7));
  ctx.fillStyle=tg; ctx.fillRect(tx-tw/2, tyTop, tw, (by0+3)-tyTop);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(tx-tw/2,tyTop); ctx.lineTo(tx-tw/2,by0+3); ctx.moveTo(tx+tw/2,tyTop); ctx.lineTo(tx+tw/2,by0+3); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(tx-tw/2+2,tyTop+5); ctx.lineTo(tx-tw/2+2,by0); ctx.stroke();
  ctx.fillStyle=rgba(T.water,0.5); ctx.beginPath(); ctx.moveTo(tx-tw/2-9,tyTop-10); ctx.lineTo(tx+tw/2+9,tyTop-10); ctx.lineTo(tx+tw/2,tyTop); ctx.lineTo(tx-tw/2,tyTop); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=T.glass; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(tx-tw/2-9,tyTop-10); ctx.lineTo(tx-tw/2,tyTop); ctx.moveTo(tx+tw/2+9,tyTop-10); ctx.lineTo(tx+tw/2,tyTop); ctx.stroke();
  ctx.strokeStyle=rgba(T.water,0.9); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(tx-tw/2,tyTop+1); ctx.lineTo(tx+tw/2,tyTop+1); ctx.stroke();
  // ── coperchio ──
  ctx.fillStyle=rgb(T.wood); ctx.beginPath(); ctx.ellipse(cx,by0,halfAt(0),7,0,0,Math.PI*2); ctx.fill();

  // quota altezza colonna
  ctx.strokeStyle=rgba(T.press,0.5); ctx.setLineDash([4,3]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(tx+tw/2+9, tyTop); ctx.lineTo(tx+tw/2+38, tyTop);
  ctx.moveTo(cx+halfAt(0.5), groundY); ctx.lineTo(tx+tw/2+38, groundY); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(tx+tw/2+30,(tyTop+groundY)/2); ctx.rotate(-Math.PI/2);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('h = '+(P.btH+Hb).toFixed(2)+' m',0,0); ctx.restore();

  // ── rottura migliorata: getti potenti, crepe, pozza ──
  if(burst){
    const over=clamp(p/(P.btBurst*1000),1,2.4);
    for(let i=0;i<6;i++){ const f=0.30+0.45*(i/5), side=i%2?1:-1, ex=cx+side*halfAt(f), ey=yAt(f), vx=side*(7+5*over);
      ctx.strokeStyle=rgba(T.water,0.8); ctx.lineWidth=3+over*0.8; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(ex,ey);
      for(let t=0.02;t<2.4;t+=0.04){ const xx=ex+vx*26*t, yy=ey-8*t+0.5*150*t*t; ctx.lineTo(xx,yy); if(yy>H||xx<0||xx>W)break; } ctx.stroke();
      const ph=((tAnim*0.9+i/6)%1)*2.0, gx=ex+vx*26*ph, gy=ey-8*ph+0.5*150*ph*ph;
      if(gx>0&&gx<W&&gy<H){ ctx.fillStyle=rgba(T.water,0.92); ctx.beginPath(); ctx.arc(gx,gy,2.6,0,Math.PI*2); ctx.fill(); }
    }
    ctx.strokeStyle=rgb(T.press); ctx.lineWidth=2;
    crackLine(ctx, cx-halfAt(0.5)*0.25, yAt(0.22), cx-halfAt(0.75), yAt(0.8));
    crackLine(ctx, cx+halfAt(0.4)*0.35, yAt(0.28), cx+halfAt(0.7), yAt(0.82));
    ctx.fillStyle=rgba(T.water,0.28); ctx.beginPath(); ctx.ellipse(cx,groundY+5,bw*0.85,7,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=rgb(T.press); ctx.font='bold 13px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('💥 LA BOTTE SI ROMPE!', cx, groundY+24);
  }

  header(ctx,'Botte di Pascal (1646):  p = ρ·g·h',
    'p alla base = '+(p/1000).toFixed(1)+' kPa  ·  soglia '+P.btBurst+' kPa  ·  acqua nel tubo solo '+vol.toFixed(0)+' mL');
}

// ═══ Draw ═════════════════════════════════════════════════════════════════════
function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  if(P.mode==='sfera') drawSfera(ctx,W,H);
  else if(P.mode==='martinetto') drawMartinetto(ctx,W,H);
  else drawBotte(ctx,W,H);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
function bars(ctx,W,H,vals,cols,labels){
  const PAD={t:16,b:18,l:10,r:8}; const {gW,gH}=gBase(ctx,W,H,PAD);
  const max=Math.max(...vals,1e-6), n=vals.length, bw=gW/n*0.55;
  vals.forEach((v,i)=>{ const cx=PAD.l+gW*(i+0.5)/n, bh=clamp(v/max,0,1)*gH*0.82;
    ctx.fillStyle=cols[i]; ctx.fillRect(cx-bw/2,PAD.t+gH-bh,bw,bh);
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(labels[i],cx,PAD.t+gH+9);
  });
}
function drawGraphs(){
  for(let i=0;i<3;i++) if(gTitle[i]) gTitle[i].textContent=TITLES[P.mode][i];
  if(P.mode==='sfera'){
    // 1: pressione ai fori (tutte uguali)
    if(gCanvas[0].width){ const N=Math.min(P.sfN,10), v=Array.from({length:N},()=>P.sfP);
      bars(gCtx[0],gCanvas[0].width,gCanvas[0].height,v,v.map(()=>rgb(T.water)),v.map((_,i)=>i+1+'')); }
    // 2: v(P)
    if(gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:14,b:16,l:24,r:8};
      const {gW,gH}=gBase(ctx,W,H,PAD); const Pmax=200, vmax=Math.sqrt(2*Pmax*1000/RHO);
      const xOf=pp=>PAD.l+pp/Pmax*gW, yOf=vv=>PAD.t+gH-clamp(vv/vmax,0,1)*gH*0.9;
      ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); let f=true;
      for(let pp=0;pp<=Pmax;pp+=Pmax/60){ const x=xOf(pp),y=yOf(Math.sqrt(2*pp*1000/RHO)); f?(ctx.moveTo(x,y),f=false):ctx.lineTo(x,y);} ctx.stroke();
      ctx.fillStyle=rgb(T.water); ctx.beginPath(); ctx.arc(xOf(P.sfP),yOf(vEffSfera()),3.4,0,7); ctx.fill();
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('v',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('p',PAD.l+gW-2,PAD.t+gH-3); }
    // 3: rosa di trasmissione radiale
    if(gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height; gBase(ctx,W,H,{t:12,b:12,l:12,r:12});
      const cx=W/2, cy=H/2+2, r=Math.min(W,H)*0.16, N=P.sfN;
      ctx.strokeStyle=rgb(T.water); ctx.lineWidth=1.4;
      for(let i=0;i<N;i++){ const a=Math.PI*2*i/N; arrow(ctx,cx+Math.cos(a)*r,cy+Math.sin(a)*r,cx+Math.cos(a)*r*2.1,cy+Math.sin(a)*r*2.1,rgb(T.water),1.4); }
      ctx.fillStyle=rgba(T.water,0.4); ctx.beginPath(); ctx.arc(cx,cy,r*0.7,0,7); ctx.fill(); }
  }
  else if(P.mode==='martinetto'){
    const {A1,A2,F2,gain}=mtCalc();
    // 1: F2 vs rapporto
    if(gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:16,l:28,r:8};
      const {gW,gH}=gBase(ctx,W,H,PAD); const rmax=40, F2max=P.mtF1*rmax;
      const xOf=r=>PAD.l+r/rmax*gW, yOf=ff=>PAD.t+gH-clamp(ff/F2max,0,1)*gH*0.9;
      ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath();
      for(let r=0;r<=rmax;r+=rmax/60){ const x=xOf(r),y=yOf(P.mtF1*r); r===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke();
      ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(xOf(gain),yOf(F2),3.4,0,7); ctx.fill();
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('F₂',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('A₂/A₁',PAD.l+gW-2,PAD.t+gH-3); }
    // 2: spostamenti d1,d2
    if(gCanvas[1].width){ const d1=P.mtStroke, d2=P.mtStroke*(A1/A2);
      bars(gCtx[1],gCanvas[1].width,gCanvas[1].height,[d1,d2],[rgb(T.press),T.accent],['d₁','d₂']); }
    // 3: lavoro W1=W2
    if(gCanvas[2].width){ const W1=P.mtF1*(P.mtStroke/100), W2=F2*((P.mtStroke*(A1/A2))/100);
      bars(gCtx[2],gCanvas[2].width,gCanvas[2].height,[W1,W2],[rgb(T.press),T.accent],['W₁','W₂']); }
  }
  else {
    const {Hb,p}=btCalc();
    // 1: p = ρgh con soglia
    if(gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:16,l:28,r:8};
      const {gW,gH}=gBase(ctx,W,H,PAD); const hmax=10+Hb, pmax=RHO*Gacc*hmax/1000;
      const xOf=h=>PAD.l+h/hmax*gW, yOf=pk=>PAD.t+gH-clamp(pk/pmax,0,1)*gH*0.9;
      ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath();
      for(let h=0;h<=hmax;h+=hmax/60){ const x=xOf(h),y=yOf(RHO*Gacc*h/1000); h===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke();
      // soglia
      ctx.strokeStyle=rgba(T.press,0.7); ctx.setLineDash([3,3]); ctx.lineWidth=1; const ys=yOf(P.btBurst);
      ctx.beginPath(); ctx.moveTo(PAD.l,ys); ctx.lineTo(PAD.l+gW,ys); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle=rgb(p>P.btBurst*1000?T.press:T.water); ctx.beginPath(); ctx.arc(xOf(P.btH+Hb),yOf(p/1000),3.4,0,7); ctx.fill();
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('p',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('h',PAD.l+gW-2,PAD.t+gH-3); }
    // 2: volume nel tubo vs h
    if(gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:14,b:16,l:30,r:8};
      const {gW,gH}=gBase(ctx,W,H,PAD); const hmax=10, vmax=Math.PI*Math.pow(P.btR/100,2)*hmax*1e6;
      const xOf=h=>PAD.l+h/hmax*gW, yOf=vv=>PAD.t+gH-clamp(vv/Math.max(vmax,1e-6),0,1)*gH*0.9;
      ctx.strokeStyle=rgb(T.water); ctx.lineWidth=1.6; ctx.beginPath();
      for(let h=0;h<=hmax;h+=hmax/60){ const x=xOf(h),y=yOf(Math.PI*Math.pow(P.btR/100,2)*h*1e6); h===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke();
      ctx.fillStyle=rgb(T.water); ctx.beginPath(); ctx.arc(xOf(P.btH),yOf(Math.PI*Math.pow(P.btR/100,2)*P.btH*1e6),3.4,0,7); ctx.fill();
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('mL',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('h',PAD.l+gW-2,PAD.t+gH-3); }
    // 3: pressione vs soglia
    if(gCanvas[2].width){ bars(gCtx[2],gCanvas[2].width,gCanvas[2].height,[p/1000,P.btBurst],[rgb(p>P.btBurst*1000?T.press:T.water),rgb(T.press)],['p','soglia']); }
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(()=>{ buildControls(); buildReadout(); },0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Modalità'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Apparecchio', value:P.mode, options:[
    {value:'sfera',label:'Sfera forata'},
    {value:'martinetto',label:'Martinetto idraulico'},
    {value:'botte',label:'Botte di Pascal'},
  ], onChange(v){ P.mode=v; reControls(); } }));

  if(P.mode==='sfera'){
    const s=Lab.Section('Sfera forata'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Pressione applicata', min:0, max:200, step:5, value:P.sfP, unit:' kPa', onChange(v){P.sfP=v; sfWater=1;} }));
    s.add(Lab.Slider({ label:'Numero di fori', min:4, max:16, step:1, value:P.sfN, unit:'', onChange(v){P.sfN=v;} }));
  } else if(P.mode==='martinetto'){
    const s=Lab.Section('Martinetto idraulico'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Forza in ingresso F₁', min:5, max:200, step:5, value:P.mtF1, unit:' N', onChange(v){P.mtF1=v;} }));
    s.add(Lab.Slider({ label:'Raggio pistone piccolo', min:1, max:5, step:0.5, value:P.mtR1, unit:' cm', onChange(v){P.mtR1=v;} }));
    s.add(Lab.Slider({ label:'Raggio pistone grande', min:4, max:14, step:0.5, value:P.mtR2, unit:' cm', onChange(v){P.mtR2=v;} }));
    s.add(Lab.Slider({ label:'Spostamento pistone piccolo d₁', min:0, max:8, step:0.5, value:P.mtStroke, unit:' cm', onChange(v){P.mtStroke=v;} }));
  } else {
    const s=Lab.Section('Botte di Pascal'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Altezza del tubo', min:0.5, max:10, step:0.1, value:P.btH, unit:' m', onChange(v){P.btH=v;} }));
    s.add(Lab.Slider({ label:'Raggio del tubo', min:0.2, max:3, step:0.1, value:P.btR, unit:' cm', onChange(v){P.btR=v;} }));
    s.add(Lab.Slider({ label:'Soglia di rottura', min:20, max:120, step:5, value:P.btBurst, unit:' kPa', onChange(v){P.btBurst=v;} }));
  }
}

function buildReadout(){
  const cont=document.getElementById('readout'); cont.innerHTML='';
  let fields;
  if(P.mode==='sfera') fields=[{key:'p',label:'Pressione applicata'},{key:'v',label:'v efflusso'},{key:'n',label:'Numero fori'},{key:'w',label:'Acqua nella sfera'}];
  else if(P.mode==='martinetto') fields=[{key:'P',label:'Pressione fluido'},{key:'F2',label:'Forza in uscita F₂'},{key:'gain',label:'Guadagno F₂/F₁'},{key:'disp',label:'Spostamenti d₁ → d₂'}];
  else fields=[{key:'h',label:'Altezza colonna'},{key:'pb',label:'Pressione alla base'},{key:'vol',label:'Acqua nel tubo'},{key:'st',label:'Stato botte'}];
  readout=new Lab.Readout(cont,fields); readoutKeys=fields.map(f=>f.key);
}

function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div'); title.textContent=TITLES[P.mode][i];
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas'); cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d'); gTitle[i]=title;
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout();
  const simCanvas=document.getElementById('simCanvas');

  const btnPlay=document.getElementById('btnPlay');
  function syncPlay(){ btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click',()=>{ P.paused=!P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.mode='sfera'; P.sfP=80; P.sfN=10; P.mtF1=50; P.mtR1=2; P.mtR2=8; P.mtStroke=4;
    P.btH=4; P.btR=1.0; P.btBurst=60; P.paused=false; sfWater=1;
    buildControls(); buildReadout(); syncPlay();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(240,Math.floor(ar.height-rb.height-gaH-4));
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
    if(!P.paused){ tAnim+=dt;
      if(P.mode==='sfera' && sfWater>0) sfWater=clamp(sfWater - clamp(vEffSfera()*0.006,0,0.4)*dt, 0, 1);   // l'acqua cala col tempo
    }
    try{
      draw(simCanvas); drawGraphs();
      if(P.mode==='sfera'){
        readout.set('p', P.sfP.toFixed(0)+' kPa'); readout.set('v', vEffSfera().toFixed(1)+' m/s');
        readout.set('n', String(P.sfN)); readout.set('w', (sfWater*100).toFixed(0)+'%');
      } else if(P.mode==='martinetto'){
        const {A1,A2,p,F2,gain}=mtCalc(); const d2=P.mtStroke*(A1/A2);
        readout.set('P',(p/1000).toFixed(1)+' kPa'); readout.set('F2',F2.toFixed(0)+' N');
        readout.set('gain',gain.toFixed(1)+'×'); readout.set('disp',P.mtStroke.toFixed(1)+' → '+d2.toFixed(2)+' cm');
      } else {
        const {p,vol,burst}=btCalc();
        readout.set('h',(P.btH+0.9).toFixed(2)+' m'); readout.set('pb',(p/1000).toFixed(1)+' kPa');
        readout.set('vol',vol.toFixed(0)+' mL'); readout.set('st', burst?'ROTTA 💥':'integra');
      }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
