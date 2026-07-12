/* =====================================================================
   EQ-VOICE v2 — read-aloud engine for English Quest (Unit 1)
   ---------------------------------------------------------------------
   • DEFAULT: the device's built-in speechSynthesis voice — plays
     INSTANTLY, downloads nothing. Emojis/symbols stripped, slower rate.
   • OPTIONAL: "Better voice" (Kokoro, ~40–90MB one-time download) is
     OFF by default and only downloads if the student switches it on in
     the ⚙️ settings menu — with a visible progress bar. Any failure
     falls back to the instant voice.
   • KILL SWITCH: all speech (system + Kokoro) is stopped when the
     student leaves the page, hides the app, presses back, or taps any
     button/link. No audio ever survives leaving the app.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- text cleaning: only real words get spoken ---------- */
  function clean(text) {
    if (!text) return '';
    let t = String(text);
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2022}\u{00B7}]/gu, ' ');
    t = t.replace(/[^\p{L}\p{N}\s.,'’!?;:()\/%\-]/gu, ' ');
    t = t.replace(/\s*\.\s*\.\s*/g, '. ').replace(/\s+/g, ' ').trim();
    return t;
  }

  const RATE = 0.88;
  const SETTING = 'eq_premium_voice';           // 'on' → student opted in
  const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  const KOKORO_CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
  const VOICE = 'af_heart';

  let kokoro = null;                            // instance when ready
  let kState = 'off';                           // off | loading | ready | failed
  let curAudio = null;
  let genToken = 0;

  function optedIn() { try { return localStorage.getItem(SETTING) === 'on'; } catch (e) { return false; } }

  /* ================= SYSTEM VOICE (instant default) ================= */
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
  /* Android/phone reliability:
     1. getVoices() is often EMPTY on the first call → wait for voiceschanged
        (otherwise the phone may use its Arabic/French default for English!).
     2. Long utterances silently fail on Android → split into short chunks.
     3. Chrome pauses speech after ~15s → keep-alive resume timer. */
  let voicesReady = false, resumeTimer = null;
  try {
    voicesReady = (speechSynthesis.getVoices() || []).length > 0;
    speechSynthesis.onvoiceschanged = () => { voicesReady = true; };
  } catch (e) {}
  function sysChunks(t) {
    const parts = t.match(/[^.!?;:]+[.!?;:]?/g) || [t];
    const out = []; let buf = '';
    parts.forEach(p => {
      if ((buf + p).length > 180) { if (buf.trim()) out.push(buf.trim()); buf = p; } else buf += p;
    });
    if (buf.trim()) out.push(buf.trim());
    return out;
  }
  function speakSys(t) {
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
        clearInterval(resumeTimer);          // Chrome-Android 15s pause workaround
        resumeTimer = setInterval(() => {
          try {
            if (!speechSynthesis.speaking && !speechSynthesis.pending) clearInterval(resumeTimer);
            else if (speechSynthesis.paused) speechSynthesis.resume();
          } catch (e) { clearInterval(resumeTimer); }
        }, 5000);
      } catch (e) {}
    };
    if (voicesReady) go();
    else {                                   // give the phone up to 1.2s to report its voices
      let waited = 0;
      const w = setInterval(() => {
        waited += 200;
        if (voicesReady || (speechSynthesis.getVoices() || []).length > 0 || waited >= 1200) {
          voicesReady = true; clearInterval(w); go();
        }
      }, 200);
    }
  }

  /* ================= KOKORO in a WEB WORKER (opt-in only) =================
     The model runs on a background thread so the app NEVER lags or
     freezes. If this device is still too slow (a sentence takes more
     than 12s) the option switches itself off and the instant voice
     takes over. */
  let worker = null, reqId = 0;
  const pending = {};                                  // reqId → {resolve, reject, timer}
  function demote(msg) {
    kState = 'failed';
    try { if (worker) worker.terminate(); } catch (e) {}
    worker = null;
    try { localStorage.setItem(SETTING, 'off'); } catch (e) {}
    if (msg) { setProgress(msg); setTimeout(() => setProgress(null), 4500); }
    syncPanel();
  }
  function loadKokoro() {
    if (kState === 'loading' || kState === 'ready') return;
    if (!window.Worker) { demote('⚠️ Not supported here — using the normal voice.'); return; }
    kState = 'loading';
    setProgress('Starting download…');
    syncPanel();
    const src =
      "let tts=null;" +
      "self.onmessage=async e=>{const m=e.data;try{" +
      "if(m.type==='load'){const mod=await import('" + KOKORO_CDN + "');" +
      "tts=await mod.KokoroTTS.from_pretrained('" + MODEL + "',{dtype:'q4',device:'wasm'," +
      "progress_callback:p=>{if(p&&p.status==='progress'&&p.total)self.postMessage({type:'prog',pct:Math.round(p.loaded/p.total*100)})}});" +
      "self.postMessage({type:'ready'});}" +
      "else if(m.type==='gen'){const a=await tts.generate(m.text,{voice:'" + VOICE + "'});" +
      "const w=a.toWav();self.postMessage({type:'audio',id:m.id,wav:w},[w]);}" +
      "}catch(err){self.postMessage({type:'err',id:m.id,msg:String(err)});}};";
    let loadTimer = setTimeout(() => demote('⚠️ Download took too long — using the normal voice.'), 180000);
    try {
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
      worker.onerror = () => { clearTimeout(loadTimer); demote('⚠️ Better voice failed — using the normal voice.'); };
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'prog') setProgress('Downloading better voice… ' + m.pct + '%');
        else if (m.type === 'ready') {
          clearTimeout(loadTimer);
          kState = 'ready';
          setProgress('✅ Better voice is ready!');
          setTimeout(() => setProgress(null), 3500);
          syncPanel();
        } else if (m.type === 'audio' && pending[m.id]) {
          clearTimeout(pending[m.id].timer);
          pending[m.id].resolve(m.wav);
          delete pending[m.id];
        } else if (m.type === 'err' && m.id != null && pending[m.id]) {
          clearTimeout(pending[m.id].timer);
          pending[m.id].reject(new Error(m.msg));
          delete pending[m.id];
        }
      };
      worker.postMessage({ type: 'load' });
    } catch (e) { clearTimeout(loadTimer); demote('⚠️ Better voice failed — using the normal voice.'); }
  }
  function generateInWorker(text, ms) {
    return new Promise((resolve, reject) => {
      const id = ++reqId;
      pending[id] = { resolve: resolve, reject: reject, timer: setTimeout(() => {
        if (pending[id]) { delete pending[id]; reject(new Error('too-slow')); }
      }, ms) };
      worker.postMessage({ type: 'gen', text: text, id: id });
    });
  }
  function splitSentences(t) {
    const parts = t.match(/[^.!?]+[.!?]?/g) || [t];
    const out = []; let buf = '';
    parts.forEach(p => {
      if ((buf + p).length > 280) { if (buf.trim()) out.push(buf.trim()); buf = p; } else buf += p;
    });
    if (buf.trim()) out.push(buf.trim());
    return out;
  }
  async function speakKokoro(t) {
    const token = ++genToken;
    const parts = splitSentences(t);
    for (let i = 0; i < parts.length; i++) {
      if (token !== genToken) return;
      let wav;
      try { wav = await generateInWorker(parts[i], 12000); }
      catch (e) {
        demote('⚠️ Better voice is too slow on this device — switched to the normal voice.');
        if (token === genToken) speakSys(parts.slice(i).join(' '));
        return;
      }
      if (token !== genToken) return;
      let played = false;
      await new Promise(res => {
        try {
          const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
          curAudio = new Audio(url);
          curAudio.onended = () => { played = true; URL.revokeObjectURL(url); res(); };
          curAudio.onerror = () => { URL.revokeObjectURL(url); res(); };
          curAudio.play().then(() => { played = true; }).catch(() => res());
        } catch (e) { res(); }
      });
      if (!played && token === genToken) {
        demote(null);
        speakSys(parts.slice(i).join(' '));
        return;
      }
    }
  }

  /* ================= PUBLIC API ================= */
  function stop() {
    genToken++;
    try { clearInterval(resumeTimer); } catch (e) {}
    try { speechSynthesis.cancel(); } catch (e) {}
    try { if (curAudio) { curAudio.pause(); curAudio.src = ''; curAudio = null; } } catch (e) {}
  }
  function speak(text) {
    const t = clean(text);
    if (t.length < 2 || t.length > 1200) return;
    stop();
    if (optedIn() && kState === 'ready' && worker) speakKokoro(t);
    else speakSys(t);                       // the instant default — no downloads
  }

  /* ================= KILL SWITCH: audio never survives leaving ================= */
  function killAll() { stop(); }
  window.addEventListener('pagehide', killAll);
  window.addEventListener('beforeunload', killAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) killAll(); });
  /* tapping any button or link cuts current speech immediately;
     if that tap itself asks for speech, its handler restarts it right after */
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('a,button')) stop();
  }, true);

  /* ================= ⚙️ SETTINGS (Better voice opt-in) ================= */
  let panel = null, progEl = null;
  function setProgress(msg) {
    if (progEl) { progEl.textContent = msg || ''; progEl.style.display = msg ? 'block' : 'none'; }
  }
  function syncPanel() {
    const t = document.getElementById('eq-voice-toggle');
    if (!t) return;
    const on = optedIn();
    t.textContent = on ? (kState === 'ready' ? '🌟 Better voice: ON' : kState === 'loading' ? '⏳ Better voice: downloading…' : '🌟 Better voice: ON (will load)') : '🔈 Better voice: OFF';
    t.style.background = on ? 'linear-gradient(90deg,#059669,#22c55e)' : 'rgba(255,255,255,.12)';
  }
  function buildUI() {
    if (!document.body || document.getElementById('eq-settings-btn')) return;
    const css = document.createElement('style');
    css.textContent =
      '#eq-settings-btn{position:fixed;bottom:14px;left:14px;z-index:99990;width:46px;height:46px;border-radius:50%;' +
      'border:2px solid rgba(255,255,255,.35);background:rgba(26,11,46,.92);color:#fff;font-size:20px;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.5);font-family:system-ui}' +
      '#eq-settings{display:none;position:fixed;bottom:68px;left:14px;z-index:99991;background:linear-gradient(180deg,#2d1b4e,#1a0b2e);' +
      'border:2px solid rgba(255,255,255,.25);border-radius:16px;padding:14px;max-width:270px;' +
      'font:600 13px/1.5 "Segoe UI",system-ui,sans-serif;color:#f0e9ff;box-shadow:0 8px 24px rgba(0,0,0,.6)}' +
      '#eq-settings h4{font-size:13px;font-weight:800;color:#c4b5fd;margin:0 0 8px}' +
      '#eq-voice-toggle{width:100%;border:none;border-radius:10px;padding:10px;color:#fff;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit}' +
      '#eq-voice-note{font-size:11.5px;color:#a78bfa;margin-top:7px;line-height:1.45}' +
      '#eq-voice-prog{display:none;margin-top:8px;font-size:12px;font-weight:800;color:#fbbf24}';
    document.head.appendChild(css);
    const btn = document.createElement('button');
    btn.id = 'eq-settings-btn'; btn.textContent = '⚙️'; btn.title = 'Settings';
    document.body.appendChild(btn);
    const p = document.createElement('div');
    p.id = 'eq-settings';
    p.innerHTML = '<h4>⚙️ Settings</h4><button id="eq-voice-toggle"></button>' +
      '<div id="eq-voice-note">Better voice = a more human voice. One-time download (~40MB) — use wifi! ' +
      'It runs in the background so the app stays smooth, and it switches itself off if your device is too slow. ' +
      'The normal voice always works and downloads nothing.</div><div id="eq-voice-prog"></div>';
    document.body.appendChild(p);
    progEl = p.querySelector('#eq-voice-prog');
    panel = p;
    btn.onclick = () => { p.style.display = p.style.display === 'block' ? 'none' : 'block'; syncPanel(); };
    p.querySelector('#eq-voice-toggle').onclick = () => {
      const on = !optedIn();
      try { localStorage.setItem(SETTING, on ? 'on' : 'off'); } catch (e) {}
      if (on) {
        if (navigator.deviceMemory && navigator.deviceMemory < 4) {
          demote('⚠️ This device is not strong enough — the normal voice will be used.');
          return;
        }
        loadKokoro();
      } else {
        kState = 'off';
        try { if (worker) worker.terminate(); } catch (e) {}
        worker = null;
        stop(); setProgress(null);
      }
      syncPanel();
    };
    syncPanel();
    /* student already opted in on a previous visit → load quietly (model is cached) */
    if (optedIn()) loadKokoro();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
  setInterval(() => { if (document.body && !document.getElementById('eq-settings-btn')) buildUI(); }, 1500);

  window.EQVoice = { speak: speak, stop: stop, clean: clean, state: () => kState };
  window.EQSpeak = speak;
})();
