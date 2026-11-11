import * as THREE from 'three';

const STEP = 2; // 2m 간격으로 주행선을 잘게 나눈다

// 제어점으로 닫힌 곡선을 만들고, 도로·연석·지형·AI가 함께 쓰는 표본점 목록을 만든다
export function buildCoursePath(course) {
  const ctrl = course.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal', 0.5);
  const length = curve.getLength();
  const count = Math.round(length / STEP);
  const samples = [];

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const flat = new THREE.Vector3(tan.x, 0, tan.z).normalize();
    const right = new THREE.Vector3(-flat.z, 0, flat.x);
    samples.push({ i, t, p, tan, right, dist: t * length });
  }

  // 곡률: 앞뒤 방향 차이. 연석을 굽은 곳에 두껍게 깔 때 쓴다
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 3 + count) % count].tan;
    const b = samples[(i + 3) % count].tan;
    const cross = a.x * b.z - a.z * b.x;
    samples[i].bend = cross; // +: 오른쪽으로 굽음, -: 왼쪽
  }

  const grid = buildGrid(samples, 24);

  return {
    course,
    curve,
    length,
    samples,
    width: course.width,
    nearest: (x, z, radius = 80) => nearestSample(grid, samples, x, z, radius),
    pointAt(progress, side = 0, out = new THREE.Vector3()) {
      const s = samples[Math.floor(((progress % 1) + 1) % 1 * count) % count];
      return out.copy(s.p).addScaledVector(s.right, side);
    },
    sampleAt(progress) {
      return samples[Math.floor(((progress % 1) + 1) % 1 * count) % count];
    },
    // 한 점을 주행선 위에 투영한다: 진행률, 도로 높이, 중심선에서 떨어진 거리(좌우)
    // hint(직전 표본 번호)를 주면 그 근처만 살펴서 빠르다
    project(x, z, hint = -1) {
      if (hint < 0) {
        const n = nearestSample(grid, samples, x, z, 400);
        if (!n) return null;
        hint = n.sample.i;
      }
      let bi = hint;
      let bu = 0;
      let bx = 0;
      let bz = 0;
      let bestD2 = Infinity;
      for (let k = -24; k <= 24; k++) {
        const i = (hint + k + count) % count;
        const a = samples[i].p;
        const b = samples[(i + 1) % count].p;
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        let u = ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz);
        u = Math.max(0, Math.min(1, u));
        const px = a.x + abx * u;
        const pz = a.z + abz * u;
        const d2 = (x - px) ** 2 + (z - pz) ** 2;
        if (d2 < bestD2) { bestD2 = d2; bi = i; bu = u; bx = px; bz = pz; }
      }
      const s = samples[bi];
      const nextY = samples[(bi + 1) % count].p.y;
      return {
        index: bi,
        progress: (bi + bu) / count,
        y: s.p.y + (nextY - s.p.y) * bu,
        dist: Math.sqrt(bestD2),
        lateral: (x - bx) * s.right.x + (z - bz) * s.right.z,
        sample: s,
      };
    },
  };
}

function buildGrid(samples, cell) {
  const map = new Map();
  for (const s of samples) {
    const key = `${Math.floor(s.p.x / cell)},${Math.floor(s.p.z / cell)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s.i);
  }
  return { map, cell };
}

function nearestSample(grid, samples, x, z, radius) {
  const { map, cell } = grid;
  const r = Math.ceil(radius / cell);
  const cx = Math.floor(x / cell);
  const cz = Math.floor(z / cell);
  let best = null;
  let bestD2 = Infinity;
  for (let gx = cx - r; gx <= cx + r; gx++) {
    for (let gz = cz - r; gz <= cz + r; gz++) {
      const list = map.get(`${gx},${gz}`);
      if (!list) continue;
      for (const idx of list) {
        const p = samples[idx].p;
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = samples[idx]; }
      }
    }
  }
  return best ? { sample: best, dist: Math.sqrt(bestD2) } : null;
}
