(() => {
  'use strict';

  const STORAGE_KEY = 'lexicards.v2';
  const LEGACY_KEY = 'lexicards.v1';
  const APP_VERSION = '0.4.0';
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  const state = {
    cards: loadCards(),
    activePage: 'cards',
    settingsReturnPage: 'cards',
    editingId: null,
    currentTask: null,
    currentEvaluation: null,
    questionCount: 0,
    answeredCount: 0,
    recentCardIds: [],
    remediationQueue: [],
    practiceAnyway: false,
    toastTimer: null,
    modalResolver: null
  };

  const pageTitles = {
    cards: 'Карточки',
    editor: 'Новая карточка',
    study: 'Обучение',
    settings: 'Настройки'
  };

  const els = {
    pageTitle: byId('pageTitle'),
    settingsButton: byId('settingsButton'),
    pages: Array.from(document.querySelectorAll('.page')),
    navItems: Array.from(document.querySelectorAll('[data-nav]')),
    dashboard: byId('dashboard'),
    cardSearch: byId('cardSearch'),
    cardList: byId('cardList'),
    cardForm: byId('cardForm'),
    editId: byId('editId'),
    wordInput: byId('wordInput'),
    wordError: byId('wordError'),
    translationError: byId('translationError'),
    translationList: byId('translationList'),
    exampleList: byId('exampleList'),
    addTranslationButton: byId('addTranslationButton'),
    addExampleButton: byId('addExampleButton'),
    cancelEditButton: byId('cancelEditButton'),
    existingExampleSuggestions: byId('existingExampleSuggestions'),
    studyContent: byId('studyContent'),
    backupSummary: byId('backupSummary'),
    backupStatus: byId('backupStatus'),
    exportBackupButton: byId('exportBackupButton'),
    importBackupButton: byId('importBackupButton'),
    backupFileInput: byId('backupFileInput'),
    toast: byId('toast'),
    modalBackdrop: byId('modalBackdrop'),
    modalTitle: byId('modalTitle'),
    modalText: byId('modalText'),
    modalActions: byId('modalActions')
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function uid(prefix = 'id') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function defaultSrs() {
    return {
      due: Date.now(),
      intervalDays: 0,
      ease: 2.25,
      reps: 0,
      lapses: 0,
      lastGrade: null,
      lastReviewedAt: null
    };
  }

  function sanitizeSrs(value) {
    const base = defaultSrs();
    if (!value || typeof value !== 'object') return base;
    return {
      due: Number.isFinite(value.due) ? value.due : base.due,
      intervalDays: Number.isFinite(value.intervalDays) ? value.intervalDays : 0,
      ease: Number.isFinite(value.ease) ? Math.min(3, Math.max(1.3, value.ease)) : base.ease,
      reps: Number.isFinite(value.reps) ? value.reps : 0,
      lapses: Number.isFinite(value.lapses) ? value.lapses : 0,
      lastGrade: value.lastGrade || null,
      lastReviewedAt: Number.isFinite(value.lastReviewedAt) ? value.lastReviewedAt : null
    };
  }

  function migrateLegacyCard(card) {
    if (!card || !String(card.word || '').trim()) return null;
    const translations = (Array.isArray(card.translations) ? card.translations : [])
      .map(text => String(text || '').trim())
      .filter(Boolean)
      .map(text => ({ id: uid('tr'), text, srs: sanitizeSrs(card) }));
    if (!translations.length) return null;
    const examples = (Array.isArray(card.examples) ? card.examples : [])
      .map(example => {
        const translation = Number.isInteger(example.translationIndex)
          ? translations[example.translationIndex]
          : null;
        return {
          id: uid('ex'),
          text: String(example.text || '').trim(),
          translationIds: translation ? [translation.id] : [],
          linkedCardIds: []
        };
      })
      .filter(example => example.text);
    return {
      id: card.id || uid('card'),
      word: String(card.word).trim(),
      translations,
      examples,
      srs: sanitizeSrs(card),
      createdAt: Number.isFinite(card.createdAt) ? card.createdAt : Date.now(),
      updatedAt: Date.now()
    };
  }

  function sanitizeCard(card) {
    if (!card || !String(card.word || '').trim()) return null;
    const translations = (Array.isArray(card.translations) ? card.translations : [])
      .map(item => typeof item === 'string'
        ? { id: uid('tr'), text: item.trim(), srs: defaultSrs() }
        : {
          id: item.id || uid('tr'),
          text: String(item.text || '').trim(),
          srs: sanitizeSrs(item.srs)
        })
      .filter(item => item.text);
    if (!translations.length) return null;
    const validTranslationIds = new Set(translations.map(item => item.id));
    const examples = (Array.isArray(card.examples) ? card.examples : [])
      .map(example => {
        const legacyIds = example.translationId ? [example.translationId] : [];
        const rawIds = Array.isArray(example.translationIds) ? example.translationIds : legacyIds;
        return {
          id: example.id || uid('ex'),
          text: String(example.text || '').trim(),
          translationIds: Array.from(new Set(rawIds.filter(id => validTranslationIds.has(id)))),
          linkedCardIds: Array.isArray(example.linkedCardIds)
            ? Array.from(new Set(example.linkedCardIds.filter(Boolean)))
            : []
        };
      })
      .filter(example => example.text);
    return {
      id: card.id || uid('card'),
      word: String(card.word).trim(),
      translations,
      examples,
      srs: sanitizeSrs(card.srs),
      createdAt: Number.isFinite(card.createdAt) ? card.createdAt : Date.now(),
      updatedAt: Number.isFinite(card.updatedAt) ? card.updatedAt : Date.now()
    };
  }

  function normalizeCardCollection(cards) {
    const sanitized = (Array.isArray(cards) ? cards : []).map(sanitizeCard).filter(Boolean);
    const cardIds = new Set(sanitized.map(card => card.id));
    sanitized.forEach(card => card.examples.forEach(example => {
      example.linkedCardIds = example.linkedCardIds.filter(id => id !== card.id && cardIds.has(id));
    }));
    return sanitized;
  }

  function loadCards() {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(current)) return normalizeCardCollection(current);
    } catch (_) {}
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (Array.isArray(legacy)) {
        const migrated = normalizeCardCollection(legacy.map(migrateLegacyCard).filter(Boolean));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (_) {}
    return [];
  }

  function persist({ render = true } = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cards));
    if (render) renderAll();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function normalizeAnswer(value) {
    return String(value || '')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/[“”„«»]/g, '"')
      .replace(/[’`]/g, "'")
      .replace(/[^a-zа-я0-9' -]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitAnswers(value) {
    return String(value || '')
      .split(/[,;\/\n]+/)
      .map(normalizeAnswer)
      .filter(Boolean);
  }

  function englishForms(lemma) {
    const word = normalizeAnswer(lemma).replace(/[^a-z'-]/g, '');
    const forms = new Set([word]);
    if (!word) return forms;
    if (word.endsWith('e')) {
      forms.add(`${word}d`);
      forms.add(`${word.slice(0, -1)}ing`);
    } else {
      forms.add(`${word}ed`);
      forms.add(`${word}ing`);
    }
    if (/[^aeiou]y$/.test(word)) {
      forms.add(`${word.slice(0, -1)}ies`);
      forms.add(`${word.slice(0, -1)}ied`);
    } else {
      forms.add(`${word}s`);
    }
    if (/(s|x|z|ch|sh)$/.test(word)) forms.add(`${word}es`);
    if (word.length > 3 && /[aeiou][^aeiouwxy]$/.test(word)) {
      const last = word.slice(-1);
      forms.add(`${word}${last}ed`);
      forms.add(`${word}${last}ing`);
    }
    return forms;
  }

  function matchesWordForm(token, lemma) {
    const cleanToken = normalizeAnswer(token).replace(/[^a-z'-]/g, '');
    const cleanLemma = normalizeAnswer(lemma).replace(/[^a-z'-]/g, '');
    if (!cleanToken || !cleanLemma) return false;
    if (englishForms(cleanLemma).has(cleanToken)) return true;
    const root = cleanLemma.endsWith('e') ? cleanLemma.slice(0, -1) : cleanLemma;
    if (root.length >= 5 && cleanToken.startsWith(root)) {
      const suffix = cleanToken.slice(root.length);
      return ['s', 'es', 'd', 'ed', 'ing', 'ation', 'ations'].includes(suffix);
    }
    return false;
  }

  function sentenceContainsWord(sentence, word) {
    const tokens = String(sentence || '').match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];
    return tokens.some(token => matchesWordForm(token, word));
  }

  function formatContext(sentence, word, mode = 'highlight') {
    const text = String(sentence || '');
    let cursor = 0;
    let found = false;
    let html = '';
    const regex = /[A-Za-z]+(?:['-][A-Za-z]+)*/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      html += escapeHtml(text.slice(cursor, match.index));
      if (matchesWordForm(match[0], word)) {
        found = true;
        html += mode === 'mask'
          ? '<mark>___</mark>'
          : `<mark>${escapeHtml(match[0])}</mark>`;
      } else {
        html += escapeHtml(match[0]);
      }
      cursor = match.index + match[0].length;
    }
    html += escapeHtml(text.slice(cursor));
    if (mode === 'mask' && !found) html += ' <mark>___</mark>';
    return html;
  }

  function getCard(cardId) {
    return state.cards.find(card => card.id === cardId) || null;
  }

  function getTranslation(card, translationId) {
    return card && card.translations.find(item => item.id === translationId) || null;
  }

  function getExamplesForCard(card) {
    const all = [];
    const seen = new Set();
    function add(example, ownerCard) {
      const key = normalizeAnswer(example.text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      all.push({ ...example, ownerCardId: ownerCard.id });
    }
    card.examples.forEach(example => add(example, card));
    state.cards.forEach(owner => {
      if (owner.id === card.id) return;
      owner.examples.forEach(example => {
        if (example.linkedCardIds.includes(card.id)) add(example, owner);
      });
    });
    return all;
  }

  function directExamplesForTranslation(card, translationId) {
    return getExamplesForCard(card).filter(example =>
      example.ownerCardId === card.id && example.translationIds.includes(translationId)
    );
  }

  function contextExamplesForTranslation(card, translationId) {
    const direct = directExamplesForTranslation(card, translationId);
    if (direct.length) return direct;
    if (card.translations.length === 1) return getExamplesForCard(card);
    return [];
  }

  function hasUnambiguousContext(card, translationId) {
    return contextExamplesForTranslation(card, translationId).length > 0;
  }

  function showPage(page, options = {}) {
    state.activePage = page;
    els.pages.forEach(node => node.classList.toggle('active', node.dataset.page === page));
    els.navItems.forEach(node => node.classList.toggle('active', node.dataset.nav === page));
    els.settingsButton.classList.toggle('active', page === 'settings');
    els.pageTitle.textContent = page === 'editor' && state.editingId
      ? 'Редактирование'
      : pageTitles[page];
    if (page === 'editor' && !options.keepEditor && !state.editingId) resetEditor();
    if (page === 'study' && !options.skipStudyStart) startOrResumeStudy();
    if (page === 'cards') renderCards();
    if (page === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  function openSettings() {
    if (state.activePage === 'settings') {
      const target = state.settingsReturnPage || 'cards';
      showPage(target, {
        keepEditor: target === 'editor',
        skipStudyStart: target === 'study'
      });
      return;
    }
    state.settingsReturnPage = state.activePage;
    showPage('settings');
  }

  function renderAll() {
    renderDashboard();
    renderCards();
    renderSettings();
    if (state.activePage === 'study' && !state.currentTask) renderStudyHome();
  }

  function countDueTargets() {
    const now = Date.now();
    let count = 0;
    state.cards.forEach(card => {
      if (card.srs.due <= now) count += 1;
      card.translations.forEach(item => {
        if (item.srs.due <= now) count += 1;
      });
    });
    return count;
  }

  function renderDashboard() {
    const due = countDueTargets();
    const meanings = state.cards.reduce((sum, card) => sum + card.translations.length, 0);
    els.dashboard.innerHTML = `
      <div class="metric metric-primary"><span class="metric-value">${due}</span><span class="metric-label">заданий сейчас</span></div>
      <div class="metric"><span class="metric-value">${state.cards.length}</span><span class="metric-label">слов</span></div>
      <div class="metric"><span class="metric-value">${meanings}</span><span class="metric-label">значений</span></div>`;
  }

  function renderSettings() {
    if (!els.backupSummary) return;
    const examples = state.cards.reduce((sum, card) => sum + card.examples.length, 0);
    els.backupSummary.innerHTML = `
      <div class="backup-summary-item"><strong>${state.cards.length}</strong><span>карточек</span></div>
      <div class="backup-summary-item"><strong>${examples}</strong><span>примеров</span></div>`;
  }

  function renderCards() {
    const query = normalizeAnswer(els.cardSearch.value);
    const cards = state.cards
      .filter(card => !query || normalizeAnswer([
        card.word,
        ...card.translations.map(item => item.text)
      ].join(' ')).includes(query))
      .sort((a, b) => a.word.localeCompare(b.word, 'en'));
    if (!cards.length) {
      const isSearch = Boolean(query);
      els.cardList.innerHTML = `<div class="empty-state"><div class="empty-icon">${isSearch ? '⌕' : '＋'}</div><h2>${isSearch ? 'Ничего не найдено' : 'Словарь пока пуст'}</h2><p>${isSearch ? 'Попробуйте другое слово или перевод.' : 'Создайте первую карточку с несколькими значениями и примерами.'}</p>${isSearch ? '' : '<button class="primary-button" type="button" data-action="new-card">Создать карточку</button>'}</div>`;
      return;
    }
    els.cardList.innerHTML = cards.map(card => {
      const examples = getExamplesForCard(card).slice(0, 2);
      const nextDue = Math.min(card.srs.due, ...card.translations.map(item => item.srs.due));
      return `<article class="word-card">
        <div class="word-card-top">
          <div><h2 class="word-title">${escapeHtml(card.word)}</h2><div class="word-meta">${formatDue(nextDue)} · ${card.translations.length} ${plural(card.translations.length, 'значение', 'значения', 'значений')}</div></div>
          <button class="more-button" type="button" data-action="edit-card" data-card-id="${escapeHtml(card.id)}">✎</button>
        </div>
        <div class="translation-chips">${card.translations.map(item => `<button class="chip translation-chip-button" type="button" data-action="show-translation-links" data-translation-text="${escapeHtml(item.text)}">${escapeHtml(item.text)}</button>`).join('')}</div>
        ${examples.map(example => `<div class="example-preview">${formatContext(example.text, card.word)}</div>`).join('')}
        <div class="card-actions"><button class="secondary-button" type="button" data-action="study-card" data-card-id="${escapeHtml(card.id)}">Повторить</button><button class="danger-button" type="button" data-action="delete-card" data-card-id="${escapeHtml(card.id)}">Удалить</button></div>
      </article>`;
    }).join('');
  }

  function plural(value, one, few, many) {
    const n = Math.abs(value) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function formatDue(timestamp) {
    const diff = timestamp - Date.now();
    if (diff <= 0) return 'готово к повторению';
    if (diff < HOUR) return `через ${Math.max(1, Math.ceil(diff / MINUTE))} мин`;
    if (diff < DAY) return `через ${Math.ceil(diff / HOUR)} ч`;
    return `через ${Math.ceil(diff / DAY)} дн`;
  }

  function createTranslationEditor(translation = null) {
    const item = translation || { id: uid('tr'), text: '', srs: defaultSrs() };
    const node = document.createElement('div');
    node.className = 'translation-editor';
    node.dataset.translationId = item.id;
    node.dataset.srs = JSON.stringify(sanitizeSrs(item.srs));
    node.innerHTML = `<div class="editor-row"><input class="text-input translation-input" type="text" autocomplete="off" placeholder="вариант перевода" value="${escapeHtml(item.text)}"><button class="remove-row-button" type="button" data-action="remove-translation">×</button></div>`;
    els.translationList.appendChild(node);
    refreshExampleTranslationOptions();
    return node;
  }

  function createExampleEditor(example = null) {
    const item = example || {
      id: uid('ex'),
      text: '',
      translationIds: [],
      linkedCardIds: []
    };
    const node = document.createElement('div');
    node.className = 'example-editor';
    node.dataset.exampleId = item.id;
    node.dataset.translationIds = JSON.stringify(item.translationIds || []);
    node.dataset.linkedCardIds = JSON.stringify(item.linkedCardIds || []);
    node.innerHTML = `
      <textarea class="text-area example-input" placeholder="His hands never hesitated.">${escapeHtml(item.text)}</textarea>
      <div class="example-heading-row"><span class="example-link-title">Значения в этом контексте</span><button class="remove-row-button" type="button" data-action="remove-example">×</button></div>
      <div class="example-meaning-links"></div>
      <div class="meaning-link-help">Отметьте все варианты перевода, которые подходят к предложению. Если ничего не отмечено, пример не будет использоваться для проверки отдельного значения.</div>
      <div class="link-hint">Связанные слова появятся здесь после ввода предложения.</div>
      <div class="detected-links"></div>`;
    els.exampleList.appendChild(node);
    refreshExampleTranslationOptions();
    renderDetectedLinks(node);
    return node;
  }

  function getTranslationDrafts() {
    return Array.from(els.translationList.querySelectorAll('.translation-editor')).map(node => ({
      id: node.dataset.translationId,
      text: node.querySelector('.translation-input').value.trim(),
      srs: sanitizeSrs(JSON.parse(node.dataset.srs || '{}'))
    }));
  }

  function refreshExampleTranslationOptions() {
    const translations = getTranslationDrafts();
    els.exampleList.querySelectorAll('.example-editor').forEach(node => {
      const selected = new Set(JSON.parse(node.dataset.translationIds || '[]'));
      node.querySelectorAll('.example-meaning-links input:checked').forEach(input => selected.add(input.value));
      const validIds = new Set(translations.map(item => item.id));
      const filteredSelected = Array.from(selected).filter(id => validIds.has(id));
      const container = node.querySelector('.example-meaning-links');
      container.innerHTML = translations.map((item, index) => `
        <label><input type="checkbox" value="${escapeHtml(item.id)}" ${filteredSelected.includes(item.id) ? 'checked' : ''}><span>${escapeHtml(item.text || `Перевод ${index + 1}`)}</span></label>`).join('');
      node.dataset.translationIds = JSON.stringify(filteredSelected);
    });
  }

  function renderDetectedLinks(exampleNode) {
    const text = exampleNode.querySelector('.example-input').value.trim();
    const currentId = state.editingId;
    const selected = new Set(JSON.parse(exampleNode.dataset.linkedCardIds || '[]'));
    exampleNode.querySelectorAll('.detected-links input:checked').forEach(input => selected.add(input.value));
    const matches = text
      ? state.cards.filter(card => card.id !== currentId && sentenceContainsWord(text, card.word))
      : [];
    const container = exampleNode.querySelector('.detected-links');
    const hint = exampleNode.querySelector('.link-hint');
    if (!matches.length) {
      container.innerHTML = '';
      hint.textContent = text
        ? 'Других слов из словаря в предложении не найдено.'
        : 'Приложение предложит связать пример с другими найденными словами.';
      return;
    }
    hint.textContent = 'Найдены слова из словаря. Отметьте нужные:';
    container.innerHTML = matches.map(card => `<label><input type="checkbox" value="${escapeHtml(card.id)}" ${selected.has(card.id) ? 'checked' : ''}><span>${escapeHtml(card.word)}</span></label>`).join('');
  }

  function renderExistingExampleSuggestions() {
    const word = els.wordInput.value.trim();
    const editingId = state.editingId;
    if (word.length < 2) {
      els.existingExampleSuggestions.classList.add('hidden');
      els.existingExampleSuggestions.innerHTML = '';
      return;
    }
    const currentTexts = new Set(Array.from(els.exampleList.querySelectorAll('.example-input')).map(input => normalizeAnswer(input.value)));
    const suggestions = [];
    const seen = new Set();
    state.cards.forEach(card => {
      if (card.id === editingId) return;
      card.examples.forEach(example => {
        const key = normalizeAnswer(example.text);
        if (!seen.has(key) && !currentTexts.has(key) && sentenceContainsWord(example.text, word)) {
          seen.add(key);
          suggestions.push({ cardId: card.id, cardWord: card.word, example });
        }
      });
    });
    if (!suggestions.length) {
      els.existingExampleSuggestions.classList.add('hidden');
      els.existingExampleSuggestions.innerHTML = '';
      return;
    }
    const visible = suggestions.slice(0, 4);
    els.existingExampleSuggestions.classList.remove('hidden');
    els.existingExampleSuggestions.innerHTML = `<div class="suggestions-title">Это слово уже встречается в примерах</div>${visible.map((item, index) => `<div class="suggestion-item"><span>${escapeHtml(item.example.text)} <small>(${escapeHtml(item.cardWord)})</small></span><button class="compact-button" type="button" data-action="use-example" data-suggestion-index="${index}">Добавить</button></div>`).join('')}`;
    els.existingExampleSuggestions.dataset.suggestions = JSON.stringify(visible);
  }

  function resetEditor() {
    state.editingId = null;
    els.editId.value = '';
    els.wordInput.value = '';
    els.translationList.innerHTML = '';
    els.exampleList.innerHTML = '';
    hideEditorErrors();
    createTranslationEditor();
    createExampleEditor();
    renderExistingExampleSuggestions();
    els.pageTitle.textContent = pageTitles.editor;
  }

  function fillEditor(card) {
    state.editingId = card.id;
    els.editId.value = card.id;
    els.wordInput.value = card.word;
    els.translationList.innerHTML = '';
    els.exampleList.innerHTML = '';
    card.translations.forEach(createTranslationEditor);
    card.examples.forEach(createExampleEditor);
    if (!card.examples.length) createExampleEditor();
    hideEditorErrors();
    renderExistingExampleSuggestions();
    showPage('editor', { keepEditor: true });
  }

  function hideEditorErrors() {
    els.wordError.classList.add('hidden');
    els.translationError.classList.add('hidden');
  }

  function validateEditor() {
    hideEditorErrors();
    let valid = true;
    if (!els.wordInput.value.trim()) {
      els.wordError.textContent = 'Введите английское слово.';
      els.wordError.classList.remove('hidden');
      valid = false;
    }
    if (!getTranslationDrafts().some(item => item.text)) {
      els.translationError.textContent = 'Добавьте хотя бы один вариант перевода.';
      els.translationError.classList.remove('hidden');
      valid = false;
    }
    return valid;
  }

  function collectExampleDrafts(validTranslationIds) {
    return Array.from(els.exampleList.querySelectorAll('.example-editor'))
      .map(node => ({
        id: node.dataset.exampleId || uid('ex'),
        text: node.querySelector('.example-input').value.trim(),
        translationIds: Array.from(new Set(
          Array.from(node.querySelectorAll('.example-meaning-links input:checked'))
            .map(input => input.value)
            .filter(id => validTranslationIds.has(id))
        )),
        linkedCardIds: Array.from(new Set(
          Array.from(node.querySelectorAll('.detected-links input:checked')).map(input => input.value)
        ))
      }))
      .filter(item => item.text);
  }

  function saveEditor(event) {
    event.preventDefault();
    if (!validateEditor()) return;
    const oldCard = state.editingId ? getCard(state.editingId) : null;
    const translations = getTranslationDrafts().filter(item => item.text);
    const validTranslationIds = new Set(translations.map(item => item.id));
    const card = {
      id: oldCard ? oldCard.id : uid('card'),
      word: els.wordInput.value.trim(),
      translations,
      examples: collectExampleDrafts(validTranslationIds),
      srs: oldCard ? sanitizeSrs(oldCard.srs) : defaultSrs(),
      createdAt: oldCard ? oldCard.createdAt : Date.now(),
      updatedAt: Date.now()
    };
    state.cards = state.cards.filter(item => item.id !== card.id);
    state.cards.push(card);
    persist();
    resetEditor();
    showPage('cards');
    showToast(oldCard ? 'Карточка обновлена' : 'Карточка создана');
  }

  function deleteCard(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    openModal({
      title: `Удалить «${card.word}»?`,
      text: 'Карточка, примеры и история повторений будут удалены с этого телефона.',
      actions: [
        { label: 'Отмена', style: 'secondary-button', value: false },
        { label: 'Удалить', style: 'danger-button', value: true }
      ]
    }).then(confirmed => {
      if (!confirmed) return;
      state.cards = state.cards.filter(item => item.id !== cardId);
      state.cards.forEach(owner => owner.examples.forEach(example => {
        example.linkedCardIds = example.linkedCardIds.filter(id => id !== cardId);
      }));
      state.remediationQueue = state.remediationQueue.filter(item => item.cardId !== cardId);
      if (state.currentTask && state.currentTask.cardId === cardId) {
        state.currentTask = null;
        state.currentEvaluation = null;
      }
      persist();
      showToast('Карточка удалена');
    });
  }

  function openModal({ title, text = '', html = '', actions }) {
    if (state.modalResolver) state.modalResolver(null);
    els.modalTitle.textContent = title;
    els.modalText.classList.toggle('modal-rich', Boolean(html));
    if (html) els.modalText.innerHTML = html;
    else els.modalText.textContent = text;
    els.modalActions.innerHTML = actions.map((action, index) => `<button type="button" class="${escapeHtml(action.style || 'secondary-button')}" data-modal-index="${index}">${escapeHtml(action.label)}</button>`).join('');
    els.modalBackdrop.classList.remove('hidden');
    return new Promise(resolve => {
      state.modalResolver = value => {
        resolve(value);
        state.modalResolver = null;
        els.modalBackdrop.classList.add('hidden');
        els.modalText.classList.remove('modal-rich');
        els.modalText.innerHTML = '';
      };
      els.modalActions.querySelectorAll('[data-modal-index]').forEach(button => {
        button.addEventListener('click', () => {
          if (state.modalResolver) state.modalResolver(actions[Number(button.dataset.modalIndex)].value);
        });
      });
    });
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    state.toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function showRussianTranslationLinks(translationText) {
    const normalized = normalizeAnswer(translationText);
    const grouped = [];
    state.cards.forEach(card => {
      const matching = card.translations.filter(item => normalizeAnswer(item.text) === normalized);
      if (!matching.length) return;
      const seenExamples = new Set();
      const examples = [];
      matching.forEach(item => contextExamplesForTranslation(card, item.id).forEach(example => {
        const key = normalizeAnswer(example.text);
        if (!seenExamples.has(key)) {
          seenExamples.add(key);
          examples.push(example);
        }
      }));
      grouped.push({ card, examples });
    });
    grouped.sort((a, b) => a.card.word.localeCompare(b.card.word, 'en'));
    const html = `<div class="relation-intro">Английские варианты для этого русского значения: ${grouped.length}.</div><div class="translation-relations">${grouped.map(item => `<div class="relation-card"><div class="relation-word">${escapeHtml(item.card.word)}</div><div class="relation-meta">${escapeHtml(translationText)}</div>${item.examples.length ? item.examples.map(example => `<div class="relation-example">${formatContext(example.text, item.card.word)}</div>`).join('') : '<div class="relation-empty">К этому значению пока не привязаны примеры.</div>'}</div>`).join('')}</div>`;
    openModal({
      title: `«${translationText}»`,
      html,
      actions: [{ label: 'Закрыть', style: 'primary-button', value: true }]
    });
  }

  function createBackupPayload() {
    return {
      format: 'lexicards-backup',
      schemaVersion: 2,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      cards: state.cards
    };
  }

  function backupFileName() {
    const date = new Date().toISOString().slice(0, 10);
    return `lexicards-backup-${date}.json`;
  }

  function setBackupStatus(message) {
    if (els.backupStatus) els.backupStatus.textContent = message || '';
  }

  function exportBackup() {
    const json = JSON.stringify(createBackupPayload(), null, 2);
    setBackupStatus('Выберите папку и имя файла.');
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.exportBackup === 'function') {
        window.AndroidBridge.exportBackup(json, backupFileName());
        return;
      }
    } catch (_) {}
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupFileName();
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupStatus('Резервная копия выгружена.');
  }

  function requestImportBackup() {
    setBackupStatus('Выберите JSON-файл резервной копии.');
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.importBackup === 'function') {
        window.AndroidBridge.importBackup();
        return;
      }
    } catch (_) {}
    els.backupFileInput.value = '';
    els.backupFileInput.click();
  }

  function receiveBackup(raw) {
    let payload;
    let importedCards;
    try {
      payload = JSON.parse(raw);
      const source = Array.isArray(payload) ? payload : payload.cards;
      if (!Array.isArray(source)) throw new Error('В файле нет массива карточек');
      importedCards = normalizeCardCollection(source);
      if (source.length && !importedCards.length) throw new Error('Карточки имеют неподдерживаемый формат');
    } catch (error) {
      setBackupStatus('Не удалось прочитать резервную копию.');
      showToast('Некорректный файл резервной копии');
      return;
    }
    openModal({
      title: `Импортировать ${importedCards.length} ${plural(importedCards.length, 'карточку', 'карточки', 'карточек')}?`,
      text: `Текущие ${state.cards.length} ${plural(state.cards.length, 'карточка', 'карточки', 'карточек')} будут заменены данными из файла.`,
      actions: [
        { label: 'Отмена', style: 'secondary-button', value: false },
        { label: 'Импортировать', style: 'primary-button', value: true }
      ]
    }).then(confirmed => {
      if (!confirmed) {
        setBackupStatus('Импорт отменён.');
        return;
      }
      state.cards = importedCards;
      state.currentTask = null;
      state.currentEvaluation = null;
      state.remediationQueue = [];
      state.recentCardIds = [];
      state.answeredCount = 0;
      persist();
      setBackupStatus(`Импортировано: ${importedCards.length} ${plural(importedCards.length, 'карточка', 'карточки', 'карточек')}.`);
      showPage('cards');
      showToast('Резервная копия восстановлена');
    });
  }

  function buildTasks({ includeFuture = false, onlyCardId = null } = {}) {
    const now = Date.now();
    const tasks = [];
    state.cards.forEach(card => {
      if (onlyCardId && card.id !== onlyCardId) return;
      if (includeFuture || card.srs.due <= now) {
        tasks.push({
          id: `all:${card.id}`,
          cardId: card.id,
          type: 'all',
          targetId: null,
          due: card.srs.due,
          priority: card.srs.lapses * 2 + (card.srs.reps === 0 ? 4 : 0)
        });
      }
      card.translations.forEach(translation => {
        if (!(includeFuture || translation.srs.due <= now)) return;
        const hasContext = hasUnambiguousContext(card, translation.id);
        const alternate = (translation.srs.reps + translation.srs.lapses) % 2 === 0;
        const type = hasContext && alternate ? 'context' : 'reverse';
        tasks.push({
          id: `${type}:${card.id}:${translation.id}`,
          cardId: card.id,
          type,
          targetId: translation.id,
          due: translation.srs.due,
          priority: translation.srs.lapses * 3 + (translation.srs.reps === 0 ? 5 : 0)
        });
      });
    });
    return tasks;
  }

  function chooseTask(options = {}) {
    const remediation = state.remediationQueue
      .filter(item => item.availableAfter <= state.questionCount)
      .filter(item => !options.onlyCardId || item.cardId === options.onlyCardId);
    let tasks = remediation.length
      ? remediation
      : buildTasks({
        includeFuture: state.practiceAnyway || options.force,
        onlyCardId: options.onlyCardId
      });
    if (!tasks.length) return null;
    const recent = new Set(state.recentCardIds.slice(-2));
    const notRecent = tasks.filter(task => !recent.has(task.cardId));
    if (notRecent.length) tasks = notRecent;
    else if (tasks.length > 1) {
      const lastCardId = state.recentCardIds[state.recentCardIds.length - 1];
      const notLast = tasks.filter(task => task.cardId !== lastCardId);
      if (notLast.length) tasks = notLast;
    }
    tasks.sort((a, b) => ((b.priority || 0) * 1000000 - b.due) - ((a.priority || 0) * 1000000 - a.due));
    const top = tasks.slice(0, Math.min(4, tasks.length));
    const selected = top[Math.floor(Math.random() * top.length)];
    const index = state.remediationQueue.findIndex(item => item.queueId && item.queueId === selected.queueId);
    if (index >= 0) state.remediationQueue.splice(index, 1);
    return selected;
  }

  function startOrResumeStudy() {
    if (state.currentTask && !state.currentEvaluation) return renderStudyQuestion();
    if (state.currentTask && state.currentEvaluation) return renderStudyResult();
    nextTask();
  }

  function nextTask(options = {}) {
    state.currentEvaluation = null;
    const task = chooseTask(options);
    if (!task) {
      state.currentTask = null;
      renderStudyHome();
      return;
    }
    state.currentTask = materializeTask(task);
    if (!state.currentTask) {
      nextTask(options);
      return;
    }
    state.questionCount += 1;
    state.recentCardIds.push(task.cardId);
    state.recentCardIds = state.recentCardIds.slice(-5);
    renderStudyQuestion();
  }

  function materializeTask(task) {
    const card = getCard(task.cardId);
    if (!card) return null;
    const translation = task.targetId ? getTranslation(card, task.targetId) : null;
    let type = task.type;
    let examples = [];
    if (type === 'context') {
      examples = translation ? contextExamplesForTranslation(card, translation.id) : [];
      if (!examples.length) type = 'reverse';
    }
    if (type === 'reverse') {
      examples = translation ? contextExamplesForTranslation(card, translation.id) : [];
    }
    if (type === 'all') examples = getExamplesForCard(card);
    const example = examples.length
      ? examples[Math.floor(Math.random() * examples.length)]
      : null;
    return { ...task, type, card, translation, example };
  }

  function renderStudyHome() {
    if (!state.cards.length) {
      els.studyContent.innerHTML = `<div class="empty-state"><div class="empty-icon">◆</div><h2>Нечего учить</h2><p>Сначала создайте хотя бы одну карточку.</p><button class="primary-button" type="button" data-study-action="new-card">Создать карточку</button></div>`;
      return;
    }
    const nextDue = Math.min(...state.cards.flatMap(card => [
      card.srs.due,
      ...card.translations.map(item => item.srs.due)
    ]));
    els.studyContent.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div><h2>${state.answeredCount ? 'На сейчас всё' : 'Повторений пока нет'}</h2><p>Следующее задание ${formatDue(nextDue)}. Можно потренироваться без изменения расписания.</p><button class="primary-button" type="button" data-study-action="practice-anyway">Практиковаться сейчас</button></div>`;
  }

  function studyHeaderHtml() {
    const due = countDueTargets();
    const progress = state.answeredCount + due > 0
      ? Math.round((state.answeredCount / (state.answeredCount + due)) * 100)
      : 100;
    return `<div class="study-header"><span>Ответов: ${state.answeredCount}</span><span>Осталось: ${due}</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(4, progress)}%"></div></div>`;
  }

  function renderStudyQuestion() {
    const task = state.currentTask;
    if (!task || !task.card) {
      state.currentTask = null;
      renderStudyHome();
      return;
    }
    let kind;
    let prompt;
    let main;
    let context = '';
    let placeholder;
    let help;
    if (task.type === 'all') {
      kind = 'Все значения';
      prompt = 'Вспомните как можно больше переводов';
      main = `<div class="study-word">${escapeHtml(task.card.word)}</div>`;
      context = getExamplesForCard(task.card)
        .slice(0, 3)
        .map(example => `<div class="context-box">${formatContext(example.text, task.card.word)}</div>`)
        .join('');
      placeholder = 'Переводы через запятую';
      help = 'Каждое значение оценивается отдельно.';
    } else if (task.type === 'context') {
      kind = 'Значение в контексте';
      prompt = 'Как переводится выделенное слово?';
      main = `<div class="study-word">${escapeHtml(task.card.word)}</div>`;
      context = `<div class="context-box">${formatContext(task.example.text, task.card.word)}</div>`;
      placeholder = 'Подходящий перевод';
      help = 'Укажите одно из значений, привязанных к этому предложению.';
    } else {
      kind = 'Обратный перевод';
      prompt = 'Напишите английское слово';
      main = `<div class="study-translation">${escapeHtml(task.translation.text)}</div>`;
      context = task.example
        ? `<div class="context-box">${formatContext(task.example.text, task.card.word, 'mask')}</div>`
        : '';
      placeholder = 'English word';
      help = 'Контекст отображается только когда он привязан к этому значению.';
    }
    els.studyContent.innerHTML = `${studyHeaderHtml()}<div class="study-card"><span class="study-kind">${kind}</span><div class="study-prompt">${prompt}</div>${main}${context}<div class="study-answer"><input id="studyAnswer" class="text-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${escapeHtml(placeholder)}"><button id="checkAnswerButton" class="primary-button" type="button">Проверить ответ</button><p class="answer-help">${help}</p></div></div>`;
    const input = byId('studyAnswer');
    input.focus();
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') evaluateCurrentAnswer();
    });
  }

  function evaluateCurrentAnswer() {
    if (!state.currentTask || state.currentEvaluation) return;
    const input = byId('studyAnswer');
    const raw = input ? input.value.trim() : '';
    if (!raw) return showToast('Сначала введите ответ');
    const task = state.currentTask;
    let evaluation;
    if (task.type === 'all') {
      const answers = splitAnswers(raw);
      const rememberedIds = [];
      const missedIds = [];
      const expectedNormalized = new Map(task.card.translations.map(item => [
        normalizeAnswer(item.text),
        item.id
      ]));
      task.card.translations.forEach(item => {
        if (answers.includes(normalizeAnswer(item.text))) rememberedIds.push(item.id);
        else missedIds.push(item.id);
      });
      const unmatchedAnswers = answers.filter(answer => !expectedNormalized.has(answer));
      const score = task.card.translations.length
        ? rememberedIds.length / task.card.translations.length
        : 0;
      const completelyCorrect = missedIds.length === 0 && unmatchedAnswers.length === 0;
      evaluation = {
        raw,
        answers,
        score,
        rememberedIds,
        missedIds,
        unmatchedAnswers,
        correct: completelyCorrect,
        suggestedGrade: completelyCorrect ? 'good' : score >= .5 ? 'hard' : 'again'
      };
    } else if (task.type === 'context') {
      const expectedTranslations = task.example.translationIds
        .map(id => getTranslation(task.card, id))
        .filter(Boolean);
      const correct = expectedTranslations.some(item =>
        normalizeAnswer(raw) === normalizeAnswer(item.text)
      );
      evaluation = {
        raw,
        score: correct ? 1 : 0,
        correct,
        expected: expectedTranslations.map(item => item.text).join(' / '),
        suggestedGrade: correct ? 'good' : 'again'
      };
    } else {
      const expected = task.card.word;
      const correct = normalizeAnswer(raw) === normalizeAnswer(expected);
      evaluation = {
        raw,
        score: correct ? 1 : 0,
        correct,
        expected,
        suggestedGrade: correct ? 'good' : 'again'
      };
    }
    state.currentEvaluation = evaluation;
    renderStudyResult();
  }

  function submittedAnswerHtml(raw) {
    return `<div class="submitted-answer"><span>Ваш ответ</span><strong>${escapeHtml(raw)}</strong></div>`;
  }

  function renderStudyResult() {
    const task = state.currentTask;
    const evaluation = state.currentEvaluation;
    if (!task || !evaluation) return;
    let resultClass;
    let title;
    let summary;
    let details = '';
    if (task.type === 'all') {
      const total = task.card.translations.length;
      const remembered = evaluation.rememberedIds.length;
      const percentage = Math.round(evaluation.score * 100);
      resultClass = evaluation.correct ? 'success' : percentage >= 50 ? 'warning' : 'danger';
      title = `${percentage}% переводов`;
      summary = `Вы вспомнили ${remembered} из ${total}. Расписание каждого значения обновится отдельно.`;
      details = `<div class="answer-chip-list">${task.card.translations.map(item => `<span class="chip ${evaluation.rememberedIds.includes(item.id) ? 'chip-success' : 'chip-danger'}">${evaluation.rememberedIds.includes(item.id) ? '✓' : '×'} ${escapeHtml(item.text)}</span>`).join('')}</div>`;
      if (!evaluation.correct) {
        details += submittedAnswerHtml(evaluation.raw);
        if (evaluation.unmatchedAnswers.length) {
          details += `<div class="unmatched-answer">Не распознано: ${evaluation.unmatchedAnswers.map(escapeHtml).join(', ')}</div>`;
        }
      }
    } else {
      resultClass = evaluation.correct ? 'success' : 'danger';
      title = evaluation.correct ? 'Правильно' : 'Неверный ответ';
      summary = evaluation.correct
        ? 'Ответ совпал с ожидаемым значением.'
        : 'Сравните свой ответ с правильным. При опечатке можно изменить оценку вручную.';
      if (!evaluation.correct) details += submittedAnswerHtml(evaluation.raw);
      details += `<div class="expected-answer">Правильный ответ: <strong>${escapeHtml(evaluation.expected)}</strong></div>`;
    }
    els.studyContent.innerHTML = `${studyHeaderHtml()}<div class="study-card"><span class="study-kind">Результат</span><div class="result-panel"><div class="result-title ${resultClass}">${title}</div><div class="result-summary">${summary}</div>${details}<div class="next-info">Автооценка: «${gradeLabel(evaluation.suggestedGrade)}». Следующее повторение: ${estimateNext(task, evaluation.suggestedGrade)}.</div></div><div class="result-actions"><button class="primary-button" type="button" data-study-action="accept-grade">Засчитать и продолжить</button><button class="secondary-button" type="button" data-study-action="toggle-override">Изменить оценку</button><div id="overrideActions" class="override-actions hidden"><button class="grade-button" type="button" data-study-grade="again">Не помню</button><button class="grade-button" type="button" data-study-grade="hard">Частично</button><button class="grade-button" type="button" data-study-grade="good">Помню</button></div></div></div>`;
  }

  function gradeLabel(grade) {
    return grade === 'good' ? 'помню' : grade === 'hard' ? 'частично' : 'не помню';
  }

  function estimateNext(task, grade) {
    const srs = task.type === 'all' ? task.card.srs : task.translation.srs;
    return formatDue(applyGradeToCopy(srs, grade, Date.now()).due);
  }

  function applyGradeToCopy(srsValue, grade, now) {
    const srs = sanitizeSrs(srsValue);
    srs.reps += 1;
    srs.lastGrade = grade;
    srs.lastReviewedAt = now;
    if (grade === 'again') {
      srs.lapses += 1;
      srs.ease = Math.max(1.3, srs.ease - .18);
      const minutes = 8 + Math.floor(Math.random() * 13);
      srs.intervalDays = minutes / 1440;
      srs.due = now + minutes * MINUTE;
    } else if (grade === 'hard') {
      srs.ease = Math.max(1.3, srs.ease - .07);
      srs.intervalDays = srs.intervalDays < 1
        ? .33
        : Math.min(120, Math.max(1, srs.intervalDays * 1.45));
      srs.due = now + srs.intervalDays * DAY;
    } else {
      srs.ease = Math.min(3, srs.ease + .04);
      srs.intervalDays = srs.intervalDays < 1
        ? 1
        : Math.min(365, Math.max(2, srs.intervalDays * srs.ease));
      srs.due = now + srs.intervalDays * DAY;
    }
    return srs;
  }

  function scheduleRemediation(cardId, translationId, preferredType) {
    if (state.remediationQueue.some(item =>
      item.cardId === cardId && item.targetId === translationId
    )) return;
    const card = getCard(cardId);
    const safeType = preferredType === 'context' && card && hasUnambiguousContext(card, translationId)
      ? 'context'
      : 'reverse';
    state.remediationQueue.push({
      queueId: uid('queue'),
      id: `${safeType}:${cardId}:${translationId}`,
      cardId,
      type: safeType,
      targetId: translationId,
      due: Date.now(),
      priority: 20,
      availableAfter: state.questionCount + 2
    });
  }

  function commitGrade(overrideGrade = null) {
    const task = state.currentTask;
    const evaluation = state.currentEvaluation;
    if (!task || !evaluation) return;
    const now = Date.now();
    const grade = overrideGrade || evaluation.suggestedGrade;
    if (task.type === 'all') {
      task.card.srs = applyGradeToCopy(task.card.srs, grade, now);
      task.card.translations.forEach(translation => {
        const translationGrade = overrideGrade || (
          evaluation.rememberedIds.includes(translation.id) ? 'good' : 'again'
        );
        translation.srs = applyGradeToCopy(translation.srs, translationGrade, now);
        if (translationGrade === 'again') {
          scheduleRemediation(
            task.card.id,
            translation.id,
            hasUnambiguousContext(task.card, translation.id) ? 'context' : 'reverse'
          );
        }
      });
    } else {
      task.translation.srs = applyGradeToCopy(task.translation.srs, grade, now);
      if (grade === 'again') {
        const nextType = task.type === 'context'
          ? 'reverse'
          : hasUnambiguousContext(task.card, task.translation.id) ? 'context' : 'reverse';
        scheduleRemediation(task.card.id, task.translation.id, nextType);
      }
    }
    task.card.updatedAt = Date.now();
    persist({ render: false });
    renderDashboard();
    state.answeredCount += 1;
    state.currentTask = null;
    state.currentEvaluation = null;
    state.practiceAnyway = false;
    nextTask();
  }

  function studySpecificCard(cardId) {
    state.currentTask = null;
    state.currentEvaluation = null;
    state.practiceAnyway = true;
    showPage('study', { skipStudyStart: true });
    nextTask({ onlyCardId: cardId, force: true });
  }

  function handleCardListClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const cardId = button.dataset.cardId;
    if (action === 'new-card') showPage('editor');
    if (action === 'edit-card') {
      const card = getCard(cardId);
      if (card) fillEditor(card);
    }
    if (action === 'delete-card') deleteCard(cardId);
    if (action === 'study-card') studySpecificCard(cardId);
    if (action === 'show-translation-links') {
      showRussianTranslationLinks(button.dataset.translationText || button.textContent.trim());
    }
  }

  function handleEditorClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'remove-translation') {
      const rows = els.translationList.querySelectorAll('.translation-editor');
      if (rows.length === 1) {
        button.closest('.translation-editor').querySelector('.translation-input').value = '';
        showToast('Нужен хотя бы один перевод');
      } else {
        button.closest('.translation-editor').remove();
      }
      refreshExampleTranslationOptions();
    }
    if (action === 'remove-example') {
      const row = button.closest('.example-editor');
      if (els.exampleList.querySelectorAll('.example-editor').length === 1) {
        row.querySelector('.example-input').value = '';
        row.querySelectorAll('.example-meaning-links input').forEach(input => { input.checked = false; });
        row.querySelector('.detected-links').innerHTML = '';
        row.dataset.translationIds = '[]';
        row.dataset.linkedCardIds = '[]';
      } else {
        row.remove();
      }
      renderExistingExampleSuggestions();
    }
    if (action === 'use-example') {
      const suggestions = JSON.parse(els.existingExampleSuggestions.dataset.suggestions || '[]');
      const item = suggestions[Number(button.dataset.suggestionIndex)];
      if (!item) return;
      const node = createExampleEditor({
        id: uid('ex'),
        text: item.example.text,
        translationIds: [],
        linkedCardIds: [item.cardId]
      });
      renderDetectedLinks(node);
      renderExistingExampleSuggestions();
      showToast('Пример добавлен');
    }
  }

  function handleStudyClick(event) {
    const button = event.target.closest('[data-study-action], [data-study-grade]');
    if (!button) return;
    if (button.dataset.studyGrade) {
      commitGrade(button.dataset.studyGrade);
      return;
    }
    const action = button.dataset.studyAction;
    if (action === 'new-card') showPage('editor');
    if (action === 'practice-anyway') {
      state.practiceAnyway = true;
      nextTask({ force: true });
    }
    if (action === 'accept-grade') commitGrade();
    if (action === 'toggle-override') byId('overrideActions').classList.toggle('hidden');
  }

  els.navItems.forEach(button => button.addEventListener('click', () => {
    const page = button.dataset.nav;
    if (page !== 'study') state.practiceAnyway = false;
    if (page === 'editor' && state.activePage !== 'editor') resetEditor();
    showPage(page, { keepEditor: page === 'editor' });
  }));
  els.settingsButton.addEventListener('click', openSettings);
  els.cardSearch.addEventListener('input', renderCards);
  els.cardList.addEventListener('click', handleCardListClick);
  els.cardForm.addEventListener('submit', saveEditor);
  els.cardForm.addEventListener('click', handleEditorClick);
  els.studyContent.addEventListener('click', handleStudyClick);
  els.studyContent.addEventListener('click', event => {
    if (event.target.id === 'checkAnswerButton') evaluateCurrentAnswer();
  });
  els.addTranslationButton.addEventListener('click', () => createTranslationEditor());
  els.addExampleButton.addEventListener('click', () => createExampleEditor());
  els.cancelEditButton.addEventListener('click', () => {
    if (state.editingId) {
      resetEditor();
      showPage('cards');
    } else {
      resetEditor();
      showToast('Форма очищена');
    }
  });
  els.translationList.addEventListener('input', event => {
    if (event.target.classList.contains('translation-input')) refreshExampleTranslationOptions();
  });
  els.exampleList.addEventListener('input', event => {
    if (event.target.classList.contains('example-input')) {
      const node = event.target.closest('.example-editor');
      renderDetectedLinks(node);
      renderExistingExampleSuggestions();
    }
  });
  els.wordInput.addEventListener('input', renderExistingExampleSuggestions);
  els.exportBackupButton.addEventListener('click', exportBackup);
  els.importBackupButton.addEventListener('click', requestImportBackup);
  els.backupFileInput.addEventListener('change', () => {
    const file = els.backupFileInput.files && els.backupFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => receiveBackup(String(reader.result || ''));
    reader.onerror = () => showToast('Не удалось прочитать файл');
    reader.readAsText(file, 'utf-8');
  });
  els.modalBackdrop.addEventListener('click', event => {
    if (event.target === els.modalBackdrop && state.modalResolver) state.modalResolver(false);
  });

  window.lexiCardsReceiveBackup = receiveBackup;
  window.lexiCardsNativeMessage = function (kind, success, message) {
    setBackupStatus(message || '');
    if (message) showToast(message);
  };
  window.lexiCardsHandleBack = function () {
    if (!els.modalBackdrop.classList.contains('hidden') && state.modalResolver) {
      state.modalResolver(false);
      return true;
    }
    if (state.activePage === 'settings') {
      openSettings();
      return true;
    }
    if (state.activePage !== 'cards') {
      state.practiceAnyway = false;
      if (state.activePage === 'editor') resetEditor();
      showPage('cards');
      return true;
    }
    return false;
  };

  resetEditor();
  renderAll();
  showPage('cards');
})();
