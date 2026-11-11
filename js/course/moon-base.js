import * as THREE from 'three';

// 코스 옆 기지 시설. 모두 코드로 만든 단순한 형태(외부 모델 없음).
const M = {
  white: new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.55, metalness: 0.1 }),
  panel: new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.4, metalness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2a313b, roughness: 0.6, metalness: 0.4 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xe8922e, roughness: 0.5, metalness: 0.2 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.28, metalness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x3a8fc4, emissiveIntensity: 0.9, roughness: 0.2 }),
  warm: new THREE.MeshBasicMaterial({ color: 0xffd38a }),
  beacon: new THREE.MeshBasicMaterial({ color: 0xff4a3a }),
  solar: null,
};

function solarMaterial() {
  if (M.solar) return M.solar;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b2f5c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#8ea6cf';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  M.solar = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.6 });
  return M.solar;
}

const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

const rot = (m, x = 0, y = 0, z = 0) => {
  m.rotation.set(x, y, z);
  return m;
};

const BUILDERS = {
  base() {
    const g = new THREE.Group();
    const domes = [[0, 0, 11], [-16, 6, 8], [14, 8, 7]];
    domes.forEach(([x, z, r]) => {
      g.add(mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.white, x, 0, z));
      g.add(rot(mesh(new THREE.TorusGeometry(r, 0.35, 8, 40), M.amber, x, 0.3, z), Math.PI / 2));
    });
    // 연결 통로
    [[-8, 3, 0.35], [7, 4, -0.5]].forEach(([x, z, a]) => {
      const tube = mesh(new THREE.CylinderGeometry(1.6, 1.6, 9, 16), M.panel, x, 1.6, z);
      tube.rotation.set(0, a, Math.PI / 2);
      g.add(tube);
    });
    // 관제탑
    g.add(mesh(new THREE.CylinderGeometry(2.6, 3.2, 16, 12), M.white, 0, 8, -14));
    g.add(mesh(new THREE.CylinderGeometry(4.2, 3, 3, 12), M.glass, 0, 17, -14));
    g.add(mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.5, 12), M.dark, 0, 18.7, -14));
    const beacon = mesh(new THREE.SphereGeometry(0.5, 10, 8), M.beacon.clone(), 0, 19.6, -14);
    beacon.userData.blink = 1.3;
    g.add(beacon);
    // 착륙장
    const pad = mesh(new THREE.CylinderGeometry(9, 9, 0.3, 40), M.dark, -22, 0.15, -16);
    g.add(pad);
    g.add(rot(mesh(new THREE.TorusGeometry(7, 0.25, 6, 40), M.amber, -22, 0.35, -16), Math.PI / 2));
    return g;
  },

  pit() {
    const g = new THREE.Group();
    const len = 44;
    g.add(mesh(new THREE.BoxGeometry(len, 5, 9), M.white, 0, 2.5, 4.5));
    g.add(mesh(new THREE.BoxGeometry(len + 2, 0.6, 11), M.dark, 0, 5.3, 4.2));
    g.add(mesh(new THREE.BoxGeometry(len + 2, 0.5, 0.4), M.amber, 0, 5.1, -1.3));
    for (let i = 0; i < 6; i++) {
      const x = -len / 2 + 4 + i * ((len - 8) / 5);
      const bay = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.6), M.warm);
      bay.position.set(x, 1.9, -0.01);
      bay.rotation.y = Math.PI;
      g.add(bay);
    }
    // 피트 앞 차선 표시
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(len + 10, 5), new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.95 }));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.06, -3.4);
    lane.receiveShadow = true;
    g.add(lane);
    return g;
  },

  solar() {
    const g = new THREE.Group();
    const mat = solarMaterial();
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 7;
        const z = row * 8;
        g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 6), M.panel, x, 1.2, z));
        const p = mesh(new THREE.BoxGeometry(6, 0.12, 4), mat, x, 2.5, z);
        p.rotation.x = -0.45;
        g.add(p);
      }
    }
    return g;
  },

  dish() {
    const g = new THREE.Group();
    [0, 2.1, 4.2].forEach((a) => {
      const leg = mesh(new THREE.CylinderGeometry(0.2, 0.25, 7, 6), M.panel, Math.cos(a) * 1.6, 3.2, Math.sin(a) * 1.6);
      leg.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
      g.add(leg);
    });
    const head = new THREE.Group();
    head.position.y = 6.6;
    const bowl = mesh(new THREE.SphereGeometry(5, 32, 12, 0, Math.PI * 2, 0, 0.75), M.white);
    bowl.rotation.x = Math.PI;
    bowl.material = M.white.clone();
    bowl.material.side = THREE.DoubleSide;
    head.add(bowl);
    head.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 6), M.dark, 0, -2.6, 0));
    head.rotation.x = -0.9;
    head.userData.spin = 0.08;
    g.add(head);
    return g;
  },

  lander() {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(2.6, 2.6, 2.2, 8), M.gold, 0, 2.6, 0);
    g.add(body);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const leg = mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6), M.panel, Math.cos(a) * 3, 1.6, Math.sin(a) * 3);
      leg.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      g.add(leg);
      g.add(mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.15, 12), M.panel, Math.cos(a) * 4, 0.08, Math.sin(a) * 4));
    }
    g.add(mesh(new THREE.CylinderGeometry(1.8, 2.1, 2.2, 7), M.white, 0, 4.8, 0));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.2), M.dark, 0, 4.8, 1.95));
    g.add(mesh(new THREE.CylinderGeometry(0.8, 0.6, 0.8, 10), M.dark, 0, 1.2, 0));
    return g;
  },

  rover() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(3.2, 0.4, 2), M.panel, 0, 0.9, 0));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.6, 1.6), M.dark, -0.6, 1.4, 0));
    [[-1.2, 1], [1.2, 1], [-1.2, -1], [1.2, -1]].forEach(([x, z]) => {
      const w = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 14), M.dark, x, 0.45, z * 1.15);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    });
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), M.panel, 1.1, 1.9, 0.5));
    const umb = mesh(new THREE.ConeGeometry(0.7, 0.3, 12, 1, true), M.white, 1.1, 2.7, 0.5);
    umb.rotation.x = Math.PI;
    g.add(umb);
    return g;
  },

  tower() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.5, 1.4, 24, 4, 1, true), M.panel, 0, 12, 0));
    for (let y = 3; y < 24; y += 4) g.add(rot(mesh(new THREE.TorusGeometry(1.3 - y * 0.035, 0.08, 4, 4), M.amber, 0, y, 0), Math.PI / 2));
    const b = mesh(new THREE.SphereGeometry(0.6, 10, 8), M.beacon.clone(), 0, 24.6, 0);
    b.userData.blink = 0.9;
    g.add(b);
    g.add(mesh(new THREE.SphereGeometry(3, 20, 14), M.white, 6, 3, 2));
    g.add(rot(mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 6), M.panel, 3, 1.2, 1), 0, 0, Math.PI / 2));
    return g;
  },

  habitat() {
    const g = new THREE.Group();
    const hull = mesh(new THREE.CapsuleGeometry(4, 14, 8, 20), M.white, 0, 4, 0);
    hull.rotation.z = Math.PI / 2;
    g.add(hull);
    for (let i = -2; i <= 2; i++) g.add(rot(mesh(new THREE.TorusGeometry(4.05, 0.18, 6, 32), M.panel, i * 3.2, 4, 0), 0, Math.PI / 2));
    for (let i = -2; i <= 2; i++) {
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), M.warm);
      win.position.set(i * 2.8, 5, -4.02);
      win.rotation.y = Math.PI;
      g.add(win);
    }
    g.add(mesh(new THREE.BoxGeometry(3, 3, 3), M.panel, 12.5, 1.5, 0));
    return g;
  },
};

// 코스 정의의 landmarks를 지형 위에 배치한다
export function createLandmarks(path, heightAt) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const animated = [];
  const half = path.width / 2;

  for (const lm of path.course.landmarks || []) {
    const build = BUILDERS[lm.type];
    if (!build) continue;
    const obj = build();
    const s = path.sampleAt(lm.at);
    const offset = lm.side * (half + lm.gap);
    const x = s.p.x + s.right.x * offset;
    const z = s.p.z + s.right.z * offset;
    obj.position.set(x, heightAt(x, z), z);
    // 로컬 -z가 도로를 바라보게 돌린다 (피트 건물은 긴 변이 도로와 나란해진다)
    const toRoad = new THREE.Vector3(s.p.x - x, 0, s.p.z - z).normalize();
    obj.rotation.y = Math.atan2(-toRoad.x, -toRoad.z);
    group.add(obj);
    obj.traverse((o) => { if (o.userData.blink || o.userData.spin) animated.push(o); });
  }

  return {
    group,
    update(time) {
      for (const o of animated) {
        if (o.userData.blink) o.visible = (time % o.userData.blink) < 0.25;
        if (o.userData.spin) o.rotation.y = time * o.userData.spin;
      }
    },
  };
}
