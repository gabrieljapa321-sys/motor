(() => {
  "use strict";

  const NEWS_PATH = "assets/data/news.json";
  const DEFAULT_CONFIG = {
    pollMinutes: 5,
    newWindowMinutes: 180,
    maxInboxItems: 12
  };

  const runtime = {
    payload: null,
    pollTimer: null,
    fetchPromise: null,
    initialized: false,
    lastNotifiedSignature: "",
    lastFetchError: null,
    feedVisibleCount: 6,
    isRefreshing: false
  };

  function getApp() {
    return window.StudyApp || null;
  }

  function getConfig() {
    const app = getApp();
    return {
      ...DEFAULT_CONFIG,
      ...((app && app.newsConfig) || {})
    };
  }

  function getState() {
    const app = getApp();
    return app && typeof app.getStateSnapshot === "function" ? app.getStateSnapshot() : {};
  }

  function commitState(updater, options = {}) {
    const app = getApp();
    if (!app || typeof app.commitState !== "function") return {};
    return app.commitState(updater, options);
  }

  function showToast(message) {
    const app = getApp();
    if (app && typeof app.showToast === "function") app.showToast(message);
  }

  function setRefreshButtonState(isRefreshing) {
    runtime.isRefreshing = Boolean(isRefreshing);
    const refreshBtn = document.getElementById("newsRefreshBtn");
    const updatedAtChip = document.getElementById("newsUpdatedAtChip");
    if (refreshBtn) {
      refreshBtn.disabled = runtime.isRefreshing;
      refreshBtn.setAttribute("aria-busy", runtime.isRefreshing ? "true" : "false");
      refreshBtn.textContent = runtime.isRefreshing ? "Atualizando..." : "Atualizar agora";
    }
    if (updatedAtChip && runtime.isRefreshing) {
      updatedAtChip.textContent = "Atualizando feed...";
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function formatDateTime(value) {
    if (!value) return "Sem horário";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatRelativeTime(value) {
    if (!value) return "Sem horário";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
    const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
    if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 36) return formatter.format(diffHours, "hour");
    const diffDays = Math.round(diffHours / 24);
    return formatter.format(diffDays, "day");
  }

  function dedupeIds(values, limit = 600) {
    const seen = new Set();
    const output = [];
    ensureArray(values).forEach((value) => {
      if (typeof value !== "string") return;
      const clean = value.trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      output.push(clean);
    });
    return output.slice(0, limit);
  }

  function sanitizeItem(raw, index) {
    const publishedAt = typeof raw.publishedAt === "string" ? raw.publishedAt : null;
    const source = typeof raw.source === "string" && raw.source.trim() ? raw.source.trim() : "Fonte";
    const category = typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : "latest";
    const idBase = typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : normalizeKey(`${category}-${source}-${raw.title || index}`);
    return {
      id: idBase || `news-item-${index}`,
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Sem título",
      summary: typeof raw.summary === "string" ? raw.summary.trim().slice(0, 380) : "",
      details: typeof raw.details === "string" ? raw.details.trim().slice(0, 420) : "",
      imageUrl: typeof raw.imageUrl === "string" && raw.imageUrl.trim() ? raw.imageUrl.trim() : "",
      url: typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : "#",
      source,
      category,
      tags: ensureArray(raw.tags).filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 40)).slice(0, 5),
      publishedAt,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : publishedAt,
      premium: Boolean(raw.premium),
      sourceQuery: typeof raw.sourceQuery === "string" ? raw.sourceQuery.trim() : ""
    };
  }

  function sanitizePayload(payload) {
    const items = ensureArray(payload && payload.items)
      .map(sanitizeItem)
      .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
    const categories = ensureArray(payload && payload.categories).filter((item) => item && typeof item === "object");
    return {
      updatedAt: payload && typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString(),
      generatedAt: payload && typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      sources: ensureArray(payload && payload.sources).filter((item) => item && typeof item === "object"),
      categories: categories.length
        ? categories
        : [
            { id: "all", label: "Tudo" },
            ...Array.from(new Set(items.map((item) => item.category))).map((category) => ({
              id: category,
              label: category === "latest" ? "Última hora" : category
            }))
          ],
      items
    };
  }

  function renderNewsMedia(item, className) {
    if (item.imageUrl) {
      const mediaUrl = encodeURI(item.imageUrl);
      return `
        <div class="${className}" style="background-image:url('${escapeHtml(mediaUrl)}')" aria-hidden="true">
        </div>
      `;
    }
    return `
      <div class="${className} ${className}--fallback" aria-hidden="true">
        <span>${escapeHtml((item.source || item.category || "N").slice(0, 1).toUpperCase())}</span>
      </div>
    `;
  }

  function getUnreadItems(state = getState(), payload = runtime.payload) {
    if (!payload) return [];
    const seen = new Set(ensureArray(state.newsSeenIds));
    return payload.items.filter((item) => !seen.has(item.id));
  }

  function getFilteredItems(state = getState(), payload = runtime.payload) {
    if (!payload) return [];
    const category = typeof state.newsCategory === "string" ? state.newsCategory : "all";
    const source = typeof state.newsSource === "string" ? state.newsSource : "all";
    return payload.items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (source !== "all" && normalizeKey(item.source) !== source) return false;
      return true;
    });
  }

  function getSourceOptions(payload = runtime.payload) {
    if (!payload) return [];
    const seen = new Map();
    payload.items.forEach((item) => {
      const key = normalizeKey(item.source);
      if (!key || seen.has(key)) return;
      seen.set(key, { id: key, label: item.source });
    });
    return [{ id: "all", label: "Todas as fontes" }, ...Array.from(seen.values())];
  }

  function updateNavBadge() {
    const badge = document.getElementById("newsNavBadge");
    if (!badge) return;
    const unreadCount = getUnreadItems().length;
    badge.textContent = String(unreadCount);
    badge.hidden = unreadCount === 0;
  }

  function renderFilters() {
    const categoryHost = document.getElementById("newsCategoryFilters");
    const sourceHost = document.getElementById("newsSourceFilters");
    if (!categoryHost || !sourceHost || !runtime.payload) return;
    const state = getState();
    const categories = runtime.payload.categories.map((item) => ({
      id: item.id,
      label: item.label
    }));
    categoryHost.innerHTML = categories.map((item) => `
      <button type="button" class="news-filter-chip" data-news-category="${escapeHtml(item.id)}"${state.newsCategory === item.id ? ' data-active="true"' : ""}>
        ${escapeHtml(item.label)}
      </button>
    `).join("");
    sourceHost.innerHTML = `
      <label class="news-source-select">
        <select id="newsSourceSelect" class="news-source-select__control" aria-label="Fonte de notícias">
          ${getSourceOptions().map((item) => `
            <option value="${escapeHtml(item.id)}"${state.newsSource === item.id ? " selected" : ""}>${escapeHtml(item.label)}</option>
          `).join("")}
        </select>
      </label>
    `;
  }

  function renderLeadCard(items) {
    const host = document.getElementById("newsLeadCard");
    if (!host) return;
    const item = items[0];
    if (!item) {
      host.innerHTML = '<div class="news-empty">Nenhuma notícia disponível para o filtro atual.</div>';
      return;
    }
    host.innerHTML = `
      ${renderNewsMedia(item, "news-lead-media")}
      <div class="news-lead-top">
        <span class="chip accent">${escapeHtml(item.category === "latest" ? "Última hora" : item.category)}</span>
        <span class="chip neutral">${escapeHtml(item.source)}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml((item.details || item.summary || "Sem resumo curto disponível; abra a fonte para ver a íntegra.").slice(0, 220))}</p>
      <div class="news-meta-row">
        <span>${escapeHtml(formatRelativeTime(item.publishedAt))}</span>
        <span>${escapeHtml(formatDateTime(item.publishedAt))}</span>
      </div>
      <div class="news-action-row">
        <a class="btn btn-primary" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" data-news-open="${escapeHtml(item.id)}">Abrir fonte</a>
        <button type="button" class="btn btn-ghost" data-news-mark-read="${escapeHtml(item.id)}">Marcar como lida</button>
      </div>
    `;
  }

  function renderFeedList(items) {
    const host = document.getElementById("newsFeedList");
    if (!host) return;
    const unread = new Set(getUnreadItems().map((item) => item.id));
    if (!items.length) {
      host.innerHTML = '<div class="news-empty">Nenhuma manchete combinou com os filtros atuais.</div>';
      return;
    }
    const visibleItems = items.slice(0, runtime.feedVisibleCount);
    host.innerHTML = visibleItems.map((item) => `
      <article class="news-item-card"${unread.has(item.id) ? ' data-unread="true"' : ""} data-news-item-id="${escapeHtml(item.id)}">
        ${renderNewsMedia(item, "news-item-media")}
        <div class="news-item-top">
          <div class="news-item-headline">
            <h4>${escapeHtml(item.title)}</h4>
          </div>
          ${unread.has(item.id) ? '<span class="news-dot" aria-label="Não lida"></span>' : ""}
        </div>
        ${item.summary ? `<p class="news-item-summary">${escapeHtml(item.summary)}</p>` : ""}
        <div class="news-meta-row">
          <span>${escapeHtml(item.source)}</span>
          <span>${escapeHtml(formatRelativeTime(item.publishedAt))}</span>
        </div>
        <div class="chip-row">
          <span class="chip neutral">${escapeHtml(item.category === "latest" ? "Última hora" : item.category)}</span>
          ${item.tags.slice(0, 2).map((tag) => `<span class="chip neutral">${escapeHtml(tag)}</span>`).join("")}
          ${item.premium ? '<span class="chip warning">Premium</span>' : ""}
        </div>
        <div class="news-action-row">
          <a class="btn btn-soft" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" data-news-open="${escapeHtml(item.id)}">Abrir</a>
          <button type="button" class="btn btn-ghost" data-news-mark-read="${escapeHtml(item.id)}">Lida</button>
        </div>
      </article>
    `).join("") + (items.length > runtime.feedVisibleCount ? `
      <div class="news-feed-footer">
        <button type="button" class="btn btn-ghost" data-news-show-more>Mostrar mais ${Math.min(6, items.length - runtime.feedVisibleCount)}</button>
      </div>
    ` : "");
  }

  function renderInboxCard() {
    const host = document.getElementById("newsInboxCard");
    if (!host) return;
    const state = getState();
    const config = getConfig();
    const unreadItems = getUnreadItems(state).slice(0, Math.min(config.maxInboxItems, 4));
    host.innerHTML = `
      <div class="news-inbox-header">
        <div>
          <h3>Caixa de entrada</h3>
          <p>Notícias ainda não marcadas como lidas.</p>
        </div>
        <div class="chip-row">
          <span class="chip accent">${unreadItems.length}</span>
          <button type="button" class="btn btn-ghost" id="newsMarkAllBtn"${unreadItems.length ? "" : " disabled"}>Marcar tudo</button>
        </div>
      </div>
      ${unreadItems.length ? `
        <div class="news-inbox-list">
          ${unreadItems.map((item) => `
            <button type="button" class="news-inbox-item" data-news-open="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.source)} · ${escapeHtml(formatRelativeTime(item.publishedAt))}</span>
            </button>
          `).join("")}
        </div>
      ` : '<div class="news-empty">Inbox limpa. Quando surgirem novas manchetes, elas aparecem aqui.</div>'}
    `;
  }

  function renderDigestCard(items) {
    const host = document.getElementById("newsDigestCard");
    if (!host) return;
    const state = getState();
    const latestSources = getSourceOptions()
      .filter((item) => item.id !== "all")
      .slice(0, 6)
      .map((item) => `<span class="chip neutral">${escapeHtml(item.label)}</span>`)
      .join("");
    const updatedAt = runtime.payload ? formatDateTime(runtime.payload.updatedAt) : "Sem atualização";
    const browserStatus = !("Notification" in window)
      ? "navegador sem suporte"
      : Notification.permission === "granted"
        ? (state.newsBrowserNotificationsEnabled ? "alertas ativos" : "alertas desativados")
        : Notification.permission === "denied"
          ? "permissão negada"
          : "permissão pendente";
    host.innerHTML = `
      <div class="news-inbox-header">
        <div>
          <h3>Resumo do feed</h3>
          <p>Estado da coleta, filtros e alertas.</p>
        </div>
      </div>
      <div class="news-digest-grid">
        <div class="metric"><div class="label">Feed</div><div class="value">${items.length}</div><div class="subvalue">itens visíveis</div></div>
        <div class="metric"><div class="label">Atualização</div><div class="value">${escapeHtml(updatedAt)}</div><div class="subvalue">última coleta</div></div>
        <div class="metric"><div class="label">Alertas</div><div class="value">${escapeHtml(browserStatus)}</div><div class="subvalue">navegador</div></div>
      </div>
      <div class="news-source-cloud">${latestSources || '<span class="chip neutral">Sem fontes carregadas</span>'}</div>
    `;
  }

  function renderStatusChips() {
    const updatedAtChip = document.getElementById("newsUpdatedAtChip");
    const unreadChip = document.getElementById("newsUnreadChip");
    const permissionBtn = document.getElementById("newsPermissionBtn");
    const unreadCount = getUnreadItems().length;
    if (updatedAtChip) {
      const label = runtime.isRefreshing
        ? "Atualizando feed..."
        : runtime.payload
          ? `Atualizado ${formatRelativeTime(runtime.payload.updatedAt)}`
          : "Sem feed";
      updatedAtChip.textContent = label;
    }
    if (unreadChip) {
      unreadChip.textContent = `${unreadCount} nova${unreadCount === 1 ? "" : "s"}`;
      unreadChip.dataset.tone = unreadCount ? "accent" : "neutral";
    }
    if (permissionBtn) {
      const enabled = getState().newsBrowserNotificationsEnabled;
      if (!("Notification" in window)) {
        permissionBtn.textContent = "Alertas indisponíveis";
        permissionBtn.disabled = true;
      } else if (Notification.permission === "granted") {
        permissionBtn.textContent = enabled ? "Alertas ativos" : "Ativar alertas";
      } else if (Notification.permission === "denied") {
        permissionBtn.textContent = "Permissão bloqueada";
      } else {
        permissionBtn.textContent = "Permitir alertas";
      }
    }
  }

  function render() {
    updateNavBadge();
    renderStatusChips();
    renderFilters();
    const items = getFilteredItems();
    renderLeadCard(items);
    renderFeedList(items);
    renderInboxCard();
    renderDigestCard(items);
  }

  function markItemsAsRead(ids) {
    const nextIds = dedupeIds([...(getState().newsSeenIds || []), ...ids]);
    commitState((draft) => {
      draft.newsSeenIds = nextIds;
    }, { render: false });
    render();
  }

  function findItem(itemId) {
    return runtime.payload ? runtime.payload.items.find((item) => item.id === itemId) || null : null;
  }

  function handleOpenItem(itemId, options = {}) {
    if (!itemId) return;
    markItemsAsRead([itemId]);
    if (!options.openSource) return;
    const item = findItem(itemId);
    if (item && item.url && item.url !== "#") {
      window.open(item.url, "_blank", "noopener");
    }
  }

  function maybeNotify(newItems) {
    if (!newItems.length) return;
    const state = getState();
    const signature = newItems.map((item) => item.id).join("|");
    if (runtime.lastNotifiedSignature === signature) return;
    runtime.lastNotifiedSignature = signature;
    showToast(`${newItems.length} notícia${newItems.length === 1 ? "" : "s"} nova${newItems.length === 1 ? "" : "s"} na caixa de entrada.`);
    if (!state.newsBrowserNotificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    newItems.slice(0, 3).forEach((item) => {
      try {
        const notification = new Notification(item.source, {
          body: item.title,
          tag: `news-${item.id}`,
          silent: false
        });
        notification.onclick = () => {
          window.focus();
          handleOpenItem(item.id, { openSource: true });
          notification.close();
        };
      } catch (_error) {
        // ignore
      }
    });
  }

  function handleFetchedPayload(payload) {
    runtime.payload = payload;
    runtime.lastFetchError = null;
    const state = getState();
    const currentKnown = dedupeIds(state.newsKnownIds || []);
    const nextKnown = dedupeIds([...payload.items.map((item) => item.id), ...currentKnown]);
    const firstLoad = currentKnown.length === 0;
    const newItemIds = payload.items.map((item) => item.id).filter((id) => !currentKnown.includes(id));
    commitState((draft) => {
      draft.newsKnownIds = nextKnown;
      draft.newsLastSyncAt = payload.updatedAt || new Date().toISOString();
      if (firstLoad && !(draft.newsSeenIds || []).length) {
        draft.newsSeenIds = dedupeIds(payload.items.slice(5).map((item) => item.id));
      }
    }, { render: false });
    render();
    if (!firstLoad) {
      maybeNotify(payload.items.filter((item) => newItemIds.includes(item.id)));
    }
  }

  async function fetchFeed(options = {}) {
    if (runtime.fetchPromise) {
      if (options.force === true) {
        return runtime.fetchPromise.finally(() => fetchFeed({ ...options, force: false }));
      }
      return runtime.fetchPromise;
    }
    setRefreshButtonState(true);
    runtime.fetchPromise = fetch(`${NEWS_PATH}?ts=${Date.now()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Falha ao carregar notícias (${response.status})`);
        return response.json();
      })
      .then((payload) => {
        handleFetchedPayload(sanitizePayload(payload));
        if (options.showSuccess) {
          showToast("Feed de noticias atualizado.");
        }
      })
      .catch((error) => {
        runtime.lastFetchError = error;
        if (options.silent !== true) showToast("Não foi possível atualizar o feed de notícias.");
        render();
      })
      .finally(() => {
        setRefreshButtonState(false);
        runtime.fetchPromise = null;
      });
    return runtime.fetchPromise;
  }

  function setCategory(category) {
    runtime.feedVisibleCount = 6;
    commitState((draft) => {
      draft.newsCategory = typeof category === "string" && category ? category : "all";
    }, { render: false });
    render();
  }

  function setSource(source) {
    runtime.feedVisibleCount = 6;
    commitState((draft) => {
      draft.newsSource = typeof source === "string" && source ? source : "all";
    }, { render: false });
    render();
  }

  async function toggleBrowserAlerts() {
    if (!("Notification" in window)) {
      showToast("Seu navegador não suporta notificações.");
      return;
    }
    const state = getState();
    if (Notification.permission === "granted") {
      commitState((draft) => {
        draft.newsBrowserNotificationsEnabled = !Boolean(state.newsBrowserNotificationsEnabled);
      }, { render: false });
      render();
      showToast(getState().newsBrowserNotificationsEnabled ? "Alertas de notícias ativados." : "Alertas de notícias desativados.");
      return;
    }
    if (Notification.permission === "denied") {
      showToast("Permissão de notificação bloqueada no navegador.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      commitState((draft) => {
        draft.newsBrowserNotificationsEnabled = true;
      }, { render: false });
      render();
      showToast("Alertas de notícias ativados.");
    } else {
      showToast("Permissão de notificação não concedida.");
    }
  }

  function bindEvents() {
    const page = document.getElementById("newsPage");
    if (!page || page.getAttribute("data-news-bound") === "true") return;
    page.setAttribute("data-news-bound", "true");

    page.addEventListener("click", (event) => {
      const categoryBtn = event.target.closest("[data-news-category]");
      if (categoryBtn) {
        setCategory(categoryBtn.getAttribute("data-news-category"));
        return;
      }

      const sourceBtn = event.target.closest("[data-news-source]");
      if (sourceBtn) {
        setSource(sourceBtn.getAttribute("data-news-source"));
        return;
      }

      const showMoreBtn = event.target.closest("[data-news-show-more]");
      if (showMoreBtn) {
        runtime.feedVisibleCount += 6;
        render();
        return;
      }

      const openLink = event.target.closest("[data-news-open]");
      if (openLink) {
        handleOpenItem(openLink.getAttribute("data-news-open"), { openSource: openLink.tagName !== "A" });
        return;
      }

      const markRead = event.target.closest("[data-news-mark-read]");
      if (markRead) {
        markItemsAsRead([markRead.getAttribute("data-news-mark-read")]);
        return;
      }

      const markAll = event.target.closest("#newsMarkAllBtn");
      if (markAll) {
        markItemsAsRead(getUnreadItems().map((item) => item.id));
      }
    });

    const refreshBtn = document.getElementById("newsRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        fetchFeed({ silent: false, force: true, showSuccess: true });
      });
    }

    const permissionBtn = document.getElementById("newsPermissionBtn");
    if (permissionBtn) {
      permissionBtn.addEventListener("click", () => {
        toggleBrowserAlerts();
      });
    }

    page.addEventListener("change", (event) => {
      const sourceSelect = event.target.closest ? event.target.closest("#newsSourceSelect") : null;
      if (sourceSelect) {
        setSource(sourceSelect.value);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetchFeed({ silent: true });
    });
  }

  function startPolling() {
    if (runtime.pollTimer) clearInterval(runtime.pollTimer);
    const intervalMs = Math.max(1, getConfig().pollMinutes) * 60 * 1000;
    runtime.pollTimer = window.setInterval(() => {
      fetchFeed({ silent: true });
    }, intervalMs);
  }

  function init() {
    if (runtime.initialized) return;
    runtime.initialized = true;
    bindEvents();
    startPolling();
    fetchFeed({ silent: true });
  }

  window.NewsFeed = {
    init,
    render,
    fetchFeed
  };
})();
