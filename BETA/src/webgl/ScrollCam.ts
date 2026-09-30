import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { HeroHandle } from './HeroMesh';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

gsap.registerPlugin(ScrollTrigger);

export type ScrollCamHandle = {
  trigger: ScrollTrigger;
  update: (dt: number) => void;
  kill: () => void;
  getProgress: () => number;
};

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function bindScrollCam(opts: {
  camera: THREE.PerspectiveCamera;
  hero: HeroHandle;
  bloom?: UnrealBloomPass;
}): ScrollCamHandle {
  const { camera, hero, bloom } = opts;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.3, 5.7),
    new THREE.Vector3(0.85, 0.38, 5.05),
    new THREE.Vector3(-0.55, 0.18, 4.35),
    new THREE.Vector3(0.5, 0.34, 3.75),
    new THREE.Vector3(-0.1, 0.52, 3.2),
  ], false, 'catmullrom', 0.55);

  const state = {
    targetT: 0,
    t: 0,
    velocity: 0,
  };

  const trigger = ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    scrub: false,
    onUpdate: (self) => {
      state.targetT = THREE.MathUtils.clamp(self.progress, 0, 1);
    },
  });

  const update = (dt: number): void => {
    state.t = damp(state.t, state.targetT, 5.5, dt);
    const nextT = Math.min(state.t + 0.028, 1);
    const p = curve.getPointAt(state.t);
    const look = curve.getPointAt(nextT);

    camera.position.x = damp(camera.position.x, p.x, 7.0, dt);
    camera.position.y = damp(camera.position.y, p.y, 7.0, dt);
    camera.position.z = damp(camera.position.z, p.z, 7.0, dt);

    const currentLook = camera.userData.__limboLook as THREE.Vector3 | undefined;
    const lookState = currentLook ?? (camera.userData.__limboLook = p.clone());
    lookState.lerp(look, 1 - Math.exp(-5.5 * dt));
    camera.lookAt(lookState);

    const targetMorph = 0.18 + THREE.MathUtils.smoothstep(state.t, 0.08, 0.86) * 0.26;
    hero.uniforms.uScroll.value = state.t;
    hero.uniforms.uMorph.value = damp(hero.uniforms.uMorph.value, targetMorph, 3.0, dt);

    const delta = Math.abs(state.targetT - state.t);
    state.velocity = damp(state.velocity, delta * 40, 8.0, dt);
    const targetFov = 46 + Math.min(state.velocity * 1.9, 3.5);
    camera.fov = damp(camera.fov, targetFov, 5.5, dt);
    camera.updateProjectionMatrix();

    if (bloom) {
      const targetBloom = 0.32 + Math.min(state.velocity * 0.25, 0.17);
      bloom.strength = damp(bloom.strength, targetBloom, 5.0, dt);
    }
  };

  return {
    trigger,
    update,
    getProgress: () => state.t,
    kill: () => trigger.kill(),
  };
}
