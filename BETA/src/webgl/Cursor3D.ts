import * as THREE from 'three';
import gsap from 'gsap';
import type { HeroHandle } from './HeroMesh';

export function bindCursor3D(opts: {
  camera: THREE.PerspectiveCamera;
  hero: HeroHandle;
  dom?: HTMLElement | Document;
}): () => void {
  const { camera, hero } = opts;
  const dom = opts.dom ?? document;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hitLocal = new THREE.Vector3();

  const onMove = (e: Event) => {
    const pe = e as PointerEvent;
    pointer.x = (pe.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(pe.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(hero.mesh);
    if (hits[0]) {
      hitLocal.copy(hits[0].point);
      hero.mesh.worldToLocal(hitLocal);
      hero.uniforms.uMouse.value.copy(hitLocal);
      gsap.to(hero.uniforms.uRipple, { value: 1, duration: 0.12, overwrite: true });
    } else {
      gsap.to(hero.uniforms.uRipple, {
        value: 0.12,
        duration: 0.55,
        ease: 'power2.out',
        overwrite: true,
      });
    }
  };

  dom.addEventListener('pointermove', onMove, { passive: true });
  return () => dom.removeEventListener('pointermove', onMove);
}