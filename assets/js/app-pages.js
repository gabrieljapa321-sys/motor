/* Page renderers extracted from app-core. */

    function renderMetricGrid(items, options = {}) {

      const className = options.className || "summary-grid";

      const marginTop = options.marginTop ? ` style="margin-top: ${options.marginTop};"` : "";

      return `

        <div class="${className}"${marginTop}>

          ${items.map((item) => `

            <div class="metric">

              <div class="label">${escapeHtml(item.label)}</div>

              <div class="value">${item.value}</div>

              <div class="subvalue">${escapeHtml(item.subvalue)}</div>

            </div>

          `).join("")}

        </div>

      `;

    }



    function renderDetailList(items, options = {}) {

      const className = options.className || "small-list";

      const marginTop = options.marginTop ? ` style="margin-top: ${options.marginTop};"` : "";

      const valueOnly = options.valueOnly === true;

      return `

        <ul class="${className}"${marginTop}>

          ${items.map((item) => `

            <li>${valueOnly ? `<span class="muted">${item.value}</span>` : `<strong>${escapeHtml(item.label)}</strong><span class="muted">${item.value}</span>`}</li>

          `).join("")}

        </ul>

      `;

    }

    function makeGradeEntryId() {

      return `grade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    }



    function getSubjectGradeComponents(subject) {

      const phases = (subject.phases || []).map((phase) => ({

        key: `PHASE:${phase.id}`,

        label: phase.label,

        weight: Number(phase.weight || 0),

        weightLabel: phase.weightLabel || null,

        role: phase.gradeRole || null,

        optional: phase.optional === true,

        phaseId: phase.id,

        type: "phase"

      }));



      const extras = (subject.extras || []).map((extra, index) => ({

        key: `EXTRA:${index}:${normalizeKey(extra.label)}`,

        label: extra.label,

        weight: Number(extra.weight || 0),

        weightLabel: extra.weightLabel || null,

        role: extra.gradeRole || null,

        optional: extra.optional === true,

        type: "extra"

      }));



      return [...phases, ...extras];

    }



    function getComponentWeightText(component) {

      if (!component) return "—";

      if (component.weightLabel) return component.weightLabel;

      return formatWeight(component.weight);

    }



    function getSubjectGradeModel(subject) {

      return subject && subject.gradeModel && typeof subject.gradeModel === "object"

        ? subject.gradeModel

        : { type: "linear" };

    }



    function buildComponentScoreMap(components) {

      return Object.fromEntries((components || []).map((component) => [

        component.key,

        component.score == null ? null : Number(component.score)

      ]));

    }



    function clampGradeValue(value) {

      if (!Number.isFinite(value)) return null;

      return Math.max(0, Math.min(10, value));

    }



    function evaluatePme0100Formula(subject, scoreMap) {

      const components = getSubjectGradeComponents(subject);

      const byRole = Object.fromEntries(components.filter((component) => component.role).map((component) => [component.role, component.key]));

      const p1 = Number(scoreMap[byRole.p1]);

      const p2 = Number(scoreMap[byRole.p2]);

      const p3 = Number(scoreMap[byRole.p3]);

      const activity = Number(scoreMap[byRole.activityAverage]);

      const psub = Number(scoreMap[byRole.substituteExam]);

      const recovery = Number(scoreMap[byRole.recoveryExam]);

      const hasP1 = Number.isFinite(p1);

      const hasP2 = Number.isFinite(p2);

      const hasP3 = Number.isFinite(p3);

      let weightedExamAverage = null;

      if (hasP1 && hasP2 && hasP3) {

        const examEntries = [

          { score: p1, weight: 2 },

          { score: p2, weight: 2 },

          { score: p3, weight: 3 }

        ];

        if (Number.isFinite(psub)) {

          let lowestIndex = 0;

          examEntries.forEach((entry, index) => {

            if (entry.score < examEntries[lowestIndex].score) lowestIndex = index;

          });

          examEntries[lowestIndex] = {

            ...examEntries[lowestIndex],

            score: psub

          };

        }

        const weightedSum = examEntries.reduce((sum, entry) => sum + entry.score * entry.weight, 0);

        weightedExamAverage = weightedSum / 7;

      }

      let firstEvaluation = null;

      if (weightedExamAverage != null) {

        if (weightedExamAverage <= 3) {

          firstEvaluation = weightedExamAverage;

        } else if (Number.isFinite(activity)) {

          firstEvaluation = (15 * weightedExamAverage - 3 * activity) / (12 + weightedExamAverage - activity);

        }

      }

      const recoveryEligible = firstEvaluation != null && firstEvaluation >= 3 && firstEvaluation < 5;

      const secondEvaluation = recoveryEligible && Number.isFinite(recovery)

        ? Math.max(firstEvaluation, (firstEvaluation + recovery) / 2)

        : null;

      const finalGrade = secondEvaluation != null ? secondEvaluation : firstEvaluation;

      const finalGradeClosed = finalGrade != null && (!recoveryEligible || secondEvaluation != null);

      return {

        weightedExamAverage: clampGradeValue(weightedExamAverage),

        activityAverage: Number.isFinite(activity) ? clampGradeValue(activity) : null,

        firstEvaluation: clampGradeValue(firstEvaluation),

        recoveryEligible,

        recoveryScore: Number.isFinite(recovery) ? clampGradeValue(recovery) : null,

        secondEvaluation: clampGradeValue(secondEvaluation),

        substituteScore: Number.isFinite(psub) ? clampGradeValue(psub) : null,

        finalGrade: clampGradeValue(finalGrade),

        finalGradeClosed

      };

    }



    function getPme0100RequiredAverage(status, target, overrides = {}) {

      const baseScores = buildComponentScoreMap(status.components);

      Object.entries(overrides || {}).forEach(([key, value]) => {

        const numeric = Number(value);

        if (Number.isFinite(numeric)) baseScores[key] = numeric;

      });

      const remaining = (status.remainingComponents || []).filter((component) => !Number.isFinite(Number(overrides[component.key])));

      const evaluateWithFill = (fillValue) => {

        const scoreMap = { ...baseScores };

        remaining.forEach((component) => {

          scoreMap[component.key] = fillValue;

        });

        const evaluation = evaluatePme0100Formula(status.subject, scoreMap);

        return evaluation.finalGrade;

      };

      if (!remaining.length) {

        const evaluation = evaluatePme0100Formula(status.subject, baseScores);

        return evaluation.finalGradeClosed ? null : 11;

      }

      const atZero = evaluateWithFill(0);

      if (atZero != null && atZero >= target) return 0;

      const atTen = evaluateWithFill(10);

      if (atTen == null || atTen < target) return 11;

      let low = 0;

      let high = 10;

      for (let step = 0; step < 40; step += 1) {

        const mid = (low + high) / 2;

        const current = evaluateWithFill(mid);

        if (current == null || current < target) {

          low = mid;

        } else {

          high = mid;

        }

      }

      return high;

    }



    function getPme0100GradeStatus(subject) {

      const components = getSubjectGradeComponents(subject).map((component) => {

        const entries = getGradeEntriesForComponent(subject.code, component.key).slice().sort((a, b) => {

          const aDate = a.entryDate || "9999-12-31";

          const bDate = b.entryDate || "9999-12-31";

          if (aDate === bDate) return a.createdAt > b.createdAt ? -1 : 1;

          return aDate > bDate ? -1 : 1;

        });

        return {

          ...component,

          entries,

          score: getWeightedEntryAverage(entries)

        };

      });

      const evaluation = evaluatePme0100Formula(subject, buildComponentScoreMap(components));

      const mandatoryComponents = components.filter((component) => !component.optional && component.role !== "recoveryExam" && component.role !== "substituteExam");

      let remainingComponents = mandatoryComponents.filter((component) => component.score == null);

      const recoveryComponent = components.find((component) => component.role === "recoveryExam");

      if (!remainingComponents.length && evaluation.recoveryEligible && recoveryComponent && recoveryComponent.score == null) {

        remainingComponents = [recoveryComponent];

      }

      const knownComponents = components.filter((component) => component.score != null);

      const knownScores = mandatoryComponents.filter((component) => component.score != null).map((component) => Number(component.score));

      const knownAverage = knownScores.length

        ? knownScores.reduce((sum, score) => sum + score, 0) / knownScores.length

        : null;

      const zeroFilledScoreMap = buildComponentScoreMap(components);

      mandatoryComponents.forEach((component) => {

        if (zeroFilledScoreMap[component.key] == null) zeroFilledScoreMap[component.key] = 0;

      });

      const zeroFilledEvaluation = evaluatePme0100Formula(subject, zeroFilledScoreMap);

      let projectedMaintain = null;

      if (knownAverage != null) {

        const projectedScoreMap = buildComponentScoreMap(components);

        mandatoryComponents.forEach((component) => {

          if (projectedScoreMap[component.key] == null) projectedScoreMap[component.key] = knownAverage;

        });

        const projectedEvaluation = evaluatePme0100Formula(subject, projectedScoreMap);

        projectedMaintain = projectedEvaluation.finalGrade;

      }

      const requiredForFive = getPme0100RequiredAverage({ subject, components, remainingComponents }, 5);

      const requiredForSix = getPme0100RequiredAverage({ subject, components, remainingComponents }, 6);

      return {

        modelType: "pme0100_formula_2026",

        scenarioDisabled: true,

        subject,

        components,

        knownComponents,

        remainingComponents,

        knownContribution: 0,

        knownWeight: 0,

        remainingWeight: 0,

        currentLockedGrade: zeroFilledEvaluation.finalGrade == null ? 0 : zeroFilledEvaluation.finalGrade,

        finalGrade: evaluation.finalGradeClosed ? evaluation.finalGrade : null,

        knownAverage,

        projectedMaintain,

        requiredForFive,

        requiredForSix,

        weightedExamAverage: evaluation.weightedExamAverage,

        activityAverage: evaluation.activityAverage,

        firstEvaluation: evaluation.firstEvaluation,

        secondEvaluation: evaluation.secondEvaluation,

        recoveryEligible: evaluation.recoveryEligible,

        substituteScore: evaluation.substituteScore,

        recoveryScore: evaluation.recoveryScore

      };

    }



    function getGradeEntriesForSubject(subjectCode) {

      return (state.gradeEntries || []).filter((entry) => entry.subjectCode === subjectCode);

    }



    function getGradeEntriesForComponent(subjectCode, componentKey) {

      return getGradeEntriesForSubject(subjectCode).filter((entry) => entry.componentKey === componentKey);

    }



    function getWeightedEntryAverage(entries) {

      if (!entries.length) return null;

      let weightedSum = 0;

      let totalWeight = 0;



      entries.forEach((entry) => {

        const score = Number(entry.score);

        const weight = Number(entry.internalWeight || 1);

        if (!Number.isFinite(score) || !Number.isFinite(weight) || weight <= 0) return;

        weightedSum += score * weight;

        totalWeight += weight;

      });



      if (!totalWeight) return null;

      return weightedSum / totalWeight;

    }



    function getKnownAverage(knownContribution, knownWeight) {

      if (!knownWeight) return null;

      return knownContribution / knownWeight;

    }



    function getRequiredAverageForTarget(target, knownContribution, remainingWeight) {

      if (remainingWeight <= 0) return null;

      return (target * 100 - knownContribution) / remainingWeight;

    }



    function getRequiredAverageForStatus(target, status, overrides = {}) {

      if (status && status.modelType === "pme0100_formula_2026") {

        return getPme0100RequiredAverage(status, target, overrides);

      }

      return getRequiredAverageForTarget(target, status.knownContribution, status.remainingWeight);

    }



    function getRequirementTone(requiredAverage) {

      if (requiredAverage == null) return "neutral";

      if (requiredAverage <= 0) return "success";

      if (requiredAverage <= 5) return "success";

      if (requiredAverage <= 6.5) return "accent";

      if (requiredAverage <= 8) return "warning";

      return "danger";

    }



    function describeRequirement(requiredAverage, target, finalGrade) {

      if (requiredAverage == null) {

        return `Fechado em ${formatScore(finalGrade || 0)}`;

      }



      if (requiredAverage <= 0) {

        return `Já bate ${String(target).replace(".", ",")}`;

      }



      if (requiredAverage > 10) {

        return "Impossível só com o que falta";

      }



      return `${formatScore(requiredAverage)} em média`;

    }



    function buildBalancedPlanText(remainingComponents, requiredAverage) {

      if (!remainingComponents.length) return "Tudo dessa matéria já foi lançado.";

      if (requiredAverage == null) return "Sem itens pendentes.";

      if (requiredAverage <= 0) return "Mesmo zerando o que falta, a meta já foi alcançada com o que foi lançado.";

      if (requiredAverage > 10) return "Mesmo com 10,0 em todos os itens restantes, a meta não fecha.";

      return remainingComponents.map((component) => `${component.label} ≈ ${formatScore(requiredAverage)}`).join(" · ");

    }



    function getSubjectGradeStatus(subject) {

      const gradeModel = getSubjectGradeModel(subject);

      if (gradeModel.type === "pme0100_formula_2026") {

        return getPme0100GradeStatus(subject);

      }

      const components = getSubjectGradeComponents(subject).map((component) => {

        const entries = getGradeEntriesForComponent(subject.code, component.key).slice().sort((a, b) => {

          const aDate = a.entryDate || "9999-12-31";

          const bDate = b.entryDate || "9999-12-31";

          if (aDate === bDate) return a.createdAt > b.createdAt ? -1 : 1;

          return aDate > bDate ? -1 : 1;

        });

        return {

          ...component,

          entries,

          score: getWeightedEntryAverage(entries)

        };

      });



      const knownComponents = components.filter((component) => component.score != null);

      const remainingComponents = components.filter((component) => component.score == null);

      const knownContribution = knownComponents.reduce((sum, component) => sum + component.score * component.weight, 0);

      const knownWeight = knownComponents.reduce((sum, component) => sum + component.weight, 0);

      const remainingWeight = Math.max(0, 100 - knownWeight);

      const currentLockedGrade = knownContribution / 100;

      const finalGrade = remainingWeight === 0 ? currentLockedGrade : null;

      const knownAverage = getKnownAverage(knownContribution, knownWeight);

      const projectedMaintain = knownAverage == null ? null : (knownContribution + remainingWeight * knownAverage) / 100;

      const requiredForFive = getRequiredAverageForTarget(5, knownContribution, remainingWeight);

      const requiredForSix = getRequiredAverageForTarget(6, knownContribution, remainingWeight);



      return {

        subject,

        components,

        knownComponents,

        remainingComponents,

        knownContribution,

        knownWeight,

        remainingWeight,

        currentLockedGrade,

        finalGrade,

        knownAverage,

        projectedMaintain,

        requiredForFive,

        requiredForSix

      };

    }



    function removeGradeEntry(entryId) {

      const before = state.gradeEntries.length;

      state.gradeEntries = state.gradeEntries.filter((entry) => entry.id !== entryId);

      if (state.gradeEntries.length === before) return;

      if (state.editingGradeEntryId === entryId) state.editingGradeEntryId = null;

      saveState();

      showToast("Nota removida.");

      render();

    }



    function getGradeEntryById(entryId) {

      return (state.gradeEntries || []).find((entry) => entry.id === entryId) || null;

    }



    function startEditGradeEntry(entryId) {

      const entry = getGradeEntryById(entryId);

      if (!entry) return;

      state.editingGradeEntryId = entryId;

      state.gradeDraftSubjectCode = entry.subjectCode;

      state.gradeOverviewSubjectCode = entry.subjectCode;

      saveState();

      showToast("Nota carregada para edição.");

      render();

    }



    function cancelEditGradeEntry() {

      state.editingGradeEntryId = null;

      saveState();

      render();

    }





function upsertGradeEntryFromForm(form) {

  const editingId = state.editingGradeEntryId;

  const formData = new FormData(form);

  const subjectCode = String(formData.get("subjectCode") || "").trim();

  const componentKey = String(formData.get("componentKey") || "").trim();

  const label = String(formData.get("label") || "").trim();

  const entryType = String(formData.get("entryType") || "").trim() || "Lançamento";

  const notes = String(formData.get("notes") || "").trim();

  const entryDate = String(formData.get("entryDate") || "").trim();

  const score = Number(String(formData.get("score") || "").replace(",", "."));

  const internalWeight = Number(String(formData.get("internalWeight") || "1").replace(",", "."));



  if (!subjectCode || !componentKey || !Number.isFinite(score) || score < 0 || score > 10 || !Number.isFinite(internalWeight) || internalWeight <= 0) {

    showToast("Revise matéria, componente, nota e peso interno.");

    return;

  }



  if (editingId) {

    state.gradeEntries = state.gradeEntries.map((entry) => entry.id === editingId ? {

      ...entry,

      subjectCode,

      componentKey,

      label: label || entryType,

      entryType,

      notes,

      entryDate: entryDate || null,

      score,

      internalWeight,

      updatedAt: new Date().toISOString()

    } : entry);

    state.editingGradeEntryId = null;

    state.gradeDraftSubjectCode = subjectCode;

    saveState();

    showToast("Nota atualizada.");

    render();

    return;

  }



  state.gradeEntries.push({

    id: makeGradeEntryId(),

    subjectCode,

    componentKey,

    label: label || entryType,

    entryType,

    notes,

    entryDate: entryDate || null,

    score,

    internalWeight,

    createdAt: new Date().toISOString()

  });

  state.gradeDraftSubjectCode = subjectCode;

  saveState();

  form.reset();

  const dateInput = form.querySelector('input[name="entryDate"]');

  if (dateInput) dateInput.value = toIsoDate(today());

  const weightInput = form.querySelector('input[name="internalWeight"]');

  if (weightInput) weightInput.value = "1";

  const typeSelect = form.querySelector('select[name="entryType"]');

  if (typeSelect) typeSelect.value = "Prova";

  showToast("Nota adicionada.");

  render();

}





function getGradeDraftSubjectCode(preferredCode = null) {

  if (preferredCode && getSubject(preferredCode)) return preferredCode;

  if (getSubject(state.gradeDraftSubjectCode)) return state.gradeDraftSubjectCode;

  if (getSubject(state.gradeOverviewSubjectCode)) return state.gradeOverviewSubjectCode;

  return DATA.subjects[0].code;

}



function getGradeFocusSubjectCode(preferredCode = null) {

  if (preferredCode && getSubject(preferredCode)) return preferredCode;

  if (getSubject(state.gradeOverviewSubjectCode)) return state.gradeOverviewSubjectCode;

  if (getSubject(state.gradeDraftSubjectCode)) return state.gradeDraftSubjectCode;

  return DATA.subjects[0].code;

}



function renderGradeFormCard(referenceDate) {

  const editing = state.editingGradeEntryId ? getGradeEntryById(state.editingGradeEntryId) : null;

  const selectedSubjectCode = getGradeDraftSubjectCode(editing && editing.subjectCode ? editing.subjectCode : null);

  const selectedSubject = getSubject(selectedSubjectCode);

  const components = getSubjectGradeComponents(selectedSubject);

  const todayIso = toIsoDate(referenceDate);



  elements.gradeFormCard.innerHTML = `

    <div class="grade-form-stack">

      <div>

        <h3 class="card-title">${editing ? 'Editar nota' : 'Adicionar nota'}</h3>

        <div class="summary-hero">

          <span class="label">Lançamento flexível</span>

          <div class="title">Prova, trabalho, lista ou exercício</div>

          <div class="subvalue">Os lançamentos dentro do mesmo componente viram uma média ponderada pelo peso interno. Isso serve para exercícios em quantidade incerta ou trabalhos divididos em mais de uma entrega.${editing ? ' Você está editando um lançamento existente.' : ''}</div>

        </div>

      </div>



      <form id="gradeForm" class="deadline-form" style="margin-top: 14px;">

        <label class="field field--full">

          <span>Descrição curta</span>

          <input type="text" name="label" placeholder="Ex.: P2, Lista 4, Relatório 1, Exercício aula 3" value="${editing ? escapeHtml(editing.label || '') : ''}" required />

        </label>



        <div class="deadline-form-grid">

          <label class="field">

            <span>Matéria</span>

            <select name="subjectCode" id="gradeSubjectSelect" required>

              ${DATA.subjects.map((subject) => `<option value="${subject.code}" ${subject.code === selectedSubjectCode ? "selected" : ""}>${subject.shortName}</option>`).join("")}

            </select>

          </label>



          <label class="field">

            <span>Componente</span>

            <select name="componentKey" id="gradeComponentSelect" required>

              ${components.map((component) => `<option value="${component.key}" ${editing && editing.componentKey === component.key ? 'selected' : ''}>${escapeHtml(component.label)} · ${escapeHtml(getComponentWeightText(component))}</option>`).join("")}

            </select>

          </label>



          <label class="field">

            <span>Nota (0 a 10)</span>

            <input type="number" name="score" min="0" max="10" step="0.01" placeholder="6,5" value="${editing ? escapeHtml(String(editing.score).replace('.', ',')) : ''}" required />

          </label>



          <label class="field">

            <span>Peso interno</span>

            <input type="number" name="internalWeight" min="0.01" step="0.01" value="${editing ? escapeHtml(String(editing.internalWeight || 1).replace('.', ',')) : '1'}" required />

          </label>



          <label class="field">

            <span>Data do lançamento</span>

            <input type="date" name="entryDate" value="${editing ? escapeHtml(editing.entryDate || todayIso) : todayIso}" />

          </label>



          <label class="field">

            <span>Tipo</span>

            <select name="entryType">

              ${['Prova','Trabalho','Lista','Exercício','Relatório','Outro'].map((type) => `<option value="${type}" ${editing && editing.entryType === type ? 'selected' : (!editing && type === 'Prova' ? 'selected' : '')}>${type}</option>`).join('')}

            </select>

          </label>

        </div>



        <label class="field field--full">

          <span>Observação</span>

          <input type="text" name="notes" placeholder="Ex.: valendo metade, plataforma X, com consulta, professor Y" value="${editing ? escapeHtml(editing.notes || '') : ''}" />

        </label>



        <div class="deadline-actions">

          <button type="submit" class="btn btn-primary">${editing ? 'Salvar alteração' : 'Adicionar nota'}</button>

          ${editing ? '<button type="button" class="btn btn-ghost" id="cancelGradeEditBtn">Cancelar edição</button>' : ''}

        </div>

      </form>



      <ul class="grade-help-list">

        <li><strong>Provas:</strong> normalmente basta um lançamento em P1, P2 e P3.</li>

        <li><strong>Exercícios, listas e relatórios:</strong> pode lançar quantos quiser no mesmo componente; o motor atualiza a média daquele bloco.</li>

        <li><strong>Peso interno:</strong> use 1 quando todos valem igual; use 2, 3 etc. se um item valer mais que outro dentro do mesmo componente.</li>

      </ul>

    </div>

  `;

}





function getGradeScenarioDraft(subjectCode) {

  return state.gradeScenarioDrafts && state.gradeScenarioDrafts[subjectCode] ? state.gradeScenarioDrafts[subjectCode] : {};

}



function saveGradeScenarioDraft(subjectCode, draft, options = {}) {

  const nextDrafts = { ...(state.gradeScenarioDrafts || {}) };

  if (draft && Object.keys(draft).length) {

    nextDrafts[subjectCode] = draft;

  } else {

    delete nextDrafts[subjectCode];

  }

  state.gradeScenarioDrafts = nextDrafts;

  saveState();

  if (!options.silent) showToast(options.message || "Cenário salvo.");

  render();

}



function clearGradeScenarioDraft(subjectCode, options = {}) {

  saveGradeScenarioDraft(subjectCode, {}, { silent: options.silent, message: options.message || "Cenário limpo." });

}



function buildGradeScenarioPreset(status, target, strategy) {

  const components = status.remainingComponents || [];

  if (!components.length) return {};

  const requiredAverage = getRequiredAverageForStatus(target, status);

  if (requiredAverage == null) return {};

  if (requiredAverage <= 0) {

    return Object.fromEntries(components.map((component) => [component.key, 0]));

  }

  if (components.length === 1 || strategy === "balanced") {

    return Object.fromEntries(components.map((component) => [component.key, clamp(requiredAverage, 0, 10)]));

  }



  const plan = {};

  const earlierComponents = components.slice(0, -1);

  const finalComponent = components[components.length - 1];

  const shift = strategy === "frontload" ? 0.8 : -0.8;

  earlierComponents.forEach((component) => {

    plan[component.key] = clamp(requiredAverage + shift, 0, 10);

  });

  const contributionBeforeFinal = earlierComponents.reduce((sum, component) => sum + component.weight * plan[component.key], 0);

  const finalNeeded = (target * 100 - status.knownContribution - contributionBeforeFinal) / finalComponent.weight;

  plan[finalComponent.key] = clamp(finalNeeded, 0, 10);

  return plan;

}



function getGradeScenarioStatus(status, subjectCode) {

  const targets = getGradeTargets();

  const draft = getGradeScenarioDraft(subjectCode);

  const simulatedComponents = status.remainingComponents.map((component) => {

    const numeric = Number(draft[component.key]);

    return {

      ...component,

      simulatedScore: Number.isFinite(numeric) ? numeric : null

    };

  });

  const simulatedContribution = status.knownContribution + simulatedComponents.reduce((sum, component) => sum + (component.simulatedScore == null ? 0 : component.simulatedScore * component.weight), 0);

  const simulatedWeight = status.knownWeight + simulatedComponents.reduce((sum, component) => sum + (component.simulatedScore == null ? 0 : component.weight), 0);

  const remainingAfterDraftWeight = Math.max(0, 100 - simulatedWeight);

  const exactFinal = simulatedWeight === 100 ? simulatedContribution / 100 : null;

  return {

    draft,

    simulatedComponents,

    simulatedContribution,

    simulatedWeight,

    remainingAfterDraftWeight,

    exactFinal,

    currentScenarioBase: simulatedContribution / 100,

    primaryNeedAfterDraft: getRequiredAverageForTarget(targets.primary, simulatedContribution, remainingAfterDraftWeight),

    secondaryNeedAfterDraft: getRequiredAverageForTarget(targets.secondary, simulatedContribution, remainingAfterDraftWeight)

  };

}



function describeScenarioNeed(requiredAverage, target, exactFinal) {

  if (requiredAverage == null) {

    return exactFinal == null ? `Meta ${formatScore(target)} ainda em aberto` : `Cenário fecha em ${formatScore(exactFinal)}`;

  }

  if (requiredAverage <= 0) return `Meta ${formatScore(target)} já coberta`;

  if (requiredAverage > 10) return `Meta ${formatScore(target)} ainda impossível`;

  return `Faltam ${formatScore(requiredAverage)} em média no resto`;

}



function saveGradeScenarioFromForm(form) {

  const subjectCode = form.dataset.subjectCode;

  if (!subjectCode) return;

  const draft = {};

  let invalid = false;

  form.querySelectorAll('[data-sim-component]').forEach((input) => {

    const raw = String(input.value || '').trim().replace(',', '.');

    if (!raw) return;

    const numeric = Number(raw);

    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {

      invalid = true;

      return;

    }

    draft[input.dataset.simComponent] = numeric;

  });

  if (invalid) {

    showToast('Use notas entre 0 e 10 no simulador.');

    return;

  }

  saveGradeScenarioDraft(subjectCode, draft, { message: 'Cenário atualizado.' });

}



function applyGradeScenarioPreset(subjectCode, strategy, targetType) {

  const subject = getSubject(subjectCode);

  if (!subject) return;

  const status = getSubjectGradeStatus(subject);

  const targets = getGradeTargets();

  const target = targetType === 'secondary' ? targets.secondary : targets.primary;

  const preset = buildGradeScenarioPreset(status, target, strategy);

  saveGradeScenarioDraft(subjectCode, preset, {

    message:

      strategy === 'frontload'

        ? 'Preset aplicado: aliviar componente final.'

        : strategy === 'backload'

          ? 'Preset aplicado: empurrar mais nota para o final.'

          : 'Preset aplicado: plano equilibrado.'

  });

}



function getGradeOverviewModel(subjectCode) {

  const subject = getSubject(subjectCode);

  if (!subject) return null;



  const targets = getGradeTargets();

  const status = getSubjectGradeStatus(subject);

  const requiredPrimary = getRequiredAverageForStatus(targets.primary, status);

  const requiredSecondary = getRequiredAverageForStatus(targets.secondary, status);



  return {

    subject,

    targets,

    status,

    requiredPrimary,

    requiredSecondary,

    tonePrimary: getRequirementTone(requiredPrimary),

    toneSecondary: getRequirementTone(requiredSecondary),

    remainingLabels: status.remainingComponents.length

      ? status.remainingComponents.map((component) => `<span class="chip neutral">${escapeHtml(component.label)} · ${escapeHtml(getComponentWeightText(component))}</span>`).join("")

      : '<span class="chip success">Tudo lançado</span>',

    scenario: status.scenarioDisabled ? null : getGradeScenarioStatus(status, subject.code)

  };

}



function renderGradeScenarioInputs(model) {

  if (model.status.scenarioDisabled) {

    return '<div class="grade-empty">Simulador automático desativado para esta matéria: a nota usa fórmula própria com P, E, PSUB e PREC. Lance os componentes reais para ver o cálculo correto.</div>';

  }

  if (!model.status.remainingComponents.length) {

    return '<div class="grade-empty">Sem componentes pendentes para simular.</div>';

  }



  return `

    <form class="inline-form-grid gradeScenarioForm" data-subject-code="${model.subject.code}" style="margin-top: 12px;">

      ${model.status.remainingComponents.map((component) => `

        <label class="field">

          <span>${escapeHtml(component.label)} · ${escapeHtml(getComponentWeightText(component))}</span>

          <input type="number" min="0" max="10" step="0.1" data-sim-component="${component.key}" value="${model.scenario.draft[component.key] == null ? '' : escapeHtml(String(model.scenario.draft[component.key]).replace('.', ','))}" placeholder="${model.requiredPrimary != null && model.requiredPrimary > 0 && model.requiredPrimary <= 10 ? formatScore(model.requiredPrimary) : '0,0'}" />

        </label>

      `).join('')}

      <div class="field field--full">

        <span>Preset rápido para a meta principal (${formatScore(model.targets.primary)})</span>

        <div class="scenario-actions">

          <button type="submit" class="btn btn-soft">Salvar cenário</button>

          <button type="button" class="btn btn-ghost" data-scenario-preset="balanced" data-scenario-target="primary" data-subject-code="${model.subject.code}">Equilibrar</button>

          <button type="button" class="btn btn-ghost" data-scenario-preset="frontload" data-scenario-target="primary" data-subject-code="${model.subject.code}">Aliviar final</button>

          <button type="button" class="btn btn-ghost" data-scenario-preset="backload" data-scenario-target="primary" data-subject-code="${model.subject.code}">Empurrar para o final</button>

          <button type="button" class="btn btn-ghost" data-scenario-clear="1" data-subject-code="${model.subject.code}">Limpar</button>

        </div>

      </div>

    </form>

  `;

}



function renderGradeEntryList(component) {

  if (!component.entries.length) {

    return `<div class="grade-empty">Nenhum lançamento ainda neste componente.</div>`;

  }



  return `<div class="grade-entry-list">${component.entries.map((entry) => `

    <div class="grade-entry-item">

      <div class="grade-entry-top">

        <div>

          <h5>${escapeHtml(entry.label || component.label)}</h5>

          <p>${escapeHtml(entry.entryType || "Lançamento")}${entry.entryDate ? ` · ${escapeHtml(formatDateLong(parseDate(entry.entryDate)))}` : ""}${entry.notes ? ` · ${escapeHtml(entry.notes)}` : ""}</p>

        </div>

        <div class="grade-entry-actions">

          <span class="chip accent">${formatScore(entry.score)}</span>

          <span class="chip neutral">peso ${Number(entry.internalWeight || 1).toString().replace(".", ",")}</span>

          <button class="btn btn-soft" data-grade-action="edit" data-grade-entry-id="${entry.id}">Editar</button>

          <button class="btn btn-ghost" data-grade-action="delete" data-grade-entry-id="${entry.id}">Excluir</button>

        </div>

      </div>

    </div>

  `).join("")}</div>`;

}



function renderGradeComponentItem(component) {

  const scoreText = component.score == null ? "Sem nota lançada" : `Média lançada ${formatScore(component.score)}`;

  return `

    <div class="grade-component-item">

      <div class="grade-component-top">

        <div>

          <h4>${escapeHtml(component.label)}</h4>

          <p>${scoreText} · ${component.entries.length} lançamento(s)</p>

        </div>

        <div class="grade-inline-actions">

          <span class="chip neutral">${escapeHtml(getComponentWeightText(component))}</span>

          ${component.score == null ? '<span class="chip warning">pendente</span>' : `<span class="chip success">${formatScore(component.score)}</span>`}

        </div>

      </div>

      ${renderGradeEntryList(component)}

    </div>

  `;

}



function renderGradeSubjectCard(model) {

  const { subject, status, targets, requiredPrimary, requiredSecondary, tonePrimary, toneSecondary, scenario, remainingLabels } = model;
  if (status.modelType === "pme0100_formula_2026") {

    return renderCustomGradeSubjectCard(model);

  }
  const normalizedQuery = String(state.notesSearchTerm || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const visibleComponents = !normalizedQuery
    ? status.components
    : status.components.filter((component) => {
        const haystack = [
          subject.name,
          subject.shortName,
          subject.code,
          component.label,
          component.type,
          ...(component.entries || []).map((entry) => `${entry.title || ""} ${entry.entryType || ""} ${entry.label || ""}`)
        ]
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return haystack.includes(normalizedQuery);
      });

  return `

    <article class="grade-subject-card">

      <div class="grade-subject-header">

        <div>

          <h3>${escapeHtml(subject.name)}</h3>

          <p class="muted">${escapeHtml(subject.examSchemeNote)}</p>

        </div>

        <div class="chip-row">

          <span class="chip accent">Peso lançado ${formatWeight(status.knownWeight)}</span>

          <span class="chip neutral">Peso faltante ${formatWeight(status.remainingWeight)}</span>

        </div>

      </div>

      <div class="grade-meta-grid">

        <div class="grade-metric">

          <span class="label">Contribuição já lançada</span>

          <strong>${formatScore(status.currentLockedGrade)}</strong>

          <p>É a parte da nota final já capturada pelos lançamentos feitos até agora.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Média dos itens lançados</span>

          <strong>${status.knownAverage == null ? '—' : formatScore(status.knownAverage)}</strong>

          <p>Útil para projetar o semestre sem assumir nota zero no que ainda falta.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Projeção se repetir a média atual</span>

          <strong>${status.projectedMaintain == null ? '—' : formatScore(status.projectedMaintain)}</strong>

          <p>Projeção simples: usa a média já lançada como referência para os itens restantes.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Nota final fechada</span>

          <strong>${status.finalGrade == null ? 'Em aberto' : formatScore(status.finalGrade)}</strong>

          <p>${status.finalGrade == null ? 'Ainda há componentes sem nota lançada.' : 'Todos os componentes com nota registrada.'}</p>

        </div>

      </div>

      <div class="grade-target-grid">

        <div class="grade-target">

          <span class="label">Meta ${formatScore(targets.primary)}</span>

          <strong>${describeRequirement(requiredPrimary, targets.primary, status.finalGrade)}</strong>

          <p>${buildBalancedPlanText(status.remainingComponents, requiredPrimary)}</p>

          <div class="chip-row"><span class="chip ${tonePrimary}">Plano equilibrado</span></div>

        </div>

        <div class="grade-target">

          <span class="label">Meta ${formatScore(targets.secondary)}</span>

          <strong>${describeRequirement(requiredSecondary, targets.secondary, status.finalGrade)}</strong>

          <p>${buildBalancedPlanText(status.remainingComponents, requiredSecondary)}</p>

          <div class="chip-row"><span class="chip ${toneSecondary}">Plano equilibrado</span></div>

        </div>

      </div>

      <div class="grade-component-item">

        <div class="grade-component-top">

          <div>

            <h4>Simulador de cenário</h4>

            <p>Preencha só o que falta ou use um preset rápido para ver combinações menos pesadas.</p>

          </div>

          <div class="grade-inline-actions">

            <span class="chip accent">Base do cenário ${formatScore(scenario.currentScenarioBase)}</span>

            ${scenario.exactFinal == null ? `<span class="chip neutral">Faltam ${formatWeight(scenario.remainingAfterDraftWeight)}</span>` : `<span class="chip success">Final ${formatScore(scenario.exactFinal)}</span>`}

          </div>

        </div>

        ${renderGradeScenarioInputs(model)}

        <div class="scenario-summary">

          <div class="grade-target-grid">

            <div class="grade-target">

              <span class="label">Cenário atual</span>

              <strong>${scenario.exactFinal == null ? formatScore(scenario.currentScenarioBase) : formatScore(scenario.exactFinal)}</strong>

              <p>${scenario.exactFinal == null ? `Cenário parcial: faltam ${formatWeight(scenario.remainingAfterDraftWeight)} para fechar a simulação completa.` : 'Cenário completo com nota final exata.'}</p>

            </div>

            <div class="grade-target">

              <span class="label">Depois do cenário · meta ${formatScore(targets.primary)}</span>

              <strong>${describeScenarioNeed(scenario.primaryNeedAfterDraft, targets.primary, scenario.exactFinal)}</strong>

              <p>${buildBalancedPlanText(scenario.simulatedComponents.filter((component) => component.simulatedScore == null), scenario.primaryNeedAfterDraft)}</p>

            </div>

            <div class="grade-target">

              <span class="label">Depois do cenário · meta ${formatScore(targets.secondary)}</span>

              <strong>${describeScenarioNeed(scenario.secondaryNeedAfterDraft, targets.secondary, scenario.exactFinal)}</strong>

              <p>${buildBalancedPlanText(scenario.simulatedComponents.filter((component) => component.simulatedScore == null), scenario.secondaryNeedAfterDraft)}</p>

            </div>

          </div>

        </div>

      </div>

      <div class="chip-row">${remainingLabels}</div>

      ${normalizedQuery ? `<div class="grade-filter-hint">Filtro ativo: <strong>${escapeHtml(state.notesSearchTerm)}</strong> · ${visibleComponents.length} componente${visibleComponents.length === 1 ? "" : "s"} visível${visibleComponents.length === 1 ? "" : "is"}</div>` : ""}

      <div class="grade-component-list">

        ${visibleComponents.length
          ? visibleComponents.map((component) => renderGradeComponentItem(component)).join("")
          : `<div class="grade-empty">Nenhum componente dessa matéria combina com o filtro atual.</div>`}

      </div>

    </article>

  `;

}



function renderGradeScenarioBlock(model) {

  const { status, targets, scenario } = model;

  if (status.scenarioDisabled) {

    const chips = [

      status.weightedExamAverage == null ? "P em aberto" : `P ${formatScore(status.weightedExamAverage)}`,

      status.activityAverage == null ? "E em aberto" : `E ${formatScore(status.activityAverage)}`,

      status.firstEvaluation == null ? "M1 em aberto" : `M1 ${formatScore(status.firstEvaluation)}`

    ];

    if (status.finalGrade != null) {

      chips.push(`Fechamento ${formatScore(status.finalGrade)}`);

    } else if (status.recoveryEligible) {

      chips.push("PREC ainda pode fechar a matéria");

    }

    return `

      <div class="grade-component-item">

        <div class="grade-component-top">

          <div>

            <h4>Fórmula especial da disciplina</h4>

            <p>PME0100 usa P, E, PSUB e PREC. O app calcula o fechamento exato a partir dos lançamentos reais.</p>

          </div>

        </div>

        <div class="grade-empty">Use os componentes abaixo para lançar P1, P2, P3, Atividades (E), PSUB e PREC. O simulador genérico foi ocultado para evitar projeção errada.</div>

        <div class="chip-row" style="margin-top: 12px;">

          ${chips.map((chip) => `<span class="chip neutral">${escapeHtml(chip)}</span>`).join("")}

        </div>

      </div>

    `;

  }

  return `

      <div class="grade-component-item">

        <div class="grade-component-top">

          <div>

            <h4>Simulador de cenário</h4>

            <p>Preencha só o que falta ou use um preset rápido para ver combinações menos pesadas.</p>

          </div>

          <div class="grade-inline-actions">

            <span class="chip accent">Base do cenário ${formatScore(scenario.currentScenarioBase)}</span>

            ${scenario.exactFinal == null ? `<span class="chip neutral">Faltam ${formatWeight(scenario.remainingAfterDraftWeight)}</span>` : `<span class="chip success">Final ${formatScore(scenario.exactFinal)}</span>`}

          </div>

        </div>

        ${renderGradeScenarioInputs(model)}

        <div class="scenario-summary">

          <div class="grade-target-grid">

            <div class="grade-target">

              <span class="label">Cenário atual</span>

              <strong>${scenario.exactFinal == null ? formatScore(scenario.currentScenarioBase) : formatScore(scenario.exactFinal)}</strong>

              <p>${scenario.exactFinal == null ? `Cenário parcial: faltam ${formatWeight(scenario.remainingAfterDraftWeight)} para fechar a simulação completa.` : 'Cenário completo com nota final exata.'}</p>

            </div>

            <div class="grade-target">

              <span class="label">Depois do cenário · meta ${formatScore(targets.primary)}</span>

              <strong>${describeScenarioNeed(scenario.primaryNeedAfterDraft, targets.primary, scenario.exactFinal)}</strong>

              <p>${buildBalancedPlanText(scenario.simulatedComponents.filter((component) => component.simulatedScore == null), scenario.primaryNeedAfterDraft)}</p>

            </div>

            <div class="grade-target">

              <span class="label">Depois do cenário · meta ${formatScore(targets.secondary)}</span>

              <strong>${describeScenarioNeed(scenario.secondaryNeedAfterDraft, targets.secondary, scenario.exactFinal)}</strong>

              <p>${buildBalancedPlanText(scenario.simulatedComponents.filter((component) => component.simulatedScore == null), scenario.secondaryNeedAfterDraft)}</p>

            </div>

          </div>

        </div>

      </div>

    `;

}



function renderCustomGradeSubjectCard(model) {

  const { subject, status, targets, requiredPrimary, requiredSecondary, tonePrimary, toneSecondary, remainingLabels } = model;
  const normalizedQuery = String(state.notesSearchTerm || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const visibleComponents = !normalizedQuery
    ? status.components
    : status.components.filter((component) => {
        const haystack = [
          subject.name,
          subject.shortName,
          subject.code,
          component.label,
          component.type,
          ...(component.entries || []).map((entry) => `${entry.title || ""} ${entry.entryType || ""} ${entry.label || ""}`)
        ]
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return haystack.includes(normalizedQuery);
      });

  return `

    <article class="grade-subject-card">

      <div class="grade-subject-header">

        <div>

          <h3>${escapeHtml(subject.name)}</h3>

          <p class="muted">${escapeHtml(subject.examSchemeNote)}</p>

        </div>

        <div class="chip-row">

          <span class="chip accent">${status.weightedExamAverage == null ? 'P em aberto' : `P ${formatScore(status.weightedExamAverage)}`}</span>

          <span class="chip neutral">${status.activityAverage == null ? 'E em aberto' : `E ${formatScore(status.activityAverage)}`}</span>

          ${status.recoveryEligible ? '<span class="chip warning">Faixa de recuperação</span>' : ''}

        </div>

      </div>

      <div class="grade-meta-grid">

        <div class="grade-metric">

          <span class="label">Base com faltantes zerados</span>

          <strong>${formatScore(status.currentLockedGrade)}</strong>

          <p>Piso da matéria se o que falta ficar zerado nos componentes obrigatórios.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Média simples dos itens lançados</span>

          <strong>${status.knownAverage == null ? '—' : formatScore(status.knownAverage)}</strong>

          <p>Referência simples para preencher o restante; não substitui a fórmula oficial.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Projeção repetindo a média atual</span>

          <strong>${status.projectedMaintain == null ? '—' : formatScore(status.projectedMaintain)}</strong>

          <p>Preenche os componentes obrigatórios pendentes com a sua média atual e aplica a regra real.</p>

        </div>

        <div class="grade-metric">

          <span class="label">Fechamento atual</span>

          <strong>${status.finalGrade == null ? 'Em aberto' : formatScore(status.finalGrade)}</strong>

          <p>${status.finalGrade == null
            ? (status.recoveryEligible ? 'M1 caiu na faixa de recuperação; PREC ainda pode definir o fechamento.' : 'Ainda faltam componentes determinantes para fechar a disciplina.')
            : 'Regra oficial aplicada com PSUB/PREC quando lançados.'}</p>

        </div>

      </div>

      <div class="grade-target-grid">

        <div class="grade-target">

          <span class="label">Meta ${formatScore(targets.primary)}</span>

          <strong>${describeRequirement(requiredPrimary, targets.primary, status.finalGrade)}</strong>

          <p>${buildBalancedPlanText(status.remainingComponents, requiredPrimary)}</p>

          <div class="chip-row"><span class="chip ${tonePrimary}">Plano equilibrado</span></div>

        </div>

        <div class="grade-target">

          <span class="label">Meta ${formatScore(targets.secondary)}</span>

          <strong>${describeRequirement(requiredSecondary, targets.secondary, status.finalGrade)}</strong>

          <p>${buildBalancedPlanText(status.remainingComponents, requiredSecondary)}</p>

          <div class="chip-row"><span class="chip ${toneSecondary}">Plano equilibrado</span></div>

        </div>

      </div>

      ${renderGradeScenarioBlock(model)}

      <div class="chip-row">${remainingLabels}</div>

      ${normalizedQuery ? `<div class="grade-filter-hint">Filtro ativo: <strong>${escapeHtml(state.notesSearchTerm)}</strong> · ${visibleComponents.length} componente${visibleComponents.length === 1 ? "" : "s"} visível${visibleComponents.length === 1 ? "" : "is"}</div>` : ""}

      <div class="grade-component-list">

        ${visibleComponents.length
          ? visibleComponents.map((component) => renderGradeComponentItem(component)).join("")
          : `<div class="grade-empty">Nenhum componente dessa matéria combina com o filtro atual.</div>`}

      </div>

    </article>

  `;

}



function renderGradeOverviewHero(model) {

  const guideList = Array.isArray(GRADE_UI.guideItems) && GRADE_UI.guideItems.length
    ? renderDetailList(
        GRADE_UI.guideItems.map((item) => ({
          value: escapeHtml(item)
        })),
        { className: "note-list grade-help-list", valueOnly: true }
      )
    : "";

  return `

    <div class="grade-hero">

      <span class="label">${escapeHtml(GRADE_UI.heroLabel || "Notas e metas")}</span>

      <h2>${escapeHtml(GRADE_UI.heroTitle || "Selecione a matéria para analisar notas e simular cenários")}</h2>

      <div class="subvalue">${escapeHtml(GRADE_UI.heroSubtitle || "A análise detalhada agora fica focada em uma matéria por vez, reduzindo ruído visual sem perder o simulador e as metas.")}</div>

      <form id="gradeTargetsForm" class="inline-form-grid" style="margin-top: 10px;">

        <label class="field">

          <span>Matéria em foco</span>

          <select id="gradeOverviewSubjectSelect">

            ${DATA.subjects.map((item) => `<option value="${item.code}" ${item.code === model.subject.code ? "selected" : ""}>${item.shortName}</option>`).join("")}

          </select>

        </label>

        <label class="field">

          <span>Meta principal</span>

          <input type="number" name="primaryTarget" min="0" max="10" step="0.1" value="${model.targets.primary}" required />

        </label>

        <label class="field">

          <span>Meta secundária</span>

          <input type="number" name="secondaryTarget" min="0" max="10" step="0.1" value="${model.targets.secondary}" required />

        </label>

        <label class="field">

          <span>Busca rápida</span>

          <input type="search" id="gradeNotesSearchInput" value="${escapeHtml(state.notesSearchTerm || "")}" placeholder="Filtrar por componente, prova ou matéria" />

        </label>

        <button type="submit" class="btn btn-soft">Salvar metas</button>

      </form>

      ${guideList ? `
        <div class="grade-component-item">
          <div class="grade-component-top">
            <div>
              <h4>${escapeHtml(GRADE_UI.guideTitle || "Como usar sem se perder")}</h4>
              <p>Fluxo curto para atualizar notas sem transformar essa aba num painel pesado.</p>
            </div>
          </div>
          ${guideList}
        </div>
      ` : ""}

    </div>

  `;

}



function renderGradesPage(referenceDate) {

  renderGradeFormCard(referenceDate);



  const model = getGradeOverviewModel(getGradeFocusSubjectCode());

  if (!model) {

    elements.gradesSummaryCard.innerHTML = `<div class="grade-empty">${escapeHtml(GRADE_UI.emptySubject || "Nenhuma matéria disponível.")}</div>`;

    return;

  }



  elements.gradesSummaryCard.innerHTML = `

    <div class="grade-stack">

      ${renderGradeOverviewHero(model)}

      <div class="grade-subject-list">

        ${renderGradeSubjectCard(model)}

      </div>

    </div>

  `;

}



    function renderMainTask(plan, referenceDate) {

      if (!plan) {

        elements.mainTaskCard.innerHTML = `

          <div class="focus-topline">

            <h3 class="card-title">Matéria do dia</h3>

          </div>

          <div class="empty-state">Nenhuma tarefa pendente apareceu na janela ativa. Se isso acontecer no seu semestre, recalcule ou marque novas tarefas como não concluídas para a matéria voltar ao topo.</div>

        `;

        return;

      }



      const { subject, task, pinned } = plan;

      const phase = getPhase(subject, task.phaseId);

      const nextExam = getNextExam(subject, referenceDate);

      const risk = getRiskLabel(subjectScore(subject, referenceDate));

      const reasons = getReasonChips(task, subject, referenceDate);

      const sessionLabel = getSessionLabel(task.id);

      const stepItems = getTaskSteps(task)

        .map((step, index) => `

          <li>

            <span class="step-index">${index + 1}</span>

            <div>

              <strong>Passo ${index + 1}</strong>

              <div class="muted">${escapeHtml(step)}</div>

            </div>

          </li>

        `)

        .join("");

      const whyText = [subject.summary, task.why].join(" ");

      const reasonChips = reasons.map((reason) => `<span class="chip neutral">${escapeHtml(reason)}</span>`).join("");

      const sourceChips = task.source.slice(0, 3).map((name) => `<span class="chip neutral">${escapeHtml(name)}</span>`).join("");

      const extraSourceCount = Math.max(0, task.source.length - 3);

      const lightDelayCount = getTaskMeta(task.id).lightDelayCount || 0;



      elements.mainTaskCard.innerHTML = `

        <div class="focus-topline">

          <h3 class="card-title">Matéria do dia</h3>

          <div class="chip-row">

            <span class="chip ${risk.tone}">Risco ${risk.label}</span>

            <span class="chip accent">${task.phaseId}</span>

            <span class="chip neutral">${modeLabel()}</span>

            ${lightDelayCount > 0 ? `<span class="chip warning">atraso leve ${lightDelayCount}d</span>` : ""}

            ${pinned ? `<span class="chip warning">mantida por débito aberto</span>` : ""}

            ${sessionLabel ? `<span class="chip success">${escapeHtml(sessionLabel)}</span>` : ""}

            <button class="btn btn-ghost btn-inline-toggle" type="button" data-action="toggle-dashboard-focus">${state.dashboardFocusMode ? "Sair do foco" : "Modo foco"}</button>

          </div>

        </div>



        <div class="focus-layout">

          <div class="focus-copy">

            <div class="focus-code">${escapeHtml(subject.code)} · ${escapeHtml(subject.shortName)}</div>

            <h2 class="main-subject">${escapeHtml(subject.name)}</h2>

            <h3 class="main-task-title">${escapeHtml(task.title)}</h3>

            <p class="lede">${escapeHtml(getTaskText(task))}</p>



            <div class="focus-callout">

              <div class="focus-callout-title">Por que essa matéria foi escolhida</div>

              <div class="muted">${escapeHtml(whyText)}</div>

              <div class="chip-row">${reasonChips}</div>

            </div>



            <div class="subsection-title">O que fazer agora</div>

            <ul class="step-list step-grid">

              ${stepItems}

            </ul>



            <div class="action-row">

              <button class="btn btn-primary" data-action="start" data-task-id="${task.id}">COMEÇAR AGORA</button>

              <button class="btn btn-soft" data-action="complete" data-task-id="${task.id}">Concluí</button>

              <button class="btn btn-ghost" data-action="skip" data-task-id="${task.id}">Não rolou hoje</button>

              <button class="btn btn-add-planner" data-action="add-to-planner" data-task-id="${task.id}" title="Adicionar ao planner de hoje">+ Planner</button>

              <button class="btn btn-ghost" data-action="next-same" data-task-id="${task.id}">Próxima da mesma matéria</button>

            </div>

          </div>



          <aside class="focus-side">

            <div class="snapshot-grid">

              <div class="snapshot">

                <div class="label">Tempo estimado</div>

                <div class="value">${getTaskMinutes(task)} min</div>

                <div class="subvalue">modo ${modeLabel().toLowerCase()}</div>

              </div>

              <div class="snapshot">

                <div class="label">Próxima prova</div>

                <div class="value">${nextExam ? escapeHtml(nextExam.label) : "—"}</div>

                <div class="subvalue">${nextExam ? `${formatDate(parseDate(nextExam.examDate))} · ${Math.max(0, daysBetween(referenceDate, parseDate(nextExam.examDate)))} dias` : "sem prova futura"}</div>

              </div>

              <div class="snapshot">

                <div class="label">Peso pendente</div>

                <div class="value">${Math.round(getRemainingWeight(subject, referenceDate))}%</div>

                <div class="subvalue">${escapeHtml(subject.outsideDependency)}</div>

              </div>

              <div class="snapshot">

                <div class="label">Fase ativa</div>

                <div class="value">${escapeHtml(phase.label)}</div>

                <div class="subvalue">${formatDateLong(parseDate(phase.examDate))}</div>

              </div>

            </div>



            <div class="mini-card">

              <div class="focus-callout-title">Abrir primeiro</div>

              <div class="key-sources">

                ${sourceChips}

                ${extraSourceCount > 0 ? `<span class="chip neutral">+${extraSourceCount} fonte${extraSourceCount > 1 ? "s" : ""}</span>` : ""}

              </div>

              <div class="mini">Arquivo principal: ${escapeHtml(task.source[0])}</div>

            </div>

          </aside>

        </div>

      `;

    }



    function renderExecutiveSummary(plan, referenceDate) {

      const nextExamAcross = DATA.subjects

        .map((subject) => {

          const exam = getNextExam(subject, referenceDate);

          if (!exam) return null;

          return { subject, exam, dateObj: parseDate(exam.examDate) };

        })

        .filter(Boolean)

        .sort((a, b) => a.dateObj - b.dateObj)[0];



      const mostCritical = DATA.subjects

        .map((subject) => ({ subject, score: subjectScore(subject, referenceDate) }))

        .sort((a, b) => b.score - a.score)[0];



      const pendingCount = getPendingCount(referenceDate);

      const recentHours = getTotalRecentHours(referenceDate);

      const daysSince = mostCritical ? getDaysSinceLastStudy(mostCritical.subject.code, referenceDate) : 0;

      const nextExamDays = nextExamAcross ? Math.max(0, daysBetween(referenceDate, nextExamAcross.dateObj)) : null;

      const summaryMetrics = [
        {
          label: "Total pendente",
          value: String(pendingCount),
          subvalue: "tarefas ativas na janela atual"
        },
        {
          label: "Horas recentes",
          value: formatHours(recentHours),
          subvalue: "últimos 7 dias registrados"
        },
        {
          label: "Matéria crítica",
          value: mostCritical ? escapeHtml(mostCritical.subject.shortName) : "—",
          subvalue: mostCritical ? getRiskLabel(mostCritical.score).label.toLowerCase() : "—"
        },
        {
          label: "Última prática",
          value: daysSince >= 999 ? "nunca" : `${daysSince} d`,
          subvalue: "na matéria mais crítica"
        }
      ];

      const summaryDetails = [
        {
          label: "Data considerada",
          value: `${escapeHtml(formatDateLong(referenceDate))} · o sistema usa a data do seu dispositivo`
        },
        {
          label: "Modo atual",
          value: `${escapeHtml(modeLabel())} · fila curta para reduzir abandono`
        },
        {
          label: "Matéria do dia",
          value: plan
            ? `${escapeHtml(plan.subject.shortName)} · ${escapeHtml(plan.task.title)}`
            : "nenhuma tarefa pendente"
        }
      ];



      elements.executiveSummary.innerHTML = `

        <div class="main-task-header">

          <h3 class="card-title">Resumo executivo</h3>

          <span class="chip neutral">${modeLabel()}</span>

        </div>



        <div class="summary-hero">

          <div class="label">Próxima prova do semestre</div>

          <div class="title">${nextExamAcross ? `${escapeHtml(nextExamAcross.subject.shortName)} · ${escapeHtml(nextExamAcross.exam.label)}` : "Sem prova futura"}</div>

          <div class="subvalue">${nextExamAcross ? `${formatDateLong(nextExamAcross.dateObj)} · ${nextExamDays} ${nextExamDays === 1 ? "dia" : "dias"}` : "Sem data futura no cronograma extraído."}</div>

        </div>



        ${renderMetricGrid(summaryMetrics, { marginTop: "14px" })}

        ${renderDetailList(summaryDetails, { marginTop: "14px" })}

      `;

    }



    function renderWhatIf(plan, referenceDate) {

      if (!plan) {

        elements.whatIfCard.innerHTML = `<h3 class="card-title">Se eu não concluir</h3><div class="empty-state">Sem tarefa principal ativa agora.</div>`;

        return;

      }



      const { task, subject } = plan;

      const currentMeta = getTaskMeta(task.id);

      const futureText = describeNoFinish(task, subject, referenceDate);

      const skipCount = currentMeta.skipCount || 0;

      const shrinkWillHappen = skipCount >= 1 || state.mode === "exausto" || state.mode === "m30";



      elements.whatIfCard.innerHTML = `

        <div class="main-task-header">

          <h3 class="card-title">Se eu não concluir</h3>

          <span class="chip warning">${skipCount > 0 ? `${skipCount} adiamento${skipCount > 1 ? "s" : ""}` : "sem débito acumulado"}</span>

        </div>

        <h2 style="margin: 4px 0 8px; font-size: 24px; line-height: 1.08; letter-spacing: -0.03em;">Se travar, o sistema corta atrito.</h2>

        <p class="lede">${escapeHtml(futureText)}</p>



        <ul class="note-list" style="margin-top: 14px;">

          <li>

            <strong>Regra prática</strong>

            <span class="muted">${escapeHtml(subject.shortName)} continua no topo até você destravar ou até outra prova claramente mais urgente ultrapassar o risco dela.</span>

          </li>

          <li>

            <strong>Adaptação automática</strong>

            <span class="muted">${shrinkWillHappen ? `A próxima versão já fica menor (${task.minutes.exausto || Math.round(task.minutes.normal * 0.5)} min).` : "Se travar por 2 dias, a tarefa é quebrada automaticamente em uma versão menor."}</span>

          </li>

          <li>

            <strong>Sem culpa artificial</strong>

            <span class="muted">A fila máxima continua curta. O sistema prefere manter movimento real a fingir organização perfeita.</span>

          </li>

        </ul>

      `;

    }



    function renderTodayQueue(queue, referenceDate) {

      if (!queue.length) {

        elements.todayQueue.innerHTML = `<h3 class="card-title">Hoje</h3><div class="empty-state">Sem fila ativa agora.</div>`;

        return;

      }



      const totalMinutes = queue.reduce((acc, item) => acc + getTaskMinutes(item.task), 0);



      elements.todayQueue.innerHTML = `

        <div class="main-task-header">

          <h3 class="card-title">Hoje</h3>

          <div class="chip-row">

            <span class="chip accent">${queue.length} tarefa${queue.length > 1 ? "s" : ""}</span>

            <span class="chip neutral">${totalMinutes} min totais</span>

          </div>

        </div>

        <div class="mini">Fila curta por desenho. O objetivo é você abrir e agir, não organizar demais.</div>

        <div class="queue-list" style="margin-top: 14px;">

          ${queue.map((item, index) => {

            const meta = getTaskMeta(item.task.id);

            const statusTone = item.slot === "Agora" ? "accent" : item.slot === "Depois" ? "warning" : "neutral";

            const risk = getRiskLabel(subjectScore(item.subject, referenceDate));

            return `

              <div class="queue-item queue-item--${statusTone}">

                <div class="queue-item-top">

                  <div>

                    <div class="queue-meta" style="margin-bottom: 8px;">

                      <span class="chip ${statusTone}">${escapeHtml(item.slot)}</span>

                      <span class="chip neutral">${escapeHtml(item.subject.shortName)}</span>

                      <span class="chip ${risk.tone}">${risk.label}</span>

                      ${meta.lightDelayCount > 0 ? `<span class="chip warning">${meta.lightDelayCount}d sem registro</span>` : ""}

                      ${meta.startedCount > 0 && !meta.done ? `<span class="chip warning">já aberta</span>` : ""}

                    </div>

                    <h4>${escapeHtml(item.task.title)}</h4>

                    <p>${escapeHtml(getTaskText(item.task))}</p>

                  </div>

                  <span class="pill">${getTaskMinutes(item.task)}m</span>

                </div>

                <div class="mini">Arquivo de apoio: ${escapeHtml(item.task.source[0])}</div>

                <div class="queue-actions">

                  <button class="btn btn-soft" data-action="complete" data-task-id="${item.task.id}">Concluí</button>

                  <button class="btn btn-ghost" data-action="start" data-task-id="${item.task.id}">${index === 0 ? "Começar" : "Abrir"}</button>

                  <button class="btn btn-ghost" data-action="skip" data-task-id="${item.task.id}">Não rolou</button>

                </div>

              </div>

            `;

          }).join("")}

        </div>

      `;

    }



    function renderSubjects(referenceDate) {

      const ordered = DATA.subjects

        .map((subject) => ({ subject, score: subjectScore(subject, referenceDate) }))

        .sort((a, b) => b.score - a.score);



      elements.subjectGrid.innerHTML = ordered.map(({ subject, score }) => {

        const nextExam = getNextExam(subject, referenceDate);

        const risk = getRiskLabel(score);

        const progress = getProgress(subject, referenceDate);

        const remaining = Math.round(getRemainingWeight(subject, referenceDate));

        const lastStudy = getDaysSinceLastStudy(subject.code, referenceDate);

        const activePhase = getCurrentOrNextPhase(subject, referenceDate);



        return `

          <article class="subject-card subject-card--${risk.tone}">

            <div class="subject-headline">

              <div>

                <p class="subject-code">${escapeHtml(subject.code)}</p>

                <h3>${escapeHtml(subject.name)}</h3>

                <p>${escapeHtml(subject.programFile)}</p>

              </div>

              <div class="subject-badges">

                <span class="chip ${risk.tone}">${risk.label}</span>

                ${subject.inferred ? `<span class="chip warning">peso inferido</span>` : ""}

              </div>

            </div>



            <div class="subject-kpi-grid">

              <div class="subject-kpi">

                <span>Próxima prova</span>

                <strong>${nextExam ? escapeHtml(nextExam.label) : "—"}</strong>

                <div class="mini">${nextExam ? formatDateLong(parseDate(nextExam.examDate)) : "sem data futura no cronograma"}</div>

              </div>

              <div class="subject-kpi">

                <span>Peso pendente</span>

                <strong>${remaining}%</strong>

                <div class="mini">${escapeHtml(subject.outsideDependency)}</div>

              </div>

              <div class="subject-kpi">

                <span>Última prática</span>

                <strong>${lastStudy >= 999 ? "nunca" : `${lastStudy} d`}</strong>

                <div class="mini">${escapeHtml(subject.phaseNowHint)}</div>

              </div>

              <div class="subject-kpi">

                <span>Fase atual</span>

                <strong>${escapeHtml(activePhase.id)}</strong>

                <div class="mini">provas: ${subject.counts.P1}/${subject.counts.P2}/${subject.counts.P3}</div>

              </div>

            </div>



            <div class="progress-block">

              <div class="progress-row">

                <span>progresso útil da janela atual</span>

                <span>${progress}%</span>

              </div>

              <div class="progress"><span style="width:${progress}%"></span></div>

            </div>



            <div class="subject-note">${escapeHtml(subject.singularity)}</div>



            <div class="mini"><strong>Tópicos CORE:</strong> ${escapeHtml(subject.coreTopics.slice(0, 4).join(" · "))}</div>

            <div class="mini"><strong>Regra de avaliação:</strong> ${escapeHtml(subject.examSchemeNote)}</div>

          </article>

        `;

      }).join("");

    }



    function renderSources() {

      elements.sourcesBlock.innerHTML = DATA.subjects.map((subject) => {

        return `

          <details class="source-card">

            <summary>

              <div>

                <h3>${escapeHtml(subject.name)}</h3>

                <p>${escapeHtml(subject.code)} · ${escapeHtml(subject.summary)}</p>

              </div>

              <div class="source-summary-right">

                <span class="mini">${subject.sources.length} arquivo${subject.sources.length > 1 ? "s" : ""}</span>

                <span class="source-summary-caret">›</span>

              </div>

            </summary>

            <div class="details-body">

              <ul class="source-list">

                ${subject.sources.map((source) => `

                  <li>

                    <div class="source-topline">

                      <strong>${escapeHtml(source.name)}</strong>

                      <div class="inline-chips">

                        <span class="chip neutral">${escapeHtml(source.kind)}</span>

                        <span class="chip accent">retorno ${escapeHtml(source.value)}</span>

                      </div>

                    </div>

                    <span class="muted">${escapeHtml(source.why)}</span>

                  </li>

                `).join("")}

              </ul>

            </div>

          </details>

        `;

      }).join("");

    }



    function renderMobileFocusbar(plan) {

      if (!plan) {

        elements.mobileFocusbar.innerHTML = "";

        elements.mobileFocusbar.setAttribute("hidden", "");

        return;

      }



      const { subject, task } = plan;

      elements.mobileFocusbar.removeAttribute("hidden");

      elements.mobileFocusbar.innerHTML = `

        <div class="mobile-focusbar__text">

          <div class="mobile-focusbar__eyebrow">agora · ${escapeHtml(subject.shortName)} · ${getTaskMinutes(task)} min</div>

          <div class="mobile-focusbar__title">${escapeHtml(task.title)}</div>

          <div class="mobile-focusbar__meta">${escapeHtml(task.source[0])}</div>

        </div>

        <button class="btn btn-primary" data-action="start" data-task-id="${task.id}">Começar</button>

      `;

    }

    function getTaskMetaFromState(sourceState, taskId) {
      return (sourceState.taskMeta && sourceState.taskMeta[taskId]) || {};
    }

    function setTaskMetaOnState(sourceState, taskId, patch) {
      sourceState.taskMeta = sourceState.taskMeta || {};
      sourceState.taskMeta[taskId] = {
        ...getTaskMetaFromState(sourceState, taskId),
        ...patch
      };
    }

    function isTaskDoneInState(sourceState, taskId) {
      return !!getTaskMetaFromState(sourceState, taskId).done;
    }

    function getDaysSinceLastStudyFromState(sourceState, subjectCode, referenceDate) {
      const logs = (sourceState.logs || [])
        .filter((log) => log.subjectCode === subjectCode)
        .map((log) => parseDate(log.date))
        .sort((a, b) => b - a);
      if (!logs.length) return 999;
      return Math.max(0, daysBetween(logs[0], referenceDate));
    }

    function getActiveTasksForSubjectFromState(sourceState, subject, referenceDate) {
      const currentPhase = getCurrentOrNextPhase(subject, referenceDate);
      const currentIndex = subject.phases.findIndex((phase) => phase.id === currentPhase.id);
      return DATA.tasks.filter((task) => {
        if (task.subjectCode !== subject.code) return false;
        const taskPhaseIndex = subject.phases.findIndex((phase) => phase.id === task.phaseId);
        if (taskPhaseIndex === -1) return false;
        const phase = subject.phases[taskPhaseIndex];
        const phaseStart = parseDate(phase.start);
        const phaseExam = parseDate(phase.examDate);
        const inWindow = referenceDate >= phaseStart && referenceDate <= phaseExam;
        const carryAfter = task.carryForward && taskPhaseIndex < currentIndex;
        const previewNext = taskPhaseIndex === currentIndex + 1 && daysBetween(referenceDate, phaseStart) <= 6;
        if (inWindow) return true;
        if (carryAfter) return true;
        if (previewNext) return true;
        if (currentIndex === subject.phases.length - 1 && taskPhaseIndex === currentIndex) return true;
        return false;
      });
    }

    function getPendingTasksForSubjectFromState(sourceState, subject, referenceDate) {
      return getActiveTasksForSubjectFromState(sourceState, subject, referenceDate)
        .filter((task) => !isTaskDoneInState(sourceState, task.id));
    }

    function subjectScoreFromState(sourceState, subject, referenceDate) {
      const pendingTasks = getPendingTasksForSubjectFromState(sourceState, subject, referenceDate);
      const currentPhase = getCurrentOrNextPhase(subject, referenceDate);
      const nextExam = getNextExam(subject, referenceDate);
      const remainingWeight = getRemainingWeight(subject, referenceDate);
      const stalenessDays = getDaysSinceLastStudyFromState(sourceState, subject.code, referenceDate);
      const carryover = pendingTasks.some((task) => {
        const meta = getTaskMetaFromState(sourceState, task.id);
        return meta.startedCount > 0 || meta.skipCount > 0 || meta.lightDelayCount > 0;
      });
      const examUrgency = nextExam ? clamp((45 - daysBetween(referenceDate, parseDate(nextExam.examDate))) / 45, 0, 1) : 0.12;
      const pendingRatio = pendingTasks.length
        ? clamp(
          pendingTasks.reduce((acc, task) => acc + (task.core ? 1.2 : 0.8), 0) /
          Math.max(1, getActiveTasksForSubjectFromState(sourceState, subject, referenceDate).length),
          0,
          1.4
        )
        : 0;
      const remainingWeightScore = clamp(remainingWeight / 100, 0, 1);
      const stalenessScore = clamp(stalenessDays / 10, 0, 1);
      const phaseBoost = currentPhase.id === "P1" ? 0.06 : currentPhase.id === "P2" ? 0.1 : 0.15;
      const extraRisk = (subject.extras || []).length ? 0.08 : 0;
      return (
        examUrgency * 0.36 +
        pendingRatio * 0.24 +
        remainingWeightScore * 0.16 +
        stalenessScore * 0.12 +
        subject.baseRisk * 0.10 +
        phaseBoost +
        extraRisk +
        (carryover ? 0.12 : 0)
      );
    }

    function taskScoreFromState(sourceState, task, subject, referenceDate) {
      const phase = getPhase(subject, task.phaseId);
      const daysToPhaseExam = daysBetween(referenceDate, parseDate(phase.examDate));
      const meta = getTaskMetaFromState(sourceState, task.id);
      const startedBoost = meta.startedCount > 0 ? 0.18 : 0;
      const skipBoost = meta.skipCount > 0 ? 0.12 : 0;
      const lightDelayBoost = clamp((meta.lightDelayCount || 0) * 0.07, 0, 0.18);
      const coreBoost = task.core ? 0.28 : 0.12;
      const recurrenceBoost = task.recurring ? 0.16 : 0.06;
      const priorityBoost = task.priorityBase / 20;
      const urgencyBoost = clamp((30 - daysToPhaseExam) / 30, 0, 1) * 0.22;
      const durationPenalty = getTaskMinutes(task) > 50 && sourceState.mode === "exausto" ? 0.18 : 0;
      return coreBoost + recurrenceBoost + priorityBoost + urgencyBoost + startedBoost + skipBoost + lightDelayBoost - durationPenalty;
    }

    function getSortedTasksForSubjectFromState(sourceState, subject, referenceDate) {
      return getPendingTasksForSubjectFromState(sourceState, subject, referenceDate)
        .sort((a, b) => taskScoreFromState(sourceState, b, subject, referenceDate) - taskScoreFromState(sourceState, a, subject, referenceDate));
    }

    function selectMainTaskFromState(sourceState, referenceDate, ignorePinned) {
      if (!ignorePinned && sourceState.pinnedTaskId) {
        const pinnedTask = getTask(sourceState.pinnedTaskId);
        if (pinnedTask && !isTaskDoneInState(sourceState, pinnedTask.id)) {
          const pinnedSubject = getSubject(pinnedTask.subjectCode);
          const isActive = getActiveTasksForSubjectFromState(sourceState, pinnedSubject, referenceDate).some((task) => task.id === pinnedTask.id);
          if (isActive) return { subject: pinnedSubject, task: pinnedTask, pinned: true };
        }
      }
      const best = DATA.subjects
        .map((subject) => ({ subject, score: subjectScoreFromState(sourceState, subject, referenceDate) }))
        .sort((a, b) => b.score - a.score)[0];
      if (!best) return null;
      const task = getSortedTasksForSubjectFromState(sourceState, best.subject, referenceDate)[0] || null;
      if (!task) return null;
      return { subject: best.subject, task, pinned: false };
    }

    function buildTodayQueueFromState(sourceState, referenceDate, ignorePinned) {
      const main = selectMainTaskFromState(sourceState, referenceDate, ignorePinned);
      if (!main) return [];
      const queue = [{ task: main.task, subject: main.subject, slot: "Agora" }];
      const pushIfValid = (task, subject, slot) => {
        if (!task) return;
        if (queue.some((item) => item.task.id === task.id)) return;
        queue.push({ task, subject, slot });
      };
      const subjectTasks = getSortedTasksForSubjectFromState(sourceState, main.subject, referenceDate)
        .filter((task) => task.id !== main.task.id);
      const nextExam = getNextExam(main.subject, referenceDate);
      const subjectGap = nextExam ? daysBetween(referenceDate, parseDate(nextExam.examDate)) : 999;
      if (sourceState.mode === "foco") {
        pushIfValid(subjectTasks[0], main.subject, "Depois");
        return queue.filter(Boolean).slice(0, 2);
      }
      if (sourceState.mode === "exausto" || sourceState.mode === "m30") {
        return queue;
      }
      if (subjectGap <= 14) {
        pushIfValid(subjectTasks[0], main.subject, "Depois");
      } else {
        const secondBest = DATA.subjects
          .filter((subject) => subject.code !== main.subject.code)
          .map((subject) => ({ subject, score: subjectScoreFromState(sourceState, subject, referenceDate) }))
          .sort((a, b) => b.score - a.score)[0];
        if (secondBest) {
          const secondTask = getSortedTasksForSubjectFromState(sourceState, secondBest.subject, referenceDate)[0];
          pushIfValid(secondTask, secondBest.subject, "Depois");
        } else {
          pushIfValid(subjectTasks[0], main.subject, "Depois");
        }
      }
      pushIfValid(subjectTasks[0], main.subject, queue.length === 1 ? "Depois" : "Reserva");
      if (queue.length < 3) {
        const fallback = DATA.subjects
          .filter((subject) => subject.code !== main.subject.code)
          .map((subject) => ({ subject, task: getSortedTasksForSubjectFromState(sourceState, subject, referenceDate)[0] }))
          .find((pair) => pair.task && !queue.some((item) => item.task.id === pair.task.id));
        if (fallback) pushIfValid(fallback.task, fallback.subject, "Reserva");
      }
      return queue.slice(0, 3);
    }

    function buildForecast(referenceDate, totalDays = 30) {
      const simulatedState = structuredClone(state);
      simulatedState.activeSession = null;
      simulatedState.pinnedTaskId = null;
      simulatedState.pinnedSubjectCode = null;
      const forecast = [];
      for (let i = 0; i < totalDays; i++) {
        const date = addDays(referenceDate, i);
        const plan = selectMainTaskFromState(simulatedState, date, true);
        const queue = buildTodayQueueFromState(simulatedState, date, true);
        forecast.push({
          date,
          plan,
          queue: queue.map((item) => ({
            slot: item.slot,
            task: item.task,
            subject: item.subject
          }))
        });
        if (plan && plan.task) {
          setTaskMetaOnState(simulatedState, plan.task.id, {
            done: true,
            completedAt: toIsoDate(date),
            lastTouched: toIsoDate(date),
            skipCount: 0,
            lightDelayCount: 0,
            lastLightDelayAt: null
          });
        }
      }
      return forecast;
    }

    function buildForecastMap(referenceDate, endDate) {

      if (endDate < referenceDate) return new Map();

      return new Map(

        buildForecast(referenceDate, daysBetween(referenceDate, endDate) + 1)

          .map((entry) => [toIsoDate(entry.date), entry])

      );

    }



    function getExamEventsOnDate(date) {

      const events = [];

      DATA.subjects.forEach((subject) => {

        subject.phases.forEach((phase) => {

          const examDate = parseDate(phase.examDate);

          if (isSameDay(examDate, date)) {

            events.push({

              subject,

              phase

            });

          }

        });

      });



      return events.sort((a, b) => a.subject.code.localeCompare(b.subject.code));

    }



    function renderCalendarPage(referenceDate) {
      if (!elements.monthCalendarGrid) return;

      const selectedMonth = getCalendarAnchorDate(referenceDate);
      const currentMonth = startOfMonth(referenceDate);
      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);
      const firstWeekday = monthStart.getDay();
      const totalDays = monthEnd.getDate();
      const forecastMap = buildForecastMap(referenceDate, monthEnd);
      const markerLabels = CALENDAR_UI.markerLabels || {};

      elements.calendarMonthTitle.textContent = `Calendário de ${formatMonthYear(selectedMonth)}`;
      elements.calendarMonthSubtitle.textContent = CALENDAR_UI.monthSubtitle || "Mostra o mês selecionado com blocos de estudo, provas oficiais e entregas.";
      elements.monthPrevBtn.disabled = monthStart <= currentMonth;
      elements.monthTodayBtn.disabled = monthStart.getTime() === currentMonth.getTime();
      if (elements.monthLegend) elements.monthLegend.hidden = !state.calendarLegendVisible;
      if (elements.calendarLegendToggleBtn) {
        elements.calendarLegendToggleBtn.textContent = state.calendarLegendVisible ? "Ocultar legenda" : "Mostrar legenda";
        elements.calendarLegendToggleBtn.setAttribute("aria-pressed", state.calendarLegendVisible ? "true" : "false");
      }

      const cells = [];
      for (let i = 0; i < firstWeekday; i++) {
        cells.push('<div class="month-cell month-cell--blank" aria-hidden="true"></div>');
      }

      for (let dayNumber = 1; dayNumber <= totalDays; dayNumber++) {
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNumber);
        const iso = toIsoDate(date);
        const forecastDay = forecastMap.get(iso);
        const exams = getExamEventsOnDate(date);
        const deadlines = getDeadlinesOnDate(date);
        const isToday = isSameDay(date, referenceDate);
        const isPast = date < referenceDate;
        const hasStudy = !!(forecastDay && forecastDay.plan);

        const classes = ['month-cell'];
        if (isToday) classes.push('month-cell--today');
        if (isPast) classes.push('month-cell--past');
        if (hasStudy) classes.push('month-cell--study');
        if (exams.length) classes.push('month-cell--exam');
        if (deadlines.length) classes.push('month-cell--deadline');

        const markers = [
          hasStudy ? `<span class="month-marker month-marker--study" title="${escapeHtml(markerLabels.study || "Estudo")}" aria-label="${escapeHtml(markerLabels.study || "Estudo")}"></span>` : '',
          exams.length ? `<span class="month-marker month-marker--exam" title="${escapeHtml(markerLabels.exam || "Prova")}" aria-label="${escapeHtml(markerLabels.exam || "Prova")}"></span>` : '',
          deadlines.length ? `<span class="month-marker month-marker--deadline" title="${escapeHtml(markerLabels.deadline || "Entrega")}" aria-label="${escapeHtml(markerLabels.deadline || "Entrega")}"></span>` : ''
        ].join('');

        const studyHtml = hasStudy ? `
          <div class="month-item month-item--study">
            <strong>${escapeHtml(forecastDay.plan.subject.shortName)}</strong>
          </div>
        ` : '';

        const examsHtml = exams.map((exam) => `
          <div class="month-item month-item--exam">
            <strong>${escapeHtml(exam.subject.shortName)}</strong>
            <span>${escapeHtml(exam.phase.label)}</span>
          </div>
        `).join('');

        const deadlinesHtml = deadlines.map((deadline) => {
          const subject = getDeadlineSubject(deadline);
          const status = getDeadlineStatus(deadline, referenceDate);
          const itemClass = deadline.deliveredAt ? 'month-item month-item--done' : 'month-item month-item--deadline';
          const metaBits = [];
          if (subject) metaBits.push(subject.shortName);
          if (deadline.dueTime) metaBits.push(formatTime(deadline.dueTime));
          metaBits.push(status.label);
          return `
            <div class="${itemClass}">
              <strong>${escapeHtml(deadline.title)}</strong>
              <span>${escapeHtml(metaBits.join(' • '))}</span>
            </div>
          `;
        }).join('');

        cells.push(`
          <article class="${classes.join(' ')}">
            <div class="month-cell__top">
              <div class="month-cell__date">
                <div class="month-cell__day">${dayNumber}</div>
                <div class="month-cell__weekday">${escapeHtml(new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date))}</div>
              </div>
              <div class="month-cell__markers">${markers}</div>
            </div>
            <div class="month-stack">
              ${studyHtml}
              ${examsHtml}
              ${deadlinesHtml}
            </div>
          </article>
        `);
      }

      elements.monthCalendarGrid.innerHTML = cells.join('');
    }

    function renderNotes() {
      const noteItems = Array.isArray(NOTES_UI.items) ? NOTES_UI.items : [];
      elements.notesBlock.innerHTML = `
        <ul class="note-list" style="margin-top:0;">
          ${noteItems.map((item) => `
            <li>
              <strong>${escapeHtml(item.title)}</strong>
              <span class="muted">${escapeHtml(item.body)}</span>
            </li>
          `).join("")}
        </ul>
      `;
    }
