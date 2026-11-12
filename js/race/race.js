import * as THREE from 'three';
import { createCarModel } from '../vehicle/car-model.js';
import { createCarPhysics, TUNING } from '../vehicle/car-physics.js';
import { createChaseCamera } from '../core/chase-camera.js';
import { createDust } from '../fx/dust.js';
import { createLapTimer, formatTime } from './lap-timer.js';
import { createAiDriver, buildSpeedProfile } from './ai-driver.js';
import { getBest, submitResult, addRun } from '../store.js';
import { createBooster } from './booster.js';
import { TIRES, TIRE_ORDER, dustiness, tireMods, tireInfo } from './surface.js';
import { createQuizDeck } from '../quiz/questions.js';
import { hex, machineName } from '../vehicle/machines.js';

const LAMP_OFF = 0x3a1414;
const LAMP_RED = 0xff3b30;
const LAMP_GREEN = 0x3ddc84;
const IDLE = { throttle: 0, brake: 0, steer: 0, slide: false };
const CAR_GAP = 2.7; // 차끼리 이보다 가까우면 부딪힌 것으로 본다

// 상대 레이서 (탐사선 이름). skill = 최고 속도 대비 얼마나 빨리 달리는지
export const RIVALS = [
  { name: '케플러', color: 0xe8e6df, skill: 0.86 },
  { name: '허블', color: 0xb58cff, skill: 0.88 },
  { name: '보이저', color: 0xe25b8a, skill: 0.9 },
  { name: '다누리', color: 0x3ddc84, skill: 0.92 },
  { name: '누리', color: 0x4f8cff, skill: 0.94 },
];
const PLAYER_SLOT = 3; // 6대 중 4번째 칸에서 출발
// 난이도: AI 실력 배율, 내가 앞서갈 때 AI가 따라오는 정도
const DIFFICULTY = {
  easy: { skill: 0.9, ahead: 0.9, behind: 1.08 },
  normal: { skill: 1, ahead: 0.94, behind: 1.05 },
  hard: { skill: 1.05, ahead: 0.99, behind: 1.02 },
};
const START_BOOSTERS = 2;
const STORM_RAMP = 4; // 후반 날씨가 다 퍼지기까지 걸리는 시간(초)
const PIT_TIME = 2.5; // 바퀴 교체에 걸리는 시간(초)

// 한 판(그랑프리 또는 혼자 연습)을 관리한다
export function createRace({ scene, camera, path, terrain, colliders, course, hud, input, quizCard, sound, tilt }) {
  const L = path.length;
  const profile = buildSpeedProfile(path, TUNING.maxSpeed);
  const cam = createChaseCamera(camera);
  const dust = createDust(520, course.gravity * 3);
  scene.add(dust.object);

  const makeRacer = (opts) => {
    const model = createCarModel({ body: opts.color, style: opts.style });
    model.root.visible = false;
    scene.add(model.root);
    const physics = createCarPhysics({ path, terrain, colliders, gravity: course.gravity });
    const tag = opts.isPlayer ? null : nameTag(opts.name, opts.color);
    if (tag) model.root.add(tag);
    return {
      ...opts, model, physics, tag, timer: null, ai: null, finishTime: null, pace: 1,
      booster: createBooster(START_BOOSTERS), tire: 'all', lastProg: 0, boostCooldown: 0,
    };
  };

  const player = makeRacer({ name: '나', color: 0xf2a33a, isPlayer: true });
  const rivals = RIVALS.map((r, i) => makeRacer({ ...r, isPlayer: false, seed: i + 1 }));
  let racers = [player];

  const gate = scene.getObjectByName('start-gate');
  const lamps = [0, 1, 2, 3, 4].map((i) => gate?.getObjectByName(`start-lamp-${i}`)).filter(Boolean);
  const setLamps = (lit, color = LAMP_RED) => lamps.forEach((l, i) => l.material.color.setHex(i < lit ? color : LAMP_OFF));

  let mode = 'gp';
  let options = { tire: 'rock', env: 'clear', quiz: true, laps: course.laps, difficulty: 'normal', autoThrottle: false, camera: 'far', control: 'buttons' };
  let tiltOn = false; // 기울여서 조종 중인지
  let running = false;
  let quizActive = false;
  let quizScore = { right: 0, total: 0 };
  let storm = 0;          // 0 ~ 1: 후반 날씨 세기
  let stormOn = false;
  const pit = { reserved: false, phase: 'none', t: 0, next: 'dust' };
  const deck = createQuizDeck();
  const stormLayer = scene.getObjectByName('storm-dust');
  let paused = false;
  let lampOffAt = 0;
  let finishOrder = [];
  let onFinish = () => {};
  const tmp = new THREE.Vector3();
  const rearL = new THREE.Vector3();
  const rearR = new THREE.Vector3();

  // 경주 거리: 몇 바퀴 + 이번 바퀴 진행률. 출발선 뒤에 서 있을 때는 음수.
  function raceDistance(r) {
    const t = r.timer.state;
    let prog = r.physics.state.proj.progress;
    if (t.nextCp === 0 && prog > 0.5) prog -= 1;
    return (Math.min(t.lap, t.laps) - 1 + prog) * L;
  }

  function standings() {
    return [...racers].sort((a, b) => {
      if (a.finishTime != null || b.finishTime != null) {
        if (a.finishTime == null) return 1;
        if (b.finishTime == null) return -1;
        return a.finishTime - b.finishTime;
      }
      return raceDistance(b) - raceDistance(a);
    });
  }

  function start(nextMode = 'gp', opts = {}) {
    mode = nextMode;
    options = { ...options, ...opts };
    racers = mode === 'gp' ? [...rivals.slice(0, PLAYER_SLOT), player, ...rivals.slice(PLAYER_SLOT)] : [player];
    rivals.forEach((r) => { r.model.root.visible = false; });
    racers.forEach((r, slot) => {
      // 2대씩 줄지어 출발선 뒤에 선다
      const back = mode === 'gp' ? 10 + Math.floor(slot / 2) * 9 : 14;
      const side = mode === 'gp' ? (slot % 2 ? 3.4 : -3.4) : 0;
      r.physics.placeAt(1 - back / L, side);
      r.timer = createLapTimer(options.laps || course.laps);
      r.finishTime = null;
      r.pace = 1;
      r.booster.reset(START_BOOSTERS);
      r.tire = r.isPlayer ? options.tire : 'all'; // AI는 겸용 바퀴
      r.stuck = 0;
      r.offTime = 0;
      r.lastProg = r.physics.state.proj.progress;
      r.boostCooldown = 4 + Math.random() * 6;
      r.model.root.visible = true;
      r.model.sync(r.physics.state, 0);
      const diff = DIFFICULTY[options.difficulty] || DIFFICULTY.normal;
      if (!r.isPlayer) r.ai = createAiDriver(path, profile, { skill: r.skill * diff.skill, lane: side * 0.6, seed: r.seed });
    });
    finishOrder = [];
    running = true;
    paused = false;
    quizActive = false;
    quizScore = { right: 0, total: 0 };
    storm = 0;
    stormOn = false;
    pit.reserved = false;
    pit.phase = 'none';
    pit.next = options.tire === 'dust' ? 'rock' : 'dust';
    deck.reset();
    setStormVisual();
    tiltOn = options.control === 'tilt' && !!tilt?.enabled;
    if (tiltOn) tilt.calibrate();
    document.body.dataset.control = tiltOn ? 'tilt' : 'buttons';
    sound?.music('race');
    cam.setMode(options.camera);
    cam.snap();
    hud.setLaps(options.laps || course.laps);
    hud.setPlayerColor(player.color);
    hud.setRacers(racers.length);
    hud.setBest(getBest(course.id, options.laps || course.laps).lap);
    hud.setCamera(cam.mode.label);
    hud.show(true, mode);
    setLamps(0);
  }

  function stop() {
    running = false;
    sound?.engine({ active: false });
    sound?.music('lobby');
    quizCard?.cancel();
    quizActive = false;
    storm = 0;
    setStormVisual();
    racers.forEach((r) => { r.model.root.visible = false; });
    hud.show(false);
    setLamps(0);
  }

  // 결과 창용: 지금 순위와 각자의 기록
  function snapshot() {
    return standings().map((r, i) => ({ place: i + 1, name: r.name, isPlayer: r.isPlayer, color: r.color, time: r.finishTime }));
  }

  function handlePlayerEvents(events) {
    for (const e of events) {
      if (e.type === 'tick') {
        sound?.countdown();
        if (tiltOn) tilt.calibrate(); // 출발 직전 자세를 '똑바로'로
        hud.count(String(e.n));
        setLamps(Math.round(((3 - e.n + 1) / 3) * lamps.length));
      } else if (e.type === 'go') {
        sound?.go();
        hud.count('출발!', 1);
        setLamps(lamps.length, LAMP_GREEN);
        lampOffAt = 2;
      } else if (e.type === 'lap') {
        const left = course.laps - e.lap;
        const label = left === 1 ? '마지막 바퀴' : left > 1 ? `${e.lap}바퀴 완료` : '';
        if (left > 0) sound?.lap();
        if (label) hud.toast(`${label} · ${formatTime(e.time)}`, 2.2, e.best ? 'good' : '');
      } else if (e.type === 'finish') {
        const laps = options.laps || course.laps;
        const result = submitResult(course.id, e, laps);
        hud.setBest(result.best.lap);
        const place = finishOrder.indexOf(player) + 1;
        hud.count(mode === 'gp' ? `${place}위` : '완주!', 1.4);
        sound?.finish(mode === 'gp' ? place : 1);
        const quiz = options.quiz ? { ...quizScore } : null;
        // 기록실에 남길 경주 한 판
        addRun({
          course: course.id, courseName: course.name, mode, place: mode === 'gp' ? place : null, racers: racers.length,
          laps, total: e.total, bestLap: Math.min(...e.lapTimes), name: player.name, machine: machineName(player.machine),
          difficulty: options.difficulty, quiz,
        });
        setTimeout(() => onFinish({ ...e, ...result, course, mode, place, quiz, standings: snapshot() }), 1400);
      }
    }
  }

  function emitDust(state, dt) {
    const s = Math.abs(state.speed);
    if (!state.grounded || s < 3) return;
    let amount = 0;
    if (state.offroad) amount = s * 0.35;
    else if (state.sliding) amount = s * 0.25;
    if (state.landed > 0) amount += 30 * state.landed;
    if (amount <= 0) return;
    const n = Math.min(12, Math.round(amount * dt * 10 + Math.random()));
    const fx = Math.sin(state.heading);
    const fz = Math.cos(state.heading);
    rearL.set(state.pos.x - fx * 1.5 + fz * 1.2, state.pos.y, state.pos.z - fz * 1.5 - fx * 1.2);
    rearR.set(state.pos.x - fx * 1.5 - fz * 1.2, state.pos.y, state.pos.z - fz * 1.5 + fx * 1.2);
    tmp.copy(state.vel);
    dust.emit(rearL, tmp, Math.ceil(n / 2));
    dust.emit(rearR, tmp, Math.floor(n / 2));
  }

  // 차끼리 겹치면 서로 밀어내고, 부딪힌 방향의 속도를 나눠 가진다
  function bumpCars() {
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        const a = racers[i].physics.state;
        const b = racers[j].physics.state;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= CAR_GAP * CAR_GAP || d2 < 1e-6 || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (CAR_GAP - d) / 2;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rel < 0) {
          const imp = -rel * 0.65;
          if (rel < -3 && (racers[i] === player || racers[j] === player)) sound?.bump(Math.min(1, -rel / 15));
          a.vel.x -= nx * imp;
          a.vel.z -= nz * imp;
          b.vel.x += nx * imp;
          b.vel.z += nz * imp;
        }
      }
    }
  }

  // AI 부스터: 앞쪽 60m가 곧은 길이면 가끔 쓴다
  function aiBoost(r, dt) {
    r.boostCooldown -= dt;
    if (r.boostCooldown > 0 || r.booster.active || r.booster.count === 0) return;
    const i = r.physics.state.proj.index;
    const n = profile.length;
    const y0 = path.samples[i].p.y;
    for (let k = 4; k < 34; k++) {
      if (profile[(i + k) % n] < TUNING.maxSpeed * 0.95) return;
      if (path.samples[(i + k) % n].p.y > y0 + 2.5) return; // 오르막 끝 언덕에서 붕 떠서 길을 놓치지 않게
    }
    r.booster.press();
    r.boostCooldown = 8 + Math.random() * 8;
  }

  // 입문 주행 도우미 (유아·저학년용)
  function assist(controls) {
    const st = player.physics.state;
    const p = st.proj;
    const off = p.dist > path.width / 2 - 1; // 가장자리에 닿거나 도로 밖
    const ahead = path.pointAt(p.progress + (9 + Math.max(0, st.speed) * 0.45) / L, off ? 0 : p.lateral * 0.5);
    let d = Math.atan2(ahead.x - st.pos.x, ahead.z - st.pos.z) - st.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const auto = Math.max(-1, Math.min(1, d * 2.6));
    // 학생이 꺾는 만큼은 그대로 두고, 길에서 벗어나려 할수록 더 크게 돕는다
    controls.steer = Math.max(-1, Math.min(1, (controls.steer || 0) * 0.8 + auto * (off ? 1 : 0.75)));
    const lim = profile[p.index] * 0.95 * (player.booster.active ? player.booster.mods.speed : 1);
    if (st.speed > lim) controls.throttle = 0;
    if (st.speed > lim + 7) controls.brake = 1;
  }

  // 부스터·바퀴 모드·노면을 합친 배율
  function modsFor(r) {
    const st = r.physics.state;
    const onRoad = st.proj.dist <= path.width / 2 + 1.6;
    const dust = onRoad ? dustiness(course, st.proj.progress, storm) : 0;
    const t = tireMods(r.tire, dust);
    const b = r.booster.mods;
    st.boostLevel = r.booster.stage;
    st.dust = dust;
    return { speed: t.speed * b.speed, accel: b.accel, grip: t.grip };
  }

  function setStormVisual() {
    if (stormLayer) {
      stormLayer.visible = storm > 0.01;
      stormLayer.material.opacity = storm * 0.9;
    }
    // 대기가 있는 곳(화성)은 폭풍이 불면 앞이 흐려진다
    const base = scene.userData.fogBase;
    if (scene.fog && base) {
      scene.fog.near = base.near + (40 - base.near) * storm;
      scene.fog.far = base.far + (320 - base.far) * storm;
    }
    hud.setStorm(storm);
  }

  // 진행률 at 지점을 이번 프레임에 지나갔는지
  const passed = (prev, now, at) => prev < at && now >= at && now - prev < 0.2;

  function askQuiz(label) {
    quizActive = true;
    quizScore.total++;
    quizCard.ask(deck.next(), label).then(({ correct }) => {
      quizActive = false;
      if (correct) sound?.correct();
      else sound?.wrong();
      if (correct) {
        quizScore.right++;
        player.booster.add(1);
        hud.toast(`부스터 +1 · 지금 ${player.booster.count}개`, 1.8, 'good');
      } else {
        hud.toast('다음 문제에서 다시 도전!', 1.4);
      }
    });
  }

  // 피트: 예약해 두면 출발선 앞 피트 구간에서 멈춰 바퀴를 바꾼다
  function pitControls(controls, dt) {
    const st = player.physics.state;
    const [a, b] = course.pitZone || [0.94, 0.985];
    if (pit.phase === 'none' && pit.reserved && st.proj.progress >= a && st.proj.progress <= b) {
      pit.phase = 'in';
      hud.toast('피트로 들어갑니다', 1.2);
    }
    if (pit.phase === 'in') {
      if (Math.abs(st.speed) < 0.8) {
        pit.phase = 'stop';
        pit.t = PIT_TIME;
      }
      return { ...IDLE, brake: 1, mods: controls.mods };
    }
    if (pit.phase === 'stop') {
      pit.t -= dt;
      hud.toast(`바퀴 교체 중 · ${Math.max(0, pit.t).toFixed(1)}초`, 0.3);
      if (pit.t <= 0) {
        player.tire = pit.next;
        sound?.pit();
        pit.next = player.tire === 'dust' ? 'rock' : 'dust';
        pit.phase = 'none';
        pit.reserved = false;
        hud.toast(`${tireInfo(player.tire, course).label} 바퀴로 교체 완료`, 1.8, 'good');
      }
      return { ...IDLE, mods: controls.mods };
    }
    return controls;
  }

  function stepRacer(r, dt, controls) {
    r.physics.step(dt, controls);
    const st = r.physics.state;
    const tan = st.proj.sample.tan;
    r.timer.update(dt, st.proj.progress, st.vel.x * tan.x + st.vel.z * tan.z);
    const events = r.timer.takeEvents();
    if (events.some((e) => e.type === 'finish')) {
      r.finishTime = r.timer.state.clock;
      finishOrder.push(r);
    }
    return events;
  }

  return {
    get running() { return running; },
    get mode() { return mode; },
    get debug() { return { player, rivals, racers, standings, cam, input }; }, // 개발 확인용
    start,
    stop,
    onFinish(fn) { onFinish = fn; },
    // 내 머신 모양·색·이름 바꾸기 (로비에서)
    setPlayerLook({ machine = 'racer', color = '#f2a33a', helmet = '#f4f1e8', name = '' } = {}) {
      scene.remove(player.model.root);
      player.model = createCarModel({ body: hex(color), helmet: hex(helmet), style: machine });
      player.model.root.visible = running;
      scene.add(player.model.root);
      player.color = hex(color);
      player.machine = machine;
      player.name = name.trim() || '나';
      if (running) player.model.sync(player.physics.state, 0);
    },
    boost() {
      if (!running || quizActive) return;
      const stage = player.booster.press();
      if (stage) sound?.boost(stage);
      if (stage === 1) hud.toast('부스터 1단!', 0.8, 'good');
      else if (stage === 2) hud.toast('부스터 2단!!', 0.9, 'good');
      else if (player.booster.count === 0) hud.toast('부스터가 없어요 · 퀴즈를 맞히면 생겨요', 1.4);
    },
    cycleTire() {
      if (pit.phase !== 'none') return;
      const i = TIRE_ORDER.indexOf(pit.next);
      pit.next = TIRE_ORDER[(i + 1) % TIRE_ORDER.length];
      hud.setTire(player.tire, pit, player.physics.state.dust || 0);
    },
    setNextTire(id) {
      if (pit.phase !== 'none' || !TIRES[id]) return;
      pit.next = id;
      hud.setTire(player.tire, pit, player.physics.state.dust || 0);
    },
    togglePit() {
      if (!running || pit.phase !== 'none') return;
      pit.reserved = !pit.reserved;
      hud.toast(pit.reserved ? `피트 예약 · 출발선 앞에서 ${tireInfo(pit.next, course).label} 바퀴로 바꿔요` : '피트 예약 취소', 2);
      hud.setTire(player.tire, pit, player.physics.state.dust || 0);
    },
    togglePause() {
      if (!running) return;
      paused = !paused;
      hud.toast(paused ? '일시 정지 · P를 누르면 계속' : '계속', paused ? 9999 : 0.8);
    },
    update(dt) {
      if (!running) return;
      if (input.wasPressed('KeyC')) hud.setCamera(cam.cycle().label);
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) this.togglePause();
      if (paused || quizActive) {
        sound?.engine({ active: false });
        return;
      }

      // 내 차
      const pt = player.timer.state;
      let controls = pt.phase === 'running' ? input.read() : { ...IDLE };
      // 기울여서 조종: 화면 방향 버튼을 누르지 않을 때는 기울기로 방향을 정한다
      if (tiltOn && pt.phase === 'running') {
        const ts = tilt.steer();
        if (ts != null && !controls.steer) controls.steer = ts;
        if (input.wasPressed('KeyZ')) {
          tilt.calibrate();
          hud.toast('지금 자세를 가운데로 맞췄어요', 1.2);
        }
      }
      // 자동 가속: 브레이크를 누르지 않는 동안 계속 달린다 (저학년용, 기울여서 조종할 때도)
      if ((options.autoThrottle || tiltOn) && pt.phase === 'running' && !controls.brake) controls.throttle = 1;
      // 입문 주행 도우미: 길을 따라 살짝 핸들을 보태고, 굽은 길 앞에서는 알아서 속도를 줄인다
      if (options.difficulty === 'easy' && pt.phase === 'running') assist(controls);
      if (pt.phase === 'finished') controls = { ...IDLE, brake: Math.abs(player.physics.state.speed) > 2 ? 1 : 0 };
      if (pt.phase === 'running') {
        if (input.wasPressed('KeyR') && pit.phase === 'none') {
          player.physics.placeAt(player.physics.state.proj.progress, 0);
          hud.toast('주행선으로 돌아왔어요');
        }
        if (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight') || input.wasPressed('KeyX')) this.boost();
        if (input.wasPressed('KeyT')) this.cycleTire();
        if (input.wasPressed('KeyF')) this.togglePit();
      }
      // 후반 날씨(태양풍·모래 폭풍·얼음 분출): 내가 2바퀴째에 들어서면 시작한다
      if (options.env === 'storm' && !stormOn && pt.lap >= 2 && pt.phase === 'running') {
        stormOn = true;
        hud.toast(course.theme?.storm?.toast || '도로가 덮이기 시작했어요', 3.5, 'warn');
      }
      if (stormOn && storm < 1) {
        storm = Math.min(1, storm + dt / STORM_RAMP);
        setStormVisual();
      }
      for (const r of racers) r.booster.update(dt);
      controls.mods = modsFor(player);
      controls = pitControls(controls, dt);
      const prevProg = player.physics.state.proj.progress;
      const events = stepRacer(player, dt, controls);
      const nowProg = player.physics.state.proj.progress;
      if (options.quiz && pt.phase === 'running' && pit.phase === 'none') {
        for (const at of course.quizAt || []) {
          if (passed(prevProg, nowProg, at)) {
            askQuiz(`${Math.min(pt.lap, pt.laps)}바퀴 · ${course.quizAt.indexOf(at) + 1}번째 문제`);
            break;
          }
        }
      }
      if (player.physics.state.respawned) hud.toast('코스 밖으로 너무 멀리 나가서 주행선으로 돌아왔어요', 2);

      // 상대 차: 나와 너무 벌어지면 살짝 늦추거나 당긴다
      const myDist = raceDistance(player);
      for (const r of racers) {
        if (r.isPlayer) continue;
        const st = r.timer.state;
        let c = { ...IDLE };
        const mods = modsFor(r);
        if (st.phase === 'running') {
          const gap = raceDistance(r) - myDist;
          const diff = DIFFICULTY[options.difficulty] || DIFFICULTY.normal;
          const want = gap > 70 ? diff.ahead : gap < -70 ? diff.behind : 1;
          r.pace += (want - r.pace) * Math.min(1, dt * 0.5);
          const others = racers.filter((o) => o !== r).map((o) => o.physics.state);
          // 앞쪽 노면을 보고 미끄러운 곳에서는 제한 속도를 낮춘다
          const prog = r.physics.state.proj.progress;
          const clean = tireMods(r.tire, 0);
          const scaleAt = (m) => {
            const t = tireMods(r.tire, dustiness(course, prog + m / L, storm));
            return t.speed * (t.grip / clean.grip);
          };
          c = r.ai.decide(r.physics.state, others, dt, r.pace, r.booster.mods.speed, scaleAt);
          aiBoost(r, dt);
          // 벽에 걸려 오래 멈춰 있으면 주행선으로 되돌린다
          // 도로 밖에서 오래 헤매도 마찬가지
          r.stuck = Math.abs(r.physics.state.speed) < 2 ? r.stuck + dt : 0;
          r.offTime = r.physics.state.offroad ? r.offTime + dt : 0;
          if (r.stuck > 2.5 || r.offTime > 4) {
            r.physics.placeAt(r.physics.state.proj.progress, 0);
            r.stuck = 0;
            r.offTime = 0;
          }
        } else if (st.phase === 'finished') {
          c = { ...IDLE, brake: Math.abs(r.physics.state.speed) > 6 ? 1 : 0 };
        }
        c.mods = mods;
        const before = r.physics.state.proj.progress;
        stepRacer(r, dt, c);
        // AI도 퀴즈 지점을 지나면 일정 확률로 부스터를 얻는다
        if (options.quiz && st.phase === 'running') {
          for (const at of course.quizAt || []) if (passed(before, r.physics.state.proj.progress, at) && Math.random() < 0.6) r.booster.add(1);
        }
      }
      if (racers.length > 1) bumpCars();
      for (const r of racers) {
        r.model.sync(r.physics.state, dt);
        // 바로 옆에 붙은 차의 이름표는 화면을 가리므로 숨긴다
        if (r.tag) r.tag.visible = r.physics.state.pos.distanceToSquared(camera.position) > 110;
      }

      handlePlayerEvents(events);
      const state = player.physics.state;
      if (player.timer.wrongWay && pt.phase === 'running') hud.toast('반대 방향이에요', 0.4, 'warn');

      if (lampOffAt > 0) {
        lampOffAt -= dt;
        if (lampOffAt <= 0) setLamps(0);
      }

      for (const r of racers) emitDust(r.physics.state, dt);
      dust.update(dt);
      cam.update(dt, state);
      sound?.engine({ speed: Math.abs(state.speed) / TUNING.maxSpeed, throttle: state.throttle, boost: player.booster.stage, active: true });
      if (state.hit > 0.25) sound?.bump(state.hit);

      const order = racers.length > 1 ? standings() : [player];
      hud.setBoost(player.booster.count, player.booster.stage);
      hud.setTire(player.tire, pit, player.physics.state.dust || 0);
      hud.update(dt, {
        timer: player.timer,
        state,
        place: order.indexOf(player) + 1,
        order: order.map((r) => ({ name: r.name, color: r.color, isPlayer: r.isPlayer, done: r.finishTime != null })),
        rivals: racers.filter((r) => !r.isPlayer).map((r) => ({ pos: r.physics.state.pos, color: r.color })),
      });
    },
  };
}

// 상대 차 위에 뜨는 이름표
function nameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '700 34px sans-serif';
  const w = Math.min(240, ctx.measureText(name).width + 44);
  const x0 = (256 - w) / 2;
  ctx.fillStyle = 'rgba(13,21,35,0.82)';
  ctx.beginPath();
  ctx.roundRect(x0, 8, w, 48, 24);
  ctx.fill();
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.arc(x0 + 22, 32, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eef1f6';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x0 + 36, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(3.2, 0.8, 1);
  sprite.position.set(0, 2.7, 0);
  sprite.renderOrder = 5;
  return sprite;
}
