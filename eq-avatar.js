/* =====================================================================
   EQ-AVATAR — face-only avatar for English Quest
   Preset parts only (skin tone, eyes, hair, one accessory).
   No free drawing, no text input. Saved on the device.
   ===================================================================== */
(function () {
  'use strict';
  const KEY = 'eq_avatar';
  const DEF = { s: 1, e: 0, h: 1, a: 0 };

  const SKINS = ['#f9d5b3', '#eab676', '#c68642', '#8d5524', '#5c3317'];
  const HAIRC = '#26232e';

  function eyes(kind) {
    if (kind === 0) return '<circle cx="35" cy="46" r="4.5" fill="#26232e"/><circle cx="65" cy="46" r="4.5" fill="#26232e"/><circle cx="36.5" cy="44.5" r="1.5" fill="#fff"/><circle cx="66.5" cy="44.5" r="1.5" fill="#fff"/>';
    if (kind === 1) return '<path d="M29 46 q6 -8 12 0" stroke="#26232e" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M59 46 q6 -8 12 0" stroke="#26232e" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
    if (kind === 2) return '<ellipse cx="35" cy="46" rx="6" ry="7.5" fill="#fff"/><ellipse cx="65" cy="46" rx="6" ry="7.5" fill="#fff"/><circle cx="36" cy="47" r="3.4" fill="#26232e"/><circle cx="66" cy="47" r="3.4" fill="#26232e"/>';
    return '<circle cx="35" cy="46" r="4.5" fill="#26232e"/><circle cx="36.5" cy="44.5" r="1.5" fill="#fff"/><path d="M59 46 q6 -5 12 0" stroke="#26232e" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
  }
  function hair(kind) {
    if (kind === 0) return '';
    if (kind === 1) return '<path d="M18 42 q2 -30 32 -30 q30 0 32 30 q-8 -14 -32 -14 q-24 0 -32 14z" fill="' + HAIRC + '"/>';
    if (kind === 2) return '<path d="M20 40 l6 -20 l7 12 l6 -18 l7 14 l6 -16 l7 16 l6 -12 l7 18 l6 -14 l4 20 q-10 -12 -31 -12 q-21 0 -31 12z" fill="' + HAIRC + '"/>';
    if (kind === 3) return '<circle cx="28" cy="26" r="10" fill="' + HAIRC + '"/><circle cx="44" cy="19" r="11" fill="' + HAIRC + '"/><circle cx="61" cy="19" r="11" fill="' + HAIRC + '"/><circle cx="74" cy="27" r="10" fill="' + HAIRC + '"/><circle cx="50" cy="24" r="12" fill="' + HAIRC + '"/>';
    return '<path d="M16 66 q-4 -50 34 -52 q38 2 34 52 l-10 -4 q6 -36 -24 -36 q-30 0 -24 36z" fill="' + HAIRC + '"/>';
  }
  function accessory(kind) {
    if (kind === 1) return '<circle cx="35" cy="46" r="10" fill="none" stroke="#1f2937" stroke-width="2.6"/><circle cx="65" cy="46" r="10" fill="none" stroke="#1f2937" stroke-width="2.6"/><path d="M45 46 h10" stroke="#1f2937" stroke-width="2.6"/>';
    if (kind === 2) return '<path d="M20 30 q30 -22 60 0 l0 -8 q-30 -20 -60 0z" fill="#dc2626"/><rect x="14" y="27" width="72" height="7" rx="3.5" fill="#b91c1c"/>';
    if (kind === 3) return '<text x="72" y="66" font-size="13">⭐</text>';
    return '';
  }
  function svg(cfg, size) {
    cfg = cfg || get() || DEF;
    const s = SKINS[cfg.s] || SKINS[1];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + (size || 64) + '" height="' + (size || 64) + '">' +
      '<circle cx="50" cy="52" r="34" fill="' + s + '" stroke="#00000022" stroke-width="2"/>' +
      hair(cfg.h) + eyes(cfg.e) +
      '<path d="M40 64 q10 8 20 0" stroke="#a4503c" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      '<circle cx="30" cy="58" r="4" fill="#ff9d9d" opacity=".45"/><circle cx="70" cy="58" r="4" fill="#ff9d9d" opacity=".45"/>' +
      accessory(cfg.a) + '</svg>';
  }
  function get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function set(cfg) { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  window.EQAvatar = { get: get, set: set, svg: svg, SKINS: SKINS, PARTS: { eyes: 4, hair: 5, acc: 4 } };
})();
