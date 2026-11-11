import * as THREE from 'three';

// 아케이드식 주행 물리. 실제 공식보다 "조작하기 쉬운 느낌"을 우선한다.
export const TUNING = {
  maxSpeed: 44,      // m/s (약 158 km/h)
  offMaxSpeed: 19,   // 도로 밖(레골리스) 최고 속도
  accel: 15,
  brake: 30,
  reverseMax: 9,
  rolling: 0.12,     // 굴림 저항
  offDrag: 1.4,      // 도로 밖 저항
  steerMax: 1.9,     // rad/s
  grip: 7.5,         // 옆미끄러짐을 잡는 힘
  slideGrip: 1.7,    // 스페이스: 미끄러지며 돌기
  offGrip: 3.2,
  gravityScale: 3,   // 달 중력(1.62)의 몇 배로 할지 — 너무 둥둥 뜨지 않게
  carRadius: 1.4,
};

const CURB = 1.6;

export function createCarPhysics({ path, terrain, colliders = [], gravity = 1.62 }) {
  const half = path.width / 2;
  const g = gravity * TUNING.gravityScale;

  const state = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(), // y는 쓰지 않음 (수직은 vy)
    vy: 0,
    heading: 0,
    steer: 0,
    steerVisual: 0,
    throttle: 0,
    pitch: 0,
    roll: 0,
    wheelSpin: 0,
    grounded: true,
    airTime: 0,
    speed: 0,          // 앞방향 속도 (m/s, 후진은 음수)
    offroad: false,
    sliding: false,
    landed: 0,         // 방금 착지한 세기 (효과용)
    proj: null,
    respawned: false,
  };

  // 지면 높이: 도로·연석 위는 도로 높이, 그 밖은 달 표면
  function groundAt(x, z, hint) {
    const p = path.project(x, z, hint);
    if (p.dist <= half) return { y: p.y + 0.02, p };
    if (p.dist <= half + CURB) return { y: p.y + 0.09, p };
    return { y: terrain.heightAt(x, z), p };
  }

  function placeAt(progress, side = 0) {
    const s = path.sampleAt(progress);
    state.pos.copy(s.p).addScaledVector(s.right, side);
    state.heading = Math.atan2(s.tan.x, s.tan.z);
    state.vel.set(0, 0, 0);
    state.vy = 0;
    state.speed = 0;
    state.steer = 0;
    state.proj = path.project(state.pos.x, state.pos.z, s.i);
    state.pos.y = groundAt(state.pos.x, state.pos.z, s.i).y;
    state.grounded = true;
    state.pitch = 0;
    state.roll = 0;
  }

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();

  function step(dt, input) {
    state.respawned = false;
    state.landed = 0;
    const hint = state.proj ? state.proj.index : -1;
    const T = TUNING;

    // 조향: 키보드 입력을 부드럽게
    const target = input.steer;
    const rate = target === 0 ? 7 : 5;
    state.steer += Math.max(-rate * dt, Math.min(rate * dt, target - state.steer));
    state.steerVisual = state.steer;
    state.throttle += ((input.throttle ? 1 : 0) - state.throttle) * Math.min(1, dt * 8);
    state.sliding = input.slide && state.grounded && Math.abs(state.speed) > 8;

    const onRoad = state.proj ? state.proj.dist <= half + CURB : true;
    state.offroad = !onRoad;

    // 방향 바꾸기 (속도가 있을 때만 돈다)
    const v = state.speed;
    const absV = Math.abs(v);
    const lowSpeed = Math.min(1, absV / 7);
    const highSpeed = 1 - 0.45 * Math.min(1, absV / T.maxSpeed);
    let yaw = state.steer * T.steerMax * lowSpeed * highSpeed * Math.sign(v || 1);
    if (state.sliding) yaw *= 1.35;
    if (!state.grounded) yaw *= 0.25;
    state.heading += yaw * dt;

    // 새 방향 기준으로 속도를 앞/옆으로 나눈다 → 옆 성분은 접지력으로 줄어든다(미끄러짐)
    fwd.set(Math.sin(state.heading), 0, Math.cos(state.heading));
    right.set(-fwd.z, 0, fwd.x);
    let vf = state.vel.dot(fwd);
    let vl = state.vel.dot(right);

    if (state.grounded) {
      const max = onRoad ? T.maxSpeed : T.offMaxSpeed;
      if (input.throttle) {
        if (vf < max) vf += T.accel * (1 - Math.max(0, vf / max) ** 2) * dt;
      }
      if (input.brake) {
        if (vf > 0.5) vf -= T.brake * dt;
        else if (vf > -T.reverseMax) vf -= T.accel * 0.6 * dt;
      }
      vf -= vf * T.rolling * dt;
      if (!onRoad) vf -= vf * T.offDrag * dt;
      if (!input.throttle && !input.brake && Math.abs(vf) < 0.4) vf = 0;
      if (vf > max && !onRoad) vf -= (vf - max) * 2 * dt; // 도로 밖으로 나가면 빠르게 감속
      const grip = state.sliding ? T.slideGrip : onRoad ? T.grip : T.offGrip;
      vl *= Math.exp(-grip * dt);
    } else {
      vf -= vf * 0.02 * dt; // 진공: 공기 저항이 거의 없다
    }

    state.vel.copy(fwd).multiplyScalar(vf).addScaledVector(right, vl);
    state.speed = vf;

    // 이동
    state.pos.x += state.vel.x * dt;
    state.pos.z += state.vel.z * dt;
    collide();

    // 수직: 언덕 끝에서는 저중력으로 붕 뜬다
    const gnd = groundAt(state.pos.x, state.pos.z, hint);
    state.proj = gnd.p;
    const prevY = state.pos.y;
    state.vy -= g * dt;
    state.pos.y += state.vy * dt;
    if (state.pos.y <= gnd.y) {
      if (!state.grounded && state.vy < -3) state.landed = Math.min(1, -state.vy / 12);
      const rise = (gnd.y - prevY) / Math.max(dt, 1e-3);
      state.pos.y = gnd.y;
      state.vy = Math.max(-12, Math.min(12, rise));
      state.grounded = true;
      state.airTime = 0;
    } else {
      state.grounded = state.pos.y - gnd.y < 0.04;
      if (!state.grounded) state.airTime += dt;
    }

    // 차체 기울기: 앞뒤·좌우 지면 높이 차이
    if (state.grounded) {
      const i = state.proj.index;
      const front = groundAt(state.pos.x + fwd.x * 1.6, state.pos.z + fwd.z * 1.6, i).y;
      const back = groundAt(state.pos.x - fwd.x * 1.6, state.pos.z - fwd.z * 1.6, i).y;
      const left = groundAt(state.pos.x - right.x * 1.1, state.pos.z - right.z * 1.1, i).y;
      const rgt = groundAt(state.pos.x + right.x * 1.1, state.pos.z + right.z * 1.1, i).y;
      const k = 1 - Math.exp(-dt * 12);
      state.pitch += (-Math.atan2(front - back, 3.2) - state.pitch) * k;
      state.roll += (Math.atan2(left - rgt, 2.2) - state.roll) * k;
    } else {
      state.pitch += (0.05 - state.pitch) * dt;
    }
    state.wheelSpin += (vf / 0.55) * dt;

    // 코스에서 너무 멀어지면 주행선으로 되돌린다
    if (state.proj.dist > half + 45) {
      placeAt(state.proj.progress, 0);
      state.respawned = true;
    }
  }

  // 기지 시설과 부딪히면 밀어내고 속도를 줄인다
  function collide() {
    const r = TUNING.carRadius;
    for (const c of colliders) {
      const dx = state.pos.x - c.x;
      const dz = state.pos.z - c.z;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      if (lx < c.minX - r || lx > c.maxX + r || lz < c.minZ - r || lz > c.maxZ + r) continue;
      const pen = [lx - (c.minX - r), (c.maxX + r) - lx, lz - (c.minZ - r), (c.maxZ + r) - lz];
      const m = pen.indexOf(Math.min(...pen));
      let nx = 0;
      let nz = 0;
      let nlx = lx;
      let nlz = lz;
      if (m === 0) { nlx = c.minX - r; nx = -1; }
      if (m === 1) { nlx = c.maxX + r; nx = 1; }
      if (m === 2) { nlz = c.minZ - r; nz = -1; }
      if (m === 3) { nlz = c.maxZ + r; nz = 1; }
      // 로컬 → 월드
      state.pos.x = c.x + nlx * c.cos + nlz * c.sin;
      state.pos.z = c.z - nlx * c.sin + nlz * c.cos;
      const wnx = nx * c.cos + nz * c.sin;
      const wnz = -nx * c.sin + nz * c.cos;
      const into = state.vel.x * wnx + state.vel.z * wnz;
      if (into < 0) {
        state.vel.x -= wnx * into * 1.4;
        state.vel.z -= wnz * into * 1.4;
        state.vel.multiplyScalar(0.6);
        state.speed *= 0.6;
      }
    }
  }

  return { state, step, placeAt, groundAt };
}
