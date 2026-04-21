/* ═══════════════════════════════════════════════════════════
     MOTOR DE ESTUDO · Notícias Financeiras
     Feeds: InfoMoney + MoneyTimes (RSS públicos confirmados)
     Atualiza a cada 60 minutos automaticamente.
   ═══════════════════════════════════════════════════════════ */

(function () {

  const FEEDS = [
    { label: "InfoMoney · Mercados",    url: "https://www.infomoney.com.br/mercados/feed",       tag: "mercados"  },
    { label: "InfoMoney · Onde Investir", url: "https://www.infomoney.com.br/onde-investir/feed", tag: "fundos"    },
    { label: "InfoMoney · Economia",    url: "https://www.infomoney.com.br/economia/feed",        tag: "economia"  },
    { label: "MoneyTimes · Mercados",   url: "https://moneytimes.com.br/mercados/feed",           tag: "bolsa"     },
  ];

  const PROXY     = "https://api.allorigins.win/get?url=";
  const CACHE_KEY = "motor_news_cache";
  const CACHE_TTL = 60 * 60 * 1000;
  let refreshTimer  = null;
  let currentFilter = "todos";

  /* ── cache ── */
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

  /* ── fetch um feed ── */
  async function fetchFeed(feed) {
    const res = await fetch(`${PROXY}${encodeURIComponent(feed.url)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${feed.label}`);
    const json = await res.json();
    if (!json.contents) throw new Error(`Resposta vazia: ${feed.label}`);

    // tenta XML (RSS padrão)
    const xml   = new DOMParser().parseFromString(json.contents, "text/xml");
    let items = Array.from(xml.querySelectorAll("item"));

    // fallback: Atom
    if (!items.length) items = Array.from(xml.querySelectorAll("entry"));
    if (!items.length) throw new Error(`Feed vazio: ${feed.label}`);

    return items.slice(0, 15).map((el) => {
      const t  = (tag) => el.querySelector(tag)?.textContent?.trim() || "";
      const tA = (tag, attr) => el.querySelector(tag)?.getAttribute(attr)?.trim() || "";
      return {
        title:       t("title"),
        link:        t("link") || tA("link", "href") || t("guid"),
        pubDate:     t("pubDate") || t("published") || t("updated"),
        description: stripHtml(t("description") || t("summary") || t("content")),
        tag:         feed.tag,
        source:      feed.label,
      };
    }).filter(i => i.title);
  }

  /* ── fetch todos — continua mesmo se alguns falharem ── */
  async function fetchAllFeeds() {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const items = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        items.push(...r.value);
      } else {
        console.warn(`[news] ${FEEDS[i].label} falhou:`, r.reason?.message);
      }
    });
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    return items;
  }

  /* ── utils ── */
  function stripHtml(html) {
    const d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || d.innerText || "").slice(0, 220).trim();
  }
  function timeAgo(dateStr) {
    const min = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (isNaN(min) || min < 0) return "";
    if (min < 1)  return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24)   return `há ${h}h`;
    return `há ${Math.floor(h / 24)}d`;
  }
  function tagColor(tag) {
    return { mercados: "var(--success)", fundos: "#9333ea", economia: "var(--accent)", bolsa: "#e11d48" }[tag] || "var(--muted)";
  }

  /* ── skeleton ── */
  function renderSkeleton() {
    const c = document.getElementById("newsContainer"); if (!c) return;
    c.innerHTML = `
      <div class="news-header">
        <div class="news-filters-wrap">${Array(5).fill('<div class="news-skeleton-pill"></div>').join("")}</div>
        <div class="news-skeleton-pill" style="width:80px"></div>
      </div>
      <div class="news-grid">
        ${Array(8).fill(0).map(() => `
          <div class="news-card news-card-skeleton">
            <div class="news-sk-tag"></div>
            <div class="news-sk-title"></div>
            <div class="news-sk-title" style="width:70%"></div>
            <div class="news-sk-desc"></div>
          </div>`).join("")}
      </div>`;
  }

  /* ── erro ── */
  function renderError(msg) {
    const c = document.getElementById("newsContainer"); if (!c) return;
    c.innerHTML = `
      <div class="news-error">
        <div class="news-error-icon">⚠</div>
        <p>${msg}</p>
        <button class="btn btn-ghost" onclick="window.newsModule.refresh()">Tentar novamente</button>
      </div>`;
  }

  /* ── render ── */
  function renderNews(items, ts) {
    const c = document.getElementById("newsContainer"); if (!c) return;
    const tags     = ["todos", ...FEEDS.map((f) => f.tag)];
    const filtered = currentFilter === "todos" ? items : items.filter((i) => i.tag === currentFilter);
    const timeStr  = ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

    c.innerHTML = `
      <div class="news-header">
        <div class="news-filters-wrap" role="group" aria-label="Filtrar por categoria">
          ${tags.map((t) => `<button class="news-filter-btn${currentFilter === t ? " active" : ""}" data-tag="${t}">${t}</button>`).join("")}
        </div>
        <span class="news-updated">↻ ${timeStr}</span>
      </div>
      ${filtered.length === 0
        ? `<div class="news-empty">Nenhuma notícia nesta categoria.</div>`
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

    c.querySelectorAll(".news-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => { currentFilter = btn.dataset.tag; renderNews(items, ts); });
    });
  }

  /* ── load ── */
  async function load(force = false) {
    if (!force) {
      const cached = loadCache();
      if (cached) { renderNews(cached.items, cached.ts); scheduleRefresh(); return; }
    }
    renderSkeleton();
    try {
      const items = await fetchAllFeeds();
      if (!items.length) throw new Error("Nenhum item retornado de nenhum feed");
      const ts = Date.now();
      saveCache({ items, ts });
      renderNews(items, ts);
    } catch (err) {
      console.warn("[news] erro geral:", err);
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
