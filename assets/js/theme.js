(function () {
  "use strict";

  function getResolvedTheme(themeValue, matchMediaRef = window.matchMedia.bind(window)) {
    if (themeValue === "light" || themeValue === "dark") return themeValue;
    return matchMediaRef("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function themeButtonLabel(resolvedTheme) {
    return resolvedTheme === "dark"
      ? "Tema atual: escuro. Alternar tema"
      : "Tema atual: claro. Alternar tema";
  }

  function applyTheme(options) {
    const config = options || {};
    const resolved = getResolvedTheme(config.theme, config.matchMediaRef || window.matchMedia.bind(window));
    document.documentElement.dataset.theme = resolved;
    if (config.themeToggle) {
      const label = themeButtonLabel(resolved);
      config.themeToggle.title = label;
      config.themeToggle.setAttribute("aria-label", label);
    }
    return resolved;
  }

  function nextThemeValue(resolvedTheme) {
    return resolvedTheme === "dark" ? "light" : "dark";
  }

  function applyResponsiveLayout(body, innerWidth) {
    if (!body) return null;
    const layout = innerWidth <= 900 ? "mobile" : "browser";
    body.dataset.layout = layout;
    return layout;
  }

  window.StudyTheme = {
    getResolvedTheme,
    themeButtonLabel,
    applyTheme,
    nextThemeValue,
    applyResponsiveLayout
  };
})();
