    /*
      Dados extraidos do pacote original.
      Disciplinas identificadas: PME3100, PME3210, PME3240 e PME3400.
      A logica abaixo assume pesos e riscos conservadores quando o material fonte
      nao traz o criterio completo de avaliacao de forma legivel.
    */

    const STORE_API = window.StudyStore;
    const DATE_API = window.StudyDates;
    const BACKUP_API = window.StudyBackup;
    const THEME_API = window.StudyTheme;
    const STUDY_DATA_API = window.StudyData || {};
    const STORAGE_KEY = STORE_API.STORAGE_KEY;
    const SCHEMA_VERSION = STORE_API.SCHEMA_VERSION;
    const APP_VERSION = "etapa1-v15-shell";
    const DATA = STUDY_DATA_API.data || globalThis.DATA || { subjects: [], tasks: [] };
    const UI_CONFIG = STUDY_DATA_API.config || globalThis.APP_CONFIG || {};
    const PAGE_META = UI_CONFIG.pageMeta || {};
    const MODE_LABELS = (UI_CONFIG.modes && UI_CONFIG.modes.long) || {};
    const MODE_SHORT_LABELS = (UI_CONFIG.modes && UI_CONFIG.modes.short) || {};
    const CALENDAR_UI = UI_CONFIG.calendar || {};
    const GRADE_UI = UI_CONFIG.grades || {};
    const NOTES_UI = UI_CONFIG.notes || {};
    const NEWS_UI = UI_CONFIG.news || {};
    const DEFAULT_STATE = STORE_API.DEFAULT_STATE;

    const {
      parseDate,
      today,
      startOfDay,
      addDays,
      startOfMonth,
      endOfMonth,
      addMonths,
      isSameDay,
      formatMonthYear,
      toIsoDate,
      formatDate,
      formatDateLong,
      daysBetween,
      formatTime,
      formatDateTime,
      formatHeaderDate
    } = DATE_API;

    let state = STORE_API.loadState(DEFAULT_STATE, STORAGE_KEY);
    let pendingImportPackage = null;

    const elements = {
      themeToggle: document.getElementById("tbThemeBtn"),
      recalcBtn: document.getElementById("tbRecalcBtn"),
      exportBtn: document.getElementById("tbExportBtn"),
      importBtn: document.getElementById("tbImportBtn"),
      importFileInput: document.getElementById("importFileInput"),
      modeSelect: document.getElementById("tbModeSelect"),
      navButtons: Array.from(document.querySelectorAll(".tb-nav-btn[data-nav-page]")),
      studyNavBar: document.getElementById("studyNavBar"),
      studyNavButtons: Array.from(document.querySelectorAll(".study-nav-btn[data-study-page]")),
      pageEyebrow: document.getElementById("pageEyebrow"),
      pageTitle: document.getElementById("pageTitle"),
      pageSubtitle: document.getElementById("pageSubtitle"),
      pageDateTxt: document.getElementById("pageDateTxt"),
      pageModeTxt: document.getElementById("pageModeTxt"),
      deadlinesCount: document.getElementById("deadlinesCount"),
      subjectsCount: document.getElementById("subjectsCount"),
      homePage: document.getElementById("homePage"),
      newsPage: document.getElementById("newsPage"),
      dashboardPage: document.getElementById("dashboardPage"),
      weekPage: document.getElementById("weekPage"),
      fcPage: document.getElementById("fcPage"),
      calendarPage: document.getElementById("calendarPage"),
      gradesPage: document.getElementById("gradesPage"),
      workPage: document.getElementById("workPage"),
      monthPrevBtn: document.getElementById("monthPrevBtn"),
      monthTodayBtn: document.getElementById("monthTodayBtn"),
      monthNextBtn: document.getElementById("monthNextBtn"),
      calendarLegendToggleBtn: document.getElementById("calendarLegendToggleBtn"),
      calendarMonthTitle: document.getElementById("calendarMonthTitle"),
      calendarMonthSubtitle: document.getElementById("calendarMonthSubtitle"),
      monthLegend: document.getElementById("monthLegend"),
      monthCalendarGrid: document.getElementById("monthCalendarGrid"),
      mainTaskCard: document.getElementById("mainTaskCard"),
      executiveSummary: document.getElementById("executiveSummary"),
      whatIfCard: document.getElementById("whatIfCard"),
      todayQueue: document.getElementById("todayQueue"),
      deadlinesCard: document.getElementById("deadlinesCard"),
      deadlineFormCard: document.getElementById("deadlineFormCard"),
      backupStatusCard: document.getElementById("backupStatusCard"),
      importPreviewCard: document.getElementById("importPreviewCard"),
      gradesSummaryCard: document.getElementById("gradesSummaryCard"),
      gradeFormCard: document.getElementById("gradeFormCard"),
      subjectGrid: document.getElementById("subjectGrid"),
      sourcesBlock: document.getElementById("sourcesBlock"),
      notesBlock: document.getElementById("notesBlock"),
      homeTodayCard: document.getElementById("homeTodayCard"),
      homeWeekCard: document.getElementById("homeWeekCard"),
      homeOverdueCard: document.getElementById("homeOverdueCard"),
      homeWaitingCard: document.getElementById("homeWaitingCard"),
      homeDeadlinesCard: document.getElementById("homeDeadlinesCard"),
      homeCompaniesCard: document.getElementById("homeCompaniesCard"),
      homeQuickCaptureCard: document.getElementById("homeQuickCaptureCard"),
      mobileFocusbar: document.getElementById("mobileFocusbar"),
      toast: document.getElementById("toast"),
      compatHint: document.getElementById("compatHint")
    };

function sanitizeBackupMeta(meta) {
  return STORE_API.sanitizeBackupMeta(meta);
}

function hydrateStateFromRaw(candidate) {
  return STORE_API.hydrateStateFromRaw(candidate, DEFAULT_STATE);
}

function loadState() {
  return STORE_API.loadState(DEFAULT_STATE, STORAGE_KEY);
}

function saveState() {
  state = hydrateStateFromRaw(state);
  STORE_API.saveState(state, STORAGE_KEY);
}

function formatDateTimeShort(value) {
  return STORE_API.formatDateTimeShort(value);
}

function getStateSummary(sourceState = state) {
  return STORE_API.getStateSummary(sourceState, hydrateStateFromRaw);
}

function mergeImportedState(currentState, importedState) {
  return STORE_API.mergeImportedState(currentState, importedState, {
    defaultState: DEFAULT_STATE,
    hydrateStateFromRaw
  });
}

function loadImportedState(candidate) {
  return STORE_API.loadImportedState(candidate, DEFAULT_STATE, hydrateStateFromRaw);
}

function getBackupContext() {
  return {
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    storageKey: STORAGE_KEY,
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    getPendingImportPackage: () => pendingImportPackage,
    setPendingImportPackage: (pkg) => { pendingImportPackage = pkg; },
    sanitizeBackupMeta,
    getStateSummary,
    saveState,
    showToast,
    render,
    mergeImportedState,
    loadImportedState
  };
}

function downloadTextFile(filename, content, mimeType) {
  return BACKUP_API.downloadTextFile(filename, content, mimeType);
}

function exportStateBackup() {
  return BACKUP_API.exportStateBackup(getBackupContext());
}

function queueImportedBackup(parsedFile) {
  return BACKUP_API.queueImportedBackup(parsedFile, getBackupContext());
}

function importStateBackupFromFile(file) {
  return BACKUP_API.importStateBackupFromFile(file, getBackupContext());
}

function cancelPendingImport() {
  return BACKUP_API.cancelPendingImport(getBackupContext());
}

function applyPendingImport(mode) {
  return BACKUP_API.applyPendingImport(mode, getBackupContext());
}

function getGradeTargets() {
  const primary = Number(state.gradeTargets && state.gradeTargets.primary);
  const secondary = Number(state.gradeTargets && state.gradeTargets.secondary);
  return {
    primary: Number.isFinite(primary) ? primary : 5,
    secondary: Number.isFinite(secondary) ? secondary : 6
  };
}

function setGradeTargets(primary, secondary) {
  const nextPrimary = Number(primary);
  const nextSecondary = Number(secondary);
  if (!Number.isFinite(nextPrimary) || !Number.isFinite(nextSecondary) || nextPrimary < 0 || nextPrimary > 10 || nextSecondary < 0 || nextSecondary > 10) {
    showToast("Metas devem ficar entre 0 e 10.");
    return;
  }
  state.gradeTargets = { primary: nextPrimary, secondary: nextSecondary };
  saveState();
  showToast("Metas atualizadas.");
  render();
}

function setNotesSearchTerm(value) {
  state.notesSearchTerm = typeof value === "string" ? value.slice(0, 120) : "";
  saveState();
  render();
}

function toggleCalendarLegend() {
  state.calendarLegendVisible = !state.calendarLegendVisible;
  saveState();
  render();
}

function toggleDashboardFocusMode() {
  state.dashboardFocusMode = !state.dashboardFocusMode;
  saveState();
  showToast(state.dashboardFocusMode ? "Modo foco ativado." : "Modo foco desativado.");
  render();
}

function getCalendarAnchorDate(referenceDate = today()) {
      const currentMonth = startOfMonth(referenceDate);
      const anchor = state.calendarMonthAnchor ? startOfMonth(parseDate(state.calendarMonthAnchor)) : currentMonth;
      return anchor < currentMonth ? currentMonth : anchor;
    }

    function setCalendarAnchorDate(value, options = {}) {
      state.calendarMonthAnchor = toIsoDate(startOfMonth(value));
      if (options.persist !== false) saveState();
    }

    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    function getSubject(code) {
      return DATA.subjects.find((subject) => subject.code === code);
    }

    function getTask(taskId) {
      return DATA.tasks.find((task) => task.id === taskId);
    }

    function getTaskMeta(taskId) {
      return state.taskMeta[taskId] || {
        done: false,
        skipCount: 0,
        startedCount: 0,
        lightDelayCount: 0,
        lastTouched: null,
        completedAt: null,
        lastLightDelayAt: null
      };
    }

    function setTaskMeta(taskId, patch, options = {}) {
      state.taskMeta[taskId] = {
        ...getTaskMeta(taskId),
        ...patch
      };
      if (options.persist !== false) saveState();
    }

    function isDone(taskId) {
      return !!getTaskMeta(taskId).done;
    }

    function hasActivityOnDate(date) {
      const iso = toIsoDate(date);
      const logActivity = state.logs.some((log) => log.date === iso);
      if (logActivity) return true;

      return Object.values(state.taskMeta).some((meta) => meta.lastTouched === iso || meta.completedAt === iso);
    }

    function applyLightDelayForMissedDays(referenceDate) {
      const todayIso = toIsoDate(referenceDate);
      let changed = false;

      if (!state.lastAutoProcessedDate) {
        state.lastAutoProcessedDate = todayIso;
        saveState();
        return;
      }

      if (state.activeSession) {
        const sessionDate = toIsoDate(startOfDay(new Date(state.activeSession.startedAt)));
        if (sessionDate !== todayIso) {
          state.activeSession = null;
          changed = true;
        }
      }

      let cursor = addDays(parseDate(state.lastAutoProcessedDate), 1);
      while (cursor <= referenceDate) {
        const iso = toIsoDate(cursor);

        if (!hasActivityOnDate(cursor)) {
          const target = selectMainTask(cursor, false);
          if (target && target.task && !isDone(target.task.id)) {
            const meta = getTaskMeta(target.task.id);
            if (meta.lastLightDelayAt !== iso) {
              setTaskMeta(target.task.id, {
                lightDelayCount: Math.min((meta.lightDelayCount || 0) + 1, 3),
                lastLightDelayAt: iso,
                lastTouched: meta.lastTouched || state.lastAutoProcessedDate
              }, { persist: false });
              changed = true;
            }
          }
        }

        state.lastAutoProcessedDate = iso;
        changed = true;
        cursor = addDays(cursor, 1);
      }

      if (changed) saveState();
    }

    function makeDeadlineId() {
      return `deadline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function getDeadlineDueDateTime(deadline) {
      const time = deadline.dueTime && /^\d{2}:\d{2}$/.test(deadline.dueTime) ? deadline.dueTime : "23:59";
      return new Date(`${deadline.dueDate}T${time}:00`);
    }

    function getSortedDeadlines(includeDelivered = true) {
      return state.deadlines
        .filter((deadline) => includeDelivered || !deadline.deliveredAt)
        .slice()
        .sort((a, b) => getDeadlineDueDateTime(a) - getDeadlineDueDateTime(b));
    }

    function getDeadlinesOnDate(date) {
      const iso = toIsoDate(date);
      return getSortedDeadlines(true).filter((deadline) => deadline.dueDate === iso);
    }

    function getDeadlineSubject(deadline) {
      return deadline.subjectCode ? getSubject(deadline.subjectCode) : null;
    }

    function getDeadlineStatus(deadline, referenceDate = today()) {
      if (deadline.deliveredAt) {
        return {
          tone: "success",
          label: "entregue",
          rank: 99,
          summary: `Entregue em ${escapeHtml(formatDateLong(parseDate(deadline.deliveredAt)))}`
        };
      }

      const dueAt = getDeadlineDueDateTime(deadline);
      const now = new Date();
      const daysLeft = daysBetween(referenceDate, startOfDay(dueAt));

      if (dueAt < now) {
        return {
          tone: "danger",
          label: "atrasada",
          rank: 0,
          summary: `Prazo vencido em ${formatDateTime(dueAt)}`
        };
      }

      if (daysLeft === 0) {
        return {
          tone: "danger",
          label: "vence hoje",
          rank: 1,
          summary: `Entrega hoje até ${formatTime(deadline.dueTime)}`
        };
      }

      if (daysLeft === 1) {
        return {
          tone: "warning",
          label: "vence amanhã",
          rank: 2,
          summary: `Falta 1 dia · ${formatDateTime(dueAt)}`
        };
      }

      if (daysLeft <= 3) {
        return {
          tone: "warning",
          label: `${daysLeft} dias`,
          rank: 3,
          summary: `Faltam ${daysLeft} dias · ${formatDateTime(dueAt)}`
        };
      }

      if (daysLeft <= 7) {
        return {
          tone: "accent",
          label: `${daysLeft} dias`,
          rank: 4,
          summary: `Faltam ${daysLeft} dias · ${formatDateTime(dueAt)}`
        };
      }

      return {
        tone: "neutral",
        label: `${daysLeft} dias`,
        rank: 5,
        summary: `Prazo em ${formatDateTime(dueAt)}`
      };
    }

    function getPendingDeadlines() {
      return getSortedDeadlines(false);
    }


function upsertDeadlineFromForm(form) {
  const editingId = state.editingDeadlineId;
  const editing = editingId ? getDeadlineById(editingId) : null;
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  const dueDate = String(formData.get("dueDate") || "").trim();
  const dueTime = String(formData.get("dueTime") || "").trim() || "23:59";
  const type = String(formData.get("type") || "Trabalho").trim() || "Trabalho";
  const subjectCode = String(formData.get("subjectCode") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!title || !dueDate) {
    showToast("Preencha título e data");
    return;
  }

  if (editing) {
    state.deadlines = state.deadlines.map((deadline) => deadline.id === editingId ? {
      ...deadline,
      title,
      type,
      subjectCode: subjectCode || null,
      dueDate,
      dueTime,
      notes,
      updatedAt: new Date().toISOString()
    } : deadline);
    state.editingDeadlineId = null;
    saveState();
    showToast("Entrega atualizada.");
    render();
    return;
  }

  state.deadlines.push({
    id: makeDeadlineId(),
    title,
    type,
    subjectCode: subjectCode || null,
    dueDate,
    dueTime,
    notes,
    createdAt: new Date().toISOString(),
    deliveredAt: null
  });

  saveState();
  showToast("Entrega adicionada ao calendário");
  render();
}

    function markDeadlineDelivered(deadlineId) {
      state.deadlines = state.deadlines.map((deadline) => deadline.id === deadlineId ? {
        ...deadline,
        deliveredAt: toIsoDate(today())
      } : deadline);
      saveState();
      showToast("Entrega marcada como enviada");
      render();
    }

    function reopenDeadline(deadlineId) {
      state.deadlines = state.deadlines.map((deadline) => deadline.id === deadlineId ? {
        ...deadline,
        deliveredAt: null
      } : deadline);
      saveState();
      showToast("Entrega reaberta");
      render();
    }

    function removeDeadline(deadlineId) {
      state.deadlines = state.deadlines.filter((deadline) => deadline.id !== deadlineId);
      if (state.editingDeadlineId === deadlineId) state.editingDeadlineId = null;
      saveState();
      showToast("Entrega removida");
      render();
    }

    function getDeadlineById(deadlineId) {
      return (state.deadlines || []).find((deadline) => deadline.id === deadlineId) || null;
    }

    function startEditDeadline(deadlineId) {
      if (!getDeadlineById(deadlineId)) return;
      state.editingDeadlineId = deadlineId;
      saveState();
      showToast("Entrega carregada para edição.");
      render();
    }

    function cancelEditDeadline() {
      state.editingDeadlineId = null;
      saveState();
      render();
    }

    function renderBackupStatusCard() {
  if (!elements.backupStatusCard) return;
  const summary = getStateSummary(state);
  const backupMeta = sanitizeBackupMeta(state.backupMeta);
  elements.backupStatusCard.innerHTML = `
    <div class="grade-stack">
      <div class="section-head" style="margin-bottom: 6px;">
        <div>
          <h2 style="font-size: clamp(20px, 2.5vw, 26px); margin: 0;">Backup e troca de dispositivo</h2>
          <p>Etapa 1: exporte um JSON antes de trocar de navegador ou dispositivo. Ao importar, agora dá para <strong>substituir</strong> tudo ou <strong>mesclar</strong> com o que já existe.</p>
        </div>
      </div>

      <div class="backup-stat-grid">
        <div class="mini-card">
          <span class="label">Tarefas com histórico</span>
          <strong>${summary.touchedTasks}</strong>
          <div class="mini">Itens de estudo que já receberam início, conclusão, skip ou atraso leve.</div>
        </div>
        <div class="mini-card">
          <span class="label">Entregas</span>
          <strong>${summary.deadlines}</strong>
          <div class="mini">${summary.deliveredDeadlines} já marcadas como enviadas.</div>
        </div>
        <div class="mini-card">
          <span class="label">Notas lançadas</span>
          <strong>${summary.gradeEntries}</strong>
          <div class="mini">Provas, listas, trabalhos e relatórios já cadastrados.</div>
        </div>
        <div class="mini-card">
          <span class="label">Último backup</span>
          <strong>${escapeHtml(formatDateTimeShort(backupMeta.lastExportedAt))}</strong>
          <div class="mini">Última importação: ${escapeHtml(formatDateTimeShort(backupMeta.lastImportedAt))}${backupMeta.lastImportMode ? ` · modo ${backupMeta.lastImportMode === 'merge' ? 'mescla' : 'substituição'}` : ''}</div>
        </div>
      </div>

      <div class="backup-callout">
        <div class="chip-row">
          <span class="chip accent">Versão ${escapeHtml(APP_VERSION)}</span>
          ${backupMeta.lastExportedVersion ? `<span class="chip neutral">Exportado em ${escapeHtml(backupMeta.lastExportedVersion)}</span>` : ''}
          ${backupMeta.lastImportedVersion ? `<span class="chip neutral">Último importado: ${escapeHtml(backupMeta.lastImportedVersion)}</span>` : ''}
        </div>
        <p class="muted" style="margin: 0;">Fluxo recomendado: exportar JSON → guardar em Drive/arquivos → importar no outro dispositivo → escolher mesclar se já houver dados locais.</p>
        <div class="deadline-actions">
          <button class="btn btn-primary" id="backupExportInlineBtn">Exportar backup agora</button>
          <button class="btn btn-ghost" id="backupImportInlineBtn">Selecionar arquivo para importar</button>
        </div>
      </div>
    </div>
  `;
}

function renderImportPreviewCard() {
  if (!elements.importPreviewCard) return;
  if (!pendingImportPackage) {
    elements.importPreviewCard.innerHTML = `
      <div class="grade-stack">
        <h3 class="card-title">Centro de importação</h3>
        <div class="deadline-empty">
          Quando um backup JSON for selecionado, esta área mostra a <strong>prévia</strong> do arquivo e libera dois caminhos: <strong>substituir tudo</strong> ou <strong>mesclar</strong> com os dados atuais.
        </div>
        <ul class="grade-help-list">
          <li><strong>Substituir tudo:</strong> usa o backup como fonte principal e troca o estado atual.</li>
          <li><strong>Mesclar:</strong> junta entregas, notas, logs e histórico de tarefa, reduzindo risco de sobrescrever progresso recente.</li>
          <li><strong>Validação:</strong> o motor mostra versão, data do backup e contagem de itens antes de aplicar a importação.</li>
        </ul>
      </div>
    `;
    return;
  }

  const preview = pendingImportPackage;
  const warning = preview.meta.storageKey && preview.meta.storageKey !== STORAGE_KEY
    ? '<span class="chip warning">Backup veio de outra chave de armazenamento</span>'
    : '<span class="chip success">Compatível com esta base</span>';

  elements.importPreviewCard.innerHTML = `
    <div class="grade-stack">
      <h3 class="card-title">Prévia do backup carregado</h3>
      <div class="chip-row">
        <span class="chip accent">${escapeHtml(preview.meta.appVersion || 'desconhecida')}</span>
        <span class="chip neutral">Schema ${escapeHtml(String(preview.meta.schemaVersion || 1))}</span>
        ${warning}
      </div>

      <div class="backup-stat-grid">
        <div class="mini-card">
          <span class="label">Exportado em</span>
          <strong>${escapeHtml(formatDateTimeShort(preview.meta.exportedAt))}</strong>
          <div class="mini">Arquivo lido com sucesso. A importação ainda não foi aplicada.</div>
        </div>
        <div class="mini-card">
          <span class="label">Histórico de tarefas</span>
          <strong>${preview.summary.touchedTasks}</strong>
          <div class="mini">Tarefas com registro no backup.</div>
        </div>
        <div class="mini-card">
          <span class="label">Entregas</span>
          <strong>${preview.summary.deadlines}</strong>
          <div class="mini">${preview.summary.deliveredDeadlines} já entregues no arquivo.</div>
        </div>
        <div class="mini-card">
          <span class="label">Notas</span>
          <strong>${preview.summary.gradeEntries}</strong>
          <div class="mini">Itens de prova/trabalho/lista no arquivo.</div>
        </div>
      </div>

      <div class="backup-callout">
        <strong>Escolha como aplicar</strong>
        <p class="muted" style="margin: 0;">Use <strong>mesclar</strong> quando já existe progresso neste navegador. Use <strong>substituir tudo</strong> quando o arquivo deve virar a nova base principal.</p>
        <div class="deadline-actions">
          <button class="btn btn-primary" id="backupApplyReplaceBtn">Substituir tudo</button>
          <button class="btn btn-soft" id="backupApplyMergeBtn">Mesclar com o atual</button>
          <button class="btn btn-ghost" id="backupDismissImportBtn">Cancelar</button>
        </div>
      </div>
    </div>
  `;
}

function renderDeadlinesCard(referenceDate) {
      const pending = getPendingDeadlines();
      const urgent = pending.filter((deadline) => getDeadlineStatus(deadline, referenceDate).rank <= 3);
      const spotlight = pending[0] || null;

      if (!pending.length) {
        elements.deadlinesCard.innerHTML = `
          <div class="main-task-header">
            <h3 class="card-title">Entregas e prazos</h3>
            <span class="chip success">sem pendências</span>
          </div>
          <div class="deadline-empty">Nenhuma entrega cadastrada. Use o formulário ao lado para colocar trabalho, lista, relatório ou qualquer envio com data e horário.</div>
        `;
        return;
      }

      const heroStatus = getDeadlineStatus(spotlight, referenceDate);
      const heroSubject = getDeadlineSubject(spotlight);

      elements.deadlinesCard.innerHTML = `
        <div class="main-task-header">
          <h3 class="card-title">Entregas e prazos</h3>
          <div class="chip-row">
            <span class="chip danger">${urgent.length} urgente${urgent.length !== 1 ? 's' : ''}</span>
            <span class="chip neutral">${pending.length} pendente${pending.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div class="deadline-stack">
          <div class="deadline-hero deadline-hero--${heroStatus.tone}">
            <span class="chip ${heroStatus.tone}">${heroStatus.label}</span>
            <h2>${escapeHtml(spotlight.title)}</h2>
            <div class="lede">${escapeHtml(heroStatus.summary)}</div>
            <div class="mini">${heroSubject ? `${escapeHtml(heroSubject.shortName)} · ` : ''}${escapeHtml(spotlight.type)}${spotlight.notes ? ` · ${escapeHtml(spotlight.notes)}` : ''}</div>
            <div class="deadline-actions">
              <button class="btn btn-primary" data-deadline-action="deliver" data-deadline-id="${spotlight.id}">Marcar entregue</button>
              <button class="btn btn-soft" data-deadline-action="edit" data-deadline-id="${spotlight.id}">Editar</button>
              <button class="btn btn-ghost" data-deadline-action="delete" data-deadline-id="${spotlight.id}">Excluir</button>
            </div>
          </div>

          <div class="deadline-grid">
            ${pending.slice(0, 5).map((deadline) => {
              const status = getDeadlineStatus(deadline, referenceDate);
              const subject = getDeadlineSubject(deadline);
              return `
                <article class="deadline-item">
                  <div class="deadline-item-top">
                    <div>
                      <div class="queue-meta" style="margin-bottom: 8px;">
                        <span class="chip ${status.tone}">${escapeHtml(status.label)}</span>
                        <span class="chip neutral">${escapeHtml(deadline.type)}</span>
                        ${subject ? `<span class="chip accent">${escapeHtml(subject.shortName)}</span>` : '<span class="chip neutral">geral</span>'}
                      </div>
                      <h4>${escapeHtml(deadline.title)}</h4>
                      <p>${escapeHtml(status.summary)}</p>
                    </div>
                    <span class="pill">${escapeHtml(formatTime(deadline.dueTime))}</span>
                  </div>
                  <div class="mini">${escapeHtml(formatDateLong(parseDate(deadline.dueDate)))}${deadline.notes ? ` · ${escapeHtml(deadline.notes)}` : ''}</div>
                  <div class="deadline-actions">
                    <button class="btn btn-soft" data-deadline-action="deliver" data-deadline-id="${deadline.id}">Entregue</button>
                    <button class="btn btn-soft" data-deadline-action="edit" data-deadline-id="${deadline.id}">Editar</button>
                    <button class="btn btn-ghost" data-deadline-action="delete" data-deadline-id="${deadline.id}">Excluir</button>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }


function renderDeadlineFormCard(referenceDate) {
  const recent = getSortedDeadlines(true).slice(0, 6);
  const todayIso = toIsoDate(referenceDate);
  const editing = state.editingDeadlineId ? getDeadlineById(state.editingDeadlineId) : null;

  elements.deadlineFormCard.innerHTML = `
    <div class="main-task-header">
      <h3 class="card-title">${editing ? 'Editar entrega' : 'Adicionar entrega'}</h3>
      <span class="chip neutral">entra no calendário mensal</span>
    </div>
    <div class="mini">Cadastre qualquer atividade com prazo fixo. Ela aparece no calendário e no painel com destaque por urgência.${editing ? ' Você está editando um item já salvo.' : ''}</div>

    <form id="deadlineForm" class="deadline-form" style="margin-top: 14px;">
      <label class="field field--full">
        <span>Atividade</span>
        <input type="text" name="title" placeholder="Ex.: Lista 3 de Sólidos" value="${editing ? escapeHtml(editing.title) : ''}" required />
      </label>

      <div class="deadline-form-grid">
        <label class="field">
          <span>Matéria</span>
          <select name="subjectCode">
            <option value="">Geral / fora de disciplina</option>
            ${DATA.subjects.map((subject) => `<option value="${escapeHtml(subject.code)}" ${editing && editing.subjectCode === subject.code ? 'selected' : ''}>${escapeHtml(subject.shortName)} · ${escapeHtml(subject.code)}</option>`).join('')}
          </select>
        </label>

        <label class="field">
          <span>Tipo</span>
          <select name="type">
            ${['Trabalho','Lista','Relatório','Projeto','Outro'].map((type) => `<option value="${type}" ${editing && editing.type === type ? 'selected' : ''}>${type}</option>`).join('')}
          </select>
        </label>

        <label class="field">
          <span>Data de entrega</span>
          <input type="date" name="dueDate" value="${editing ? escapeHtml(editing.dueDate) : todayIso}" required />
        </label>

        <label class="field">
          <span>Horário limite</span>
          <input type="time" name="dueTime" value="${editing ? escapeHtml(editing.dueTime || '23:59') : '23:59'}" />
        </label>
      </div>

      <label class="field field--full">
        <span>Observação</span>
        <input type="text" name="notes" placeholder="Link, professor, plataforma ou detalhe importante" value="${editing ? escapeHtml(editing.notes || '') : ''}" />
      </label>

      <div class="deadline-actions">
        <button class="btn btn-primary" type="submit">${editing ? 'Salvar alteração' : 'Adicionar prazo'}</button>
        ${editing ? '<button type="button" class="btn btn-ghost" id="cancelDeadlineEditBtn">Cancelar edição</button>' : ''}
      </div>
    </form>

    <div class="divider"></div>

    <div class="main-task-header">
      <h3 class="card-title">Últimos prazos cadastrados</h3>
      <span class="chip neutral">${recent.length}</span>
    </div>

    <div class="deadline-list">
      ${recent.length ? recent.map((deadline) => {
        const status = getDeadlineStatus(deadline, referenceDate);
        const subject = getDeadlineSubject(deadline);
        return `
          <article class="deadline-item">
            <div class="deadline-item-top">
              <div>
                <div class="queue-meta" style="margin-bottom: 8px;">
                  <span class="chip ${status.tone}">${escapeHtml(status.label)}</span>
                  <span class="chip neutral">${escapeHtml(deadline.type)}</span>
                  ${subject ? `<span class="chip accent">${escapeHtml(subject.shortName)}</span>` : '<span class="chip neutral">geral</span>'}
                </div>
                <h4>${escapeHtml(deadline.title)}</h4>
                <p>${escapeHtml(status.summary)}</p>
              </div>
              <span class="pill">${escapeHtml(formatTime(deadline.dueTime))}</span>
            </div>
            <div class="deadline-actions">
              ${deadline.deliveredAt
                ? `<button class="btn btn-soft" data-deadline-action="reopen" data-deadline-id="${deadline.id}">Reabrir</button>`
                : `<button class="btn btn-soft" data-deadline-action="deliver" data-deadline-id="${deadline.id}">Entregue</button>`}
              <button class="btn btn-soft" data-deadline-action="edit" data-deadline-id="${deadline.id}">Editar</button>
              <button class="btn btn-ghost" data-deadline-action="delete" data-deadline-id="${deadline.id}">Excluir</button>
            </div>
          </article>
        `;
      }).join('') : '<div class="deadline-empty">Nenhum prazo cadastrado ainda.</div>'}
    </div>
  `;
}

    function getPhase(subject, phaseId) {
      return subject.phases.find((phase) => phase.id === phaseId);
    }

    function getNextExam(subject, referenceDate) {
      const upcoming = subject.phases
        .map((phase) => ({ ...phase, dateObj: parseDate(phase.examDate) }))
        .filter((phase) => phase.dateObj >= referenceDate)
        .sort((a, b) => a.dateObj - b.dateObj);
      return upcoming[0] || null;
    }

    function getCurrentOrNextPhase(subject, referenceDate) {
      const phases = subject.phases.map((phase, index) => ({
        ...phase,
        index,
        startObj: parseDate(phase.start),
        examObj: parseDate(phase.examDate)
      }));

      for (const phase of phases) {
        if (referenceDate >= phase.startObj && referenceDate <= phase.examObj) {
          return phase;
        }
      }

      const future = phases.find((phase) => referenceDate < phase.startObj);
      if (future) return future;

      return phases[phases.length - 1];
    }

    function getDaysSinceLastStudy(subjectCode, referenceDate) {
      const logs = state.logs
        .filter((log) => log.subjectCode === subjectCode)
        .map((log) => parseDate(log.date))
        .sort((a, b) => b - a);
      if (!logs.length) return 999;
      return Math.max(0, daysBetween(logs[0], referenceDate));
    }

    function getRemainingWeight(subject, referenceDate) {
      let total = 0;
      for (const phase of subject.phases) {
        if (parseDate(phase.examDate) >= referenceDate) total += phase.weight;
      }
      for (const extra of subject.extras || []) {
        if (!extra.until || parseDate(extra.until) >= referenceDate) total += extra.weight;
      }
      return clamp(total, 0, 100);
    }

    function getActiveTasksForSubject(subject, referenceDate) {
      const currentPhase = getCurrentOrNextPhase(subject, referenceDate);
      const currentIndex = subject.phases.findIndex((phase) => phase.id === currentPhase.id);

      return DATA.tasks.filter((task) => {
        if (task.subjectCode !== subject.code) return false;
        const taskPhaseIndex = subject.phases.findIndex((phase) => phase.id === task.phaseId);
        if (taskPhaseIndex === -1) return false;

        const phase = subject.phases[taskPhaseIndex];
        const phaseStart = parseDate(phase.start);
        const phaseExam = parseDate(phase.examDate);

        const inWindow = referenceDate >= phaseStart && referenceDate <= phaseExam;
        const carryAfter = task.carryForward && taskPhaseIndex < currentIndex;
        const previewNext = taskPhaseIndex === currentIndex + 1 && daysBetween(referenceDate, phaseStart) <= 6;

        if (inWindow) return true;
        if (carryAfter) return true;
        if (previewNext) return true;
        if (currentIndex === subject.phases.length - 1 && taskPhaseIndex === currentIndex) return true;

        return false;
      });
    }

    function getPendingTasksForSubject(subject, referenceDate) {
      return getActiveTasksForSubject(subject, referenceDate).filter((task) => !isDone(task.id));
    }

    function getProgress(subject, referenceDate) {
      const visibleTasks = getActiveTasksForSubject(subject, referenceDate);
      if (!visibleTasks.length) return 0;
      const done = visibleTasks.filter((task) => isDone(task.id)).length;
      return Math.round((done / visibleTasks.length) * 100);
    }

    function subjectScore(subject, referenceDate) {
      const pendingTasks = getPendingTasksForSubject(subject, referenceDate);
      const currentPhase = getCurrentOrNextPhase(subject, referenceDate);
      const nextExam = getNextExam(subject, referenceDate);
      const remainingWeight = getRemainingWeight(subject, referenceDate);
      const stalenessDays = getDaysSinceLastStudy(subject.code, referenceDate);
      const carryover = pendingTasks.some((task) => {
        const meta = getTaskMeta(task.id);
        return meta.startedCount > 0 || meta.skipCount > 0 || meta.lightDelayCount > 0;
      });

      const examUrgency = nextExam ? clamp((45 - daysBetween(referenceDate, parseDate(nextExam.examDate))) / 45, 0, 1) : 0.12;
      const pendingRatio = pendingTasks.length
        ? clamp(pendingTasks.reduce((acc, task) => acc + (task.core ? 1.2 : 0.8), 0) / Math.max(1, getActiveTasksForSubject(subject, referenceDate).length), 0, 1.4)
        : 0;
      const remainingWeightScore = clamp(remainingWeight / 100, 0, 1);
      const stalenessScore = clamp(stalenessDays / 10, 0, 1);
      const phaseBoost = currentPhase.id === "P1" ? 0.06 : currentPhase.id === "P2" ? 0.1 : 0.15;
      const extraRisk = (subject.extras || []).length ? 0.08 : 0;

      return (
        examUrgency * 0.36 +
        pendingRatio * 0.24 +
        remainingWeightScore * 0.16 +
        stalenessScore * 0.12 +
        subject.baseRisk * 0.10 +
        phaseBoost +
        extraRisk +
        (carryover ? 0.12 : 0)
      );
    }

    function taskScore(task, subject, referenceDate) {
      const phase = getPhase(subject, task.phaseId);
      const daysToPhaseExam = daysBetween(referenceDate, parseDate(phase.examDate));
      const meta = getTaskMeta(task.id);
      const startedBoost = meta.startedCount > 0 ? 0.18 : 0;
      const skipBoost = meta.skipCount > 0 ? 0.12 : 0;
      const lightDelayBoost = clamp((meta.lightDelayCount || 0) * 0.07, 0, 0.18);
      const coreBoost = task.core ? 0.28 : 0.12;
      const recurrenceBoost = task.recurring ? 0.16 : 0.06;
      const priorityBoost = task.priorityBase / 20;
      const urgencyBoost = clamp((30 - daysToPhaseExam) / 30, 0, 1) * 0.22;
      const durationPenalty = getTaskMinutes(task) > 50 && state.mode === "exausto" ? 0.18 : 0;

      return coreBoost + recurrenceBoost + priorityBoost + urgencyBoost + startedBoost + skipBoost + lightDelayBoost - durationPenalty;
    }

    function getRiskLabel(score) {
      if (score >= 1.35) return { label: "Crítica", tone: "danger" };
      if (score >= 1.05) return { label: "Alta", tone: "warning" };
      if (score >= 0.78) return { label: "Média", tone: "accent" };
      return { label: "Baixa", tone: "success" };
    }

    function getTaskMinutes(task) {
      const mode = state.mode;
      const meta = getTaskMeta(task.id);
      const shouldShrink = mode === "exausto" || mode === "m30" || meta.skipCount >= 2;
      if (mode === "foco") return task.minutes.foco || task.minutes.normal;
      if (mode === "exausto") return task.minutes.exausto || Math.round(task.minutes.normal * 0.5);
      if (mode === "m30") return task.minutes.m30 || 30;
      if (shouldShrink) return task.minutes.exausto || Math.round(task.minutes.normal * 0.5);
      return task.minutes.normal;
    }

    function getTaskText(task) {
      const meta = getTaskMeta(task.id);
      const shrink = state.mode === "exausto" || state.mode === "m30" || meta.skipCount >= 2;
      return shrink ? task.micro : task.exact;
    }

    function getTaskSteps(task) {
      const meta = getTaskMeta(task.id);
      const shrink = state.mode === "exausto" || state.mode === "m30" || meta.skipCount >= 2;
      if (!shrink) return task.steps;
      return task.steps.slice(0, Math.min(3, task.steps.length));
    }

    function getReasonChips(task, subject, referenceDate) {
      const reasons = [];
      const phase = getPhase(subject, task.phaseId);
      const daysToExam = daysBetween(referenceDate, parseDate(phase.examDate));
      const remainingWeight = getRemainingWeight(subject, referenceDate);
      const stalenessDays = getDaysSinceLastStudy(subject.code, referenceDate);
      const meta = getTaskMeta(task.id);

      reasons.push(`fase ${task.phaseId}`);
      if (daysToExam >= 0) reasons.push(`prova em ${daysToExam} ${daysToExam === 1 ? "dia" : "dias"}`);
      if (remainingWeight > 0) reasons.push(`${Math.round(remainingWeight)}% do semestre ainda pendente`);
      if (task.core) reasons.push("conteúdo CORE");
      if (task.recurring) reasons.push("padrão recorrente");
      if (meta.lightDelayCount > 0) reasons.push(`${meta.lightDelayCount} dia${meta.lightDelayCount > 1 ? "s" : ""} sem registro`);
      if (stalenessDays >= 6 && stalenessDays < 999) reasons.push(`sem prática há ${stalenessDays} dias`);
      if (stalenessDays >= 999) reasons.push("sem registro recente");
      if (meta.startedCount > 0 || meta.skipCount > 0) reasons.push("já existe débito aberto");

      return reasons.slice(0, 4);
    }

    function pickBestSubject(referenceDate) {
      const sorted = DATA.subjects
        .map((subject) => ({ subject, score: subjectScore(subject, referenceDate) }))
        .sort((a, b) => b.score - a.score);
      return sorted[0];
    }

    function getSortedTasksForSubject(subject, referenceDate) {
      return getPendingTasksForSubject(subject, referenceDate)
        .sort((a, b) => taskScore(b, subject, referenceDate) - taskScore(a, subject, referenceDate));
    }

    function selectMainTask(referenceDate, ignorePinned = false) {
      if (!ignorePinned && state.pinnedTaskId) {
        const pinnedTask = getTask(state.pinnedTaskId);
        if (pinnedTask && !isDone(pinnedTask.id)) {
          const pinnedSubject = getSubject(pinnedTask.subjectCode);
          const isActive = getActiveTasksForSubject(pinnedSubject, referenceDate).some((task) => task.id === pinnedTask.id);
          if (isActive) return { subject: pinnedSubject, task: pinnedTask, pinned: true };
        }
      }

      const best = pickBestSubject(referenceDate);
      const bestTasks = getSortedTasksForSubject(best.subject, referenceDate);
      const task = bestTasks[0] || null;
      if (!task) return null;
      return { subject: best.subject, task, pinned: false };
    }

    function buildTodayQueue(referenceDate, ignorePinned = false) {
      const main = selectMainTask(referenceDate, ignorePinned);
      if (!main) return [];

      const queue = [{ task: main.task, subject: main.subject, slot: "Agora" }];

      const pushIfValid = (task, subject, slot) => {
        if (!task) return;
        if (queue.some((item) => item.task.id === task.id)) return;
        queue.push({ task, subject, slot });
      };

      const subjectTasks = getSortedTasksForSubject(main.subject, referenceDate)
        .filter((task) => task.id !== main.task.id);

      const subjectGap = getNextExam(main.subject, referenceDate)
        ? daysBetween(referenceDate, parseDate(getNextExam(main.subject, referenceDate).examDate))
        : 999;

      if (state.mode === "foco") {
        pushIfValid(subjectTasks[0], main.subject, "Depois");
        return queue.filter(Boolean).slice(0, 2);
      }

      if (state.mode === "exausto" || state.mode === "m30") {
        return queue;
      }

      if (subjectGap <= 14) {
        pushIfValid(subjectTasks[0], main.subject, "Depois");
      } else {
        const secondBest = DATA.subjects
          .filter((subject) => subject.code !== main.subject.code)
          .map((subject) => ({ subject, score: subjectScore(subject, referenceDate) }))
          .sort((a, b) => b.score - a.score)[0];

        if (secondBest) {
          const secondTask = getSortedTasksForSubject(secondBest.subject, referenceDate)[0];
          pushIfValid(secondTask, secondBest.subject, "Depois");
        } else {
          pushIfValid(subjectTasks[0], main.subject, "Depois");
        }
      }

      pushIfValid(subjectTasks[0], main.subject, queue.length === 1 ? "Depois" : "Reserva");

      if (queue.length < 3) {
        const fallback = DATA.subjects
          .filter((subject) => subject.code !== main.subject.code)
          .map((subject) => ({ subject, task: getSortedTasksForSubject(subject, referenceDate)[0] }))
          .find((pair) => pair.task && !queue.some((item) => item.task.id === pair.task.id));
        if (fallback) pushIfValid(fallback.task, fallback.subject, "Reserva");
      }

      return queue.slice(0, 3);
    }

    function getTotalRecentHours(referenceDate) {
      const cutoff = new Date(referenceDate);
      cutoff.setDate(referenceDate.getDate() - 6);
      const minutes = state.logs
        .filter((log) => parseDate(log.date) >= cutoff)
        .reduce((acc, log) => acc + (Number(log.minutes) || 0), 0);
      return minutes / 60;
    }

    function modeLabel() {
      return MODE_SHORT_LABELS[state.mode] || MODE_SHORT_LABELS.normal || "Normal";
    }

    function getSessionLabel(taskId) {
      if (!state.activeSession || state.activeSession.taskId !== taskId) return null;
      const startedAt = new Date(state.activeSession.startedAt);
      const minutes = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000));
      return `Em andamento · ${minutes} min`;
    }

    function completeTask(taskId) {
      const task = getTask(taskId);
      if (!task) return;
      const subject = getSubject(task.subjectCode);

      let minutes = getTaskMinutes(task);
      if (state.activeSession && state.activeSession.taskId === taskId) {
        const startedAt = new Date(state.activeSession.startedAt);
        minutes = Math.max(5, Math.round((Date.now() - startedAt.getTime()) / 60000));
        state.activeSession = null;
      }

      setTaskMeta(taskId, {
        done: true,
        completedAt: toIsoDate(today()),
        lastTouched: toIsoDate(today()),
        skipCount: 0,
        lightDelayCount: 0,
        lastLightDelayAt: null
      });

      state.logs.push({
        taskId,
        subjectCode: subject.code,
        minutes,
        date: toIsoDate(today())
      });

      if (state.pinnedTaskId === taskId) {
        state.pinnedTaskId = null;
      }

      saveState();
      showToast(`Concluído · ${subject.shortName} · +${minutes} min`);
      render();
    }

    function startTask(taskId) {
      const task = getTask(taskId);
      if (!task) return;
      const meta = getTaskMeta(taskId);
      setTaskMeta(taskId, {
        startedCount: (meta.startedCount || 0) + 1,
        lastTouched: toIsoDate(today()),
        lightDelayCount: 0,
        lastLightDelayAt: null
      });
      state.activeSession = {
        taskId,
        startedAt: new Date().toISOString()
      };
      state.pinnedTaskId = taskId;
      saveState();
      showToast("Sessão iniciada");
      render();
    }

    function skipTask(taskId) {
      const task = getTask(taskId);
      if (!task) return;
      const meta = getTaskMeta(taskId);
      setTaskMeta(taskId, {
        skipCount: (meta.skipCount || 0) + 1,
        lastTouched: toIsoDate(today()),
        lightDelayCount: 0,
        lastLightDelayAt: null
      });
      if (state.activeSession && state.activeSession.taskId === taskId) {
        state.activeSession = null;
      }
      state.pinnedTaskId = taskId;
      saveState();
      showToast("Sem culpa: a tarefa volta ajustada");
      render();
    }

    function recalcPlan() {
      state.pinnedTaskId = null;
      state.activeSession = null;
      saveState();
      showToast("Plano recalculado");
      render(true);
    }

    function nextTaskSameSubject(taskId) {
      const task = getTask(taskId);
      if (!task) return;
      const subject = getSubject(task.subjectCode);
      const sorted = getSortedTasksForSubject(subject, today())
        .filter((candidate) => candidate.id !== taskId);
      const nextTask = sorted[0];
      if (!nextTask) {
        showToast("Não há próxima tarefa útil da mesma matéria agora");
        return;
      }
      state.pinnedTaskId = nextTask.id;
      state.pinnedSubjectCode = subject.code;
      saveState();
      showToast(`Próxima da mesma matéria: ${subject.shortName}`);
      render();
    }

    function showToast(message) {
      elements.toast.textContent = message;
      elements.toast.classList.add("show");
      clearTimeout(showToast._timer);
      showToast._timer = setTimeout(() => {
        elements.toast.classList.remove("show");
      }, 2000);
    }

    function getPendingCount(referenceDate) {
      return DATA.subjects.reduce((acc, subject) => acc + getPendingTasksForSubject(subject, referenceDate).length, 0);
    }

    function describeNoFinish(task, subject, referenceDate) {
      const meta = getTaskMeta(task.id);
      const microMinutes = task.minutes.exausto || Math.round(task.minutes.normal * 0.5);
      const nextExam = getNextExam(subject, referenceDate);
      const days = nextExam ? daysBetween(referenceDate, parseDate(nextExam.examDate)) : null;

      if (meta.skipCount >= 1) {
        return `Amanhã esta tarefa volta no topo em versão menor (${microMinutes} min). A fila encolhe para impedir acúmulo artificial e a prioridade da matéria continua alta.`;
      }

      if (days !== null && days <= 14) {
        return `Nada de reorganizar tudo manualmente: se você não fechar hoje, esta mesma tarefa continua no topo amanhã. Como a prova está perto, a prioridade não cai. Se nem houver registro no dia, entra só um atraso leve, sem contar como skip cheio.`;
      }

      return `Se não concluir hoje, o sistema mantém a mesma tarefa no topo amanhã. Se você simplesmente sumir no dia, ele aplica apenas um atraso leve e mantém o débito visível sem inflar culpa artificial.`;
    }

    function formatHours(hours) {
      if (!hours) return "0 h";
      return `${hours.toFixed(1).replace(".", ",")} h`;
    }

    function themeButtonLabel() {
      return THEME_API.themeButtonLabel(getResolvedTheme());
    }

    function getResolvedTheme() {
      return THEME_API.getResolvedTheme(state.theme);
    }

    function applyTheme() {
      return THEME_API.applyTheme({ theme: state.theme, themeToggle: elements.themeToggle });
    }

    function toggleTheme() {
      state.theme = THEME_API.nextThemeValue(getResolvedTheme());
      saveState();
      applyTheme();
    }

    function updatePageHeader(pageKey, referenceDate) {
      const fallbackMeta = pageKey === "work"
        ? {
            eyebrow: "Trabalho",
            title: "Planner executivo de FIPs",
            subtitle: "Tarefas gerais e por empresa, com semana, atrasados e dependencias em destaque."
          }
        : pageKey === "news"
          ? {
              eyebrow: "Notícias",
              title: "Mercado em tempo quase real",
              subtitle: "Fluxo contínuo de manchetes com caixa de entrada para novidades."
            }
        : pageKey === "home"
          ? {
              eyebrow: "Painel principal",
              title: "Overview de estudos e trabalho",
              subtitle: "Visao consolidada do que importa hoje e nesta semana."
            }
          : pageKey === "studies"
            ? {
                eyebrow: "Estudos",
                title: "Motor de estudos",
                subtitle: "Fluxo academico completo em uma area propria."
              }
            : PAGE_META.dashboard || { eyebrow: "", title: "", subtitle: "" };
      const meta = PAGE_META[pageKey] || fallbackMeta;
      if (elements.pageEyebrow) elements.pageEyebrow.textContent = meta.eyebrow;
      if (elements.pageTitle) elements.pageTitle.textContent = meta.title;
      if (elements.pageSubtitle) elements.pageSubtitle.textContent = meta.subtitle;
      if (elements.pageDateTxt) elements.pageDateTxt.textContent = formatHeaderDate(referenceDate);
    }

    function syncModeControls() {
      if (elements.modeSelect && elements.modeSelect.value !== state.mode) {
        elements.modeSelect.value = state.mode;
      }
      if (elements.modeSelect) {
        elements.modeSelect.dataset.modeActive = state.mode && state.mode !== "normal" ? "true" : "false";
      }
      if (elements.pageModeTxt) {
        elements.pageModeTxt.textContent = MODE_LABELS[state.mode] || MODE_LABELS.normal || "Modo Normal";
      }
    }

    function updateCollapseCounts() {
      if (elements.deadlinesCount && elements.deadlinesCard) {
        const count = elements.deadlinesCard.querySelectorAll(".deadline-item").length;
        elements.deadlinesCount.textContent = count === 0 ? "nenhum" : String(count);
      }
      if (elements.subjectsCount && elements.subjectGrid) {
        const count = elements.subjectGrid.querySelectorAll(".subject-card").length;
        elements.subjectsCount.textContent = count === 0 ? "—" : String(count);
      }
    }


    function normalizeKey(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    function formatScore(value) {
      return Number(value).toFixed(2).replace(".", ",");
    }

    function formatWeight(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "0%";
      const clean = Math.abs(numeric - Math.round(numeric)) < 0.01 ? String(Math.round(numeric)) : numeric.toFixed(2).replace(".", ",");
      return `${clean}%`;
    }


    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    const STUDY_SECTIONS = ["dashboard", "week", "fc", "calendar", "grades"];
const PRIMARY_PAGES = ["home", "studies", "news", "work"];
    let routeHashLock = false;

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

    function getPrimaryPage() {
      return normalizePrimaryPage(state.currentPage);
    }

    function getStudySection() {
      return normalizeStudySection(state.studySection, state.currentPage);
    }

    function buildRouteHash(primaryPage = getPrimaryPage(), studySection = getStudySection()) {
      if (primaryPage === "studies") return `#studies/${normalizeStudySection(studySection, "dashboard")}`;
      return `#${normalizePrimaryPage(primaryPage)}`;
    }

    function syncHashFromState(options = {}) {
      const nextHash = buildRouteHash();
      if (window.location.hash === nextHash) return;
      routeHashLock = true;
      if (options.replace) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
      } else {
        window.location.hash = nextHash;
      }
      window.setTimeout(() => {
        routeHashLock = false;
      }, 0);
    }

    function applyRouteFromHash() {
      const raw = String(window.location.hash || "").replace(/^#/, "").trim();
      if (!raw) return false;
      const [primary, section] = raw.split("/");
      if (primary === "studies") {
        state.currentPage = "studies";
        state.studySection = normalizeStudySection(section, "dashboard");
        return true;
      }
      if (PRIMARY_PAGES.includes(primary)) {
        state.currentPage = primary;
        return true;
      }
      return false;
    }

    function renderHomeList(items, emptyText) {
      if (!items.length) return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
      return `<div class="home-list">${items.map((item) => `
        <div class="home-list-item">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.meta || "")}</span>
        </div>
      `).join("")}</div>`;
    }

    function renderHomeKpiGrid(items) {
      return `<div class="home-kpi-grid">${items.map((item) => `
        <div class="home-kpi">
          <span class="home-kpi-label">${escapeHtml(item.label)}</span>
          <strong class="home-kpi-value">${escapeHtml(String(item.value))}</strong>
          <span class="home-kpi-subvalue">${escapeHtml(item.subvalue || "")}</span>
        </div>
      `).join("")}</div>`;
    }

    function renderHomeSectionMetrics(items) {
      return `<div class="home-section-metrics">${items.map((item) => `
        <div class="home-section-metric">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(String(item.value))}</strong>
        </div>
      `).join("")}</div>`;
    }

    function formatWorkTaskMeta(task, todayIso) {
      if (!task) return "";
      const WD = window.WorkDomain;
      const company = task.scope === "company" && WD ? WD.companyName(task.companyId) : "Geral";
      const due = task.dueDate ? (task.dueDate < todayIso ? `atrasada desde ${task.dueDate}` : task.dueDate === todayIso ? "vence hoje" : `prazo ${task.dueDate}`) : "sem prazo";
      const next = task.nextAction ? ` · ${task.nextAction}` : "";
      return `${company} · ${due}${next}`;
    }

    function getStudyDeadlineItems(referenceDate) {
      return (state.deadlines || [])
        .filter((deadline) => deadline && !deadline.deliveredAt && deadline.dueDate)
        .map((deadline) => {
          const due = parseDate(deadline.dueDate);
          const days = daysBetween(referenceDate, due);
          return {
            title: deadline.title || "Entrega",
            meta: `${deadline.subjectCode || deadline.type || "Estudo"} · ${days < 0 ? "atrasada" : days === 0 ? "vence hoje" : `em ${days} dia${days === 1 ? "" : "s"}`}`,
            dueDate: deadline.dueDate,
            rank: days < 0 ? -10 + days : days
          };
        })
        .sort((a, b) => a.rank - b.rank);
    }

    function renderHomeDashboard(plan, queue, referenceDate) {
      const WD = window.WorkDomain;
      const todayIso = toIsoDate(referenceDate);
      const weekAnchor = state.workWeekAnchor || todayIso;
      const buckets = WD ? WD.dashboardBuckets(state.workTasks || [], todayIso, weekAnchor) : { today: [], overdue: [], waiting: [], critical: [], companies: [] };
      const studyFocus = plan ? `${plan.subject.shortName}: ${plan.task.title}` : "Sem tarefa academica pendente";
      const workFocus = buckets.overdue[0] || buckets.today[0] || buckets.critical[0] || null;
      const studyQueueItems = (queue || []).slice(0, 4).map((item) => ({
        title: `${item.subject.shortName}: ${item.task.title}`,
        meta: `${getTaskMinutes(item.task)} min | estudo`
      }));
      const workTodayItems = (buckets.today || []).slice(0, 5).map((task) => ({ title: task.title, meta: formatWorkTaskMeta(task, todayIso) }));
      const overdueItems = (buckets.overdue || []).slice(0, 6).map((task) => ({ title: task.title, meta: formatWorkTaskMeta(task, todayIso) }));
      const waitingItems = (buckets.waiting || []).slice(0, 6).map((task) => ({ title: task.title, meta: task.nextAction || "Aguardando retorno" }));
      const studyDeadlines = getStudyDeadlineItems(referenceDate).slice(0, 4);
      const workDeadlines = (buckets.critical || []).slice(0, 5).map((task) => ({ title: task.title, meta: formatWorkTaskMeta(task, todayIso), dueDate: task.dueDate || "9999-12-31" }));
      const criticalItems = [...studyDeadlines, ...workDeadlines]
        .sort((a, b) => String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31")))
        .slice(0, 7);
      const companyItems = (buckets.companies || []).map((summary) => ({
        title: summary.company.name,
        meta: `${summary.openCount} abertas | ${summary.weekCount} na semana | ${summary.overdueCount} atrasadas | ${summary.waitingCount} aguardando`,
        id: summary.company.id
      }));
      const studyOverviewItems = [...studyQueueItems, ...studyDeadlines].slice(0, 5);
      const workOverviewItems = [...overdueItems, ...workTodayItems].slice(0, 5);
      const nextCritical = criticalItems[0] || null;
      const nextCompany = companyItems[0] || null;
      const companyOptions = WD ? WD.COMPANIES.map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`).join("") : "";
      const priorityOptions = WD ? WD.PRIORITIES.map((priority) => `<option value="${priority.value}"${priority.value === "medium" ? " selected" : ""}>${escapeHtml(priority.label)}</option>`).join("") : "";

      if (elements.homeTodayCard) {
        const heroMetrics = [
          { label: "Fila de estudo", value: studyQueueItems.length, subvalue: studyQueueItems.length ? "tarefas na fila curta" : "sem fila ativa" },
          { label: "Prazos de estudo", value: studyDeadlines.length, subvalue: studyDeadlines.length ? "entregas abertas" : "sem entrega aberta" },
          { label: "Trabalho hoje", value: workTodayItems.length, subvalue: workTodayItems.length ? "itens acionaveis" : "sem foco critico" },
          { label: "Aguardando", value: waitingItems.length, subvalue: waitingItems.length ? "dependencias externas" : "caixa limpa" }
        ];
        elements.homeTodayCard.innerHTML = `
          <div class="home-hero">
            <div class="home-hero-top">
              <div class="home-hero-copy">
                <span class="home-hero-eyebrow">Painel do dia</span>
                <h3>Hoje voce precisa manter estudo em movimento e trabalho fora do vermelho.</h3>
                <p>Entrada unica para decidir rapido o que merece foco agora, sem misturar fila academica com demandas do portfolio.</p>
              </div>
              <span class="chip accent">${formatDate(referenceDate)}</span>
            </div>
            <div class="home-hero-grid">
              <div class="home-focus-item" data-tone="study">
                <span>Estudos</span>
                <strong>${escapeHtml(studyFocus)}</strong>
                <small>${studyDeadlines.length ? `${studyDeadlines.length} prazo${studyDeadlines.length === 1 ? "" : "s"} aberto${studyDeadlines.length === 1 ? "" : "s"} nesta janela.` : "Sem entrega academica critica agora."}</small>
              </div>
              <div class="home-focus-item" data-tone="work">
                <span>Trabalho</span>
                <strong>${workFocus ? escapeHtml(workFocus.title) : "Sem foco critico de trabalho"}</strong>
                <small>${workFocus ? escapeHtml(workFocus.nextAction || formatWorkTaskMeta(workFocus, todayIso)) : "Capture ou planeje a proxima acao executiva."}</small>
              </div>
            </div>
            ${renderHomeKpiGrid(heroMetrics)}
            <div class="home-actions-row">
              <button class="btn btn-primary" type="button" data-home-open-studies>Entrar em estudos</button>
              <button class="btn btn-soft" type="button" data-open-work>Abrir trabalho</button>
            </div>
          </div>
        `;
      }
      if (elements.homeWeekCard) {
        const studyMetrics = [
          { label: "Fila", value: studyQueueItems.length },
          { label: "Entregas", value: studyDeadlines.length },
          { label: "Critico", value: nextCritical && nextCritical.title ? nextCritical.title.slice(0, 18) : "estavel" }
        ];
        elements.homeWeekCard.innerHTML = `
          <div class="home-section-stack">
            <div class="home-card-header">
              <div class="home-section-copy">
                <span class="home-section-eyebrow">Estudos</span>
                <h3>Visao academica</h3>
                <p>Fila, entregas e o proximo ponto de tensao do semestre.</p>
              </div>
              <span class="chip neutral">${studyOverviewItems.length} itens</span>
            </div>
            ${renderHomeSectionMetrics(studyMetrics)}
            ${renderHomeList(studyOverviewItems, "Sem demanda academica urgente agora.")}
            <div class="home-actions-row"><button class="btn btn-soft" type="button" data-home-open-studies>Ir para estudos</button></div>
          </div>`;
      }
      if (elements.homeOverdueCard) {
        const workMetrics = [
          { label: "Hoje", value: workTodayItems.length },
          { label: "Atrasadas", value: overdueItems.length },
          { label: "Empresa", value: nextCompany ? nextCompany.title : "geral" }
        ];
        elements.homeOverdueCard.innerHTML = `
          <div class="home-section-stack">
            <div class="home-card-header">
              <div class="home-section-copy">
                <span class="home-section-eyebrow">Trabalho</span>
                <h3>Visao executiva</h3>
                <p>O que ja deveria ter andado, o que cabe hoje e onde voce precisa destravar.</p>
              </div>
              <span class="chip danger">${overdueItems.length}</span>
            </div>
            ${renderHomeSectionMetrics(workMetrics)}
            ${renderHomeList(workOverviewItems, "Sem tarefa executiva critica agora.")}
            <div class="home-actions-row"><button class="btn btn-soft" type="button" data-open-work>Abrir trabalho</button></div>
          </div>`;
      }
      if (elements.homeWaitingCard) elements.homeWaitingCard.innerHTML = `<div class="home-card-header"><div class="home-section-copy"><span class="home-section-eyebrow">Dependencias</span><h3>Aguardando terceiros</h3><p>Itens que nao podem sumir do radar enquanto outra ponta responde.</p></div><span class="chip warning">${waitingItems.length}</span></div>${renderHomeList(waitingItems, "Nenhum item aguardando terceiros.")}`;
      if (elements.homeDeadlinesCard) elements.homeDeadlinesCard.innerHTML = `<div class="home-card-header"><div class="home-section-copy"><span class="home-section-eyebrow">Agenda</span><h3>Prazos criticos</h3><p>Entregas e vencimentos que pressionam a semana atual.</p></div><span class="chip accent">${criticalItems.length}</span></div>${renderHomeList(criticalItems, "Sem prazo critico nesta semana.")}`;
      if (elements.homeCompaniesCard) {
        elements.homeCompaniesCard.innerHTML = `<div class="home-card-header"><div class="home-section-copy"><span class="home-section-eyebrow">Portfolio</span><h3>Empresas em foco</h3><p>Entrada rapida para filtrar o trabalho por empresa investida.</p></div><span class="chip neutral">${companyItems.length} empresas</span></div><div class="home-company-list">${companyItems.map((item) => `<button type="button" class="home-company-row" data-home-work-filter="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></button>`).join("")}</div>`;
      }
      if (elements.homeQuickCaptureCard) {
        elements.homeQuickCaptureCard.innerHTML = `
          <div class="home-card-header"><div class="home-section-copy"><span class="home-section-eyebrow">Atalho</span><h3>Captura rapida</h3><p>Transforme demanda solta em proxima acao objetiva sem sair da home.</p></div><span class="chip accent">trabalho</span></div>
          <form id="homeQuickCaptureForm" class="home-quick-form">
            <input type="text" name="title" maxlength="180" placeholder="Titulo da tarefa" required />
            <input type="text" name="nextAction" maxlength="220" placeholder="Proxima acao objetiva" />
            <select name="companyId" aria-label="Empresa"><option value="">Geral</option>${companyOptions}</select>
            <select name="target" aria-label="Destino"><option value="inbox">Inbox</option><option value="today">Hoje</option></select>
            <input type="date" name="dueDate" aria-label="Prazo real" />
            <select name="priority" aria-label="Prioridade">${priorityOptions}</select>
            <button type="submit" class="btn btn-primary">Capturar</button>
          </form>`;
      }
    }

    function renderPageVisibility(referenceDate) {
      const currentPage = getPrimaryPage();
      const studySection = getStudySection();
      const onHome = currentPage === "home";
      const onStudies = currentPage === "studies";
      const onWork = currentPage === "work";
      const onNews = currentPage === "news";
      const onStudyDashboard = onStudies && studySection === "dashboard";
      const onWeek = onStudies && studySection === "week";
      const onFc = onStudies && studySection === "fc";
      const onCalendar = onStudies && studySection === "calendar";
      const onGrades = onStudies && studySection === "grades";

      if (elements.homePage) elements.homePage.hidden = !onHome;
      if (elements.newsPage) elements.newsPage.hidden = !onNews;
      if (elements.studyNavBar) elements.studyNavBar.hidden = !onStudies;
      if (elements.workPage) elements.workPage.hidden = !onWork;
      if (elements.dashboardPage) elements.dashboardPage.hidden = !onStudyDashboard;
      if (elements.dashboardPage) elements.dashboardPage.dataset.focusMode = onStudyDashboard && state.dashboardFocusMode ? "true" : "false";
      if (elements.weekPage) elements.weekPage.hidden = !onWeek;
      if (elements.fcPage) elements.fcPage.hidden = !onFc;
      if (elements.calendarPage) elements.calendarPage.hidden = !onCalendar;
      if (elements.gradesPage) elements.gradesPage.hidden = !onGrades;
      elements.navButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.navPage === currentPage);
      });
      elements.studyNavButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.studyPage === studySection);
        button.setAttribute("aria-selected", button.dataset.studyPage === studySection ? "true" : "false");
      });
      updatePageHeader(onStudies ? studySection : currentPage, referenceDate);

      if (!onStudyDashboard && elements.mobileFocusbar) {
        elements.mobileFocusbar.innerHTML = "";
        elements.mobileFocusbar.setAttribute("hidden", "");
      }
    }

    function openPage(page) {
      if (STUDY_SECTIONS.includes(page)) {
        state.currentPage = "studies";
        state.studySection = page;
      } else if (PRIMARY_PAGES.includes(page)) {
        state.currentPage = page;
        if (page === "studies") state.studySection = getStudySection();
      } else {
        state.currentPage = "home";
      }
      saveState();
      render();
      syncHashFromState();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openStudySection(section) {
      state.currentPage = "studies";
      state.studySection = normalizeStudySection(section, "dashboard");
      saveState();
      render();
      syncHashFromState();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function setStudyMode(mode) {
      state.mode = ["normal", "exausto", "m30", "foco"].includes(mode) ? mode : "normal";
      saveState();
      render();
    }

    function shiftCalendarMonth(referenceDate, delta) {
      const currentMonth = startOfMonth(referenceDate);
      const nextMonth = addMonths(getCalendarAnchorDate(referenceDate), delta);
      const safeMonth = nextMonth < currentMonth ? currentMonth : nextMonth;
      setCalendarAnchorDate(safeMonth);
      state.currentPage = "studies";
      state.studySection = "calendar";
      saveState();
      render();
    }

    function resetCalendarMonth(referenceDate) {
      setCalendarAnchorDate(startOfMonth(referenceDate));
      state.currentPage = "studies";
      state.studySection = "calendar";
      saveState();
      render();
    }


function safeRenderStep(label, fn) {
      try {
        fn();
      } catch (error) {
        console.error(`[render] ${label}`, error);
        showCompatHint(`Falha ao renderizar ${label}. Veja o console do navegador para detalhes.`);
      }
    }


    function render(ignorePinned = false) {
      const referenceDate = today();
      applyLightDelayForMissedDays(referenceDate);
      if (!state.calendarMonthAnchor) setCalendarAnchorDate(startOfMonth(referenceDate), { persist: false });
      renderPageVisibility(referenceDate);
      syncModeControls();
      let plan = null;
      let queue = [];

      safeRenderStep("planejamento principal", () => {
        plan = selectMainTask(referenceDate, ignorePinned);
        queue = buildTodayQueue(referenceDate, ignorePinned);
      });

      const primaryPage = getPrimaryPage();
      const studySection = getStudySection();

      if (primaryPage === "home") {
        safeRenderStep("tela principal", () => renderHomeDashboard(plan, queue, referenceDate));
        safeRenderStep("contadores", () => updateCollapseCounts());
        if (elements.mobileFocusbar) {
          elements.mobileFocusbar.innerHTML = "";
          elements.mobileFocusbar.setAttribute("hidden", "");
        }
        return;
      }

      if (primaryPage === "work") {
        safeRenderStep("trabalho", () => {
          if (window.WorkPlanner && typeof window.WorkPlanner.render === "function") window.WorkPlanner.render();
        });
        safeRenderStep("contadores", () => updateCollapseCounts());
        if (elements.mobileFocusbar) {
          elements.mobileFocusbar.innerHTML = "";
          elements.mobileFocusbar.setAttribute("hidden", "");
        }
        return;
      }

      if (primaryPage === "news") {
        safeRenderStep("notícias", () => {
          if (window.NewsFeed && typeof window.NewsFeed.render === "function") window.NewsFeed.render();
        });
        safeRenderStep("contadores", () => updateCollapseCounts());
        if (elements.mobileFocusbar) {
          elements.mobileFocusbar.innerHTML = "";
          elements.mobileFocusbar.setAttribute("hidden", "");
        }
        return;
      }

      const previousRenderPage = state.currentPage;
      state.currentPage = studySection;
      if (studySection !== "dashboard") plan = null;

      if (state.currentPage === "dashboard") {
        safeRenderStep("card principal", () => renderMainTask(plan, referenceDate));
        safeRenderStep("resumo executivo", () => renderExecutiveSummary(plan, referenceDate));
        safeRenderStep("cenário de atraso", () => renderWhatIf(plan, referenceDate));
        safeRenderStep("fila de hoje", () => renderTodayQueue(queue, referenceDate));
        safeRenderStep("prazos", () => renderDeadlinesCard(referenceDate));
        safeRenderStep("formulário de prazos", () => renderDeadlineFormCard(referenceDate));
        safeRenderStep("backup", () => renderBackupStatusCard(referenceDate));
        safeRenderStep("importação", () => renderImportPreviewCard(referenceDate));
        safeRenderStep("matérias", () => renderSubjects(referenceDate));
        safeRenderStep("fontes", () => renderSources());
        safeRenderStep("notas do motor", () => renderNotes());
      }

      if (state.currentPage === "calendar") {
        safeRenderStep("calendário", () => renderCalendarPage(referenceDate));
      }

      if (state.currentPage === "grades") {
        safeRenderStep("notas", () => renderGradesPage(referenceDate));
      }

      safeRenderStep("barra de foco mobile", () => renderMobileFocusbar(plan));
      safeRenderStep("contadores", () => updateCollapseCounts());
      state.currentPage = previousRenderPage;
    }

    function showCompatHint(message) {
      if (!elements.compatHint) return;
      elements.compatHint.style.display = "block";
      elements.compatHint.innerHTML = message;
    }


    function applyResponsiveLayout() {
      return THEME_API.applyResponsiveLayout(document.body, window.innerWidth);
    }

    try {
      const testKey = "__poli_test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
    } catch (error) {
      showCompatHint("O navegador abriu o arquivo, mas o armazenamento local está bloqueado. Os conteúdos devem aparecer, porém seus dados e progresso podem não ser salvos. Abra no Chrome, Safari, Edge ou Firefox fora do preview do app.");
    }

    function initEvents() {
      document.querySelectorAll(".collapse-toggle").forEach((button) => {
        button.addEventListener("click", () => {
          const section = button.closest(".collapse-section");
          if (!section) return;
          const isOpen = section.getAttribute("data-open") === "true";
          if (isOpen) section.removeAttribute("data-open");
          else section.setAttribute("data-open", "true");
        });
      });

      if (elements.modeSelect) {
        elements.modeSelect.addEventListener("change", (event) => {
          setStudyMode(event.target.value);
        });
      }

      elements.navButtons.forEach((button) => {
        button.addEventListener("click", () => openPage(button.dataset.navPage));
      });
      elements.studyNavButtons.forEach((button) => {
        button.addEventListener("click", () => openStudySection(button.dataset.studyPage));
      });
      document.addEventListener("click", (event) => {
        const studyBtn = event.target && event.target.closest ? event.target.closest("[data-home-open-studies]") : null;
        if (studyBtn) openPage("studies");
      });

      if (elements.themeToggle) elements.themeToggle.addEventListener("click", toggleTheme);
      if (elements.recalcBtn) elements.recalcBtn.addEventListener("click", recalcPlan);
      if (elements.exportBtn) elements.exportBtn.addEventListener("click", exportStateBackup);
      if (elements.importBtn) elements.importBtn.addEventListener("click", () => elements.importFileInput && elements.importFileInput.click());
      if (elements.importFileInput) elements.importFileInput.addEventListener("change", (event) => {
        const [file] = event.target.files || [];
        importStateBackupFromFile(file);
        event.target.value = "";
      });
      if (elements.monthPrevBtn) elements.monthPrevBtn.addEventListener("click", () => shiftCalendarMonth(today(), -1));
      if (elements.monthTodayBtn) elements.monthTodayBtn.addEventListener("click", () => resetCalendarMonth(today()));
      if (elements.calendarLegendToggleBtn) elements.calendarLegendToggleBtn.addEventListener("click", toggleCalendarLegend);
      if (elements.monthNextBtn) elements.monthNextBtn.addEventListener("click", () => shiftCalendarMonth(today(), 1));

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleThemeChange = () => {
        if (state.theme === "auto") applyTheme();
      };
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleThemeChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(handleThemeChange);
      }
      window.addEventListener("hashchange", () => {
        if (routeHashLock) return;
        if (!applyRouteFromHash()) return;
        saveState();
        render();
      });
    }

    function getStateSnapshot() {
      return STORE_API.cloneState(state);
    }

    function commitState(updater, options = {}) {
      if (typeof updater === "function") {
        updater(state);
      } else if (updater && typeof updater === "object") {
        Object.assign(state, updater);
      }
      if (options.persist !== false) saveState();
      if (options.render !== false) render();
      return getStateSnapshot();
    }

    function bootStudyApp() {
      if (window.__studyAppBooted) return;
      window.__studyAppBooted = true;
      applyTheme();
      applyResponsiveLayout();
      window.addEventListener("resize", applyResponsiveLayout);
      window.addEventListener("error", (event) => {
        showCompatHint(`Erro de script: ${event.message}. Abra o console do navegador para detalhes.`);
      });
      if (window.__studyDataLoadError) {
        showCompatHint("Os dados do app não puderam ser carregados a partir dos arquivos JSON. Verifique se o site está sendo servido por HTTP e não aberto via file://.");
      }
      window.StudyApp = {
        ...(window.StudyApp || {}),
        openPage,
        openStudySection,
        setStudyMode,
        render,
        getStateSnapshot,
        commitState,
        exportStateBackup,
        importStateBackupFromFile,
        applyPendingImport,
        cancelPendingImport,
        toggleCalendarLegend,
        toggleDashboardFocusMode,
        setNotesSearchTerm,
        showToast,
        newsConfig: {
          pollMinutes: Number(NEWS_UI.defaultPollMinutes || 5),
          newWindowMinutes: Number(NEWS_UI.newWindowMinutes || 180),
          maxInboxItems: Number(NEWS_UI.maxInboxItems || 12)
        }
      };
      window.openPage = openPage;
      window.openStudySection = openStudySection;
      window.setStudyMode = setStudyMode;
      window.render = render;
      initEvents();
      if (applyRouteFromHash()) {
        saveState();
      } else {
        syncHashFromState({ replace: true });
      }
      if (typeof setupAppActionDelegation === "function") setupAppActionDelegation();
      if (window.NewsFeed && typeof window.NewsFeed.init === "function") window.NewsFeed.init();
      render();
    }

    window.bootStudyApp = bootStudyApp;
  
