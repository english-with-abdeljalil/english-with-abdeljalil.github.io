/**
 * eq-music.js — Background ambient music for English Quest
 * Generates a gentle, looping ambient soundscape using Web Audio API.
 * No external audio files needed.
 * Toggle via localStorage key "eq_music" ("on" / "off").
 * Respects eq_calm mode (never plays when calm is on).
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'eq_music';
  const CALM_KEY = 'eq_calm';

  let ctx = null;
  let masterGain = null;
  let nodes = [];
  let isPlaying = false;
  let startTime = 0;

  function isEnabled() {
    try {
      const calm = localStorage.getItem(CALM_KEY) === 'on';
      if (calm) return false;
      const val = localStorage.getItem(STORAGE_KEY);
      return val !== 'off';
    } catch(e) { return false; }
  }

  function initAudio() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.08; // very quiet — true background
      masterGain.connect(ctx.destination);
    } catch(e) {
      ctx = null;
      return;
    }
  }

  /** Creates a gentle pad drone using two detuned oscillators + LFO modulation */
  function startMusic() {
    if (isPlaying || !ctx || !masterGain) return;
    startTime = ctx.currentTime;

    // Two oscillators detuned for a warm chorus effect
    const freqs = [261.63, 329.63, 392.00]; // C4, E4, G4 — C major triad
    const oscs = [];

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Slight detune for warmth
      const detune = (i - 1) * 5;
      osc.detune.value = detune;

      // Each oscillator has its own gain envelope
      const g = ctx.createGain();
      g.gain.value = 0.3;

      // Slow LFO for gentle volume wobble
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15 + (i * 0.05); // very slow
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.15;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      lfo.start();

      osc.connect(g);
      g.connect(masterGain);
      osc.start();

      oscs.push(osc, lfo);
    });

    // Second layer: soft fifth above (adds depth)
    if (freqs.length >= 2) {
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freqs[1] * 1.5; // fifth
      osc2.detune.value = 3;
      const g2 = ctx.createGain();
      g2.gain.value = 0.12;
      const lfo2 = ctx.createOscillator();
      lfo2.type = 'sine';
      lfo2.frequency.value = 0.18;
      const lfoG2 = ctx.createGain();
      lfoG2.gain.value = 0.08;
      lfo2.connect(lfoG2);
      lfoG2.connect(g2.gain);
      lfo2.start();
      osc2.connect(g2);
      g2.connect(masterGain);
      osc2.start();
      oscs.push(osc2, lfo2);
    }

    nodes = oscs;
    isPlaying = true;
  }

  function stopMusic() {
    if (!isPlaying) return;
    if (masterGain) {
      // Fade out
      masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      setTimeout(() => {
        nodes.forEach(n => { try { n.stop(); n.disconnect(); } catch(e) {} });
        nodes = [];
        isPlaying = false;
        if (masterGain) masterGain.gain.value = 0.08;
      }, 800);
    } else {
      nodes.forEach(n => { try { n.stop(); n.disconnect(); } catch(e) {} });
      nodes = [];
      isPlaying = false;
    }
  }

  function toggle() {
    if (isEnabled()) {
      initAudio();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      startMusic();
    } else {
      stopMusic();
    }
  }

  // Listen for storage changes (settings page)
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY || e.key === CALM_KEY) {
      // Debounce: small delay to let settings page finish
      clearTimeout(window._eqMusicDebounce);
      window._eqMusicDebounce = setTimeout(toggle, 100);
    }
  });

  // Expose public API
  window.EQMusic = {
    start: function() {
      if (!isEnabled()) return;
      initAudio();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      startMusic();
    },
    stop: stopMusic,
    toggle: toggle,
    isPlaying: function() { return isPlaying; },
    /** Call on user interaction to resume suspended AudioContext */
    resume: function() {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
        if (isPlaying) startMusic();
      }
    }
  };

  // Auto-start on user interaction (browsers block autoplay)
  function autoStart() {
    if (isEnabled() && !isPlaying) {
      initAudio();
      startMusic();
    }
    document.removeEventListener('click', autoStart);
    document.removeEventListener('touchstart', autoStart);
    document.removeEventListener('keydown', autoStart);
  }
  document.addEventListener('click', autoStart);
  document.addEventListener('touchstart', autoStart);
  document.addEventListener('keydown', autoStart);

  // Also try immediate start (works if user already interacted)
  setTimeout(() => {
    if (isEnabled()) {
      initAudio();
      if (ctx && ctx.state === 'running') startMusic();
    }
  }, 1000);

})();
