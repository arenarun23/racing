// 기록 저장소. 지금은 이 브라우저에만 저장한다.
// 4단계에서 학급 서버(Vercel API)로 바꿀 때 이 파일만 고치면 된다.
const KEY = 'space-racing:v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 저장이 막힌 브라우저(시크릿 창 등)에서는 기록만 남기지 않는다
  }
}

export function getBest(courseId) {
  const best = load().best?.[courseId];
  return best || { lap: null, total: null };
}

// 더 좋은 기록이면 저장하고, 무엇이 새 기록인지 돌려준다
export function submitResult(courseId, { lapTimes, total }) {
  const data = load();
  data.best ??= {};
  const prev = data.best[courseId] || { lap: null, total: null };
  const bestLap = Math.min(...lapTimes);
  const isLap = prev.lap == null || bestLap < prev.lap;
  const isTotal = prev.total == null || total < prev.total;
  data.best[courseId] = { lap: isLap ? bestLap : prev.lap, total: isTotal ? total : prev.total };
  save(data);
  return { newLap: isLap, newTotal: isTotal, best: data.best[courseId] };
}
