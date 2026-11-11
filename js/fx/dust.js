import * as THREE from 'three';

// 레골리스 먼지: 공기가 없어 퍼지지 않고 포물선을 그리며 떨어진다
export function createDust(max = 400, gravity = 1.62 * 3) {
  const pos = new Float32Array(max * 3);
  const alpha = new Float32Array(max);
  const size = new Float32Array(max);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const age = new Float32Array(max);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { color: { value: new THREE.Color(0xb9b4aa) }, scale: { value: 300 } },
    vertexShader: `
      attribute float alpha;
      attribute float size;
      varying float vAlpha;
      uniform float scale;
      void main() {
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(color, vAlpha * (1.0 - d * 2.0));
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'dust';

  return {
    object: points,
    emit(at, baseVel, amount = 1, spread = 2.5) {
      for (let n = 0; n < amount; n++) {
        const i = cursor;
        cursor = (cursor + 1) % max;
        pos[i * 3] = at.x + (Math.random() - 0.5) * 0.6;
        pos[i * 3 + 1] = at.y + 0.1;
        pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.6;
        vel[i * 3] = baseVel.x * 0.3 + (Math.random() - 0.5) * spread;
        vel[i * 3 + 1] = 1 + Math.random() * spread * 1.2;
        vel[i * 3 + 2] = baseVel.z * 0.3 + (Math.random() - 0.5) * spread;
        life[i] = 0.9 + Math.random() * 0.9;
        age[i] = 0;
        size[i] = 0.5 + Math.random() * 0.8;
      }
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        if (age[i] >= life[i]) { alpha[i] = 0; continue; }
        age[i] += dt;
        vel[i * 3 + 1] -= gravity * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const t = age[i] / life[i];
        alpha[i] = 0.55 * (1 - t);
        size[i] += dt * 0.8;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    },
  };
}
