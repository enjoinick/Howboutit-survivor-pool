export const NFL_TEAMS = Object.freeze([
  'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
  'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
  'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
  'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs',
  'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
  'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants',
  'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers',
  'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders'
]);

const TEAM_BY_KEY = new Map(NFL_TEAMS.map((team) => [team.toLowerCase(), team]));

export class QueueError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'QueueError';
    this.status = status;
    this.code = code;
  }
}

const managerKey = (value) => String(value || '').trim().toLowerCase();

const findWeekPick = (manager, week) =>
  (Array.isArray(manager && manager.picks) ? manager.picks : [])
    .find((pick) => Number(pick && pick.week) === Number(week));

const normalizeOrder = (data, week) => {
  const managers = Array.isArray(data && data.managers) ? data.managers : [];
  const managersByKey = new Map(managers.map((manager) => [managerKey(manager.name), manager]));
  const queue = data && data.pickQueue || {};
  const weekOrder = queue.orders && queue.orders[String(week)];
  const configured = Array.isArray(weekOrder)
    ? weekOrder
    : (Array.isArray(queue.order) ? queue.order : []);
  const ordered = [];
  const seen = new Set();

  for (const name of configured) {
    const key = managerKey(name);
    if (!key || seen.has(key) || !managersByKey.has(key)) continue;
    ordered.push(managersByKey.get(key));
    seen.add(key);
  }

  managers
    .slice()
    .sort((a, b) => Number(a.lastYearRank || 999) - Number(b.lastYearRank || 999))
    .forEach((manager) => {
      const key = managerKey(manager.name);
      if (!key || seen.has(key)) return;
      ordered.push(manager);
      seen.add(key);
    });

  return ordered;
};

const activeDeadline = (data, week) => {
  const deadlines = data && data.pickQueue && data.pickQueue.deadlines;
  const value = deadlines && (deadlines[String(week)] || deadlines[week]);
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

export const deriveQueueState = (data, now = new Date()) => {
  if (!data || !Array.isArray(data.managers)) {
    throw new QueueError(502, 'invalid_pool_data', 'The live pool data is unavailable.');
  }

  const config = data.pickQueue || {};
  const activeWeek = Number(config.activeWeek || 1);
  const enabled = config.enabled === true;
  const deadline = activeDeadline(data, activeWeek);
  const nowTimestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const deadlineTimestamp = deadline ? Date.parse(deadline) : null;
  const locked = Boolean(deadlineTimestamp && Number.isFinite(nowTimestamp) && nowTimestamp >= deadlineTimestamp);
  const orderedManagers = normalizeOrder(data, activeWeek);
  const eligibleManagers = orderedManagers.filter((manager) => !(manager.eliminated === true && manager.buyback !== true));
  const firstWaitingIndex = eligibleManagers.findIndex((manager) => {
    const pick = findWeekPick(manager, activeWeek);
    return !String(pick && pick.team || '').trim();
  });
  const currentManager = firstWaitingIndex >= 0 ? eligibleManagers[firstWaitingIndex] : null;
  const currentKey = managerKey(currentManager && currentManager.name);
  const eligibleKeys = new Set(eligibleManagers.map((manager) => managerKey(manager.name)));

  const entries = orderedManagers.map((manager) => {
    const key = managerKey(manager.name);
    const pick = findWeekPick(manager, activeWeek);
    const team = String(pick && pick.team || '').trim();
    let status = 'waiting';
    if (!eligibleKeys.has(key)) status = 'ineligible';
    else if (team) status = 'picked';
    else if (key === currentKey) status = 'current';
    return {
      position: orderedManagers.indexOf(manager) + 1,
      name: manager.name,
      teamLabel: manager.teamLabel || '',
      status,
      team: team || null
    };
  });

  const usedTeams = new Set(
    (currentManager && Array.isArray(currentManager.picks) ? currentManager.picks : [])
      .filter((pick) => Number(pick && pick.week) !== activeWeek)
      .map((pick) => String(pick && pick.team || '').trim().toLowerCase())
      .filter(Boolean)
  );

  return {
    season: Number(data.season),
    enabled,
    activeWeek,
    deadline,
    locked,
    complete: eligibleManagers.length > 0 && !currentManager,
    currentManager: currentManager ? {
      name: currentManager.name,
      teamLabel: currentManager.teamLabel || '',
      position: firstWaitingIndex + 1,
      total: eligibleManagers.length
    } : null,
    entries,
    availableTeams: currentManager
      ? NFL_TEAMS.filter((team) => !usedTeams.has(team.toLowerCase()))
      : [],
    lastUpdated: data.lastUpdated || null,
    lastSubmission: config.lastSubmission || null
  };
};

export const applySubmission = (data, submission, now = new Date()) => {
  const state = deriveQueueState(data, now);
  if (!state.enabled) {
    throw new QueueError(409, 'queue_closed', 'Public pick submission is not open.');
  }
  if (state.locked) {
    throw new QueueError(409, 'deadline_passed', 'The weekly pick deadline has passed.');
  }
  if (state.complete || !state.currentManager) {
    throw new QueueError(409, 'queue_complete', `All eligible Week ${state.activeWeek} picks are in.`);
  }

  const requestedWeek = Number(submission && submission.week);
  if (requestedWeek !== state.activeWeek) {
    throw new QueueError(409, 'wrong_week', `Week ${state.activeWeek} is the active pick queue.`);
  }

  const requestedManager = String(submission && submission.manager || '').trim();
  if (managerKey(requestedManager) !== managerKey(state.currentManager.name)) {
    throw new QueueError(409, 'not_your_turn', `It is ${state.currentManager.name}'s turn.`);
  }

  const requestedTeamKey = String(submission && submission.team || '').trim().toLowerCase();
  const team = TEAM_BY_KEY.get(requestedTeamKey);
  if (!team) {
    throw new QueueError(422, 'invalid_team', 'Choose a valid NFL team.');
  }
  if (!state.availableTeams.includes(team)) {
    throw new QueueError(409, 'team_already_used', `${state.currentManager.name} already used ${team} in another week.`);
  }

  const updated = structuredClone(data);
  const manager = updated.managers.find((candidate) => managerKey(candidate.name) === managerKey(state.currentManager.name));
  const pick = findWeekPick(manager, state.activeWeek);
  if (!pick) {
    throw new QueueError(502, 'missing_week', `${state.currentManager.name} has no Week ${state.activeWeek} pick slot.`);
  }
  if (String(pick.team || '').trim()) {
    throw new QueueError(409, 'pick_already_submitted', `${state.currentManager.name}'s pick is already recorded.`);
  }

  const submittedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  pick.team = team;
  pick.result = null;
  pick.submittedBy = 'public-pick-queue';
  pick.submittedAt = submittedAt;
  pick.lastUpdated = submittedAt;
  updated.lastUpdated = submittedAt;
  updated.pickQueue = {
    ...(updated.pickQueue || {}),
    lastSubmission: {
      manager: manager.name,
      week: state.activeWeek,
      team,
      submittedAt
    }
  };

  return {
    data: updated,
    receipt: {
      manager: manager.name,
      week: state.activeWeek,
      team,
      submittedAt
    },
    queue: deriveQueueState(updated, now)
  };
};
