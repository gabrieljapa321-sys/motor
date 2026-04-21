/* ═══════════════════════════════════════════════════════════
     MOTOR DE ESTUDO · Notícias Financeiras
     Feeds RSS do Valor Econômico via allorigins.win (gratuito)
     Atualiza a cada 60 minutos automaticamente.
   ═══════════════════════════════════════════════════════════ */

(function () {

  const FEEDS = [
    { label: "Valor Econômico · Finanças",  url: "https://www.valor.com.br/financas/rss",                          tag: "finanças" },
    { label: "Valor Econômico · Mercados",  url: "https://www.valor.com.br/mercados/rss",                          tag: "mercados" },
    { label: "Valor Econômico · Fundos",    url: "https://www.valor.com.br/financas/fundos-de-investimento/rss",   tag: "fundos"   },
    { label: "Valor Econômico · Brasil",    url: "https://www.valor.com.br/brasil/rss",                            tag: "brasil"   },
  ];

  const PROXY     = "https://api.allorigins.win/get?url=";
  const CACHE_KEY = "motor_news_cache";
  const CACHE_TTL = 60 * 60 * 1000;
  let refreshTimer  = null;
  let currentFilter = "todos";

  /* cache */
  function saveCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
  }
  function loadCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) return null;
      return data;
    } catch (_) { return null; }
  }

  /* fetch um feed */
  async function fetchFeed(feed) {
    const res = await fetch(`${PROXY}${encodeURIComponent(feed.url)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.contents) throw new Error("Resposta vazia");
    const xml   = new DOMParser().parseFromString(json.contents, "text/xml");
    const items = Array.from(xml.querySelectorAll("item"));
    if (!items.length) throw new Error("Feed vazio");
    return items.slice(0, 15).map((el) => {
      const t = (tag) => el.querySelector(tag)?.textContent?.trim() || "";
      return { title: t("title"), link: t("link") || t("guid"), pubDate: t("pubDate"), description: stripHtml(t("description")), tag: feed.tag };
    });
  }

  /* fetch todos */
  async function fetchAllFeeds() {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const items = [];
    results.forEach((r) => { if (r.status === "fulfilled") items.push(...r.value); else console.warn("[news]", r.reason); });
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    return items;
  }

  /* utils */
  function stripHtml(html) {
    const d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || d.innerText || "").slice(0, 220).trim();
  }
  function timeAgo(dateStr) {
    const min = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (min < 1)  return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24)   return `há ${h}h`;
    return `há ${Math.floor(h / 24)}d`;
  }
  function tagColor(tag) {
    return { finanças: "var(--accent)", mercados: "var(--success)", fundos: "#9333ea", brasil: "var(--warning)" }[tag] || "var(--muted)";
  }

  /* render skeleton */
  function renderSkeleton() {
    const c = document.getElementById("newsContainer"); if (!c) return;
    c.innerHTML = `<div class="news-header"><div class="news-filters-wrap">${Array(5).fill('<div class="news-skeleton-pill"></div>').join("")}</div><div class="news-skeleton-pill" style="width:80px"></div></div><div class="news-grid">${Array(6).fill(0).map(() => `<div class="news-card news-card-skeleton"><div class="news-sk-tag"></div><div class="news-sk-title"></div><div class="news-sk-title" style="width:70%"></div><div class="news-sk-desc"></div></div>`).join("")}</div>`;
  }

  /* render erro */
  function renderError(msg) {
    const c = document.getElementById("newsContainer"); if (!c) return;
    c.innerHTML = `<div class="news-error"><div class="news-error-icon">⚠</div><p>${msg}</p><button class="btn btn-ghost" onclick="window.newsModule.refresh()">Tentar novamente</button></div>`;
  }

  /* render noticias */
  function renderNews(items, ts) {
    const c = document.getElementById("newsContainer"); if (!c) return;
    const tags     = ["todos", ...FEEDS.map((f) => f.tag)];
    const filtered = currentFilter === "todos" ? items : items.filter((i) => i.tag === currentFilter);
    const timeStr  = ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
    c.innerHTML = `
      <div class="news-header">
        <div class="news-filters-wrap" role="group">
          ${tags.map((t) => `<button class="news-filter-btn${currentFilter === t ? " active" : ""}" data-tag="${t}">${t}</button>`).join("")}
        </div>
        <span class="news-updated">↻ ${timeStr}</span>
      </div>
      ${filtered.length === 0
        ? `<div class="news-empty">Nenhuma notícia nesta categoria.</div>`
        : `<div class="news-grid">${filtered.map((item) => `
            <a class="news-card" href="${item.link}" target="_blank" rel="noopener noreferrer">
              <div class="news-card-meta">
                <span class="news-tag" style="background:${tagColor(item.tag)}20;color:${tagColor(item.tag)}">${item.tag}</span>
                <span class="news-time">${timeAgo(item.pubDate)}</span>
              </div>
              <h3 class="news-title">${item.title}</h3>
              ${item.description ? `<p class="news-desc">${item.description}</p>` : ""}
            </a>`).join("")}</div>`}`;
    c.querySelectorAll(".news-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => { currentFilter = btn.dataset.tag; renderNews(items, ts); });
    });
  }

  /* load */
  async function load(force = false) {
    if (!force) {
      const cached = loadCache();
      if (cached) { renderNews(cached.items, cached.ts); scheduleRefresh(); return; }
    }
    renderSkeleton();
    try {
      const items = await fetchAllFeeds();
      if (!items.length) throw new Error("Sem itens");
      const ts = Date.now();
      saveCache({ items, ts });
      renderNews(items, ts);
    } catch (err) {
      console.warn("[news] erro:", err);
      renderError("Não foi possível carregar as notícias. Verifique sua conexão.");
    }
    scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => load(true), CACHE_TTL);
  }

  window.newsModule = { init() { load(false); }, refresh() { load(true); } };

})();