(function (root, factory) {
  const ranking = root.SurvivorRanking || (typeof require === 'function' ? require('./ranking.js') : null);
  const api = factory(ranking);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SurvivorAdminLogic = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (SurvivorRanking) {
  'use strict';

  const TOTAL_WEEKS = 3;
  const FINAL_RESULTS = new Set(['W', 'L', 'T']);

  const normalizeJson = (data) => JSON.stringify(data, null, 2);

  const resultKey = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return FINAL_RESULTS.has(normalized) ? normalized : null;
  };

  const findWeekPick = (manager, week) => (Array.isArray(manager && manager.picks) ? manager.picks : [])
    .find((pick) => Number(pick && pick.week) === Number(week));

  const findFinalOutcome = (events, teamName) => {
    const wantedTeam = String(teamName || '').trim();
    if (!wantedTeam) return null;

    for (const event of Array.isArray(events) ? events : []) {
      const competition = event && event.competitions && event.competitions[0];
      const competitors = competition && Array.isArray(competition.competitors)
        ? competition.competitors
        : [];
      const selected = competitors.find((competitor) => competitor && competitor.team
        && competitor.team.displayName === wantedTeam);
      const opponent = competitors.find((competitor) => competitor !== selected);
      const state = event && event.status && event.status.type && event.status.type.state;
      if (!selected || !opponent || state !== 'post') continue;

      const selectedScore = Number(selected.score);
      const opponentScore = Number(opponent.score);
      if (!Number.isFinite(selectedScore) || !Number.isFinite(opponentScore)) continue;

      const margin = selectedScore - opponentScore;
      return {
        margin,
        result: margin > 0 ? 'W' : margin < 0 ? 'L' : 'T'
      };
    }

    return null;
  };

  const syncComputedManagers = (managers, activeWeek) => {
    if (!SurvivorRanking || typeof SurvivorRanking.analyzeManager !== 'function') {
      throw new Error('Survivor ranking logic is unavailable.');
    }
    return (Array.isArray(managers) ? managers : []).map((manager) => {
      const standing = SurvivorRanking.analyzeManager(manager, {
        totalWeeks: TOTAL_WEEKS,
        // Never let a stale or accidentally prefilled future-week result affect
        // the current elimination state or next-week order.
        throughWeek: Math.max(1, Math.min(TOTAL_WEEKS, Number(activeWeek || 1))),
        activeWeek: Number(activeWeek || 1)
      });
      return {
        ...manager,
        eliminated: standing.isEliminated,
        marginOfVictory: standing.totalMargin,
        eliminationWeek: standing.eliminationWeek || null
      };
    });
  };

  const eligibleEnteringWeek = (manager, week) => {
    if (!SurvivorRanking || typeof SurvivorRanking.analyzeManager !== 'function') return false;
    const priorWeek = Math.max(0, Number(week) - 1);
    return !SurvivorRanking.analyzeManager(manager, {
      totalWeeks: TOTAL_WEEKS,
      throughWeek: priorWeek,
      activeWeek: Math.max(1, priorWeek)
    }).isEliminated;
  };

  const applyFinalScores = (managers, week, events, timestamp) => {
    let updatedPicks = 0;
    const nextManagers = structuredClone(Array.isArray(managers) ? managers : []);

    nextManagers.forEach((manager) => {
      const pick = findWeekPick(manager, week);
      if (!pick || !String(pick.team || '').trim()) return;

      const hasValidManualOverride = pick.manualResult === true
        && resultKey(pick.result) !== null
        && Number.isFinite(Number(pick.margin));
      if (hasValidManualOverride) return;

      const outcome = findFinalOutcome(events, pick.team);
      if (!outcome) return;

      if (resultKey(pick.result) !== outcome.result || Number(pick.margin) !== outcome.margin || pick.manualResult !== false) {
        updatedPicks += 1;
      }
      pick.result = outcome.result;
      pick.margin = outcome.margin;
      pick.manualResult = false;
      pick.lastUpdated = timestamp;
    });

    return { managers: nextManagers, updatedPicks };
  };

  const validateFinalizedWeek = (managers, week) => {
    const errors = [];
    const weeklyOwners = new Map();

    (Array.isArray(managers) ? managers : []).forEach((manager) => {
      if (!eligibleEnteringWeek(manager, week)) return;
      const pick = findWeekPick(manager, week);
      const team = String(pick && pick.team || '').trim();
      if (!team) {
        errors.push(`${manager.name} has no Week ${week} pick.`);
        return;
      }

      const teamKey = team.toLowerCase();
      if (weeklyOwners.has(teamKey)) {
        errors.push(`${team} is assigned to both ${weeklyOwners.get(teamKey)} and ${manager.name} in Week ${week}.`);
      } else {
        weeklyOwners.set(teamKey, manager.name);
      }

      if (!resultKey(pick.result)) {
        errors.push(`${manager.name}'s Week ${week} game is not final yet.`);
      } else if (!Number.isFinite(Number(pick.margin))) {
        errors.push(`${manager.name}'s Week ${week} margin is missing.`);
      } else {
        const result = resultKey(pick.result);
        const margin = Number(pick.margin);
        if (result === 'W' && margin <= 0) {
          errors.push(`${manager.name}'s Week ${week} win must have a positive margin.`);
        } else if (result === 'L' && margin >= 0) {
          errors.push(`${manager.name}'s Week ${week} loss must have a negative margin.`);
        } else if (result === 'T' && margin !== 0) {
          errors.push(`${manager.name}'s Week ${week} tie must have a zero margin.`);
        }
      }
    });

    return errors;
  };

  const finalizePoolWeek = (data, events, week, timestamp = new Date().toISOString()) => {
    const activeWeek = Number(week);
    if (!Number.isInteger(activeWeek) || activeWeek < 1 || activeWeek > TOTAL_WEEKS) {
      throw new Error('Active week must be between 1 and 3.');
    }

    const scored = applyFinalScores(data && data.managers, activeWeek, events, timestamp);
    const errors = validateFinalizedWeek(scored.managers, activeWeek);
    const computedManagers = syncComputedManagers(scored.managers, activeWeek);
    const canAdvance = errors.length === 0;
    const survivorCount = computedManagers.filter((manager) => manager.eliminated !== true).length;
    // The survivor pool is over once one or zero managers remain, or after the
    // final configured week. Only this explicit finalized state awards a trophy.
    const poolComplete = canAdvance && (activeWeek === TOTAL_WEEKS || survivorCount <= 1);
    const nextWeek = canAdvance && !poolComplete ? activeWeek + 1 : activeWeek;
    const currentQueue = data && data.pickQueue ? data.pickQueue : {};
    const nextQueue = canAdvance
      ? {
          ...currentQueue,
          enabled: false,
          activeWeek: nextWeek,
          completed: poolComplete,
          finalizedWeeks: {
            ...(currentQueue.finalizedWeeks || {}),
            [String(activeWeek)]: {
              finalizedAt: timestamp,
              source: 'espn',
              updatedPicks: scored.updatedPicks
            }
          }
        }
      : currentQueue;

    return {
      data: {
        ...(data || {}),
        managers: computedManagers,
        pickQueue: nextQueue,
        lastUpdated: timestamp
      },
      errors,
      updatedPicks: scored.updatedPicks,
      finalized: canAdvance,
      advanced: canAdvance && !poolComplete,
      nextWeek,
      poolComplete,
      survivorCount
    };
  };

  return Object.freeze({
    applyFinalScores,
    eligibleEnteringWeek,
    finalizePoolWeek,
    findFinalOutcome,
    normalizeJson,
    syncComputedManagers,
    validateFinalizedWeek
  });
}));
