import { formatTime } from '../race/lap-timer.js';

const $ = (s) => document.querySelector(s);

// 경기 화면 표시: 속도, 바퀴, 시간, 미니맵, 알림
export function createHud(path) {
  const el = {
    root: $('#hud'),
    lap: $('#hud-lap'),
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
  };
  const ctx = el.map.getContext('2d');
  const mapInfo = prepareMap(path);
  let toastTimer = 0;
  let countTimer = 0;

  function drawMap(carPos) {
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
    // 내 차
    ctx.fillStyle = '#f2a33a';
    ctx.strokeStyle = '#060a14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx(carPos.x), tz(carPos.z), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  return {
    show(on) {
      el.root.hidden = !on;
      document.body.dataset.mode = on ? 'race' : 'lobby';
    },
    setLaps(n) { el.laps.textContent = n; },
    setBest(sec) { el.best.textContent = formatTime(sec); },
    setCamera(label) { el.cam.textContent = label; },
    update(dt, { timer, state }) {
      const kmh = Math.round(Math.abs(state.speed) * 3.6);
      el.speed.textContent = kmh;
      el.bar.style.transform = `scaleX(${Math.min(1, kmh / 160)})`;
      el.lap.textContent = Math.min(timer.state.lap, timer.state.laps);
      el.lapTime.textContent = formatTime(timer.lapTime);
      el.total.textContent = formatTime(timer.total);
      drawMap(state.pos);
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
