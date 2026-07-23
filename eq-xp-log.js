/**
 * eq-xp-log.js — Tracks daily XP earned for the progress chart.
 * Intercepts the u1_dungeon localStorage writes and logs XP by day.
 * localStorage key: "eq_xp_history" (array of {date, xp} objects)
 */
(function () {
  'use strict';

  const KEY = 'eq_xp_history';
  const today = new Date().toISOString().slice(0, 10);

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function logXP(amount) {
    if (!amount || amount <= 0) return;
    const history = getHistory();
    const existing = history.find(e => e.date === today);
    if (existing) {
      existing.xp += amount;
    } else {
      history.push({ date: today, xp: amount });
    }
    // Keep last 30 days
    while (history.length > 30) history.shift();
    try { localStorage.setItem(KEY, JSON.stringify(history)); } catch {}
  }

  // Expose
  window.EQXPLog = { logXP, getHistory };

  // Also listen for custom event from dungeon results
  window.addEventListener('eq-xp-gained', function(e) {
    if (e.detail && e.detail.xp) logXP(e.detail.xp);
  });
})();
