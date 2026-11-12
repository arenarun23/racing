// 바퀴 모드와 노면: 단단한 포장로 / 레골리스 먼지가 쌓인 구간
// grip = 옆으로 미끄러지지 않는 힘, speed = 낼 수 있는 최고 속도 (모두 배율)
export const TIRES = {
  rock: { label: '암반용', note: '포장로에서 가장 빠르지만 먼지 구간에서 미끄러져요.', road: { grip: 1, speed: 1 }, dust: { grip: 0.55, speed: 0.8 } },
  all: { label: '겸용', note: '어디서나 무난해요.', road: { grip: 0.92, speed: 0.97 }, dust: { grip: 0.8, speed: 0.9 } },
  dust: { label: '먼지용', note: '포장로에선 조금 느리지만 먼지 구간에서 잘 버텨요.', road: { grip: 0.86, speed: 0.93 }, dust: { grip: 0.97, speed: 0.97 } },
};
export const TIRE_ORDER = ['rock', 'all', 'dust'];

// 코스에 맞춘 바퀴 이름과 설명 (달은 먼지, 화성은 모래, 유로파는 서리)
export function tireInfo(id, course) {
  const th = course?.theme || {};
  const zone = th.zone || '먼지 구간';
  const soft = th.softTire || '먼지용';
  if (id === 'rock') return { label: '암반용', short: '암반', note: `포장로에서 가장 빠르지만 ${zone}에서 미끄러져요.` };
  if (id === 'dust') return { label: soft, short: soft.replace('용', ''), note: `포장로에선 조금 느리지만 ${zone}에서 잘 버텨요.` };
  return { label: '겸용', short: '겸용', note: '어디서나 무난해요.' };
}

// 태양풍: 태양에서 오는 전기를 띤 알갱이가 많아지면 달 먼지도 전기를 띠고 떠올라
// 도로 전체에 얇게 내려앉는다 (게임에서는 도로가 먼지 구간처럼 변한다)
export const STORM_DUST = 0.7;

// 진행률이 먼지 구간 안인지
export function inDustZone(course, progress) {
  return (course.dustZones || []).some(([a, b]) => progress >= a && progress <= b);
}

// 0 = 깨끗한 포장로, 1 = 먼지가 두껍게 쌓인 길
export function dustiness(course, progress, storm = 0) {
  return Math.max(inDustZone(course, progress) ? 1 : 0, storm * STORM_DUST);
}

export function tireMods(tireId, dust) {
  const t = TIRES[tireId] || TIRES.all;
  return {
    grip: t.road.grip + (t.dust.grip - t.road.grip) * dust,
    speed: t.road.speed + (t.dust.speed - t.road.speed) * dust,
  };
}
