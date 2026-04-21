(function () {
  "use strict";

  const STORAGE_KEY = "poli-study-motor-v1";
  const SCHEMA_VERSION = 3;

  const DEFAULT_STATE = {
    schemaVersion: SCHEMA_VERSION,
    theme: "auto",
    mode: "normal",
    currentPage: "dashboard",
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
        if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 10) {
          next[componentKey] = numeric;
        }
      });
      if (Object.keys(next).length) output[subjectCode] = next;
    });
    return output;
  }

  function normalizeWeekDensity(value) {
    return value === "comfortable" ? "comfortable" : "compact";
  }

  function normalizeBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function normalizeNotesSearchTerm(value) {
    return typeof value === "string" ? value.slice(0, 120) : "";
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
    return {
      schemaVersion: safeState.schemaVersion || SCHEMA_VERSION,
      touchedTasks: Object.keys(safeState.taskMeta || {}).length,
      logs: safeState.logs.length,
      deadlines: safeState.deadlines.length,
      deliveredDeadlines,
      gradeEntries: safeState.gradeEntries.length
    };
  }

  function getRecordTimestamp(record) {
    if (!record || typeof record !== "object") return 0;
    const candidates = [record.updatedAt, record.deliveredAt, record.createdAt, record.entryDate, record.date, record.completedAt, record.lastTouched]
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
      taskMeta: mergeTaskMeta(currentSafe.taskMeta, incomingSafe.taskMeta),
      logs: mergeRecordsById(currentSafe.logs, incomingSafe.logs, "log"),
      deadlines: mergeRecordsById(currentSafe.deadlines, incomingSafe.deadlines, "deadline"),
      gradeEntries: mergeRecordsById(currentSafe.gradeEntries, incomingSafe.gradeEntries, "grade"),
      gradeDraftSubjectCode: incomingSafe.gradeDraftSubjectCode || currentSafe.gradeDraftSubjectCode,
      gradeOverviewSubjectCode: incomingSafe.gradeOverviewSubjectCode || currentSafe.gradeOverviewSubjectCode,
      gradeTargets: incomingSafe.gradeTargets || currentSafe.gradeTargets,
      gradeScenarioDrafts: {
        ...(currentSafe.gradeScenarioDrafts || {}),
        ...(incomingSafe.gradeScenarioDrafts || {})
      },
      weekDensity: incomingSafe.weekDensity || currentSafe.weekDensity,
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
