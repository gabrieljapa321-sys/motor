(function () {
  "use strict";

  const TICKER_PATH = "assets/data/ticker-tape.json";
  const DEFAULT_CONFIG = {
    pollMinutes: 10
  };

  const runtime = {
    payload: null,
    initialized: false,
    pollTimer: null,
    fetchPromise: null
  };

  function getApp() {
    return window.StudyApp || null;
  }

  function getConfig() {
    const app = getApp();
    return {
      ...DEFAULT_CONFIG,
      ...((app && app.tickerConfig) || {})
    };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function formatPrice(value, currency, decimals) {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    if (currency === "BRL") {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: typeof decimals === "number" ? decimals : 2,
        maximumFractionDigits: typeof decimals === "number" ? decimals : 2
      }).format(value);
    }
    if (currency === "PTS") {
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: typeof decimals === "number" ? decimals : 0,
        maximumFractionDigits: typeof decimals === "number" ? decimals : 0
      }).format(value) + " pts";
    }
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: typeof decimals === "number" ? decimals : 2,
      maximumFractionDigits: typeof decimals === "number" ? decimals : 2
    }).format(value);
  }

  function formatChange(value) {
    if (typeof value !== "number" || Number.isNaN(value)) return { text: "0,00%", tone: "flat" };
    const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
    const signal = value > 0 ? "+" : "";
    const text = `${signal}${value.toFixed(2).replace(".", ",")}%`;
    return { text, tone };
  }

  function sanitizePayload(payload) {
    return {
      updatedAt: payload && typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString(),
      items: ensureArray(payload && payload.items).map((item, index) => ({
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `ticker-${index}`,
        symbol: typeof item.symbol === "string" ? item.symbol.trim() : "",
        label: typeof item.label === "string" ? item.label.trim() : "",
        price: typeof item.price === "number" ? item.price : null,
        displayPrice: typeof item.displayPrice === "string" && item.displayPrice.trim()
          ? item.displayPrice.trim()
          : formatPrice(typeof item.price === "number" ? item.price : NaN, item.currency, item.decimals),
        changePercent: typeof item.changePercent === "number" ? item.changePercent : 0,
        href: typeof item.href === "string" ? item.href.trim() : "",
        currency: typeof item.currency === "string" ? item.currency.trim() : "BRL",
        decimals: typeof item.decimals === "number" ? item.decimals : undefined,
        source: typeof item.source === "string" ? item.source.trim() : ""
      })).filter((item) => item.symbol || item.label)
    };
  }

  function render() {
    const shell = document.getElementById("tickerTapeShell");
    const track = document.getElementById("tickerTapeTrack");
    if (!shell || !track) return;
    const items = runtime.payload ? runtime.payload.items : [];
    if (!items.length) {
      shell.hidden = true;
      track.innerHTML = "";
      return;
    }
    shell.hidden = false;
    const markup = items.map((item) => {
      const label = item.label || item.symbol;
      const href = item.href || "#";
      const change = formatChange(item.changePercent);
      return `
        <a class="ticker-tape-item" href="${escapeHtml(href)}" target="_blank" rel="noopener">
          <span class="ticker-tape-symbol">${escapeHtml(label)}</span>
          <span class="ticker-tape-price">${escapeHtml(item.displayPrice)}</span>
          <span class="ticker-tape-change" data-tone="${change.tone}">${escapeHtml(change.text)}</span>
        </a>
      `;
    }).join("");
    track.innerHTML = markup + markup;
  }

  async function fetchTape(options = {}) {
    if (runtime.fetchPromise) return runtime.fetchPromise;
    runtime.fetchPromise = fetch(`${TICKER_PATH}?ts=${Date.now()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Falha ao carregar ticker tape (${response.status})`);
        return response.json();
      })
      .then((payload) => {
        runtime.payload = sanitizePayload(payload);
        render();
      })
      .catch((error) => {
        if (!options.silent) console.error("[ticker-tape]", error);
      })
      .finally(() => {
        runtime.fetchPromise = null;
      });
    return runtime.fetchPromise;
  }

  function startPolling() {
    if (runtime.pollTimer) clearInterval(runtime.pollTimer);
    const intervalMs = Math.max(1, getConfig().pollMinutes) * 60 * 1000;
    runtime.pollTimer = window.setInterval(() => {
      fetchTape({ silent: true });
    }, intervalMs);
  }

  function init() {
    if (runtime.initialized) return;
    runtime.initialized = true;
    startPolling();
    fetchTape({ silent: true });
  }

  window.TickerTape = {
    init,
    fetchTape
  };
})();
