import * as THREE from 'three';
import { createCarModel } from '../vehicle/car-model.js';
import { createCarPhysics } from '../vehicle/car-physics.js';
import { createChaseCamera } from '../core/chase-camera.js';
import { createDust } from '../fx/dust.js';
import { createLapTimer, formatTime } from './lap-timer.js';
import { getBest, submitResult } from '../store.js';

const LAMP_OFF = 0x3a1414;
const LAMP_RED = 0xff3b30;
const LAMP_GREEN = 0x3ddc84;
const IDLE = { throttle: 0, brake: 0, steer: 0, slide: false };

// 혼자 달리는 연습 주행 한 판을 관리한다
export function createRace({ scene, camera, path, terrain, colliders, course, hud, input }) {
  const model = createCarModel();
  model.root.visible = false;
  scene.add(model.root);
  const physics = createCarPhysics({ path, terrain, colliders, gravity: course.gravity });
  const cam = createChaseCamera(camera);
  const dust = createDust(420, course.gravity * 3);
  scene.add(dust.object);

  const gate = scene.getObjectByName('start-gate');
  const lamps = [0, 1, 2, 3, 4].map((i) => gate?.getObjectByName(`start-lamp-${i}`)).filter(Boolean);
  const setLamps = (lit, color = LAMP_RED) => lamps.forEach((l, i) => l.material.color.setHex(i < lit ? color : LAMP_OFF));

  let timer = null;
  let running = false;
  let paused = false;
  let lampOffAt = 0;
  let onFinish = () => {};
  const tmp = new THREE.Vector3();
  const rearL = new THREE.Vector3();
  const rearR = new THREE.Vector3();

  function start() {
    // 출발선 14m 뒤, 도로 가운데에서 출발
    physics.placeAt(1 - 14 / path.length, 0);
    timer = createLapTimer(course.laps);
    running = true;
    paused = false;
    model.root.visible = true;
    cam.snap();
    hud.setLaps(course.laps);
    hud.setBest(getBest(course.id).lap);
    hud.setCamera(cam.mode.label);
    hud.show(true);
    setLamps(0);
  }

  function stop() {
    running = false;
    model.root.visible = false;
    hud.show(false);
    setLamps(0);
  }

  function handleEvents() {
    for (const e of timer.takeEvents()) {
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
        setTimeout(() => onFinish({ ...e, ...result, course }), 1400);
        hud.count('완주!', 1.4);
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

  return {
    get running() { return running; },
    get debug() { return { physics, timer, cam }; }, // 개발 확인용
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

      const st = timer.state;
      let controls = st.phase === 'running' ? input.read() : IDLE;
      if (st.phase === 'finished') controls = { ...IDLE, brake: Math.abs(physics.state.speed) > 2 ? 1 : 0 };

      if (input.wasPressed('KeyR') && st.phase === 'running') {
        physics.placeAt(physics.state.proj.progress, 0);
        hud.toast('주행선으로 돌아왔어요');
      }

      physics.step(dt, controls);
      const state = physics.state;
      if (state.respawned) hud.toast('코스 밖으로 너무 멀리 나가서 주행선으로 돌아왔어요', 2);

      const tan = state.proj.sample.tan;
      const along = state.vel.x * tan.x + state.vel.z * tan.z;
      timer.update(dt, state.proj.progress, along);
      handleEvents();
      if (timer.wrongWay && st.phase === 'running') hud.toast('반대 방향이에요', 0.4, 'warn');

      if (lampOffAt > 0) {
        lampOffAt -= dt;
        if (lampOffAt <= 0) setLamps(0);
      }

      emitDust(state, dt);
      dust.update(dt);
      model.sync(state, dt);
      cam.update(dt, state);
      hud.update(dt, { timer, state });
    },
  };
}
