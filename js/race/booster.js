// 부스터: 한 번 누르면 1단, 1단이 켜진 동안 한 번 더 누르면 2단(부스터 2개 사용)
export const BOOST = {
  max: 5,
  stages: [
    null,
    { time: 2.6, speed: 1.22, accel: 1.9 },
    { time: 3.4, speed: 1.38, accel: 2.4 },
  ],
};

export function createBooster(count = 2) {
  const b = { count, stage: 0, left: 0 };
  return {
    get count() { return b.count; },
    get stage() { return b.stage; },
    get active() { return b.stage > 0; },
    add(n = 1) { b.count = Math.min(BOOST.max, b.count + n); },
    // 눌렀을 때: 꺼져 있으면 1단, 1단이면 2단으로. 쓴 단계를 돌려준다(못 쓰면 0)
    press() {
      if (b.count <= 0 || b.stage >= 2) return 0;
      b.count--;
      b.stage++;
      b.left = BOOST.stages[b.stage].time;
      return b.stage;
    },
    update(dt) {
      if (b.stage === 0) return;
      b.left -= dt;
      if (b.left <= 0) { b.stage = 0; b.left = 0; }
    },
    reset(n) { b.count = n; b.stage = 0; b.left = 0; },
    // 지금 부스터가 주는 배율 (속도·가속)
    get mods() {
      const s = BOOST.stages[b.stage];
      return s ? { speed: s.speed, accel: s.accel } : { speed: 1, accel: 1 };
    },
  };
}
