(function () {
  "use strict";

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportStateBackup(ctx) {
    const nowIso = new Date().toISOString();
    const state = ctx.getState();
    state.backupMeta = {
      ...ctx.sanitizeBackupMeta(state.backupMeta),
      lastExportedAt: nowIso,
      lastExportedVersion: ctx.appVersion
    };
    ctx.saveState();
    const stamp = nowIso.replace(/[:.]/g, "-");
    const payload = {
      type: "motor-estudo-poli-backup",
      schemaVersion: ctx.schemaVersion,
      appVersion: ctx.appVersion,
      exportedAt: nowIso,
      storageKey: ctx.storageKey,
      summary: ctx.getStateSummary(state),
      state
    };
    downloadTextFile(
      `motor-estudo-poli-backup-${stamp}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
    ctx.showToast("Backup exportado.");
    ctx.render();
  }

  function buildPendingImportPackage(parsedFile, ctx) {
    const payload = parsedFile && parsedFile.state ? parsedFile : { state: parsedFile };
    const importedState = ctx.loadImportedState(payload.state || {});
    return {
      meta: {
        type: payload.type || "desconhecido",
        schemaVersion: payload.schemaVersion || ctx.schemaVersion || 1,
        appVersion: payload.appVersion || "desconhecida",
        exportedAt: payload.exportedAt || null,
        storageKey: payload.storageKey || null,
        summary: payload.summary || ctx.getStateSummary(importedState)
      },
      importedState,
      summary: ctx.getStateSummary(importedState)
    };
  }

  function queueImportedBackup(parsedFile, ctx) {
    ctx.setPendingImportPackage(buildPendingImportPackage(parsedFile, ctx));
    ctx.showToast("Backup carregado. Escolha substituir tudo ou mesclar.");
    ctx.render();
  }

  function importStateBackupFromFile(file, ctx) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (!parsed || typeof parsed !== "object") throw new Error("invalid");
        queueImportedBackup(parsed, ctx);
      } catch (error) {
        ctx.setPendingImportPackage(null);
        ctx.showToast("Arquivo de backup inválido.");
        ctx.render();
      }
    };
    reader.readAsText(file);
  }

  function cancelPendingImport(ctx) {
    ctx.setPendingImportPackage(null);
    ctx.showToast("Importação cancelada.");
    ctx.render();
  }

  function applyPendingImport(mode, ctx) {
    const pendingImportPackage = ctx.getPendingImportPackage();
    if (!pendingImportPackage) return;
    const imported = pendingImportPackage.importedState;
    const nextState = mode === "merge"
      ? ctx.mergeImportedState(ctx.getState(), imported)
      : ctx.loadImportedState(imported);

    nextState.backupMeta = {
      ...ctx.sanitizeBackupMeta(nextState.backupMeta),
      lastImportedAt: new Date().toISOString(),
      lastImportMode: mode,
      lastImportedVersion: pendingImportPackage.meta.appVersion || "desconhecida"
    };
    nextState.editingDeadlineId = null;
    nextState.editingGradeEntryId = null;

    ctx.setState(nextState);
    ctx.setPendingImportPackage(null);
    ctx.saveState();
    ctx.showToast(mode === "merge" ? "Backup mesclado com os dados atuais." : "Backup importado substituindo os dados atuais.");
    ctx.render(true);
  }

  window.StudyBackup = {
    downloadTextFile,
    exportStateBackup,
    queueImportedBackup,
    importStateBackupFromFile,
    cancelPendingImport,
    applyPendingImport
  };
})();
