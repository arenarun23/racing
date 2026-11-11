import * as THREE from 'three';
import { createCarModel } from '../vehicle/car-model.js';
import { MACHINES, BODY_COLORS, HELMET_COLORS, hex, machineName } from '../vehicle/machines.js';

const $ = (s) => document.querySelector(s);

// 내 머신 창: 머신 모양, 차체·헬멧 색, 드라이버 이름을 고르고 돌아가는 미리보기로 확인한다
export function createGarage({ prefs, onChange }) {
  const dlg = $('#garage');
  const canvas = $('#garage-preview');
  const value = { machine: prefs.machine, color: prefs.color, helmet: prefs.helmet, name: prefs.name };

  // 미리보기용 작은 장면 (창이 열려 있을 때만 그린다)
  let renderer = null;
  let scene = null;
  let camera = null;
  let model = null;
  let raf = 0;
  let angle = 0.6;

  function ensureRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x30281f, 1.3));
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.6);
    sun.position.set(4, 7, 5);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 4.6, 12.5);
    camera.lookAt(0, 0.8, 0);
  }

  function rebuild() {
    if (!scene) return;
    if (model) scene.remove(model.root);
    model = createCarModel({ style: value.machine, body: hex(value.color), helmet: hex(value.helmet) });
    scene.add(model.root);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    angle += 0.008;
    if (model) model.root.rotation.y = angle;
    renderer.render(scene, camera);
  }

  // 선택지 그리기
  const machineGrid = $('#machine-grid');
  machineGrid.innerHTML = MACHINES.map((m) => `<button type="button" data-v="${m.id}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('');
  const swatches = (el, list) => {
    el.innerHTML = list.map((c) => `<button type="button" data-v="${c}" style="--c:${c}" aria-label="색 ${c}"></button>`).join('');
  };
  swatches($('#body-colors'), BODY_COLORS);
  swatches($('#helmet-colors'), HELMET_COLORS);
  const nameInput = $('#driver-name');

  function mark() {
    machineGrid.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value.machine)));
    $('#body-colors').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value.color)));
    $('#helmet-colors').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value.helmet)));
    nameInput.value = value.name;
  }

  function changed() {
    mark();
    rebuild();
    onChange({ ...value });
  }

  machineGrid.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { value.machine = b.dataset.v; changed(); }
  });
  $('#body-colors').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { value.color = b.dataset.v; changed(); }
  });
  $('#helmet-colors').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { value.helmet = b.dataset.v; changed(); }
  });
  nameInput.addEventListener('input', () => {
    value.name = nameInput.value.slice(0, 8);
    onChange({ ...value });
  });
  dlg.addEventListener('close', () => cancelAnimationFrame(raf));

  mark();

  return {
    open() {
      ensureRenderer();
      rebuild();
      mark();
      dlg.showModal();
      cancelAnimationFrame(raf);
      loop();
    },
    summary() {
      return { machine: machineName(value.machine), name: value.name.trim(), color: value.color };
    },
  };
}
