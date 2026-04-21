(function () {
  "use strict";

  if (typeof window.bootStudyApp === "function") {
    window.bootStudyApp();
  } else {
    console.error("[app-init] bootStudyApp nao encontrado");
  }

  if (window.TickerTape && typeof window.TickerTape.init === "function") {
    window.TickerTape.init();
  }

  if ("serviceWorker" in navigator && /^https?:/i.test(window.location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js?v=20260421-homepanel1").catch((error) => {
        console.error("[pwa] falha ao registrar service worker:", error);
      });
    });
  }
})();
