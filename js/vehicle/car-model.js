import * as THREE from 'three';

// 달 레이서: 낮은 차체 + 큰 바퀴 + 투명 캐노피 + 뒤쪽 추진구. 로컬 +z가 앞, +x가 왼쪽.
// style: racer(루나 레이서) / rover(탐사 로버) / shuttle(미니 셔틀) / pod(캡슐 포드)
// 모양만 다르고 성능은 모두 같다. 바퀴 위치(앞뒤 1.45m, 좌우 1.25m)도 같다.
export function createCarModel({ body = 0xf2a33a, trim = 0x1d2633, helmet = 0xf4f1e8, style = 'racer' } = {}) {
  const root = new THREE.Group();
  root.name = 'car';
  const tilt = new THREE.Group(); // 차체 기울기(언덕·좌우)는 여기에
  root.add(tilt);

  const paint = new THREE.MeshStandardMaterial({ color: body, roughness: 0.35, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.55, metalness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.3, metalness: 0.8 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.38 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x7fd4ff });

  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const visor = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.1, metalness: 0.9 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: helmet, roughness: 0.4 });
  const driver = (x, y, z) => {
    add(tilt, new THREE.SphereGeometry(0.28, 16, 12), helmetMat, x, y, z);
    add(tilt, new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), visor, x, y + 0.01, z + 0.18).rotation.x = Math.PI / 2;
  };
  const M = { paint, dark, steel, glass, add, driver };
  (BODIES[style] || BODIES.racer)(tilt, M);

  const nozzles = [];
  for (const x of [0.45, -0.45]) {
    const n = add(tilt, new THREE.CylinderGeometry(0.22, 0.3, 0.5, 14), steel, x, 0.8, -2.3);
    n.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.19, 14), glow.clone());
    core.position.set(x, 0.8, -2.56);
    core.rotation.y = Math.PI;
    tilt.add(core);
    nozzles.push(core);
  }
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flame.position.set(0, 0.8, -2.9);
  flame.scale.set(1.6, 0.7, 1);
  tilt.add(flame);

  // 바퀴 4개 (앞바퀴는 조향)
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 22);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.44, 6);
  hubGeo.rotateZ(Math.PI / 2);
  const spots = [[1.25, 1.45, true], [-1.25, 1.45, true], [1.25, -1.45, false], [-1.25, -1.45, false]];
  if (style === 'rover') spots.push([1.25, 0, false], [-1.25, 0, false]); // 로버는 가운데 바퀴가 하나 더
  for (const [x, z, front] of spots) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.55, z);
    const spin = new THREE.Group();
    pivot.add(spin);
    const w = new THREE.Mesh(wheelGeo, tire);
    w.castShadow = true;
    spin.add(w);
    spin.add(new THREE.Mesh(hubGeo, steel));
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.86), dark);
      spoke.rotation.x = (k * Math.PI) / 3;
      spin.add(spoke);
    }
    tilt.add(pivot);
    wheels.push({ pivot, spin, front });
  }

  return {
    root,
    tilt,
    // 물리 상태를 모양에 반영한다
    sync(state, dt) {
      root.position.copy(state.pos);
      root.rotation.set(0, state.heading, 0);
      tilt.rotation.set(state.pitch, 0, state.roll, 'XZY');
      for (const w of wheels) {
        w.spin.rotation.x = state.wheelSpin;
        if (w.front) w.pivot.rotation.y = state.steerVisual * 0.45;
      }
      const power = state.throttle;
      const boost = state.boostLevel || 0; // 0, 1, 2단
      const k = 1 - Math.exp(-dt * 10);
      flame.material.opacity += ((0.25 + power * 0.75) - flame.material.opacity) * k;
      flame.scale.y = 0.5 + power * 0.5 + boost * 0.5 + Math.random() * 0.12;
      flame.scale.x = 1.2 + power * 0.8 + boost * 1.4;
      flame.material.color.setRGB(1, boost === 2 ? 0.75 : 1, boost === 2 ? 0.55 : 1); // 2단은 주황빛
      for (const n of nozzles) n.material.color.setRGB(0.5 + power * 0.5, 0.83, 1);
    },
  };
}

// 머신별 차체 모양 (로컬 +z가 앞)
const BODIES = {
  racer(tilt, { paint, dark, glass, add, driver }) {
    // 앞이 낮은 쐐기 모양
    const shape = new THREE.Shape();
    shape.moveTo(-2.1, 0);
    shape.lineTo(2.2, 0);
    shape.lineTo(2.2, 0.22);
    shape.lineTo(0.6, 0.62);
    shape.lineTo(-1.6, 0.7);
    shape.lineTo(-2.1, 0.55);
    shape.lineTo(-2.1, 0);
    const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
    hullGeo.translate(0, 0, -0.75);
    hullGeo.rotateY(-Math.PI / 2); // 모양의 +x(앞)를 로컬 +z로
    add(tilt, hullGeo, paint, 0, 0.42, 0);
    add(tilt, new THREE.BoxGeometry(2.3, 0.14, 4.6), dark, 0, 0.36, 0); // 바닥판
    add(tilt, new THREE.BoxGeometry(0.18, 0.08, 4.2), dark, 0.5, 1.06, -0.1); // 줄무늬
    add(tilt, new THREE.BoxGeometry(0.18, 0.08, 4.2), dark, -0.5, 1.06, -0.1);
    const canopy = add(tilt, new THREE.SphereGeometry(0.72, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.05, -0.2);
    canopy.scale.set(0.9, 0.85, 1.5);
    canopy.castShadow = false;
    driver(0, 1.32, -0.35);
    // 뒤 날개
    add(tilt, new THREE.BoxGeometry(2.4, 0.08, 0.6), dark, 0, 1.42, -2.0);
    add(tilt, new THREE.BoxGeometry(0.1, 0.5, 0.5), dark, 0.9, 1.18, -2.0);
    add(tilt, new THREE.BoxGeometry(0.1, 0.5, 0.5), dark, -0.9, 1.18, -2.0);
  },

  rover(tilt, { paint, dark, steel, glass, add, driver }) {
    // 상자 모양 차체 + 앞쪽 운전석 + 지붕 안테나
    add(tilt, new THREE.BoxGeometry(2.1, 0.5, 4.2), dark, 0, 0.75, -0.1);
    add(tilt, new THREE.BoxGeometry(2.0, 0.7, 2.2), paint, 0, 1.3, -0.9);
    const cab = add(tilt, new THREE.BoxGeometry(1.8, 0.8, 1.3), glass, 0, 1.4, 0.9);
    cab.castShadow = false;
    driver(0, 1.35, 0.85);
    for (const x of [0.95, -0.95]) {
      add(tilt, new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), steel, x, 1.8, 1.5).rotation.x = -0.25;
      add(tilt, new THREE.BoxGeometry(0.12, 0.12, 2.6), steel, x, 1.88, 0.3);
    }
    add(tilt, new THREE.BoxGeometry(2.0, 0.08, 0.08), steel, 0, 1.92, 1.55);
    add(tilt, new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), steel, -0.6, 2.1, -1.6);
    const dish = add(tilt, new THREE.ConeGeometry(0.45, 0.2, 14, 1, true), steel, -0.6, 2.6, -1.6);
    dish.rotation.x = Math.PI * 0.8;
    add(tilt, new THREE.BoxGeometry(2.2, 0.1, 0.5), paint, 0, 1.0, 2.0); // 앞 범퍼
  },

  shuttle(tilt, { paint, dark, add, driver }) {
    // 둥근 동체 + 삼각 날개 + 꼬리 날개
    const white = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.45, metalness: 0.1 });
    const body = add(tilt, new THREE.CylinderGeometry(0.62, 0.75, 4.0, 18), white, 0, 1.05, -0.2);
    body.rotation.x = Math.PI / 2;
    const nose = add(tilt, new THREE.SphereGeometry(0.62, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 1.05, 1.8);
    nose.rotation.x = Math.PI / 2;
    nose.scale.set(1, 1.5, 1);
    for (const side of [1, -1]) {
      // 좌우 날개는 모양을 따로 만든다 (음수 크기로 뒤집으면 면이 뒤집혀 보이지 않음)
      const wing = new THREE.Shape();
      wing.moveTo(0, 0.6);
      wing.lineTo(side * 1.45, -1.6);
      wing.lineTo(0, -1.9);
      wing.lineTo(0, 0.6);
      const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.1, bevelEnabled: false });
      wingGeo.rotateX(Math.PI / 2);
      add(tilt, wingGeo, paint, side * 0.55, 0.85, 0);
    }
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(-0.9, 0);
    fin.lineTo(-1.2, 1.1);
    fin.lineTo(-0.7, 1.1);
    fin.lineTo(0, 0);
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false });
    finGeo.rotateY(-Math.PI / 2); // 모양의 -x(뒤)를 로컬 -z로
    add(tilt, finGeo, paint, 0.04, 1.55, -1.3);
    add(tilt, new THREE.BoxGeometry(1.0, 0.22, 0.5), dark, 0, 1.42, 1.0); // 조종석 창
    driver(0, 1.48, 0.55);
    add(tilt, new THREE.BoxGeometry(2.3, 0.12, 4.2), dark, 0, 0.42, 0); // 바닥판
  },

  pod(tilt, { paint, dark, glass, add, driver }) {
    // 둥근 착륙 캡슐 + 둘레 띠 + 위쪽 유리 돔
    const shell = add(tilt, new THREE.SphereGeometry(1, 24, 16), paint, 0, 1.05, -0.1);
    shell.scale.set(1.25, 0.72, 1.9);
    const band = add(tilt, new THREE.TorusGeometry(1.0, 0.12, 8, 32), dark, 0, 0.95, -0.1);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1.3, 1.95, 1);
    const dome = add(tilt, new THREE.SphereGeometry(0.62, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.45, 0.25);
    dome.castShadow = false;
    driver(0, 1.62, 0.2);
    for (const side of [1, -1]) {
      const f = add(tilt, new THREE.BoxGeometry(0.08, 0.5, 0.7), dark, side * 0.85, 1.45, -1.55);
      f.rotation.z = side * -0.4;
    }
  },
};

function flameTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(230,248,255,1)');
  g.addColorStop(0.3, 'rgba(127,212,255,0.7)');
  g.addColorStop(1, 'rgba(60,120,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
