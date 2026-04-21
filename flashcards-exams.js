  /*
     Recursos de estudo:
     - log real de exercicios
     - revisao espacada
     - pomodoro
     - autoavaliacao pos-sessao
     - alerta de retencao
  */
  (function () {
    'use strict';

    function waitForApp(fn, tries) {
      tries = tries || 0;
      if (typeof state !== 'undefined' &&
          typeof saveState === 'function' &&
          typeof completeTask === 'function') {
        fn();
      } else if (tries < 50) {
        setTimeout(function () { waitForApp(fn, tries + 1); }, 100);
      } else {
        console.error('[learning] app principal não carregou');
      }
    }

    waitForApp(function () {
      // ── Inicializar shapes novos no state ──
      if (!Array.isArray(state.examReviews)) state.examReviews = [];
      if (!state.sessionMinutesReal || typeof state.sessionMinutesReal !== 'object') {
        state.sessionMinutesReal = {};
      }

      // Wrap hydrate pra preservar em loads da nuvem
      const originalHydrate = hydrateStateFromRaw;
      hydrateStateFromRaw = function (raw) {
        const result = originalHydrate(raw);
        result.examReviews = Array.isArray(raw && raw.examReviews) ? raw.examReviews : [];
        result.sessionMinutesReal = (raw && raw.sessionMinutesReal && typeof raw.sessionMinutesReal === 'object')
          ? raw.sessionMinutesReal : {};
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

      function isoWeekKey(date) {
        // ISO week key: "YYYY-Www"
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = (d.getDay() + 6) % 7; // seg=0
        d.setDate(d.getDate() - day + 3);
        const firstThursday = new Date(d.getFullYear(), 0, 4);
        const diff = (d - firstThursday) / 86400000;
        const week = 1 + Math.round(diff / 7);
        return d.getFullYear() + '-W' + String(week).padStart(2, '0');
      }

      function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      // ═══════════════════════════════════════════════════════════
      // FEATURE 3: POMODORO TIMER
      // ═══════════════════════════════════════════════════════════

      const POMO_FOCUS_SEC = 25 * 60;
      const POMO_BREAK_SEC = 5 * 60;

      let pomoInterval = null;
      let pomoEndMs = null;
      let pomoPausedRemaining = null; // quando pausado, guarda ms restantes
      let pomoMode = 'focus'; // 'focus' | 'break'
      let pomoTaskId = null;
      let pomoStartMs = null;

      function pomoEl(id) { return document.getElementById(id); }

      function pomoFormat(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      }

      function pomoUpdateUI() {
        const bar = pomoEl('pomoBar');
        const time = pomoEl('pomoTime');
        const label = pomoEl('pomoLabel');
        const pauseBtn = pomoEl('pomoPauseBtn');
        if (!bar || !time) return;

        const remaining = pomoPausedRemaining != null
          ? Math.max(0, Math.round(pomoPausedRemaining / 1000))
          : pomoEndMs ? Math.max(0, Math.round((pomoEndMs - Date.now()) / 1000)) : 0;

        time.textContent = pomoFormat(remaining);

        if (pauseBtn) pauseBtn.textContent = pomoPausedRemaining != null ? 'Retomar' : 'Pausar';

        if (label) {
          if (pomoMode === 'break') {
            label.textContent = 'Pausa curta - respira um pouco';
          } else if (pomoTaskId) {
            const task = (typeof getTask === 'function') ? getTask(pomoTaskId) : null;
            const subject = task && typeof getSubject === 'function' ? getSubject(task.subjectCode) : null;
            label.textContent = subject
              ? 'Foco - ' + (subject.shortName || subject.code) + ' - ' + (task.title || '')
              : 'Sessão em andamento';
          } else {
            label.textContent = 'Sessão em andamento';
          }
        }

        bar.setAttribute('data-mode', pomoMode);
        bar.setAttribute('data-active', 'true');
        document.body.setAttribute('data-pomo', 'true');
      }

      function pomoStart(taskId) {
        pomoStopInterval();
        pomoMode = 'focus';
        pomoTaskId = taskId || null;
        pomoStartMs = Date.now();
        pomoEndMs = Date.now() + POMO_FOCUS_SEC * 1000;
        pomoPausedRemaining = null;
        pomoUpdateUI();
        pomoInterval = setInterval(pomoTick, 1000);
      }

      function pomoTick() {
        if (pomoPausedRemaining != null) return;
        const remaining = pomoEndMs - Date.now();
        if (remaining <= 0) {
          pomoComplete();
          return;
        }
        pomoUpdateUI();
      }

      function pomoPause() {
        if (pomoPausedRemaining != null) {
          // Retomar
          pomoEndMs = Date.now() + pomoPausedRemaining;
          pomoPausedRemaining = null;
        } else {
          pomoPausedRemaining = pomoEndMs - Date.now();
        }
        pomoUpdateUI();
      }

      function pomoComplete() {
        // Session ended (timer chegou a zero)
        pomoStopInterval();
        if (pomoMode === 'focus') {
          // Toca som leve (data-uri mini beep)
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE');
            audio.volume = 0.3;
            audio.play().catch(() => {});
          } catch (_) {}
          // Vibrar se disponível
          if (navigator.vibrate) try { navigator.vibrate([200, 80, 200]); } catch (_) {}
          // Abrir modal de auto-avaliação
          openSessionModal({
            taskId: pomoTaskId,
            minutes: Math.round((Date.now() - pomoStartMs) / 60000),
            fromTimer: true
          });
        } else {
          // Fim do break: fecha bar
          pomoHide();
        }
      }

      function pomoFinish() {
        // Usuário clicou "Concluí" antes do timer acabar
        const elapsedSec = Math.round((Date.now() - pomoStartMs) / 1000);
        pomoStopInterval();
        openSessionModal({
          taskId: pomoTaskId,
          minutes: Math.max(1, Math.round(elapsedSec / 60)),
          fromTimer: true
        });
      }

      function pomoStop() {
        // Cancelar totalmente (sem registrar)
        pomoStopInterval();
        pomoHide();
        if (typeof showToast === 'function') showToast('Sessão cancelada');
      }

      function pomoStopInterval() {
        if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; }
      }

      function pomoHide() {
        const bar = pomoEl('pomoBar');
        if (bar) bar.removeAttribute('data-active');
        document.body.removeAttribute('data-pomo');
        pomoEndMs = null;
        pomoPausedRemaining = null;
        pomoTaskId = null;
        pomoStartMs = null;
      }

      function pomoStartBreak() {
        pomoMode = 'break';
        pomoEndMs = Date.now() + POMO_BREAK_SEC * 1000;
        pomoPausedRemaining = null;
        pomoStartMs = Date.now();
        pomoUpdateUI();
        pomoInterval = setInterval(pomoTick, 1000);
      }

      // Bindings dos botões do pomo
      if (pomoEl('pomoPauseBtn')) pomoEl('pomoPauseBtn').addEventListener('click', pomoPause);
      if (pomoEl('pomoFinishBtn')) pomoEl('pomoFinishBtn').addEventListener('click', pomoFinish);
      if (pomoEl('pomoStopBtn')) pomoEl('pomoStopBtn').addEventListener('click', pomoStop);

      // ═══════════════════════════════════════════════════════════
      // FEATURE 4 + 1: MODAL PÓS-SESSÃO (auto-avaliação + exercícios)
      // ═══════════════════════════════════════════════════════════

      let sessionModalContext = null;

      function openSessionModal(ctx) {
        sessionModalContext = ctx || {};
        const backdrop = document.getElementById('sessionModalBackdrop');
        const summary = document.getElementById('sessionModalSummary');
        const exDone = document.getElementById('sessionModalExDone');
        const exHelp = document.getElementById('sessionModalExHelp');
        const notes = document.getElementById('sessionModalNotes');

        // Reset ratings
        document.querySelectorAll('.session-rating-opt').forEach(b => b.removeAttribute('data-selected'));

        // Reset inputs
        if (exDone) exDone.value = '';
        if (exHelp) exHelp.value = '';
        if (notes) notes.value = '';

        // Popular summary
        if (summary) {
          const task = ctx.taskId && typeof getTask === 'function' ? getTask(ctx.taskId) : null;
          const subject = task && typeof getSubject === 'function' ? getSubject(task.subjectCode) : null;
          const minutes = ctx.minutes || 0;
          summary.innerHTML =
            '<strong>' + (subject ? escapeHtml(subject.name || subject.shortName) : 'Sessão') + '</strong>' +
            (task ? escapeHtml(task.title) + ' · ' : '') +
            '<span class="mono">' + minutes + ' min</span>';
        }

        backdrop.setAttribute('data-open', 'true');
        backdrop.setAttribute('aria-hidden', 'false');
        setTimeout(function () { if (exDone) exDone.focus(); }, 80);
      }

      function closeSessionModal() {
        const backdrop = document.getElementById('sessionModalBackdrop');
        if (backdrop) backdrop.removeAttribute('data-open');
        sessionModalContext = null;
      }

      // Bindings dos ratings (toggle visual)
      document.querySelectorAll('.session-rating-opts').forEach(group => {
        group.addEventListener('click', function (e) {
          const btn = e.target.closest('.session-rating-opt');
          if (!btn) return;
          group.querySelectorAll('.session-rating-opt').forEach(b => b.removeAttribute('data-selected'));
          btn.setAttribute('data-selected', 'true');
        });
      });

      function getRating(group) {
        const sel = document.querySelector('[data-rating-group="' + group + '"] [data-selected="true"]');
        return sel ? sel.getAttribute('data-rating-value') : null;
      }

      function commitSessionData(ctx, extras) {
        // Acha o último log (acabou de ser criado por completeTask) e enriquece
        if (!ctx || !ctx.taskId) return;
        const logs = state.logs || [];
        // Pega o último log desse taskId hoje
        const todayIso = toIsoDate(new Date());
        for (let i = logs.length - 1; i >= 0; i--) {
          if (logs[i].taskId === ctx.taskId && logs[i].date === todayIso) {
            if (extras.exercisesDone != null) logs[i].exercisesDone = extras.exercisesDone;
            if (extras.exercisesHelp != null) logs[i].exercisesHelp = extras.exercisesHelp;
            if (extras.soloRating) logs[i].soloRating = extras.soloRating;
            if (extras.explainRating) logs[i].explainRating = extras.explainRating;
            if (extras.notes) logs[i].notes = extras.notes;
            if (extras.actualMinutes != null) logs[i].actualMinutes = extras.actualMinutes;
            break;
          }
        }

        // Atualizar sessionMinutesReal (matéria × semana)
        if (extras.actualMinutes != null && ctx.subjectCode) {
          const wk = isoWeekKey(new Date());
          const key = ctx.subjectCode + '_' + wk;
          state.sessionMinutesReal[key] = (state.sessionMinutesReal[key] || 0) + extras.actualMinutes;
        }

        saveState();
      }

      // Submit do modal
      const sessionForm = document.getElementById('sessionModalForm');
      if (sessionForm) {
        sessionForm.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!sessionModalContext) { closeSessionModal(); return; }

          const exDone = parseInt(document.getElementById('sessionModalExDone').value, 10);
          const exHelp = parseInt(document.getElementById('sessionModalExHelp').value, 10);
          const notes = document.getElementById('sessionModalNotes').value.trim();
          const soloRating = getRating('solo');
          const explainRating = getRating('explain');

          const task = sessionModalContext.taskId && typeof getTask === 'function' ? getTask(sessionModalContext.taskId) : null;
          const subjectCode = task ? task.subjectCode : null;

          const extras = {
            exercisesDone: !isNaN(exDone) ? exDone : null,
            exercisesHelp: !isNaN(exHelp) ? exHelp : null,
            soloRating: soloRating,
            explainRating: explainRating,
            notes: notes || null,
            actualMinutes: sessionModalContext.minutes || null
          };

          // Se veio do timer pomodoro, chamar completeTask (ainda não foi chamado)
          if (sessionModalContext.fromTimer && sessionModalContext.taskId) {
            const ctxCopy = Object.assign({}, sessionModalContext, { subjectCode: subjectCode });
            if (typeof completeTask === 'function') {
              completeTask(sessionModalContext.taskId);
            }
            commitSessionData(ctxCopy, extras);
          } else {
            // Veio direto do botão "Concluí" (completeTask já rodou)
            const ctxCopy = Object.assign({}, sessionModalContext, { subjectCode: subjectCode });
            commitSessionData(ctxCopy, extras);
          }

          closeSessionModal();

          // Oferecer break se veio do timer
          if (sessionModalContext && sessionModalContext.fromTimer) {
            setTimeout(function () {
              if (confirm('Pausa de 5 min agora-')) {
                pomoStartBreak();
              } else {
                pomoHide();
              }
            }, 300);
          } else {
            pomoHide();
          }

          if (typeof showToast === 'function') showToast('Sessão registrada');
          if (typeof render === 'function') render();
        });
      }

      const sessionSkip = document.getElementById('sessionModalSkip');
      if (sessionSkip) {
        sessionSkip.addEventListener('click', function () {
          // Se veio do timer, ainda precisa concluir a task
          if (sessionModalContext && sessionModalContext.fromTimer && sessionModalContext.taskId) {
            if (typeof completeTask === 'function') completeTask(sessionModalContext.taskId);
          }
          closeSessionModal();
          pomoHide();
        });
      }

      // ═══════════════════════════════════════════════════════════
      // HOOKS: startTask vira pomodoro + completeTask vira modal
      // ═══════════════════════════════════════════════════════════

      const originalStartTask = window.startTask || startTask;
      window.startTask = function (taskId) {
        // Chamar original (guarda activeSession etc)
        originalStartTask(taskId);
        // Iniciar pomodoro
        pomoStart(taskId);
      };
      // Também substituir no escopo script-global
      try { startTask = window.startTask; } catch (_) {}

      // Hook no "Concluí" SEM timer: abre modal ao invés de pular
      // Criamos uma nova função completeTaskWithReview que é chamada pelos botões
      window.completeTaskWithReview = function (taskId) {
        const task = typeof getTask === 'function' ? getTask(taskId) : null;
        if (!task) return;

        // Se pomodoro ativo pra esse taskId, usa o tempo do timer
        const isPomo = pomoTaskId === taskId && pomoStartMs;
        const minutes = isPomo
          ? Math.max(1, Math.round((Date.now() - pomoStartMs) / 60000))
          : (typeof getTaskMinutes === 'function' ? getTaskMinutes(task) : 25);

        // completeTask original roda primeiro (cria log)
        if (typeof completeTask === 'function') completeTask(taskId);

        // Se pomodoro ativo, para
        if (isPomo) pomoStopInterval();

        // Abre modal pós-sessão
        openSessionModal({
          taskId: taskId,
          minutes: minutes,
          fromTimer: false
        });
      };

      // Re-bindar os botões data-action="complete" pra usar a versão com review
      function rebindCompleteButtons() {
        document.querySelectorAll("[data-action='complete']").forEach(btn => {
          btn.onclick = function () {
            window.completeTaskWithReview(btn.dataset.taskId);
          };
        });
      }

      // Observer pra re-bindar sempre que DOM mudar (render recria os botões)
      const rebindObs = new MutationObserver(function () {
        clearTimeout(rebindObs._t);
        rebindObs._t = setTimeout(rebindCompleteButtons, 50);
      });
      const dashboardPage = document.getElementById('dashboardPage');
      if (dashboardPage) rebindObs.observe(dashboardPage, { childList: true, subtree: true });
      rebindCompleteButtons();

      // ═══════════════════════════════════════════════════════════
      // FEATURE 2: REVISÃO ESPAÇADA DE PROVAS ANTIGAS
      // Intervalos: 2, 7, 14, 30 dias
      // ═══════════════════════════════════════════════════════════

      const REVIEW_INTERVALS = [2, 7, 14, 30];

      function scheduleReviewChain(subjectCode, examLabel, source) {
        // Cria uma cadeia de tarefas de revisão nos próximos 2, 7, 14, 30 dias
        // Insere direto em state.weeklyTodos com flag review=true
        if (!Array.isArray(state.weeklyTodos)) state.weeklyTodos = [];

        const now = new Date();
        const ids = [];
        REVIEW_INTERVALS.forEach(days => {
          const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
          const dayIso = toIsoDate(future);
          const id = 'wtd_rev_' + Date.now().toString(36) + '_' + days + '_' + Math.random().toString(36).slice(2, 5);
          state.weeklyTodos.push({
            id: id,
            text: 'Refazer ' + examLabel + ' (revisão +' + days + 'd)',
            dayIso: dayIso,
            done: false,
            subjectCode: subjectCode,
            createdAt: new Date().toISOString(),
            isReview: true,
            reviewExamLabel: examLabel,
            reviewInterval: days
          });
          ids.push(id);
        });

        // Registro pro histórico
        if (!Array.isArray(state.examReviews)) state.examReviews = [];
        state.examReviews.push({
          id: 'rev_' + Date.now().toString(36),
          subjectCode: subjectCode,
          examLabel: examLabel,
          source: source || null,
          scheduledAt: new Date().toISOString(),
          todoIds: ids
        });

        saveState();
        if (typeof showToast === 'function') {
          showToast('Revisão agendada: ' + REVIEW_INTERVALS.join('/') + ' dias');
        }
        if (typeof render === 'function') render();
      }

      window.scheduleExamReview = scheduleReviewChain;

      // Adicionar botão "Agendar revisão" em links de provas antigas nas Fontes
      // Padrão: source-list li com texto que tem "P1", "P2", "P3" de anos anteriores
      function injectReviewButtons() {
        const sourcesBlock = document.getElementById('sourcesBlock');
        if (!sourcesBlock) return;
        sourcesBlock.querySelectorAll('.source-list li').forEach(li => {
          // Evita re-injetar
          if (li.querySelector('.source-review-btn')) return;
          const txt = li.textContent || '';
          // Heurística: contém P1/P2/P3/PS + ano (202x ou 201x)
          const match = txt.match(/\b(P[1-3S]|prova\s+\d)\b.*-(20\d{2})/i);
          if (!match) return;

          // Achar o subjectCode — procurar no summary do <details> pai
          const details = li.closest('details');
          if (!details) return;
          const summary = details.querySelector('summary');
          const summaryText = summary ? summary.textContent : '';
          const codeMatch = summaryText.match(/PME\d{4}/);
          if (!codeMatch) return;
          const subjectCode = codeMatch[0];

          const examLabel = match[1].toUpperCase() + '/' + match[2];

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'source-review-btn';
          btn.textContent = '📅 Agendar revisão';
          btn.title = 'Cria to-dos pra refazer em 2, 7, 14 e 30 dias';
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            scheduleReviewChain(subjectCode, examLabel, txt.substring(0, 80));
          });
          // Colocar no fim do primeiro div ou direto no li
          const firstDiv = li.querySelector('div');
          (firstDiv || li).appendChild(btn);
        });
      }

      // Observer pra re-injetar sempre que Fontes re-renderizar
      const sourcesBlock = document.getElementById('sourcesBlock');
      if (sourcesBlock) {
        const sobs = new MutationObserver(function () {
          clearTimeout(sobs._t);
          sobs._t = setTimeout(injectReviewButtons, 80);
        });
        sobs.observe(sourcesBlock, { childList: true, subtree: true });
        injectReviewButtons();
      }

      // ═══════════════════════════════════════════════════════════
      // FEATURE 5: CARD DE RETENÇÃO (dashboard)
      // Mostra matérias com risco de esquecimento (não estudadas há N dias)
      // ═══════════════════════════════════════════════════════════

      function computeRetention() {
        if (typeof DATA === 'undefined' || !Array.isArray(DATA.subjects)) return [];
        const todayIso = toIsoDate(new Date());

        const result = [];
        DATA.subjects.forEach(subj => {
          // Último log dessa matéria
          const logs = (state.logs || []).filter(l => l.subjectCode === subj.code);
          let lastDate = null;
          logs.forEach(l => {
            if (!lastDate || l.date > lastDate) lastDate = l.date;
          });

          const daysSince = lastDate ? daysBetween(lastDate, todayIso) : null;

          let tone = 'ok';
          let msg = '';
          let priority = 0;

          if (!lastDate) {
            tone = 'warning';
            msg = 'nunca estudada no app · registre a primeira sessão';
            priority = 5;
          } else if (daysSince >= 14) {
            tone = 'danger';
            msg = 'há ' + daysSince + ' dias sem estudar · risco de esquecimento alto';
            priority = 10 + daysSince;
          } else if (daysSince >= 7) {
            tone = 'warning';
            msg = 'há ' + daysSince + ' dias · próximo de esquecer';
            priority = 7 + daysSince / 5;
          } else if (daysSince >= 4) {
            tone = 'warning';
            msg = 'há ' + daysSince + ' dias · bom momento pra revisar';
            priority = 3;
          } else {
            tone = 'ok';
            msg = 'última sessão há ' + daysSince + ' dia' + (daysSince === 1 ? '' : 's');
            priority = 0;
          }

          result.push({
            subject: subj,
            daysSince: daysSince,
            tone: tone,
            msg: msg,
            priority: priority
          });
        });

        // Ordena por prioridade desc
        result.sort((a, b) => b.priority - a.priority);
        return result;
      }

      function renderRetentionCard() {
        const container = document.getElementById('retentionCard');
        if (!container) return;

        const items = computeRetention();
        const risky = items.filter(i => i.tone !== 'ok');

        if (risky.length === 0) {
          // Se tudo ok, esconde o card
          container.style.display = 'none';
          return;
        }
        container.style.display = '';

        const icon = t => t === 'danger' ? '🚨' : t === 'warning' ? '⚠️' : '✓';

        const listHtml = risky.map(i =>
          '<div class="retention-item retention-item--' + i.tone + '">' +
            '<span class="retention-icon">' + icon(i.tone) + '</span>' +
            '<div class="retention-body">' +
              '<div class="retention-subj">' +
                escapeHtml(i.subject.shortName || i.subject.name) +
                ' <span class="retention-code">' + escapeHtml(i.subject.code) + '</span>' +
              '</div>' +
              '<div class="retention-msg">' + escapeHtml(i.msg) + '</div>' +
            '</div>' +
            '<div class="retention-action">' +
              '<button class="btn btn-soft" data-retention-subj="' + escapeHtml(i.subject.code) + '" type="button">Estudar</button>' +
            '</div>' +
          '</div>'
        ).join('');

        container.innerHTML =
          '<h3 class="retention-title">Atenção · matérias em risco de esquecimento</h3>' +
          '<div class="retention-list">' + listHtml + '</div>';

        // Handlers: clicar em "Estudar" cria uma tarefa no planner pra hoje
        container.querySelectorAll('[data-retention-subj]').forEach(btn => {
          btn.addEventListener('click', function () {
            const code = btn.getAttribute('data-retention-subj');
            if (!Array.isArray(state.weeklyTodos)) state.weeklyTodos = [];
            const subj = DATA.subjects.find(s => s.code === code);
            const text = 'Revisar ' + (subj ? (subj.shortName || subj.name) : code) + ' (retenção)';
            const todayIso = toIsoDate(new Date());
            state.weeklyTodos.push({
              id: 'wtd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
              text: text,
              dayIso: todayIso,
              done: false,
              subjectCode: code,
              createdAt: new Date().toISOString()
            });
            saveState();
            if (typeof showToast === 'function') showToast('Adicionado ao planner de hoje');
            renderRetentionCard();
          });
        });
      }

      // ═══════════════════════════════════════════════════════════
      // FEATURE 3b: CARD "HORAS PLANEJADAS VS REAIS" (dashboard)
      // ═══════════════════════════════════════════════════════════

      function renderWeekTracking() {
        const container = document.getElementById('weekTrackingCard');
        if (!container) return;
        if (typeof DATA === 'undefined' || !Array.isArray(DATA.subjects)) {
          container.style.display = 'none';
          return;
        }

        const wk = isoWeekKey(new Date());
        const rows = [];

        // Pegar logs dessa semana (segunda a domingo)
        const now = new Date();
        const day = (now.getDay() + 6) % 7;
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
        const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);

        let anyData = false;

        DATA.subjects.forEach(subj => {
          // Minutos reais nessa semana (logs com actualMinutes OU minutes)
          let realMin = 0;
          (state.logs || []).forEach(l => {
            if (l.subjectCode !== subj.code) return;
            const lDate = new Date(l.date);
            if (lDate >= weekStart && lDate <= new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59)) {
              realMin += (l.actualMinutes != null ? l.actualMinutes : (l.minutes || 0));
            }
          });

          // Minutos planejados (semana atual) — soma de tasks no planner semanal pra essa matéria
          let plannedMin = 0;
          (state.weeklyTodos || []).forEach(t => {
            if (t.subjectCode !== subj.code) return;
            if (!t.dayIso) return;
            const tDate = new Date(t.dayIso);
            if (tDate >= weekStart && tDate <= weekEnd) {
              plannedMin += 25; // heurística: 1 tarefa ≈ 1 pomodoro
            }
          });

          if (realMin > 0 || plannedMin > 0) {
            anyData = true;
            const ratio = plannedMin > 0 ? realMin / plannedMin : (realMin > 0 ? 2 : 0);
            let barClass = '';
            if (ratio < 0.5 && plannedMin > 0) barClass = 'week-tracking-bar-fill--low';
            else if (ratio > 1.1) barClass = 'week-tracking-bar-fill--over';

            const widthPct = plannedMin > 0 ? Math.min(100, (realMin / plannedMin) * 100) : (realMin > 0 ? 100 : 0);

            rows.push({
              subj: subj,
              realMin: realMin,
              plannedMin: plannedMin,
              ratio: ratio,
              barClass: barClass,
              widthPct: widthPct
            });
          }
        });

        if (!anyData) {
          container.style.display = 'none';
          return;
        }
        container.style.display = '';

        // Ordena por real min desc
        rows.sort((a, b) => b.realMin - a.realMin);

        const listHtml = rows.map(r =>
          '<div>' +
            '<div class="week-tracking-row">' +
              '<div class="week-tracking-subj">' +
                escapeHtml(r.subj.shortName || r.subj.name) +
                ' <span class="retention-code">' + escapeHtml(r.subj.code) + '</span>' +
              '</div>' +
              '<div class="week-tracking-nums">' +
                '<strong>' + r.realMin + 'min</strong>' +
                (r.plannedMin > 0 ? ' / ' + r.plannedMin + 'min plan.' : '') +
              '</div>' +
              '<div class="week-tracking-bar">' +
                '<div class="week-tracking-bar-fill ' + r.barClass + '" style="width:' + r.widthPct + '%"></div>' +
              '</div>' +
            '</div>' +
          '</div>'
        ).join('');

        const totalReal = rows.reduce((a, r) => a + r.realMin, 0);
        const totalPlanned = rows.reduce((a, r) => a + r.plannedMin, 0);
        let summaryMsg = '';
        if (totalPlanned === 0) {
          summaryMsg = '<strong>Sem plano esta semana.</strong> Crie to-dos no planner pra comparar.';
        } else {
          const pct = Math.round((totalReal / totalPlanned) * 100);
          if (pct < 50) {
            summaryMsg = '<strong>Você estudou ' + pct + '% do planejado.</strong> Ou o plano foi muito ambicioso, ou você está postergando.';
          } else if (pct < 90) {
            summaryMsg = '<strong>' + pct + '% cumprido.</strong> Segue firme.';
          } else if (pct <= 110) {
            summaryMsg = '<strong>Plano batido (' + pct + '%).</strong> Bom equilíbrio.';
          } else {
            summaryMsg = '<strong>' + pct + '% do plano — estudou além.</strong> Cuidado com cansaço.';
          }
        }

        container.innerHTML =
          '<h3 class="retention-title">Horas reais vs. plano desta semana</h3>' +
          '<div class="week-tracking-list">' + listHtml + '</div>' +
          '<div class="week-tracking-summary">' + summaryMsg + '</div>';
      }

      // ═══════════════════════════════════════════════════════════
      // Render hooks
      // ═══════════════════════════════════════════════════════════

      function renderAll() {
        renderRetentionCard();
        renderWeekTracking();
      }

      // Re-render quando dashboard fica visível e quando state muda
      if (dashboardPage) {
        const obs2 = new MutationObserver(function () {
          if (!dashboardPage.hasAttribute('hidden')) {
            setTimeout(renderAll, 60);
          }
        });
        obs2.observe(dashboardPage, { attributes: true, attributeFilter: ['hidden'] });
      }

      // Wrap saveState pra re-renderizar após mudanças (throttle)
      const originalSaveState2 = saveState;
      let renderAllTimer = null;
      saveState = function () {
        originalSaveState2();
        clearTimeout(renderAllTimer);
        renderAllTimer = setTimeout(function () {
          if (dashboardPage && !dashboardPage.hasAttribute('hidden')) {
            renderAll();
          }
        }, 120);
      };

      // Initial render
      setTimeout(renderAll, 500);

      // Modal close handlers
      const sBackdrop = document.getElementById('sessionModalBackdrop');
      if (sBackdrop) {
        sBackdrop.addEventListener('click', function (e) {
          if (e.target === sBackdrop) closeSessionModal();
        });
      }
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sBackdrop && sBackdrop.getAttribute('data-open') === 'true') {
          closeSessionModal();
        }
      });

      console.log('[learning] motor de aprendizagem inicializado');
    });
  })();
