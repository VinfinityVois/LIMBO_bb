import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { HeroHandle } from './HeroMesh';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

gsap.registerPlugin(ScrollTrigger);

export function bindScrollCam(opts: {
  camera: THREE.PerspectiveCamera;
  hero: HeroHandle;
  bloom?: UnrealBloomPass;
}): ScrollTrigger {
  const { camera, hero, bloom } = opts;

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.35, 5.5),
    new THREE.Vector3(1.1, 0.55, 4.0),
    new THREE.Vector3(-0.7, 0.25, 2.6),
    new THREE.Vector3(0.15, 0.45, 1.4),
  ]);

  let lastT = 0;
  let vel = 0;

  return ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 1.15,
    onUpdate: (self) => {
      const t = self.progress;
      hero.uniforms.uScroll.value = t;
      hero.uniforms.uMorph.value = THREE.MathUtils.smoothstep(t, 0.12, 0.8);

      const p = curve.getPointAt(t);
      const look = curve.getPointAt(Math.min(t + 0.025, 1));
      camera.position.lerp(p, 0.18);
      camera.lookAt(look);

      const v = Math.abs(t - lastT) * 55;
      lastT = t;
      vel = THREE.MathUtils.lerp(vel, v, 0.2);
      camera.fov = 45 + vel * 22;
      camera.updateProjectionMatrix();

      if (bloom) bloom.strength = 0.42 + vel * 0.75;
    },
  });
}