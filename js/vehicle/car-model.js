import * as THREE from 'three';

// 달 레이서: 낮은 차체 + 큰 바퀴 + 투명 캐노피 + 뒤쪽 추진구. 로컬 +z가 앞, +x가 왼쪽.
export function createCarModel({ body = 0xf2a33a, trim = 0x1d2633 } = {}) {
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

  // 차체: 앞이 낮은 쐐기 모양
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
  const hull = add(tilt, hullGeo, paint, 0, 0.42, 0);
  hull.name = 'hull';

  add(tilt, new THREE.BoxGeometry(2.3, 0.14, 4.6), dark, 0, 0.36, 0); // 바닥판
  add(tilt, new THREE.BoxGeometry(0.18, 0.08, 4.2), dark, 0.5, 1.06, -0.1); // 줄무늬
  add(tilt, new THREE.BoxGeometry(0.18, 0.08, 4.2), dark, -0.5, 1.06, -0.1);

  // 캐노피와 운전자 헬멧
  const canopy = add(tilt, new THREE.SphereGeometry(0.72, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.05, -0.2);
  canopy.scale.set(0.9, 0.85, 1.5);
  canopy.castShadow = false;
  add(tilt, new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.4 }), 0, 1.32, -0.35);
  add(tilt, new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.1, metalness: 0.9 }), 0, 1.33, -0.17)
    .rotation.x = Math.PI / 2;

  // 뒤 날개와 추진구
  add(tilt, new THREE.BoxGeometry(2.4, 0.08, 0.6), dark, 0, 1.42, -2.0);
  add(tilt, new THREE.BoxGeometry(0.1, 0.5, 0.5), dark, 0.9, 1.18, -2.0);
  add(tilt, new THREE.BoxGeometry(0.1, 0.5, 0.5), dark, -0.9, 1.18, -2.0);
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
  for (const [x, z, front] of [[1.25, 1.45, true], [-1.25, 1.45, true], [1.25, -1.45, false], [-1.25, -1.45, false]]) {
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
      const k = 1 - Math.exp(-dt * 10);
      flame.material.opacity += ((0.25 + power * 0.75) - flame.material.opacity) * k;
      flame.scale.y = 0.5 + power * 0.5 + Math.random() * 0.12;
      flame.scale.x = 1.2 + power * 0.8;
      for (const n of nozzles) n.material.color.setRGB(0.5 + power * 0.5, 0.83, 1);
    },
  };
}

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
