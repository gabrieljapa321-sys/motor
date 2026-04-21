(function () {
  "use strict";

  function parseDate(value) {
    const d = new Date(value + "T12:00:00");
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function startOfDay(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  function addDays(value, days) {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return startOfDay(next);
  }

  function startOfMonth(value) {
    return new Date(value.getFullYear(), value.getMonth(), 1);
  }

  function endOfMonth(value) {
    return new Date(value.getFullYear(), value.getMonth() + 1, 0);
  }

  function addMonths(value, months) {
    return new Date(value.getFullYear(), value.getMonth() + months, 1);
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }

  function formatMonthYear(value) {
    return capitalize(new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(value));
  }

  function toIsoDate(value) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(value);
  }

  function formatDateLong(value) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(value);
  }

  function daysBetween(a, b) {
    const ms = startOfDay(b) - startOfDay(a);
    return Math.round(ms / 86400000);
  }

  function formatTime(value) {
    if (!value) return "23:59";
    return value;
  }

  function formatDateTime(dateObj) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(dateObj);
  }

  function formatHeaderDate(referenceDate) {
    const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    if (Number.isNaN(date.getTime())) return "—";
    const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${weekdays[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
  }

  window.StudyDates = {
    parseDate,
    today,
    startOfDay,
    addDays,
    startOfMonth,
    endOfMonth,
    addMonths,
    isSameDay,
    capitalize,
    formatMonthYear,
    toIsoDate,
    formatDate,
    formatDateLong,
    daysBetween,
    formatTime,
    formatDateTime,
    formatHeaderDate
  };
})();
