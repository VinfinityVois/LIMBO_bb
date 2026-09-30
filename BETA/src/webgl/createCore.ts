import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createHeroMesh, type HeroHandle } from './HeroMesh';
import { bindCursor3D } from './Cursor3D';
import { bindScrollCam } from './ScrollCam';
import { createParticles } from './Particles';
import { createNetworkField, type NetworkFieldHandle } from './NetworkField';

export type CoreHandle = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  hero: HeroHandle;
  network: NetworkFieldHandle;
  dispose: () => void;
};

const GrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uStrength: { value: 0.032 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uStrength;
    varying vec2 vUv;
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec2 uv = vUv;
      float ca = 0.0010;
      float r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
      vec3 col = vec3(r, g, b);
      float grain = rand(uv + fract(uTime)) * uStrength;
      col += grain - uStrength * 0.5;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createCore(container: HTMLElement): CoreHandle | null {
  const skip = window.matchMedia(
    '(max-width: 700px), (prefers-reduced-motion: reduce)'
  ).matches;
  if (skip) {
    console.info('[LIMBO] WebGL skipped (mobile / reduced-motion)');
    return null;
  }

  const w0 = container.clientWidth || window.innerWidth;
  const h0 = container.clientHeight || window.innerHeight;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
  renderer.setSize(w0, h0);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03050a, 0.026);

  const camera = new THREE.PerspectiveCamera(46, w0 / h0, 0.1, 100);
  camera.position.set(0, 0.3, 5.7);

  scene.add(new THREE.AmbientLight(0x0e1628, 0.72));
  const key = new THREE.DirectionalLight(0xb9f5ff, 1.1);
  key.position.set(3, 4, 5);
  scene.add(key);
  const cyan = new THREE.PointLight(0x00d4e8, 2.2, 12);
  cyan.position.set(-2.8, 1.2, 3.0);
  scene.add(cyan);
  const violet = new THREE.PointLight(0xb646ff, 1.2, 10);
  violet.position.set(2.5, -1.3, 1.5);
  scene.add(violet);

  const floor = new THREE.GridHelper(22, 28, 0x00d4e8, 0x143346);
  floor.position.set(0, -2.1, -1.2);
  floor.rotation.x = 0;
  const floorMaterials = Array.isArray(floor.material) ? floor.material : [floor.material];
  for (const m of floorMaterials) {
    m.transparent = true;
    m.opacity = 0.075;
    m.depthWrite = false;
  }
  scene.add(floor);

  const hero = createHeroMesh(scene);
  const network = createNetworkField(scene, 150);
  const particles = createParticles(scene, 4200);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.34, 0.6, 0.84);
  composer.addPass(bloom);
  const grainPass = new ShaderPass(GrainShader);
  composer.addPass(grainPass);

  const mouseNDC = new THREE.Vector2(0, 0);
  const onPtr = (e: PointerEvent) => {
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  window.addEventListener('pointermove', onPtr, { passive: true });

  const unbindCursor = bindCursor3D({ camera, hero });
  const scroll = bindScrollCam({ camera, hero, bloom });

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.035);
    const t = clock.elapsedTime;

    scroll.update(dt);
    const scrollT = scroll.getProgress();
    hero.uniforms.uTime.value = t;
    grainPass.uniforms.uTime.value = t * 0.11;

    hero.mesh.rotation.y = t * 0.06;
    hero.mesh.rotation.x = Math.sin(t * 0.25) * 0.045;

    network.update(dt, t, scrollT, mouseNDC);
    particles.update(dt, mouseNDC, camera);

    composer.render();
    raf = requestAnimationFrame(tick);
  };
  tick();

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
  };
  window.addEventListener('resize', onResize);

  const dispose = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPtr);
    unbindCursor();
    scroll.kill();
    network.dispose();
    particles.dispose();
    hero.mesh.geometry.dispose();
    hero.mesh.material.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };

  return { renderer, scene, camera, composer, hero, network, dispose };
}
