import * as THREE from 'three';
import { createStage } from './core/stage.js';
import { createViewCamera } from './core/view-camera.js';
import { getCourse } from './course/courses.js';
import { buildCoursePath } from './course/course-path.js';
import { createTerrain } from './course/terrain.js';
import { createRoad } from './course/road-ribbon.js';
import { createLandmarks } from './course/moon-base.js';
import { createSky } from './course/sky.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const quality = ['light', 'standard', 'sharp'].includes(params.get('q')) ? params.get('q') : 'standard';

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

  renderer.compile(scene, camera);
  await setProgress(1, '준비 완료');

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    view.update(dt);
    sky.follow(camera);
    landmarks.update(t);
    renderer.render(scene, camera);
  });

  document.body.dataset.state = 'ready';
  window.__race = { scene, camera, path, view }; // 개발 중 콘솔 확인용
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
