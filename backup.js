(function () {
  "use strict";

  const authListeners = new Set();
  const statusListeners = new Set();
  let provider = null;
  let currentUser = null;
  let appContext = null;
  let cloudLoaded = false;
  let suppressCloudWrite = false;
  let syncTimer = null;
  let authSubscriptionAttached = false;
  let lastStatus = { text: "Inicializando...", tone: "neutral" };

  function emitStatus(text, tone) {
    lastStatus = { text, tone: tone || "neutral" };
    statusListeners.forEach((listener) => listener(lastStatus));
  }

  function emitAuth(user) {
    currentUser = user || null;
    authListeners.forEach((listener) => listener(currentUser));
  }

  function subscribeStatus(listener) {
    statusListeners.add(listener);
    listener(lastStatus);
    return () => statusListeners.delete(listener);
  }

  function subscribeAuth(listener) {
    authListeners.add(listener);
    listener(currentUser);
    return () => authListeners.delete(listener);
  }

  function hasMeaningfulData(sourceState) {
    if (!sourceState || typeof sourceState !== "object") return false;
    return !!(
      (sourceState.logs && sourceState.logs.length) ||
      (sourceState.deadlines && sourceState.deadlines.length) ||
      (sourceState.gradeEntries && sourceState.gradeEntries.length) ||
      (sourceState.taskMeta && Object.keys(sourceState.taskMeta).length)
    );
  }

  function getSummary(sourceState) {
    if (appContext && typeof appContext.getStateSummary === "function") {
      return appContext.getStateSummary(sourceState);
    }
    if (window.StudyStore && typeof window.StudyStore.getStateSummary === "function") {
      return window.StudyStore.getStateSummary(sourceState);
    }
    return { touchedTasks: 0, logs: 0, deadlines: 0, deliveredDeadlines: 0, gradeEntries: 0, schemaVersion: 0 };
  }

  function renderSummary(summary) {
    return [
      `<div><strong>Schema:</strong> ${summary.schemaVersion || "?"}</div>`,
      `<div><strong>Tarefas tocadas:</strong> ${summary.touchedTasks || 0}</div>`,
      `<div><strong>Logs:</strong> ${summary.logs || 0}</div>`,
      `<div><strong>Entregas:</strong> ${summary.deadlines || 0}</div>`,
      `<div><strong>Entregues:</strong> ${summary.deliveredDeadlines || 0}</div>`,
      `<div><strong>Notas:</strong> ${summary.gradeEntries || 0}</div>`
    ].join("");
  }

  function requestConflictResolution(localState, cloudState) {
    const backdrop = document.getElementById("syncConflictBackdrop");
    const localSummary = document.getElementById("syncConflictLocalSummary");
    const cloudSummary = document.getElementById("syncConflictCloudSummary");
    const keepLocalBtn = document.getElementById("syncConflictKeepLocalBtn");
    const mergeBtn = document.getElementById("syncConflictMergeBtn");
    const useCloudBtn = document.getElementById("syncConflictUseCloudBtn");
    const note = document.getElementById("syncConflictNote");

    if (!backdrop || !localSummary || !cloudSummary || !keepLocalBtn || !mergeBtn || !useCloudBtn) {
      return Promise.resolve("merge");
    }

    localSummary.innerHTML = renderSummary(getSummary(localState));
    cloudSummary.innerHTML = renderSummary(getSummary(cloudState));
    if (note) {
      note.textContent = "Mesclar preserva o que for mais recente em cada lista e mantém preferências novas do schema atual.";
    }

    backdrop.dataset.open = "true";
    backdrop.setAttribute("aria-hidden", "false");

    return new Promise((resolve) => {
      const cleanup = (choice) => {
        keepLocalBtn.removeEventListener("click", onLocal);
        mergeBtn.removeEventListener("click", onMerge);
        useCloudBtn.removeEventListener("click", onCloud);
        backdrop.dataset.open = "false";
        backdrop.setAttribute("aria-hidden", "true");
        resolve(choice);
      };
      const onLocal = () => cleanup("local");
      const onMerge = () => cleanup("merge");
      const onCloud = () => cleanup("cloud");
      keepLocalBtn.addEventListener("click", onLocal, { once: true });
      mergeBtn.addEventListener("click", onMerge, { once: true });
      useCloudBtn.addEventListener("click", onCloud, { once: true });
    });
  }

  async function writeCloudPayload(payload, reason) {
    const cloudRef = provider.ref(provider.db, "users/" + currentUser.uid + "/appState");
    await provider.set(cloudRef, {
      payload,
      updatedAt: new Date().toISOString(),
      source: "motor-estudos-html",
      reason: reason || "save"
    });
  }

  async function writeCloudState(reason) {
    if (!provider || !appContext || !currentUser || suppressCloudWrite) return;
    try {
      await writeCloudPayload(appContext.getState(), reason || "save");
      emitStatus("Nuvem sincronizada.", "success");
    } catch (error) {
      console.error("Erro ao enviar estado para a nuvem:", error);
      emitStatus("Erro ao sincronizar com a nuvem.", "danger");
    }
  }

  async function applyChosenState(nextState, reason, message) {
    appContext.setState(nextState);
    appContext.saveLocal();
    appContext.render();
    if (reason) {
      await writeCloudPayload(nextState, reason);
    }
    emitStatus(message, "success");
    if (appContext.showToast) {
      appContext.showToast(message);
    }
  }

  async function reconcileCloudState(user) {
    emitAuth(user);
    if (!provider) return;

    if (!user) {
      cloudLoaded = false;
      emitStatus("Sem sincronização: usuário não logado.", "neutral");
      return;
    }

    if (!appContext) {
      emitStatus("Conta conectada. Aguardando app principal...", "accent");
      return;
    }

    emitStatus("Lendo dados da nuvem...", "accent");

    try {
      const cloudRef = provider.ref(provider.db, "users/" + user.uid + "/appState");
      const snap = await provider.get(cloudRef);

      if (snap.exists() && snap.val() && snap.val().payload) {
        const cloudState = appContext.hydrateStateFromRaw(snap.val().payload);
        const localState = appContext.getState();
        const localHasData = hasMeaningfulData(localState);
        const cloudHasData = hasMeaningfulData(cloudState);

        suppressCloudWrite = true;

        if (cloudHasData) {
          if (localHasData) {
            const choice = await requestConflictResolution(localState, cloudState);
            if (choice === "cloud") {
              await applyChosenState(cloudState, null, "Dados da nuvem carregados.");
            } else if (choice === "merge") {
              const merged = typeof appContext.mergeStates === "function"
                ? appContext.mergeStates(localState, cloudState)
                : cloudState;
              await applyChosenState(merged, "merge-conflict-resolution", "Dados locais e da nuvem foram mesclados.");
            } else {
              await writeCloudPayload(localState, "kept-local-version");
              emitStatus("Dados locais mantidos e enviados.", "success");
              if (appContext.showToast) appContext.showToast("Dados locais mantidos.");
            }
          } else {
            await applyChosenState(cloudState, null, "Dados da nuvem carregados.");
          }
        } else if (localHasData) {
          await writeCloudPayload(localState, "seed-from-local");
          emitStatus("Dados locais enviados para iniciar a nuvem.", "success");
        } else {
          emitStatus("Conta conectada. A nuvem será criada quando houver dados seus.", "neutral");
        }

        suppressCloudWrite = false;
        cloudLoaded = true;
      } else {
        const localState = appContext.getState();
        const localHasData = hasMeaningfulData(localState);
        if (localHasData) {
          await writeCloudPayload(localState, "first-cloud-save");
          emitStatus("Nuvem criada com seus dados locais.", "success");
        } else {
          emitStatus("Conta conectada. A nuvem será criada quando você lançar notas, entregas ou progresso.", "neutral");
        }
        cloudLoaded = true;
      }
    } catch (error) {
      console.error("Erro ao carregar/sincronizar estado:", error);
      emitStatus("Erro ao carregar dados da nuvem.", "danger");
    } finally {
      suppressCloudWrite = false;
    }
  }

  function ensureAuthSubscription() {
    if (!provider || authSubscriptionAttached) return;
    authSubscriptionAttached = true;
    provider.onAuthStateChanged(provider.auth, (user) => {
      reconcileCloudState(user || null);
    });
    emitAuth(provider.auth.currentUser || null);
  }

  function installProvider(api) {
    provider = api;
    ensureAuthSubscription();
    emitStatus("Firebase conectado.", "neutral");
    if (provider.auth && provider.auth.currentUser) {
      reconcileCloudState(provider.auth.currentUser);
    }
  }

  async function login() {
    if (!provider) throw new Error("Firebase não inicializado.");
    try {
      await provider.signInWithPopup(provider.auth, provider.provider);
    } catch (error) {
      console.error("Erro no login:", error);
      if ([
        "auth/popup-blocked",
        "auth/popup-closed-by-user",
        "auth/cancelled-popup-request",
        "auth/operation-not-supported-in-this-environment"
      ].includes(error.code)) {
        emitStatus("Popup falhou. Tentando por redirecionamento...", "accent");
        await provider.signInWithRedirect(provider.auth, provider.provider);
        return;
      }
      emitStatus("Erro no login: " + (error.code || "sem código"), "danger");
      throw error;
    }
  }

  async function logout() {
    if (!provider) throw new Error("Firebase não inicializado.");
    await provider.signOut(provider.auth);
  }

  function attachApp(context) {
    appContext = context;
    if (provider && provider.auth && provider.auth.currentUser) {
      reconcileCloudState(provider.auth.currentUser);
    }
  }

  function scheduleCloudWrite(reason) {
    if (!currentUser || !cloudLoaded || suppressCloudWrite) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      writeCloudState(reason || "auto-save");
    }, 600);
  }

  function getCurrentUser() {
    return currentUser;
  }

  window.StudySync = {
    installProvider,
    attachApp,
    scheduleCloudWrite,
    subscribeStatus,
    subscribeAuth,
    emitStatus,
    getCurrentUser,
    login,
    logout
  };
})();
