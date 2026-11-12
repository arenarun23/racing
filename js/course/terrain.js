import * as THREE from 'three';
import { seededRandom, fbm, smoothstep, lerp } from '../util/random.js';

const SIZE = 1500;
const SEGMENTS = 240;

// 달 표면: 완만한 기복 + 크레이터. 도로 주변은 도로 높이에 맞춰 평평하게 다듬는다.
export function createTerrain(path, { quality = 'standard' } = {}) {
  const course = path.course;
  const rand = seededRandom(course.seed);
  const half = path.width / 2;

  const center = new THREE.Vector3();
  path.samples.forEach((s) => center.add(s.p));
  center.divideScalar(path.samples.length).setY(0);

  const kind = course.theme?.kind || 'moon';
  const craters = makeCraters(path, center, rand, { moon: 70, mars: 28, europa: 6 }[kind] ?? 70);

  function naturalHeight(x, z) {
    let h = fbm(x / 220, z / 220, 4, course.seed) * 7 + fbm(x / 45, z / 45, 3, course.seed + 5) * 1.1;
    if (kind === 'mars') {
      // 바람이 만든 모래 언덕(사구): 한 방향으로 늘어선 물결
      h += Math.sin((x * 0.8 + z * 0.6) / 14 + fbm(x / 90, z / 90, 2, 9) * 4) * 1.4;
      h += fbm(x / 400, z / 400, 3, 31) * 10;
    } else if (kind === 'europa') {
      // 얼음 지각이 갈라지며 생긴 이중 능선
      const line = Math.abs(Math.sin((x * 0.35 - z * 0.94) / 38 + fbm(x / 160, z / 160, 2, 4) * 3));
      h += Math.exp(-(((line - 0.06) / 0.05) ** 2)) * 2.2;
      h *= 0.7;
    }
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.r * 1.8) continue;
      const k = d / c.r;
      if (k < 1) h -= c.depth * (1 - k * k);
      h += c.rim * Math.exp(-(((k - 1) / 0.28) ** 2));
    }
    // 멀리 갈수록 살짝 내려가 지평선이 둥글게 보이게 한다
    const far = Math.hypot(x - center.x, z - center.z);
    h -= smoothstep(450, SIZE / 2, far) * 30;
    return h;
  }

  function heightAt(x, z) {
    const n = naturalHeight(x, z);
    const near = path.nearest(x, z, 70);
    if (!near) return n;
    const roadY = near.sample.p.y - 0.3;
    const f = smoothstep(half + 1.5, half + 30, near.dist);
    return lerp(roadY, n, f);
  }

  const segs = quality === 'light' ? 160 : SEGMENTS;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);
  geo.translate(center.x, 0, center.z);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    const far = Math.hypot(x - center.x, z - center.z);
    const fade = 1 - smoothstep(420, SIZE / 2, far) * (kind === 'mars' ? 0.15 : 0.55);
    const [r, g, b] = groundColor(kind, x, z, h);
    colors[i * 3] = r * fade;
    colors[i * 3 + 1] = g * fade;
    colors[i * 3 + 2] = b * fade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const grain = grainTexture(course.seed);
  grain.repeat.set(SIZE / 14, SIZE / 14);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  const group = new THREE.Group();
  group.add(mesh);
  group.add(createRocks(path, heightAt, center, rand, quality, course.theme?.rock ?? 0x8d8a84));

  return { group, heightAt, center };
}

// 땅 색: 달(회색 고지와 어두운 바다) / 화성(붉은 흙과 짙은 바위) / 유로파(흰 얼음과 갈색 줄무늬)
function groundColor(kind, x, z, h) {
  const n = fbm(x / 12, z / 12, 2, 3) * 0.04;
  if (kind === 'mars') {
    const dark = smoothstep(-0.1, 0.35, fbm(x / 300, z / 300, 2, 51));
    const k = lerp(1, 0.68, dark) + n + Math.min(0, h) * 0.004;
    return [0.62 * k, 0.33 * k, 0.19 * k];
  }
  if (kind === 'europa') {
    const line = Math.abs(Math.sin((x * 0.35 - z * 0.94) / 38 + fbm(x / 160, z / 160, 2, 4) * 3));
    const stain = Math.exp(-(((line - 0.06) / 0.07) ** 2)) * 0.75 + smoothstep(0.2, 0.5, fbm(x / 260, z / 260, 2, 8)) * 0.35;
    const k = 1.02 + n;
    return [lerp(0.86, 0.6, stain) * k, lerp(0.93, 0.44, stain) * k, lerp(1.0, 0.32, stain) * k];
  }
  // 달: 바다(어두운 현무암 평원)와 고지(밝은 회색)를 큰 무늬로 섞는다
  const mare = smoothstep(-0.15, 0.25, fbm(x / 400, z / 400, 2, 77));
  const g = lerp(0.56, 0.4, mare) + n + Math.min(0, h) * 0.006;
  return [g, g * 0.985, g * 0.96];
}

function makeCraters(path, center, rand, count = 70) {
  const list = [];
  const half = path.width / 2;
  let tries = 0;
  while (list.length < count && tries < 2000) {
    tries++;
    const big = rand() < 0.12;
    const r = big ? 26 + rand() * 40 : 4 + rand() * 14;
    const x = center.x + (rand() - 0.5) * 1200;
    const z = center.z + (rand() - 0.5) * 1200;
    const near = path.nearest(x, z, 120);
    if (near && near.dist < r * 1.9 + half + 6) continue;
    list.push({ x, z, r, depth: r * (0.16 + rand() * 0.08), rim: r * (0.05 + rand() * 0.04) });
  }
  return list;
}

function createRocks(path, heightAt, center, rand, quality, color = 0x8d8a84) {
  const count = quality === 'light' ? 220 : 520;
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: color === 0xc4d6e2 ? 0.35 : 1, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const half = path.width / 2;
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 8) {
    tries++;
    // 절반은 도로 가까이에 뿌려 속도감을 준다
    let x;
    let z;
    if (rand() < 0.5) {
      const smp = path.samples[Math.floor(rand() * path.samples.length)];
      const side = (rand() < 0.5 ? -1 : 1) * (half + 5 + rand() * 40);
      x = smp.p.x + smp.right.x * side;
      z = smp.p.z + smp.right.z * side;
    } else {
      x = center.x + (rand() - 0.5) * 900;
      z = center.z + (rand() - 0.5) * 900;
    }
    const near = path.nearest(x, z, 40);
    if (near && near.dist < half + 4) continue;
    const size = 0.25 + rand() ** 3 * 2.6;
    p.set(x, heightAt(x, z) + size * 0.25, z);
    e.set(rand() * 3, rand() * 3, rand() * 3);
    q.setFromEuler(e);
    s.set(size * (0.8 + rand() * 0.6), size * (0.5 + rand() * 0.4), size * (0.8 + rand() * 0.6));
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    placed++;
  }
  mesh.count = placed;
  mesh.name = 'rocks';
  return mesh;
}

function grainTexture(seed) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rand = seededRandom(seed + 11);
  for (let i = 0; i < size * size; i++) {
    const v = 200 + rand() * 55;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 작은 운석 자국
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 4;
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.1})`;
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
