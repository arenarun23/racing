import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 코스 보기 카메라: tour(주행선 따라 비행), top(위에서), free(마우스로 돌려 보기)
export function createViewCamera(camera, dom, path, center) {
  const controls = new OrbitControls(camera, dom);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 20;
  controls.maxDistance = 700;
  controls.autoRotateSpeed = 0.4;

  const box = new THREE.Box3();
  path.samples.forEach((s) => box.expandByPoint(s.p));
  const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);

  let mode = 'tour';
  let progress = 0;
  let blend = 1;
  const fromPos = new THREE.Vector3();
  const fromQuat = new THREE.Quaternion();
  const goalPos = new THREE.Vector3();
  const goalLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const look = new THREE.Matrix4();
  const goalQuat = new THREE.Quaternion();

  function setMode(next) {
    if (next === mode) return;
    fromPos.copy(camera.position);
    fromQuat.copy(camera.quaternion);
    blend = 0;
    mode = next;
    controls.enabled = mode === 'free';
    controls.autoRotate = mode === 'free';
    if (mode === 'free') {
      controls.target.copy(center).setY(4);
    }
  }

  function goal(dt) {
    if (mode === 'tour') {
      progress = (progress + (42 * dt) / path.length) % 1;
      const s = path.sampleAt(progress);
      goalPos.copy(s.p).addScaledVector(s.right, -2.5).setY(s.p.y + 4.2);
      path.pointAt(progress + 30 / path.length, 0, goalLook);
      goalLook.y += 1.5;
    } else if (mode === 'top') {
      goalLook.copy(center).setY(0);
      goalPos.set(center.x, span * 1.2, center.z + span * 0.42);
    }
  }

  return {
    get mode() { return mode; },
    setMode,
    update(dt) {
      if (mode === 'free') {
        if (blend < 1) {
          // 자유 시점으로 넘어갈 때 비스듬히 내려다보는 위치로 옮겨 준다
          blend = Math.min(1, blend + dt * 1.2);
          const k = 1 - (1 - blend) ** 3;
          tmp.copy(center).add(new THREE.Vector3(span * 0.45, span * 0.32, span * 0.45));
          camera.position.lerpVectors(fromPos, tmp, k);
          if (blend >= 1) controls.update();
          else camera.lookAt(controls.target);
        } else {
          controls.update();
        }
        return;
      }
      goal(dt);
      look.lookAt(goalPos, goalLook, camera.up);
      goalQuat.setFromRotationMatrix(look);
      if (blend < 1) {
        blend = Math.min(1, blend + dt * 0.9);
        const k = 1 - (1 - blend) ** 3;
        camera.position.lerpVectors(fromPos, goalPos, k);
        camera.quaternion.slerpQuaternions(fromQuat, goalQuat, k);
      } else {
        camera.position.lerp(goalPos, 1 - Math.exp(-dt * 8));
        camera.quaternion.slerp(goalQuat, 1 - Math.exp(-dt * 5));
      }
    },
    // 경기를 마치고 돌아올 때: 지금 카메라 자리에서 부드럽게 이어 간다
    resume() {
      camera.fov = 60;
      camera.updateProjectionMatrix();
      fromPos.copy(camera.position);
      fromQuat.copy(camera.quaternion);
      blend = 0;
    },
    jumpToStart() {
      progress = 0;
      goal(0);
      camera.position.copy(goalPos);
      camera.lookAt(goalLook);
    },
  };
}
