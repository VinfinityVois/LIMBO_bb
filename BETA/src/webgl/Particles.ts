import * as THREE from 'three';

export type ParticlesHandle = {
  points: THREE.Points;
  update: (dt: number, mouseNDC: THREE.Vector2, camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
};

export function createParticles(scene: THREE.Scene, count = 7000): ParticlesHandle {
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  const colA = new THREE.Color('#00d4e8');
  const colB = new THREE.Color('#e01a6f');
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const r = 1.8 + Math.random() * 4.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    const z = r * Math.cos(phi) - 1.2;
    positions[i3] = base[i3] = x;
    positions[i3 + 1] = base[i3 + 1] = y;
    positions[i3 + 2] = base[i3 + 2] = z;
    speeds[i] = 0.4 + Math.random() * 0.8;
    tmp.copy(colA).lerp(colB, Math.random());
    colors[i3] = tmp.r;
    colors[i3 + 1] = tmp.g;
    colors[i3 + 2] = tmp.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  const mouseWorld = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  function update(
    dt: number,
    mouseNDC: THREE.Vector2,
    camera: THREE.PerspectiveCamera
  ): void {
    mouseWorld.set(mouseNDC.x, mouseNDC.y, 0.5);
    mouseWorld.unproject(camera);
    camDir.copy(mouseWorld).sub(camera.position).normalize();
    mouseWorld.copy(camera.position).addScaledVector(camDir, 4.5);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const radius = 1.35;
    const force = 1.8;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let x = arr[i3];
      let y = arr[i3 + 1];
      let z = arr[i3 + 2];

      const dx = x - mouseWorld.x;
      const dy = y - mouseWorld.y;
      const dz = z - mouseWorld.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.0001;

      if (dist < radius) {
        const f = ((radius - dist) / radius) * force * speeds[i];
        x += (dx / dist) * f * dt;
        y += (dy / dist) * f * dt;
        z += (dz / dist) * f * dt;
      }

      const k = 1.6 * speeds[i] * dt;
      x += (base[i3] - x) * k;
      y += (base[i3 + 1] - y) * k;
      z += (base[i3 + 2] - z) * k;

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;
    }
    pos.needsUpdate = true;
  }

  function dispose(): void {
    scene.remove(points);
    geo.dispose();
    mat.dispose();
  }

  return { points, update, dispose };
}