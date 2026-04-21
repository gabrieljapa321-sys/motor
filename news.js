  /* ═══════════════════════════════════════════════════════════
     FLASHCARDS (SM-2) + MODO PROVA
     state.flashcards: [{id, subjectCode, front, back, interval, ease, reps, due, createdAt, lapses}]
     state.examSimulations: [{id, subjectCode, sourceName, startedAt, durationMin, actualMin, grade, pace, notes, questionTimes[]}]
     ═══════════════════════════════════════════════════════════ */
  (function () {
    'use strict';

    function waitForApp(fn, tries) {
      tries = tries || 0;
      if (typeof state !== 'undefined' && typeof saveState === 'function' && typeof DATA !== 'undefined') fn();
      else if (tries < 50) setTimeout(function () { waitForApp(fn, tries + 1); }, 100);
      else console.error('[advanced] app não carregou');
    }

    waitForApp(function () {
      // ── State shapes ──
      if (!Array.isArray(state.flashcards)) state.flashcards = [];
      if (!Array.isArray(state.examSimulations)) state.examSimulations = [];

      const originalHydrate = hydrateStateFromRaw;
      hydrateStateFromRaw = function (raw) {
        const result = originalHydrate(raw);
        result.flashcards = Array.isArray(raw && raw.flashcards) ? raw.flashcards : [];
        result.examSimulations = Array.isArray(raw && raw.examSimulations) ? raw.examSimulations : [];
        return result;
      };

      // ── Utils ──
      function toIsoDate(date) {
        const d = date instanceof Date ? date : new Date(date);
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      }
      function daysBetween(a, b) {
        const da = new Date(toIsoDate(a));
        const db = new Date(toIsoDate(b));
        return Math.round((db - da) / 86400000);
      }
      function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }
      function uid(prefix) {
        return (prefix || 'id_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      }
      function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.max(0, Math.floor(sec % 60));
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      }

      // ═══════════════════════════════════════════════════════════
      // FLASHCARDS · SM-2 (algoritmo SuperMemo 2 simplificado)
      // Ratings: 0=again, 1=hard, 2=good, 3=easy
      // ═══════════════════════════════════════════════════════════

      const MIN_EASE = 1.3;
      const DEFAULT_EASE = 2.5;

      function createFlashcard(front, back, subjectCode) {
        const card = {
          id: uid('fc_'),
          subjectCode: subjectCode || null,
          front: String(front || '').trim(),
          back: String(back || '').trim(),
          interval: 0,    // dias até próxima revisão
          ease: DEFAULT_EASE,
          reps: 0,
          due: toIsoDate(new Date()),  // disponível hoje
          createdAt: new Date().toISOString(),
          lapses: 0
        };
        state.flashcards.push(card);
        saveState();
        renderFlashcardsPage();
        return card;
      }

      function applySM2(card, rating) {
        // rating: 0 (again) | 1 (hard) | 2 (good) | 3 (easy)
        const now = new Date();

        if (rating === 0) {
          // Again — reset
          card.reps = 0;
          card.interval = 0;
          card.lapses = (card.lapses || 0) + 1;
          card.ease = Math.max(MIN_EASE, card.ease - 0.2);
          // Due hoje ainda (ou 10 min adiante, mas SM-2 puro reseta intervalo)
          card.due = toIsoDate(now);
        } else {
          card.reps = (card.reps || 0) + 1;

          // Primeira revisão: 1 dia. Segunda: 6 dias. Depois: interval * ease
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

          // Ajusta ease
          if (rating === 1) card.ease = Math.max(MIN_EASE, card.ease - 0.15);
          else if (rating === 3) card.ease = card.ease + 0.1;

          // Próximo due
          const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + card.interval);
          card.due = toIsoDate(next);
        }
      }

      function reviewCurrentCard(rating) {
        const card = currentStudyCard;
        if (!card) return;
        applySM2(card, rating);
        card.lastReview = new Date().toISOString();
        saveState();
        nextStudyCard();
      }

      let currentStudyCard = null;
      let currentDeckFilter = null; // null = todas, ou subjectCode
      let studyRevealed = false;

      function getDueCards(filter) {
        const todayIso = toIsoDate(new Date());
        return state.flashcards.filter(c => {
          if (filter && c.subjectCode !== filter) return false;
          return (c.due || todayIso) <= todayIso;
        });
      }

      function nextStudyCard() {
        const due = getDueCards(currentDeckFilter);
        // Prioriza: reps=0 (novos) antes, mas intercalando se tem muitos novos.
        // Simplificação: pega um aleatório entre os due
        if (due.length === 0) {
          currentStudyCard = null;
        } else {
          // Ordem estável mas rotativa: prioriza novos primeiro, depois dos atrasados
          due.sort((a, b) => {
            const aDaysLate = daysBetween(a.due, toIsoDate(new Date()));
            const bDaysLate = daysBetween(b.due, toIsoDate(new Date()));
            if (aDaysLate !== bDaysLate) return bDaysLate - aDaysLate; // mais atrasados primeiro
            if ((a.reps||0) === 0 && (b.reps||0) !== 0) return -1;
            if ((b.reps||0) === 0 && (a.reps||0) !== 0) return 1;
            return 0;
          });
          currentStudyCard = due[0];
        }
        studyRevealed = false;
        renderStudyPanel();
      }

      function renderStudyPanel() {
        const panel = document.getElementById('fcStudyPanel');
        if (!panel) return;

        const dueCount = getDueCards(currentDeckFilter).length;
        const allCount = currentDeckFilter
          ? state.flashcards.filter(c => c.subjectCode === currentDeckFilter).length
          : state.flashcards.length;

        if (!currentStudyCard) {
          // Sem cartões pra hoje
          if (allCount === 0) {
            panel.innerHTML =
              '<div class="fc-study-empty">' +
                '<div class="fc-study-empty-icon">📇</div>' +
                '<h3>Sem flashcards ainda</h3>' +
                '<p>Crie seu primeiro cartão no painel à direita. Frente = pergunta ou conceito; verso = resposta curta. Comece com poucos — 10 bons cartões valem mais que 100 ruins.</p>' +
              '</div>';
          } else {
            panel.innerHTML =
              '<div class="fc-study-empty">' +
                '<div class="fc-study-empty-icon">✓</div>' +
                '<h3>Nada pra revisar agora</h3>' +
                '<p>Todos os cartões desse deck estão em dia. Volta amanhã ou depois do próximo agendamento. ' +
                  (allCount > dueCount ? '<br><br>Você tem ' + allCount + ' cartões no deck, mas nenhum vencido hoje.' : '') +
                '</p>' +
              '</div>';
          }
          return;
        }

        const card = currentStudyCard;
        const subj = card.subjectCode
          ? DATA.subjects.find(s => s.code === card.subjectCode)
          : null;
        const subjLabel = subj ? (subj.shortName + ' · ' + subj.code) : 'sem matéria';
        const daysLate = daysBetween(card.due, toIsoDate(new Date()));
        const ageTxt = daysLate > 0 ? ('+' + daysLate + 'd atrasado') : 'para hoje';

        panel.innerHTML =
          '<div class="fc-study-card">' +
            '<div class="fc-study-meta">' +
              '<span class="fc-study-subj">' + escapeHtml(subjLabel) + '</span>' +
              '<span class="fc-study-counter">' + dueCount + ' restantes · ' + ageTxt + '</span>' +
            '</div>' +
            '<div class="fc-study-front">' + escapeHtml(card.front) + '</div>' +
            (studyRevealed
              ? '<div class="fc-study-back">' +
                  '<div class="fc-study-back-label">Resposta</div>' +
                  escapeHtml(card.back) +
                '</div>'
              : '') +
            '<div class="fc-study-actions">' +
              (studyRevealed
                ? renderRateGrid()
                : '<button class="fc-reveal-btn" type="button" id="fcRevealBtn">Mostrar resposta</button>') +
            '</div>' +
          '</div>';

        if (!studyRevealed) {
          const rev = document.getElementById('fcRevealBtn');
          if (rev) rev.addEventListener('click', function () {
            studyRevealed = true;
            renderStudyPanel();
          });
        } else {
          document.querySelectorAll('[data-fc-rate]').forEach(btn => {
            btn.addEventListener('click', function () {
              const r = parseInt(btn.getAttribute('data-fc-rate'), 10);
              reviewCurrentCard(r);
            });
          });
        }
      }

      function renderRateGrid() {
        // Preview dos próximos intervalos (dá ao user feedback do que cada rating significa)
        const card = currentStudyCard;
        const simAgain = simulateInterval(card, 0);
        const simHard = simulateInterval(card, 1);
        const simGood = simulateInterval(card, 2);
        const simEasy = simulateInterval(card, 3);

        return '<div class="fc-rate-grid">' +
          '<button class="fc-rate-btn fc-rate-btn--again" data-fc-rate="0" type="button">' +
            '<strong>Errei</strong><span>' + formatIntervalShort(simAgain) + '</span>' +
          '</button>' +
          '<button class="fc-rate-btn fc-rate-btn--hard" data-fc-rate="1" type="button">' +
            '<strong>Difícil</strong><span>' + formatIntervalShort(simHard) + '</span>' +
          '</button>' +
          '<button class="fc-rate-btn fc-rate-btn--good" data-fc-rate="2" type="button">' +
            '<strong>OK</strong><span>' + formatIntervalShort(simGood) + '</span>' +
          '</button>' +
          '<button class="fc-rate-btn fc-rate-btn--easy" data-fc-rate="3" type="button">' +
            '<strong>Fácil</strong><span>' + formatIntervalShort(simEasy) + '</span>' +
          '</button>' +
        '</div>';
      }

      function simulateInterval(card, rating) {
        // simulação não destrutiva
        const clone = Object.assign({}, card);
        applySM2(clone, rating);
        return clone.interval;
      }

      function formatIntervalShort(days) {
        if (days <= 0) return 'hoje';
        if (days === 1) return '1d';
        if (days < 30) return days + 'd';
        if (days < 365) return Math.round(days / 30) + 'm';
        return Math.round(days / 365) + 'a';
      }

      // ── Stats e deck list ──
      function renderFlashcardsStats() {
        const todayIso = toIsoDate(new Date());
        const all = state.flashcards;
        const due = all.filter(c => (c.due || todayIso) <= todayIso).length;
        const newC = all.filter(c => (c.reps || 0) === 0).length;
        const learned = all.filter(c => (c.interval || 0) >= 7).length;

        setText('fcStatDue', due);
        setText('fcStatNew', newC);
        setText('fcStatLearned', learned);
        setText('fcStatTotal', all.length);
      }

      function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
      }

      function renderDeckList() {
        const el = document.getElementById('fcDeckList');
        if (!el) return;

        const todayIso = toIsoDate(new Date());
        const allDue = state.flashcards.filter(c => (c.due || todayIso) <= todayIso);
        const allCount = state.flashcards.length;

        // Item "Todas"
        const items = [
          '<button type="button" class="fc-deck-item" data-deck-filter=""' +
            (currentDeckFilter === null ? ' data-active="true"' : '') + '>' +
            '<span>Todas</span>' +
            '<span class="fc-deck-count">' + allDue.length + '/' + allCount + '</span>' +
          '</button>'
        ];

        DATA.subjects.forEach(s => {
          const cardsDeck = state.flashcards.filter(c => c.subjectCode === s.code);
          const deckDue = cardsDeck.filter(c => (c.due || todayIso) <= todayIso);
          if (cardsDeck.length === 0) return;
          items.push(
            '<button type="button" class="fc-deck-item" data-deck-filter="' + escapeHtml(s.code) + '"' +
              (currentDeckFilter === s.code ? ' data-active="true"' : '') + '>' +
              '<span>' + escapeHtml(s.shortName || s.name) + '</span>' +
              '<span class="fc-deck-count">' + deckDue.length + '/' + cardsDeck.length + '</span>' +
            '</button>'
          );
        });

        if (items.length === 1) {
          // Sem nenhum deck ainda
          el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 4px;line-height:1.5;">Nenhum cartão criado ainda.</div>';
          return;
        }

        el.innerHTML = items.join('');

        el.querySelectorAll('[data-deck-filter]').forEach(btn => {
          btn.addEventListener('click', function () {
            const f = btn.getAttribute('data-deck-filter') || null;
            currentDeckFilter = f === '' ? null : f;
            nextStudyCard();
            renderDeckList();
          });
        });
      }

      function renderFlashcardsPage() {
        renderFlashcardsStats();
        renderDeckList();
        if (!currentStudyCard || (currentStudyCard && currentStudyCard.due > toIsoDate(new Date()))) {
          // Pega próximo se não tem ou se o atual já não está mais due
          nextStudyCard();
        } else {
          renderStudyPanel();
        }
      }

      // ── Form de criar cartão ──
      function setupCreateForm() {
        const form = document.getElementById('fcCreateForm');
        const subjectSelect = document.getElementById('fcCreateSubject');
        if (!form || !subjectSelect) return;

        // Popular select
        const opts = ['<option value="">—</option>'];
        DATA.subjects.forEach(s => {
          opts.push('<option value="' + escapeHtml(s.code) + '">' +
            escapeHtml(s.code) + ' · ' + escapeHtml(s.shortName || s.name) + '</option>');
        });
        subjectSelect.innerHTML = opts.join('');

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          const front = document.getElementById('fcCreateFront').value.trim();
          const back = document.getElementById('fcCreateBack').value.trim();
          const subjCode = subjectSelect.value || null;
          if (!front || !back) return;
          createFlashcard(front, back, subjCode);
          document.getElementById('fcCreateFront').value = '';
          document.getElementById('fcCreateBack').value = '';
          if (typeof showToast === 'function') showToast('Cartão criado');
        });
      }

      // ── Observer pra página fc ──
      const fcPage = document.getElementById('fcPage');
      if (fcPage) {
        const obs = new MutationObserver(function () {
          if (!fcPage.hasAttribute('hidden')) renderFlashcardsPage();
        });
        obs.observe(fcPage, { attributes: true, attributeFilter: ['hidden'] });
      }

      setupCreateForm();

      // ═══════════════════════════════════════════════════════════
      // MODO PROVA · overlay full-screen
      // ═══════════════════════════════════════════════════════════

      let examState = null;
      let examInterval = null;
      let examPickerCtx = null; // {subjectCode, durationMin, numQuestions, source}

      function openExamPicker(subjectCode) {
        const subj = DATA.subjects.find(s => s.code === subjectCode);
        if (!subj) return;

        // Filtrar sources que são provas antigas
        const exams = (subj.sources || []).filter(src => {
          const kind = String(src.kind || '').toLowerCase();
          return kind.includes('prova') || kind.includes('gabarito');
        });

        const backdrop = document.getElementById('examPickerBackdrop');
        const titleEl = document.getElementById('examPickerTitle');
        const listEl = document.getElementById('examPickerList');

        titleEl.textContent = 'Simular prova · ' + (subj.shortName || subj.name);

        if (exams.length === 0) {
          listEl.innerHTML = '<div class="session-hint">Sem provas antigas cadastradas nas fontes desta matéria. Adicione em DATA.sources pra poder simular.</div>';
        } else {
          listEl.innerHTML = exams.map(ex =>
            '<button class="exam-picker-item" type="button" data-exam-src="' + escapeHtml(ex.name) + '">' +
              '<div class="exam-picker-item-body">' +
                '<div class="exam-picker-item-name">' + escapeHtml(ex.name) + '</div>' +
                '<div class="exam-picker-item-why">' + escapeHtml(ex.why || ex.kind || '') + '</div>' +
              '</div>' +
            '</button>'
          ).join('');
        }

        // Reset duração + nq padrão
        document.querySelectorAll('#examPickerDuration .exam-picker-duration-btn').forEach(b => b.removeAttribute('data-selected'));
        document.querySelector('#examPickerDuration [data-min="120"]').setAttribute('data-selected', 'true');
        document.querySelectorAll('#examPickerNq .exam-picker-duration-btn').forEach(b => b.removeAttribute('data-selected'));
        document.querySelector('#examPickerNq [data-nq="4"]').setAttribute('data-selected', 'true');

        examPickerCtx = {
          subjectCode: subjectCode,
          durationMin: 120,
          numQuestions: 4,
          source: null
        };

        // Handlers
        listEl.querySelectorAll('.exam-picker-item').forEach(btn => {
          btn.addEventListener('click', function () {
            listEl.querySelectorAll('.exam-picker-item').forEach(b => b.style.borderColor = '');
            btn.style.borderColor = 'var(--accent)';
            btn.style.background = 'var(--accent-soft)';
            examPickerCtx.source = btn.getAttribute('data-exam-src');
          });
        });

        backdrop.setAttribute('data-open', 'true');
        backdrop.setAttribute('aria-hidden', 'false');
      }

      function closeExamPicker() {
        const b = document.getElementById('examPickerBackdrop');
        if (b) b.removeAttribute('data-open');
      }

      window.openExamPicker = openExamPicker;

      // Botões picker
      document.querySelectorAll('#examPickerDuration .exam-picker-duration-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          document.querySelectorAll('#examPickerDuration .exam-picker-duration-btn').forEach(b => b.removeAttribute('data-selected'));
          btn.setAttribute('data-selected', 'true');
          if (examPickerCtx) examPickerCtx.durationMin = parseInt(btn.getAttribute('data-min'), 10);
        });
      });
      document.querySelectorAll('#examPickerNq .exam-picker-duration-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          document.querySelectorAll('#examPickerNq .exam-picker-duration-btn').forEach(b => b.removeAttribute('data-selected'));
          btn.setAttribute('data-selected', 'true');
          if (examPickerCtx) examPickerCtx.numQuestions = parseInt(btn.getAttribute('data-nq'), 10);
        });
      });

      const pickerCancel = document.getElementById('examPickerCancel');
      if (pickerCancel) pickerCancel.addEventListener('click', closeExamPicker);
      const pickerStart = document.getElementById('examPickerStart');
      if (pickerStart) pickerStart.addEventListener('click', function () {
        if (!examPickerCtx) return;
        if (!examPickerCtx.source) {
          if (typeof showToast === 'function') showToast('Selecione uma prova primeiro');
          return;
        }
        closeExamPicker();
        startExam(examPickerCtx);
      });

      // ── Iniciar exame ──
      function startExam(ctx) {
        const subj = DATA.subjects.find(s => s.code === ctx.subjectCode);
        examState = {
          subjectCode: ctx.subjectCode,
          subjectName: subj ? (subj.shortName || subj.name) : ctx.subjectCode,
          sourceName: ctx.source,
          durationMin: ctx.durationMin,
          numQuestions: ctx.numQuestions,
          startedAt: Date.now(),
          endsAt: Date.now() + ctx.durationMin * 60 * 1000,
          questionTimes: new Array(ctx.numQuestions).fill(null),
          currentQuestion: 0
        };

        // Setup UI
        document.getElementById('examTitle').textContent = ctx.source;
        document.getElementById('examSubj').textContent = examState.subjectName + ' · ' + ctx.subjectCode;

        // Renderizar botões Qn
        const marker = document.getElementById('examQMarker');
        const btns = [];
        for (let i = 0; i < ctx.numQuestions; i++) {
          btns.push('<button class="exam-q-btn" type="button" data-q-idx="' + i + '">Q' + (i + 1) + '</button>');
        }
        marker.innerHTML = btns.join('');
        marker.querySelectorAll('[data-q-idx]').forEach(btn => {
          btn.addEventListener('click', function () {
            const idx = parseInt(btn.getAttribute('data-q-idx'), 10);
            const now = Date.now();
            // Se ainda não marcada, marcar
            if (examState.questionTimes[idx] == null) {
              examState.questionTimes[idx] = Math.round((now - examState.startedAt) / 1000);
              btn.setAttribute('data-marked', 'true');
            } else {
              // Desmarcar
              examState.questionTimes[idx] = null;
              btn.removeAttribute('data-marked');
            }
          });
        });

        // Mostrar overlay
        const overlay = document.getElementById('examOverlay');
        overlay.setAttribute('data-open', 'true');
        overlay.setAttribute('aria-hidden', 'false');

        // Iniciar timer
        if (examInterval) clearInterval(examInterval);
        examInterval = setInterval(updateExamTimer, 500);
        updateExamTimer();

        // Solicitar fullscreen (best effort)
        try {
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch (_) {}

        // Prevenir saída acidental (beforeunload)
        examUnloadHandler = function (e) {
          e.preventDefault();
          e.returnValue = 'Simulação em andamento. Quer mesmo sair-';
          return e.returnValue;
        };
        window.addEventListener('beforeunload', examUnloadHandler);
      }

      let examUnloadHandler = null;

      function updateExamTimer() {
        if (!examState) return;
        const remainingMs = examState.endsAt - Date.now();
        const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
        const totalSec = examState.durationMin * 60;
        const progress = 100 * (1 - remainingSec / totalSec);

        const big = document.getElementById('examBigTimer');
        const small = document.getElementById('examTimerSmall');
        const fill = document.getElementById('examProgressFill');

        const txt = formatTime(remainingSec);
        if (big) big.textContent = txt;
        if (small) small.textContent = txt;
        if (fill) fill.style.width = progress + '%';

        // Estados de alerta
        let stateAttr = '';
        if (remainingSec < totalSec * 0.1) stateAttr = 'danger';
        else if (remainingSec < totalSec * 0.25) stateAttr = 'warning';

        [big, small, fill].forEach(el => {
          if (!el) return;
          if (stateAttr) el.setAttribute('data-state', stateAttr);
          else el.removeAttribute('data-state');
        });

        if (remainingSec <= 0) {
          clearInterval(examInterval);
          examInterval = null;
          // Fim natural — abrir modal de resultado
          finishExam(false);
        }
      }

      function finishExam(cancelled) {
        if (!examState) return;

        if (examInterval) { clearInterval(examInterval); examInterval = null; }

        // Remover beforeunload
        if (examUnloadHandler) {
          window.removeEventListener('beforeunload', examUnloadHandler);
          examUnloadHandler = null;
        }

        // Sair de fullscreen
        try {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        } catch (_) {}

        // Esconder overlay
        const overlay = document.getElementById('examOverlay');
        overlay.removeAttribute('data-open');

        const actualSec = Math.round((Date.now() - examState.startedAt) / 1000);
        examState.actualSec = actualSec;

        if (cancelled) {
          if (typeof showToast === 'function') showToast('Simulação cancelada');
          examState = null;
          return;
        }

        // Abrir modal de resultado
        openExamResult(examState);
      }

      function openExamResult(exState) {
        const backdrop = document.getElementById('examResultBackdrop');
        const summary = document.getElementById('examResultSummary');
        const grade = document.getElementById('examResultGrade');
        const notes = document.getElementById('examResultNotes');

        grade.value = '';
        notes.value = '';
        document.querySelectorAll('[data-rating-group="pace"] .session-rating-opt').forEach(b => b.removeAttribute('data-selected'));

        const actualMin = Math.round(exState.actualSec / 60);
        const qTimes = exState.questionTimes
          .map((t, i) => t == null ? null : { q: i + 1, sec: t })
          .filter(x => x);

        let qDetails = '';
        if (qTimes.length > 0) {
          const times = qTimes.map((q, i) => {
            const prev = i > 0 ? qTimes[i-1].sec : 0;
            const diff = q.sec - prev;
            return 'Q' + q.q + ': ' + Math.round(diff / 60) + 'min';
          }).join(' · ');
          qDetails = '<br><span class="mono" style="font-size:11px;opacity:.75;">Por questão: ' + times + '</span>';
        }

        summary.innerHTML =
          '<strong>' + escapeHtml(exState.sourceName) + '</strong>' +
          'Tempo real: <span class="mono">' + actualMin + ' min</span> de ' + exState.durationMin + ' min planejados' +
          qDetails;

        backdrop.setAttribute('data-open', 'true');
      }

      // Binding ratings pace
      document.querySelectorAll('[data-rating-group="pace"]').forEach(group => {
        group.addEventListener('click', function (e) {
          const btn = e.target.closest('.session-rating-opt');
          if (!btn) return;
          group.querySelectorAll('.session-rating-opt').forEach(b => b.removeAttribute('data-selected'));
          btn.setAttribute('data-selected', 'true');
        });
      });

      // Form submit do result
      const examResultForm = document.getElementById('examResultForm');
      if (examResultForm) {
        examResultForm.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!examState) return;

          const grade = parseFloat(document.getElementById('examResultGrade').value);
          const notes = document.getElementById('examResultNotes').value.trim();
          const paceEl = document.querySelector('[data-rating-group="pace"] [data-selected="true"]');
          const pace = paceEl ? paceEl.getAttribute('data-rating-value') : null;

          state.examSimulations.push({
            id: uid('exs_'),
            subjectCode: examState.subjectCode,
            sourceName: examState.sourceName,
            startedAt: new Date(examState.startedAt).toISOString(),
            durationMin: examState.durationMin,
            actualMin: Math.round(examState.actualSec / 60),
            grade: !isNaN(grade) ? grade : null,
            pace: pace,
            notes: notes || null,
            questionTimes: examState.questionTimes
          });

          saveState();

          // Fechar modal
          document.getElementById('examResultBackdrop').removeAttribute('data-open');
          examState = null;

          if (typeof showToast === 'function') showToast('Simulação registrada');
          renderExamHistory();
        });
      }

      const examResultSkip = document.getElementById('examResultSkip');
      if (examResultSkip) examResultSkip.addEventListener('click', function () {
        document.getElementById('examResultBackdrop').removeAttribute('data-open');
        examState = null;
        if (typeof showToast === 'function') showToast('Simulação descartada');
      });

      // Cancelar + encerrar
      const examCancelBtn = document.getElementById('examCancelBtn');
      if (examCancelBtn) examCancelBtn.addEventListener('click', function () {
        if (confirm('Cancelar simulação- Os tempos coletados serão descartados.')) {
          finishExam(true);
        }
      });

      const examFinishBtn = document.getElementById('examFinishBtn');
      if (examFinishBtn) examFinishBtn.addEventListener('click', function () {
        if (confirm('Encerrar simulação agora-')) {
          finishExam(false);
        }
      });

      // ── Card de histórico de simulados no dashboard ──
      function renderExamHistory() {
        const container = document.getElementById('examHistoryCard');
        if (!container) return;
        const sims = (state.examSimulations || []).slice().reverse().slice(0, 6);
        if (sims.length === 0) {
          container.style.display = 'none';
          return;
        }
        container.style.display = '';

        const items = sims.map(sim => {
          const subj = DATA.subjects.find(s => s.code === sim.subjectCode);
          const g = sim.grade;
          let tone = 'warning';
          if (g != null) {
            if (g >= 5) tone = 'success';
            else if (g < 3) tone = 'danger';
          }
          const date = new Date(sim.startedAt);
          const dateStr = String(date.getDate()).padStart(2,'0') + '/' + String(date.getMonth()+1).padStart(2,'0');
          return '<div class="exam-history-item exam-history-item--' + tone + '">' +
            '<div class="exam-history-body">' +
              '<div class="exam-history-top">' +
                escapeHtml(sim.sourceName) +
                ' <span class="retention-code">' + escapeHtml(sim.subjectCode || '') + '</span>' +
              '</div>' +
              '<div class="exam-history-meta">' +
                dateStr + ' · ' + sim.actualMin + 'min / ' + sim.durationMin + 'min' +
                (sim.pace ? ' · ritmo ' + (sim.pace === 'ok' ? 'ok' : sim.pace === 'slow' ? 'lento' : 'apertado') : '') +
                (sim.notes ? ' · ' + escapeHtml(sim.notes.substring(0, 50)) : '') +
              '</div>' +
            '</div>' +
            '<div class="exam-history-grade">' + (g != null ? g.toFixed(1) : '—') + '</div>' +
          '</div>';
        }).join('');

        container.innerHTML =
          '<h3 class="retention-title">Últimas simulações de prova</h3>' +
          '<div class="exam-history-list">' + items + '</div>';
      }

      // ── Botão "Simular prova" nos subject-cards ──
      function injectExamLaunchers() {
        const grid = document.getElementById('subjectGrid');
        if (!grid) return;
        grid.querySelectorAll('.subject-card').forEach(card => {
          if (card.querySelector('.exam-launch-btn')) return;
          // Descobrir código da matéria pelo data-subject-code ou pelo conteúdo
          let code = card.getAttribute('data-subject-code');
          if (!code) {
            const codeEl = card.querySelector('.subject-code');
            if (codeEl) code = codeEl.textContent.trim();
          }
          if (!code) return;
          // Se não tem provas na lista de sources, não injeta
          const subj = DATA.subjects.find(s => s.code === code);
          if (!subj) return;
          const hasExams = (subj.sources || []).some(src => {
            const k = String(src.kind || '').toLowerCase();
            return k.includes('prova');
          });
          if (!hasExams) return;

          // Achar o row de badges pra adicionar botão
          const badges = card.querySelector('.subject-badges') || card.querySelector('.chip-row');
          if (!badges) return;

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'exam-launch-btn';
          btn.textContent = 'Simular prova';
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openExamPicker(code);
          });
          badges.appendChild(btn);
        });
      }

      // Observer pra subject-grid
      const subjGrid = document.getElementById('subjectGrid');
      if (subjGrid) {
        const obs = new MutationObserver(function () {
          clearTimeout(obs._t);
          obs._t = setTimeout(injectExamLaunchers, 80);
        });
        obs.observe(subjGrid, { childList: true, subtree: true });
        injectExamLaunchers();
      }

      // ── Render history on dashboard visible ──
      const dashboardPage = document.getElementById('dashboardPage');
      if (dashboardPage) {
        const obs = new MutationObserver(function () {
          if (!dashboardPage.hasAttribute('hidden')) {
            setTimeout(renderExamHistory, 80);
          }
        });
        obs.observe(dashboardPage, { attributes: true, attributeFilter: ['hidden'] });
      }
      setTimeout(renderExamHistory, 500);

      // Close backdrop clique
      ['examPickerBackdrop', 'examResultBackdrop'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', function (e) {
          if (e.target === b) b.removeAttribute('data-open');
        });
      });

      // Esc pra fechar modals (mas NÃO o exam-overlay ativo)
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        ['examPickerBackdrop', 'examResultBackdrop'].forEach(id => {
          const b = document.getElementById(id);
          if (b && b.getAttribute('data-open') === 'true') b.removeAttribute('data-open');
        });
      });

      console.log('[advanced] flashcards + modo prova inicializados');
    });
  })();
