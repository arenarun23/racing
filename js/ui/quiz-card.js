const $ = (s) => document.querySelector(s);

// 부스터 퀴즈 카드: 경기가 잠시 멈춘 동안 한 문제를 푼다. 1~4 키나 클릭으로 고른다.
export function createQuizCard() {
  const root = $('#quiz');
  const qEl = $('#quiz-q');
  const list = $('#quiz-choices');
  const feedback = $('#quiz-feedback');
  const next = $('#quiz-next');
  const count = $('#quiz-count');
  let resolve = null;
  let current = null;
  let answered = false;
  let correct = false;

  function choose(i) {
    if (answered || !current) return;
    answered = true;
    correct = i === current.answer;
    [...list.children].forEach((li, k) => {
      const b = li.firstElementChild;
      b.disabled = true;
      if (k === current.answer) b.dataset.state = 'right';
      else if (k === i) b.dataset.state = 'wrong';
    });
    feedback.dataset.tone = correct ? 'good' : 'warn';
    feedback.innerHTML = `<b>${correct ? '정답! 부스터 +1' : '아쉬워요'}</b> ${current.explain}`;
    next.hidden = false;
    next.focus();
  }

  function close() {
    root.hidden = true;
    document.activeElement?.blur();
    window.removeEventListener('keydown', onKey, true);
    const r = resolve;
    resolve = null;
    r?.({ correct });
  }

  function onKey(e) {
    if (root.hidden) return;
    const n = Number(e.key);
    if (!answered && n >= 1 && n <= current.choices.length) {
      e.preventDefault();
      e.stopPropagation();
      choose(n - 1);
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault(); // 퀴즈 중에는 화면이 움직이지 않게
    }
  }

  next.addEventListener('click', close);

  return {
    get isOpen() { return !root.hidden; },
    // 문제를 띄우고, 답을 고르고 '계속'을 누르면 { correct }로 끝난다
    ask(question, label = '') {
      current = question;
      answered = false;
      correct = false;
      qEl.textContent = question.q;
      count.textContent = label;
      list.innerHTML = '';
      question.choices.forEach((c, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
        b.lastElementChild.textContent = c;
        b.addEventListener('click', () => choose(i));
        li.append(b);
        list.append(li);
      });
      feedback.textContent = '';
      feedback.dataset.tone = '';
      next.hidden = true;
      root.hidden = false;
      window.addEventListener('keydown', onKey, true);
      list.querySelector('button')?.focus({ preventScroll: true });
      return new Promise((r) => { resolve = r; });
    },
    cancel() { if (!root.hidden) { correct = false; close(); } },
  };
}
