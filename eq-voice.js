/* =====================================================================
   EQ-VOICE v5 — read-aloud engine for English Quest (Unit 1)
   ---------------------------------------------------------------------
   ONE reliable voice: the device's built-in speechSynthesis, hardened
   for phones. Plays instantly, downloads nothing, never freezes.
   (The in-browser AI voice was removed: it was too heavy for phones.)
   • Text is cleaned first: emojis and symbols are never read aloud.
   • Slightly slower rate for young learners.
   • Long texts are split into short chunks (Android drops long ones).
   • Waits for the phone to report English voices (avoids the Arabic/
     French default voice reading English).
   • Keep-alive defeats Chrome-Android's 15-second speech pause.
   • KILL SWITCH: speech stops when the student leaves the page, hides
     the app, presses back, or taps any button or link.
   ===================================================================== */
(function () {
  'use strict';

  function clean(text) {
    if (!text) return '';
    let t = String(text);
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2022}\u{00B7}]/gu, ' ');
    t = t.replace(/[^\p{L}\p{N}\s.,'’!?;:()\/%\-]/gu, ' ');
    t = t.replace(/\s*\.\s*\.\s*/g, '. ').replace(/\s+/g, ' ').trim();
    return t;
  }

  const RATE = 0.88;
  let genToken = 0;
  let voicesReady = false, resumeTimer = null;
  try {
    voicesReady = (speechSynthesis.getVoices() || []).length > 0;
    speechSynthesis.onvoiceschanged = () => { voicesReady = true; };
  } catch (e) {}

  function bestSysVoice() {
    try {
      const vs = (speechSynthesis.getVoices() || []).filter(v => v.lang && v.lang.indexOf('en') === 0);
      const sc = v => {
        const n = v.name + ' ' + v.lang;
        return (/natural|neural/i.test(n) ? 8 : 0) + (/google/i.test(n) ? 4 : 0) +
               (/online/i.test(n) ? 2 : 0) + (/GB|UK|female/i.test(n) ? 1 : 0);
      };
      return vs.sort((a, b) => sc(b) - sc(a))[0];
    } catch (e) { return null; }
  }
  function sysChunks(t) {
    const parts = t.match(/[^.!?;:]+[.!?;:]?/g) || [t];
    const out = []; let buf = '';
    parts.forEach(p => {
      if ((buf + p).length > 180) { if (buf.trim()) out.push(buf.trim()); buf = p; } else buf += p;
    });
    if (buf.trim()) out.push(buf.trim());
    return out;
  }
  function speakNow(t) {
    const token = ++genToken;
    const go = () => {
      if (token !== genToken) return;
      try {
        speechSynthesis.cancel();
        const v = bestSysVoice();
        sysChunks(t).forEach(chunk => {
          const u = new SpeechSynthesisUtterance(chunk);
          u.lang = 'en-GB'; u.rate = RATE;
          if (v) u.voice = v;
          speechSynthesis.speak(u);
        });
        clearInterval(resumeTimer);
        resumeTimer = setInterval(() => {
          try {
            if (!speechSynthesis.speaking && !speechSynthesis.pending) clearInterval(resumeTimer);
            else if (speechSynthesis.paused) speechSynthesis.resume();
          } catch (e) { clearInterval(resumeTimer); }
        }, 5000);
      } catch (e) {}
    };
    if (voicesReady) go();
    else {
      let waited = 0;
      const w = setInterval(() => {
        waited += 200;
        if (voicesReady || (speechSynthesis.getVoices() || []).length > 0 || waited >= 1200) {
          voicesReady = true; clearInterval(w); go();
        }
      }, 200);
    }
  }

  function stop() {
    genToken++;
    try { clearInterval(resumeTimer); } catch (e) {}
    try { speechSynthesis.cancel(); } catch (e) {}
  }
  function speak(text) {
    const t = clean(text);
    if (t.length < 2 || t.length > 1200) return;
    stop();
    speakNow(t);
  }

  /* audio never survives leaving the app */
  function killAll() { stop(); }
  window.addEventListener('pagehide', killAll);
  window.addEventListener('beforeunload', killAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) killAll(); });
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('a,button')) stop();
  }, true);

  window.EQVoice = { speak: speak, stop: stop, clean: clean, state: () => 'system' };
  window.EQSpeak = speak;
})();
