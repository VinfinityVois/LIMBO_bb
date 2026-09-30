import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createHeroMesh, type HeroHandle } from './HeroMesh';
import { bindCursor3D } from './Cursor3D';
import { bindScrollCam } from './ScrollCam';
import { createParticles } from './Particles';

export type CoreHandle = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  hero: HeroHandle;
  dispose: () => void;
};

const GrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uStrength: { value: 0.055 },
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
      float ca = 0.0012;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w0, h0);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03050a, 0.038);

  const camera = new THREE.PerspectiveCamera(45, w0 / h0, 0.1, 100);
  camera.position.set(0, 0.35, 5.5);

  const key = new THREE.DirectionalLight(0xb8f0ff, 1.15);
  key.position.set(3, 4, 5);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x1a2030, 0.4));
  const rim = new THREE.PointLight(0x00d4e8, 2.2, 14);
  rim.position.set(-2, 1.2, 3);
  scene.add(rim);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00d4e8,
    transparent: true,
    opacity: 0.12,
    wireframe: true,
  });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.01, 8, 64), ringMat);
  ring1.rotation.x = Math.PI * 0.5;
  scene.add(ring1);
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.008, 8, 64),
    ringMat.clone()
  );
  (ring2.material as THREE.MeshBasicMaterial).opacity = 0.07;
  ring2.rotation.x = Math.PI * 0.4;
  scene.add(ring2);

  const hero = createHeroMesh(scene);
  const particles = createParticles(scene, 6500);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.5, 0.55, 0.82);
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
  const st = bindScrollCam({ camera, hero, bloom });

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    hero.uniforms.uTime.value = t;
    grainPass.uniforms.uTime.value = t * 0.15;
    hero.mesh.rotation.y = t * 0.08;
    ring1.rotation.z = t * 0.05;
    ring2.rotation.z = -t * 0.03;
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };
  window.addEventListener('resize', onResize);

  const dispose = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPtr);
    unbindCursor();
    st.kill();
    particles.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };

  return { renderer, scene, camera, composer, hero, dispose };
}