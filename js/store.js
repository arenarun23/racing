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

// 내 설정 (머신, 드라이버, 경기 옵션, 화면 설정)
export const DEFAULT_PREFS = {
  machine: 'racer',
  color: '#f2a33a',
  helmet: '#f4f1e8',
  name: '',
  difficulty: 'normal', // easy · normal · hard
  tire: 'rock',
  env: 'clear',
  quiz: true,
  laps: 3,
  quality: 'standard',  // light · standard · sharp
  autoThrottle: false,  // 저학년용: 가속 키를 누르지 않아도 달린다
  camera: 'far',        // far · near · nose
};

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...(load().prefs || {}) };
}

export function setPrefs(patch) {
  const data = load();
  data.prefs = { ...DEFAULT_PREFS, ...(data.prefs || {}), ...patch };
  save(data);
  return data.prefs;
}

// 이 브라우저에 저장된 최고 기록을 모두 지운다
export function clearBest() {
  const data = load();
  delete data.best;
  save(data);
}
