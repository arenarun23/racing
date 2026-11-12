import * as THREE from 'three';
import { createStage } from './core/stage.js';
import { createViewCamera } from './core/view-camera.js';
import { getCourse } from './course/courses.js';
import { buildCoursePath } from './course/course-path.js';
import { createTerrain } from './course/terrain.js';
import { createRoad } from './course/road-ribbon.js';
import { createLandmarks } from './course/moon-base.js';
import { createSky } from './course/sky.js';
import { createInput } from './core/input.js';
import { createHud } from './ui/hud.js';
import { createRace } from './race/race.js';
import { formatTime } from './race/lap-timer.js';
import { createQuizCard } from './ui/quiz-card.js';
import { TIRES } from './race/surface.js';
import { getPrefs, setPrefs } from './store.js';
import { createGarage } from './ui/garage.js';
import { createSettings } from './ui/settings.js';
import { createRecords } from './ui/records.js';
import { isTouchDevice, bindTouchPad } from './ui/touch.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const prefs = getPrefs();
// 그래픽 품질: 주소의 ?q= 가 있으면 그것을, 없으면 설정에 저장된 값을 쓴다
const quality = ['light', 'standard', 'sharp'].includes(params.get('q')) ? params.get('q') : prefs.quality;
const anyDialogOpen = () => !!document.querySelector('dialog[open]');

// 무거운 단계 사이에 한 프레임씩 쉬어 로딩 막대가 실제로 움직이게 한다
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function setProgress(ratio, text) {
  $('#load-bar').style.transform = `scaleX(${ratio})`;
  $('#load-step').textContent = text;
  await nextFrame();
}

async function boot() {
  const course = getCourse(params.get('course') || 'moon-base');
  const stage = createStage($('#scene'), quality);
  const { scene, camera, renderer } = stage;

  await setProgress(0.1, '주행선을 그리는 중');
  const path = buildCoursePath(course);

  await setProgress(0.3, '달 표면을 만드는 중');
  const terrain = createTerrain(path, { quality });
  scene.add(terrain.group);
  stage.focusShadow(terrain.center);

  await setProgress(0.65, '도로와 연석을 까는 중');
  scene.add(createRoad(path));

  await setProgress(0.8, '기지 시설을 세우는 중');
  const landmarks = createLandmarks(path, terrain.heightAt);
  scene.add(landmarks.group);

  await setProgress(0.9, '별을 켜는 중');
  const sky = createSky(course.seed);
  scene.add(sky.group);

  const view = createViewCamera(camera, renderer.domElement, path, terrain.center);
  view.jumpToStart();
  fillCourseCard(course, path);
  bindViewButtons(view);

  await setProgress(0.95, '레이서를 준비하는 중');
  const input = createInput();
  const hud = createHud(path);
  const quizCard = createQuizCard();
  const race = createRace({ scene, camera, path, terrain, colliders: landmarks.colliders, course, hud, input, quizCard });
  const results = createResults();
  const options = bindOptions();
  let settingsValue = { laps: prefs.laps, autoThrottle: prefs.autoThrottle, camera: prefs.camera };
  race.setPlayerLook(prefs);

  // 내 머신 · 설정 · 사용방법 창
  const updatePicks = () => {
    const sum = garage.summary();
    $('#pick-machine').textContent = sum.machine;
    $('#pick-driver').textContent = sum.name || '이름 정하기';
    $('#pick-swatch').style.background = sum.color;
    $('#stat-laps').textContent = settingsValue.laps;
  };
  const garage = createGarage({
    prefs,
    onChange: (v) => {
      setPrefs(v);
      race.setPlayerLook(v);
      updatePicks();
    },
  });
  const settings = createSettings({
    prefs,
    onChange: (v, reload) => {
      setPrefs(v);
      settingsValue = { laps: v.laps, autoThrottle: v.autoThrottle, camera: v.camera };
      updatePicks();
      if (reload) location.reload(); // 그래픽 품질은 화면을 다시 불러와야 바뀐다
    },
  });
  updatePicks();
  $('#open-garage').addEventListener('click', () => garage.open());
  $('#open-driver').addEventListener('click', () => { garage.open(); $('#driver-name').focus(); });
  $('#open-settings').addEventListener('click', () => settings.open());
  $('#open-help').addEventListener('click', () => $('#help').showModal());
  const records = createRecords();
  $('#open-records').addEventListener('click', () => records.open('best'));
  $('#result-records').addEventListener('click', () => {
    backToLobby();
    records.open('runs');
  });
  if (isTouchDevice(params)) bindTouchPad(input);
  document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  let lastMode = 'gp';
  const startRace = (mode = lastMode) => {
    lastMode = mode;
    results.close();
    document.activeElement?.blur(); // 버튼에 남은 포커스가 방향키를 가로채지 않게
    race.start(mode, { ...options.read(), ...settingsValue });
  };
  const backToLobby = () => {
    results.close();
    race.stop();
    view.resume();
  };
  $('#start-race').addEventListener('click', () => startRace('gp'));
  $('#start-solo').addEventListener('click', () => startRace('solo'));
  $('#hud-exit').addEventListener('click', backToLobby);
  $('#result-again').addEventListener('click', () => startRace());
  $('#result-lobby').addEventListener('click', backToLobby);
  // 경기 화면의 바퀴·피트 버튼 (누른 뒤 포커스를 바로 돌려준다)
  $('#hud-next-tire').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) race.setNextTire(b.dataset.v);
    b?.blur();
  });
  $('#hud-pit').addEventListener('click', (e) => {
    race.togglePit();
    e.currentTarget.blur();
  });
  race.onFinish((r) => results.open(r));
  $('#results').addEventListener('cancel', backToLobby); // Esc로 결과 창을 닫으면 로비로

  renderer.compile(scene, camera);
  await setProgress(1, '준비 완료');

  const clock = new THREE.Clock();
  const perf = watchPerformance();
  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta();
    perf.frame(raw);
    const dt = Math.min(raw, 0.1);
    const t = clock.elapsedTime;
    if (race.running) race.update(dt);
    else {
      if (input.wasPressed('Enter') && !anyDialogOpen() && !document.activeElement?.matches('button, input')) startRace('gp');
      view.update(dt);
    }
    input.endFrame();
    sky.follow(camera);
    landmarks.update(t);
    renderer.render(scene, camera);
  });

  document.body.dataset.state = 'ready';
  document.body.dataset.mode = 'lobby';
  window.__race = { scene, camera, path, view, race }; // 개발 중 콘솔 확인용
}

// 로비의 경기 설정: 출발 바퀴 모드, 우주 환경, 퀴즈
function bindOptions() {
  const value = { tire: prefs.tire, env: prefs.env, difficulty: prefs.difficulty };
  $('#opt-quiz').checked = prefs.quiz;
  $('#opt-quiz').addEventListener('change', (e) => setPrefs({ quiz: e.target.checked }));
  const hint = $('#opt-hint');
  const showHint = () => {
    const env = value.env === 'storm' ? ' 2바퀴째부터 태양풍으로 도로가 먼지에 덮여요.' : '';
    hint.textContent = `${TIRES[value.tire].label}: ${TIRES[value.tire].note}${env}`;
  };
  document.querySelectorAll('.course-card .seg[data-opt]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      value[seg.dataset.opt] = b.dataset.v;
      setPrefs({ [seg.dataset.opt]: b.dataset.v });
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      showHint();
    });
    // 저장된 선택을 화면에 표시
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === value[seg.dataset.opt])));
  });
  showHint();
  return { read: () => ({ ...value, quiz: $('#opt-quiz').checked }) };
}

// 처음 몇 초 동안 화면이 얼마나 부드러운지 재 보고, 느리면 '가볍게'를 권한다
function watchPerformance() {
  let time = 0;
  let frames = 0;
  let done = quality === 'light' || prefs.perfTipSeen;
  const tip = $('#perf-tip');
  $('#perf-apply').addEventListener('click', () => {
    setPrefs({ quality: 'light', perfTipSeen: true });
    location.reload();
  });
  $('#perf-close').addEventListener('click', () => {
    setPrefs({ perfTipSeen: true });
    tip.hidden = true;
  });
  return {
    frame(dt) {
      if (done || document.hidden) return;
      time += dt;
      frames++;
      if (time < 6) return;
      done = true;
      const fps = frames / time;
      if (fps < 28) tip.hidden = false;
    },
  };
}

// 완주 결과 창
function createResults() {
  const dlg = $('#results');
  return {
    get isOpen() { return dlg.open; },
    open(r) {
      $('#result-title').textContent = r.mode === 'gp' ? `${r.place}위로 완주` : '완주';
      $('#result-total').textContent = formatTime(r.total);
      const st = $('#result-standings');
      st.hidden = r.mode !== 'gp';
      st.innerHTML = r.mode === 'gp'
        ? r.standings
          .map((s) => `<li${s.isPlayer ? ' class="me"' : ''}><span class="n">${s.place}</span><i style="background:#${s.color.toString(16).padStart(6, '0')}"></i><span>${s.name}</span><b>${s.time != null ? formatTime(s.time) : '달리는 중'}</b></li>`)
          .join('')
        : '';
      const best = Math.min(...r.lapTimes);
      $('#result-laps').innerHTML = r.lapTimes
        .map((t, i) => `<li${t === best ? ' class="best"' : ''}><span>${i + 1}바퀴</span><b>${formatTime(t)}</b></li>`)
        .join('');
      const notes = [];
      if (r.newTotal) notes.push('총 시간 새 기록');
      if (r.newLap) notes.push('한 바퀴 새 기록');
      const quiz = r.quiz && r.quiz.total ? ` · 퀴즈 ${r.quiz.right}/${r.quiz.total} 정답` : '';
      $('#result-note').textContent = (notes.length ? notes.join(' · ') : `내 최고 기록 ${formatTime(r.best.total)}`) + quiz;
      $('#result-note').dataset.tone = notes.length ? 'good' : '';
      dlg.showModal();
      $('#result-again').focus();
    },
    close() { if (dlg.open) dlg.close(); },
  };
}

function fillCourseCard(course, path) {
  const ys = path.samples.map((s) => s.p.y);
  $('#course-group').textContent = `${course.group} · ${course.place}`;
  $('#course-name').textContent = course.name;
  $('#stat-length').textContent = Math.round(path.length).toLocaleString('ko-KR');
  $('#stat-laps').textContent = course.laps;
  $('#stat-rise').textContent = Math.round(Math.max(...ys) - Math.min(...ys));
  $('#stat-gravity').textContent = course.gravity;
  document.title = `${course.name} · 우주 레이싱`;
}

function bindViewButtons(view) {
  const buttons = document.querySelectorAll('[data-view]');
  const hint = $('#view-hint');
  const hints = {
    tour: '주행선을 따라 코스를 한 바퀴 날아갑니다.',
    top: '코스 전체 모양을 위에서 봅니다.',
    free: '끌어서 돌리고, 휠로 확대·축소합니다.',
  };
  const select = (mode) => {
    view.setMode(mode);
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === mode)));
    hint.textContent = hints[mode];
  };
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.view)));
  window.addEventListener('keydown', (e) => {
    if (document.body.dataset.mode === 'race' || anyDialogOpen() || e.target.matches?.('input')) return;
    const map = { 1: 'tour', 2: 'top', 3: 'free' };
    if (map[e.key]) select(map[e.key]);
  });
  select('tour');
}

boot().catch((err) => {
  console.error(err);
  document.body.dataset.state = 'error';
  $('#load-step').textContent = '화면을 만들지 못했습니다. 새로고침하거나 그래픽 품질을 낮춰(?q=light) 다시 열어 주세요.';
});
