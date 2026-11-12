// 태블릿·휴대폰용 화면 버튼. 누르는 동안 해당 키를 누른 것과 똑같이 동작한다.
export function isTouchDevice(params) {
  return params.has('touch') || window.matchMedia('(pointer: coarse)').matches;
}

export function bindTouchPad(input) {
  document.body.dataset.touch = '1';
  const pad = document.getElementById('touch-pad');
  pad.hidden = false;
  pad.querySelectorAll('button[data-key]').forEach((b) => {
    const code = b.dataset.key;
    const down = (e) => {
      e.preventDefault();
      try {
        b.setPointerCapture(e.pointerId); // 손가락이 버튼 밖으로 미끄러져도 계속 누른 것으로
      } catch {
        // 일부 브라우저는 고정을 지원하지 않는다: 그냥 누른 것으로 처리
      }
      b.classList.add('on');
      input.press(code);
    };
    const up = () => {
      b.classList.remove('on');
      input.release(code);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}
