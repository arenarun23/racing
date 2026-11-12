import { getAllBest, getRuns } from '../store.js';
import { getCourse } from '../course/courses.js';
import { formatTime } from '../race/lap-timer.js';

const $ = (s) => document.querySelector(s);
const DIFF = { easy: '입문', normal: '중급', hard: '상급' };
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function when(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 기록실: 코스별 최고 기록과 최근 경주 50개 (이 컴퓨터에 저장된 것)
export function createRecords() {
  const dlg = $('#records');
  const tabs = dlg.querySelectorAll('[role=tab]');
  let tab = 'best';

  function renderBest() {
    const list = getAllBest();
    if (!list.length) return '<p class="empty">아직 기록이 없어요. 한 판 완주하면 여기에 남아요.</p>';
    return list.map((b) => {
      const c = getCourse(b.courseId);
      const totals = Object.entries(b.totals)
        .filter(([, t]) => t != null)
        .sort(([a], [z]) => a - z)
        .map(([laps, t]) => `<div><dt>${laps}바퀴 총 시간</dt><dd>${formatTime(t)}</dd></div>`)
        .join('');
      return `<article class="best-card">
        <p class="best-group">${esc(c.group)} · ${esc(c.place)}</p>
        <h3>${esc(c.name)}</h3>
        <dl><div class="lap"><dt>한 바퀴 최고</dt><dd>${formatTime(b.lap)}</dd></div>${totals}</dl>
      </article>`;
    }).join('');
  }

  function renderRuns() {
    const runs = getRuns();
    if (!runs.length) return '<p class="empty">아직 끝낸 경주가 없어요.</p>';
    const rows = runs.map((r) => `<tr>
      <td>${when(r.at)}</td>
      <td>${r.mode === 'gp' ? `<b class="place">${r.place}위</b><span>/${r.racers}</span>` : '연습'}</td>
      <td>${esc(r.name)}<span class="sub">${esc(r.machine)}</span></td>
      <td class="num">${formatTime(r.total)}</td>
      <td class="num">${formatTime(r.bestLap)}</td>
      <td>${r.laps}바퀴 · ${DIFF[r.difficulty] || '-'}</td>
      <td>${r.quiz && r.quiz.total ? `${r.quiz.right}/${r.quiz.total}` : '-'}</td>
    </tr>`).join('');
    return `<div class="table-wrap"><table class="runs">
      <thead><tr><th>날짜</th><th>결과</th><th>드라이버</th><th>총 시간</th><th>최고 랩</th><th>조건</th><th>퀴즈</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function render() {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    $('#records-body').innerHTML = tab === 'best' ? `<div class="best-grid">${renderBest()}</div>` : renderRuns();
  }

  tabs.forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; render(); }));

  return {
    open(which = tab) {
      tab = which;
      render();
      dlg.showModal();
    },
  };
}
