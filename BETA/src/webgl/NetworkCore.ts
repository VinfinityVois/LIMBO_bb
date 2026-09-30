import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export const TOPOS = ['MESH', 'OSI STACK', 'RING', 'TREE'] as const;
export type NodeInfo = { id: number; ip: string; role: string; deg: number; lat: number; x: number; y: number };
export type NetStats = { fps: number; nodes: number; edges: number; packets: number; s: number; topo: string };
export type NetHandle = {
  setTopo: (i: number | null) => void;
  pulse: (cx?: number, cy?: number) => void;
  stats: () => NetStats;
  roles: () => Record<string, number>;
  onHover: (cb: (n: NodeInfo | null) => void) => void;
  dispose: () => void;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ss = (x: number) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const ROLES = ['WEB', 'API', 'DB', 'IOT'];
const ROLE_COL: Record<string, THREE.Color> = {
  CORE: new THREE.Color('#ffffff'), ROUTER: new THREE.Color('#e8a020'),
  WEB: new THREE.Color('#00d4e8'), API: new THREE.Color('#1ec99a'),
  DB: new THREE.Color('#e01a6f'), IOT: new THREE.Color('#5b7fa0'),
};

export function createNetwork(container: HTMLElement): NetHandle | null {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const mobile = window.matchMedia('(max-width: 700px)').matches;
  const N = mobile ? 100 : 190, H = mobile ? 8 : 12, M = mobile ? 120 : 280;
  const rnd = mulberry(1337);

  // ── renderer / scene ──
  const w0 = container.clientWidth || innerWidth, h0 = container.clientHeight || innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(w0, h0);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w0 / h0, 0.1, 120);
  camera.position.set(0, 2, 10);
  const group = new THREE.Group();
  scene.add(group);

  // ── layouts: 4 embeddings of the same graph ──
  const L = [0, 1, 2, 3].map(() => new Float32Array(N * 3));
  const put = (k: number, i: number, x: number, y: number, z: number) => { L[k][i * 3] = x; L[k][i * 3 + 1] = y; L[k][i * 3 + 2] = z; };
  const parent = (i: number) => (i <= H ? 0 : 1 + ((i - H - 1) % H));
  for (let i = 0; i < N; i++) {
    const router = i > 0 && i <= H, host = i > H, p = parent(i);
    // MESH: flattened fibonacci cloud
    const g = i + 0.5, phi = Math.acos(1 - (2 * g) / N), th = Math.PI * (1 + Math.sqrt(5)) * g;
    const r = i === 0 ? 0 : router ? 1.7 : 3 + rnd() * 1.5;
    put(0, i, r * Math.sin(phi) * Math.cos(th) * 1.35, r * Math.cos(phi) * 0.75, r * Math.sin(phi) * Math.sin(th));
    // OSI STACK: 7 layers
    const layer = host ? i % 7 : router ? i % 7 : 3;
    const ang = i * 2.399, rad = host ? 1.3 + Math.sqrt(rnd()) * 2.7 : router ? 0.9 : 0;
    put(1, i, Math.cos(ang) * rad, (layer - 3) * 0.85, Math.sin(ang) * rad);
    // RING: hubs on a torus, hosts orbit their router
    if (!host) {
      const a = router ? ((i - 1) / H) * Math.PI * 2 : 0, rr = router ? 3.8 : 0;
      put(2, i, Math.cos(a) * rr, 0, Math.sin(a) * rr);
    } else {
      const px = L[2][p * 3], pz = L[2][p * 3 + 2], a = rnd() * 6.28, q = 0.5 + rnd() * 0.9;
      put(2, i, px + Math.cos(a) * q, (rnd() - 0.5) * 1.6, pz + Math.sin(a) * q);
    }
    // TREE
    if (i === 0) put(3, i, 0, 3.4, 0);
    else if (router) put(3, i, ((i - 1) / (H - 1)) * 9 - 4.5, 1, Math.sin(i * 1.7) * 0.9);
    else put(3, i, L[3][p * 3] + (rnd() - 0.5) * 1.4, -1.6 - rnd() * 1.4, (rnd() - 0.5) * 2.6);
  }

  // ── graph ──
  const ea: number[] = [], eb: number[] = [], seen = new Set<string>();
  const link = (a: number, b: number) => { const k = a < b ? `${a}-${b}` : `${b}-${a}`; if (a === b || seen.has(k)) return; seen.add(k); ea.push(a); eb.push(b); };
  for (let i = 1; i <= H; i++) { link(0, i); link(i, i === H ? 1 : i + 1); }
  for (let i = H + 1; i < N; i++) link(i, parent(i));
  for (let n = 0, tries = 0; n < (mobile ? 20 : 45) && tries < 4000; tries++) {
    const a = H + 1 + ((rnd() * (N - H - 1)) | 0), b = H + 1 + ((rnd() * (N - H - 1)) | 0);
    const d = Math.hypot(L[0][a * 3] - L[0][b * 3], L[0][a * 3 + 1] - L[0][b * 3 + 1], L[0][a * 3 + 2] - L[0][b * 3 + 2]);
    if (d < 1.7) { const s = seen.size; link(a, b); if (seen.size > s) n++; }
  }
  const E = ea.length;
  const adj: number[][] = Array.from({ length: N }, () => []);
  for (let e = 0; e < E; e++) { adj[ea[e]].push(e); adj[eb[e]].push(e); }
  const role = (i: number) => (i === 0 ? 'CORE' : i <= H ? 'ROUTER' : ROLES[i % 4]);
  const roleCount: Record<string, number> = {};
  for (let i = 0; i < N; i++) roleCount[role(i)] = (roleCount[role(i)] || 0) + 1;
  const delay = new Float32Array(N).map(() => rnd());

  // ── nodes ──
  const pos = new Float32Array(N * 3), nE = new Float32Array(N), nSize = new Float32Array(N), nCol = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const c = ROLE_COL[role(i)]; nCol.set([c.r, c.g, c.b], i * 3);
    nSize[i] = i === 0 ? 34 : i <= H ? 20 : 11 + rnd() * 4;
  }
  const nGeo = new THREE.BufferGeometry();
  nGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  nGeo.setAttribute('aE', new THREE.BufferAttribute(nE, 1));
  nGeo.setAttribute('aSize', new THREE.BufferAttribute(nSize, 1));
  nGeo.setAttribute('aCol', new THREE.BufferAttribute(nCol, 3));
  const nMat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: renderer.getPixelRatio() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize,aE;attribute vec3 aCol;uniform float uPx;varying float vE;varying vec3 vC;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=aSize*(1.+aE*.9)*uPx*(9./-mv.z);vE=aE;vC=aCol;}`,
    fragmentShader: `varying float vE;varying vec3 vC;
      void main(){vec2 p=gl_PointCoord-.5;float d=length(p)*2.;if(d>1.)discard;
      float core=smoothstep(.36,.2,d),ring=smoothstep(.07,0.,abs(d-.76))*.75,halo=pow(1.-d,2.)*.4;
      float a=core+ring*(.45+vE)+halo*(.5+vE);gl_FragColor=vec4(vC*(1.+vE*1.6),a);}`,
  });
  group.add(new THREE.Points(nGeo, nMat));

  // ── edges ──
  const ePos = new Float32Array(E * 6), eCol = new Float32Array(E * 6), eE = new Float32Array(E);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  group.add(new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));

  // ── packets (random walk along edges) ──
  const pf = new Int32Array(M), pe = new Int32Array(M), pt = new Float32Array(M), ps = new Float32Array(M);
  const pPos = new Float32Array(M * 3), pCol = new Float32Array(M * 3);
  const PC = [new THREE.Color('#00d4e8'), new THREE.Color('#e01a6f'), new THREE.Color('#e8a020'), new THREE.Color('#ffffff')];
  for (let k = 0; k < M; k++) {
    pe[k] = (rnd() * E) | 0; pf[k] = rnd() < 0.5 ? ea[pe[k]] : eb[pe[k]]; pt[k] = rnd(); ps[k] = 0.25 + rnd() * 0.6;
    const c = PC[rnd() < 0.6 ? 0 : (rnd() * 4) | 0]; pCol.set([c.r, c.g, c.b], k * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  group.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending })));

  // ── floor grid with travelling wave ──
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vP;void main(){vP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.);}`,
    fragmentShader: `varying vec3 vP;uniform float uT;
      void main(){vec2 u=vP.xz/1.5;vec2 g=abs(fract(u-.5)-.5)/fwidth(u);float l=1.-min(min(g.x,g.y),1.);
      float r=length(vP.xz);float w=smoothstep(1.4,0.,abs(mod(r-uT*3.,16.)));
      float a=l*(.14+w*.8)*exp(-r*.085);gl_FragColor=vec4(vec3(0.,.83,.91)*a,a);}`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3.7;
  scene.add(floor);

  // ── post ──
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.7, 0.55, 0.12);
  composer.addPass(bloom);

  // ── scroll → topology index (continuous, anchor-driven) ──
  let anchors: { y: number; k: number }[] = [];
  const measure = () => {
    anchors = [...document.querySelectorAll<HTMLElement>('[data-topo]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { y: r.top + scrollY + r.height / 2, k: parseFloat(el.dataset.topo || '0') };
    }).sort((a, b) => a.k - b.k);
  };
  const scrollS = () => {
    if (!anchors.length) return 0;
    const c = scrollY + innerHeight * 0.5;
    if (c <= anchors[0].y) return anchors[0].k;
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      if (c <= b.y) return a.k + ((c - a.y) / (b.y - a.y)) * (b.k - a.k);
    }
    return anchors[anchors.length - 1].k;
  };
  measure();
  const ro = new ResizeObserver(measure); ro.observe(document.body);
  let override: number | null = null;
  const release = () => { override = null; };
  (['wheel', 'touchmove'] as const).forEach((ev) => addEventListener(ev, release, { passive: true }));
  const onKey = (e: KeyboardEvent) => { if (/Arrow|Page|Space|Home|End/.test(e.code)) release(); };
  addEventListener('keydown', onKey);

  // ── interaction ──
  const mouse = new THREE.Vector2(), px = { x: -999, y: -999 };
  const onPtr = (e: PointerEvent) => { mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); px.x = e.clientX; px.y = e.clientY; };
  addEventListener('pointermove', onPtr, { passive: true });
  let hoverCb: (n: NodeInfo | null) => void = () => {};
  let hov = -1;
  const scr = new Float32Array(N * 2);
  let wave: { t0: number; dist: Int16Array; fired: Uint8Array } | null = null;
  const nearest = (cx: number, cy: number) => {
    let best = -1, bd = 1e9;
    for (let i = 0; i < N; i++) { const d = Math.hypot(scr[i * 2] - cx, scr[i * 2 + 1] - cy); if (d < bd) { bd = d; best = i; } }
    return { best, bd };
  };
  let clock0 = 0;
  const pulse = (cx?: number, cy?: number) => {
    const src = cx === undefined ? (rnd() * N) | 0 : nearest(cx, cy as number).best;
    const dist = new Int16Array(N).fill(-1), q = [src]; dist[src] = 0;
    for (let h = 0; h < q.length; h++) for (const e of adj[q[h]]) { const o = ea[e] === q[h] ? eb[e] : ea[e]; if (dist[o] < 0) { dist[o] = dist[q[h]] + 1; q.push(o); } }
    wave = { t0: clock0, dist, fired: new Uint8Array(N) };
  };
  const onClick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('a,button,input,textarea,.net-console')) pulse(e.clientX, e.clientY); };
  addEventListener('click', onClick);

  // ── loop ──
  const v = new THREE.Vector3(), clk = new THREE.Clock();
  let sm = 0, raf = 0, fps = 60, lastHover = 0;
  const camTarget = new THREE.Vector3();
  const HGT = [1.8, 0.6, 1.4, 3.4], LY = [0, 0, 0, 0.4];
  const tick = () => {
    const dt = Math.min(clk.getDelta(), 0.05), t = clk.elapsedTime; clock0 = t;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
    const target = Math.min(3, Math.max(0, override ?? scrollS()));
    sm += (target - sm) * (1 - Math.exp(-dt * 2.4));            // critically-damped-ish: no jumps
    const a = Math.min(2, Math.floor(sm)), f = sm - a;

    for (let i = 0; i < N; i++) {
      const ff = ss((f - delay[i] * 0.4) / 0.6), i3 = i * 3;     // staggered ripple morph
      for (let c = 0; c < 3; c++) pos[i3 + c] = L[a][i3 + c] + (L[a + 1][i3 + c] - L[a][i3 + c]) * ff;
      pos[i3] += Math.sin(t * 0.7 + i) * 0.05; pos[i3 + 1] += Math.cos(t * 0.6 + i * 1.3) * 0.05;
      nE[i] *= Math.exp(-dt * 1.8);
    }
    if (wave) {
      let pending = 0;
      for (let i = 0; i < N; i++) {
        if (wave.fired[i] || wave.dist[i] < 0) continue;
        if (t - wave.t0 >= wave.dist[i] * 0.13) { wave.fired[i] = 1; nE[i] = 1.4; for (const e of adj[i]) eE[e] = 1; } else pending++;
      }
      if (!pending) wave = null;
    }
    for (let e = 0; e < E; e++) {
      const A = ea[e] * 3, B = eb[e] * 3, o = e * 6;
      for (let c = 0; c < 3; c++) { ePos[o + c] = pos[A + c]; ePos[o + 3 + c] = pos[B + c]; }
      eE[e] *= Math.exp(-dt * 2.2);
      const k = 0.16 + eE[e] * 1.4;
      eCol[o] = eCol[o + 3] = 0.0 + eE[e] * 0.5; eCol[o + 1] = eCol[o + 4] = 0.5 * k; eCol[o + 2] = eCol[o + 5] = 0.62 * k;
    }
    for (let k = 0; k < M; k++) {
      pt[k] += ps[k] * dt;
      if (pt[k] >= 1) {
        const n = pf[k] === ea[pe[k]] ? eb[pe[k]] : ea[pe[k]];
        nE[n] = Math.min(1.2, nE[n] + 0.45);
        const opts = adj[n], ne = opts[(rnd() * opts.length) | 0];
        pf[k] = n; pe[k] = ne; pt[k] = 0;
      }
      const e = pe[k], from = pf[k], to = ea[e] === from ? eb[e] : ea[e];
      eE[e] = Math.min(1, eE[e] + dt * 1.2);
      for (let c = 0; c < 3; c++) pPos[k * 3 + c] = pos[from * 3 + c] + (pos[to * 3 + c] - pos[from * 3 + c]) * pt[k];
    }
    nGeo.attributes.position.needsUpdate = nGeo.attributes.aE.needsUpdate = true;
    eGeo.attributes.position.needsUpdate = eGeo.attributes.color.needsUpdate = true;
    pGeo.attributes.position.needsUpdate = true;

    // camera: slow orbit + mouse parallax, all damped
    const s2 = ss(f), aspect = camera.aspect, rad = 10.5 / Math.max(aspect / 1.4, 0.62) * (1 - 0.03 * sm);
    const ang = t * 0.045 + sm * 0.6 + mouse.x * 0.28;
    const hgt = HGT[a] + (HGT[a + 1] - HGT[a]) * s2 + mouse.y * 0.8;
    camTarget.set(Math.sin(ang) * rad, hgt, Math.cos(ang) * rad);
    camera.position.lerp(camTarget, 1 - Math.exp(-dt * 3));
    camera.lookAt(0, LY[a] + (LY[a + 1] - LY[a]) * s2, 0);
    group.position.x = innerWidth > 1000 ? 2.0 * (1 - clamp01(sm / 1.3)) : 0;
    floorMat.uniforms.uT.value = t;
    bloom.strength = 0.62 + Math.max(...[...eE.subarray(0, 12)]) * 0.15;

    // hover pick
    group.updateMatrixWorld();
    for (let i = 0; i < N; i++) { v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(group.matrixWorld).project(camera); scr[i * 2] = (v.x * 0.5 + 0.5) * innerWidth; scr[i * 2 + 1] = (-v.y * 0.5 + 0.5) * innerHeight; }
    const { best, bd } = nearest(px.x, px.y), h = bd < 26 ? best : -1;
    if (h >= 0) { nE[h] = Math.max(nE[h], 0.9); for (const e of adj[h]) eE[e] = Math.max(eE[e], 0.7); }
    if (h !== hov || (h >= 0 && t - lastHover > 0.05)) {
      hov = h; lastHover = t;
      hoverCb(h < 0 ? null : { id: h, ip: `10.${h % 8}.${(h * 7) % 256}.${((h * 13) % 254) + 1}`, role: role(h), deg: adj[h].length, lat: 4 + ((h * 17) % 40), x: scr[h * 2], y: scr[h * 2 + 1] });
    }
    composer.render();
    raf = requestAnimationFrame(tick);
  };
  tick();

  const onResize = () => {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h); measure();
  };
  addEventListener('resize', onResize);
  addEventListener('load', measure);

  return {
    setTopo: (i) => { override = i; },
    pulse,
    stats: () => ({ fps: Math.round(fps), nodes: N, edges: E, packets: M, s: sm, topo: TOPOS[Math.min(3, Math.round(sm))] }),
    roles: () => roleCount,
    onHover: (cb) => { hoverCb = cb; },
    dispose: () => {
      cancelAnimationFrame(raf); ro.disconnect();
      removeEventListener('resize', onResize); removeEventListener('pointermove', onPtr);
      removeEventListener('click', onClick); removeEventListener('keydown', onKey);
      (['wheel', 'touchmove'] as const).forEach((ev) => removeEventListener(ev, release));
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
