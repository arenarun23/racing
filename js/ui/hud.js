import { formatTime } from '../race/lap-timer.js';
import { TIRES } from '../race/surface.js';
import { BOOST } from '../race/booster.js';

const $ = (s) => document.querySelector(s);

// 경기 화면 표시: 속도, 바퀴, 시간, 미니맵, 알림
export function createHud(path) {
  const el = {
    root: $('#hud'),
    lap: $('#hud-lap'),
    pos: $('#hud-pos'),
    cars: $('#hud-cars'),
    standings: $('#hud-standings'),
    laps: $('#hud-laps'),
    lapTime: $('#hud-lap-time'),
    best: $('#hud-best'),
    total: $('#hud-total'),
    speed: $('#hud-speed'),
    bar: $('#hud-speed-bar'),
    toast: $('#hud-toast'),
    count: $('#hud-count'),
    cam: $('#hud-cam'),
    map: $('#minimap'),
    pips: $('#hud-boost-pips'),
    boostLabel: $('#hud-boost-label'),
    tire: $('#hud-tire'),
    surface: $('#hud-surface'),
    nextTire: $('#hud-next-tire'),
    pit: $('#hud-pit'),
    env: $('#hud-env'),
  };
  let boostKey = '';
  let tireKey = '';
  let playerColor = '#f2a33a';
  const ctx = el.map.getContext('2d');
  const mapInfo = prepareMap(path);
  let toastTimer = 0;
  let countTimer = 0;

  let lastOrderKey = '';

  function drawMap(carPos, rivals) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = el.map.clientWidth;
    if (el.map.width !== Math.round(size * dpr)) {
      el.map.width = el.map.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const { pts, minX, minZ, scale, pad, offX, offZ } = mapInfo;
    const s = (size - pad * 2) * scale;
    // '위에서 보기' 화면과 같은 방향 (화면 위쪽 = -z)
    const tx = (x) => pad + (x - minX + offX) * s;
    const tz = (z) => pad + (z - minZ + offZ) * s;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(238,241,246,0.22)';
    ctx.beginPath();
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(tx(x), tz(z)) : ctx.moveTo(tx(x), tz(z))));
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(238,241,246,0.75)';
    ctx.stroke();
    // 출발선
    const [sx, sz] = pts[0];
    ctx.fillStyle = '#eef1f6';
    ctx.fillRect(tx(sx) - 3, tz(sz) - 3, 6, 6);
    // 상대 차
    for (const r of rivals) {
      ctx.fillStyle = `#${r.color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(tx(r.pos.x), tz(r.pos.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 내 차
    ctx.fillStyle = playerColor;
    ctx.strokeStyle = '#060a14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx(carPos.x), tz(carPos.z), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  return {
    show(on, mode = 'gp') {
      el.root.hidden = !on;
      el.root.dataset.raceMode = mode;
      boostKey = '';
      tireKey = '';
      document.body.dataset.mode = on ? 'race' : 'lobby';
      lastOrderKey = '';
    },
    setRacers(n) { el.cars.textContent = n; },
    setPlayerColor(c) { playerColor = `#${c.toString(16).padStart(6, '0')}`; lastOrderKey = ''; },
    setBoost(count, stage) {
      const key = `${count}:${stage}`;
      if (key === boostKey) return;
      boostKey = key;
      el.pips.innerHTML = Array.from({ length: BOOST.max }, (_, i) => `<i${i < count ? ' class="on"' : ''}></i>`).join('');
      el.boostLabel.textContent = stage === 2 ? '부스터 2단' : stage === 1 ? '부스터 1단 · 한 번 더 누르면 2단' : `부스터 ${count}개`;
      el.boostLabel.dataset.stage = stage;
    },
    setTire(tire, pit, dust) {
      const key = `${tire}:${pit.next}:${pit.reserved}:${pit.phase}:${dust > 0.5}`;
      if (key === tireKey) return;
      tireKey = key;
      el.tire.textContent = TIRES[tire].label;
      el.surface.textContent = dust > 0.5 ? '먼지 구간' : '';
      el.nextTire.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === pit.next)));
      el.pit.textContent = pit.phase !== 'none' ? '정비 중' : pit.reserved ? '피트 예약됨 · 취소' : '피트 예약';
      el.pit.dataset.on = pit.reserved || pit.phase !== 'none' ? 'true' : 'false';
    },
    setStorm(level) {
      el.env.hidden = level < 0.05;
      document.body.style.setProperty('--storm', level.toFixed(2));
    },
    setLaps(n) { el.laps.textContent = n; },
    setBest(sec) { el.best.textContent = formatTime(sec); },
    setCamera(label) { el.cam.textContent = label; },
    update(dt, { timer, state, place = 1, order = [], rivals = [] }) {
      el.pos.textContent = place;
      // 순위표는 순서가 바뀔 때만 다시 그린다
      const key = order.map((o) => o.name + (o.done ? '!' : '')).join('|');
      if (key !== lastOrderKey) {
        lastOrderKey = key;
        el.standings.innerHTML = order
          .map((o, i) => `<li${o.isPlayer ? ' class="me"' : ''}><span class="n">${i + 1}</span><i style="background:#${o.color.toString(16).padStart(6, '0')}"></i><span>${o.name}</span>${o.done ? '<em>완주</em>' : ''}</li>`)
          .join('');
      }
      const kmh = Math.round(Math.abs(state.speed) * 3.6);
      el.speed.textContent = kmh;
      el.bar.style.transform = `scaleX(${Math.min(1, kmh / 160)})`;
      el.lap.textContent = Math.min(timer.state.lap, timer.state.laps);
      el.lapTime.textContent = formatTime(timer.lapTime);
      el.total.textContent = formatTime(timer.total);
      drawMap(state.pos, rivals);
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) el.toast.classList.remove('on');
      }
      if (countTimer > 0) {
        countTimer -= dt;
        if (countTimer <= 0) el.count.classList.remove('on');
      }
    },
    toast(text, sec = 1.6, tone = '') {
      el.toast.textContent = text;
      el.toast.dataset.tone = tone;
      el.toast.classList.add('on');
      toastTimer = sec;
    },
    count(text, sec = 0.9) {
      el.count.textContent = text;
      el.count.classList.remove('on');
      void el.count.offsetWidth; // 같은 글자여도 애니메이션을 다시 시작
      el.count.classList.add('on');
      countTimer = sec;
    },
  };
}

function prepareMap(path) {
  const pts = path.samples.filter((_, i) => i % 3 === 0).map((s) => [s.p.x, s.p.z]);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...zs) - minZ;
  const span = Math.max(w, h);
  return { pts, minX, minZ, scale: 1 / span, pad: 12, offX: (span - w) / 2, offZ: (span - h) / 2 };
}
