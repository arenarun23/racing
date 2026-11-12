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

// 최고 기록: 한 바퀴 최고는 코스별로, 총 시간 최고는 코스·바퀴 수별로 따로 둔다
function bestOf(data, courseId) {
  const b = data.best?.[courseId] || {};
  const totals = { ...(b.totals || {}) };
  if (b.total != null && totals[3] == null) totals[3] = b.total; // 예전(3바퀴 고정) 기록 옮기기
  return { lap: b.lap ?? null, totals };
}

export function getBest(courseId, laps = 3) {
  const b = bestOf(load(), courseId);
  return { lap: b.lap, total: b.totals[laps] ?? null };
}

// 더 좋은 기록이면 저장하고, 무엇이 새 기록인지 돌려준다
export function submitResult(courseId, { lapTimes, total }, laps = lapTimes.length) {
  const data = load();
  data.best ??= {};
  const prev = bestOf(data, courseId);
  const bestLap = Math.min(...lapTimes);
  const isLap = prev.lap == null || bestLap < prev.lap;
  const isTotal = prev.totals[laps] == null || total < prev.totals[laps];
  const next = { lap: isLap ? bestLap : prev.lap, totals: { ...prev.totals, [laps]: isTotal ? total : prev.totals[laps] } };
  data.best[courseId] = next;
  save(data);
  return { newLap: isLap, newTotal: isTotal, best: { lap: next.lap, total: next.totals[laps] } };
}

// 경주 기록장: 끝낸 경주를 최근 것부터 50개까지 남긴다
const RUN_LIMIT = 50;
export function addRun(run) {
  const data = load();
  data.runs = [{ ...run, at: Date.now() }, ...(data.runs || [])].slice(0, RUN_LIMIT);
  save(data);
}

export function getRuns() {
  return load().runs || [];
}

// 기록실용: 코스별 최고 기록 전체
export function getAllBest() {
  const data = load();
  return Object.keys(data.best || {}).map((id) => ({ courseId: id, ...bestOf(data, id) }));
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

// 이 브라우저에 저장된 최고 기록과 경주 기록장을 모두 지운다
export function clearBest() {
  const data = load();
  delete data.best;
  delete data.runs;
  save(data);
}
