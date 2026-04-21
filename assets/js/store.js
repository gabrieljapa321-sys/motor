(function () {
  "use strict";

  const STORAGE_KEY = "poli-study-motor-v1";
  const SCHEMA_VERSION = 7;

  const STUDY_SECTIONS = ["dashboard", "week", "fc", "calendar", "grades"];
const PRIMARY_PAGES = ["home", "studies", "news", "work"];
  const WORK_COMPANY_IDS = ["beneva", "tsea", "itamaraca-spe"];
  const WORK_PRIORITIES = ["critical", "high", "medium", "low"];
  const WORK_STATUSES = ["inbox", "planned", "doing", "waiting", "done"];
  const WORK_AREAS = ["financeiro", "juridico", "operacional", "governanca", "auditoria", "compliance", "reuniao", "followup"];

  const DEFAULT_STATE = {
    schemaVersion: SCHEMA_VERSION,
    theme: "auto",
    mode: "normal",
    currentPage: "home",
    studySection: "dashboard",
    calendarMonthAnchor: null,
    calendarLegendVisible: false,
    dashboardFocusMode: false,
    notesSearchTerm: "",
    taskMeta: {},
    logs: [],
    deadlines: [],
    gradeEntries: [],
    gradeDraftSubjectCode: null,
    gradeOverviewSubjectCode: null,
    gradeTargets: { primary: 5, secondary: 6 },
    gradeScenarioDrafts: {},
    weekDensity: "compact",
    weeklyTodos: [],
    flashcards: [],
    examSimulations: [],
    fcSubview: "flashcards",
    exerciseProgress: {},
    exerciseSubjectFilter: "ALL",
    currentExerciseId: null,
    newsCategory: "all",
    newsSource: "all",
    newsSeenIds: [],
    newsKnownIds: [],
    newsBrowserNotificationsEnabled: false,
    newsLastSyncAt: null,
    workTasks: [],
    workFilter: "all",
    workWeekAnchor: null,
    backupMeta: {
      lastExportedAt: null,
      lastImportedAt: null,
      lastImportMode: null,
      lastExportedVersion: null,
      lastImportedVersion: null
    },
    editingDeadlineId: null,
    editingGradeEntryId: null,
    pinnedTaskId: null,
    pinnedSubjectCode: null,
    activeSession: null,
    lastAutoProcessedDate: null
  };

  function cloneState(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeBackupMeta(meta) {
    const safe = meta && typeof meta === "object" ? meta : {};
    return {
      lastExportedAt: typeof safe.lastExportedAt === "string" ? safe.lastExportedAt : null,
      lastImportedAt: typeof safe.lastImportedAt === "string" ? safe.lastImportedAt : null,
      lastImportMode: safe.lastImportMode === "merge" || safe.lastImportMode === "replace" ? safe.lastImportMode : null,
      lastExportedVersion: typeof safe.lastExportedVersion === "string" ? safe.lastExportedVersion : null,
      lastImportedVersion: typeof safe.lastImportedVersion === "string" ? safe.lastImportedVersion : null
    };
  }

  function sanitizeGradeScenarioDrafts(drafts) {
    const safeDrafts = drafts && typeof drafts === "object" ? drafts : {};
    const output = {};
    Object.entries(safeDrafts).forEach(([subjectCode, value]) => {
      if (!value || typeof value !== "object") return;
      const next = {};
      Object.entries(value).forEach(([componentKey, score]) => {
        const numeric = Number(score);
        if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 10) next[componentKey] = numeric;
      });
      if (Object.keys(next).length) output[subjectCode] = next;
    });
    return output;
  }

  function normalizeWeekDensity(value) {
    return value === "comfortable" ? "comfortable" : "compact";
  }

  function normalizeFcSubview(value) {
    return value === "exercises" ? "exercises" : "flashcards";
  }

  function normalizeExerciseSubjectFilter(value) {
    return typeof value === "string" && value.trim() ? value : "ALL";
  }

  function normalizeExerciseStatus(value) {
    return ["trying", "stuck", "solvedSolo", "solvedWithHelp"].includes(value) ? value : null;
  }

  function sanitizeExerciseProgress(progress) {
    const safeProgress = progress && typeof progress === "object" ? progress : {};
    const output = {};
    Object.entries(safeProgress).forEach(([exerciseId, value]) => {
      if (!exerciseId || !value || typeof value !== "object") return;
      const hintsViewed = Number(value.hintsViewed);
      output[exerciseId] = {
        status: normalizeExerciseStatus(value.status),
        hintsViewed: Number.isFinite(hintsViewed) && hintsViewed > 0 ? Math.max(0, Math.floor(hintsViewed)) : 0,
        finalAnswerViewed: Boolean(value.finalAnswerViewed),
        solutionViewed: Boolean(value.solutionViewed),
        lastOpenedAt: typeof value.lastOpenedAt === "string" ? value.lastOpenedAt : null,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null
      };
    });
    return output;
  }

  function normalizeBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function normalizeNotesSearchTerm(value) {
    return typeof value === "string" ? value.slice(0, 120) : "";
  }

  function normalizePrimaryPage(value) {
    if (PRIMARY_PAGES.includes(value)) return value;
    if (STUDY_SECTIONS.includes(value)) return "studies";
    return "home";
  }

  function normalizeStudySection(value, fallback) {
    if (STUDY_SECTIONS.includes(value)) return value;
    if (STUDY_SECTIONS.includes(fallback)) return fallback;
    return "dashboard";
  }

  function normalizeWorkFilter(value) {
    const allowed = ["all", "general", "today", "overdue", "waiting", ...WORK_COMPANY_IDS];
    return allowed.includes(value) ? value : "all";
  }

  function normalizeNewsFilter(value) {
    return typeof value === "string" && value.trim() ? value.slice(0, 80) : "all";
  }

  function sanitizeNewsIds(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const output = [];
    values.forEach((value) => {
      if (typeof value !== "string") return;
      const clean = value.trim().slice(0, 160);
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      output.push(clean);
    });
    return output.slice(0, 600);
  }

  function normalizeIsoDate(value) {
    if (typeof value !== "string") return null;
    const clean = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
  }

  function sanitizeWeeklyTodos(records) {
    return Array.isArray(records) ? records.filter((item) => item && typeof item === "object") : [];
  }

  function sanitizeWorkTasks(records) {
    if (!Array.isArray(records)) return [];
    return records
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const companyId = WORK_COMPANY_IDS.includes(item.companyId) ? item.companyId : null;
        const scope = item.scope === "company" && companyId ? "company" : "general";
        const scheduledDayIso = normalizeIsoDate(item.scheduledDayIso);
        let status = WORK_STATUSES.includes(item.status) ? item.status : (scheduledDayIso ? "planned" : "inbox");
        if (scheduledDayIso && status === "inbox") status = "planned";
        if (!scheduledDayIso && status === "planned") status = "inbox";
        const priority = WORK_PRIORITIES.includes(item.priority) ? item.priority : "medium";
        const area = WORK_AREAS.includes(item.area) ? item.area : "followup";
        const completedAt = status === "done"
          ? (typeof item.completedAt === "string" ? item.completedAt : (typeof item.updatedAt === "string" ? item.updatedAt : null))
          : null;
        return {
          id: typeof item.id === "string" && item.id ? item.id : `work-imported-${index}`,
          title: typeof item.title === "string" ? item.title.slice(0, 180) : "Tarefa de trabalho",
          description: typeof item.description === "string" ? item.description.slice(0, 1000) : "",
          scope,
          companyId: scope === "company" ? companyId : null,
          scheduledDayIso,
          dueDate: normalizeIsoDate(item.dueDate),
          priority,
          status,
          area,
          nextAction: typeof item.nextAction === "string" ? item.nextAction.slice(0, 300) : "Definir proxima acao objetiva",
          notes: typeof item.notes === "string" ? item.notes.slice(0, 1000) : "",
          waitingSince: status === "waiting" ? (typeof item.waitingSince === "string" ? item.waitingSince : (typeof item.updatedAt === "string" ? item.updatedAt : null)) : null,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString(),
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : (typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString()),
          completedAt
        };
      });
  }

  function migrateState(candidate) {
    const safe = candidate && typeof candidate === "object" ? cloneState(candidate) : {};
    const version = Number.isFinite(Number(safe.schemaVersion)) ? Number(safe.schemaVersion) : 1;

    if (version < 2) {
      safe.gradeOverviewSubjectCode = safe.gradeOverviewSubjectCode || safe.gradeDraftSubjectCode || null;
      safe.gradeScenarioDrafts = safe.gradeScenarioDrafts || {};
      safe.weekDensity = safe.weekDensity || "compact";
      safe.backupMeta = safe.backupMeta || {};
    }

    if (version < 3) {
      safe.calendarLegendVisible = false;
      safe.dashboardFocusMode = false;
      safe.notesSearchTerm = "";
    }

    if (version < 4) {
      safe.flashcards = Array.isArray(safe.flashcards) ? safe.flashcards : [];
      safe.examSimulations = Array.isArray(safe.examSimulations) ? safe.examSimulations : [];
      safe.fcSubview = safe.fcSubview || "flashcards";
      safe.exerciseProgress = safe.exerciseProgress || {};
      safe.exerciseSubjectFilter = safe.exerciseSubjectFilter || "ALL";
      safe.currentExerciseId = safe.currentExerciseId || null;
    }

    if (version < 5) {
      safe.weeklyTodos = Array.isArray(safe.weeklyTodos) ? safe.weeklyTodos : [];
      safe.workTasks = Array.isArray(safe.workTasks) ? safe.workTasks : [];
      safe.workFilter = safe.workFilter || "all";
      safe.workWeekAnchor = safe.workWeekAnchor || null;
    }

    if (version < 6) {
      const previousPage = safe.currentPage || "dashboard";
      safe.studySection = normalizeStudySection(safe.studySection, previousPage);
      safe.currentPage = PRIMARY_PAGES.includes(previousPage) ? previousPage : (previousPage === "work" ? "work" : (previousPage === "dashboard" ? "home" : "studies"));
    }

    if (version < 7) {
      safe.newsCategory = safe.newsCategory || "all";
      safe.newsSource = safe.newsSource || "all";
      safe.newsSeenIds = Array.isArray(safe.newsSeenIds) ? safe.newsSeenIds : [];
      safe.newsKnownIds = Array.isArray(safe.newsKnownIds) ? safe.newsKnownIds : [];
      safe.newsBrowserNotificationsEnabled = Boolean(safe.newsBrowserNotificationsEnabled);
      safe.newsLastSyncAt = typeof safe.newsLastSyncAt === "string" ? safe.newsLastSyncAt : null;
    }

    safe.schemaVersion = SCHEMA_VERSION;
    return safe;
  }

  function hydrateStateFromRaw(candidate, defaultState = DEFAULT_STATE) {
    const parsed = migrateState(candidate);
    const targets = parsed.gradeTargets && typeof parsed.gradeTargets === "object" ? parsed.gradeTargets : {};
    const primary = Number(targets.primary);
    const secondary = Number(targets.secondary);
    return {
      ...cloneState(defaultState),
      ...parsed,
      schemaVersion: SCHEMA_VERSION,
      currentPage: normalizePrimaryPage(parsed.currentPage),
      studySection: normalizeStudySection(parsed.studySection, parsed.currentPage),
      calendarLegendVisible: normalizeBoolean(parsed.calendarLegendVisible, defaultState.calendarLegendVisible),
      dashboardFocusMode: normalizeBoolean(parsed.dashboardFocusMode, defaultState.dashboardFocusMode),
      notesSearchTerm: normalizeNotesSearchTerm(parsed.notesSearchTerm),
      taskMeta: parsed.taskMeta || {},
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : [],
      gradeEntries: Array.isArray(parsed.gradeEntries) ? parsed.gradeEntries : [],
      gradeDraftSubjectCode: parsed.gradeDraftSubjectCode || null,
      gradeOverviewSubjectCode: parsed.gradeOverviewSubjectCode || null,
      gradeTargets: {
        primary: Number.isFinite(primary) && primary >= 0 && primary <= 10 ? primary : defaultState.gradeTargets.primary,
        secondary: Number.isFinite(secondary) && secondary >= 0 && secondary <= 10 ? secondary : defaultState.gradeTargets.secondary
      },
      gradeScenarioDrafts: sanitizeGradeScenarioDrafts(parsed.gradeScenarioDrafts),
      weekDensity: normalizeWeekDensity(parsed.weekDensity),
      weeklyTodos: sanitizeWeeklyTodos(parsed.weeklyTodos),
      flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [],
      examSimulations: Array.isArray(parsed.examSimulations) ? parsed.examSimulations : [],
      fcSubview: normalizeFcSubview(parsed.fcSubview),
      exerciseProgress: sanitizeExerciseProgress(parsed.exerciseProgress),
      exerciseSubjectFilter: normalizeExerciseSubjectFilter(parsed.exerciseSubjectFilter),
      currentExerciseId: typeof parsed.currentExerciseId === "string" ? parsed.currentExerciseId : null,
      newsCategory: normalizeNewsFilter(parsed.newsCategory),
      newsSource: normalizeNewsFilter(parsed.newsSource),
      newsSeenIds: sanitizeNewsIds(parsed.newsSeenIds),
      newsKnownIds: sanitizeNewsIds(parsed.newsKnownIds),
      newsBrowserNotificationsEnabled: normalizeBoolean(parsed.newsBrowserNotificationsEnabled, defaultState.newsBrowserNotificationsEnabled),
      newsLastSyncAt: typeof parsed.newsLastSyncAt === "string" ? parsed.newsLastSyncAt : null,
      workTasks: sanitizeWorkTasks(parsed.workTasks),
      workFilter: normalizeWorkFilter(parsed.workFilter),
      workWeekAnchor: normalizeIsoDate(parsed.workWeekAnchor),
      backupMeta: sanitizeBackupMeta(parsed.backupMeta),
      editingDeadlineId: parsed.editingDeadlineId || null,
      editingGradeEntryId: parsed.editingGradeEntryId || null
    };
  }

  function loadState(defaultState = DEFAULT_STATE, storageKey = STORAGE_KEY) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return cloneState(defaultState);
      return hydrateStateFromRaw(JSON.parse(raw), defaultState);
    } catch (error) {
      return cloneState(defaultState);
    }
  }

  function saveState(state, storageKey = STORAGE_KEY) {
    const hydrated = hydrateStateFromRaw(state);
    localStorage.setItem(storageKey, JSON.stringify(hydrated));
  }

  function formatDateTimeShort(value) {
    if (!value) return "Nunca";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function getStateSummary(sourceState, hydrateFn = hydrateStateFromRaw) {
    const safeState = hydrateFn(sourceState || {});
    const deliveredDeadlines = safeState.deadlines.filter((item) => item && item.deliveredAt).length;
    const openWorkTasks = (safeState.workTasks || []).filter((item) => item && item.status !== "done").length;
    const waitingWorkTasks = (safeState.workTasks || []).filter((item) => item && item.status === "waiting").length;
    return {
      schemaVersion: safeState.schemaVersion || SCHEMA_VERSION,
      touchedTasks: Object.keys(safeState.taskMeta || {}).length,
      logs: safeState.logs.length,
      deadlines: safeState.deadlines.length,
      deliveredDeadlines,
      gradeEntries: safeState.gradeEntries.length,
      weeklyTodos: (safeState.weeklyTodos || []).length,
      flashcards: safeState.flashcards.length,
      examSimulations: safeState.examSimulations.length,
      newsKnownItems: (safeState.newsKnownIds || []).length,
      newsSeenItems: (safeState.newsSeenIds || []).length,
      workTasks: (safeState.workTasks || []).length,
      openWorkTasks,
      waitingWorkTasks
    };
  }

  function getRecordTimestamp(record) {
    if (!record || typeof record !== "object") return 0;
    const candidates = [
      record.updatedAt,
      record.deliveredAt,
      record.createdAt,
      record.entryDate,
      record.date,
      record.completedAt,
      record.waitingSince,
      record.lastTouched,
      record.lastOpenedAt,
      record.startedAt
    ]
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));
    return candidates.length ? Math.max(...candidates) : 0;
  }

  function chooseMoreRecentRecord(currentRecord, incomingRecord) {
    return getRecordTimestamp(incomingRecord) >= getRecordTimestamp(currentRecord) ? incomingRecord : currentRecord;
  }

  function mergeRecordsById(currentRecords, incomingRecords, fallbackPrefix) {
    const map = new Map();
    const absorb = (records, prefix) => {
      (records || []).forEach((record, index) => {
        if (!record || typeof record !== "object") return;
        const key = record.id || `${prefix}-${record.taskId || record.subjectCode || record.date || record.entryDate || index}`;
        if (!map.has(key)) {
          map.set(key, record);
        } else {
          map.set(key, chooseMoreRecentRecord(map.get(key), record));
        }
      });
    };
    absorb(currentRecords, `current-${fallbackPrefix || "record"}`);
    absorb(incomingRecords, `incoming-${fallbackPrefix || "record"}`);
    return Array.from(map.values());
  }

  function pickLatestIso(...values) {
    const valid = values
      .filter(Boolean)
      .map((value) => ({ value, time: new Date(value).getTime() }))
      .filter((item) => Number.isFinite(item.time));
    if (!valid.length) return values.find(Boolean) || null;
    valid.sort((a, b) => a.time - b.time);
    return valid[valid.length - 1].value;
  }

  function mergeTaskMeta(currentMeta, incomingMeta) {
    const keys = new Set([...Object.keys(currentMeta || {}), ...Object.keys(incomingMeta || {})]);
    const merged = {};
    keys.forEach((key) => {
      const current = currentMeta && currentMeta[key] ? currentMeta[key] : {};
      const incoming = incomingMeta && incomingMeta[key] ? incomingMeta[key] : {};
      merged[key] = {
        ...current,
        ...incoming,
        startedCount: Math.max(Number(current.startedCount || 0), Number(incoming.startedCount || 0)),
        skipCount: Math.max(Number(current.skipCount || 0), Number(incoming.skipCount || 0)),
        lightDelayCount: Math.max(Number(current.lightDelayCount || 0), Number(incoming.lightDelayCount || 0)),
        lastTouched: pickLatestIso(current.lastTouched, incoming.lastTouched),
        completedAt: pickLatestIso(current.completedAt, incoming.completedAt),
        lastLightDelayAt: pickLatestIso(current.lastLightDelayAt, incoming.lastLightDelayAt)
      };
    });
    return merged;
  }

  function mergeExerciseProgress(currentProgress, incomingProgress) {
    const currentSafe = sanitizeExerciseProgress(currentProgress);
    const incomingSafe = sanitizeExerciseProgress(incomingProgress);
    const keys = new Set([...Object.keys(currentSafe), ...Object.keys(incomingSafe)]);
    const merged = {};
    keys.forEach((key) => {
      const current = currentSafe[key] || {};
      const incoming = incomingSafe[key] || {};
      const currentTime = getRecordTimestamp(current);
      const incomingTime = getRecordTimestamp(incoming);
      const latest = incomingTime >= currentTime ? incoming : current;
      merged[key] = {
        status: latest.status || current.status || incoming.status || null,
        hintsViewed: Math.max(Number(current.hintsViewed || 0), Number(incoming.hintsViewed || 0)),
        finalAnswerViewed: Boolean(current.finalAnswerViewed || incoming.finalAnswerViewed),
        solutionViewed: Boolean(current.solutionViewed || incoming.solutionViewed),
        lastOpenedAt: pickLatestIso(current.lastOpenedAt, incoming.lastOpenedAt),
        updatedAt: pickLatestIso(current.updatedAt, incoming.updatedAt)
      };
    });
    return merged;
  }

  function mergeImportedState(currentState, importedState, options = {}) {
    const defaultState = options.defaultState || DEFAULT_STATE;
    const hydrateFn = options.hydrateStateFromRaw || ((value) => hydrateStateFromRaw(value, defaultState));
    const currentSafe = hydrateFn(currentState || {});
    const incomingSafe = hydrateFn(importedState || {});
    return hydrateFn({
      ...currentSafe,
      schemaVersion: SCHEMA_VERSION,
      calendarLegendVisible: incomingSafe.calendarLegendVisible,
      dashboardFocusMode: incomingSafe.dashboardFocusMode,
      notesSearchTerm: incomingSafe.notesSearchTerm || currentSafe.notesSearchTerm,
      currentPage: incomingSafe.currentPage || currentSafe.currentPage,
      studySection: incomingSafe.studySection || currentSafe.studySection,
      taskMeta: mergeTaskMeta(currentSafe.taskMeta, incomingSafe.taskMeta),
      logs: mergeRecordsById(currentSafe.logs, incomingSafe.logs, "log"),
      deadlines: mergeRecordsById(currentSafe.deadlines, incomingSafe.deadlines, "deadline"),
      gradeEntries: mergeRecordsById(currentSafe.gradeEntries, incomingSafe.gradeEntries, "grade"),
      weeklyTodos: mergeRecordsById(currentSafe.weeklyTodos, incomingSafe.weeklyTodos, "weeklyTodo"),
      flashcards: mergeRecordsById(currentSafe.flashcards, incomingSafe.flashcards, "flashcard"),
      examSimulations: mergeRecordsById(currentSafe.examSimulations, incomingSafe.examSimulations, "exam"),
      workTasks: mergeRecordsById(currentSafe.workTasks, incomingSafe.workTasks, "workTask"),
      gradeDraftSubjectCode: incomingSafe.gradeDraftSubjectCode || currentSafe.gradeDraftSubjectCode,
      gradeOverviewSubjectCode: incomingSafe.gradeOverviewSubjectCode || currentSafe.gradeOverviewSubjectCode,
      gradeTargets: incomingSafe.gradeTargets || currentSafe.gradeTargets,
      gradeScenarioDrafts: {
        ...(currentSafe.gradeScenarioDrafts || {}),
        ...(incomingSafe.gradeScenarioDrafts || {})
      },
      weekDensity: incomingSafe.weekDensity || currentSafe.weekDensity,
      fcSubview: normalizeFcSubview(incomingSafe.fcSubview || currentSafe.fcSubview),
      exerciseProgress: mergeExerciseProgress(currentSafe.exerciseProgress, incomingSafe.exerciseProgress),
      exerciseSubjectFilter: normalizeExerciseSubjectFilter(incomingSafe.exerciseSubjectFilter || currentSafe.exerciseSubjectFilter),
      currentExerciseId: incomingSafe.currentExerciseId || currentSafe.currentExerciseId,
      newsCategory: incomingSafe.newsCategory || currentSafe.newsCategory,
      newsSource: incomingSafe.newsSource || currentSafe.newsSource,
      newsSeenIds: sanitizeNewsIds([...(currentSafe.newsSeenIds || []), ...(incomingSafe.newsSeenIds || [])]),
      newsKnownIds: sanitizeNewsIds([...(currentSafe.newsKnownIds || []), ...(incomingSafe.newsKnownIds || [])]),
      newsBrowserNotificationsEnabled: Boolean(currentSafe.newsBrowserNotificationsEnabled || incomingSafe.newsBrowserNotificationsEnabled),
      newsLastSyncAt: pickLatestIso(currentSafe.newsLastSyncAt, incomingSafe.newsLastSyncAt),
      workFilter: incomingSafe.workFilter || currentSafe.workFilter,
      workWeekAnchor: incomingSafe.workWeekAnchor || currentSafe.workWeekAnchor,
      backupMeta: currentSafe.backupMeta
    });
  }

  function loadImportedState(candidate, defaultState = DEFAULT_STATE, hydrateFn) {
    try {
      const safeHydrate = hydrateFn || ((value) => hydrateStateFromRaw(value, defaultState));
      return safeHydrate(candidate || {});
    } catch (error) {
      return cloneState(defaultState);
    }
  }

  window.StudyStore = {
    STORAGE_KEY,
    SCHEMA_VERSION,
    DEFAULT_STATE,
    cloneState,
    migrateState,
    sanitizeBackupMeta,
    sanitizeGradeScenarioDrafts,
    normalizeWeekDensity,
    hydrateStateFromRaw,
    loadState,
    saveState,
    formatDateTimeShort,
    getStateSummary,
    mergeImportedState,
    loadImportedState
  };
})();
