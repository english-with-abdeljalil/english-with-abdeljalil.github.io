/* =====================================================================
   EQ-VOICE — shared read-aloud engine for English Quest (Unit 1)
   ---------------------------------------------------------------------
   1. Cleans text before speaking: strips emojis, symbols and anything
      that is not a real word, and slows the rate for young learners.
   2. Lazily loads the open-source Kokoro TTS model (82M, runs 100% in
      the browser, no API key, no server) the FIRST time a student taps
      listen. Shows a small "loading voice…" chip during the download.
   3. Never breaks: while Kokoro is loading — and on any failure or on
      weak devices — it automatically uses the device's best built-in
      speechSynthesis voice instead.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- text cleaning: only real words get spoken ---------- */
  function clean(text) {
    if (!text) return '';
    let t = String(text);
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2022}\u{00B7}]/gu, ' ');
    t = t.replace(/[^\p{L}\p{N}\s.,'’!?;:()\/%\-]/gu, ' ');       // keep words + basic punctuation
    t = t.replace(/\s*\.\s*\.\s*/g, '. ');                        // stray dot runs
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  const RATE = 0.88;               // slightly slower for A1 learners
  const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  const KOKORO_CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
  const VOICE = 'af_heart';        // Kokoro's highest-quality English voice
  const LOAD_TIMEOUT = 90000;      // 90s: slow school wifi still has a chance

  let kokoro = null;               // instance when ready
  let kState = 'idle';             // idle | loading | ready | failed
  let curAudio = null;             // playing <audio> (kokoro path)
  let genToken = 0;                // cancels stale generation chains

  /* ---------- tiny status chip ---------- */
  let chip = null, chipTimer = null;
  function status(msg, sticky) {
    try {
      if (!chip) {
        chip = document.createElement('div');
        chip.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);' +
          'background:#1a0b2e;color:#fbbf24;border:1.5px solid #fbbf24;border-radius:999px;' +
          'padding:8px 16px;font:700 12.5px/1.3 "Segoe UI",system-ui,sans-serif;z-index:99999;' +
          'box-shadow:0 4px 14px rgba(0,0,0,.5);max-width:92vw;text-align:center';
        document.body.appendChild(chip);
      }
      clearTimeout(chipTimer);
      if (!msg) { chip.style.display = 'none'; return; }
      chip.textContent = msg;
      chip.style.display = 'block';
      if (!sticky) chipTimer = setTimeout(() => { chip.style.display = 'none'; }, 4000);
    } catch (e) {}
  }

  /* ---------- device check: skip the big model on weak phones ---------- */
  function deviceOK() {
    try {
      if (navigator.deviceMemory && navigator.deviceMemory < 3) return false;
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return false;
      return typeof WebAssembly !== 'undefined';
    } catch (e) { return false; }
  }

  /* ---------- lazy Kokoro loader (never blocks, never throws) ---------- */
  function ensureKokoro() {
    if (kState !== 'idle') return;
    if (!deviceOK()) { kState = 'failed'; return; }
    kState = 'loading';
    status('⏳ Downloading a better voice… (one time only — I will use the normal voice meanwhile)', true);
    const timeout = setTimeout(() => {
      if (kState === 'loading') { kState = 'failed'; status(null); }
    }, LOAD_TIMEOUT);
    import(KOKORO_CDN).then(mod => {
      /* WASM is slower than WebGPU but far more reliable across devices —
         and a voice that always works beats a faster one that hangs. */
      const dtype = (navigator.deviceMemory && navigator.deviceMemory >= 6 ? 'q8' : 'q4');
      return mod.KokoroTTS.from_pretrained(MODEL, { dtype: dtype, device: 'wasm' });
    }).then(tts => {
      clearTimeout(timeout);
      if (kState === 'loading') {
        kokoro = tts;
        kState = 'ready';
        status('✅ Premium voice ready!');
      }
    }).catch(() => {
      clearTimeout(timeout);
      kState = 'failed';
      status(null);
    });
  }

  /* ---------- system voice (always available) ---------- */
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
  function speakSys(t) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'en-GB';
      u.rate = RATE;
      const v = bestSysVoice();
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------- kokoro playback (sentence by sentence, cancellable) ---------- */
  function splitSentences(t) {
    const parts = t.match(/[^.!?]+[.!?]?/g) || [t];
    const out = [];
    let buf = '';
    parts.forEach(p => {
      if ((buf + p).length > 280) { if (buf.trim()) out.push(buf.trim()); buf = p; }
      else buf += p;
    });
    if (buf.trim()) out.push(buf.trim());
    return out;
  }
  function generateGuarded(text, ms) {
    /* watchdog: if the model hangs or errors, we must never leave silence */
    return Promise.race([
      kokoro.generate(text, { voice: VOICE }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('gen-timeout')), ms))
    ]);
  }
  function audioBlob(audio) {
    try { return audio.toBlob(); }
    catch (e) { return new Blob([audio.toWav()], { type: 'audio/wav' }); }
  }
  async function speakKokoro(t) {
    const token = ++genToken;
    const parts = splitSentences(t);
    for (let i = 0; i < parts.length; i++) {
      if (token !== genToken) return;
      let audio;
      try { audio = await generateGuarded(parts[i], 15000); }
      catch (e) {
        /* model misbehaved → demote to the system voice for this session
           and speak the rest immediately so the student hears something */
        kState = 'failed'; kokoro = null;
        if (token === genToken) speakSys(parts.slice(i).join(' '));
        return;
      }
      if (token !== genToken) return;
      let played = false;
      await new Promise(res => {
        try {
          const url = URL.createObjectURL(audioBlob(audio));
          curAudio = new Audio(url);
          curAudio.onended = () => { played = true; URL.revokeObjectURL(url); res(); };
          curAudio.onerror = () => { URL.revokeObjectURL(url); res(); };
          curAudio.play().then(() => { played = true; }).catch(() => res());
        } catch (e) { res(); }
      });
      if (!played && token === genToken) {          // playback itself failed → system voice
        kState = 'failed'; kokoro = null;
        speakSys(parts.slice(i).join(' '));
        return;
      }
    }
  }

  /* ---------- public API ---------- */
  function stop() {
    genToken++;
    try { speechSynthesis.cancel(); } catch (e) {}
    try { if (curAudio) { curAudio.pause(); curAudio = null; } } catch (e) {}
  }
  function speak(text) {
    const t = clean(text);
    if (t.length < 2 || t.length > 1200) return;
    stop();
    ensureKokoro();                        // starts download on first ever tap
    if (kState === 'ready' && kokoro) speakKokoro(t);
    else speakSys(t);                      // instant, while loading or after failure
  }

  window.EQVoice = { speak: speak, stop: stop, clean: clean, state: () => kState };
  window.EQSpeak = speak;                  // hook used by the interactive worksheet
})();
