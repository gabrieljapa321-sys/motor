(function () {
  "use strict";

  function waitForApp(fn, tries) {
    tries = tries || 0;
    if (typeof state !== "undefined" && typeof saveState === "function" && window.WorkDomain) {
      fn();
    } else if (tries < 50) {
      setTimeout(function () { waitForApp(fn, tries + 1); }, 100);
    } else {
      console.error("[workPlanner] app principal não carregou");
    }
  }

  waitForApp(function () {
    const WD = window.WorkDomain;
    const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let draggingId = null;

    if (!Array.isArray(state.workTasks)) state.workTasks = [];
    if (!state.workFilter) state.workFilter = "all";

    let currentWeekStart = WD.getWeekStart(state.workWeekAnchor || new Date());

    function escapeHtml(value) {
      if (value == null) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function setText(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    }

    function formatDateShort(date) {
      return date.getDate() + " " + MONTH_NAMES[date.getMonth()];
    }

    function formatIsoShort(iso) {
      const date = WD.parseIso(iso);
      return date ? formatDateShort(date) : "—";
    }

    function getFilter() {
      const allowed = WD.FILTERS.map((item) => item.value);
      return allowed.indexOf(state.workFilter) === -1 ? "all" : state.workFilter;
    }

    function currentWeekIsos() {
      return WD.getWeekDays(currentWeekStart).map((day) => day.iso);
    }

    function openTasks() {
      return (state.workTasks || []).filter(WD.isOpen);
    }

    function visibleTasks() {
      return WD.applyFilter(state.workTasks || [], getFilter(), WD.todayIso());
    }

    function persistWeekAnchor() {
      state.workWeekAnchor = WD.toIsoDate(currentWeekStart);
      saveState();
    }

    function saveAndRefresh(message) {
      saveState();
      if (message && typeof showToast === "function") showToast(message);
      renderWorkPlanner();
      if (state.currentPage !== "work" && typeof window.render === "function") {
        window.render();
      }
    }

    function renderWorkPlanner() {
      renderHeader();
      renderFormOptions();
      renderStats();
      renderFilters();
      renderPlanner();
      renderInbox();
      renderWaiting();
      renderCritical();
      renderCompanySummary();
    }

    function renderHeader() {
      const start = currentWeekStart;
      const end = WD.addDays(start, 6);
      setText("workWeekRange", formatDateShort(start) + " - " + formatDateShort(end) + " · " + WEEKDAY_FULL[start.getDay()] + " a " + WEEKDAY_FULL[end.getDay()]);
    }

    function renderStats() {
      const el = document.getElementById("workStats");
      if (!el) return;
      const todayIso = WD.todayIso();
      const weekSet = new Set(currentWeekIsos());
      const open = openTasks();
      const week = open.filter((task) => weekSet.has(task.scheduledDayIso) || weekSet.has(task.dueDate));
      const today = open.filter((task) => WD.isToday(task, todayIso));
      const overdue = open.filter((task) => WD.isOverdue(task, todayIso));
      const waiting = open.filter(WD.isWaiting);
      el.innerHTML = [
        statHTML("Abertas", open.length, "tarefas de trabalho"),
        statHTML("Semana", week.length, "planejadas ou com prazo"),
        statHTML("Hoje", today.length, "ações do dia"),
        statHTML("Atrasadas", overdue.length, "prazo vencido", overdue.length ? "danger" : ""),
        statHTML("Aguardando", waiting.length, "terceiros", waiting.length ? "warning" : "")
      ].join("");
    }

    function statHTML(label, value, subvalue, tone) {
      return '<div class="work-stat' + (tone ? ' work-stat--' + tone : '') + '">' +
        '<div class="week-stat-label">' + escapeHtml(label) + '</div>' +
        '<span class="week-stat-value">' + value + '</span>' +
        '<div class="week-stat-subvalue">' + escapeHtml(subvalue) + '</div>' +
      '</div>';
    }

    function renderFilters() {
      const el = document.getElementById("workFilters");
      if (!el) return;
      const todayIso = WD.todayIso();
      const tasks = state.workTasks || [];
      const counts = {
        all: tasks.filter(WD.isOpen).length,
        general: tasks.filter((task) => WD.isOpen(task) && task.scope === "general").length,
        today: tasks.filter((task) => WD.isToday(task, todayIso)).length,
        overdue: tasks.filter((task) => WD.isOverdue(task, todayIso)).length,
        waiting: tasks.filter(WD.isWaiting).length
      };
      WD.COMPANIES.forEach((company) => {
        counts[company.id] = tasks.filter((task) => WD.isOpen(task) && task.companyId === company.id).length;
      });
      const active = getFilter();
      el.innerHTML = WD.FILTERS.map((filter) => {
        const count = counts[filter.value] || 0;
        return '<button type="button" class="work-filter-btn" data-work-filter="' + filter.value + '"' + (active === filter.value ? ' data-active="true"' : '') + '>' +
          '<span>' + escapeHtml(filter.label) + '</span>' +
          '<strong>' + count + '</strong>' +
        '</button>';
      }).join("");
    }

    function renderFormOptions() {
      renderCompanySelect("workTaskCompany");
      renderDaySelect("workTaskDay");
      renderOptionSelect("workTaskPriority", WD.PRIORITIES, "medium");
      renderOptionSelect("workTaskStatus", WD.STATUSES, "inbox");
      renderOptionSelect("workTaskArea", WD.AREAS, "followup");
      updateCompanyFieldState();
    }

    function renderCompanySelect(id) {
      const select = document.getElementById(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">—</option>' + WD.COMPANIES.map((company) =>
        '<option value="' + company.id + '">' + escapeHtml(company.name) + '</option>'
      ).join("");
      if (current) select.value = current;
    }

    function renderDaySelect(id) {
      const select = document.getElementById(id);
      if (!select) return;
      const current = select.value;
      const options = ['<option value="">Inbox (sem dia)</option>'];
      WD.getWeekDays(currentWeekStart).forEach((day) => {
        options.push('<option value="' + day.iso + '">' + WEEKDAY_FULL[day.date.getDay()] + ' · ' + formatDateShort(day.date) + '</option>');
      });
      select.innerHTML = options.join("");
      if (current && Array.from(select.options).some((option) => option.value === current)) select.value = current;
    }

    function renderOptionSelect(id, options, fallback) {
      const select = document.getElementById(id);
      if (!select) return;
      const current = select.value || fallback;
      select.innerHTML = options.map((option) =>
        '<option value="' + option.value + '">' + escapeHtml(option.label) + '</option>'
      ).join("");
      select.value = current;
    }

    function updateCompanyFieldState() {
      const scopeSelect = document.getElementById("workTaskScope");
      const companySelect = document.getElementById("workTaskCompany");
      if (!scopeSelect || !companySelect) return;
      const isCompany = scopeSelect.value === "company";
      companySelect.disabled = !isCompany;
      if (!isCompany) companySelect.value = "";
    }

    function renderPlanner() {
      const el = document.getElementById("workWeekPlanner");
      if (!el) return;
      const todayIso = WD.todayIso();
      const tasks = visibleTasks().filter(WD.isOpen);
      el.innerHTML = WD.getWeekDays(currentWeekStart).map((day) => {
        const dayTasks = WD.sortTasks(tasks.filter((task) => task.scheduledDayIso === day.iso), todayIso);
        const pendingCount = dayTasks.length;
        const isToday = day.iso === todayIso;
        return '<div class="work-day-col work-drop-zone" data-work-drop="day" data-day-iso="' + day.iso + '"' + (isToday ? ' data-today="true"' : '') + '>' +
          '<div class="work-day-header">' +
            '<span class="work-day-weekday">' + WEEKDAY_NAMES[day.date.getDay()] + '</span>' +
            '<span class="work-day-date">' + formatDateShort(day.date) + '<strong>' + pendingCount + '</strong></span>' +
          '</div>' +
          '<div class="work-day-list">' + (dayTasks.length ? dayTasks.map(renderTaskCard).join("") : '<div class="work-empty-drop">Arraste uma tarefa para este dia.</div>') + '</div>' +
        '</div>';
      }).join("");
    }

    function renderInbox() {
      const el = document.getElementById("workInboxList");
      if (!el) return;
      const todayIso = WD.todayIso();
      const tasks = WD.sortTasks(visibleTasks().filter((task) => WD.isOpen(task) && (!task.scheduledDayIso || task.status === "inbox")), todayIso);
      setText("workInboxCount", tasks.length);
      el.innerHTML = tasks.length ? tasks.map(renderTaskCard).join("") : '<div class="work-empty-drop">Inbox vazia. Capture acima ou arraste cards para cá.</div>';
    }

    function renderWaiting() {
      const el = document.getElementById("workWaitingList");
      if (!el) return;
      const todayIso = WD.todayIso();
      const tasks = WD.sortTasks(visibleTasks().filter(WD.isWaiting), todayIso);
      setText("workWaitingCount", tasks.length);
      el.innerHTML = tasks.length ? tasks.map(renderTaskCard).join("") : '<div class="empty-state">Nada aguardando terceiros.</div>';
    }

    function renderCritical() {
      const el = document.getElementById("workCriticalCard");
      if (!el) return;
      const buckets = WD.dashboardBuckets(state.workTasks || [], WD.todayIso(), currentWeekStart);
      const critical = buckets.critical.slice(0, 8);
      el.innerHTML = '<div class="work-panel-heading compact"><h3>Prazos críticos</h3><span class="chip danger">' + critical.length + '</span></div>' +
        (critical.length ? '<div class="work-list work-list--compact">' + critical.map(renderTaskCard).join("") + '</div>' : '<div class="empty-state">Sem prazo crítico nesta semana.</div>');
    }

    function renderCompanySummary() {
      const el = document.getElementById("workCompanySummary");
      if (!el) return;
      const summaries = WD.companySummaries(state.workTasks || [], WD.todayIso(), currentWeekIsos());
      el.innerHTML = '<div class="work-panel-heading compact"><h3>Resumo por empresa</h3><span class="chip neutral">FIPs</span></div>' +
        '<div class="work-company-grid">' + summaries.map((summary) => {
          const actions = summary.nextActions.length
            ? '<ul>' + summary.nextActions.map((action) => '<li>' + escapeHtml(action) + '</li>').join("") + '</ul>'
            : '<div class="mini muted">Sem próxima ação aberta.</div>';
          return '<article class="work-company-card" data-company-id="' + summary.company.id + '">' +
            '<div class="work-company-top"><strong>' + escapeHtml(summary.company.name) + '</strong><button type="button" data-work-filter="' + summary.company.id + '">Filtrar</button></div>' +
            '<div class="work-company-metrics">' +
              '<span><strong>' + summary.openCount + '</strong> abertas</span>' +
              '<span><strong>' + summary.weekCount + '</strong> semana</span>' +
              '<span><strong>' + summary.overdueCount + '</strong> atrasadas</span>' +
              '<span><strong>' + summary.waitingCount + '</strong> aguardando</span>' +
            '</div>' +
            '<div class="work-company-actions"><span>Próximas ações</span>' + actions + '</div>' +
          '</article>';
        }).join("") + '</div>';
    }

    function renderTaskCard(task) {
      const todayIso = WD.todayIso();
      const overdue = WD.isOverdue(task, todayIso);
      const due = task.dueDate ? 'Prazo ' + formatIsoShort(task.dueDate) : 'Sem prazo';
      const company = task.scope === "company" ? WD.companyName(task.companyId) : "Geral";
      const status = WD.statusLabel(task.status);
      const priority = WD.priorityLabel(task.priority);
      const statusAction = task.status === "waiting"
        ? '<button type="button" data-work-status="planned">Retomar</button>'
        : '<button type="button" data-work-status="waiting">Aguardar</button>';
      return '<article class="work-task" draggable="true" data-work-task-id="' + task.id + '" data-priority="' + task.priority + '"' + (overdue ? ' data-overdue="true"' : '') + '>' +
        '<div class="work-task-main">' +
          '<label class="work-task-check-wrap"><input type="checkbox" class="work-task-check"' + (task.status === "done" ? ' checked' : '') + ' aria-label="Concluir tarefa" /></label>' +
          '<div class="work-task-body">' +
            '<div class="work-task-title">' + escapeHtml(task.title) + '</div>' +
            '<div class="work-task-action">' + escapeHtml(task.nextAction || 'Definir próxima ação objetiva') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="work-task-meta">' +
          '<span class="work-chip">' + escapeHtml(company) + '</span>' +
          '<span class="work-chip work-chip--' + task.priority + '">' + escapeHtml(priority) + '</span>' +
          '<span class="work-chip' + (overdue ? ' work-chip--danger' : '') + '">' + escapeHtml(due) + '</span>' +
          '<span class="work-chip">' + escapeHtml(WD.areaLabel(task.area)) + '</span>' +
          '<span class="work-chip">' + escapeHtml(status) + '</span>' +
        '</div>' +
        (task.description ? '<div class="work-task-notes">' + escapeHtml(task.description) + '</div>' : '') +
        '<div class="work-task-actions">' +
          '<button type="button" data-work-status="doing">Fazer</button>' +
          statusAction +
          '<button type="button" data-work-move-inbox="true">Inbox</button>' +
          '<button type="button" data-work-delete="true" aria-label="Excluir tarefa">Excluir</button>' +
        '</div>' +
      '</article>';
    }

    function collectWorkForm(form) {
      const data = new FormData(form);
      return {
        title: data.get("title"),
        nextAction: data.get("nextAction"),
        description: data.get("description"),
        scope: data.get("scope"),
        companyId: data.get("companyId"),
        scheduledDayIso: data.get("scheduledDayIso"),
        dueDate: data.get("dueDate"),
        priority: data.get("priority"),
        status: data.get("status"),
        area: data.get("area")
      };
    }

    function resetWorkForm() {
      const form = document.getElementById("workTaskForm");
      if (!form) return;
      form.reset();
      renderFormOptions();
      const title = document.getElementById("workTaskTitle");
      if (title) title.focus();
    }

    function addTask(input, message) {
      const task = WD.createTask(input || {});
      state.workTasks.push(task);
      saveAndRefresh(message || "Tarefa de trabalho criada.");
      return task;
    }

    function updateTask(id, patch, message) {
      const idx = (state.workTasks || []).findIndex((task) => task.id === id);
      if (idx === -1) return null;
      state.workTasks[idx] = WD.patchTask(state.workTasks[idx], patch || {});
      saveAndRefresh(message || "Tarefa atualizada.");
      return state.workTasks[idx];
    }

    function deleteTask(id) {
      const before = state.workTasks.length;
      state.workTasks = state.workTasks.filter((task) => task.id !== id);
      if (state.workTasks.length !== before) saveAndRefresh("Tarefa removida.");
    }

    function taskIdFromEvent(event) {
      const card = event.target && event.target.closest ? event.target.closest(".work-task") : null;
      return card ? card.getAttribute("data-work-task-id") : null;
    }

    function setupEvents() {
      const workPage = document.getElementById("workPage");
      if (workPage && workPage.getAttribute("data-work-bound") !== "true") {
        workPage.setAttribute("data-work-bound", "true");

        workPage.addEventListener("click", function (event) {
          const filterBtn = event.target.closest("[data-work-filter]");
          if (filterBtn) {
            state.workFilter = filterBtn.getAttribute("data-work-filter") || "all";
            saveState();
            renderWorkPlanner();
            return;
          }

          const statusBtn = event.target.closest("[data-work-status]");
          if (statusBtn) {
            const id = taskIdFromEvent(event);
            if (id) updateTask(id, { status: statusBtn.getAttribute("data-work-status") });
            return;
          }

          const inboxBtn = event.target.closest("[data-work-move-inbox]");
          if (inboxBtn) {
            const id = taskIdFromEvent(event);
            if (id) updateTask(id, { scheduledDayIso: null, status: "inbox" }, "Tarefa movida para inbox.");
            return;
          }

          const deleteBtn = event.target.closest("[data-work-delete]");
          if (deleteBtn) {
            const id = taskIdFromEvent(event);
            if (id) deleteTask(id);
          }
        });

        workPage.addEventListener("change", function (event) {
          if (event.target && event.target.id === "workTaskScope") {
            updateCompanyFieldState();
            return;
          }
          const checkbox = event.target.closest(".work-task-check");
          if (!checkbox) return;
          const id = taskIdFromEvent(event);
          if (!id) return;
          const task = state.workTasks.find((item) => item.id === id);
          const fallbackStatus = task && task.scheduledDayIso ? "planned" : "inbox";
          updateTask(id, { status: checkbox.checked ? "done" : fallbackStatus }, checkbox.checked ? "Tarefa concluída." : "Tarefa reaberta.");
        });

        workPage.addEventListener("submit", function (event) {
          const form = event.target.closest("#workTaskForm");
          if (!form) return;
          event.preventDefault();
          const payload = collectWorkForm(form);
          if (!String(payload.title || "").trim()) return;
          addTask(payload, "Tarefa de trabalho criada.");
          resetWorkForm();
        });

        workPage.addEventListener("dragstart", function (event) {
          const card = event.target.closest(".work-task");
          if (!card) return;
          draggingId = card.getAttribute("data-work-task-id");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", draggingId);
          card.setAttribute("data-dragging", "true");
        });

        workPage.addEventListener("dragend", function () {
          draggingId = null;
          document.querySelectorAll(".work-task[data-dragging], .work-drop-zone[data-drag-over]").forEach((el) => {
            el.removeAttribute("data-dragging");
            el.removeAttribute("data-drag-over");
          });
        });

        workPage.addEventListener("dragover", function (event) {
          const target = event.target.closest(".work-drop-zone");
          if (!target || !draggingId) return;
          event.preventDefault();
          target.setAttribute("data-drag-over", "true");
        });

        workPage.addEventListener("dragleave", function (event) {
          const target = event.target.closest(".work-drop-zone");
          if (target) target.removeAttribute("data-drag-over");
        });

        workPage.addEventListener("drop", function (event) {
          const target = event.target.closest(".work-drop-zone");
          if (!target) return;
          event.preventDefault();
          const id = draggingId || event.dataTransfer.getData("text/plain");
          if (!id) return;
          if (target.getAttribute("data-work-drop") === "inbox") {
            updateTask(id, { scheduledDayIso: null, status: "inbox" }, "Tarefa movida para inbox.");
          } else {
            const dayIso = target.getAttribute("data-day-iso");
            updateTask(id, { scheduledDayIso: dayIso, status: "planned" }, "Tarefa agendada.");
          }
          draggingId = null;
        });
      }

      const clearBtn = document.getElementById("workClearFormBtn");
      if (clearBtn && clearBtn.getAttribute("data-bound") !== "true") {
        clearBtn.setAttribute("data-bound", "true");
        clearBtn.addEventListener("click", resetWorkForm);
      }

      setupWeekControls();
      setupHomeQuickCapture();
      setupObserver();
    }

    function setupWeekControls() {
      const prev = document.getElementById("workPrevBtn");
      const today = document.getElementById("workTodayBtn");
      const next = document.getElementById("workNextBtn");
      if (prev && prev.getAttribute("data-bound") !== "true") {
        prev.setAttribute("data-bound", "true");
        prev.addEventListener("click", function () {
          currentWeekStart = WD.addDays(currentWeekStart, -7);
          persistWeekAnchor();
          renderWorkPlanner();
        });
      }
      if (today && today.getAttribute("data-bound") !== "true") {
        today.setAttribute("data-bound", "true");
        today.addEventListener("click", function () {
          currentWeekStart = WD.getWeekStart(new Date());
          persistWeekAnchor();
          renderWorkPlanner();
        });
      }
      if (next && next.getAttribute("data-bound") !== "true") {
        next.setAttribute("data-bound", "true");
        next.addEventListener("click", function () {
          currentWeekStart = WD.addDays(currentWeekStart, 7);
          persistWeekAnchor();
          renderWorkPlanner();
        });
      }
      if (!document.body.getAttribute("data-work-shortcuts-bound")) {
        document.body.setAttribute("data-work-shortcuts-bound", "true");
        document.addEventListener("keydown", function (event) {
          const page = document.getElementById("workPage");
          if (!page || page.hasAttribute("hidden")) return;
          const target = event.target;
          if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
          if (event.altKey && event.shiftKey && event.key === "ArrowLeft") {
            event.preventDefault();
            currentWeekStart = WD.addDays(currentWeekStart, -7);
            persistWeekAnchor();
            renderWorkPlanner();
          } else if (event.altKey && event.shiftKey && event.key === "ArrowRight") {
            event.preventDefault();
            currentWeekStart = WD.addDays(currentWeekStart, 7);
            persistWeekAnchor();
            renderWorkPlanner();
          } else if (event.altKey && event.shiftKey && event.key === "0") {
            event.preventDefault();
            currentWeekStart = WD.getWeekStart(new Date());
            persistWeekAnchor();
            renderWorkPlanner();
          }
        });
      }
    }

    function setupHomeQuickCapture() {
      if (document.body.getAttribute("data-home-work-capture-bound") === "true") return;
      document.body.setAttribute("data-home-work-capture-bound", "true");
      document.addEventListener("submit", function (event) {
        const form = event.target.closest("#homeQuickCaptureForm");
        if (!form) return;
        event.preventDefault();
        const data = new FormData(form);
        const target = String(data.get("target") || "inbox");
        const companyId = String(data.get("companyId") || "");
        const payload = {
          title: data.get("title"),
          nextAction: data.get("nextAction") || data.get("title"),
          scope: companyId ? "company" : "general",
          companyId: companyId || null,
          scheduledDayIso: target === "today" ? WD.todayIso() : "",
          dueDate: data.get("dueDate") || "",
          priority: data.get("priority") || "medium",
          status: target === "today" ? "planned" : "inbox",
          area: "followup",
          description: ""
        };
        if (!String(payload.title || "").trim()) return;
        addTask(payload, "Captura de trabalho adicionada.");
        form.reset();
        if (typeof window.render === "function") window.render();
      });
      document.addEventListener("click", function (event) {
        const openWork = event.target.closest("[data-open-work]");
        if (openWork && typeof openPage === "function") {
          openPage("work");
        }
        const filter = event.target.closest("[data-home-work-filter]");
        if (filter && typeof openPage === "function") {
          state.workFilter = filter.getAttribute("data-home-work-filter") || "all";
          saveState();
          openPage("work");
        }
      });
    }

    function setupObserver() {
      const workPage = document.getElementById("workPage");
      if (!workPage || workPage.getAttribute("data-observer-bound") === "true") return;
      workPage.setAttribute("data-observer-bound", "true");
      const observer = new MutationObserver(function () {
        if (!workPage.hasAttribute("hidden")) renderWorkPlanner();
      });
      observer.observe(workPage, { attributes: true, attributeFilter: ["hidden"] });
    }

    window.WorkPlanner = {
      render: renderWorkPlanner,
      addTask,
      updateTask,
      deleteTask,
      getCurrentWeekStart: function () { return new Date(currentWeekStart.getTime()); }
    };

    setupEvents();
    renderWorkPlanner();
    console.log("[workPlanner] inicializado");
  });
})();
