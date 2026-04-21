(function () {
  "use strict";

  function waitForApp(fn, tries) {
    const attempt = tries || 0;
    if (typeof state !== "undefined" && typeof saveState === "function" && typeof DATA !== "undefined") {
      fn();
      return;
    }
    if (attempt < 50) {
      setTimeout(function () {
        waitForApp(fn, attempt + 1);
      }, 100);
      return;
    }
    console.error("[flashcards] app não carregou");
  }

  waitForApp(function () {
    if (!Array.isArray(state.flashcards)) state.flashcards = [];
    if (!Array.isArray(state.examSimulations)) state.examSimulations = [];
    if (!state.exerciseProgress || typeof state.exerciseProgress !== "object") state.exerciseProgress = {};
    if (state.fcSubview !== "exercises") state.fcSubview = "flashcards";
    if (typeof state.exerciseSubjectFilter !== "string" || !state.exerciseSubjectFilter) state.exerciseSubjectFilter = "ALL";
    if (typeof state.currentExerciseId !== "string") state.currentExerciseId = null;

    const originalHydrate = hydrateStateFromRaw;
    hydrateStateFromRaw = function (raw) {
      const result = originalHydrate(raw);
      result.flashcards = Array.isArray(result.flashcards) ? result.flashcards : (Array.isArray(raw && raw.flashcards) ? raw.flashcards : []);
      result.examSimulations = Array.isArray(result.examSimulations) ? result.examSimulations : (Array.isArray(raw && raw.examSimulations) ? raw.examSimulations : []);
      result.exerciseProgress = result.exerciseProgress && typeof result.exerciseProgress === "object"
        ? result.exerciseProgress
        : (raw && raw.exerciseProgress && typeof raw.exerciseProgress === "object" ? raw.exerciseProgress : {});
      result.fcSubview = result.fcSubview === "exercises" ? "exercises" : "flashcards";
      result.exerciseSubjectFilter = typeof result.exerciseSubjectFilter === "string" && result.exerciseSubjectFilter
        ? result.exerciseSubjectFilter
        : "ALL";
      result.currentExerciseId = typeof result.currentExerciseId === "string" ? result.currentExerciseId : null;
      return result;
    };

    function toIsoDate(date) {
      const d = date instanceof Date ? date : new Date(date);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    function daysBetween(a, b) {
      const da = new Date(toIsoDate(a));
      const db = new Date(toIsoDate(b));
      return Math.round((db - da) / 86400000);
    }

    function escapeHtml(value) {
      if (value == null) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function uid(prefix) {
      return (prefix || "id_") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function formatTime(sec) {
      const minutes = Math.floor(sec / 60);
      const seconds = Math.max(0, Math.floor(sec % 60));
      return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    }

    function setText(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    }

    function getSubjectByCode(code) {
      return (DATA.subjects || []).find(function (subject) {
        return subject.code === code;
      }) || null;
    }

    const MIN_EASE = 1.3;
    const DEFAULT_EASE = 2.5;
    const FC_VIEW_META = {
      flashcards: {
        title: "Flashcards",
        description: "Memorização ativa com repetição espaçada (SM-2). Revise só o que venceu hoje e deixe o restante consolidar."
      },
      exercises: {
        title: "Exercícios",
        description: "Enunciado primeiro, pistas só quando travar, resolução por último. A ideia aqui é praticar prova antiga sem transformar tudo em leitura passiva."
      }
    };
    const EXERCISE_STATUS_LABELS = {
      none: "Novo",
      trying: "Tentando",
      stuck: "Travou",
      solvedSolo: "Resolvido sozinho",
      solvedWithHelp: "Resolvido com ajuda"
    };
    const EXERCISE_STATUS_SHORT = {
      none: "Novo",
      trying: "Tentando",
      stuck: "Travou",
      solvedSolo: "Sozinho",
      solvedWithHelp: "Com ajuda"
    };

    function createFlashcard(front, back, subjectCode) {
      const card = {
        id: uid("fc_"),
        subjectCode: subjectCode || null,
        front: String(front || "").trim(),
        back: String(back || "").trim(),
        interval: 0,
        ease: DEFAULT_EASE,
        reps: 0,
        due: toIsoDate(new Date()),
        createdAt: new Date().toISOString(),
        lapses: 0
      };
      state.flashcards.push(card);
      saveState();
      renderFlashcardsPage();
      return card;
    }

    function applySM2(card, rating) {
      const now = new Date();
      if (rating === 0) {
        card.reps = 0;
        card.interval = 0;
        card.lapses = (card.lapses || 0) + 1;
        card.ease = Math.max(MIN_EASE, card.ease - 0.2);
        card.due = toIsoDate(now);
        return;
      }

      card.reps = (card.reps || 0) + 1;
      if (card.reps === 1) {
        card.interval = rating === 1 ? 1 : (rating === 2 ? 1 : 3);
      } else if (card.reps === 2) {
        card.interval = rating === 1 ? 3 : (rating === 2 ? 6 : 9);
      } else {
        let mult = card.ease;
        if (rating === 1) mult = Math.max(1.2, card.ease * 0.85);
        else if (rating === 3) mult = card.ease * 1.15;
        card.interval = Math.round(card.interval * mult);
      }

      if (rating === 1) card.ease = Math.max(MIN_EASE, card.ease - 0.15);
      else if (rating === 3) card.ease = card.ease + 0.1;

      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + card.interval);
      card.due = toIsoDate(next);
    }

    let currentStudyCard = null;
    let currentDeckFilter = null;
    let studyRevealed = false;

    function getDueCards(filter) {
      const todayIso = toIsoDate(new Date());
      return state.flashcards.filter(function (card) {
        if (filter && card.subjectCode !== filter) return false;
        return (card.due || todayIso) <= todayIso;
      });
    }

    function simulateInterval(card, rating) {
      const clone = Object.assign({}, card);
      applySM2(clone, rating);
      return clone.interval;
    }

    function formatIntervalShort(days) {
      if (days <= 0) return "hoje";
      if (days === 1) return "1d";
      if (days < 30) return days + "d";
      if (days < 365) return Math.round(days / 30) + "m";
      return Math.round(days / 365) + "a";
    }

    function renderRateGrid() {
      const card = currentStudyCard;
      const simAgain = simulateInterval(card, 0);
      const simHard = simulateInterval(card, 1);
      const simGood = simulateInterval(card, 2);
      const simEasy = simulateInterval(card, 3);
      return (
        '<div class="fc-rate-grid">' +
          '<button class="fc-rate-btn fc-rate-btn--again" data-fc-rate="0" type="button"><strong>Errei</strong><span>' + formatIntervalShort(simAgain) + "</span></button>" +
          '<button class="fc-rate-btn fc-rate-btn--hard" data-fc-rate="1" type="button"><strong>Difícil</strong><span>' + formatIntervalShort(simHard) + "</span></button>" +
          '<button class="fc-rate-btn fc-rate-btn--good" data-fc-rate="2" type="button"><strong>OK</strong><span>' + formatIntervalShort(simGood) + "</span></button>" +
          '<button class="fc-rate-btn fc-rate-btn--easy" data-fc-rate="3" type="button"><strong>Fácil</strong><span>' + formatIntervalShort(simEasy) + "</span></button>" +
        "</div>"
      );
    }

    function renderFlashcardStudyPanel() {
      const panel = document.getElementById("fcStudyPanel");
      if (!panel) return;

      const dueCount = getDueCards(currentDeckFilter).length;
      const allCount = currentDeckFilter
        ? state.flashcards.filter(function (card) { return card.subjectCode === currentDeckFilter; }).length
        : state.flashcards.length;

      if (!currentStudyCard) {
        if (allCount === 0) {
          panel.innerHTML =
            '<div class="fc-study-empty">' +
              '<div class="fc-study-empty-icon">📇</div>' +
              "<h3>Sem flashcards ainda</h3>" +
              "<p>Crie seu primeiro cartão no painel à direita. Frente = pergunta ou conceito; verso = resposta curta. Comece pequeno e revise o que vencer hoje.</p>" +
            "</div>";
        } else {
          panel.innerHTML =
            '<div class="fc-study-empty">' +
              '<div class="fc-study-empty-icon">✓</div>' +
              "<h3>Nada para revisar agora</h3>" +
              "<p>Todos os cartões desse deck estão em dia. Volte quando o próximo lote vencer." +
                (allCount > dueCount ? "<br><br>Você tem " + allCount + " cartões nesse deck, mas nenhum para hoje." : "") +
              "</p>" +
            "</div>";
        }
        return;
      }

      const card = currentStudyCard;
      const subject = card.subjectCode ? getSubjectByCode(card.subjectCode) : null;
      const subjectLabel = subject ? (subject.shortName + " · " + subject.code) : "sem matéria";
      const daysLate = daysBetween(card.due, toIsoDate(new Date()));
      const ageTxt = daysLate > 0 ? ("+" + daysLate + "d atrasado") : "para hoje";

      panel.innerHTML =
        '<div class="fc-study-card">' +
          '<div class="fc-study-meta">' +
            '<span class="fc-study-subj">' + escapeHtml(subjectLabel) + "</span>" +
            '<span class="fc-study-counter">' + dueCount + " restantes · " + ageTxt + "</span>" +
          "</div>" +
          '<div class="fc-study-front">' + escapeHtml(card.front) + "</div>" +
          (studyRevealed
            ? '<div class="fc-study-back"><div class="fc-study-back-label">Resposta</div>' + escapeHtml(card.back) + "</div>"
            : "") +
          '<div class="fc-study-actions">' +
            (studyRevealed ? renderRateGrid() : '<button class="fc-reveal-btn" type="button" id="fcRevealBtn">Mostrar resposta</button>') +
          "</div>" +
        "</div>";

      if (!studyRevealed) {
        const revealButton = document.getElementById("fcRevealBtn");
        if (revealButton) {
          revealButton.addEventListener("click", function () {
            studyRevealed = true;
            renderFlashcardStudyPanel();
          });
        }
      } else {
        panel.querySelectorAll("[data-fc-rate]").forEach(function (button) {
          button.addEventListener("click", function () {
            const rating = parseInt(button.getAttribute("data-fc-rate"), 10);
            const cardToReview = currentStudyCard;
            if (!cardToReview) return;
            applySM2(cardToReview, rating);
            cardToReview.lastReview = new Date().toISOString();
            saveState();
            nextStudyCard();
          });
        });
      }
    }

    function nextStudyCard() {
      const due = getDueCards(currentDeckFilter);
      if (!due.length) {
        currentStudyCard = null;
      } else {
        due.sort(function (a, b) {
          const aDaysLate = daysBetween(a.due, toIsoDate(new Date()));
          const bDaysLate = daysBetween(b.due, toIsoDate(new Date()));
          if (aDaysLate !== bDaysLate) return bDaysLate - aDaysLate;
          if ((a.reps || 0) === 0 && (b.reps || 0) !== 0) return -1;
          if ((b.reps || 0) === 0 && (a.reps || 0) !== 0) return 1;
          return 0;
        });
        currentStudyCard = due[0];
      }
      studyRevealed = false;
      renderFlashcardStudyPanel();
    }

    function renderFlashcardsStats() {
      const todayIso = toIsoDate(new Date());
      const all = state.flashcards;
      const due = all.filter(function (card) { return (card.due || todayIso) <= todayIso; }).length;
      const newCount = all.filter(function (card) { return (card.reps || 0) === 0; }).length;
      const learned = all.filter(function (card) { return (card.interval || 0) >= 7; }).length;
      setText("fcStatDue", due);
      setText("fcStatNew", newCount);
      setText("fcStatLearned", learned);
      setText("fcStatTotal", all.length);
    }

    function renderDeckList() {
      const el = document.getElementById("fcDeckList");
      if (!el) return;

      const todayIso = toIsoDate(new Date());
      const allDue = state.flashcards.filter(function (card) { return (card.due || todayIso) <= todayIso; });
      const allCount = state.flashcards.length;
      const items = [
        '<button type="button" class="fc-deck-item" data-deck-filter=""' +
          (currentDeckFilter === null ? ' data-active="true"' : "") + ">" +
          "<span>Todas</span>" +
          '<span class="fc-deck-count">' + allDue.length + "/" + allCount + "</span>" +
        "</button>"
      ];

      (DATA.subjects || []).forEach(function (subject) {
        const cardsDeck = state.flashcards.filter(function (card) { return card.subjectCode === subject.code; });
        const deckDue = cardsDeck.filter(function (card) { return (card.due || todayIso) <= todayIso; });
        if (!cardsDeck.length) return;
        items.push(
          '<button type="button" class="fc-deck-item" data-deck-filter="' + escapeHtml(subject.code) + '"' +
            (currentDeckFilter === subject.code ? ' data-active="true"' : "") + ">" +
            "<span>" + escapeHtml(subject.shortName || subject.name) + "</span>" +
            '<span class="fc-deck-count">' + deckDue.length + "/" + cardsDeck.length + "</span>" +
          "</button>"
        );
      });

      if (items.length === 1) {
        el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 4px;line-height:1.5;">Nenhum cartão criado ainda.</div>';
        return;
      }

      el.innerHTML = items.join("");
      el.querySelectorAll("[data-deck-filter]").forEach(function (button) {
        button.addEventListener("click", function () {
          const filter = button.getAttribute("data-deck-filter") || null;
          currentDeckFilter = filter === "" ? null : filter;
          nextStudyCard();
          renderDeckList();
        });
      });
    }

    function getExercises() {
      if (Array.isArray(globalThis.EXERCISES)) return globalThis.EXERCISES.slice();
      if (window.StudyData && Array.isArray(window.StudyData.exercises)) return window.StudyData.exercises.slice();
      return [];
    }

    function getExerciseById(exerciseId) {
      return getExercises().find(function (exercise) {
        return exercise.id === exerciseId;
      }) || null;
    }

    function getExerciseStatusLabel(status, shortLabel) {
      if (!status) return shortLabel ? EXERCISE_STATUS_SHORT.none : EXERCISE_STATUS_LABELS.none;
      return shortLabel ? (EXERCISE_STATUS_SHORT[status] || EXERCISE_STATUS_SHORT.none) : (EXERCISE_STATUS_LABELS[status] || EXERCISE_STATUS_LABELS.none);
    }

    function getExerciseProgress(exerciseId) {
      const safe = state.exerciseProgress && state.exerciseProgress[exerciseId] && typeof state.exerciseProgress[exerciseId] === "object"
        ? state.exerciseProgress[exerciseId]
        : {};
      return {
        status: safe.status || null,
        hintsViewed: Math.max(0, Number(safe.hintsViewed || 0)),
        finalAnswerViewed: Boolean(safe.finalAnswerViewed),
        solutionViewed: Boolean(safe.solutionViewed),
        lastOpenedAt: safe.lastOpenedAt || null,
        updatedAt: safe.updatedAt || null
      };
    }

    function updateExerciseProgress(exerciseId, patch) {
      const current = getExerciseProgress(exerciseId);
      state.exerciseProgress = Object.assign({}, state.exerciseProgress, {
        [exerciseId]: Object.assign({}, current, patch, { updatedAt: new Date().toISOString() })
      });
      saveState();
      renderFlashcardsPage();
    }

    function getVisibleExercises() {
      const subjectOrder = {};
      (DATA.subjects || []).forEach(function (subject, index) {
        subjectOrder[subject.code] = index;
      });
      const statusRank = { trying: 0, stuck: 1, none: 2, solvedWithHelp: 3, solvedSolo: 4 };
      const currentFilter = state.exerciseSubjectFilter || "ALL";
      return getExercises()
        .filter(function (exercise) {
          return currentFilter === "ALL" ? true : exercise.subjectCode === currentFilter;
        })
        .sort(function (a, b) {
          const aStatus = getExerciseProgress(a.id).status || "none";
          const bStatus = getExerciseProgress(b.id).status || "none";
          if (statusRank[aStatus] !== statusRank[bStatus]) return statusRank[aStatus] - statusRank[bStatus];
          if (a.subjectCode !== b.subjectCode) return (subjectOrder[a.subjectCode] || 0) - (subjectOrder[b.subjectCode] || 0);
          if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
          return String(a.questionLabel || "").localeCompare(String(b.questionLabel || ""));
        });
    }

    function ensureCurrentExerciseSelection() {
      const visible = getVisibleExercises();
      if (!visible.length) {
        state.currentExerciseId = null;
        return null;
      }
      const current = visible.find(function (exercise) {
        return exercise.id === state.currentExerciseId;
      }) || visible[0];
      if (state.currentExerciseId !== current.id) {
        state.currentExerciseId = current.id;
        saveState();
      }
      return current;
    }

    function renderExerciseSubjectOptions() {
      const subjectSelect = document.getElementById("fcExerciseSubject");
      if (!subjectSelect) return;
      const exercises = getExercises();
      const availableCodes = new Set(exercises.map(function (exercise) { return exercise.subjectCode; }));
      const options = ['<option value="ALL">Todas</option>'];
      (DATA.subjects || []).forEach(function (subject) {
        if (!availableCodes.has(subject.code)) return;
        options.push('<option value="' + escapeHtml(subject.code) + '">' + escapeHtml(subject.code + " · " + (subject.shortName || subject.name)) + "</option>");
      });
      subjectSelect.innerHTML = options.join("");
      subjectSelect.value = availableCodes.has(state.exerciseSubjectFilter) || state.exerciseSubjectFilter === "ALL"
        ? state.exerciseSubjectFilter
        : "ALL";
    }

    function renderExerciseStats() {
      const exercises = getExercises();
      let trying = 0;
      let solved = 0;
      exercises.forEach(function (exercise) {
        const status = getExerciseProgress(exercise.id).status;
        if (status === "trying" || status === "stuck") trying += 1;
        if (status === "solvedSolo" || status === "solvedWithHelp") solved += 1;
      });
      const todo = Math.max(0, exercises.length - trying - solved);
      setText("fcExerciseStatTodo", todo);
      setText("fcExerciseStatTrying", trying);
      setText("fcExerciseStatSolved", solved);
      setText("fcExerciseStatTotal", exercises.length);
    }

    function renderExerciseList() {
      const listEl = document.getElementById("fcExerciseList");
      if (!listEl) return;
      const visible = getVisibleExercises();
      if (!visible.length) {
        listEl.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 4px;line-height:1.5;">Nenhum exercício encontrado nesse filtro.</div>';
        return;
      }

      listEl.innerHTML = visible.map(function (exercise) {
        const subject = getSubjectByCode(exercise.subjectCode);
        const progress = getExerciseProgress(exercise.id);
        const statusKey = progress.status || "none";
        const topics = Array.isArray(exercise.topics) ? exercise.topics.slice(0, 2).join(" · ") : "";
        return (
          '<button type="button" class="fc-exercise-item" data-exercise-id="' + escapeHtml(exercise.id) + '"' +
            (state.currentExerciseId === exercise.id ? ' data-active="true"' : "") + ">" +
            '<div class="fc-exercise-item-top">' +
              "<div>" +
                '<div class="fc-exercise-item-title">' + escapeHtml((subject ? subject.shortName : exercise.subjectCode) + " · " + (exercise.sourceLabel || "Exercício") + " · " + (exercise.questionLabel || "")) + "</div>" +
                '<div class="fc-exercise-item-sub">' + escapeHtml(topics || "Sem tópicos cadastrados") + "</div>" +
              "</div>" +
              '<span class="fc-exercise-item-status"' + (statusKey !== "none" ? ' data-status="' + escapeHtml(statusKey) + '"' : "") + ">" + escapeHtml(getExerciseStatusLabel(statusKey === "none" ? null : statusKey, true)) + "</span>" +
            "</div>" +
          "</button>"
        );
      }).join("");

      listEl.querySelectorAll("[data-exercise-id]").forEach(function (button) {
        button.addEventListener("click", function () {
          const exerciseId = button.getAttribute("data-exercise-id");
          state.currentExerciseId = exerciseId;
          updateExerciseProgress(exerciseId, { lastOpenedAt: new Date().toISOString() });
        });
      });
    }

    function renderExerciseStudyPanel() {
      const panel = document.getElementById("fcStudyPanel");
      if (!panel) return;
      const exercises = getExercises();
      if (!exercises.length) {
        panel.innerHTML =
          '<div class="fc-exercise-empty">' +
            "<h3>Sem base de exercícios ainda</h3>" +
            "<p>Adicione itens em <code>assets/data/exercises.json</code> para começar a praticar enunciado, pistas e resolução dentro do app.</p>" +
          "</div>";
        return;
      }

      const exercise = ensureCurrentExerciseSelection();
      if (!exercise) {
        panel.innerHTML =
          '<div class="fc-exercise-empty">' +
            "<h3>Nenhum exercício nesse filtro</h3>" +
            "<p>Troque a matéria à direita para ver outras questões cadastradas.</p>" +
          "</div>";
        return;
      }

      const progress = getExerciseProgress(exercise.id);
      const subject = getSubjectByCode(exercise.subjectCode);
      const hints = Array.isArray(exercise.hints) ? exercise.hints : [];
      const visibleHints = hints.slice(0, Math.min(progress.hintsViewed, hints.length));
      const topics = Array.isArray(exercise.topics) ? exercise.topics : [];
      const canRevealHint = visibleHints.length < hints.length;
      const progressBits = [
        "Status: " + getExerciseStatusLabel(progress.status),
        visibleHints.length + "/" + hints.length + " pistas",
        progress.finalAnswerViewed ? "resposta vista" : "resposta fechada",
        progress.solutionViewed ? "resolução vista" : "resolução fechada"
      ];

      const chipHtml = [
        '<span class="fc-exercise-chip">' + escapeHtml((subject ? subject.shortName : exercise.subjectCode) || "Matéria") + "</span>",
        exercise.sourceLabel ? '<span class="fc-exercise-chip">' + escapeHtml(exercise.sourceLabel) + "</span>" : "",
        exercise.questionLabel ? '<span class="fc-exercise-chip">' + escapeHtml(exercise.questionLabel) + "</span>" : "",
        exercise.difficulty ? '<span class="fc-exercise-chip">Nível ' + escapeHtml(String(exercise.difficulty)) + "/5</span>" : "",
        exercise.demo ? '<span class="fc-exercise-chip fc-exercise-chip--demo">demo</span>' : ""
      ].concat(topics.slice(0, 3).map(function (topic) {
        return '<span class="fc-exercise-chip">' + escapeHtml(topic) + "</span>";
      })).join("");

      const hintsHtml = visibleHints.length
        ? '<div class="fc-exercise-block"><div class="fc-study-back-label">Pistas liberadas</div><ol class="fc-exercise-list-steps">' +
          visibleHints.map(function (hint) { return "<li>" + escapeHtml(hint) + "</li>"; }).join("") +
          "</ol></div>"
        : "";

      const answerHtml = progress.finalAnswerViewed
        ? '<div class="fc-exercise-block"><div class="fc-study-back-label">Resposta final</div><p class="fc-exercise-answer">' + escapeHtml(exercise.finalAnswer || "Sem resposta cadastrada.") + "</p></div>"
        : "";

      const solutionHtml = progress.solutionViewed
        ? '<div class="fc-exercise-block"><div class="fc-study-back-label">Resolução guiada</div><ol class="fc-exercise-list-steps">' +
          (exercise.solutionSteps || []).map(function (step) { return "<li>" + escapeHtml(step) + "</li>"; }).join("") +
          "</ol>" +
          ((exercise.commonMistakes || []).length
            ? '<div class="fc-study-back-label">Erros comuns</div><ul class="fc-exercise-mistakes">' +
              exercise.commonMistakes.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") +
              "</ul>"
            : "") +
          "</div>"
        : "";

      panel.innerHTML = (
        '<div class="fc-exercise-view">' +
          '<div class="fc-exercise-meta">' +
            "<div>" +
              '<div class="fc-exercise-kicker">Exercício guiado</div>' +
              '<h3 class="fc-exercise-title">' + escapeHtml((exercise.sourceLabel || "Exercício") + " · " + (exercise.questionLabel || exercise.id)) + "</h3>" +
              '<div class="fc-exercise-chip-row">' + chipHtml + "</div>" +
            "</div>" +
            '<p class="fc-exercise-progress">' + escapeHtml(progressBits.join(" · ")) + "</p>" +
          "</div>" +
          (exercise.demo
            ? '<div class="fc-exercise-block"><div class="fc-study-back-label">Nota do MVP</div><p class="fc-exercise-inline-note">Este item é demonstrativo. A estrutura já está pronta para você trocar por enunciados reais de provas antigas, com a mesma sequência de pistas e resolução.</p></div>'
            : "") +
          '<div class="fc-exercise-block">' +
            '<div class="fc-study-back-label">Enunciado</div>' +
            '<p class="fc-exercise-text">' + escapeHtml(exercise.statementText || "Sem enunciado cadastrado.") + "</p>" +
          "</div>" +
          '<div class="fc-exercise-reveal-row">' +
            (canRevealHint ? '<button type="button" class="btn btn-soft" data-exercise-action="reveal-hint">Ver pista ' + escapeHtml(String(visibleHints.length + 1)) + "</button>" : "") +
            (!progress.finalAnswerViewed ? '<button type="button" class="btn btn-ghost" data-exercise-action="reveal-answer">Ver resposta final</button>' : "") +
            (!progress.solutionViewed ? '<button type="button" class="btn btn-primary" data-exercise-action="reveal-solution">Ver resolução</button>' : "") +
          "</div>" +
          hintsHtml +
          answerHtml +
          solutionHtml +
          '<div class="fc-exercise-block">' +
            '<div class="fc-study-back-label">Como você saiu daqui?</div>' +
            '<div class="fc-exercise-status-row">' +
              '<button type="button" class="btn btn-ghost" data-exercise-action="set-status" data-exercise-status="trying">Estou tentando</button>' +
              '<button type="button" class="btn btn-ghost" data-exercise-action="set-status" data-exercise-status="stuck">Travei</button>' +
              '<button type="button" class="btn btn-soft" data-exercise-action="set-status" data-exercise-status="solvedWithHelp">Resolvi com ajuda</button>' +
              '<button type="button" class="btn btn-primary" data-exercise-action="set-status" data-exercise-status="solvedSolo">Resolvi sozinho</button>' +
            "</div>" +
          "</div>" +
        "</div>"
      );

      panel.querySelectorAll("[data-exercise-action]").forEach(function (button) {
        button.addEventListener("click", function () {
          const action = button.getAttribute("data-exercise-action");
          const currentProgress = getExerciseProgress(exercise.id);
          if (action === "reveal-hint") {
            updateExerciseProgress(exercise.id, {
              status: currentProgress.status || "trying",
              hintsViewed: Math.min(currentProgress.hintsViewed + 1, hints.length),
              lastOpenedAt: new Date().toISOString()
            });
            return;
          }
          if (action === "reveal-answer") {
            updateExerciseProgress(exercise.id, {
              status: currentProgress.status || "trying",
              finalAnswerViewed: true,
              lastOpenedAt: new Date().toISOString()
            });
            return;
          }
          if (action === "reveal-solution") {
            updateExerciseProgress(exercise.id, {
              status: currentProgress.status || "trying",
              finalAnswerViewed: true,
              solutionViewed: true,
              lastOpenedAt: new Date().toISOString()
            });
            return;
          }
          if (action === "set-status") {
            updateExerciseProgress(exercise.id, {
              status: button.getAttribute("data-exercise-status") || null,
              lastOpenedAt: new Date().toISOString()
            });
          }
        });
      });
    }

    function renderSubviewChrome() {
      const isExercises = state.fcSubview === "exercises";
      const titleEl = document.getElementById("fcPageTitle");
      const descriptionEl = document.getElementById("fcPageDescription") || document.querySelector("#fcPage .fc-header p");
      const meta = FC_VIEW_META[isExercises ? "exercises" : "flashcards"];
      if (titleEl) titleEl.textContent = meta.title;
      if (descriptionEl) descriptionEl.textContent = meta.description;

      const flashStats = document.getElementById("fcFlashcardsStats");
      const exerciseStats = document.getElementById("fcExerciseStats");
      const flashAside = document.getElementById("fcFlashcardsAside");
      const exercisesAside = document.getElementById("fcExercisesAside");
      if (flashStats) flashStats.hidden = isExercises;
      if (exerciseStats) exerciseStats.hidden = !isExercises;
      if (flashAside) flashAside.hidden = isExercises;
      if (exercisesAside) exercisesAside.hidden = !isExercises;

      document.querySelectorAll("#fcSubviewToggle [data-fc-view]").forEach(function (button) {
        button.setAttribute("aria-selected", button.getAttribute("data-fc-view") === state.fcSubview ? "true" : "false");
      });
    }

    function renderFlashcardsPage() {
      renderSubviewChrome();
      if (state.fcSubview === "exercises") {
        renderExerciseSubjectOptions();
        renderExerciseStats();
        renderExerciseList();
        renderExerciseStudyPanel();
        return;
      }

      renderFlashcardsStats();
      renderDeckList();
      if (!currentStudyCard || currentStudyCard.due > toIsoDate(new Date())) nextStudyCard();
      else renderFlashcardStudyPanel();
    }

    window.renderFlashcardsPage = renderFlashcardsPage;

    function setFcSubview(view) {
      const nextView = view === "exercises" ? "exercises" : "flashcards";
      if (state.fcSubview === nextView) return;
      state.fcSubview = nextView;
      saveState();
      renderFlashcardsPage();
    }

    function setupCreateForm() {
      const form = document.getElementById("fcCreateForm");
      const subjectSelect = document.getElementById("fcCreateSubject");
      if (!form || !subjectSelect || form.dataset.bound === "true") return;

      const opts = ['<option value="">—</option>'];
      (DATA.subjects || []).forEach(function (subject) {
        opts.push('<option value="' + escapeHtml(subject.code) + '">' +
          escapeHtml(subject.code) + " · " + escapeHtml(subject.shortName || subject.name) + "</option>");
      });
      subjectSelect.innerHTML = opts.join("");
      form.dataset.bound = "true";

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        const front = document.getElementById("fcCreateFront").value.trim();
        const back = document.getElementById("fcCreateBack").value.trim();
        const subjectCode = subjectSelect.value || null;
        if (!front || !back) return;
        createFlashcard(front, back, subjectCode);
        document.getElementById("fcCreateFront").value = "";
        document.getElementById("fcCreateBack").value = "";
        if (typeof showToast === "function") showToast("Cartão criado");
      });
    }

    function setupExerciseControls() {
      const toggle = document.getElementById("fcSubviewToggle");
      if (toggle && toggle.dataset.bound !== "true") {
        toggle.dataset.bound = "true";
        toggle.querySelectorAll("[data-fc-view]").forEach(function (button) {
          button.addEventListener("click", function () {
            setFcSubview(button.getAttribute("data-fc-view"));
          });
        });
      }

      const subjectSelect = document.getElementById("fcExerciseSubject");
      if (subjectSelect && subjectSelect.dataset.bound !== "true") {
        subjectSelect.dataset.bound = "true";
        subjectSelect.addEventListener("change", function () {
          state.exerciseSubjectFilter = subjectSelect.value || "ALL";
          state.currentExerciseId = null;
          saveState();
          renderFlashcardsPage();
        });
      }
    }

    const fcPage = document.getElementById("fcPage");
    if (fcPage) {
      const obs = new MutationObserver(function () {
        if (!fcPage.hasAttribute("hidden")) renderFlashcardsPage();
      });
      obs.observe(fcPage, { attributes: true, attributeFilter: ["hidden"] });
    }

    setupCreateForm();
    setupExerciseControls();

    let examState = null;
    let examInterval = null;
    let examPickerCtx = null;
    let examUnloadHandler = null;

    function openExamPicker(subjectCode) {
      const subject = getSubjectByCode(subjectCode);
      if (!subject) return;

      const exams = (subject.sources || []).filter(function (source) {
        const kind = String(source.kind || "").toLowerCase();
        return kind.includes("prova") || kind.includes("gabarito");
      });

      const backdrop = document.getElementById("examPickerBackdrop");
      const titleEl = document.getElementById("examPickerTitle");
      const listEl = document.getElementById("examPickerList");
      if (!backdrop || !titleEl || !listEl) return;

      titleEl.textContent = "Simular prova · " + (subject.shortName || subject.name);
      if (!exams.length) {
        listEl.innerHTML = '<div class="session-hint">Sem provas antigas cadastradas nas fontes desta matéria.</div>';
      } else {
        listEl.innerHTML = exams.map(function (exam) {
          return (
            '<button class="exam-picker-item" type="button" data-exam-src="' + escapeHtml(exam.name) + '">' +
              '<div class="exam-picker-item-body">' +
                '<div class="exam-picker-item-name">' + escapeHtml(exam.name) + "</div>" +
                '<div class="exam-picker-item-why">' + escapeHtml(exam.why || exam.kind || "") + "</div>" +
              "</div>" +
            "</button>"
          );
        }).join("");
      }

      document.querySelectorAll("#examPickerDuration .exam-picker-duration-btn").forEach(function (button) {
        button.removeAttribute("data-selected");
      });
      const defaultDuration = document.querySelector('#examPickerDuration [data-min="120"]');
      if (defaultDuration) defaultDuration.setAttribute("data-selected", "true");

      document.querySelectorAll("#examPickerNq .exam-picker-duration-btn").forEach(function (button) {
        button.removeAttribute("data-selected");
      });
      const defaultQuestions = document.querySelector('#examPickerNq [data-nq="4"]');
      if (defaultQuestions) defaultQuestions.setAttribute("data-selected", "true");

      examPickerCtx = {
        subjectCode: subjectCode,
        durationMin: 120,
        numQuestions: 4,
        source: null
      };

      listEl.querySelectorAll(".exam-picker-item").forEach(function (button) {
        button.addEventListener("click", function () {
          listEl.querySelectorAll(".exam-picker-item").forEach(function (item) {
            item.style.borderColor = "";
            item.style.background = "";
          });
          button.style.borderColor = "var(--accent)";
          button.style.background = "var(--accent-soft)";
          examPickerCtx.source = button.getAttribute("data-exam-src");
        });
      });

      backdrop.setAttribute("data-open", "true");
      backdrop.setAttribute("aria-hidden", "false");
    }

    function closeExamPicker() {
      const backdrop = document.getElementById("examPickerBackdrop");
      if (backdrop) backdrop.removeAttribute("data-open");
    }

    function startExam(ctx) {
      const subject = getSubjectByCode(ctx.subjectCode);
      examState = {
        subjectCode: ctx.subjectCode,
        subjectName: subject ? (subject.shortName || subject.name) : ctx.subjectCode,
        sourceName: ctx.source,
        durationMin: ctx.durationMin,
        numQuestions: ctx.numQuestions,
        startedAt: Date.now(),
        endsAt: Date.now() + ctx.durationMin * 60 * 1000,
        questionTimes: new Array(ctx.numQuestions).fill(null)
      };

      const title = document.getElementById("examTitle");
      const subjectEl = document.getElementById("examSubj");
      const marker = document.getElementById("examQMarker");
      const overlay = document.getElementById("examOverlay");
      if (title) title.textContent = ctx.source;
      if (subjectEl) subjectEl.textContent = examState.subjectName + " · " + ctx.subjectCode;
      if (marker) {
        const buttons = [];
        for (let i = 0; i < ctx.numQuestions; i += 1) {
          buttons.push('<button class="exam-q-btn" type="button" data-q-idx="' + i + '">Q' + (i + 1) + "</button>");
        }
        marker.innerHTML = buttons.join("");
        marker.querySelectorAll("[data-q-idx]").forEach(function (button) {
          button.addEventListener("click", function () {
            const idx = parseInt(button.getAttribute("data-q-idx"), 10);
            const now = Date.now();
            if (examState.questionTimes[idx] == null) {
              examState.questionTimes[idx] = Math.round((now - examState.startedAt) / 1000);
              button.setAttribute("data-marked", "true");
            } else {
              examState.questionTimes[idx] = null;
              button.removeAttribute("data-marked");
            }
          });
        });
      }

      if (overlay) {
        overlay.setAttribute("data-open", "true");
        overlay.setAttribute("aria-hidden", "false");
      }

      if (examInterval) clearInterval(examInterval);
      examInterval = setInterval(updateExamTimer, 500);
      updateExamTimer();

      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(function () {});
        }
      } catch (error) {}

      examUnloadHandler = function (e) {
        e.preventDefault();
        e.returnValue = "Simulação em andamento. Quer mesmo sair?";
        return e.returnValue;
      };
      window.addEventListener("beforeunload", examUnloadHandler);
    }

    function updateExamTimer() {
      if (!examState) return;
      const remainingMs = examState.endsAt - Date.now();
      const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
      const totalSec = examState.durationMin * 60;
      const progress = 100 * (1 - remainingSec / totalSec);

      const big = document.getElementById("examBigTimer");
      const small = document.getElementById("examTimerSmall");
      const fill = document.getElementById("examProgressFill");
      const txt = formatTime(remainingSec);
      if (big) big.textContent = txt;
      if (small) small.textContent = txt;
      if (fill) fill.style.width = progress + "%";

      let stateAttr = "";
      if (remainingSec < totalSec * 0.1) stateAttr = "danger";
      else if (remainingSec < totalSec * 0.25) stateAttr = "warning";

      [big, small, fill].forEach(function (element) {
        if (!element) return;
        if (stateAttr) element.setAttribute("data-state", stateAttr);
        else element.removeAttribute("data-state");
      });

      if (remainingSec <= 0) {
        clearInterval(examInterval);
        examInterval = null;
        finishExam(false);
      }
    }

    function finishExam(cancelled) {
      if (!examState) return;
      if (examInterval) {
        clearInterval(examInterval);
        examInterval = null;
      }
      if (examUnloadHandler) {
        window.removeEventListener("beforeunload", examUnloadHandler);
        examUnloadHandler = null;
      }
      try {
        if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      } catch (error) {}

      const overlay = document.getElementById("examOverlay");
      if (overlay) overlay.removeAttribute("data-open");
      examState.actualSec = Math.round((Date.now() - examState.startedAt) / 1000);

      if (cancelled) {
        if (typeof showToast === "function") showToast("Simulação cancelada");
        examState = null;
        return;
      }
      openExamResult(examState);
    }

    function openExamResult(exState) {
      const backdrop = document.getElementById("examResultBackdrop");
      const summary = document.getElementById("examResultSummary");
      const grade = document.getElementById("examResultGrade");
      const notes = document.getElementById("examResultNotes");
      if (!backdrop || !summary || !grade || !notes) return;

      grade.value = "";
      notes.value = "";
      document.querySelectorAll('[data-rating-group="pace"] .session-rating-opt').forEach(function (button) {
        button.removeAttribute("data-selected");
      });

      const actualMin = Math.round(exState.actualSec / 60);
      const qTimes = exState.questionTimes
        .map(function (value, index) { return value == null ? null : { q: index + 1, sec: value }; })
        .filter(Boolean);

      let qDetails = "";
      if (qTimes.length > 0) {
        const times = qTimes.map(function (item, index) {
          const prev = index > 0 ? qTimes[index - 1].sec : 0;
          const diff = item.sec - prev;
          return "Q" + item.q + ": " + Math.round(diff / 60) + "min";
        }).join(" · ");
        qDetails = '<br><span class="mono" style="font-size:11px;opacity:.75;">Por questão: ' + times + "</span>";
      }

      summary.innerHTML =
        "<strong>" + escapeHtml(exState.sourceName) + "</strong>" +
        'Tempo real: <span class="mono">' + actualMin + " min</span> de " + exState.durationMin + " min planejados" +
        qDetails;

      backdrop.setAttribute("data-open", "true");
    }

    function renderExamHistory() {
      const container = document.getElementById("examHistoryCard");
      if (!container) return;
      const sims = (state.examSimulations || []).slice().reverse().slice(0, 6);
      if (!sims.length) {
        container.style.display = "none";
        return;
      }

      container.style.display = "";
      const items = sims.map(function (sim) {
        const grade = sim.grade;
        let tone = "warning";
        if (grade != null) {
          if (grade >= 5) tone = "success";
          else if (grade < 3) tone = "danger";
        }
        const date = new Date(sim.startedAt);
        const dateStr = String(date.getDate()).padStart(2, "0") + "/" + String(date.getMonth() + 1).padStart(2, "0");
        return (
          '<div class="exam-history-item exam-history-item--' + tone + '">' +
            '<div class="exam-history-body">' +
              '<div class="exam-history-top">' + escapeHtml(sim.sourceName) + ' <span class="retention-code">' + escapeHtml(sim.subjectCode || "") + "</span></div>" +
              '<div class="exam-history-meta">' +
                dateStr + " · " + sim.actualMin + "min / " + sim.durationMin + "min" +
                (sim.pace ? " · ritmo " + (sim.pace === "ok" ? "ok" : sim.pace === "slow" ? "lento" : "apertado") : "") +
                (sim.notes ? " · " + escapeHtml(sim.notes.substring(0, 50)) : "") +
              "</div>" +
            "</div>" +
            '<div class="exam-history-grade">' + (grade != null ? Number(grade).toFixed(1) : "—") + "</div>" +
          "</div>"
        );
      }).join("");

      container.innerHTML =
        '<h3 class="retention-title">Últimas simulações de prova</h3>' +
        '<div class="exam-history-list">' + items + "</div>";
    }

    function injectExamLaunchers() {
      const grid = document.getElementById("subjectGrid");
      if (!grid) return;
      grid.querySelectorAll(".subject-card").forEach(function (card) {
        if (card.querySelector(".exam-launch-btn")) return;
        let code = card.getAttribute("data-subject-code");
        if (!code) {
          const codeEl = card.querySelector(".subject-code");
          if (codeEl) code = codeEl.textContent.trim();
        }
        if (!code) return;

        const subject = getSubjectByCode(code);
        if (!subject) return;
        const hasExams = (subject.sources || []).some(function (source) {
          return String(source.kind || "").toLowerCase().includes("prova");
        });
        if (!hasExams) return;

        const badges = card.querySelector(".subject-badges") || card.querySelector(".chip-row");
        if (!badges) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "exam-launch-btn";
        button.textContent = "Simular prova";
        button.addEventListener("click", function (e) {
          e.stopPropagation();
          openExamPicker(code);
        });
        badges.appendChild(button);
      });
    }

    function setupExamControls() {
      window.openExamPicker = openExamPicker;

      document.querySelectorAll("#examPickerDuration .exam-picker-duration-btn").forEach(function (button) {
        button.addEventListener("click", function () {
          document.querySelectorAll("#examPickerDuration .exam-picker-duration-btn").forEach(function (item) {
            item.removeAttribute("data-selected");
          });
          button.setAttribute("data-selected", "true");
          if (examPickerCtx) examPickerCtx.durationMin = parseInt(button.getAttribute("data-min"), 10);
        });
      });

      document.querySelectorAll("#examPickerNq .exam-picker-duration-btn").forEach(function (button) {
        button.addEventListener("click", function () {
          document.querySelectorAll("#examPickerNq .exam-picker-duration-btn").forEach(function (item) {
            item.removeAttribute("data-selected");
          });
          button.setAttribute("data-selected", "true");
          if (examPickerCtx) examPickerCtx.numQuestions = parseInt(button.getAttribute("data-nq"), 10);
        });
      });

      const pickerCancel = document.getElementById("examPickerCancel");
      if (pickerCancel) pickerCancel.addEventListener("click", closeExamPicker);
      const pickerStart = document.getElementById("examPickerStart");
      if (pickerStart) {
        pickerStart.addEventListener("click", function () {
          if (!examPickerCtx) return;
          if (!examPickerCtx.source) {
            if (typeof showToast === "function") showToast("Selecione uma prova primeiro");
            return;
          }
          closeExamPicker();
          startExam(examPickerCtx);
        });
      }

      document.querySelectorAll('[data-rating-group="pace"]').forEach(function (group) {
        group.addEventListener("click", function (e) {
          const button = e.target.closest(".session-rating-opt");
          if (!button) return;
          group.querySelectorAll(".session-rating-opt").forEach(function (item) {
            item.removeAttribute("data-selected");
          });
          button.setAttribute("data-selected", "true");
        });
      });

      const examResultForm = document.getElementById("examResultForm");
      if (examResultForm) {
        examResultForm.addEventListener("submit", function (e) {
          e.preventDefault();
          if (!examState) return;

          const gradeValue = parseFloat(document.getElementById("examResultGrade").value);
          const notes = document.getElementById("examResultNotes").value.trim();
          const paceEl = document.querySelector('[data-rating-group="pace"] [data-selected="true"]');
          const pace = paceEl ? paceEl.getAttribute("data-rating-value") : null;

          state.examSimulations.push({
            id: uid("exs_"),
            subjectCode: examState.subjectCode,
            sourceName: examState.sourceName,
            startedAt: new Date(examState.startedAt).toISOString(),
            durationMin: examState.durationMin,
            actualMin: Math.round(examState.actualSec / 60),
            grade: Number.isNaN(gradeValue) ? null : gradeValue,
            pace: pace,
            notes: notes || null,
            questionTimes: examState.questionTimes
          });

          saveState();
          document.getElementById("examResultBackdrop").removeAttribute("data-open");
          examState = null;
          if (typeof showToast === "function") showToast("Simulação registrada");
          renderExamHistory();
        });
      }

      const examResultSkip = document.getElementById("examResultSkip");
      if (examResultSkip) {
        examResultSkip.addEventListener("click", function () {
          document.getElementById("examResultBackdrop").removeAttribute("data-open");
          examState = null;
          if (typeof showToast === "function") showToast("Simulação descartada");
        });
      }

      const examCancelBtn = document.getElementById("examCancelBtn");
      if (examCancelBtn) {
        examCancelBtn.addEventListener("click", function () {
          if (confirm("Cancelar simulação? Os tempos coletados serão descartados.")) finishExam(true);
        });
      }

      const examFinishBtn = document.getElementById("examFinishBtn");
      if (examFinishBtn) {
        examFinishBtn.addEventListener("click", function () {
          if (confirm("Encerrar simulação agora?")) finishExam(false);
        });
      }

      const subjectGrid = document.getElementById("subjectGrid");
      if (subjectGrid) {
        const gridObserver = new MutationObserver(function () {
          clearTimeout(gridObserver._timer);
          gridObserver._timer = setTimeout(injectExamLaunchers, 80);
        });
        gridObserver.observe(subjectGrid, { childList: true, subtree: true });
        injectExamLaunchers();
      }

      const dashboardPage = document.getElementById("dashboardPage");
      if (dashboardPage) {
        const dashObserver = new MutationObserver(function () {
          if (!dashboardPage.hasAttribute("hidden")) setTimeout(renderExamHistory, 80);
        });
        dashObserver.observe(dashboardPage, { attributes: true, attributeFilter: ["hidden"] });
      }

      ["examPickerBackdrop", "examResultBackdrop"].forEach(function (id) {
        const backdrop = document.getElementById(id);
        if (!backdrop) return;
        backdrop.addEventListener("click", function (e) {
          if (e.target === backdrop) backdrop.removeAttribute("data-open");
        });
      });

      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        ["examPickerBackdrop", "examResultBackdrop"].forEach(function (id) {
          const backdrop = document.getElementById(id);
          if (backdrop && backdrop.getAttribute("data-open") === "true") backdrop.removeAttribute("data-open");
        });
      });
    }

    setupExamControls();
    renderExamHistory();
    setTimeout(renderExamHistory, 500);
    console.log("[flashcards] flashcards, exercícios e modo prova inicializados");
  });
})();
