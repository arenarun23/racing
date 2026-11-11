// 랩 계측: 체크포인트 3곳을 순서대로 지나고 출발선을 넘어야 한 바퀴로 인정한다
const CHECKPOINTS = [0.25, 0.5, 0.75];
const COUNTDOWN = 3; // 초

export function createLapTimer(laps) {
  const t = {
    phase: 'countdown', // countdown → running → finished
    clock: -COUNTDOWN,  // 0이 출발 순간
    lap: 1,
    laps,
    lapStart: 0,
    lapTimes: [],
    nextCp: 0,
    lastProgress: null,
    wrongWayTime: 0,
    shown: 0,
    events: [],
  };

  function emit(type, data = {}) { t.events.push({ type, ...data }); }

  return {
    state: t,
    get lapTime() { return Math.max(0, t.clock - t.lapStart); },
    get total() { return Math.max(0, t.clock); },
    get countdown() { return t.phase === 'countdown' ? -t.clock : 0; },
    takeEvents() { const e = t.events; t.events = []; return e; },

    // alongTrack: 주행선 방향으로의 속도 (반대로 달리면 음수)
    update(dt, progress, alongTrack) {
      if (t.phase === 'finished') return;
      t.clock += dt;
      if (t.phase === 'countdown') {
        // 3, 2, 1 신호
        const n = Math.ceil(-t.clock);
        if (n > 0 && n !== t.shown) {
          t.shown = n;
          emit('tick', { n });
        }
        if (t.clock >= 0) {
          t.phase = 'running';
          t.lapStart = 0;
          emit('go');
        }
        t.lastProgress = progress;
        return;
      }

      const prev = t.lastProgress ?? progress;
      t.lastProgress = progress;

      // 체크포인트: 앞으로 지나갈 때만
      const cp = CHECKPOINTS[t.nextCp];
      if (cp !== undefined && prev < cp && progress >= cp && progress - prev < 0.2) {
        t.nextCp++;
        emit('checkpoint', { index: t.nextCp });
      }

      // 출발선 통과 (진행률 0.9 이상 → 0.1 이하)
      if (prev > 0.9 && progress < 0.1) {
        if (t.nextCp >= CHECKPOINTS.length) {
          const lapTime = t.clock - t.lapStart;
          t.lapTimes.push(lapTime);
          emit('lap', { lap: t.lap, time: lapTime, best: Math.min(...t.lapTimes) === lapTime });
          if (t.lap >= t.laps) {
            t.phase = 'finished';
            emit('finish', { total: t.clock, lapTimes: [...t.lapTimes] });
            return;
          }
          t.lap++;
          t.lapStart = t.clock;
          t.nextCp = 0;
        }
      } else if (prev < 0.1 && progress > 0.9) {
        // 출발선을 거꾸로 넘으면 체크포인트를 다시 해야 한다
        t.nextCp = 0;
      }

      // 반대 방향 감지
      if (alongTrack < -4) t.wrongWayTime += dt;
      else t.wrongWayTime = Math.max(0, t.wrongWayTime - dt * 2);
    },
    get wrongWay() { return t.wrongWayTime > 1.2; },
  };
}

export function formatTime(sec, withMinutes = true) {
  if (sec == null || !isFinite(sec)) return '-';
  const ms = Math.floor((sec % 1) * 1000);
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60);
  const tail = `${String(s).padStart(withMinutes ? 2 : 1, '0')}.${String(ms).padStart(3, '0')}`;
  return withMinutes ? `${m}:${tail}` : tail;
}
