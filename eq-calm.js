/* =====================================================================
   EQ-CALM — global mute + calm mode for English Quest
   ---------------------------------------------------------------------
   One visible toggle on every screen (bottom-right):
     🔔 Sounds & effects ON   ·   🌙 CALM MODE (quiet + still)
   Calm mode silences ALL sound effects, music and vibration AND stops
   the animations/confetti/pulsing — one switch to dial stimulation
   down for students who are easily overstimulated. Read-aloud voice
   stays available (it is tapped on purpose and is a learning tool).
   The choice is remembered on the device. Defaults to calm if the
   device asks for reduced motion.
   ===================================================================== */
(function () {
  'use strict';
  const KEY = 'eq_calm';
  let on;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'on') on = true;
    else if (saved === 'off') on = false;
    else on = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { on = false; }

  const css = document.createElement('style');
  css.textContent =
    'body.eq-calm *, body.eq-calm *::before, body.eq-calm *::after {' +
    '  animation: none !important; transition: none !important; }' +
    'body.eq-calm .confetti, body.eq-calm .ember, body.eq-calm .star,' +
    'body.eq-calm .fireball, body.eq-calm #dmg-float, body.eq-calm #pet-pop { display: none !important; }' +
    '#eq-calm-btn { position: fixed; bottom: 14px; right: 14px; z-index: 99990;' +
    '  width: 46px; height: 46px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35);' +
    '  background: rgba(26,11,46,.92); color: #fff; font-size: 20px; cursor: pointer;' +
    '  box-shadow: 0 4px 14px rgba(0,0,0,.5); font-family: system-ui; }' +
    '#eq-calm-btn.calm { border-color: #7dd3fc; background: #0c2233; }' +
    '#eq-calm-tip { position: fixed; bottom: 66px; right: 14px; z-index: 99990;' +
    '  background: #1a0b2e; color: #d8cffc; border: 1.5px solid rgba(255,255,255,.3);' +
    '  border-radius: 10px; padding: 7px 11px; font: 700 11.5px/1.4 "Segoe UI",system-ui,sans-serif;' +
    '  display: none; max-width: 210px; text-align: right; }';
  document.head.appendChild(css);

  function apply() {
    document.body.classList.toggle('eq-calm', on);
    const b = document.getElementById('eq-calm-btn');
    if (b) { b.textContent = on ? '🌙' : '🔔'; b.className = on ? 'calm' : ''; b.title = on ? 'Calm mode is ON — tap for sounds & effects' : 'Tap for CALM mode (no sounds, no effects)'; }
  }
  function toggle() {
    on = !on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    apply();
    const tip = document.getElementById('eq-calm-tip');
    if (tip) {
      tip.textContent = on ? '🌙 Calm mode: no sounds, no music, no animations. Voice still works.' : '🔔 Sounds & effects are back ON!';
      tip.style.display = 'block';
      clearTimeout(toggle._t);
      toggle._t = setTimeout(() => { tip.style.display = 'none'; }, 3200);
    }
  }
  function init() {
    if (!document.body) return;
    if (!document.getElementById('eq-calm-btn')) {
      const b = document.createElement('button');
      b.id = 'eq-calm-btn';
      b.onclick = toggle;
      document.body.appendChild(b);
      const tip = document.createElement('div');
      tip.id = 'eq-calm-tip';
      document.body.appendChild(tip);
    }
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  /* The interactive worksheet rebuilds its whole document after load —
     re-inject the button if it disappears. */
  setInterval(() => { if (document.body && !document.getElementById('eq-calm-btn')) init(); }, 1500);

  window.EQCalm = { get on() { return on; } };
})();
