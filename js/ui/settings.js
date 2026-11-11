import { clearBest } from '../store.js';

const $ = (s) => document.querySelector(s);

// 설정 창: 그래픽 품질, 자동 가속, 기본 카메라, 바퀴 수, 기록 지우기
export function createSettings({ prefs, onChange }) {
  const dlg = $('#settings');
  const value = { quality: prefs.quality, autoThrottle: prefs.autoThrottle, camera: prefs.camera, laps: prefs.laps };

  function mark() {
    dlg.querySelectorAll('.seg[data-set]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value[seg.dataset.set]))));
    });
    $('#set-auto').checked = value.autoThrottle;
  }

  dlg.querySelectorAll('.seg[data-set]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const key = seg.dataset.set;
      const before = value[key];
      value[key] = key === 'laps' ? Number(b.dataset.v) : b.dataset.v;
      mark();
      onChange({ ...value }, key === 'quality' && before !== value.quality);
    });
  });
  $('#set-auto').addEventListener('change', (e) => {
    value.autoThrottle = e.target.checked;
    onChange({ ...value }, false);
  });
  $('#set-clear').addEventListener('click', () => {
    if (!window.confirm('이 컴퓨터에 저장된 내 최고 기록을 모두 지울까요? 지운 기록은 되돌릴 수 없어요.')) return;
    clearBest();
    $('#set-clear-note').textContent = '최고 기록을 지웠어요.';
  });

  mark();
  return {
    open() {
      mark();
      $('#set-clear-note').textContent = '';
      dlg.showModal();
    },
  };
}
