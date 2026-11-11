// AI 레이서: 주행선 앞쪽 한 점을 겨냥해 조향하고, 굽은 길이 다가오면 미리 속도를 줄인다
const LAT_GRIP = 19;   // 굽은 길에서 버틸 수 있는 옆 가속도 (m/s²)
const BRAKE = 20;      // 계획할 때 쓰는 감속도
const STEER_MAX = 1.9; // car-physics의 steerMax와 같게
const LOOK = 36;       // 몇 개 앞 표본까지 속도를 계획할지 (2m 간격 → 72m)

// 코스 표본마다 "이 지점을 지날 수 있는 최고 속도"를 미리 계산한다 (굽을수록 낮다)
export function buildSpeedProfile(path, maxSpeed) {
  const n = path.samples.length;
  const vmax = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // bend는 앞뒤 6개(12m) 표본의 방향 차이 → 곡률 ≈ 각도 / 거리
    const k = Math.abs(path.samples[i].bend) / 12;
    // 두 가지 한계 중 낮은 쪽: 옆으로 버티는 힘, 그리고 빠를수록 덜 꺾이는 핸들 (car-physics의 조향식)
    const byGrip = k > 1e-4 ? Math.sqrt(LAT_GRIP / k) : maxSpeed;
    const byYaw = (0.85 * STEER_MAX) / (k + (STEER_MAX * 0.45) / maxSpeed);
    vmax[i] = Math.min(maxSpeed, byGrip, byYaw);
  }
  return vmax;
}

export function createAiDriver(path, profile, { skill = 0.9, lane = 0, wobble = 0.6, seed = 1 } = {}) {
  const half = path.width / 2;
  let t = seed * 10;
  let laneNow = lane;
  const L = path.length;
  const top = Math.max(...profile); // 곧은 길 최고 속도

  return {
    skill,
    // others: 다른 차들의 상태, pace: 따라잡기 보정, boost: 부스터 속도 배율
    // scaleAt(m): m미터 앞 노면에서 낼 수 있는 속도 배율 (먼지·바퀴 모드)
    decide(state, others, dt, pace = 1, boost = 1, scaleAt = () => 1) {
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
        if (ahead < 0 || ahead > 14 || o.speed > speed + 2) continue; // 나보다 빠른 차는 비킬 필요 없음
        const side = o.proj.lateral - p.lateral;
        if (Math.abs(side) < 2.6) wantLane = o.proj.lateral + (side > 0 || o.proj.lateral > half - 3 ? -3.2 : 3.2);
      }
      // 굽은 길에서는 가장자리로 너무 붙지 않게 차선 폭을 줄인다
      const bendy = profile[p.index] < top * 0.85;
      const edge = bendy ? half - 4 : half - 2.5;
      wantLane = Math.max(-edge, Math.min(edge, wantLane));
      laneNow += (wantLane - laneNow) * Math.min(1, dt * 1.5);

      // 겨냥점: 속도가 빠를수록 멀리 본다
      const look = 9 + speed * 0.45;
      const target = path.pointAt(p.progress + look / L, laneNow);
      const want = Math.atan2(target.x - state.pos.x, target.z - state.pos.z);
      let d = want - state.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const steer = Math.max(-1, Math.min(1, d * 2.6));

      // 목표 속도
      // 목표 속도: 앞쪽 각 지점의 제한 속도까지 브레이크로 줄일 수 있는 가장 빠른 속도
      // 부스터는 곧은 길의 제한만 올린다
      const n = profile.length;
      let v = Infinity;
      for (let j = 0; j <= LOOK; j += 2) {
        const raw = profile[(p.index + j) % n];
        const lim = raw * skill * pace * scaleAt(j * 2) * (raw >= top * 0.98 ? boost : 1);
        v = Math.min(v, Math.sqrt(lim * lim + 2 * BRAKE * j * 2));
      }
      const throttle = speed < v - 0.5 && Math.abs(d) < 0.7 ? 1 : 0;
      const brake = speed > v + 2.5 ? 1 : 0;
      return { throttle, brake, steer, slide: false };
    },
  };
}
