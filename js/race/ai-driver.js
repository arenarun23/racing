// AI 레이서: 주행선 앞쪽 한 점을 겨냥해 조향하고, 굽은 길이 다가오면 미리 속도를 줄인다
const LAT_GRIP = 19;   // 굽은 길에서 버틸 수 있는 옆 가속도 (m/s²)
const BRAKE = 20;      // 계획할 때 쓰는 감속도
const LOOK = 30;       // 몇 개 앞 표본까지 속도를 계획할지 (2m 간격 → 60m)

// 코스 표본마다 "이 지점에서 낼 수 있는 최고 속도"를 미리 계산한다
export function buildSpeedProfile(path, maxSpeed) {
  const n = path.samples.length;
  const vmax = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // bend는 앞뒤 6개(12m) 표본의 방향 차이 → 곡률 ≈ 각도 / 거리
    const k = Math.abs(path.samples[i].bend) / 12;
    vmax[i] = Math.min(maxSpeed, k > 1e-4 ? Math.sqrt(LAT_GRIP / k) : maxSpeed);
  }
  // 앞쪽 제한 속도까지 브레이크로 줄일 수 있는지 고려
  const plan = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = vmax[i];
    for (let j = 1; j <= LOOK; j++) {
      const d = j * 2;
      const ahead = vmax[(i + j) % n];
      v = Math.min(v, Math.sqrt(ahead * ahead + 2 * BRAKE * d));
    }
    plan[i] = v;
  }
  return plan;
}

export function createAiDriver(path, profile, { skill = 0.9, lane = 0, wobble = 0.6, seed = 1 } = {}) {
  const half = path.width / 2;
  let t = seed * 10;
  let laneNow = lane;
  const L = path.length;

  return {
    skill,
    // others: 다른 차들의 상태 배열, pace: 따라잡기 보정(1 = 보정 없음)
    decide(state, others, dt, pace = 1) {
      t += dt;
      const p = state.proj;
      const speed = Math.max(0, state.speed);

      // 바로 앞에 차가 있으면 옆으로 비켜 간다
      let wantLane = lane + Math.sin(t * 0.37) * wobble;
      const fx = Math.sin(state.heading);
      const fz = Math.cos(state.heading);
      for (const o of others) {
        const dx = o.pos.x - state.pos.x;
        const dz = o.pos.z - state.pos.z;
        const ahead = dx * fx + dz * fz;
        if (ahead < 0 || ahead > 14) continue;
        const side = o.proj.lateral - p.lateral;
        if (Math.abs(side) < 2.6) wantLane = o.proj.lateral + (side > 0 || o.proj.lateral > half - 3 ? -3.2 : 3.2);
      }
      wantLane = Math.max(-half + 2, Math.min(half - 2, wantLane));
      laneNow += (wantLane - laneNow) * Math.min(1, dt * 1.5);

      // 겨냥점: 속도가 빠를수록 멀리 본다
      const look = 9 + speed * 0.45;
      const target = path.pointAt(p.progress + look / L, laneNow);
      const want = Math.atan2(target.x - state.pos.x, target.z - state.pos.z);
      let d = want - state.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const steer = Math.max(-1, Math.min(1, d * 2.6));

      // 목표 속도
      const v = profile[p.index] * skill * pace;
      const throttle = speed < v - 0.5 && Math.abs(d) < 0.7 ? 1 : 0;
      const brake = speed > v + 2.5 ? 1 : 0;
      return { throttle, brake, steer, slide: false };
    },
  };
}
