import * as THREE from 'three';

// 주행 카메라: 멀리 뒤 / 가까이 뒤 / 운전석 앞. C키로 바꾼다.
export const CHASE_MODES = [
  { id: 'far', label: '멀리', dist: 8.5, height: 3.2, look: 1.2, ahead: 8 },
  { id: 'near', label: '가까이', dist: 5.4, height: 2.1, look: 1.0, ahead: 8 },
  { id: 'nose', label: '운전석', dist: -0.2, height: 1.45, look: 1.3, ahead: 20 },
];

export function createChaseCamera(camera) {
  let modeIndex = 0;
  let yaw = 0;
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const want = new THREE.Vector3();
  let first = true;

  return {
    get mode() { return CHASE_MODES[modeIndex]; },
    cycle() {
      modeIndex = (modeIndex + 1) % CHASE_MODES.length;
      first = true;
      return CHASE_MODES[modeIndex];
    },
    snap() { first = true; },
    update(dt, state) {
      const m = CHASE_MODES[modeIndex];
      // 차가 미끄러질 때 카메라가 살짝 늦게 따라와 회전이 보이게 한다
      let d = state.heading - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * (first ? 1 : Math.min(1, dt * (m.id === 'nose' ? 14 : 5)));
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);

      want.set(state.pos.x - fx * m.dist, state.pos.y + m.height, state.pos.z - fz * m.dist);
      if (first) pos.copy(want);
      else {
        pos.x += (want.x - pos.x) * Math.min(1, dt * 10);
        pos.z += (want.z - pos.z) * Math.min(1, dt * 10);
        pos.y += (want.y - pos.y) * Math.min(1, dt * (m.id === 'nose' ? 20 : 4));
      }
      look.set(state.pos.x + fx * m.ahead, state.pos.y + m.look, state.pos.z + fz * m.ahead);
      camera.position.copy(pos);
      camera.lookAt(look);
      // 빠를수록 시야를 넓혀 속도감을 준다
      const fov = 60 + Math.min(1, Math.abs(state.speed) / 44) * 14;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
      first = false;
    },
  };
}
