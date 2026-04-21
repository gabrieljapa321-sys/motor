/* ═══════════════════════════════════════════════════════════
     MOTOR DE ESTUDO · Notícias Financeiras
     Feeds RSS do Valor Econômico via rss2json.com (gratuito)
     Atualiza a cada 60 minutos automaticamente.
   ═══════════════════════════════════════════════════════════ */

(function () {

  /* ── Configuração dos feeds ───────────────────────────────── */
  const FEEDS = [
    {
      label: "Valor Econômico · Finanças",
      url: "https://www.valor.com.br/financas/rss",
      tag: "finanças",
    },
    {
      label: "Valor Econômico · Mercados",
      url: "https://www.valor.com.br/mercados/rss",
      tag: "mercados",
    },
    {
      label: "Valor Econômico · Fundos",
      url: "https://www.valor.com.br/financas/fundos-de-investimento/rss",
      tag: "fundos",
    },
    {
      label: "Valor Econômico · Brasil",
      url: "https://www.valor.com.br/brasil/rss",
      tag: "brasil",
    },
  ];

  // AllOrigins: proxy CORS-free, funciona em localhost e produção
  const ALLORIGINS = "https://api.allorigins.win/get?url=";
  const CACHE_KEY = "motor_news_cache";
  const CACHE_TTL = 60 * 60 * 1000; // 60 minutos
  let refreshTimer = null;
  let currentFilter = "todos";

  /* ── Cache helpers ────────────────────────────────────────── */
  function saveCache(data) {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), data })
      );
    } catch (_) {}
  }

  function loadCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  /* ── Fetch de um feed ─────────────────────────────────────── */
  async function fetchFeed(feed) {
    const url = `${RSS2JSON}${encodeURIComponent(feed.url)}&count=15`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== "ok") throw new Error("Feed inválido");
    return json.items.map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      description: stripHtml(item.description || ""),
      tag: feed.tag,
      source: feed.label,
    }));
  }

  /* ── Fetch de todos os feeds em paralelo ──────────────────── */
  async function fetchAllFeeds() {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const items = [];
    results.forEach((r) => {
      if (r.status === "fulfilled") items.push(...r.value);
    });
    // ordena do mais recente para o mais antigo
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    return items;
  }

  /* ── Utilitários ──────────────────────────────────────────── */
  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").slice(0, 220).trim();
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    return `há ${d}d`;
  }

  function tagColor(tag) {
    const map = {
      finanças: "var(--accent)",
      mercados: "var(--success)",
      fundos: "#9333ea",
      brasil: "var(--warning)",
    };
    return map[tag] || "var(--muted)";
  }

  /* ── Render ───────────────────────────────────────────────── */
  function renderSkeleton() {
    const container = document.getElementById("newsContainer");
    if (!container) return;
    container.innerHTML = `
      <div class="news-header">
        <div class="news-filters-wrap">
          <div class="news-skeleton-pill"></div>
          <div class="news-skeleton-pill"></div>
          <div class="news-skeleton-pill"></div>
          <div class="news-skeleton-pill"></div>
        </div>
        <div class="news-skeleton-pill" style="width:80px;height:22px;"></div>
      </div>
      <div class="news-grid">
        ${Array(6).fill(0).map(() => `
          <div class="news-card news-card-skeleton">
            <div class="news-sk-tag"></div>
            <div class="news-sk-title"></div>
            <div class="news-sk-title" style="width:70%"></div>
            <div class="news-sk-desc"></div>
          </div>`).join("")}
      </div>`;
  }

  function renderError(msg) {
    const container = document.getElementById("newsContainer");
    if (!container) return;
    container.innerHTML = `
      <div class="news-error">
        <div class="news-error-icon">⚠</div>
        <p>${msg}</p>
        <button class="btn btn-ghost" onclick="window.newsModule.refresh()">Tentar novamente</button>
      </div>`;
  }

  function renderNews(items, lastUpdated) {
    const container = document.getElementById("newsContainer");
    if (!container) return;

    const tags = ["todos", ...FEEDS.map((f) => f.tag)];
    const filtered =
      currentFilter === "todos"
        ? items
        : items.filter((i) => i.tag === currentFilter);

    const timeStr = lastUpdated
      ? new Date(lastUpdated).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

    container.innerHTML = `
      <div class="news-header">
        <div class="news-filters-wrap" role="group" aria-label="Filtrar por categoria">
          ${tags.map((t) => `
            <button
              class="news-filter-btn${currentFilter === t ? " active" : ""}"
              data-tag="${t}"
              aria-pressed="${currentFilter === t}"
            >${t}</button>`).join("")}
        </div>
        <span class="news-updated" title="Última atualização">↻ ${timeStr}</span>
      </div>

      ${filtered.length === 0
        ? `<div class="news-empty">Nenhuma notícia encontrada nesta categoria.</div>`
        : `<div class="news-grid">
            ${filtered.map((item) => `
              <a class="news-card" href="${item.link}" target="_blank" rel="noopener noreferrer">
                <div class="news-card-meta">
                  <span class="news-tag" style="background:${tagColor(item.tag)}20;color:${tagColor(item.tag)}">${item.tag}</span>
                  <span class="news-time">${timeAgo(item.pubDate)}</span>
                </div>
                <h3 class="news-title">${item.title}</h3>
                ${item.description ? `<p class="news-desc">${item.description}</p>` : ""}
              </a>`).join("")}
          </div>`}`;

    // Bind filter buttons
    container.querySelectorAll(".news-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.tag;
        renderNews(items, lastUpdated);
      });
    });
  }

  /* ── Carregamento principal ───────────────────────────────── */
  async function load(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) {
        renderNews(cached.items, cached.ts);
        scheduleRefresh();
        return;
      }
    }

    renderSkeleton();

    try {
      const items = await fetchAllFeeds();
      if (items.length === 0) throw new Error("Nenhum item retornado.");
      const ts = Date.now();
      saveCache({ items, ts });
      renderNews(items, ts);
    } catch (err) {
      console.warn("[news] Erro ao carregar feeds:", err);
      renderError(
        "Não foi possível carregar as notícias. Verifique sua conexão."
      );
    }

    scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => load(true), CACHE_TTL);
  }

  /* ── API pública ──────────────────────────────────────────── */
  window.newsModule = {
    /** Chamado quando o usuário abre a aba de notícias */
    init() {
      load(false);
    },
    /** Força recarregamento (botão retry ou puxar pra atualizar) */
    refresh() {
      load(true);
    },
  };

})();
