(function () {
  "use strict";

  const COMPANIES = Object.freeze([
    { id: "beneva", name: "BENEVA" },
    { id: "tsea", name: "TSEA" },
    { id: "itamaraca-spe", name: "ITAMARACÁ SPE" }
  ]);

  const PRIORITIES = Object.freeze([
    { value: "critical", label: "Crítica", rank: 0 },
    { value: "high", label: "Alta", rank: 1 },
    { value: "medium", label: "Média", rank: 2 },
    { value: "low", label: "Baixa", rank: 3 }
  ]);

  const STATUSES = Object.freeze([
    { value: "inbox", label: "Inbox" },
    { value: "planned", label: "Planejada" },
    { value: "doing", label: "Em andamento" },
    { value: "waiting", label: "Aguardando terceiros" },
    { value: "done", label: "Concluída" }
  ]);

  const AREAS = Object.freeze([
    { value: "financeiro", label: "Financeiro" },
    { value: "juridico", label: "Jurídico" },
    { value: "operacional", label: "Operacional" },
    { value: "governanca", label: "Governança" },
    { value: "auditoria", label: "Auditoria" },
    { value: "compliance", label: "Compliance" },
    { value: "reuniao", label: "Reunião" },
    { value: "followup", label: "Follow-up" }
  ]);

  const FILTERS = Object.freeze([
    { value: "all", label: "Todos" },
    { value: "general", label: "Geral" },
    { value: "beneva", label: "BENEVA" },
    { value: "tsea", label: "TSEA" },
    { value: "itamaraca-spe", label: "ITAMARACÁ SPE" },
    { value: "today", label: "Hoje" },
    { value: "overdue", label: "Atrasados" },
    { value: "waiting", label: "Aguardando terceiros" }
  ]);

  function uid(prefix) {
    return (prefix || "work_") + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function toIsoDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function todayIso() {
    return toIsoDate(new Date());
  }

  function parseIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return null;
    const parts = String(iso).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  function getWeekStart(value) {
    const source = value instanceof Date ? value : (parseIso(value) || new Date());
    const d = new Date(source.getFullYear(), source.getMonth(), source.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function getWeekDays(anchor) {
    const start = getWeekStart(anchor || new Date());
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      return { date, iso: toIsoDate(date) };
    });
  }

  function normalizeIso(value) {
    if (typeof value !== "string") return null;
    const clean = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
  }

  function hasCompany(companyId) {
    return COMPANIES.some((company) => company.id === companyId);
  }

  function companyName(companyId) {
    const company = COMPANIES.find((item) => item.id === companyId);
    return company ? company.name : "Geral";
  }

  function priorityLabel(value) {
    const item = PRIORITIES.find((priority) => priority.value === value);
    return item ? item.label : "Média";
  }

  function priorityRank(value) {
    const item = PRIORITIES.find((priority) => priority.value === value);
    return item ? item.rank : 2;
  }

  function statusLabel(value) {
    const item = STATUSES.find((status) => status.value === value);
    return item ? item.label : "Planejada";
  }

  function areaLabel(value) {
    const item = AREAS.find((area) => area.value === value);
    return item ? item.label : "Follow-up";
  }

  function isDone(task) {
    return task && task.status === "done";
  }

  function isOpen(task) {
    return !!task && !isDone(task);
  }

  function isWaiting(task) {
    return isOpen(task) && task.status === "waiting";
  }

  function isOverdue(task, referenceIso) {
    const ref = referenceIso || todayIso();
    return isOpen(task) && !!task.dueDate && task.dueDate < ref;
  }

  function isToday(task, referenceIso) {
    const ref = referenceIso || todayIso();
    return isOpen(task) && (task.scheduledDayIso === ref || task.dueDate === ref);
  }

  function createTask(input) {
    const now = new Date().toISOString();
    const companyId = hasCompany(input.companyId) ? input.companyId : null;
    const scope = input.scope === "company" && companyId ? "company" : "general";
    const scheduledDayIso = normalizeIso(input.scheduledDayIso);
    let status = STATUSES.some((item) => item.value === input.status) ? input.status : "inbox";
    if (scheduledDayIso && status === "inbox") status = "planned";
    if (!scheduledDayIso && status === "planned") status = "inbox";
    const title = String(input.title || "").trim();
    const nextAction = String(input.nextAction || "").trim();

    return {
      id: uid("work_"),
      title: title || "Tarefa de trabalho",
      description: String(input.description || "").trim(),
      scope,
      companyId: scope === "company" ? companyId : null,
      scheduledDayIso,
      dueDate: normalizeIso(input.dueDate),
      priority: PRIORITIES.some((item) => item.value === input.priority) ? input.priority : "medium",
      status,
      area: AREAS.some((item) => item.value === input.area) ? input.area : "followup",
      nextAction: nextAction || "Definir próxima ação objetiva",
      notes: String(input.notes || "").trim(),
      waitingSince: status === "waiting" ? now : null,
      createdAt: now,
      updatedAt: now,
      completedAt: status === "done" ? now : null
    };
  }

  function patchTask(task, patch) {
    const now = new Date().toISOString();
    const next = Object.assign({}, task, patch, { updatedAt: now });
    if (patch.companyId !== undefined || patch.scope !== undefined) {
      const companyId = hasCompany(next.companyId) ? next.companyId : null;
      next.scope = next.scope === "company" && companyId ? "company" : "general";
      next.companyId = next.scope === "company" ? companyId : null;
    }
    if (patch.status !== undefined) {
      if (next.status === "done") {
        next.completedAt = next.completedAt || now;
      } else {
        next.completedAt = null;
      }
      if (next.status === "waiting") {
        next.waitingSince = next.waitingSince || now;
      } else if (task.status === "waiting") {
        next.waitingSince = null;
      }
    }
    if (patch.scheduledDayIso !== undefined) {
      next.scheduledDayIso = normalizeIso(patch.scheduledDayIso);
    }
    if (next.scheduledDayIso && next.status === "inbox") next.status = "planned";
    if (!next.scheduledDayIso && next.status === "planned") next.status = "inbox";
    return next;
  }

  function sortTasks(tasks, referenceIso) {
    const ref = referenceIso || todayIso();
    return (tasks || []).slice().sort((a, b) => {
      const overdueDelta = Number(isOverdue(b, ref)) - Number(isOverdue(a, ref));
      if (overdueDelta) return overdueDelta;
      const dueA = a.dueDate || "9999-12-31";
      const dueB = b.dueDate || "9999-12-31";
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDelta) return priorityDelta;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
  }

  function applyFilter(tasks, filter, referenceIso) {
    const ref = referenceIso || todayIso();
    return (tasks || []).filter((task) => {
      if (filter === "general") return task.scope === "general";
      if (filter === "today") return isToday(task, ref);
      if (filter === "overdue") return isOverdue(task, ref);
      if (filter === "waiting") return isWaiting(task);
      if (hasCompany(filter)) return task.companyId === filter;
      return true;
    });
  }

  function weekIsos(anchor) {
    return getWeekDays(anchor).map((day) => day.iso);
  }

  function companySummaries(tasks, referenceIso, weekIsoList) {
    const ref = referenceIso || todayIso();
    const weekSet = new Set(weekIsoList || weekIsos(ref));
    return COMPANIES.map((company) => {
      const companyTasks = (tasks || []).filter((task) => task.companyId === company.id);
      const open = companyTasks.filter(isOpen);
      const weekTasks = open.filter((task) => weekSet.has(task.scheduledDayIso) || weekSet.has(task.dueDate));
      const overdue = open.filter((task) => isOverdue(task, ref));
      const waiting = open.filter(isWaiting);
      const nextActions = sortTasks(open, ref).slice(0, 3).map((task) => task.nextAction || task.title);
      return {
        company,
        openCount: open.length,
        weekCount: weekTasks.length,
        overdueCount: overdue.length,
        waitingCount: waiting.length,
        nextActions
      };
    });
  }

  function dashboardBuckets(tasks, referenceIso, anchor) {
    const ref = referenceIso || todayIso();
    const weekSet = new Set(weekIsos(anchor || ref));
    const open = (tasks || []).filter(isOpen);
    return {
      open,
      today: sortTasks(open.filter((task) => isToday(task, ref)), ref),
      overdue: sortTasks(open.filter((task) => isOverdue(task, ref)), ref),
      waiting: sortTasks(open.filter(isWaiting), ref),
      critical: sortTasks(open.filter((task) => task.priority === "critical" || isOverdue(task, ref) || (task.dueDate && weekSet.has(task.dueDate))), ref),
      companies: companySummaries(tasks, ref, Array.from(weekSet))
    };
  }

  window.WorkDomain = {
    COMPANIES,
    PRIORITIES,
    STATUSES,
    AREAS,
    FILTERS,
    toIsoDate,
    todayIso,
    parseIso,
    addDays,
    getWeekStart,
    getWeekDays,
    weekIsos,
    normalizeIso,
    hasCompany,
    companyName,
    priorityLabel,
    priorityRank,
    statusLabel,
    areaLabel,
    isDone,
    isOpen,
    isWaiting,
    isOverdue,
    isToday,
    createTask,
    patchTask,
    sortTasks,
    applyFilter,
    companySummaries,
    dashboardBuckets
  };
})();
