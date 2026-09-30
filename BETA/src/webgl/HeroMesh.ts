import * as THREE from 'three';
import heroVert from './shaders/hero.vert.glsl';
import heroFrag from './shaders/hero.frag.glsl';

export type HeroHandle = {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uMouse: { value: THREE.Vector3 };
    uRipple: { value: number };
    uMorph: { value: number };
    uScroll: { value: number };
    uColorA: { value: THREE.Color };
    uColorB: { value: THREE.Color };
    uRoughness: { value: number };
  };
};

export function createHeroMesh(scene: THREE.Scene): HeroHandle {
  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector3(99, 99, 99) },
    uRipple: { value: 0 },
    uMorph: { value: 0.35 },
    uScroll: { value: 0 },
    uColorA: { value: new THREE.Color('#00d4e8') },
    uColorB: { value: new THREE.Color('#e01a6f') },
    uRoughness: { value: 0.12 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: heroVert,
    fragmentShader: heroFrag,
    transparent: true,
    depthWrite: false,
  });

  const geo = new THREE.IcosahedronGeometry(1.35, 5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0.15, 0);
  scene.add(mesh);

  return { mesh, uniforms };
}