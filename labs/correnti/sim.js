'use strict';

/* ── Canvas refs ─────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const gc   = document.getElementById('graphCanvas');
const ctx  = sc.getContext('2d');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Source types ────────────────────────────────────────────────────────── */
// All sources use z as symmetry axis.
// Cross-section plane shown:
//   wire/toroid  → xy plane (z=0)
//   loop/square/solenoid → xz plane (y=0)
const SOURCES = [
  { id: 'wire',     label: 'Filo Infinito',   plane: 'xy' },
  { id: 'loop',     label: 'Spira Circolare', plane: 'xz' },
  { id: 'square',   label: 'Spira Quadrata',  plane: 'xz' },
  { id: 'solenoid', label: 'Solenoide',       plane: 'xz' },
  { id: 'toroid',   label: 'Toroide',         plane: 'xy' },
];

/* ── Parameters ──────────────────────────────────────────────────────────── */
const P = {
  srcIdx: 1,    // default: circular loop
  I:      1.0,
  R:      1.5,
  a:      1.0,
  N:      5,
  L:      3.0,
  mu_r:   1.0,
  showLines: true,
  nLines:    12,
};

/* ── View ────────────────────────────────────────────────────────────────── */
const VIEW  = 5.0;
const PSIZE = 5.5;   // cross-section plane half-size
let scale = 1, zoom = 1, panX = 0, panY = 0;
let rot3X = 0.32, rot3Y = 0.40;

let rot3Dragging = false, rot3SX = 0, rot3SY = 0, rot3OX = 0, rot3OY = 0;
let panDragging  = false, panSX = 0, panSY = 0, panOX = 0, panOY = 0;

/* ── Segment cache ───────────────────────────────────────────────────────── */
let segCache = [];  // [mx,my,mz, lx,ly,lz] where l = half-length vector

function addCircle(cx, cy, cz, R, nx, ny, nz, Nseg) {
  let tx, ty, tz;
  if (Math.abs(nx) < 0.9) { tx = 0; ty = -nz; tz = ny; }
  else                     { tx = nz; ty = 0;  tz = -nx; }
  const tl = Math.hypot(tx, ty, tz);
  tx /= tl; ty /= tl; tz /= tl;
  const ux = ny*tz - nz*ty, uy = nz*tx - nx*tz, uz = nx*ty - ny*tx;
  const dth = 2 * Math.PI / Nseg;
  for (let i = 0; i < Nseg; i++) {
    const a0 = i * dth, a1 = a0 + dth;
    const p0x = cx + R*(Math.cos(a0)*tx + Math.sin(a0)*ux);
    const p0y = cy + R*(Math.cos(a0)*ty + Math.sin(a0)*uy);
    const p0z = cz + R*(Math.cos(a0)*tz + Math.sin(a0)*uz);
    const p1x = cx + R*(Math.cos(a1)*tx + Math.sin(a1)*ux);
    const p1y = cy + R*(Math.cos(a1)*ty + Math.sin(a1)*uy);
    const p1z = cz + R*(Math.cos(a1)*tz + Math.sin(a1)*uz);
    segCache.push([(p0x+p1x)/2,(p0y+p1y)/2,(p0z+p1z)/2,
                   (p1x-p0x)/2,(p1y-p0y)/2,(p1z-p0z)/2]);
  }
}

function addSquare(cx, cy, cz, a, nx, ny, nz, Nseg) {
  let tx, ty, tz;
  if (Math.abs(nx) < 0.9) { tx = 0; ty = -nz; tz = ny; }
  else                     { tx = nz; ty = 0;  tz = -nx; }
  const tl = Math.hypot(tx, ty, tz);
  tx /= tl; ty /= tl; tz /= tl;
  const ux = ny*tz - nz*ty, uy = nz*tx - nx*tz, uz = nx*ty - ny*tx;
  const corners = [
    [cx+a*tx+a*ux, cy+a*ty+a*uy, cz+a*tz+a*uz],
    [cx-a*tx+a*ux, cy-a*ty+a*uy, cz-a*tz+a*uz],
    [cx-a*tx-a*ux, cy-a*ty-a*uy, cz-a*tz-a*uz],
    [cx+a*tx-a*ux, cy+a*ty-a*uy, cz+a*tz-a*uz],
  ];
  const sps = Math.max(4, Math.round(Nseg / 4));
  for (let s = 0; s < 4; s++) {
    const [x0,y0,z0] = corners[s], [x1,y1,z1] = corners[(s+1)%4];
    for (let k = 0; k < sps; k++) {
      const f0=k/sps, f1=(k+1)/sps;
      const p0x=x0+(x1-x0)*f0, p0y=y0+(y1-y0)*f0, p0z=z0+(z1-z0)*f0;
      const p1x=x0+(x1-x0)*f1, p1y=y0+(y1-y0)*f1, p1z=z0+(z1-z0)*f1;
      segCache.push([(p0x+p1x)/2,(p0y+p1y)/2,(p0z+p1z)/2,
                     (p1x-p0x)/2,(p1y-p0y)/2,(p1z-p0z)/2]);
    }
  }
}

function buildSegments() {
  segCache = [];
  const src = SOURCES[P.srcIdx].id;
  if (src === 'wire') return;
  if (src === 'loop') {
    addCircle(0,0,0, P.R, 0,0,1, 48);
  } else if (src === 'square') {
    addSquare(0,0,0, P.a, 0,0,1, 40);
  } else if (src === 'solenoid') {
    const N = Math.round(P.N);
    for (let i = 0; i < N; i++) {
      const z = -P.L/2 + P.L*(i+0.5)/N;
      addCircle(0,0,z, P.R, 0,0,1, 32);
    }
  } else if (src === 'toroid') {
    const N = Math.round(P.N);
    for (let i = 0; i < N; i++) {
      const phi = 2*Math.PI*i/N;
      // normal of each small loop = φ-direction = (-sinφ, cosφ, 0)
      addCircle(P.R*Math.cos(phi), P.R*Math.sin(phi), 0, P.a,
                -Math.sin(phi), Math.cos(phi), 0, 20);
    }
  }
}

/* ── Biot-Savart ─────────────────────────────────────────────────────────── */
function bField3D(px, py, pz) {
  if (SOURCES[P.srcIdx].id === 'wire') {
    const r2 = px*px + py*py;
    if (r2 < 1e-6) return [0,0,0];
    const f = P.mu_r * P.I / (2 * Math.PI * r2);
    return [-f*py, f*px, 0];
  }
  let bx=0, by=0, bz=0;
  for (const [mx,my,mz,lx,ly,lz] of segCache) {
    const rx=px-mx, ry=py-my, rz=pz-mz;
    const r2=rx*rx+ry*ry+rz*rz;
    if (r2 < 1e-6) continue;
    const r3=r2*Math.sqrt(r2);
    bx += 2*(ly*rz - lz*ry)/r3;
    by += 2*(lz*rx - lx*rz)/r3;
    bz += 2*(lx*ry - ly*rx)/r3;
  }
  return [bx*P.mu_r*P.I, by*P.mu_r*P.I, bz*P.mu_r*P.I];
}

/* ── Green color map ─────────────────────────────────────────────────────── */
function lerpStops(S, t) {
  for (let i = 1; i < S.length; i++) {
    if (t <= S[i][0] || i === S.length-1) {
      const [t0,c0]= S[i-1], [t1,c1]= S[i];
      const f = Math.max(0, Math.min(1, (t-t0)/(t1-t0)));
      return [c0[0]+(c1[0]-c0[0])*f|0, c0[1]+(c1[1]-c0[1])*f|0, c0[2]+(c1[2]-c0[2])*f|0];
    }
  }
}

function bToRGB(bm, dark) {
  const t = Math.min(1, Math.pow(Math.max(0, bm) * 0.25, 0.28));
  if (dark) return lerpStops([
    [0.00,[  3,  6,  3]],[0.12,[  5, 20,  9]],[0.28,[ 10, 55, 26]],
    [0.45,[  6,108, 58]],[0.62,[  0,162,108]],[0.80,[  0,210,160]],[1.00,[ 45,255,202]],
  ], t);
  return lerpStops([
    [0.00,[238,248,244]],[0.35,[170,232,212]],[0.65,[ 20,170,135]],[1.00,[  0, 95, 72]],
  ], t);
}

/* ── Cache ───────────────────────────────────────────────────────────────── */
let planeCache   = null;
let linesCache3D = null;

function physKey() {
  return `${P.srcIdx}|${P.I}|${P.R}|${P.a}|${P.N}|${P.L}|${P.mu_r}`;
}

function invalidateAll() { planeCache = null; linesCache3D = null; }

/* ── Plane heatmap ───────────────────────────────────────────────────────── */
const PLANE_RES = 40;

function ensurePlane() {
  const key = physKey() + '|' + dk();
  if (planeCache && planeCache.key === key) return;

  const src = SOURCES[P.srcIdx];
  const isXY = src.plane === 'xy';
  const dark = dk();
  const RES = PLANE_RES;
  const colors = new Uint8ClampedArray(RES * RES * 3);

  for (let iv = 0; iv < RES; iv++) {
    for (let iu = 0; iu < RES; iu++) {
      const u = -PSIZE + 2*PSIZE*iu/(RES-1);
      const v = -PSIZE + 2*PSIZE*iv/(RES-1);
      const [bx,by,bz] = isXY ? bField3D(u,v,0) : bField3D(u,0,v);
      const [r,g,b] = bToRGB(Math.hypot(bx,by,bz), dark);
      const i = (iv*RES+iu)*3;
      colors[i]=r; colors[i+1]=g; colors[i+2]=b;
    }
  }
  planeCache = { colors, key, isXY };
}

/* ── 3D projection ───────────────────────────────────────────────────────── */
function project3D(x, y, z) {
  const cy=Math.cos(rot3Y), sy=Math.sin(rot3Y);
  const cx=Math.cos(rot3X), sx=Math.sin(rot3X);
  const x1 = x*cy + z*sy;
  const z1 =-x*sy + z*cy;
  const y1 = y*cx - z1*sx;
  const z2 = y*sx + z1*cx;
  return [SW/2+panX+x1*scale, SH/2+panY-y1*scale, z2];
}

/* ── Draw heatmap plane as grid of colored quads ────────────────────────── */
function drawHeatmapPlane() {
  ensurePlane();
  const { colors, isXY } = planeCache;
  const RES = PLANE_RES;
  for (let iv = 0; iv < RES-1; iv++) {
    for (let iu = 0; iu < RES-1; iu++) {
      const u0 = -PSIZE + 2*PSIZE*iu/(RES-1);
      const u1 = -PSIZE + 2*PSIZE*(iu+1)/(RES-1);
      const v0 = -PSIZE + 2*PSIZE*iv/(RES-1);
      const v1 = -PSIZE + 2*PSIZE*(iv+1)/(RES-1);
      // center cell color
      const ci = (iv*RES+iu)*3;
      ctx.fillStyle = `rgb(${colors[ci]},${colors[ci+1]},${colors[ci+2]})`;
      let p00,p10,p01,p11;
      if (isXY) {
        p00=project3D(u0,v0,0); p10=project3D(u1,v0,0);
        p01=project3D(u0,v1,0); p11=project3D(u1,v1,0);
      } else {
        p00=project3D(u0,0,v0); p10=project3D(u1,0,v0);
        p01=project3D(u0,0,v1); p11=project3D(u1,0,v1);
      }
      ctx.beginPath();
      ctx.moveTo(p00[0],p00[1]);
      ctx.lineTo(p10[0],p10[1]);
      ctx.lineTo(p11[0],p11[1]);
      ctx.lineTo(p01[0],p01[1]);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Plane border
  const dark = dk();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  const corners = isXY
    ? [[-PSIZE,-PSIZE,0],[PSIZE,-PSIZE,0],[PSIZE,PSIZE,0],[-PSIZE,PSIZE,0]]
    : [[-PSIZE,0,-PSIZE],[PSIZE,0,-PSIZE],[PSIZE,0,PSIZE],[-PSIZE,0,PSIZE]];
  ctx.beginPath();
  corners.forEach((c,i) => {
    const [sx,sy] = project3D(...c);
    i===0 ? ctx.moveTo(sx,sy) : ctx.lineTo(sx,sy);
  });
  ctx.closePath(); ctx.stroke();
}

/* ── 3D field line tracing ───────────────────────────────────────────────── */
function traceLine3D(x0, y0, z0, dir) {
  let x=x0, y=y0, z=z0;
  const pts = [[x,y,z]];
  const ds=0.030, capR=0.22, bound=VIEW*3.5;
  let closeCount=0, escaped=false;
  for (let i=0; i<2500; i++) {
    const [bx,by,bz] = bField3D(x,y,z);
    const bm = Math.hypot(bx,by,bz);
    if (bm < 1e-10) break;
    x += dir*bx/bm*ds;
    y += dir*by/bm*ds;
    z += dir*bz/bm*ds;
    if (Math.max(Math.abs(x),Math.abs(y),Math.abs(z)) > bound) { escaped=true; pts.push([x,y,z]); break; }
    if (i > 50 && Math.hypot(x-x0,y-y0,z-z0) < capR) { closeCount++; if (closeCount>2) break; }
    pts.push([x,y,z]);
  }
  return { pts, escaped };
}

function ensureLines3D() {
  const key = physKey() + '|' + P.nLines;
  if (linesCache3D && linesCache3D.key === key) return;
  const lines = [];
  const src = SOURCES[P.srcIdx].id;
  const n = P.nLines;
  const PI2 = 2*Math.PI;

  if (src === 'wire') {
    // Field lines ARE perfect circles — generate analytically
    const nR = Math.ceil(n * 0.6), nZ = 3;
    for (let ir = 0; ir < nR; ir++) {
      const r = 0.6 + ir * (PSIZE*0.85/nR);
      for (let iz = 0; iz < nZ; iz++) {
        const z = (iz - (nZ-1)/2) * 1.8;
        const pts = [];
        for (let k=0; k<=60; k++) {
          const phi = PI2*k/60;
          pts.push([r*Math.cos(phi), r*Math.sin(phi), z]);
        }
        lines.push(pts);
      }
    }
  } else if (src === 'loop' || src === 'square') {
    const R = src==='loop' ? P.R : P.a;
    // On-axis seeds (above center)
    for (let i=0; i<Math.ceil(n*0.3); i++) {
      const v0 = 0.12 + i*0.35;
      const { pts: p1 } = traceLine3D(0, 0, v0, 1);
      const { pts: p2 } = traceLine3D(0, 0,-v0,-1);
      if (p1.length>3) lines.push(p1);
      if (p2.length>3) lines.push(p2);
    }
    // Seeds near the conductor perimeter
    for (let i=0; i<n; i++) {
      const phi = PI2*i/n;
      const cr = 1.12 * R;
      const { pts } = traceLine3D(cr*Math.cos(phi), cr*Math.sin(phi), 0.08, 1);
      if (pts.length>3) lines.push(pts);
    }
  } else if (src === 'solenoid') {
    // Outside sides
    for (let i=0; i<n; i++) {
      const phi = PI2*i/n;
      const cr = P.R * 1.12;
      const z0 = -P.L/2 + P.L*(i+0.5)/n;
      const { pts } = traceLine3D(cr*Math.cos(phi), cr*Math.sin(phi), z0, 1);
      if (pts.length>3) lines.push(pts);
    }
    // Through the ends (internal lines)
    const nEnd = Math.ceil(n*0.5);
    for (let i=0; i<nEnd; i++) {
      const phi = PI2*i/nEnd;
      const r = P.R * (0.2 + 0.6*i/nEnd);
      const { pts: pTop } = traceLine3D(r*Math.cos(phi), r*Math.sin(phi), P.L/2+0.08, 1);
      const { pts: pBot } = traceLine3D(r*Math.cos(phi), r*Math.sin(phi),-P.L/2-0.08,-1);
      if (pTop.length>3) lines.push(pTop);
      if (pBot.length>3) lines.push(pBot);
    }
  } else if (src === 'toroid') {
    // Inside the torus
    for (let i=0; i<n; i++) {
      const phi = PI2*i/n;
      const ri = P.R + P.a*0.5;
      const { pts } = traceLine3D(ri*Math.cos(phi), ri*Math.sin(phi), 0.05, 1);
      if (pts.length>3) lines.push(pts);
    }
    // Outside (should be nearly zero — short escaped lines)
    for (let i=0; i<Math.ceil(n*0.4); i++) {
      const phi = PI2*i/Math.ceil(n*0.4);
      const ro = P.R + P.a*1.4;
      const { pts, escaped } = traceLine3D(ro*Math.cos(phi), ro*Math.sin(phi), 0.05, -1);
      if (escaped && pts.length>3) lines.push(pts);
    }
  }

  linesCache3D = { lines, key };
}

function drawFieldLines3D() {
  ensureLines3D();
  const dark = dk();

  // Collect all segments with depth
  const segs = [];
  for (const pts of linesCache3D.lines) {
    if (pts.length < 2) continue;
    const proj = pts.map(p => project3D(...p));
    for (let i=1; i<proj.length; i++) {
      const [ax,ay,az]=proj[i-1], [bx,by,bz]=proj[i];
      segs.push({ ax,ay,bx,by,depth:(az+bz)*0.5 });
    }
  }
  segs.sort((a,b) => a.depth - b.depth);

  for (const s of segs) {
    const alpha = Math.max(0.3, Math.min(1, 0.65 + s.depth * 0.06));
    ctx.strokeStyle = dark ? `rgba(255,255,255,${alpha.toFixed(2)})` : `rgba(20,20,20,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s.ax,s.ay);
    ctx.lineTo(s.bx,s.by);
    ctx.stroke();
  }

  // Arrowheads at midpoints
  for (const pts of linesCache3D.lines) {
    if (pts.length < 6) continue;
    const proj = pts.map(p => project3D(...p));
    const mid = Math.floor(proj.length * 0.52);
    if (mid < 1 || mid >= proj.length) continue;
    const [ax,ay]=proj[mid-1], [bx,by]=proj[mid];
    const dx=bx-ax, dy=by-ay, l=Math.hypot(dx,dy);
    if (l < 2) continue;
    const ux=dx/l, uy=dy/l, hl=7, pw=-uy*hl*0.38, ph=ux*hl*0.38;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.88)' : 'rgba(20,20,20,0.82)';
    ctx.beginPath();
    ctx.moveTo(bx,by);
    ctx.lineTo(bx-ux*hl+pw, by-uy*hl+ph);
    ctx.lineTo(bx-ux*hl-pw, by-uy*hl-ph);
    ctx.closePath(); ctx.fill();
  }
}

/* ── Draw conductor geometry in 3D ──────────────────────────────────────── */
function drawLoop3D(cx, cy, cz, R, nx, ny, nz, col, lw) {
  let tx, ty, tz;
  if (Math.abs(nx) < 0.9) { tx=0; ty=-nz; tz=ny; }
  else                     { tx=nz; ty=0;  tz=-nx; }
  const tl=Math.hypot(tx,ty,tz); tx/=tl; ty/=tl; tz/=tl;
  const ux=ny*tz-nz*ty, uy=nz*tx-nx*tz, uz=nx*ty-ny*tx;
  ctx.strokeStyle=col; ctx.lineWidth=lw;
  ctx.beginPath();
  for (let k=0; k<=64; k++) {
    const phi=2*Math.PI*k/64;
    const x=cx+R*(Math.cos(phi)*tx+Math.sin(phi)*ux);
    const y=cy+R*(Math.cos(phi)*ty+Math.sin(phi)*uy);
    const z=cz+R*(Math.cos(phi)*tz+Math.sin(phi)*uz);
    const [sx,sy]=project3D(x,y,z);
    k===0 ? ctx.moveTo(sx,sy) : ctx.lineTo(sx,sy);
  }
  ctx.stroke();
}

function drawConductor3D() {
  const src = SOURCES[P.srcIdx].id;
  const dark = dk();
  const wCol = dark ? '#00d4ff' : '#005fa3';

  if (src === 'wire') {
    const [sx0,sy0]=project3D(0,0,-VIEW*0.85);
    const [sx1,sy1]=project3D(0,0, VIEW*0.85);
    ctx.strokeStyle=wCol; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(sx0,sy0); ctx.lineTo(sx1,sy1); ctx.stroke();
    // Current arrow
    const [mx,my]=project3D(0,0,0.3); const [mx2,my2]=project3D(0,0,0.8);
    const ddx=mx2-mx, ddy=my2-my, ll=Math.hypot(ddx,ddy);
    if (ll>1) {
      const ux=ddx/ll, uy=ddy/ll, hl=10, pw=-uy*3.5, ph=ux*3.5;
      ctx.fillStyle=wCol;
      ctx.beginPath(); ctx.moveTo(mx2,my2);
      ctx.lineTo(mx2-ux*hl+pw, my2-uy*hl+ph);
      ctx.lineTo(mx2-ux*hl-pw, my2-uy*hl-ph);
      ctx.closePath(); ctx.fill();
    }
  } else if (src === 'loop') {
    drawLoop3D(0,0,0, P.R, 0,0,1, wCol, 2.5);
  } else if (src === 'square') {
    const a=P.a;
    ctx.strokeStyle=wCol; ctx.lineWidth=2.5;
    const sq=[[-a,-a,0],[a,-a,0],[a,a,0],[-a,a,0]];
    ctx.beginPath();
    sq.forEach((c,i) => {
      const [sx,sy]=project3D(...c);
      i===0 ? ctx.moveTo(sx,sy) : ctx.lineTo(sx,sy);
    });
    ctx.closePath(); ctx.stroke();
  } else if (src === 'solenoid') {
    const N=Math.round(P.N), nPts=N*40;
    ctx.strokeStyle=wCol; ctx.lineWidth=2;
    ctx.beginPath();
    for (let k=0; k<=nPts; k++) {
      const phi=2*Math.PI*N*k/nPts;
      const z=-P.L/2 + P.L*k/nPts;
      const [sx,sy]=project3D(P.R*Math.cos(phi), P.R*Math.sin(phi), z);
      k===0 ? ctx.moveTo(sx,sy) : ctx.lineTo(sx,sy);
    }
    ctx.stroke();
  } else if (src === 'toroid') {
    // Outer/inner boundary circles
    const rIn=Math.max(0.05, P.R-P.a), rOut=P.R+P.a;
    const bndCol = dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,95,163,0.50)';
    drawLoop3D(0,0,0, rOut, 0,0,1, bndCol, 1.5);
    if (rIn>0.1) drawLoop3D(0,0,0, rIn, 0,0,1, bndCol, 1.5);
    // A few tube circles
    for (let i=0; i<8; i++) {
      const phi=2*Math.PI*i/8;
      drawLoop3D(P.R*Math.cos(phi), P.R*Math.sin(phi), 0, P.a,
                 -Math.sin(phi), Math.cos(phi), 0,
                 dark ? 'rgba(0,212,255,0.28)' : 'rgba(0,95,163,0.25)', 1);
    }
  }
}

/* ── Coordinate axes (subtle) ────────────────────────────────────────────── */
function drawAxes3D() {
  const dark = dk();
  const axLen = 1.8;
  const axes = [[axLen,0,0,'x'],[0,axLen,0,'y'],[0,0,axLen,'z']];
  const cols = dark
    ? ['rgba(255,100,100,0.5)','rgba(100,255,100,0.5)','rgba(100,180,255,0.5)']
    : ['rgba(180,50,50,0.5)','rgba(50,150,50,0.5)','rgba(50,80,200,0.5)'];
  for (let i=0; i<3; i++) {
    const [x,y,z,lbl]=axes[i];
    const [ox,oy]=project3D(0,0,0);
    const [ex,ey]=project3D(x,y,z);
    ctx.strokeStyle=cols[i]; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.fillStyle=cols[i]; ctx.font=`11px Space Mono, monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(lbl, ex+5, ey-5);
  }
}

/* ── Main scene ──────────────────────────────────────────────────────────── */
function drawScene() {
  const dark = dk();
  ctx.fillStyle = dark ? '#060a10' : '#f4f7fa';
  ctx.fillRect(0, 0, SW, SH);

  drawHeatmapPlane();
  if (P.showLines) drawFieldLines3D();
  drawConductor3D();
  drawAxes3D();
}

/* ── Graphs ──────────────────────────────────────────────────────────────── */
const GRAPH_DEFS = [
  { label: '|B| assiale (z)',  fn: z => Math.hypot(...bField3D(0,0,z)) },
  { label: '|B| radiale (x)',  fn: x => Math.hypot(...bField3D(x,0,0)) },
  { label: '|B| radiale (r)',  fn: r => r<0.05 ? 0 : Math.hypot(...bField3D(r,0,0)) },
];
let activeGraph = 0;
let graphRanges = null;

function buildGraphRanges() {
  graphRanges = GRAPH_DEFS.map(g => {
    const pts = [];
    for (let i=1; i<=200; i++) {
      const x = -VIEW + 2*VIEW*i/200;
      const y = g.fn(x);
      if (isFinite(y) && y < 1e6) pts.push(y);
    }
    const yMax = Math.max(...pts) * 1.15 || 1;
    return { xMin: -VIEW, xMax: VIEW, yMax };
  });
}

function drawGraphs() {
  if (!graphRanges) buildGraphRanges();
  GW = gc.width/DPR; GH = gc.height/DPR;
  gctx.clearRect(0, 0, gc.width, gc.height);
  const dark = dk();
  const panW = Math.floor(GW / GRAPH_DEFS.length);
  const PAD = { t:26, b:34, l:50, r:12 };
  const accent = '#00d4ff';
  const axCol  = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
  const lblCol = dark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.48)';
  const gridCol= dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  for (let gi=0; gi<GRAPH_DEFS.length; gi++) {
    const gd=GRAPH_DEFS[gi], gr=graphRanges[gi];
    const ox=gi*panW, iW=panW-PAD.l-PAD.r, iH=GH-PAD.t-PAD.b;
    const active=gi===activeGraph;

    gctx.fillStyle = dark
      ? (active ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.02)')
      : (active ? 'rgba(0,160,200,0.07)' : 'rgba(0,0,0,0.02)');
    gctx.fillRect(ox*DPR, 0, panW*DPR, GH*DPR);

    const mapX = x => (ox+PAD.l+(x-gr.xMin)/(gr.xMax-gr.xMin)*iW)*DPR;
    const mapY = y => (PAD.t+(1-y/gr.yMax)*iH)*DPR;

    // Grid
    gctx.strokeStyle=gridCol; gctx.lineWidth=1;
    for (let yi=1; yi<=4; yi++) {
      const yv=gr.yMax*yi/4;
      gctx.beginPath(); gctx.moveTo((ox+PAD.l)*DPR, mapY(yv));
      gctx.lineTo((ox+panW-PAD.r)*DPR, mapY(yv)); gctx.stroke();
    }
    // Axes
    gctx.strokeStyle=axCol; gctx.lineWidth=DPR;
    gctx.beginPath(); gctx.moveTo(mapX(gr.xMin),mapY(0)); gctx.lineTo(mapX(gr.xMax),mapY(0)); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(mapX(gr.xMin),mapY(0)); gctx.lineTo(mapX(gr.xMin),mapY(gr.yMax)); gctx.stroke();
    // Zero line
    gctx.setLineDash([3*DPR,3*DPR]); gctx.strokeStyle=axCol;
    gctx.beginPath(); gctx.moveTo(mapX(0),mapY(0)); gctx.lineTo(mapX(0),mapY(gr.yMax)); gctx.stroke();
    gctx.setLineDash([]);

    // Curve
    gctx.strokeStyle = active ? accent : (dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,120,170,0.55)');
    gctx.lineWidth = (active ? 2 : 1.5)*DPR;
    gctx.beginPath();
    let started=false;
    for (let i=0; i<=280; i++) {
      const x=gr.xMin+(gr.xMax-gr.xMin)*i/280;
      const y=gd.fn(x);
      if (!isFinite(y)||y<0||y>gr.yMax*8) { started=false; continue; }
      const sx=mapX(x), sy=mapY(Math.min(y,gr.yMax));
      started ? gctx.lineTo(sx,sy) : (gctx.moveTo(sx,sy), started=true);
    }
    gctx.stroke();

    // Labels
    gctx.fillStyle=lblCol;
    gctx.font=`${10*DPR}px Space Mono, monospace`;
    gctx.textAlign='center'; gctx.textBaseline='top';
    gctx.fillText(gd.label, (ox+PAD.l+iW/2)*DPR, 6*DPR);

    // Y ticks
    gctx.textAlign='right'; gctx.textBaseline='middle';
    for (let yi=0; yi<=4; yi++) {
      const yv=gr.yMax*yi/4;
      const lbl=yv<0.001?yv.toExponential(1):yv<10?yv.toFixed(2):yv.toFixed(0);
      gctx.fillText(lbl, (ox+PAD.l-4)*DPR, mapY(yv));
    }

    if (gi>0) {
      gctx.strokeStyle=axCol; gctx.lineWidth=1;
      gctx.beginPath(); gctx.moveTo(ox*DPR,0); gctx.lineTo(ox*DPR,GH*DPR); gctx.stroke();
    }
  }
  gctx.strokeStyle=accent; gctx.lineWidth=2*DPR;
  gctx.strokeRect(activeGraph*panW*DPR, 0, panW*DPR, GH*DPR);
}

function updateReadout() {
  const [bx,by,bz] = bField3D(2, 0, 0);
  const bm = Math.hypot(bx,by,bz);
  const [b0x,b0y,b0z] = bField3D(0,0,0.01);
  const b0 = Math.hypot(b0x,b0y,b0z);
  document.getElementById('readout').innerHTML =
    `<span>|B| asse (0,0,0) = <b>${b0.toFixed(3)}</b></span>` +
    `<span>|B| radiale (r=2) = <b>${bm.toFixed(3)}</b></span>` +
    `<span>I = <b>${P.I.toFixed(1)} A</b></span>` +
    `<span>μᵣ = <b>${P.mu_r}</b></span>`;
}

/* ── Canvas resize ───────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  const rd   = area.querySelector('.readout-bar');
  SW = area.clientWidth;
  const gaH  = ga.clientHeight || 200;
  const rdH  = rd ? (rd.clientHeight || 56) : 56;
  SH = Math.max(120, area.clientHeight - gaH - rdH);

  sc.width  = Math.round(SW*DPR); sc.height = Math.round(SH*DPR);
  sc.style.width  = SW+'px';      sc.style.height  = SH+'px';

  GW = ga.clientWidth; GH = ga.clientHeight || 200;
  gc.width  = Math.round(GW*DPR); gc.height = Math.round(GH*DPR);
  gc.style.width  = GW+'px';      gc.style.height  = GH+'px';

  scale = Math.min(SW,SH) / (VIEW*2) * zoom;
}

/* ── Interaction ─────────────────────────────────────────────────────────── */
sc.addEventListener('mousedown', e => {
  rot3Dragging=true; rot3SX=e.clientX; rot3SY=e.clientY;
  rot3OX=rot3X; rot3OY=rot3Y;
  sc.style.cursor='grabbing';
});
sc.addEventListener('mousemove', e => {
  if (!rot3Dragging) return;
  rot3Y = rot3OY + (e.clientX - rot3SX) * 0.008;
  rot3X = rot3OX + (e.clientY - rot3SY) * 0.008;
  rot3X = Math.max(-Math.PI/2, Math.min(Math.PI/2, rot3X));
  draw();
});
sc.addEventListener('mouseup',   () => { rot3Dragging=false; sc.style.cursor='grab'; });
sc.addEventListener('mouseleave',() => { rot3Dragging=false; sc.style.cursor='grab'; });
sc.style.cursor = 'grab';

sc.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.12 : 1/1.12;
  zoom *= f; zoom = Math.max(0.3, Math.min(15, zoom));
  scale = Math.min(SW,SH) / (VIEW*2) * zoom;
  draw();
}, { passive: false });

sc.addEventListener('dblclick', () => {
  zoom=1; panX=0; panY=0; rot3X=0.32; rot3Y=0.40;
  scale = Math.min(SW,SH)/(VIEW*2)*zoom;
  draw();
});

document.getElementById('graphArea').addEventListener('click', e => {
  activeGraph = Math.min(GRAPH_DEFS.length-1, Math.floor(e.offsetX / (GW/GRAPH_DEFS.length)));
  drawGraphs();
});

/* ── Controls ────────────────────────────────────────────────────────────── */
let sliderR, sliderA, sliderN, sliderL;

function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const srcGroup = Lab.RadioGroup({
    label: 'Sorgente',
    options: SOURCES.map(s => ({ label: s.label, value: s.id })),
    value: SOURCES[P.srcIdx].id,
    onChange: val => {
      P.srcIdx = SOURCES.findIndex(s => s.id===val);
      buildSegments(); invalidateAll(); graphRanges=null;
      updateGeomVisibility(); draw();
    }
  });
  const srcSec = Lab.Section('Sorgente');
  srcSec.add(srcGroup); ctrl.appendChild(srcSec.el);

  const slI = Lab.Slider({ label: 'Corrente I', min:0.1, max:10, value:P.I, step:0.1, unit:' A',
    onChange: v => { P.I=v; buildSegments(); invalidateAll(); graphRanges=null; draw(); } });
  const slMu = Lab.Slider({ label: 'Permeabilità μᵣ', min:1, max:500, value:P.mu_r, step:1,
    onChange: v => { P.mu_r=v; buildSegments(); invalidateAll(); graphRanges=null; draw(); } });
  const physSec = Lab.Section('Parametri fisici');
  physSec.add(slI); physSec.add(slMu); ctrl.appendChild(physSec.el);

  sliderR = Lab.Slider({ label:'Raggio R', min:0.3, max:3.5, value:P.R, step:0.05, unit:' m',
    onChange: v => { P.R=v; buildSegments(); invalidateAll(); graphRanges=null; draw(); } });
  sliderA = Lab.Slider({ label:'Lato a', min:0.3, max:3.5, value:P.a, step:0.05, unit:' m',
    onChange: v => { P.a=v; buildSegments(); invalidateAll(); graphRanges=null; draw(); } });
  sliderN = Lab.Slider({ label:'Spire N', min:1, max:20, value:P.N, step:1,
    onChange: v => { P.N=v; buildSegments(); invalidateAll(); graphRanges=null; draw(); } });
  sliderL = Lab.Slider({ label:'Lunghezza L', min:0.5, max:8, value:P.L, step:0.1, unit:' m',
    onChange: v => { P.L=v; buildSegments(); invalidateAll(); graphRanges=null; draw(); } });
  const geomSec = Lab.Section('Geometria');
  geomSec.add(sliderR); geomSec.add(sliderA); geomSec.add(sliderN); geomSec.add(sliderL);
  ctrl.appendChild(geomSec.el);

  const togLines = Lab.Toggle({ label:'Linee di campo', value:P.showLines,
    onChange: v => { P.showLines=v; linesCache3D=null; draw(); } });
  const slLines = Lab.Slider({ label:'N. linee', min:4, max:28, value:P.nLines, step:1,
    onChange: v => { P.nLines=v; linesCache3D=null; draw(); } });
  const dispSec = Lab.Section('Visualizzazione');
  dispSec.add(togLines); dispSec.add(slLines); ctrl.appendChild(dispSec.el);

  updateGeomVisibility();
}

function updateGeomVisibility() {
  const src = SOURCES[P.srcIdx].id;
  sliderR.el.style.display = (src==='wire'||src==='square') ? 'none' : '';
  sliderA.el.style.display = (src==='square'||src==='toroid') ? '' : 'none';
  sliderN.el.style.display = (src==='wire'||src==='loop'||src==='square') ? 'none' : '';
  sliderL.el.style.display = (src==='solenoid') ? '' : 'none';
}

/* ── Main ────────────────────────────────────────────────────────────────── */
function draw() {
  drawScene();
  drawGraphs();
  updateReadout();
}

function init() {
  resizeCanvases();
  buildSegments();
  buildControls();
  draw();
}

window.addEventListener('resize', () => { resizeCanvases(); invalidateAll(); graphRanges=null; draw(); });
init();
