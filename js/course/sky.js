import * as THREE from 'three';
import { seededRandom, fbm } from '../util/random.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
export const EARTH_DIR = new THREE.Vector3(0.62, 0.3, -0.73).normalize();

// 하늘: 별, 행성(지구·화성의 두 위성·목성), 태양 (카메라를 따라다니며 항상 멀리 보인다)
export function createSky(seed = 1, theme = {}) {
  const group = new THREE.Group();
  group.name = 'sky';
  if (theme.stars !== false) {
    group.add(stars(seed, 3200, 1.4, 0.75));
    group.add(stars(seed + 1, 260, 3.2, 1));
  }
  const planet = theme.planet || 'earth';
  if (planet === 'earth') group.add(earth());
  if (planet === 'mars-moons') group.add(marsMoons());
  if (planet === 'jupiter') group.add(jupiter());
  // 태양은 멀어질수록 작아 보인다 (화성은 지구의 약 1.5배, 유로파는 약 5배 거리)
  group.add(sun({ earth: 260, 'mars-moons': 190, jupiter: 80 }[planet] ?? 260, theme.kind === 'mars'));
  return {
    group,
    follow(camera) { group.position.copy(camera.position); },
  };
}

function stars(seed, count, size, opacity) {
  const rand = seededRandom(seed * 13);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const y = Math.abs(u) * 0.98 + 0.02; // 지평선 아래는 지형에 가려지므로 위쪽 반구에만
    pos.set([Math.cos(a) * r * 2600, y * 2600, Math.sin(a) * r * 2600], i * 3);
    const tint = rand();
    col.set(tint < 0.15 ? [1, 0.85, 0.7] : tint > 0.85 ? [0.75, 0.85, 1] : [1, 1, 1], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity, depthWrite: false, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}

function earthTexture() {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * Math.PI * 2;
      const lat = (y / h) * Math.PI - Math.PI / 2;
      // 구면 좌표로 노이즈를 뽑아 경계 이음새가 없게 한다
      const nx = Math.cos(lat) * Math.cos(lon) * 2.2;
      const nz = Math.cos(lat) * Math.sin(lon) * 2.2;
      const ny = Math.sin(lat) * 2.2;
      const land = fbm(nx + ny * 0.7 + 10, nz - ny * 0.4 + 10, 5, 42);
      const cloud = fbm(nx * 2.1 + 3, nz * 2.1 + ny, 4, 9);
      let r = 22; let g = 64; let b = 140;
      if (land > 0.08) {
        const dry = fbm(nx * 3, nz * 3, 2, 5) > 0.1;
        [r, g, b] = dry ? [150, 128, 84] : [58, 112, 62];
      }
      if (Math.abs(lat) > 1.25) [r, g, b] = [236, 240, 245];
      const cl = Math.max(0, cloud - 0.05) * 2.2;
      r += (245 - r) * Math.min(1, cl);
      g += (248 - g) * Math.min(1, cl);
      b += (252 - b) * Math.min(1, cl);
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function earth() {
  const g = new THREE.Group();
  const dist = 2200;
  const radius = 150;
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.8, metalness: 0, fog: false }),
  );
  globe.rotation.set(0.4, 2.2, 0.2);
  globe.receiveShadow = false;
  globe.name = 'earth';
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(110,170,255,0.55)', 'rgba(110,170,255,0)'),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.setScalar(radius * 2.9);
  g.add(halo, globe);
  g.position.copy(EARTH_DIR).multiplyScalar(dist);
  return g;
}

// 화성의 두 작은 위성 포보스·데이모스 (울퉁불퉁한 감자 모양)
function marsMoons() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 1, flatShading: true, fog: false });
  [[EARTH_DIR, 70, 2200], [new THREE.Vector3(-0.3, 0.5, -0.81).normalize(), 32, 2300]].forEach(([dir, size, dist], i) => {
    const geo = new THREE.IcosahedronGeometry(size, 1);
    const p = geo.attributes.position;
    const rand = seededRandom(40 + i);
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (1.3 + rand() * 0.15), p.getY(k) * (0.85 + rand() * 0.15), p.getZ(k) * (0.95 + rand() * 0.15));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(dir).multiplyScalar(dist);
    m.rotation.set(0.3, i * 1.7, 0.5);
    g.add(m);
  });
  return g;
}

// 목성: 유로파에서 보면 하늘의 아주 큰 부분을 차지한다 (줄무늬와 대적점)
function jupiter() {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const bands = ['#e9dcc3', '#c79d74', '#efe3cc', '#b98a62', '#e6d6b8', '#a9764f', '#ecdfc6', '#c69a70', '#e3d2b2'];
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const i = Math.floor((t + Math.sin(t * 40) * 0.006) * bands.length);
    ctx.fillStyle = bands[Math.min(bands.length - 1, i)];
    ctx.fillRect(0, y, w, 1);
  }
  ctx.globalAlpha = 0.25;
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#7a4e30';
    ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 1.5);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#b5553a';
  ctx.beginPath();
  ctx.ellipse(w * 0.62, h * 0.66, 22, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(520, 48, 32),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, fog: false }),
  );
  globe.rotation.set(0.05, 1.2, 0.08);
  globe.position.copy(new THREE.Vector3(0.55, 0.38, -0.74).normalize()).multiplyScalar(2400);
  globe.name = 'jupiter';
  return globe;
}

function sun(size = 260, hazy = false) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(hazy ? 'rgba(255,244,226,1)' : 'rgba(255,250,235,1)', 'rgba(255,230,180,0)'),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  s.scale.setScalar(size);
  s.position.copy(SUN_DIR).multiplyScalar(2300);
  return s;
}
