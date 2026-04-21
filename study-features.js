(function () {
  "use strict";

  function setupAppActionDelegation() {
    if (document.body && document.body.dataset.appActionsBound === "true") return;
    if (document.body) document.body.dataset.appActionsBound = "true";

    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      if (button.matches("[data-action='start']")) {
        startTask(button.dataset.taskId);
        return;
      }
      if (button.matches("[data-action='complete']")) {
        completeTask(button.dataset.taskId);
        return;
      }
      if (button.matches("[data-action='skip']")) {
        skipTask(button.dataset.taskId);
        return;
      }
      if (button.matches("[data-action='next-same']")) {
        nextTaskSameSubject(button.dataset.taskId);
        return;
      }
      if (button.matches("[data-action='add-to-planner']")) {
        const addToPlanner = window.StudyApp && typeof window.StudyApp.addCurrentTaskToPlanner === "function"
          ? window.StudyApp.addCurrentTaskToPlanner
          : window.addCurrentTaskToPlanner;
        if (typeof addToPlanner === "function") {
          addToPlanner(button.dataset.taskId);
        }
        return;
      }
      if (button.matches("[data-action='toggle-dashboard-focus']")) {
        if (window.StudyApp && typeof window.StudyApp.toggleDashboardFocusMode === "function") {
          window.StudyApp.toggleDashboardFocusMode();
        }
        return;
      }
      if (button.matches("[data-deadline-action='deliver']")) {
        markDeadlineDelivered(button.dataset.deadlineId);
        return;
      }
      if (button.matches("[data-deadline-action='reopen']")) {
        reopenDeadline(button.dataset.deadlineId);
        return;
      }
      if (button.matches("[data-deadline-action='edit']")) {
        startEditDeadline(button.dataset.deadlineId);
        return;
      }
      if (button.matches("[data-deadline-action='delete']")) {
        removeDeadline(button.dataset.deadlineId);
        return;
      }
      if (button.matches("[data-grade-action='edit']")) {
        startEditGradeEntry(button.dataset.gradeEntryId);
        return;
      }
      if (button.matches("[data-grade-action='delete']")) {
        removeGradeEntry(button.dataset.gradeEntryId);
        return;
      }
      if (button.matches("[data-scenario-preset]")) {
        applyGradeScenarioPreset(
          button.dataset.subjectCode,
          button.dataset.scenarioPreset,
          button.dataset.scenarioTarget || "primary"
        );
        return;
      }
      if (button.matches("[data-scenario-clear]")) {
        clearGradeScenarioDraft(button.dataset.subjectCode);
        return;
      }
      if (button.id === "cancelDeadlineEditBtn") {
        cancelEditDeadline();
        return;
      }
      if (button.id === "cancelGradeEditBtn") {
        cancelEditGradeEntry();
        return;
      }
      if (button.id === "backupExportInlineBtn") {
        exportStateBackup();
        return;
      }
      if (button.id === "backupImportInlineBtn") {
        if (elements.importFileInput) elements.importFileInput.click();
        return;
      }
      if (button.id === "backupApplyReplaceBtn") {
        applyPendingImport("replace");
        return;
      }
      if (button.id === "backupApplyMergeBtn") {
        applyPendingImport("merge");
        return;
      }
      if (button.id === "backupDismissImportBtn") {
        cancelPendingImport();
      }
    });

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.id === "gradeSubjectSelect") {
        state.gradeDraftSubjectCode = target.value;
        if (state.editingGradeEntryId) state.editingGradeEntryId = null;
        saveState();
        render();
        return;
      }
      if (target.id === "gradeOverviewSubjectSelect") {
        state.gradeOverviewSubjectCode = target.value;
        saveState();
        render();
        return;
      }
      if (target.id === "gradeNotesSearchInput") {
        if (window.StudyApp && typeof window.StudyApp.setNotesSearchTerm === "function") {
          window.StudyApp.setNotesSearchTerm(target.value);
        }
      }
    });

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.id === "gradeNotesSearchInput") {
        if (window.StudyApp && typeof window.StudyApp.setNotesSearchTerm === "function") {
          window.StudyApp.setNotesSearchTerm(target.value);
        }
      }
    });

    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      if (form.id === "deadlineForm") {
        event.preventDefault();
        upsertDeadlineFromForm(form);
        return;
      }
      if (form.id === "gradeForm") {
        event.preventDefault();
        upsertGradeEntryFromForm(form);
        return;
      }
      if (form.id === "gradeTargetsForm") {
        event.preventDefault();
        const formData = new FormData(form);
        setGradeTargets(
          Number(String(formData.get("primaryTarget") || "").replace(",", ".")),
          Number(String(formData.get("secondaryTarget") || "").replace(",", "."))
        );
        return;
      }
      if (form.matches(".gradeScenarioForm")) {
        event.preventDefault();
        saveGradeScenarioFromForm(form);
      }
    });
  }

  window.setupAppActionDelegation = setupAppActionDelegation;
})();
