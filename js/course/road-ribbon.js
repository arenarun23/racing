import * as THREE from 'three';

const TEX_LEN = 16; // 도로 무늬가 반복되는 길이 (m)

// 주행로: 도로면, 연석, 가장자리 유도등, 출발 게이트
export function createRoad(path) {
  const group = new THREE.Group();
  group.name = 'road';
  group.add(roadSurface(path));
  group.add(curbs(path, 1));
  group.add(curbs(path, -1));
  group.add(edgeLights(path));
  group.add(startGate(path));
  return group;
}

function ribbon(path, inner, outer, lift, uvAcross = [0, 1]) {
  const s = path.samples;
  const n = s.length;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  const idx = [];
  for (let k = 0; k <= n; k++) {
    const smp = s[k % n];
    const dist = k === n ? path.length : smp.dist;
    const a = smp.p.clone().addScaledVector(smp.right, inner);
    const b = smp.p.clone().addScaledVector(smp.right, outer);
    pos.set([a.x, a.y + lift, a.z, b.x, b.y + lift, b.z], k * 6);
    uv.set([uvAcross[0], dist / TEX_LEN, uvAcross[1], dist / TEX_LEN], k * 4);
    if (k < n) {
      const i0 = k * 2;
      idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 시계/반시계 방향과 무관하게 위를 보도록 법선 방향을 맞춘다
  if (geo.attributes.normal.getY(0) < 0) {
    geo.setIndex(idx.map((v, i) => (i % 3 === 1 ? idx[i + 1] : i % 3 === 2 ? idx[i - 1] : v)));
    geo.computeVertexNormals();
  }
  return geo;
}

function roadSurface(path) {
  const half = path.width / 2;
  const geo = ribbon(path, -half, half, 0.02);
  const mat = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.92, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'road-surface';
  return mesh;
}

function roadTexture() {
  const w = 256;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // 다져진 레골리스 포장판: 짙은 회색 판 + 이음새
  ctx.fillStyle = '#3a3c42';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = 50 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
  ctx.strokeStyle = 'rgba(20,22,26,0.7)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= h; y += h / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  // 가장자리 흰 선
  ctx.fillStyle = '#e9e6dc';
  ctx.fillRect(6, 0, 7, h);
  ctx.fillRect(w - 13, 0, 7, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function curbs(path, side) {
  const half = path.width / 2;
  const inner = side * half;
  const outer = side * (half + 1.6);
  const geo = ribbon(path, Math.min(inner, outer), Math.max(inner, outer), 0.09, side > 0 ? [0, 1] : [1, 0]);
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const ctx = c.getContext('2d');
  // 신호 주황 / 흰색 교차 (16m 텍스처에 8칸 → 2m 간격)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#f0ece2' : '#e8922e';
    ctx.fillRect(0, i * 8, 8, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  mesh.receiveShadow = true;
  mesh.name = side > 0 ? 'curb-right' : 'curb-left';
  return mesh;
}

function edgeLights(path) {
  const half = path.width / 2;
  const every = 6; // 표본 6개마다 = 12m
  const spots = [];
  path.samples.forEach((s, i) => {
    if (i % every) return;
    for (const side of [-1, 1]) spots.push(s.p.clone().addScaledVector(s.right, side * (half + 3)));
  });
  const group = new THREE.Group();
  group.name = 'edge-lights';
  const post = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x5b616b, roughness: 0.6, metalness: 0.4 }),
    spots.length,
  );
  const cap = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x7fd4ff }),
    spots.length,
  );
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => {
    m.makeTranslation(p.x, p.y + 0.55, p.z);
    post.setMatrixAt(i, m);
    m.makeTranslation(p.x, p.y + 1.18, p.z);
    cap.setMatrixAt(i, m);
  });
  post.castShadow = true;
  group.add(post, cap);
  return group;
}

function startGate(path) {
  const s = path.samples[0];
  const half = path.width / 2;
  const group = new THREE.Group();
  group.name = 'start-gate';

  // 바닥 체크무늬
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111316' : '#f4f1e8';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(path.width, 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.05;
  line.receiveShadow = true;
  group.add(line);

  // 게이트 기둥과 상단 보
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.35, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2633, roughness: 0.5, metalness: 0.3 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), metal);
    pillar.position.set(side * (half + 2.2), 4, 0);
    pillar.castShadow = true;
    group.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(path.width + 5.2, 1.6, 1), dark);
  beam.position.y = 8.4;
  beam.castShadow = true;
  group.add(beam);

  const label = document.createElement('canvas');
  label.width = 512;
  label.height = 64;
  const lctx = label.getContext('2d');
  lctx.fillStyle = '#1d2633';
  lctx.fillRect(0, 0, 512, 64);
  lctx.fillStyle = '#ffc861';
  lctx.font = '700 38px sans-serif';
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.fillText('출발 · 결승', 256, 34);
  const ltex = new THREE.CanvasTexture(label);
  ltex.colorSpace = THREE.SRGBColorSpace;
  for (const dir of [1, -1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(path.width, 1.4), new THREE.MeshBasicMaterial({ map: ltex }));
    panel.position.set(0, 8.4, dir * 0.51);
    if (dir < 0) panel.rotation.y = Math.PI;
    group.add(panel);
  }

  // 출발 신호등 5개
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshBasicMaterial({ color: 0x3a1414 }));
    lamp.position.set((i - 2) * 0.9, 7.1, 0.52); // 다가오는 차 쪽(로컬 +z)을 바라본다
    lamp.name = `start-lamp-${i}`;
    group.add(lamp);
  }

  // 게이트를 도로 방향에 맞춘다: 로컬 x = 도로 가로, 로컬 z = 진행 방향
  const fwd = new THREE.Vector3(s.tan.x, 0, s.tan.z).normalize();
  group.position.copy(s.p);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(s.right, new THREE.Vector3(0, 1, 0), fwd.clone().negate()));
  return group;
}
