/**
 * eq-streak.js — Daily login streak for English Quest
 * Tracks consecutive days the student opens the app.
 * localStorage key: "eq_streak_v2"
 * Exposes window.EQStreak global.
 */
(function () {
  'use strict';

  const KEY = 'eq_streak_v2';

  const MILESTONES = {
    3:  { bonus: 10,  label: '3-Day Streak! 🔥' },
    7:  { bonus: 25,  label: 'Week Warrior! ⚡' },
    14: { bonus: 50,  label: 'Fortnight Champion! 💪' },
    30: { bonus: 100, label: 'Monthly Legend! 👑' },
    60: { bonus: 200, label: 'Two-Month Titan! 🏆' },
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }

  /** Call on app open. Returns the updated streak state. */
  function checkIn() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    let s = load() || { streak: 0, longest: 0, lastDate: null, claimedBonuses: [] };

    if (s.lastDate === today) {
      // Already checked in today — just return current state
      return getState(s);
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    if (s.lastDate === yStr) {
      s.streak += 1;
    } else if (s.lastDate !== today) {
      // Missed a day (or first ever) — reset
      s.streak = 1;
    }

    s.lastDate = today;
    if (s.streak > s.longest) s.longest = s.streak;

    save(s);
    return getState(s);
  }

  function getState(s) {
    s = s || load() || { streak: 0, longest: 0, lastDate: null, claimedBonuses: [] };

    // Find next milestone
    let nextMilestone = null;
    const keys = Object.keys(MILESTONES).map(Number).sort((a, b) => a - b);
    for (const m of keys) {
      if (s.streak < m) { nextMilestone = m; break; }
    }

    const reachedMilestones = keys
      .filter(m => s.streak >= m && !s.claimedBonuses.includes(m))
      .map(m => ({ days: m, ...MILESTONES[m] }));

    return {
      streak: s.streak,
      longest: s.longest,
      lastDate: s.lastDate,
      nextMilestone,
      daysToNext: nextMilestone ? nextMilestone - s.streak : 0,
      reachedMilestones,
      claimedBonuses: s.claimedBonuses || [],
    };
  }

  function claimBonus(days) {
    const s = load() || { streak: 0, longest: 0, lastDate: null, claimedBonuses: [] };
    if (!s.claimedBonuses) s.claimedBonuses = [];
    if (s.claimedBonuses.includes(days)) return null;
    s.claimedBonuses.push(days);
    save(s);

    // Also add to XP (uses the same dungeonData XP system)
    const bonus = MILESTONES[days]?.bonus || 0;
    if (bonus > 0) {
      try {
        const p = JSON.parse(localStorage.getItem('u1_dungeon') || '{}');
        p.totalXP = (p.totalXP || 0) + bonus;
        localStorage.setItem('u1_dungeon', JSON.stringify(p));
      } catch {}
    }

    return { days, bonus, label: MILESTONES[days]?.label };
  }

  /** Render a streak badge into any container. Call after checkIn(). */
  function renderBadge(container, state) {
    if (!container) return;
    const s = state || getState();
    const fireCount = Math.min(s.streak, 5);
    const fires = '🔥'.repeat(Math.max(1, fireCount));

    container.innerHTML = `
      <span class="chip gold" id="eq-streak-badge" style="cursor:pointer">
        ${fires} ${s.streak} day${s.streak !== 1 ? 's' : ''}
        ${s.longest > s.streak ? `<span style="opacity:.6;margin-left:4px">🏁 ${s.longest}</span>` : ''}
      </span>
    `;

    // Show unclaimed milestone bonuses
    if (s.reachedMilestones && s.reachedMilestones.length > 0) {
      s.reachedMilestones.forEach(m => {
        const note = document.createElement('div');
        note.style.cssText = 'font-size:12px;font-weight:700;color:#fbbf24;margin:6px 2px;animation:eqFadeIn .4s ease';
        note.innerHTML = `🎉 <strong>${m.label}</strong> — +${m.bonus} XP <button class="eq-btn prim" style="padding:4px 10px;font-size:11px;margin-left:6px" data-claim="${m.days}">Claim</button>`;
        container.parentNode?.insertBefore(note, container.nextSibling);
      });

      // Claim buttons
      container.querySelectorAll('[data-claim]').forEach(btn => {
        btn.addEventListener('click', function () {
          const days = parseInt(this.dataset.claim);
          const result = claimBonus(days);
          if (result) {
            this.textContent = '✓ Claimed!';
            this.disabled = true;
            this.style.opacity = '0.5';
            // Confetti burst
            if (typeof confetti === 'function') confetti(20);
            else {
              try {
                const ev = new CustomEvent('eq-streak-claim', { detail: result });
                window.dispatchEvent(ev);
              } catch {}
            }
          }
        });
      });
    }
  }

  // Auto check-in on page load
  const currentState = checkIn();

  window.EQStreak = {
    checkIn,
    getState,
    claimBonus,
    renderBadge,
    currentState,
    MILESTONES,
  };
})();
