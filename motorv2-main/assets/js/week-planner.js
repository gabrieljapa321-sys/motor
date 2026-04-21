  /*
     Planner semanal.
     Usa state.weeklyTodos com itens no formato:
     { id, text, dayIso|null, done, subjectCode, createdAt }
     Salva via saveState(), que tambem cobre o sync com Firebase.
  */
  (function () {
    'use strict';

    function waitForApp(fn, tries) {
      tries = tries || 0;
      if (typeof state !== 'undefined' &&
          typeof saveState === 'function' &&
          typeof hydrateStateFromRaw === 'function') {
        fn();
      } else if (tries < 40) {
        setTimeout(function () { waitForApp(fn, tries + 1); }, 100);
      } else {
        console.error('[weekPlanner] app principal não carregou');
      }
    }

    waitForApp(function () {
      // ── Garantir weeklyTodos ──
      if (!Array.isArray(state.weeklyTodos)) state.weeklyTodos = [];

      // Wrap hydrateStateFromRaw pra preservar weeklyTodos E re-renderizar após load da nuvem
      const originalHydrate = hydrateStateFromRaw;
      hydrateStateFromRaw = function (raw) {
        const result = originalHydrate(raw);
        result.weeklyTodos = Array.isArray(raw && raw.weeklyTodos) ? raw.weeklyTodos : [];
        // Agenda render pra depois de state ser reatribuído
        setTimeout(function () {
          const weekPage = document.getElementById('weekPage');
          if (weekPage && !weekPage.hasAttribute('hidden')) render();
        }, 50);
        return result;
      };

      // ── Helpers de data ──
      const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

      function toIso(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
      }

      function getWeekStart(date) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = d.getDay();
        const diff = -day;
        d.setDate(d.getDate() + diff);
        return d;
      }

      function addDays(date, n) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setDate(d.getDate() + n);
        return d;
      }

      function formatDateShort(date) {
        return date.getDate() + ' ' + MONTH_NAMES[date.getMonth()];
      }

      function daysSinceIso(iso) {
        const now = new Date();
        const nowMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const then = new Date(iso);
        const thenMs = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
        return Math.floor((nowMs - thenMs) / 86400000);
      }

      function uid() {
        return 'wtd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      }

      function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      // ── Detecção de matéria (melhorada: regex + match pelo nome real) ──
      function detectSubject(text) {
        if (!text) return null;
        // Regex pra códigos diretos
        const m = text.match(/\b(PME\d{4}|MEC\s*[IVX]+|MEC\d*|QFL\d*|MAP\d*|MAT\d*|FIS\d*|EES\d*)\b/i);
        if (m) return m[1].toUpperCase().replace(/\s+/g, '');
        // Match pelo nome de matérias conhecidas (DATA.subjects existe no escopo global)
        if (typeof DATA !== 'undefined' && Array.isArray(DATA.subjects)) {
          const lower = text.toLowerCase();
          for (const subj of DATA.subjects) {
            const tokens = [subj.shortName, subj.name].filter(Boolean);
            for (const token of tokens) {
              const t = String(token).toLowerCase();
              if (t.length >= 4 && lower.includes(t)) return subj.code;
            }
          }
        }
        return null;
      }

      // ── Estado local ──
      let currentWeekStart = getWeekStart(new Date());
      let draggingId = null;
      let lastDeleted = null;
      let undoTimer = null;
      let touchDragState = null;

      function getWeekDensity() {
        return state && state.weekDensity === 'comfortable' ? 'comfortable' : 'compact';
      }

      function getWeekDensityOptions() {
        const options = globalThis.APP_CONFIG && globalThis.APP_CONFIG.week && Array.isArray(globalThis.APP_CONFIG.week.densityOptions)
          ? globalThis.APP_CONFIG.week.densityOptions
          : null;
        return options && options.length ? options : [
          { value: 'compact', label: 'Compacto' },
          { value: 'comfortable', label: 'Confortável' }
        ];
      }

      // ── Renderização ──
      function render() {
        const weekPage = document.getElementById('weekPage');
        if (weekPage) weekPage.setAttribute('data-density', getWeekDensity());
        renderHeader();
        renderInbox();
        renderKanban();
        renderStats();
      }

      function renderHeader() {
        const start = currentWeekStart;
        const end = addDays(start, 6);
        const today = new Date();
        const thisWeekStart = getWeekStart(today);
        const isThisWeek = toIso(start) === toIso(thisWeekStart);
        const nextWeekStart = addDays(thisWeekStart, 7);
        const isNextWeek = toIso(start) === toIso(nextWeekStart);

        const titleEl = document.getElementById('weekTitle');
        const rangeEl = document.getElementById('weekRange');
        const densitySelect = document.getElementById('weekDensitySelect');
        if (titleEl) {
          titleEl.textContent = isThisWeek ? 'Esta semana'
                              : isNextWeek ? 'Próxima semana'
                              : 'Semana de ' + formatDateShort(start);
        }
        if (rangeEl) {
          rangeEl.textContent = formatDateShort(start) + ' - ' + formatDateShort(end) + ' - ' +
                                WEEKDAY_FULL[start.getDay()] + ' a ' + WEEKDAY_FULL[end.getDay()];
        }
        if (densitySelect) {
          if (!densitySelect.options.length) {
            densitySelect.innerHTML = getWeekDensityOptions().map((option) =>
              '<option value="' + option.value + '">' + option.label + '</option>'
            ).join('');
          }
          densitySelect.value = getWeekDensity();
        }
      }

      function renderInbox() {
        const listEl = document.getElementById('weekInboxList');
        const countEl = document.getElementById('weekInboxCount');
        if (!listEl) return;

        // Inbox ordenada por idade (mais velhas primeiro)
        const inbox = state.weeklyTodos
          .filter(t => !t.dayIso)
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

        if (countEl) countEl.textContent = String(inbox.length);

        if (inbox.length === 0) {
          listEl.innerHTML = '<div class="week-empty-inbox">Inbox vazia.<br>Crie abaixo ou arraste aqui.</div>';
        } else {
          listEl.innerHTML = inbox.map(t => renderTodoHTML(t)).join('');
        }
      }

      function renderKanban() {
        const kanban = document.getElementById('weekKanban');
        if (!kanban) return;

        const todayIso = toIso(new Date());
        const cols = [];

        for (let i = 0; i < 7; i++) {
          const date = addDays(currentWeekStart, i);
          const iso = toIso(date);
          const isToday = iso === todayIso;
          const realDay = date.getDay();
          const weekdayLabel = WEEKDAY_NAMES[realDay];

          const todos = state.weeklyTodos.filter(t => t.dayIso === iso);
          const pending = todos.filter(t => !t.done).length;

          // ── MELHORIA 1: deadlines deste dia ──
          const deadlines = (state.deadlines || []).filter(d => d.dueDate === iso);

          const deadlineBlock = deadlines.length === 0 ? '' :
            '<div class="week-col-deadlines">' +
              deadlines.map(renderDeadlineMiniHTML).join('') +
            '</div>';

          cols.push(
            '<div class="week-col" data-day-iso="' + iso + '"' + (isToday ? ' data-today="true"' : '') + ' data-drop-target="day">' +
              '<div class="week-col-header">' +
                '<span class="week-col-weekday">' + weekdayLabel + '</span>' +
                '<span class="week-col-date">' +
                  formatDateShort(date) +
                  '<span class="week-col-count" title="' + pending + (pending === 1 ? ' aberta' : ' abertas') + '">' + pending + '</span>' +
                '</span>' +
              '</div>' +
              deadlineBlock +
              '<div class="week-col-list" data-day-iso="' + iso + '">' +
                (todos.length === 0 ? '' : todos.map(t => renderTodoHTML(t, false)).join('')) +
              '</div>' +
              '<button class="week-col-add" data-add-to="' + iso + '" type="button">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                'Adicionar' +
              '</button>' +
            '</div>'
          );
        }

        kanban.innerHTML = cols.join('');
      }

      function renderDeadlineMiniHTML(d) {
        const done = !!d.deliveredAt;
        const cls = 'week-col-deadline' + (done ? ' week-col-deadline--done' : '');
        const icon = done ? '✓' : '⚠';
        const subj = d.subjectCode ? '<span class="week-col-deadline-subj">' + escapeHtml(d.subjectCode) + '</span>' : '';
        return (
          '<div class="' + cls + '" data-open-deadlines="1" title="Clique pra abrir Prazos">' +
            '<span class="week-col-deadline-icon">' + icon + '</span>' +
            '<span class="week-col-deadline-text">' +
              escapeHtml(d.title || 'Entrega') +
              subj +
            '</span>' +
          '</div>'
        );
      }

      function renderTodoHTML(todo, showAging) {
        if (showAging === undefined) showAging = !todo.dayIso; // só mostra na inbox

        const subjectBadge = todo.subjectCode
          ? '<span class="week-todo-subject week-todo-subject--accent">' + escapeHtml(todo.subjectCode) + '</span>'
          : '';

        // Chip de idade (só na inbox + se mais velho que 2 dias)
        let ageChip = '';
        if (showAging && todo.createdAt) {
          const age = daysSinceIso(todo.createdAt);
          if (age >= 1) {
            const old = age >= 3;
            const label = age === 1 ? 'há 1 dia' : 'há ' + age + ' dias';
            ageChip = '<span class="week-todo-age' + (old ? ' week-todo-age--old' : '') + '">' + label + '</span>';
          }
        }

        const meta = (subjectBadge || ageChip)
          ? '<div class="week-todo-meta">' + subjectBadge + ageChip + '</div>'
          : '';

        return (
          '<div class="week-todo" data-todo-id="' + todo.id + '"' +
               (todo.done ? ' data-done="true"' : '') + ' draggable="true">' +
            '<div class="week-todo-row">' +
              '<input type="checkbox" class="week-todo-check"' + (todo.done ? ' checked' : '') + ' aria-label="Marcar como feita" />' +
              '<div class="week-todo-text" data-todo-text="' + todo.id + '">' + escapeHtml(todo.text) + '</div>' +
            '</div>' +
            meta +
            '<button class="week-todo-delete" data-todo-delete="' + todo.id + '" type="button" aria-label="Excluir">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
            '</button>' +
          '</div>'
        );
      }

      function renderStats() {
        const todayIso = toIso(new Date());
        const weekIsos = [];
        for (let i = 0; i < 7; i++) weekIsos.push(toIso(addDays(currentWeekStart, i)));

        const weekTodos = state.weeklyTodos.filter(t => weekIsos.indexOf(t.dayIso) !== -1);
        const inbox = state.weeklyTodos.filter(t => !t.dayIso);
        const done = weekTodos.filter(t => t.done).length;
        const total = weekTodos.length;
        const pending = total - done;
        const pendingToday = weekTodos.filter(t => !t.done && t.dayIso === todayIso).length;
        const donePct = total > 0 ? Math.round((done / total) * 100) : 0;

        setText('weekStatTotal', total);
        setText('weekStatDone', done);
        setText('weekStatPending', pending);
        setText('weekStatInbox', inbox.length);
        setText('weekStatDonePct', total > 0 ? donePct + '% da semana' : '—');
        setText('weekStatPendingToday', pendingToday > 0 ? pendingToday + ' para hoje' : 'nada p/ hoje');
      }

      function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
      }

      // ── CRUD ──
      function addTodo(text, dayIso, subjectCode) {
        const clean = String(text || '').trim();
        if (!clean) return null;
        const todo = {
          id: uid(),
          text: clean,
          dayIso: dayIso || null,
          done: false,
          subjectCode: subjectCode || detectSubject(clean),
          createdAt: new Date().toISOString()
        };
        state.weeklyTodos.push(todo);
        saveState();
        render();
        return todo;
      }

      function updateTodo(id, patch) {
        const idx = state.weeklyTodos.findIndex(t => t.id === id);
        if (idx === -1) return;
        state.weeklyTodos[idx] = Object.assign({}, state.weeklyTodos[idx], patch);
        saveState();
        render();
      }

      function deleteTodo(id) {
        const todo = state.weeklyTodos.find(t => t.id === id);
        if (!todo) return;
        // Guardar pra undo
        lastDeleted = Object.assign({}, todo);
        state.weeklyTodos = state.weeklyTodos.filter(t => t.id !== id);
        saveState();
        render();
        showUndoToast('Tarefa excluída', function () {
          state.weeklyTodos.push(lastDeleted);
          saveState();
          render();
          lastDeleted = null;
        });
      }

      function moveTodo(id, newDayIso) {
        updateTodo(id, { dayIso: newDayIso || null });
      }

      // ── Modal ──
      function openModal(opts) {
        opts = opts || {};
        const backdrop = document.getElementById('todoModalBackdrop');
        const titleEl = document.getElementById('todoModalTitle');
        const textInput = document.getElementById('todoModalText');
        const daySelect = document.getElementById('todoModalDay');
        const subjSelect = document.getElementById('todoModalSubject');
        const saveBtn = document.getElementById('todoModalSave');

        // Popular select de dias (7 da semana atual + Inbox)
        const dayOptions = ['<option value="">Inbox (sem dia)</option>'];
        for (let i = 0; i < 7; i++) {
          const date = addDays(currentWeekStart, i);
          const iso = toIso(date);
          const lbl = WEEKDAY_FULL[date.getDay()] + ' · ' + formatDateShort(date);
          dayOptions.push('<option value="' + iso + '">' + lbl + '</option>');
        }
        daySelect.innerHTML = dayOptions.join('');

        // Popular select de matérias (do DATA.subjects)
        const subjOptions = ['<option value="">—</option>'];
        if (typeof DATA !== 'undefined' && Array.isArray(DATA.subjects)) {
          DATA.subjects.forEach(s => {
            subjOptions.push('<option value="' + escapeHtml(s.code) + '">' +
              escapeHtml(s.code) + ' · ' + escapeHtml(s.shortName || s.name) + '</option>');
          });
        }
        subjSelect.innerHTML = subjOptions.join('');

        titleEl.textContent = opts.title || 'Nova tarefa';
        textInput.value = opts.text || '';
        daySelect.value = opts.dayIso || '';
        subjSelect.value = opts.subjectCode || '';
        saveBtn.textContent = opts.saveLabel || 'Salvar';

        backdrop.setAttribute('data-open', 'true');
        backdrop.setAttribute('aria-hidden', 'false');

        // Focus
        setTimeout(function () { textInput.focus(); textInput.select(); }, 60);

        // Callback
        modalCallback = opts.onSave || null;
        editingTodoId = opts.editId || null;
      }

      function closeModal() {
        const backdrop = document.getElementById('todoModalBackdrop');
        backdrop.removeAttribute('data-open');
        backdrop.setAttribute('aria-hidden', 'true');
        modalCallback = null;
        editingTodoId = null;
      }

      let modalCallback = null;
      let editingTodoId = null;

      // ── Toast com undo ──
      function showUndoToast(msg, undoFn) {
        const toast = document.getElementById('toastUndo');
        const textEl = document.getElementById('toastUndoText');
        const btn = document.getElementById('toastUndoBtn');
        if (!toast || !btn) return;

        textEl.textContent = msg;
        toast.setAttribute('data-open', 'true');

        if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }

        const close = function () {
          toast.removeAttribute('data-open');
          btn.onclick = null;
          if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
        };

        btn.onclick = function () {
          if (typeof undoFn === 'function') undoFn();
          close();
        };

        undoTimer = setTimeout(close, 6500);
      }

      // ── Menu "Mover pra..." ──
      function openMoveMenu(todoId) {
        const todo = state.weeklyTodos.find(t => t.id === todoId);
        if (!todo) return;

        const backdrop = document.getElementById('moveMenuBackdrop');
        const itemsEl = document.getElementById('moveMenuItems');
        if (!backdrop || !itemsEl) return;

        const items = [];
        // 7 dias
        for (let i = 0; i < 7; i++) {
          const date = addDays(currentWeekStart, i);
          const iso = toIso(date);
          const isCurrent = todo.dayIso === iso;
          items.push(
            '<button class="move-menu-item" data-move-to="' + iso + '"' + (isCurrent ? ' data-current="true"' : '') + '>' +
              '<span>' + WEEKDAY_FULL[date.getDay()] + '</span>' +
              '<span class="move-menu-item-date">' + formatDateShort(date) + '</span>' +
            '</button>'
          );
        }
        // Inbox
        const isInInbox = !todo.dayIso;
        items.push(
          '<button class="move-menu-item" data-move-to=""' + (isInInbox ? ' data-current="true"' : '') + '>' +
            '<span>📥 Inbox</span>' +
            '<span class="move-menu-item-date">sem dia</span>' +
          '</button>'
        );

        itemsEl.innerHTML = items.join('');

        itemsEl.querySelectorAll('.move-menu-item').forEach(btn => {
          btn.onclick = function () {
            if (btn.getAttribute('data-current') === 'true') return;
            const target = btn.getAttribute('data-move-to');
            moveTodo(todoId, target || null);
            closeMoveMenu();
          };
        });

        backdrop.setAttribute('data-open', 'true');
      }

      function closeMoveMenu() {
        const backdrop = document.getElementById('moveMenuBackdrop');
        if (backdrop) backdrop.removeAttribute('data-open');
      }

      function beginInlineEdit(el) {
        if (!el || el.getAttribute('contenteditable') === 'true') return;
        const id = el.getAttribute('data-todo-text');
        const todo = state.weeklyTodos.find(t => t.id === id);
        if (!todo) return;
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('data-editing', 'true');
        el.setAttribute('data-original-text', todo.text || '');
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }

      function finishInlineEdit(el, cancelEdit) {
        if (!el || el.getAttribute('contenteditable') !== 'true') return;
        const id = el.getAttribute('data-todo-text');
        const todo = state.weeklyTodos.find(t => t.id === id);
        const originalText = el.getAttribute('data-original-text') || (todo ? todo.text : '');
        const newText = (el.textContent || '').trim();
        el.removeAttribute('contenteditable');
        el.removeAttribute('data-editing');
        el.removeAttribute('data-original-text');
        if (!todo) return;
        if (cancelEdit || !newText) {
          el.textContent = originalText;
          return;
        }
        if (newText !== todo.text) {
          updateTodo(id, { text: newText, subjectCode: detectSubject(newText) });
        } else {
          el.textContent = todo.text;
        }
      }

      function clearDragIndicators() {
        document.querySelectorAll('[data-drag-over]').forEach(el => el.removeAttribute('data-drag-over'));
      }

      function getDragTarget(node) {
        if (!node) return null;
        const col = node.closest('.week-col');
        if (col) return { el: col, dayIso: col.getAttribute('data-day-iso') };
        const inbox = node.closest('#weekInboxList') || node.closest('.week-inbox');
        if (inbox) return { el: inbox.closest('.week-inbox') || inbox, dayIso: null };
        return null;
      }

      function openDeadlinesFromWeek() {
        if (typeof openPage === 'function') openPage('dashboard');
        setTimeout(function () {
          const deadlinesSection = document.getElementById('deadlinesCollapse');
          if (deadlinesSection && deadlinesSection.getAttribute('data-open') !== 'true') {
            deadlinesSection.setAttribute('data-open', 'true');
          }
          document.querySelectorAll('.tb-nav-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-nav-page') === 'dashboard');
          });
          setTimeout(function () {
            const target = document.getElementById('deadlinesCollapse') || document.getElementById('deadlinesCard');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        }, 120);
      }

      const delegatedTouch = {
        timer: null,
        todoId: null,
        startX: 0,
        startY: 0
      };

      function resetDelegatedTouch() {
        if (delegatedTouch.timer) {
          clearTimeout(delegatedTouch.timer);
          delegatedTouch.timer = null;
        }
        delegatedTouch.todoId = null;
        delegatedTouch.startX = 0;
        delegatedTouch.startY = 0;
      }

      function setupInteractionDelegation() {
        const weekPage = document.getElementById('weekPage');
        if (!weekPage || weekPage.getAttribute('data-interactions-bound') === 'true') return;
        weekPage.setAttribute('data-interactions-bound', 'true');

        weekPage.addEventListener('change', function (e) {
          const checkbox = e.target.closest('.week-todo-check');
          if (!checkbox) return;
          const todoEl = checkbox.closest('.week-todo');
          const id = todoEl && todoEl.getAttribute('data-todo-id');
          if (id) updateTodo(id, { done: checkbox.checked });
        });

        weekPage.addEventListener('click', function (e) {
          const deleteBtn = e.target.closest('.week-todo-delete');
          if (deleteBtn) {
            e.stopPropagation();
            const id = deleteBtn.getAttribute('data-todo-delete');
            if (id) deleteTodo(id);
            return;
          }

          const addBtn = e.target.closest('.week-col-add');
          if (addBtn) {
            openModal({
              title: 'Nova tarefa',
              dayIso: addBtn.getAttribute('data-add-to'),
              onSave: function (data) {
                addTodo(data.text, data.dayIso, data.subjectCode);
              }
            });
            return;
          }

          if (e.target.closest('[data-open-deadlines="1"]')) {
            openDeadlinesFromWeek();
            return;
          }

          const textEl = e.target.closest('.week-todo-text');
          if (textEl) {
            e.stopPropagation();
            beginInlineEdit(textEl);
          }
        });

        weekPage.addEventListener('keydown', function (e) {
          const textEl = e.target.closest('.week-todo-text[data-editing="true"]');
          if (!textEl) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            finishInlineEdit(textEl, false);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finishInlineEdit(textEl, true);
          }
        });

        weekPage.addEventListener('focusout', function (e) {
          const textEl = e.target.closest('.week-todo-text[data-editing="true"]');
          if (!textEl) return;
          finishInlineEdit(textEl, false);
        });

        weekPage.addEventListener('dragstart', function (e) {
          const todoEl = e.target.closest('.week-todo');
          if (!todoEl) return;
          draggingId = todoEl.getAttribute('data-todo-id');
          todoEl.setAttribute('data-dragging', 'true');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', draggingId); } catch (_) {}
          }
        });

        weekPage.addEventListener('dragend', function (e) {
          const todoEl = e.target.closest('.week-todo');
          if (todoEl) todoEl.removeAttribute('data-dragging');
          draggingId = null;
          clearDragIndicators();
        });

        weekPage.addEventListener('dragover', function (e) {
          if (!draggingId) return;
          const target = getDragTarget(e.target);
          if (!target) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          clearDragIndicators();
          target.el.setAttribute('data-drag-over', 'true');
        });

        weekPage.addEventListener('drop', function (e) {
          if (!draggingId) return;
          const target = getDragTarget(e.target);
          clearDragIndicators();
          if (!target) return;
          e.preventDefault();
          moveTodo(draggingId, target.dayIso);
          draggingId = null;
        });

        weekPage.addEventListener('submit', function (e) {
          const form = e.target.closest('#weekInboxAddForm');
          if (!form) return;
          e.preventDefault();
          const input = document.getElementById('weekInboxAddInput');
          const val = input && input.value ? input.value.trim() : '';
          if (!val) return;
          addTodo(val, null);
          input.value = '';
          input.focus();
        });

        weekPage.addEventListener('touchstart', function (e) {
          const todoEl = e.target.closest('.week-todo');
          if (!todoEl) return;
          if (e.target.closest('.week-todo-check, .week-todo-delete, [contenteditable="true"]')) return;
          if (!e.touches || e.touches.length !== 1) return;
          const touch = e.touches[0];
          delegatedTouch.todoId = todoEl.getAttribute('data-todo-id');
          delegatedTouch.startX = touch.clientX;
          delegatedTouch.startY = touch.clientY;
          delegatedTouch.timer = setTimeout(function () {
            const id = delegatedTouch.todoId;
            resetDelegatedTouch();
            if (!id) return;
            if (navigator.vibrate) {
              try { navigator.vibrate(30); } catch (_) {}
            }
            openMoveMenu(id);
          }, 500);
        }, { passive: true });

        weekPage.addEventListener('touchmove', function (e) {
          if (!delegatedTouch.timer || !e.touches || e.touches.length !== 1) return;
          const touch = e.touches[0];
          const dx = touch.clientX - delegatedTouch.startX;
          const dy = touch.clientY - delegatedTouch.startY;
          if (Math.sqrt(dx * dx + dy * dy) > 12) resetDelegatedTouch();
        }, { passive: true });

        weekPage.addEventListener('touchend', resetDelegatedTouch);
        weekPage.addEventListener('touchcancel', resetDelegatedTouch);
      }

      // ── Handlers ──
      function setupWeekNav() {
        const prev = document.getElementById('weekPrevBtn');
        const today = document.getElementById('weekTodayBtn');
        const next = document.getElementById('weekNextBtn');
        const densitySelect = document.getElementById('weekDensitySelect');
        const inboxInput = document.getElementById('weekInboxAddInput');

        if (prev) prev.addEventListener('click', function () {
          currentWeekStart = addDays(currentWeekStart, -7); render();
        });
        if (today) today.addEventListener('click', function () {
          currentWeekStart = getWeekStart(new Date()); render();
        });
        if (next) next.addEventListener('click', function () {
          currentWeekStart = addDays(currentWeekStart, 7); render();
        });
        if (densitySelect && !densitySelect.getAttribute('data-bound')) {
          densitySelect.setAttribute('data-bound', 'true');
          densitySelect.addEventListener('change', function () {
            state.weekDensity = densitySelect.value === 'comfortable' ? 'comfortable' : 'compact';
            saveState();
            render();
          });
        }
        if (!document.body.getAttribute('data-week-shortcuts-bound')) {
          document.body.setAttribute('data-week-shortcuts-bound', 'true');
          document.addEventListener('keydown', function (e) {
            const weekPage = document.getElementById('weekPage');
            if (!weekPage || weekPage.hasAttribute('hidden')) return;
            const target = e.target;
            const editing = target && (
              target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.tagName === 'SELECT' ||
              target.isContentEditable
            );
            if (editing) return;

            if (e.altKey && e.key === 'ArrowLeft') {
              e.preventDefault();
              currentWeekStart = addDays(currentWeekStart, -7);
              render();
              return;
            }
            if (e.altKey && e.key === 'ArrowRight') {
              e.preventDefault();
              currentWeekStart = addDays(currentWeekStart, 7);
              render();
              return;
            }
            if (e.altKey && e.key === '0') {
              e.preventDefault();
              currentWeekStart = getWeekStart(new Date());
              render();
              return;
            }
            if ((e.key === 'n' || e.key === 'N' || e.key === '/') && inboxInput) {
              e.preventDefault();
              inboxInput.focus();
              inboxInput.select();
            }
          });
        }
      }

      // ── Observer pra quando a página fica visível ──
      function setupPageObserver() {
        const weekPage = document.getElementById('weekPage');
        if (!weekPage) return;
        const obs = new MutationObserver(function () {
          if (!weekPage.hasAttribute('hidden')) render();
        });
        obs.observe(weekPage, { attributes: true, attributeFilter: ['hidden'] });
      }

      // ── Modal bindings ──
      function setupModalBindings() {
        const backdrop = document.getElementById('todoModalBackdrop');
        const cancel = document.getElementById('todoModalCancel');
        const form = document.getElementById('todoModalForm');

        if (cancel) cancel.addEventListener('click', closeModal);
        if (backdrop) {
          backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) closeModal();
          });
        }
        if (form) {
          form.addEventListener('submit', function (e) {
            e.preventDefault();
            const text = document.getElementById('todoModalText').value.trim();
            const dayIso = document.getElementById('todoModalDay').value || null;
            const subjectCode = document.getElementById('todoModalSubject').value || null;
            if (!text) return;
            if (typeof modalCallback === 'function') {
              modalCallback({ text: text, dayIso: dayIso, subjectCode: subjectCode });
            }
            closeModal();
          });
        }

        // Esc pra fechar
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            if (backdrop && backdrop.getAttribute('data-open') === 'true') closeModal();
            const mm = document.getElementById('moveMenuBackdrop');
            if (mm && mm.getAttribute('data-open') === 'true') closeMoveMenu();
          }
        });
      }

      // ── Move menu bindings ──
      function setupMoveMenuBindings() {
        const backdrop = document.getElementById('moveMenuBackdrop');
        if (backdrop) {
          backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) closeMoveMenu();
          });
        }
      }

      // ── MELHORIA 4: expor função pro mainTaskCard ──
      window.addCurrentTaskToPlanner = function (taskId) {
        if (typeof DATA === 'undefined' || !Array.isArray(DATA.tasks) || !Array.isArray(DATA.subjects)) {
          return;
        }
        const task = DATA.tasks.find(t => t.id === taskId);
        if (!task) return;
        const subject = DATA.subjects.find(s => s.code === task.subjectCode);
        const subjName = subject ? (subject.shortName || subject.name) : (task.subjectCode || '');
        const text = 'Estudar ' + subjName + ': ' + (task.title || 'tópico do dia');
        const todayIso = toIso(new Date());

        // Se já existe uma tarefa com esse texto hoje, não duplica
        const exists = state.weeklyTodos.some(t => t.dayIso === todayIso && t.text === text);
        if (exists) {
          showUndoToast('Já está no planner de hoje', null);
          return;
        }

        const todo = addTodo(text, todayIso, task.subjectCode || null);
        if (todo) {
          showUndoToast('Adicionada ao planner de hoje', function () {
            state.weeklyTodos = state.weeklyTodos.filter(t => t.id !== todo.id);
            saveState();
            render();
          });
        }
      };
      window.StudyApp = window.StudyApp || {};
      window.StudyApp.addCurrentTaskToPlanner = window.addCurrentTaskToPlanner;

      // ── Init ──
      setupInteractionDelegation();
      setupWeekNav();
      setupPageObserver();
      setupModalBindings();
      setupMoveMenuBindings();
      render();

      console.log('[weekPlanner v2] inicializado');
    });
  })();
