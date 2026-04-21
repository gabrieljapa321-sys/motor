  (function () {
    function waitForAppReady() {
      const appReady =
        window.StudySync &&
        typeof state !== "undefined" &&
        typeof saveState === "function" &&
        typeof hydrateStateFromRaw === "function" &&
        typeof render === "function";

      if (!appReady) {
        setTimeout(waitForAppReady, 400);
        return;
      }

      const originalSaveState = saveState;

      saveState = function () {
        originalSaveState();
        window.StudySync.scheduleCloudWrite("auto-save");
      };

      window.StudySync.attachApp({
        getState: () => state,
        setState: (nextState) => { state = nextState; },
        hydrateStateFromRaw,
        getStateSummary,
        mergeStates: (localState, incomingState) => mergeImportedState(localState, incomingState),
        saveLocal: () => originalSaveState(),
        render,
        showToast
      });
    }

    waitForAppReady();
  })();
