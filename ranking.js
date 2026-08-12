(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SurvivorRanking = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const resultKey = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'W' || normalized === 'L' || normalized === 'T' ? normalized : null;
  };

  const finiteNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const weekNumber = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  };

  const normalizeOutcome = (pick, outcomeForPick) => {
    const live = typeof outcomeForPick === 'function' ? outcomeForPick(pick) : null;
    if (live && live.state === 'post') {
      const score = finiteNumber(live.score);
      const opponentScore = finiteNumber(live.oppScore);
      const margin = score - opponentScore;
      const isTie = live.isTie === true || margin === 0;
      return {
        final: true,
        result: isTie ? 'T' : (margin > 0 ? 'W' : 'L'),
        margin: isTie ? 0 : margin
      };
    }

    const result = resultKey(pick && pick.result);
    return {
      final: result !== null,
      result,
      margin: result === 'T' ? 0 : finiteNumber(pick && pick.margin)
    };
  };

  const analyzeManager = (manager, options = {}) => {
    const totalWeeks = Math.max(1, finiteNumber(options.totalWeeks, 3));
    const throughWeek = Math.max(0, finiteNumber(options.throughWeek, totalWeeks));
    const activeWeek = Math.max(1, finiteNumber(options.activeWeek, Math.min(totalWeeks, throughWeek || 1)));
    const picks = (Array.isArray(manager && manager.picks) ? manager.picks : [])
      .filter((pick) => weekNumber(pick && pick.week) !== null)
      .slice()
      .sort((a, b) => Number(a.week) - Number(b.week));

    const buybackEnabled = manager && manager.buyback === true;
    const configuredBuybackWeek = weekNumber(manager && manager.buybackWeek);
    let buybackUsed = false;
    let protectedLossMargin = 0;
    let winningMargin = 0;
    let eliminationWeek = null;
    let eliminationMargin = 0;
    const weeks = [];

    for (const pick of picks) {
      const week = Number(pick.week);
      if (week > throughWeek) continue;
      const outcome = normalizeOutcome(pick, options.outcomeForPick);
      const entry = {
        week,
        team: String(pick.team || '').trim(),
        final: outcome.final,
        result: outcome.result,
        margin: outcome.margin,
        buyback: false,
        counted: false
      };

      if (!outcome.final || eliminationWeek !== null) {
        weeks.push(entry);
        continue;
      }

      if (outcome.result === 'W') {
        winningMargin += Math.max(0, outcome.margin);
        entry.counted = true;
      } else if (outcome.result === 'L') {
        const protectsThisLoss = buybackEnabled && !buybackUsed &&
          (configuredBuybackWeek === null || configuredBuybackWeek === week);
        if (protectsThisLoss) {
          buybackUsed = true;
          protectedLossMargin = Number.isFinite(Number(manager.carryMargin))
            ? Number(manager.carryMargin)
            : Math.min(0, outcome.margin);
          entry.buyback = true;
          entry.counted = true;
        } else {
          eliminationWeek = week;
          eliminationMargin = Math.min(0, outcome.margin);
          entry.counted = true;
        }
      }
      weeks.push(entry);
    }

    // Backward-compatible support for an explicit manual elimination week.
    if (eliminationWeek === null && manager && manager.eliminated === true && !buybackEnabled) {
      const explicitWeek = weekNumber(manager.eliminationWeek);
      if (explicitWeek !== null && explicitWeek <= throughWeek) {
        const explicit = weeks.find((entry) => entry.week === explicitWeek);
        // Never let a stale manual flag override a final win/tie or a newer live result.
        if (!explicit || !explicit.final) {
          eliminationWeek = explicitWeek;
          eliminationMargin = explicit ? Math.min(0, explicit.margin) : 0;
        }
      }
    }

    const survivorMargin = winningMargin + (buybackUsed ? protectedLossMargin : 0);
    const totalMargin = survivorMargin + (eliminationWeek !== null ? eliminationMargin : 0);
    const activeEntry = weeks.find((entry) => entry.week === activeWeek);

    return {
      isEliminated: eliminationWeek !== null,
      eliminationWeek,
      eliminationMargin,
      buybackUsed,
      survivorMargin,
      totalMargin,
      activeWeekMargin: activeEntry && activeEntry.final ? activeEntry.margin : 0,
      weeks
    };
  };

  const rankManagers = (managers, options = {}) => {
    const totalWeeks = Math.max(1, finiteNumber(options.totalWeeks, 3));
    return (Array.isArray(managers) ? managers : [])
      .map((manager, originalIndex) => {
        const standing = analyzeManager(manager, options);
        return {
          ...manager,
          ...standing,
          originalIndex,
          eliminationSortWeek: standing.isEliminated ? standing.eliminationWeek : totalWeeks + 1,
          weekMargin: standing.isEliminated ? standing.eliminationMargin : standing.activeWeekMargin,
          cumulativeMargin: standing.totalMargin
        };
      })
      .sort((a, b) => {
        // Survivors rank above eliminated managers; among eliminated managers, lasting longer wins.
        if (a.eliminationSortWeek !== b.eliminationSortWeek) {
          return b.eliminationSortWeek - a.eliminationSortWeek;
        }

        if (a.isEliminated && b.isEliminated) {
          // The stated same-week rule deliberately ignores earlier cumulative margin.
          if (a.eliminationMargin !== b.eliminationMargin) {
            return b.eliminationMargin - a.eliminationMargin;
          }
        } else if (!a.isEliminated && !b.isEliminated) {
          // Additional survivor ordering rule retained from the existing pool behavior.
          if (a.survivorMargin !== b.survivorMargin) {
            return b.survivorMargin - a.survivorMargin;
          }
        }

        const rankDifference = finiteNumber(a.lastYearRank, 999) - finiteNumber(b.lastYearRank, 999);
        if (rankDifference !== 0) return rankDifference;
        return a.originalIndex - b.originalIndex;
      })
      .map((manager, index) => ({ ...manager, draftOrder: index + 1 }));
  };

  const orderForPickWeek = (managers, pickWeek, options = {}) => {
    const week = Math.max(1, finiteNumber(pickWeek, 1));
    return rankManagers(managers, {
      ...options,
      activeWeek: Math.max(1, week - 1),
      throughWeek: Math.max(0, week - 1)
    });
  };

  return Object.freeze({ analyzeManager, normalizeOutcome, orderForPickWeek, rankManagers });
}));
