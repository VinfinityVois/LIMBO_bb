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
    uMorph: { value: 0.24 },
    uScroll: { value: 0 },
    uColorA: { value: new THREE.Color('#00d4e8') },
    uColorB: { value: new THREE.Color('#b646ff') },
    uRoughness: { value: 0.08 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: heroVert,
    fragmentShader: heroFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const geo = new THREE.IcosahedronGeometry(1.0, 4);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'SYSTEM_CORE';
  mesh.position.set(0, 0.16, -0.55);
  scene.add(mesh);

  const edgeGeo = new THREE.EdgesGeometry(geo, 18);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x00d4e8,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.scale.setScalar(1.03);
  mesh.add(edges);

  const innerGeo = new THREE.IcosahedronGeometry(0.56, 1);
  const inner = new THREE.LineSegments(
    new THREE.EdgesGeometry(innerGeo),
    new THREE.LineBasicMaterial({
      color: 0xb646ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  inner.rotation.set(0.45, 0.2, -0.25);
  mesh.add(inner);

  return { mesh, uniforms };
}
