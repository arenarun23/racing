// 효과음과 배경음: 소리 파일 없이 브라우저에서 직접 합성한다 (Web Audio)
// 브라우저 규칙상 화면을 한 번 누르거나 키를 눌러야 소리가 나기 시작한다.

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// 배경음 화음 진행: 가단조 (Am - F - C - G), 한 마디에 한 화음
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];

export function createSound({ sfx = true, music = true } = {}) {
  let ctx = null;
  let master;
  let sfxBus;
  let musicBus;
  let noiseBuf;
  let engine = null;
  let wantMusic = null; // 'lobby' | 'race' | null
  let timer = 0;
  let nextTime = 0;
  let step = 0;
  const on = { sfx, music };

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = on.sfx ? 0.7 : 0;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = on.music ? 0.26 : 0;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buildEngine();
    if (wantMusic) startScheduler();
  }

  // 다른 탭으로 가면 소리를 멈추고, 돌아오면 다시 낸다
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  // ---- 엔진 소리 (속도에 따라 높아진다) ----
  function buildEngine() {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    o2.detune.value = 7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    // 부스터: 바람 소리 (잡음을 거른 것)
    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuf;
    hiss.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1200;
    band.Q.value = 0.8;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    hiss.connect(band);
    band.connect(hissGain);
    hissGain.connect(sfxBus);
    o1.start();
    o2.start();
    hiss.start();
    engine = { o1, o2, filter, gain, hissGain, band };
  }

  function tone(freq, dur, { type = 'triangle', vol = 0.25, at = 0, slide = 0, bus = sfxBus } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, { vol = 0.3, at = 0, freq = 800, type = 'lowpass', bus = sfxBus } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---- 배경음 ----
  function scheduleStep(time) {
    const race = wantMusic === 'race';
    const bar = Math.floor(step / 16) % CHORDS.length;
    const s = step % 16;
    const chord = CHORDS[bar];
    const at = time - ctx.currentTime;
    const beat = race ? 60 / 112 : 60 / 84;
    if (s === 0) {
      // 화음 깔기: 천천히 커졌다 줄어드는 소리
      for (const n of chord) {
        const o = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = (Math.random() - 0.5) * 12;
        f.type = 'lowpass';
        f.frequency.value = race ? 1100 : 800;
        const len = beat * 4;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(race ? 0.05 : 0.07, time + len * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, time + len);
        o.connect(f);
        f.connect(g);
        g.connect(musicBus);
        o.start(time);
        o.stop(time + len + 0.05);
      }
    }
    // 반짝이는 분산화음
    const every = race ? 1 : 2;
    if (s % every === 0) {
      const n = chord[(s / every) % 3] + 12 + (s >= 8 && race ? 12 : 0);
      tone(midi(n), beat * (race ? 0.35 : 0.9), { type: 'triangle', vol: race ? 0.06 : 0.05, at, bus: musicBus });
    }
    if (race) {
      if (s % 2 === 0) tone(midi(chord[0] - 24), beat * 0.45, { type: 'sine', vol: 0.18, at, bus: musicBus }); // 베이스
      if (s % 4 === 0) tone(120, 0.18, { type: 'sine', vol: 0.35, at, slide: 45, bus: musicBus }); // 쿵
      if (s % 4 === 2) noise(0.05, { vol: 0.08, at, freq: 7000, type: 'highpass', bus: musicBus }); // 칙
    } else if (s === 8 && bar % 2 === 1) {
      tone(midi(chord[2] + 24), 1.2, { type: 'sine', vol: 0.04, at, bus: musicBus }); // 종소리
    }
  }

  function startScheduler() {
    if (!ctx || timer) return;
    nextTime = ctx.currentTime + 0.08;
    step = 0;
    timer = setInterval(() => {
      if (!wantMusic) return;
      const sixteenth = (wantMusic === 'race' ? 60 / 112 : 60 / 84) / 4;
      while (nextTime < ctx.currentTime + 0.15) {
        scheduleStep(nextTime);
        nextTime += sixteenth;
        step++;
      }
    }, 30);
  }

  return {
    unlock,
    setSfx(v) {
      on.sfx = v;
      if (sfxBus) sfxBus.gain.setTargetAtTime(v ? 0.7 : 0, ctx.currentTime, 0.05);
    },
    setMusic(v) {
      on.music = v;
      if (musicBus) musicBus.gain.setTargetAtTime(v ? 0.26 : 0, ctx.currentTime, 0.1);
    },
    music(kind) {
      if (wantMusic === kind) return;
      wantMusic = kind;
      step = 0;
      if (ctx) {
        nextTime = ctx.currentTime + 0.1;
        startScheduler();
      }
    },
    // 매 프레임: speed는 최고 속도 대비 비율, boost는 0·1·2단
    engine({ speed = 0, throttle = 0, boost = 0, active = false }) {
      if (!engine) return;
      const t = ctx.currentTime;
      engine.o1.frequency.setTargetAtTime(46 + speed * 120 + boost * 18, t, 0.08);
      engine.o2.frequency.setTargetAtTime((46 + speed * 120 + boost * 18) * 0.5, t, 0.08);
      engine.filter.frequency.setTargetAtTime(280 + speed * 1600 + throttle * 500, t, 0.1);
      engine.gain.gain.setTargetAtTime(active ? 0.035 + throttle * 0.035 : 0, t, 0.12);
      engine.hissGain.gain.setTargetAtTime(active ? boost * 0.07 : 0, t, 0.1);
      engine.band.frequency.setTargetAtTime(900 + speed * 900, t, 0.1);
    },
    countdown() { tone(660, 0.18, { type: 'square', vol: 0.16 }); },
    go() { tone(990, 0.5, { type: 'square', vol: 0.18 }); },
    lap() { [660, 880, 1320].forEach((f, i) => tone(f, 0.18, { vol: 0.2, at: i * 0.09 })); },
    finish(place = 1) {
      const notes = place <= 3 ? [523, 659, 784, 1047] : [523, 587, 659];
      notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 0.7 : 0.18, { type: 'square', vol: 0.14, at: i * 0.14 }));
    },
    boost(stage = 1) {
      noise(0.6, { vol: 0.25, freq: 1500, type: 'bandpass' });
      tone(stage === 2 ? 420 : 300, 0.5, { type: 'sawtooth', vol: 0.12, slide: stage === 2 ? 1400 : 900 });
    },
    correct() { tone(880, 0.12, { vol: 0.22 }); tone(1320, 0.25, { vol: 0.22, at: 0.1 }); },
    wrong() { tone(300, 0.35, { type: 'sawtooth', vol: 0.12, slide: 180 }); },
    bump(strength = 0.5) { noise(0.18, { vol: 0.15 + strength * 0.35, freq: 380 }); },
    pit() { [0, 0.12, 0.24].forEach((at) => noise(0.05, { vol: 0.25, at, freq: 3000, type: 'highpass' })); },
  };
}
