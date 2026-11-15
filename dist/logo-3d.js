// Shared Infimalega logo: approved medium-pixel render, one revolution every 8s.
(() => {
  'use strict';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const state = { pixels: 144, yaw: 0.26, pitch: -0.12 };
  const rotationMilliseconds = 8000;
  const marks = new Map();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let size, rgba, depth;
  let lastDraw = -Infinity;
  // One traced arm of the reference: the cap, split stem and inward points.
  // The four arms remain separate; the central negative space is preserved.
  const outline = [
    [-46,163],[46,163],[46,160],[40,158],[37,155],[36,152],
    [36,51],[48,58],[50,55],[10,24],[10,152],[6,157],[0,160],
    [-6,157],[-10,152],[-10,24],[-50,55],[-48,58],[-36,51],
    [-36,152],[-37,155],[-40,158],[-46,160]
  ];
  const cross2 = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const signedArea = points => points.reduce((s,p,i) => {
    const q = points[(i+1)%points.length]; return s+p[0]*q[1]-q[0]*p[1];
  },0)/2;
  if (signedArea(outline) < 0) outline.reverse();

  function triangulate(points) {
    const indices = points.map((_,i)=>i), result = [];
    let guard = points.length*points.length;
    while (indices.length > 3 && guard-- > 0) {
      let clipped = false;
      for (let i=0;i<indices.length;i++) {
        const a=indices[(i+indices.length-1)%indices.length], b=indices[i], c=indices[(i+1)%indices.length];
        if (cross2(points[a],points[b],points[c]) <= 1e-7) continue;
        const inside = indices.some(j => j!==a && j!==b && j!==c &&
          cross2(points[a],points[b],points[j])>=-1e-7 &&
          cross2(points[b],points[c],points[j])>=-1e-7 &&
          cross2(points[c],points[a],points[j])>=-1e-7);
        if (!inside) { result.push([a,b,c]); indices.splice(i,1); clipped=true; break; }
      }
      if (!clipped) throw new Error('Unable to triangulate logo contour');
    }
    if (indices.length===3) result.push(indices.slice());
    return result;
  }

  function inset(points, amount) {
    return points.map((p,i) => {
      const before=points[(i+points.length-1)%points.length], after=points[(i+1)%points.length];
      const dx1=p[0]-before[0], dy1=p[1]-before[1], l1=Math.hypot(dx1,dy1);
      const dx2=after[0]-p[0], dy2=after[1]-p[1], l2=Math.hypot(dx2,dy2);
      const n1=[-dy1/l1,dx1/l1], n2=[-dy2/l2,dx2/l2];
      const denom=Math.max(0.16,1+n1[0]*n2[0]+n1[1]*n2[1]);
      return [p[0]+amount*(n1[0]+n2[0])/denom,p[1]+amount*(n1[1]+n2[1])/denom];
    });
  }

  const triangles=[];
  const inner=inset(outline,1.25);
  const frontTriangles=triangulate(inner);
  function add(a,b,c,kind) {
    const u=b.map((v,i)=>v-a[i]), v=c.map((x,i)=>x-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...n);
    triangles.push({points:[a,b,c],normal:n.map(x=>x/length),kind});
  }
  for (let arm=0;arm<4;arm++) {
    const angle=arm*Math.PI/2, ca=Math.cos(angle), sa=Math.sin(angle);
    const point=(p,z)=>[(p[0]*ca-p[1]*sa)/163,(p[0]*sa+p[1]*ca)/163,z/163];
    const outerFront=outline.map(p=>point(p,11));
    const outerBack=outline.map(p=>point(p,-11));
    const innerFront=inner.map(p=>point(p,13));
    const innerBack=inner.map(p=>point(p,-13));
    for (const [a,b,c] of frontTriangles) {
      add(innerFront[a],innerFront[b],innerFront[c],0);
      add(innerBack[c],innerBack[b],innerBack[a],0);
    }
    for(let i=0;i<outline.length;i++) {
      const j=(i+1)%outline.length;
      add(outerBack[i],outerBack[j],outerFront[j],1);
      add(outerBack[i],outerFront[j],outerFront[i],1);
      add(outerFront[i],outerFront[j],innerFront[j],2);
      add(outerFront[i],innerFront[j],innerFront[i],2);
      add(outerBack[j],outerBack[i],innerBack[i],2);
      add(outerBack[j],innerBack[i],innerBack[j],2);
    }
  }

  function resize() {
    size=state.pixels;
    canvas.width=size; canvas.height=size;
    rgba=ctx.createImageData(size,size);
    depth=new Float32Array(size*size);
  }
  function transform(p) {
    const cy=Math.cos(state.yaw), sy=Math.sin(state.yaw), cx=Math.cos(state.pitch), sx=Math.sin(state.pitch);
    const x=p[0]*cy+p[2]*sy, z=-p[0]*sy+p[2]*cy;
    return [x,p[1]*cx-z*sx,p[1]*sx+z*cx];
  }
  function draw() {
    const data=rgba.data;
    data.fill(0); depth.fill(-Infinity);
    const scale=size*0.385;
    for(const tri of triangles) {
      const n=transform(tri.normal);
      if(n[2]<=0.0001) continue;
      const vertices=tri.points.map(p=>{
        const w=transform(p), perspective=4.8/(4.8-w[2]);
        return [size/2+w[0]*scale*perspective,size/2-w[1]*scale*perspective,w[2]];
      });
      const [a,b,c]=vertices;
      const area=cross2(a,b,c);
      if(Math.abs(area)<1e-8) continue;
      const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))), x1=Math.min(size-1,Math.ceil(Math.max(a[0],b[0],c[0])));
      const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))), y1=Math.min(size-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      const light=Math.max(0,n[0]*-0.42+n[1]*0.6+n[2]*0.68);
      const reflect=[2*n[2]*n[0],2*n[2]*n[1],2*n[2]*n[2]-1];
      const rim=Math.pow(1-n[2],2.2);
      const highlight=Math.pow(Math.max(0,reflect[0]*-0.38+reflect[1]*0.65+reflect[2]*0.66),10);
      const material=tri.kind===2 ? 105 : tri.kind===1 ? 36 : 60;
      const base=material+light*(tri.kind===2?105:70)+highlight*105+rim*32;
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
        const p=[x+0.5,y+0.5];
        const wa=cross2(b,c,p)/area, wb=cross2(c,a,p)/area, wc=1-wa-wb;
        if(wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue;
        const z=wa*a[2]+wb*b[2]+wc*c[2], index=y*size+x;
        if(z<=depth[index]) continue;
        depth[index]=z;
        const reflection=Math.exp(-Math.pow(((y/size-0.4)+0.22*(x/size-0.5)+n[1]*0.1)/0.16,2));
        const dither=((x&1) ^ (y&1)) ? 2 : -2;
        const value=Math.max(0,Math.min(245,base+reflection*(tri.kind===0?25:8)+dither));
        const offset=index*4;
        data[offset]=Math.round(value*0.99); data[offset+1]=Math.round(value*0.98);
        data[offset+2]=Math.round(value*0.96); data[offset+3]=255;
      }
    }
    ctx.putImageData(rgba,0,0);

  }

  function updateAngle() {
    // A shared clock keeps the rotation in phase across page navigation.
    state.yaw = reduced.matches ? 0.26 : 0.26 + (Date.now() % rotationMilliseconds) / rotationMilliseconds * Math.PI * 2;
  }
  function paint(mark, context) {
    context.clearRect(0, 0, mark.width, mark.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0, mark.width, mark.height);
  }
  function enhance(container) {
    for (const image of container.querySelectorAll('.site-mark img')) {
      const mark = document.createElement('canvas');
      mark.width = 64;
      mark.height = 64;
      mark.className = 'site-logo-3d';
      mark.setAttribute('aria-hidden', 'true');
      const context = mark.getContext('2d', { alpha: true });
      if (!context) continue;
      paint(mark, context);
      image.replaceWith(mark);
      marks.set(mark, context);
    }
  }
  resize();
  updateAngle();
  draw();
  enhance(document);
  // About opens without a navigation and adds another copy of the shared mark.
  new MutationObserver(records => {
    if (records.some(record => record.addedNodes.length)) enhance(document);
    for (const mark of marks.keys()) if (!mark.isConnected) marks.delete(mark);
  }).observe(document.body, { childList: true, subtree: true });
  function animate(now) {
    if (!document.hidden && now - lastDraw >= 1000 / 20) {
      const visible = [];
      for (const [mark, context] of marks) {
        if (!mark.isConnected) { marks.delete(mark); continue; }
        const rect = mark.getBoundingClientRect();
        if (rect.width && rect.bottom > 0 && rect.top < window.innerHeight && getComputedStyle(mark).visibility !== 'hidden') visible.push([mark, context]);
      }
      if (visible.length && (!reduced.matches || lastDraw === -Infinity)) {
        updateAngle();
        draw();
        for (const [mark, context] of visible) paint(mark, context);
      }
      lastDraw = now;
    }
    requestAnimationFrame(animate);
  }
  reduced.addEventListener('change', () => {
    updateAngle(); draw();
    for (const [mark, context] of marks) paint(mark, context);
  });
  requestAnimationFrame(animate);
})();
