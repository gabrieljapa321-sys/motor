(function () {
  "use strict";

  const DATA_PATH = "assets/data/study-data.json";
  const CONFIG_PATH = "assets/data/ui-config.json";
  const EXERCISES_PATH = "assets/data/exercises.json";

  function loadJsonSync(path) {
    const request = new XMLHttpRequest();
    request.open("GET", path, false);
    request.send(null);
    if (request.status >= 200 && request.status < 300) {
      return JSON.parse(request.responseText);
    }
    throw new Error(`Falha ao carregar ${path} (${request.status || "sem status"})`);
  }

  try {
    const data = loadJsonSync(DATA_PATH);
    const config = loadJsonSync(CONFIG_PATH);
    const exercisesPayload = loadJsonSync(EXERCISES_PATH);
    const exercises = Array.isArray(exercisesPayload && exercisesPayload.exercises) ? exercisesPayload.exercises : [];
    window.StudyData = Object.freeze({
      data,
      config,
      exercises,
      exerciseCatalog: exercisesPayload
    });
    globalThis.DATA = data;
    globalThis.APP_CONFIG = config;
    globalThis.EXERCISES = exercises;
    delete window.__studyDataLoadError;
  } catch (error) {
    console.error("[app-data] erro ao carregar JSON externo:", error);
    window.__studyDataLoadError = error;
    window.StudyData = Object.freeze({
      data: { profile: {}, subjects: [], tasks: [] },
      config: { pageMeta: {}, modes: {}, calendar: {}, grades: {}, notes: {}, week: {} },
      exercises: [],
      exerciseCatalog: { exercises: [] }
    });
    globalThis.DATA = window.StudyData.data;
    globalThis.APP_CONFIG = window.StudyData.config;
    globalThis.EXERCISES = [];
  }
})();
