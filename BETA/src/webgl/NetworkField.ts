import * as THREE from 'three';

export type NetworkFieldHandle = {
  group: THREE.Group;
  update: (dt: number, t: number, scroll: number, mouse: THREE.Vector2) => void;
  dispose: () => void;
};

type Edge = { a: number; b: number; length: number };

type Packet = {
  edge: number;
  t: number;
  speed: number;
  lane: number;
};

function fract(v: number): number {
  return v - Math.floor(v);
}

export function createNetworkField(scene: THREE.Scene, nodeCount = 150): NetworkFieldHandle {
  const group = new THREE.Group();
  group.name = 'LIMBO_NETWORK_FIELD';
  group.position.set(0, 0.15, -0.55);
  scene.add(group);

  const nodes: THREE.Vector3[] = [];
  const shellR = 2.55;

  for (let i = 0; i < nodeCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = shellR * (0.72 + Math.random() * 0.38);
    nodes.push(
      new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.64,
        r * Math.cos(phi)
      )
    );
  }

  const edgeSet = new Set<string>();
  const edges: Edge[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const nearest: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < nodeCount; j++) {
      if (i === j) continue;
      const d = nodes[i].distanceTo(nodes[j]);
      nearest.push({ j, d });
    }
    nearest.sort((a, b) => a.d - b.d);
    for (const hit of nearest.slice(0, 3)) {
      const a = Math.min(i, hit.j);
      const b = Math.max(i, hit.j);
      const key = `${a}:${b}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      if (hit.d < 1.65) edges.push({ a, b, length: hit.d });
    }
  }

  const linePositions = new Float32Array(edges.length * 6);
  const lineColors = new Float32Array(edges.length * 6);
  const cyan = new THREE.Color('#00d4e8');
  const magenta = new THREE.Color('#b646ff');
  const tmpColor = new THREE.Color();

  edges.forEach((edge, i) => {
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    const j = i * 6;
    linePositions[j] = a.x;
    linePositions[j + 1] = a.y;
    linePositions[j + 2] = a.z;
    linePositions[j + 3] = b.x;
    linePositions[j + 4] = b.y;
    linePositions[j + 5] = b.z;

    tmpColor.copy(cyan).lerp(magenta, (i % 9) / 8);
    for (let c = 0; c < 2; c++) {
      lineColors[j + c * 3] = tmpColor.r;
      lineColors[j + c * 3 + 1] = tmpColor.g;
      lineColors[j + c * 3 + 2] = tmpColor.b;
    }
  });

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.name = 'ROUTES';
  group.add(lines);

  const nodePositions = new Float32Array(nodes.length * 3);
  nodes.forEach((p, i) => {
    nodePositions[i * 3] = p.x;
    nodePositions[i * 3 + 1] = p.y;
    nodePositions[i * 3 + 2] = p.z;
  });
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
  const nodeMat = new THREE.PointsMaterial({
    color: 0x7ef7ff,
    size: 0.045,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const nodePoints = new THREE.Points(nodeGeo, nodeMat);
  nodePoints.name = 'NODES';
  group.add(nodePoints);

  const packetCount = Math.min(46, edges.length);
  const packets: Packet[] = [];
  const packetPositions = new Float32Array(packetCount * 3);
  for (let i = 0; i < packetCount; i++) {
    packets.push({
      edge: (i * 17) % edges.length,
      t: Math.random(),
      speed: 0.16 + Math.random() * 0.34,
      lane: Math.random() * 2 - 1,
    });
  }
  const packetGeo = new THREE.BufferGeometry();
  packetGeo.setAttribute('position', new THREE.BufferAttribute(packetPositions, 3));
  const packetMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.07,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const packetPoints = new THREE.Points(packetGeo, packetMat);
  packetPoints.name = 'PACKETS';
  group.add(packetPoints);

  const orbitA = new THREE.Mesh(
    new THREE.TorusGeometry(shellR * 0.83, 0.008, 6, 128),
    new THREE.MeshBasicMaterial({ color: 0x00d4e8, transparent: true, opacity: 0.22, depthWrite: false })
  );
  orbitA.rotation.x = Math.PI * 0.5;
  group.add(orbitA);

  const orbitB = new THREE.Mesh(
    new THREE.TorusGeometry(shellR * 1.06, 0.006, 6, 128),
    new THREE.MeshBasicMaterial({ color: 0xb646ff, transparent: true, opacity: 0.14, depthWrite: false })
  );
  orbitB.rotation.x = 1.02;
  orbitB.rotation.z = -0.55;
  group.add(orbitB);

  const orbitC = new THREE.Mesh(
    new THREE.TorusGeometry(shellR * 0.62, 0.004, 6, 96),
    new THREE.MeshBasicMaterial({ color: 0x1ec99a, transparent: true, opacity: 0.13, depthWrite: false })
  );
  orbitC.rotation.y = 0.9;
  orbitC.rotation.z = 0.35;
  group.add(orbitC);

  const sweep = new THREE.Mesh(
    new THREE.PlaneGeometry(shellR * 2.3, shellR * 2.3),
    new THREE.MeshBasicMaterial({
      color: 0x00d4e8,
      transparent: true,
      opacity: 0.025,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sweep.rotation.x = Math.PI * 0.5;
  sweep.position.y = -0.15;
  group.add(sweep);

  const packetAttr = packetGeo.getAttribute('position') as THREE.BufferAttribute;
  const packetTmpA = new THREE.Vector3();
  const packetTmpB = new THREE.Vector3();
  const packetTmp = new THREE.Vector3();

  function update(dt: number, t: number, scroll: number, mouse: THREE.Vector2): void {
    const scrollPhase = scroll * Math.PI * 2.0;
    const targetScale = 1.0 + Math.sin(scrollPhase * 0.5) * 0.035;
    group.scale.x += (targetScale - group.scale.x) * Math.min(1, dt * 3.5);
    group.scale.y = group.scale.x;
    group.scale.z = group.scale.x;

    group.rotation.y += dt * (0.055 + scroll * 0.02);
    group.rotation.x = Math.sin(t * 0.18) * 0.025 + mouse.y * 0.035;
    group.rotation.z = mouse.x * 0.028;

    lines.material.opacity = 0.22 + Math.sin(t * 1.4) * 0.035;
    nodeMat.opacity = 0.72 + Math.sin(t * 2.1) * 0.1;
    packetMat.opacity = 0.78 + Math.sin(t * 2.7) * 0.12;

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      packet.t = fract(packet.t + dt * packet.speed * (1 + scroll * 0.9));
      const edge = edges[packet.edge];
      packetTmpA.copy(nodes[edge.a]);
      packetTmpB.copy(nodes[edge.b]);
      packetTmp.lerpVectors(packetTmpA, packetTmpB, packet.t);
      const bend = Math.sin(packet.t * Math.PI) * packet.lane * 0.025;
      packetTmp.y += bend;
      packetAttr.setXYZ(i, packetTmp.x, packetTmp.y, packetTmp.z);
    }
    packetAttr.needsUpdate = true;

    orbitA.rotation.z = t * 0.12;
    orbitB.rotation.z = -0.55 - t * 0.065;
    orbitC.rotation.x = t * 0.08;
    sweep.rotation.z = t * 0.07;
  }

  function dispose(): void {
    scene.remove(group);
    lineGeo.dispose();
    lineMat.dispose();
    nodeGeo.dispose();
    nodeMat.dispose();
    packetGeo.dispose();
    packetMat.dispose();
    for (const obj of [orbitA, orbitB, orbitC, sweep]) {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }
  }

  return { group, update, dispose };
}
