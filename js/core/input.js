// 키보드 입력: 방향키·WASD로 달리고, 스페이스로 미끄러지며 돈다(드리프트)
const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  slide: ['Space', 'ShiftLeft', 'ShiftRight'],
};

export function createInput() {
  const held = new Set();
  const pressed = new Set(); // 이번 프레임에 새로 누른 키

  const onDown = (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  };
  const onUp = (e) => held.delete(e.code);
  const clear = () => held.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', clear);

  const any = (list) => list.some((k) => held.has(k));

  return {
    // 매 프레임 한 번 읽는다
    read() {
      return {
        throttle: any(KEYS.up) ? 1 : 0,
        brake: any(KEYS.down) ? 1 : 0,
        steer: (any(KEYS.left) ? 1 : 0) - (any(KEYS.right) ? 1 : 0),
        slide: any(KEYS.slide),
      };
    },
    wasPressed(code) { return pressed.has(code); },
    endFrame() { pressed.clear(); },
    clear,
  };
}
