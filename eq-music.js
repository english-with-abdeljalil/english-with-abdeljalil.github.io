/**
 * eq-music.js v2 — Lo-fi beats for English Quest
 * Generates procedural lo-fi hip-hop (kick, snare, hi-hat, chord pads)
 * using Web Audio API. No external files needed.
 * Toggle via localStorage "eq_music" ("on" / "off").
 * Respects "eq_calm" mode.
 *
 * Exposes window.EQMusic for play/pause/next/prev/volume.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'eq_music';
  const CALM_KEY = 'eq_calm';

  // ── Track definitions ────────────────────────────────────────
  const TRACKS = [
    {
      name: 'Chill Study',
      bpm: 85,
      chords: [
        [220.00, 261.63, 329.63, 392.00], // Am7
        [293.66, 349.23, 440.00, 523.25], // Dm7
        [392.00, 493.88, 587.33, 698.46], // G7
        [523.25, 659.25, 783.99, 987.77], // Cmaj7
      ],
    },
    {
      name: 'Night Owl',
      bpm: 78,
      chords: [
        [349.23, 440.00, 523.25, 659.25], // Fmaj7
        [329.63, 392.00, 493.88, 587.33], // Em7
        [220.00, 261.63, 329.63, 392.00], // Am7
        [392.00, 493.88, 587.33, 698.46], // G7
      ],
    },
    {
      name: 'Rainy Day',
      bpm: 90,
      chords: [
        [293.66, 349.23, 440.00, 523.25], // Dm7
        [392.00, 493.88, 587.33, 698.46], // G7
        [523.25, 659.25, 783.99, 987.77], // Cmaj7
        [220.00, 261.63, 329.63, 392.00], // Am7
      ],
    },
  ];

  // ── State ────────────────────────────────────────────────────
  let ctx = null;
  let masterGain = null;
  let analyser = null;
  let filter = null;
  let trackIndex = 0;
  let vol = 0.35;
  let playing = false;
  let step = 0;          // 8th-note counter
  let nextEventTime = 0;
  let chordIndex = 0;
  let timerId = null;
  let prevChordNodes = [];
  let isInit = false;
  let visCallback = null;

  // ── Helpers ──────────────────────────────────────────────────
  function isEnabled() {
    try {
      if (localStorage.getItem(CALM_KEY) === 'on') return false;
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch { return false; }
  }

  function getTrack() { return TRACKS[trackIndex] || TRACKS[0]; }

  // ── Audio primitive generators ───────────────────────────────
  function noiseBuffer(ctx) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function kick(ctx, time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  function snare(ctx, time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.08);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.12);

    // Noise layer
    const buf = noiseBuffer(ctx);
    const ns = ctx.createBufferSource();
    const ng = ctx.createGain();
    ns.buffer = buf;
    ng.gain.setValueAtTime(0.4, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    ns.connect(ng);
    ng.connect(masterGain);
    ns.start(time);
    ns.stop(time + 0.08);
  }

  function hihat(ctx, time) {
    const buf = noiseBuffer(ctx);
    const ns = ctx.createBufferSource();
    const ng = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;
    ns.buffer = buf;
    ng.gain.setValueAtTime(0.25, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    ns.connect(hp);
    hp.connect(ng);
    ng.connect(masterGain);
    ns.start(time);
    ns.stop(time + 0.06);
  }

  function playChord(ctx, freqs, time, dur) {
    const nodes = [];
    const detuneAmount = 3; // slight detune for lo-fi warmth
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * detuneAmount + (Math.random() - 0.5) * 2;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.08);
      gain.gain.setValueAtTime(0.08, time + dur - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.05);
      nodes.push(osc, gain);
    });
    return nodes;
  }

  // ── Scheduler ────────────────────────────────────────────────
  function scheduleNext() {
    if (!playing || !ctx) return;

    // How far ahead to schedule (ms)
    const SCHED_AHEAD = 300;
    const track = getTrack();
    const eighthNote = 60 / track.bpm / 2; // seconds per 8th note

    // Schedule events until we're SCHED_AHEAD ms ahead
    while (nextEventTime < ctx.currentTime + SCHED_AHEAD / 1000) {
      const beat = step % 8; // 8 eighth-notes per bar

      // Kick: beats 0 and 4 (1 and 3)
      if (beat === 0 || beat === 4) kick(ctx, nextEventTime);

      // Snare: beats 2 and 6 (backbeat)
      if (beat === 2 || beat === 6) snare(ctx, nextEventTime);

      // Hi-hat: every 8th note
      if (beat % 2 === 0) {
        hihat(ctx, nextEventTime);
      } else {
        // Off-beat hi-hat slightly quieter
        const t = nextEventTime;
        setTimeout(() => {
          if (playing && ctx) hihat(ctx, t);
        }, 0);
      }

      // Chord change: every 8 beats (1 bar)
      if (beat === 0) {
        // Fade out previous chord
        prevChordNodes.forEach(n => {
          try {
            if (n instanceof GainNode) {
              n.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
              setTimeout(() => { try { n.disconnect(); } catch {} }, 500);
            }
          } catch {}
        });
        prevChordNodes = [];

        const chordDur = eighthNote * 8;
        const chord = track.chords[chordIndex % track.chords.length];
        chordIndex++;
        const nodes = playChord(ctx, chord, nextEventTime, chordDur);
        prevChordNodes = nodes;
      }

      step++;
      nextEventTime += eighthNote;
    }

    timerId = setTimeout(scheduleNext, 60);
  }

  // ── Public API ───────────────────────────────────────────────
  function init() {
    if (isInit) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = vol;

      analyser = ctx.createAnalyser();
      analyser.fftSize = 128;

      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      filter.Q.value = 1;

      masterGain.connect(analyser);
      analyser.connect(filter);
      filter.connect(ctx.destination);
      isInit = true;
    } catch (e) {
      ctx = null;
    }
  }

  function start() {
    if (playing || !ctx || !masterGain) return;
    if (!isEnabled()) return;
    if (ctx.state === 'suspended') ctx.resume();

    playing = true;
    step = 0;
    chordIndex = 0;
    nextEventTime = ctx.currentTime + 0.05;
    scheduleNext();
  }

  function stop() {
    playing = false;
    if (timerId) { clearTimeout(timerId); timerId = null; }
    prevChordNodes.forEach(n => { try { n.disconnect(); } catch {} });
    prevChordNodes = [];
    // Fade out
    if (masterGain) {
      masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      setTimeout(() => {
        if (masterGain) masterGain.gain.value = vol;
      }, 400);
    }
  }

  function toggle() {
    if (!isEnabled()) { stop(); return; }
    init();
    if (!ctx) return;
    if (playing) stop();
    else start();
  }

  function nextTrack() {
    const wasPlaying = playing;
    stop();
    trackIndex = (trackIndex + 1) % TRACKS.length;
    if (wasPlaying) setTimeout(() => start(), 100);
  }

  function prevTrack() {
    const wasPlaying = playing;
    stop();
    trackIndex = (trackIndex - 1 + TRACKS.length) % TRACKS.length;
    if (wasPlaying) setTimeout(() => start(), 100);
  }

  function setVolume(v) {
    vol = Math.max(0, Math.min(1, v));
    if (masterGain) masterGain.gain.value = vol;
  }

  function readAnalyser(bars) {
    if (!analyser) return new Uint8Array(bars || 6).fill(0);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    if (!bars) return data;
    // Downsample to N bars
    const result = new Uint8Array(bars);
    const binSize = Math.max(1, Math.floor(data.length / bars));
    for (let i = 0; i < bars; i++) {
      let sum = 0, count = 0;
      for (let j = 0; j < binSize && i * binSize + j < data.length; j++) {
        sum += data[i * binSize + j];
        count++;
      }
      result[i] = count > 0 ? sum / count : 0;
    }
    return result;
  }

  function destroy() {
    stop();
    prevChordNodes.forEach(n => { try { n.disconnect(); } catch {} });
    prevChordNodes = [];
    if (filter) { try { filter.disconnect(); } catch {}; filter = null; }
    if (analyser) { try { analyser.disconnect(); } catch {}; analyser = null; }
    if (masterGain) { try { masterGain.disconnect(); } catch {}; masterGain = null; }
    if (ctx) { try { ctx.close(); } catch {}; ctx = null; }
    isInit = false;
  }

  // ── Storage watcher ──────────────────────────────────────────
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY || e.key === CALM_KEY) {
      clearTimeout(window._eqMusicDebounce);
      window._eqMusicDebounce = setTimeout(toggle, 100);
    }
  });

  // ── Tab visibility ───────────────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) {
      stop();
      window._eqHidden = true;
    } else if (!document.hidden && window._eqHidden) {
      window._eqHidden = false;
      if (isEnabled()) { init(); start(); }
    }
  });

  // Expose public interface
  window.EQMusic = {
    start: function () {
      if (!isEnabled()) return;
      init();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      start();
    },
    stop: stop,
    toggle: toggle,
    nextTrack: nextTrack,
    prevTrack: prevTrack,
    setVolume: setVolume,
    readAnalyser: readAnalyser,
    destroy: destroy,
    isPlaying: function () { return playing; },
    getTrack: function () { return getTrack(); },
    trackIndex: function () { return trackIndex; },
    trackCount: function () { return TRACKS.length; },
    resume: function () {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      if (isEnabled() && !playing) start();
    },
  };

  // Auto-start on first user interaction
  function autoStart() {
    if (isEnabled() && !playing) {
      init();
      start();
    }
    document.removeEventListener('click', autoStart);
    document.removeEventListener('touchstart', autoStart);
    document.removeEventListener('keydown', autoStart);
  }
  document.addEventListener('click', autoStart);
  document.addEventListener('touchstart', autoStart);
  document.addEventListener('keydown', autoStart);

  // Also try immediate start if AudioContext is already running
  setTimeout(() => {
    if (isEnabled()) {
      init();
      if (ctx && ctx.state === 'running') start();
    }
  }, 1000);

})();
