// 기울여서 조종하기: 태블릿을 운전대처럼 좌우로 돌리면(또는 기울이면) 방향이 바뀐다.
// 기기의 중력 센서 값(devicemotion)을 화면 방향에 맞춰 바꾼 뒤, 화면 오른쪽으로 쏠린 정도를 쓴다.
const MAX_ANGLE = 22; // 이만큼 기울이면 끝까지 꺾은 것으로 본다 (도)
const DEAD = 3;       // 이보다 작게 기울인 것은 무시 (손떨림)

export function createTilt() {
  let enabled = false;
  let listening = false;
  let gx = 0; // 화면 기준 오른쪽 방향 중력 (m/s²)
  let gy = 0; // 화면 기준 아래쪽 방향 중력
  let have = false;
  let sign = 1;  // 기기마다 센서 부호가 다를 수 있어 가운데 맞추기 때 정한다
  let zero = 0;
  let invert = false;
  let smooth = 0;

  const angle = () => (screen.orientation?.angle ?? window.orientation ?? 0);

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    // 기기 좌표(세로 기준) → 화면 좌표(지금 화면 방향 기준)
    const r = ((angle() % 360) + 360) % 360;
    let sx;
    let sy;
    if (r === 90) { sx = -a.y; sy = -a.x; } else if (r === 270) { sx = a.y; sy = a.x; } else if (r === 180) { sx = -a.x; sy = a.y; } else { sx = a.x; sy = -a.y; }
    gx = sx;
    gy = sy;
    have = true;
  }

  function listen() {
    if (listening) return;
    window.addEventListener('devicemotion', onMotion);
    listening = true;
  }

  return {
    get supported() { return typeof window.DeviceMotionEvent !== 'undefined'; },
    get active() { return enabled && have; },
    get enabled() { return enabled; },
    setInvert(v) { invert = !!v; },
    // 켜기: 아이패드·아이폰은 이때 한 번 권한을 물어본다 (버튼을 누른 순간에 불러야 한다)
    async enable() {
      try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          const r = await DeviceMotionEvent.requestPermission();
          if (r !== 'granted') return false;
        }
      } catch {
        return false;
      }
      listen();
      enabled = true;
      return true;
    },
    disable() { enabled = false; },
    // 가운데 맞추기: 지금 들고 있는 자세를 '똑바로'로 정한다
    calibrate() {
      // 화면이 세워져 있으면 아래쪽 중력 부호로 센서 부호를 정한다 (규격대로면 음수)
      if (Math.abs(gy) > 3) sign = gy < 0 ? 1 : -1;
      else sign = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? -1 : 1;
      zero = this.rawAngle();
      smooth = 0;
    },
    // 화면 오른쪽으로 기울어진 각도 (도)
    rawAngle() {
      const down = -sign * gx; // 센서는 중력의 반대(위) 방향을 재므로 부호를 뒤집는다
      return Math.asin(Math.max(-1, Math.min(1, down / 9.81))) * (180 / Math.PI);
    },
    // 조향값: 왼쪽 +1 ~ 오른쪽 -1 (키보드와 같은 약속), 꺼져 있으면 null
    steer() {
      if (!enabled || !have) return null;
      let d = this.rawAngle() - zero;
      d = Math.abs(d) < DEAD ? 0 : (Math.abs(d) - DEAD) * Math.sign(d);
      const v = Math.max(-1, Math.min(1, -d / (MAX_ANGLE - DEAD))) * (invert ? -1 : 1);
      smooth += (v - smooth) * 0.35;
      return smooth;
    },
  };
}
