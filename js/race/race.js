import * as THREE from 'three';
import { createCarModel } from '../vehicle/car-model.js';
import { createCarPhysics, TUNING } from '../vehicle/car-physics.js';
import { createChaseCamera } from '../core/chase-camera.js';
import { createDust } from '../fx/dust.js';
import { createLapTimer, formatTime } from './lap-timer.js';
import { createAiDriver, buildSpeedProfile } from './ai-driver.js';
import { getBest, submitResult } from '../store.js';

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

// 한 판(그랑프리 또는 혼자 연습)을 관리한다
export function createRace({ scene, camera, path, terrain, colliders, course, hud, input }) {
  const L = path.length;
  const profile = buildSpeedProfile(path, TUNING.maxSpeed);
  const cam = createChaseCamera(camera);
  const dust = createDust(520, course.gravity * 3);
  scene.add(dust.object);

  const makeRacer = (opts) => {
    const model = createCarModel({ body: opts.color });
    model.root.visible = false;
    scene.add(model.root);
    const physics = createCarPhysics({ path, terrain, colliders, gravity: course.gravity });
    const tag = opts.isPlayer ? null : nameTag(opts.name, opts.color);
    if (tag) model.root.add(tag);
    return { ...opts, model, physics, tag, timer: null, ai: null, finishTime: null, pace: 1 };
  };

  const player = makeRacer({ name: '나', color: 0xf2a33a, isPlayer: true });
  const rivals = RIVALS.map((r, i) => makeRacer({ ...r, isPlayer: false, seed: i + 1 }));
  let racers = [player];

  const gate = scene.getObjectByName('start-gate');
  const lamps = [0, 1, 2, 3, 4].map((i) => gate?.getObjectByName(`start-lamp-${i}`)).filter(Boolean);
  const setLamps = (lit, color = LAMP_RED) => lamps.forEach((l, i) => l.material.color.setHex(i < lit ? color : LAMP_OFF));

  let mode = 'gp';
  let running = false;
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

  function start(nextMode = 'gp') {
    mode = nextMode;
    racers = mode === 'gp' ? [...rivals.slice(0, PLAYER_SLOT), player, ...rivals.slice(PLAYER_SLOT)] : [player];
    rivals.forEach((r) => { r.model.root.visible = false; });
    racers.forEach((r, slot) => {
      // 2대씩 줄지어 출발선 뒤에 선다
      const back = mode === 'gp' ? 10 + Math.floor(slot / 2) * 9 : 14;
      const side = mode === 'gp' ? (slot % 2 ? 3.4 : -3.4) : 0;
      r.physics.placeAt(1 - back / L, side);
      r.timer = createLapTimer(course.laps);
      r.finishTime = null;
      r.pace = 1;
      r.model.root.visible = true;
      r.model.sync(r.physics.state, 0);
      if (!r.isPlayer) r.ai = createAiDriver(path, profile, { skill: r.skill, lane: side * 0.6, seed: r.seed });
    });
    finishOrder = [];
    running = true;
    paused = false;
    cam.snap();
    hud.setLaps(course.laps);
    hud.setRacers(racers.length);
    hud.setBest(getBest(course.id).lap);
    hud.setCamera(cam.mode.label);
    hud.show(true, mode);
    setLamps(0);
  }

  function stop() {
    running = false;
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
        hud.count(String(e.n));
        setLamps(Math.round(((3 - e.n + 1) / 3) * lamps.length));
      } else if (e.type === 'go') {
        hud.count('출발!', 1);
        setLamps(lamps.length, LAMP_GREEN);
        lampOffAt = 2;
      } else if (e.type === 'lap') {
        const left = course.laps - e.lap;
        const label = left === 1 ? '마지막 바퀴' : left > 1 ? `${e.lap}바퀴 완료` : '';
        if (label) hud.toast(`${label} · ${formatTime(e.time)}`, 2.2, e.best ? 'good' : '');
      } else if (e.type === 'finish') {
        const result = submitResult(course.id, e);
        hud.setBest(result.best.lap);
        const place = finishOrder.indexOf(player) + 1;
        hud.count(mode === 'gp' ? `${place}위` : '완주!', 1.4);
        setTimeout(() => onFinish({ ...e, ...result, course, mode, place, standings: snapshot() }), 1400);
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
          a.vel.x -= nx * imp;
          a.vel.z -= nz * imp;
          b.vel.x += nx * imp;
          b.vel.z += nz * imp;
        }
      }
    }
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
    togglePause() {
      if (!running) return;
      paused = !paused;
      hud.toast(paused ? '일시 정지 · P를 누르면 계속' : '계속', paused ? 9999 : 0.8);
    },
    update(dt) {
      if (!running) return;
      if (input.wasPressed('KeyC')) hud.setCamera(cam.cycle().label);
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) this.togglePause();
      if (paused) return;

      // 내 차
      const pt = player.timer.state;
      let controls = pt.phase === 'running' ? input.read() : IDLE;
      if (pt.phase === 'finished') controls = { ...IDLE, brake: Math.abs(player.physics.state.speed) > 2 ? 1 : 0 };
      if (input.wasPressed('KeyR') && pt.phase === 'running') {
        player.physics.placeAt(player.physics.state.proj.progress, 0);
        hud.toast('주행선으로 돌아왔어요');
      }
      const events = stepRacer(player, dt, controls);
      if (player.physics.state.respawned) hud.toast('코스 밖으로 너무 멀리 나가서 주행선으로 돌아왔어요', 2);

      // 상대 차: 나와 너무 벌어지면 살짝 늦추거나 당긴다
      const myDist = raceDistance(player);
      for (const r of racers) {
        if (r.isPlayer) continue;
        const st = r.timer.state;
        let c = IDLE;
        if (st.phase === 'running') {
          const gap = raceDistance(r) - myDist;
          const want = gap > 70 ? 0.94 : gap < -70 ? 1.05 : 1;
          r.pace += (want - r.pace) * Math.min(1, dt * 0.5);
          const others = racers.filter((o) => o !== r).map((o) => o.physics.state);
          c = r.ai.decide(r.physics.state, others, dt, r.pace);
        } else if (st.phase === 'finished') {
          c = { ...IDLE, brake: Math.abs(r.physics.state.speed) > 6 ? 1 : 0 };
        }
        stepRacer(r, dt, c);
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

      const order = racers.length > 1 ? standings() : [player];
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
