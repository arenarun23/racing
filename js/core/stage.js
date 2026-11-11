import * as THREE from 'three';
import { SUN_DIR } from '../course/sky.js';

// 렌더러·장면·조명. 그래픽 품질(light / standard / sharp)에 따라 해상도와 그림자를 조절한다.
export function createStage(canvas, quality = 'standard') {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'light', powerPreference: 'high-performance' });
  const ratioCap = { light: 1, standard: 1.5, sharp: 2 }[quality] ?? 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, ratioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality !== 'light';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040a);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 6000);

  // 태양: 대기가 없어 그림자가 진하고 날카롭다
  const sun = new THREE.DirectionalLight(0xfff6e8, 3.4);
  sun.position.copy(SUN_DIR).multiplyScalar(400);
  sun.castShadow = renderer.shadowMap.enabled;
  const size = quality === 'sharp' ? 4096 : 2048;
  sun.shadow.mapSize.set(size, size);
  const sc = sun.shadow.camera;
  sc.left = -300; sc.right = 300; sc.top = 300; sc.bottom = -300; sc.near = 10; sc.far = 1200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // 지구에서 반사된 빛(지구광)을 약하게 넣어 그늘에서도 형태가 보이게 한다
  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x2b2620, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  function focusShadow(center) {
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(SUN_DIR, 500);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, sun, focusShadow };
}
