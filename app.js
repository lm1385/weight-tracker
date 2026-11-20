/* ============================================================
   轻记体重 · 交互逻辑
   纯原生 JavaScript，无任何依赖。数据保存在 localStorage。
   ============================================================ */

(() => {
  'use strict';

  const STORAGE_KEY = 'qingji-weight:v1';
  const MAX_NOTE = 40;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const KG_MIN = 20;
  const KG_MAX = 300;
  const HEIGHT_MIN = 100;
  const HEIGHT_MAX = 250;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const state = {
    records: [],
    profile: { height: null, target: null },
    range: 30,
    editingDate: null,
    pendingConfirm: null,
    storageOk: true,
    chart: null,
  };

  const importState = {
    parsed: null,
    fileName: '',
    readToken: 0,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const els = {
    entryCard: $('#entry-card'),
    entryForm: $('#entry-form'),
    entryEyebrow: $('#entry-eyebrow'),
    entryTitle: $('#entry-title'),
    weightInput: $('#weight-input'),
    dateInput: $('#date-input'),
    noteInput: $('#note-input'),
    submitBtn: $('#submit-btn'),
    submitText: $('#submit-text'),
    cancelEdit: $('#cancel-edit'),
    formError: $('#form-error'),
    formHint: $('#form-hint'),
    todayText: $('#today-text'),
    todayStatus: $('#today-status'),
    todayStatusText: $('#today-status-text'),
    statsGrid: $('#stats-grid'),
    goalCard: $('.goal-card'),
    goalPercent: $('#goal-percent'),
    goalRingLabel: $('#goal-ring-label'),
    ringFill: $('#ring-fill'),
    goalHeadline: $('#goal-headline'),
    goalDesc: $('#goal-desc'),
    goalMeta: $('#goal-meta'),
    goalFoot: $('#goal-foot'),
    goalSettingsBtn: $('#goal-settings-btn'),
    rangeSwitch: $('#range-switch'),
    chartSvg: $('#chart'),
    chartWrap: $('#chart-wrap'),
    chartTooltip: $('#chart-tooltip'),
    chartEmpty: $('#chart-empty'),
    chartEmptyTitle: $('#chart-empty-title'),
    chartAverage: $('#chart-average'),
    chartSummary: $('#chart-summary'),
    historyCount: $('#history-count'),
    historyList: $('#history-list'),
    exportBtn: $('#export-btn'),
    footerExportBtn: $('#footer-export-btn'),
    settingsBtn: $('#settings-btn'),
    settingsDialog: $('#settings-dialog'),
    settingsForm: $('#settings-form'),
    heightInput: $('#height-input'),
    targetInput: $('#target-input'),
    settingsError: $('#settings-error'),
    settingsCount: $('#settings-count'),
    settingsExportBtn: $('#settings-export-btn'),
    settingsImportBtn: $('#settings-import-btn'),
    clearDataBtn: $('#clear-data-btn'),
    importBtn: $('#import-btn'),
    importDialog: $('#import-dialog'),
    importFile: $('#import-file'),
    importDrop: $('#import-drop'),
    importDropTitle: $('#import-drop-title'),
    importDropSub: $('#import-drop-sub'),
    importError: $('#import-error'),
    importPreview: $('#import-preview'),
    importCount: $('#import-count'),
    importRange: $('#import-range'),
    importConflicts: $('#import-conflicts'),
    importNotes: $('#import-notes'),
    importPlan: $('#import-plan'),
    importConfirm: $('#import-confirm'),
    confirmDialog: $('#confirm-dialog'),
    confirmTitle: $('#confirm-title'),
    confirmMessage: $('#confirm-message'),
    confirmCancel: $('#confirm-cancel'),
    confirmOk: $('#confirm-ok'),
    toast: $('#toast'),
  };

  /* ---------------- 工具函数 ---------------- */

  const pad2 = (value) => String(value).padStart(2, '0');

  function round1(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  function fmtWeight(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return round1(number).toFixed(1);
  }

  function fmtDelta(value) {
    const number = round1(value);
    if (Math.abs(number) < 0.05) return '0.0';
    return `${number > 0 ? '+' : '−'}${Math.abs(number).toFixed(1)}`;
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function isValidDateKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const date = parseDateKey(key);
    return !Number.isNaN(date.getTime()) && dateKey(date) === key;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function shiftDateKey(key, days) {
    const date = parseDateKey(key);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function daysBetween(laterKey, earlierKey) {
    return Math.round((parseDateKey(laterKey) - parseDateKey(earlierKey)) / 86400000);
  }

  function dateLabel(key) {
    if (!isValidDateKey(key)) return '';
    const date = parseDateKey(key);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
  }

  function monthDay(key) {
    if (!isValidDateKey(key)) return '';
    const date = parseDateKey(key);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function dateRangeLabel(first, last) {
    if (!isValidDateKey(first) || !isValidDateKey(last)) return '—';
    if (first === last) return monthDay(first);
    const firstDate = parseDateKey(first);
    const lastDate = parseDateKey(last);
    if (firstDate.getFullYear() === lastDate.getFullYear()) {
      return `${monthDay(first)} – ${monthDay(last)}`;
    }
    return `${firstDate.getFullYear()}年${monthDay(first)} – ${lastDate.getFullYear()}年${monthDay(last)}`;
  }

  function monthLabel(key) {
    const date = parseDateKey(key);
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[character];
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function bmiLabel(bmi) {
    if (bmi < 18.5) return '偏瘦';
    if (bmi < 24) return '正常';
    if (bmi < 28) return '偏高';
    return '较高';
  }

  /* ---------------- 存储 ---------------- */

  function checkStorage() {
    try {
      const probe = '__qingji_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  function sanitizeRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!isValidDateKey(raw.date)) return null;
    const weight = Number(raw.weight);
    if (!Number.isFinite(weight) || weight < KG_MIN || weight > KG_MAX) return null;
    const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX_NOTE) : '';
    const updatedAt = Number(raw.updatedAt);
    return {
      date: raw.date,
      weight: round1(weight),
      note,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    };
  }

  function loadState() {
    state.records = [];
    state.profile = { height: null, target: null };

    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return;
    }
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data.records)) {
        const byDate = new Map();
        data.records.forEach((item) => {
          const record = sanitizeRecord(item);
          if (!record) return;
          const previous = byDate.get(record.date);
          if (!previous || previous.updatedAt <= record.updatedAt) {
            byDate.set(record.date, record);
          }
        });
        state.records = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
      }

      if (data.profile && typeof data.profile === 'object') {
        const height = Number(data.profile.height);
        const target = Number(data.profile.target);
        state.profile.height =
          Number.isFinite(height) && height >= HEIGHT_MIN && height <= HEIGHT_MAX ? round1(height) : null;
        state.profile.target =
          Number.isFinite(target) && target >= KG_MIN && target <= KG_MAX ? round1(target) : null;
      }
    } catch (error) {
      console.warn('读取本地体重数据失败：', error);
    }
  }

  function persist() {
    if (!state.storageOk) return false;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          records: state.records,
          profile: state.profile,
        })
      );
      return true;
    } catch (error) {
      state.storageOk = false;
      return false;
    }
  }

  /* ---------------- 数据读取 ---------------- */

  function recordForDate(key) {
    return state.records.find((record) => record.date === key) || null;
  }

  function latestRecord() {
    return state.records.length ? state.records[state.records.length - 1] : null;
  }

  function saveRecord(record) {
    const index = state.records.findIndex((item) => item.date === record.date);
    if (index >= 0) {
      state.records[index] = { ...state.records[index], ...record };
    } else {
      state.records.push(record);
    }
    state.records.sort((a, b) => a.date.localeCompare(b.date));
    return persist();
  }

  function currentStreak() {
    const dates = new Set(state.records.map((record) => record.date));
    const today = todayKey();
    let cursor = dates.has(today) ? today : shiftDateKey(today, -1);
    let streak = 0;
    while (dates.has(cursor)) {
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    }
    return streak;
  }

  function chooseInitialRange() {
    if (!state.records.length) return 7;
    const latest = latestRecord();
    const recent30 = state.records.filter(
      (record) => record.date >= shiftDateKey(todayKey(), -29) && record.date <= todayKey()
    ).length;

    if (recent30 >= 2) {
      const span = daysBetween(latest.date, state.records[0].date);
      return span <= 6 ? 7 : 30;
    }
    return state.records.length > 1 ? 'all' : 7;
  }

  function syncRangeButtons() {
    $$('button[data-range]', els.rangeSwitch).forEach((button) => {
      const active = button.dataset.range === String(state.range);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  /* ---------------- 渲染：头部与状态 ---------------- */

  function setTodayText() {
    const today = new Date();
    els.todayText.textContent = `${today.getMonth() + 1}月${today.getDate()}日 · ${WEEKDAYS[today.getDay()]}`;
  }

  function renderTodayStatus() {
    const record = recordForDate(todayKey());
    els.todayStatus.classList.toggle('is-recorded', Boolean(record));
    els.todayStatusText.textContent = record
      ? `今日已记录 ${fmtWeight(record.weight)} kg`
      : '今天还未记录';
  }

  function updateEntryCopy() {
    if (state.editingDate) {
      els.entryEyebrow.textContent = '编辑记录';
      els.entryTitle.textContent = '修改这天的记录';
      return;
    }
    if (els.dateInput.value && els.dateInput.value !== todayKey()) {
      els.entryEyebrow.textContent = '补记记录';
      els.entryTitle.textContent = '补记这一天的体重';
      return;
    }
    els.entryEyebrow.textContent = '今日记录';
    els.entryTitle.textContent = '今天称重了吗？';
  }

  function updateFormHint() {
    const key = els.dateInput.value;
    if (!isValidDateKey(key)) {
      els.formHint.textContent = '支持补记历史数据；同一天再次记录会覆盖当天数据。';
      return;
    }

    if (state.editingDate && key === state.editingDate) {
      els.formHint.innerHTML = `正在编辑 <strong>${dateLabel(key)}</strong> 的记录，保存后将覆盖原数据。`;
      return;
    }

    const existing = recordForDate(key);
    if (existing) {
      els.formHint.innerHTML = `<strong>${dateLabel(key)}</strong> 已有记录 ${fmtWeight(existing.weight)} kg，再次保存将覆盖。`;
      return;
    }

    if (key === todayKey()) {
      els.formHint.textContent = '支持补记历史数据；同一天再次记录会覆盖当天数据。';
    } else {
      els.formHint.textContent = `正在补记 ${dateLabel(key)} 的数据，保存后会加入历史记录。`;
    }
  }

  /* ---------------- 渲染：统计卡片 ---------------- */

  function statValue(value, unit, tone = '') {
    return `<p class="stat-value${tone ? ` ${tone}` : ''}">${value}${
      unit ? `<span class="unit">${unit}</span>` : ''
    }</p>`;
  }

  function renderStats() {
    const latest = latestRecord();
    const previous = state.records.length >= 2 ? state.records[state.records.length - 2] : null;
    const today = todayKey();
    const recent7 = state.records.filter(
      (record) => record.date >= shiftDateKey(today, -6) && record.date <= today
    );
    const average7 = recent7.length
      ? recent7.reduce((sum, record) => sum + record.weight, 0) / recent7.length
      : null;
    const streak = currentStreak();

    let changeValue = '—';
    let changeUnit = '';
    let changeTone = '';
    let changeSub = '至少需要两条记录';
    if (latest && previous) {
      const delta = round1(latest.weight - previous.weight);
      changeValue = fmtDelta(delta);
      changeUnit = 'kg';
      if (delta < -0.049) changeTone = 'is-down';
      else if (delta > 0.049) changeTone = 'is-up';
      changeSub = `较 ${dateLabel(previous.date)}`;
    }

    const cards = [
      {
        tone: 'teal',
        icon: 'scale',
        label: '最新体重',
        value: latest ? fmtWeight(latest.weight) : '—',
        unit: latest ? 'kg' : '',
        sub: latest ? (latest.date === today ? '今天记录' : dateLabel(latest.date)) : '还没有记录',
      },
      {
        tone: 'amber',
        icon: 'trend',
        label: '较上次',
        value: changeValue,
        unit: changeUnit,
        sub: changeSub,
        valueTone: changeTone,
      },
      {
        tone: 'blue',
        icon: 'chart',
        label: '近 7 天平均',
        value: average7 != null ? fmtWeight(average7) : '—',
        unit: average7 != null ? 'kg' : '',
        sub: recent7.length ? `近 7 天 · ${recent7.length} 条记录` : '近 7 天暂无记录',
      },
      {
        tone: 'coral',
        icon: 'calendar',
        label: '连续记录',
        value: String(streak),
        unit: '天',
        sub: recordForDate(today) ? '今天已打卡' : streak > 0 ? '今天还没记录' : '从今天开始吧',
      },
    ];

    els.statsGrid.innerHTML = cards
      .map((card) => {
        return `
          <article class="stat-card tone-${card.tone}">
            <span class="stat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><use href="#i-${card.icon}"></use></svg>
            </span>
            <div class="stat-body">
              <span class="stat-label">${card.label}</span>
              ${statValue(card.value, card.unit, card.valueTone || '')}
              <span class="stat-sub">${card.sub}</span>
            </div>
          </article>`;
      })
      .join('');
  }

  /* ---------------- 渲染：目标卡片 ---------------- */

  function renderGoal() {
    const latest = latestRecord();
    const { target, height } = state.profile;
    let progress = 0;
    let percent = '—';
    let headline = '';
    let desc = '';
    let meta = '';
    let achieved = false;

    if (!latest) {
      if (target != null) {
        headline = '目标已设定';
        desc = `目标 ${fmtWeight(target)} kg · 记录第一条体重后开始计算进度`;
        meta = `<span class="goal-chip"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-target"></use></svg>目标 ${fmtWeight(target)} kg</span>`;
      } else {
        headline = '记录第一条体重';
        desc = '记录后即可看到目标进度和 BMI';
      }
    } else if (target == null) {
      headline = '设定一个目标';
      desc = `当前 ${fmtWeight(latest.weight)} kg，给自己一个方向`;
      meta = `<span class="goal-chip">当前 ${fmtWeight(latest.weight)} kg</span>`;
    } else {
      const start = state.records[0].weight;
      const total = target - start;
      const done = latest.weight - start;
      if (total === 0) {
        progress = Math.abs(latest.weight - target) < 0.05 ? 1 : 0;
      } else {
        progress = clamp(done / total, 0, 1);
      }

      const reached =
        total === 0
          ? Math.abs(latest.weight - target) < 0.05
          : total > 0
            ? latest.weight >= target - 0.049
            : latest.weight <= target + 0.049;

      if (reached) {
        progress = 1;
        achieved = true;
        percent = '100%';
        headline = '目标达成';
        desc = `从 ${fmtWeight(start)} kg 到 ${fmtWeight(latest.weight)} kg，继续保持`;
      } else {
        percent = `${Math.round(progress * 100)}%`;
        headline = `还差 ${fmtWeight(Math.abs(latest.weight - target))} kg`;
        desc = `起始 ${fmtWeight(start)} kg · 目标 ${fmtWeight(target)} kg`;
      }

      meta = `
        <span class="goal-chip">当前 ${fmtWeight(latest.weight)} kg</span>
        <span class="goal-chip"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-target"></use></svg>目标 ${fmtWeight(target)} kg</span>`;
    }

    els.goalPercent.textContent = percent;
    els.goalRingLabel.textContent = target == null ? '待设定' : latest ? '完成' : '待记录';
    els.goalHeadline.textContent = headline;
    els.goalDesc.textContent = desc;
    els.goalMeta.innerHTML = meta;
    els.ringFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
    els.goalCard.classList.toggle('is-achieved', achieved);

    let left;
    if (latest && height) {
      const bmi = latest.weight / Math.pow(height / 100, 2);
      left = `<span class="bmi-text">BMI <b>${fmtWeight(bmi)}</b> · ${bmiLabel(bmi)}</span>`;
    } else if (latest) {
      left = `<button class="link-btn" type="button" data-action="open-settings">填写身高，计算 BMI</button>`;
    } else {
      left = '<span>数据仅保存在本机</span>';
    }

    let right = '';
    if (target == null) {
      right = `<button class="goal-cta" type="button" data-action="open-settings">设置目标</button>`;
    } else if (latest) {
      right = `<span>已记录 <b>${state.records.length}</b> 天</span>`;
    }

    els.goalFoot.innerHTML = left + right;
  }

  /* ---------------- 渲染：历史记录 ---------------- */

  function renderHistory() {
    const sorted = state.records.slice().sort((a, b) => b.date.localeCompare(a.date));
    els.historyCount.textContent = `${state.records.length} 条`;

    if (!sorted.length) {
      els.historyList.innerHTML = `
        <li class="history-empty">
          <span class="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><use href="#i-scale"></use></svg>
          </span>
          <p>还没有体重记录</p>
          <span>从今天开始，记录第一条吧。</span>
          <button class="ghost-btn" type="button" data-action="focus-entry">去记录</button>
        </li>`;
      return;
    }

    const previousByDate = new Map();
    for (let index = 1; index < state.records.length; index += 1) {
      previousByDate.set(state.records[index].date, state.records[index - 1]);
    }

    const monthCounts = new Map();
    sorted.forEach((record) => {
      const month = record.date.slice(0, 7);
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    });

    const today = todayKey();
    const yesterday = shiftDateKey(today, -1);
    let currentMonth = '';
    const rows = [];

    sorted.forEach((record) => {
      const month = record.date.slice(0, 7);
      if (month !== currentMonth) {
        currentMonth = month;
        rows.push(`
          <li class="month-divider">
            <span>${monthLabel(record.date)}</span>
            <span>${monthCounts.get(month)} 条</span>
          </li>`);
      }

      const date = parseDateKey(record.date);
      let relative = WEEKDAYS[date.getDay()];
      if (record.date === today) relative = '今天';
      else if (record.date === yesterday) relative = '昨天';

      const previous = previousByDate.get(record.date);
      let deltaClass = 'is-none';
      let deltaText = '首次';
      if (previous) {
        const delta = round1(record.weight - previous.weight);
        if (Math.abs(delta) < 0.05) deltaClass = 'is-flat';
        else if (delta < 0) deltaClass = 'is-down';
        else deltaClass = 'is-up';
        deltaText = fmtDelta(delta);
      }

      rows.push(`
        <li class="history-row${record.date === today ? ' is-today' : ''}">
          <div class="date-cell">
            <span class="date-main">${date.getMonth() + 1}月${date.getDate()}日</span>
            <span class="date-sub">${relative}</span>
          </div>
          <div class="weight-cell">${fmtWeight(record.weight)}<small>kg</small></div>
          <div class="delta-cell">
            <span class="delta-badge ${deltaClass}">${deltaText}</span>
          </div>
          <div class="note-cell${record.note ? '' : ' is-empty'}" title="${escapeHtml(record.note)}">${
            record.note ? escapeHtml(record.note) : '—'
          }</div>
          <div class="row-actions">
            <button class="row-btn" type="button" data-action="edit" data-date="${record.date}"
                    aria-label="编辑 ${date.getMonth() + 1}月${date.getDate()}日的记录" title="编辑">
              <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-edit"></use></svg>
            </button>
            <button class="row-btn" type="button" data-action="delete" data-date="${record.date}"
                    aria-label="删除 ${date.getMonth() + 1}月${date.getDate()}日的记录" title="删除">
              <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-trash"></use></svg>
            </button>
          </div>
        </li>`);
    });

    els.historyList.innerHTML = rows.join('');
  }

  /* ---------------- 渲染：趋势图 ---------------- */

  function visibleRecords() {
    if (state.range === 'all') return state.records.slice();
    const today = todayKey();
    const start = shiftDateKey(today, -(Number(state.range) - 1));
    return state.records.filter((record) => record.date >= start && record.date <= today);
  }

  function niceScale(values) {
    let low = Math.min(...values);
    let high = Math.max(...values);
    if (high - low < 1) {
      const middle = (high + low) / 2;
      low = middle - 0.5;
      high = middle + 0.5;
    }

    const rawSpan = high - low;
    let step = rawSpan <= 1.4 ? 0.5 : rawSpan <= 3 ? 0.5 : rawSpan <= 7 ? 1 : rawSpan <= 15 ? 2 : 5;
    let min = Math.floor((low - step * 0.6) / step) * step;
    let max = Math.ceil((high + step * 0.6) / step) * step;
    let ticks = [];

    const buildTicks = () => {
      ticks = [];
      for (let value = min; value <= max + step / 2; value += step) {
        ticks.push(round1(value));
      }
    };

    buildTicks();
    while (ticks.length > 6) {
      step *= 2;
      min = Math.floor((low - step * 0.6) / step) * step;
      max = Math.ceil((high + step * 0.6) / step) * step;
      buildTicks();
    }

    return { min, max, ticks };
  }

  function buildXLabels(domain, totalDays, maxLabels) {
    let count;
    if (totalDays <= 7) count = totalDays + 1;
    else if (totalDays <= 31) count = 5;
    else if (totalDays <= 120) count = 4;
    else count = 5;

    count = Math.max(2, Math.min(count, maxLabels, totalDays + 1));
    const labels = [];
    const seen = new Set();

    for (let index = 0; index < count; index += 1) {
      const offset = Math.round((totalDays * index) / (count - 1));
      const key = shiftDateKey(domain.start, offset);
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push({ key, position: offset / totalDays });
    }

    return { labels, count: count - 1 };
  }

  function svgNode(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    return node;
  }

  function hideChartTooltip() {
    els.chartTooltip.hidden = true;
    els.chartTooltip.classList.remove('is-below');
    if (state.chart) {
      state.chart.guide.setAttribute('visibility', 'hidden');
      state.chart.focus.setAttribute('visibility', 'hidden');
    }
  }

  function renderChart() {
    hideChartTooltip();
    state.chart = null;

    const points = visibleRecords();
    const rangeLabel = state.range === 'all' ? '全部记录' : `近 ${state.range} 天`;
    const average = points.length
      ? points.reduce((sum, record) => sum + record.weight, 0) / points.length
      : null;

    els.chartAverage.textContent = average != null ? `${fmtWeight(average)} kg` : '—';
    els.chartSummary.textContent = points.length
      ? `${rangeLabel} · ${points.length} 条记录`
      : `${rangeLabel} · 暂无记录`;

    if (!points.length) {
      els.chartSvg.replaceChildren();
      els.chartEmpty.hidden = false;
      els.chartEmptyTitle.textContent =
        state.range === 'all' ? '还没有任何记录' : `${rangeLabel}还没有记录`;
      els.chartSvg.setAttribute('aria-label', '体重趋势图，暂无数据');
      return;
    }

    els.chartEmpty.hidden = true;

    const width = Math.max(300, els.chartWrap.clientWidth || 800);
    const height = Math.max(220, els.chartWrap.clientHeight || 320);
    const pad = {
      top: 20,
      right: 20,
      bottom: 30,
      left: width < 460 ? 39 : 47,
    };
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;

    const today = todayKey();
    let domainStart;
    let domainEnd;
    if (state.range === 'all') {
      domainStart = points[0].date;
      domainEnd = points[points.length - 1].date;
      if (domainStart === domainEnd) {
        domainStart = shiftDateKey(domainStart, -1);
        domainEnd = shiftDateKey(domainEnd, 1);
      }
    } else {
      domainEnd = today;
      const rangeStart = shiftDateKey(today, -(Number(state.range) - 1));
      domainStart = points[0].date > rangeStart ? points[0].date : rangeStart;
      if (domainStart >= domainEnd) {
        domainStart = shiftDateKey(domainEnd, -1);
      }
    }

    const totalDays = Math.max(1, daysBetween(domainEnd, domainStart));
    const scale = niceScale(points.map((record) => record.weight));
    const range = scale.max - scale.min || 1;

    const xFor = (key) =>
      pad.left + (daysBetween(key, domainStart) / totalDays) * innerWidth;
    const yFor = (weight) =>
      pad.top + innerHeight - ((weight - scale.min) / range) * innerHeight;

    const positions = points.map((record) => ({
      record,
      x: xFor(record.date),
      y: yFor(record.weight),
    }));

    const svg = els.chartSvg;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute(
      'aria-label',
      `体重趋势图，${rangeLabel}，共 ${points.length} 条记录，平均 ${fmtWeight(average)} 公斤`
    );

    const defs = svgNode('defs');
    const gradient = svgNode('linearGradient', {
      id: 'chart-area-gradient',
      x1: '0',
      y1: '0',
      x2: '0',
      y2: '1',
    });
    gradient.append(
      svgNode('stop', { offset: '0%', 'stop-color': '#2a9c7e', 'stop-opacity': '0.24' }),
      svgNode('stop', { offset: '100%', 'stop-color': '#2a9c7e', 'stop-opacity': '0.015' })
    );
    defs.append(gradient);
    svg.append(defs);

    const baseY = pad.top + innerHeight;

    scale.ticks.forEach((tick) => {
      const y = yFor(tick);
      svg.append(
        svgNode('line', {
          x1: pad.left,
          y1: y,
          x2: width - pad.right,
          y2: y,
          stroke: '#e9eee6',
          'stroke-width': 1,
        })
      );
      const label = svgNode('text', {
        x: pad.left - 9,
        y: y + 3.5,
        'text-anchor': 'end',
        fill: '#9aa69e',
        'font-size': '10.5',
      });
      label.textContent = fmtWeight(tick);
      svg.append(label);
    });

    const unitLabel = svgNode('text', {
      x: width - pad.right,
      y: 10,
      'text-anchor': 'end',
      fill: '#b0bab2',
      'font-size': '9.5',
      'letter-spacing': '0.06em',
    });
    unitLabel.textContent = 'kg';
    svg.append(unitLabel);

    if (average != null) {
      const averageY = yFor(average);
      svg.append(
        svgNode('line', {
          x1: pad.left,
          y1: averageY,
          x2: width - pad.right,
          y2: averageY,
          stroke: '#d3a244',
          'stroke-width': 1.4,
          'stroke-dasharray': '4 5',
          opacity: 0.8,
        })
      );
    }

    if (positions.length >= 2) {
      const linePath = positions
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');
      const areaPath = `${linePath} L${positions[positions.length - 1].x.toFixed(2)} ${baseY} L${positions[0].x.toFixed(2)} ${baseY} Z`;

      svg.append(svgNode('path', { d: areaPath, fill: 'url(#chart-area-gradient)', stroke: 'none' }));
      svg.append(
        svgNode('path', {
          d: linePath,
          fill: 'none',
          stroke: '#147a64',
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        })
      );
    }

    const showDots = positions.length <= 80;
    positions.forEach((point, index) => {
      if (!showDots && index !== positions.length - 1) return;
      const isLast = index === positions.length - 1;
      svg.append(
        svgNode('circle', {
          cx: point.x,
          cy: point.y,
          r: isLast ? 4 : 3.2,
          fill: '#ffffff',
          stroke: '#147a64',
          'stroke-width': isLast ? 2.6 : 2,
        })
      );
    });

    const xLabels = buildXLabels({ start: domainStart, end: domainEnd }, totalDays, Math.max(2, Math.floor(innerWidth / 72)));
    xLabels.labels.forEach((label, index) => {
      const isFirst = index === 0;
      const isLast = index === xLabels.labels.length - 1;
      const date = parseDateKey(label.key);
      let text;
      if (label.key === today) {
        text = '今天';
      } else if (totalDays > 400) {
        text = `${String(date.getFullYear()).slice(2)}/${date.getMonth() + 1}`;
      } else {
        text = `${date.getMonth() + 1}/${date.getDate()}`;
      }
      const node = svgNode('text', {
        x: pad.left + label.position * innerWidth,
        y: height - 7,
        'text-anchor': isFirst && !isLast ? 'start' : isLast && !isFirst ? 'end' : 'middle',
        fill: label.key === today ? '#147a64' : '#96a29a',
        'font-size': '10.5',
        'font-weight': label.key === today ? 600 : 400,
      });
      node.textContent = text;
      svg.append(node);
    });

    const guide = svgNode('line', {
      y1: pad.top,
      y2: baseY,
      stroke: '#b8c8bd',
      'stroke-width': 1,
      'stroke-dasharray': '3 4',
      visibility: 'hidden',
    });
    const focus = svgNode('circle', {
      r: 5.5,
      fill: '#ffffff',
      stroke: '#147a64',
      'stroke-width': 2.6,
      visibility: 'hidden',
    });
    svg.append(guide, focus);

    state.chart = {
      positions,
      guide,
      focus,
      width,
      height,
      pad,
      innerWidth,
      innerHeight,
      totalDays,
    };
  }

  function onChartPointerMove(event) {
    const chart = state.chart;
    if (!chart || !chart.positions.length) return;

    const rect = els.chartSvg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scaleX = chart.width / rect.width;
    const scaleY = chart.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;

    if (x < chart.pad.left - 16 || x > chart.width - chart.pad.right + 16) {
      hideChartTooltip();
      return;
    }

    let nearest = chart.positions[0];
    let smallest = Infinity;
    chart.positions.forEach((point) => {
      const distance = Math.abs(point.x - x);
      if (distance < smallest) {
        smallest = distance;
        nearest = point;
      }
    });

    const point = nearest;
    chart.guide.setAttribute('x1', point.x);
    chart.guide.setAttribute('x2', point.x);
    chart.guide.setAttribute('visibility', 'visible');
    chart.focus.setAttribute('cx', point.x);
    chart.focus.setAttribute('cy', point.y);
    chart.focus.setAttribute('visibility', 'visible');

    const tooltip = els.chartTooltip;
    tooltip.replaceChildren();

    const dateNode = document.createElement('span');
    dateNode.className = 'tip-date';
    dateNode.textContent = dateLabel(point.record.date);

    const weightNode = document.createElement('span');
    weightNode.className = 'tip-weight';
    weightNode.textContent = fmtWeight(point.record.weight);
    const unitNode = document.createElement('small');
    unitNode.textContent = 'kg';
    weightNode.append(unitNode);

    tooltip.append(dateNode, weightNode);

    if (point.record.note) {
      const noteNode = document.createElement('span');
      noteNode.className = 'tip-note';
      noteNode.textContent = point.record.note;
      tooltip.append(noteNode);
    }

    const tooltipX = point.x / scaleX;
    const tooltipY = point.y / scaleY;
    const half = Math.min(90, rect.width / 2 - 8);
    tooltip.style.left = `${clamp(tooltipX, half, rect.width - half)}px`;
    tooltip.style.top = `${tooltipY}px`;
    tooltip.classList.toggle('is-below', tooltipY < 84);
    tooltip.hidden = false;
  }

  /* ---------------- 渲染：全部 ---------------- */

  function renderAll() {
    renderTodayStatus();
    renderStats();
    renderGoal();
    renderChart();
    renderHistory();
    els.settingsCount.textContent = String(state.records.length);
    updateFormHint();
    updateEntryCopy();
  }

  /* ---------------- 表单交互 ---------------- */

  function clearFormError() {
    els.formError.textContent = '';
    els.weightInput.closest('.weight-input-wrap').classList.remove('is-invalid');
    els.dateInput.closest('.input-shell').classList.remove('is-invalid');
    els.weightInput.removeAttribute('aria-invalid');
    els.dateInput.removeAttribute('aria-invalid');
  }

  function showFormError(message, input) {
    els.formError.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    if (input === els.weightInput) {
      els.weightInput.closest('.weight-input-wrap').classList.add('is-invalid');
    } else {
      els.dateInput.closest('.input-shell').classList.add('is-invalid');
    }
    input.focus();
    if (input.select && input === els.weightInput) input.select();
  }

  function resetEditing() {
    state.editingDate = null;
    els.submitText.textContent = '记录体重';
    els.cancelEdit.classList.add('hidden');
    els.entryCard.classList.remove('is-editing');
    updateEntryCopy();
  }

  function handleSubmit(event) {
    event.preventDefault();
    clearFormError();

    const rawWeight = els.weightInput.value.trim();
    const weight = Number(rawWeight);
    const date = els.dateInput.value;

    if (!rawWeight || !Number.isFinite(weight)) {
      showFormError('请输入体重，例如 62.4', els.weightInput);
      return;
    }
    if (weight < KG_MIN || weight > KG_MAX) {
      showFormError(`体重需在 ${KG_MIN} – ${KG_MAX} kg 之间`, els.weightInput);
      return;
    }
    if (!isValidDateKey(date)) {
      showFormError('请选择有效的日期', els.dateInput);
      return;
    }
    if (date > todayKey()) {
      showFormError('不能记录未来的日期', els.dateInput);
      return;
    }

    const rounded = round1(weight);
    const note = els.noteInput.value.trim().slice(0, MAX_NOTE);
    const existing = recordForDate(date);
    const saved = saveRecord({ date, weight: rounded, note, updatedAt: Date.now() });

    resetEditing();
    els.weightInput.value = '';
    els.noteInput.value = '';
    renderAll();

    if (!saved) {
      toast('已记录，但浏览器存储不可用，刷新后会丢失');
    } else if (existing) {
      toast(`已更新 ${dateLabel(date)} 的体重`);
    } else {
      toast(`已记录 ${dateLabel(date)} · ${fmtWeight(rounded)} kg`);
    }
  }

  function handleDateChange() {
    clearFormError();
    let date = els.dateInput.value;

    if (date && date > todayKey()) {
      date = todayKey();
      els.dateInput.value = date;
      toast('不能记录未来的日期');
    }

    if (state.editingDate && date !== state.editingDate) {
      resetEditing();
    }

    const existing = date ? recordForDate(date) : null;
    if (existing) {
      els.weightInput.value = fmtWeight(existing.weight);
      els.noteInput.value = existing.note;
    }

    updateFormHint();
    updateEntryCopy();
  }

  function startEdit(date) {
    const record = recordForDate(date);
    if (!record) return;

    state.editingDate = date;
    els.dateInput.value = date;
    els.weightInput.value = fmtWeight(record.weight);
    els.noteInput.value = record.note;
    els.submitText.textContent = '保存修改';
    els.cancelEdit.classList.remove('hidden');
    els.entryCard.classList.add('is-editing');
    clearFormError();
    updateFormHint();
    updateEntryCopy();

    els.entryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      els.weightInput.focus({ preventScroll: true });
      els.weightInput.select();
    }, 260);
  }

  function cancelEditing() {
    resetEditing();
    els.weightInput.value = '';
    els.noteInput.value = '';
    els.dateInput.value = todayKey();
    clearFormError();
    updateFormHint();
    updateEntryCopy();
    els.weightInput.focus();
  }

  function focusEntry() {
    els.entryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => els.weightInput.focus({ preventScroll: true }), 260);
  }

  /* ---------------- 删除 ---------------- */

  function openConfirm({ title, message, confirmText = '删除', onConfirm }) {
    if (els.confirmDialog.open) els.confirmDialog.close();
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmOk.textContent = confirmText;
    state.pendingConfirm = onConfirm;
    els.confirmDialog.showModal();
  }

  function deleteRecord(date) {
    const record = recordForDate(date);
    if (!record) return;

    state.records = state.records.filter((item) => item.date !== date);
    persist();

    if (state.editingDate === date) {
      resetEditing();
    }
    if (els.dateInput.value === date) {
      els.dateInput.value = todayKey();
      els.weightInput.value = '';
      els.noteInput.value = '';
    }

    renderAll();
    toast(`已删除 ${dateLabel(date)} 的记录`);
  }

  function askDeleteRecord(date) {
    const record = recordForDate(date);
    if (!record) return;
    const notePart = record.note ? `，备注「${record.note}」` : '';
    openConfirm({
      title: '删除这条记录？',
      message: `${dateLabel(date)} · ${fmtWeight(record.weight)} kg${notePart}。删除后无法恢复。`,
      confirmText: '删除',
      onConfirm: () => deleteRecord(date),
    });
  }

  function askClearAll() {
    if (!state.records.length) {
      toast('还没有可清空的记录');
      return;
    }
    openConfirm({
      title: '清空所有记录？',
      message: `将删除全部 ${state.records.length} 条体重记录，且无法撤销。建议先导出 CSV 备份。`,
      confirmText: '全部清空',
      onConfirm: () => {
        state.records = [];
        persist();
        resetEditing();
        els.weightInput.value = '';
        els.noteInput.value = '';
        els.dateInput.value = todayKey();
        clearFormError();
        els.settingsDialog.close();
        renderAll();
        toast('已清空所有记录');
      },
    });
  }

  /* ---------------- 设置 ---------------- */

  function openSettings() {
    if (els.settingsDialog.open) return;
    els.heightInput.value = state.profile.height != null ? fmtWeight(state.profile.height) : '';
    els.targetInput.value = state.profile.target != null ? fmtWeight(state.profile.target) : '';
    els.settingsError.textContent = '';
    els.settingsCount.textContent = String(state.records.length);
    els.settingsDialog.showModal();
    window.setTimeout(() => els.heightInput.focus(), 80);
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    els.settingsError.textContent = '';

    const heightRaw = els.heightInput.value.trim();
    const targetRaw = els.targetInput.value.trim();
    let height = null;
    let target = null;

    if (heightRaw) {
      height = Number(heightRaw);
      if (!Number.isFinite(height) || height < HEIGHT_MIN || height > HEIGHT_MAX) {
        els.settingsError.textContent = `身高需在 ${HEIGHT_MIN} – ${HEIGHT_MAX} cm 之间`;
        els.heightInput.focus();
        return;
      }
    }

    if (targetRaw) {
      target = Number(targetRaw);
      if (!Number.isFinite(target) || target < KG_MIN || target > KG_MAX) {
        els.settingsError.textContent = `目标体重需在 ${KG_MIN} – ${KG_MAX} kg 之间`;
        els.targetInput.focus();
        return;
      }
    }

    state.profile.height = height == null ? null : round1(height);
    state.profile.target = target == null ? null : round1(target);
    const saved = persist();
    renderAll();
    els.settingsDialog.close();
    toast(saved ? '设置已保存' : '设置已更新，但浏览器存储不可用');
  }

  /* ---------------- 导出 ---------------- */

  function csvCell(value) {
    const text = String(value ?? '');
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function csvNote(note) {
    return /^[=+\-@]/.test(note) ? `'${note}` : note;
  }

  function exportCsv() {
    if (!state.records.length) {
      toast('还没有可导出的记录');
      return;
    }

    const rows = [['日期', '体重(kg)', '备注']];
    state.records.forEach((record) => {
      rows.push([record.date, fmtWeight(record.weight), csvNote(record.note)]);
    });
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `体重记录_${todayKey()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast(`已导出 ${state.records.length} 条记录`);
  }

  /* ---------------- CSV 导入 ---------------- */

  function normalizeHeader(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[()（）\[\]【】]/g, '');
  }

  function findHeaderIndex(headers, candidates) {
    const normalized = headers.map(normalizeHeader);
    let index = normalized.findIndex((header) => candidates.includes(header));
    if (index >= 0) return index;
    return normalized.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
  }

  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQuotes = false;

    for (const character of firstLine) {
      if (character === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && Object.prototype.hasOwnProperty.call(counts, character)) {
        counts[character] += 1;
      }
    }

    let best = ',';
    if (counts[';'] > counts[best]) best = ';';
    if (counts['\t'] > counts[best]) best = '\t';
    return counts[best] > 0 ? best : ',';
  }

  function parseDelimitedRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (inQuotes) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += character;
        }
      } else if (character === '"') {
        inQuotes = true;
      } else if (character === delimiter) {
        row.push(field);
        field = '';
      } else if (character === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += character;
      }
    }

    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function parseImportDate(raw) {
    const text = String(raw ?? '').trim();
    const match = text.match(
      /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:[ T].*)?$/
    );
    if (!match) return { error: '日期格式无法识别' };

    const key = `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
    if (!isValidDateKey(key)) return { error: '日期无效' };
    if (key > todayKey()) return { error: '日期不能晚于今天' };
    return { key };
  }

  function parseImportWeight(raw) {
    let text = String(raw ?? '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/kg|公斤|千克/gi, '');
    if (!text) return { error: '体重为空' };
    if (/^\d+,\d+$/.test(text)) text = text.replace(',', '.');

    const weight = Number(text);
    if (!Number.isFinite(weight)) return { error: '体重无法识别' };
    if (weight < KG_MIN || weight > KG_MAX) {
      return { error: `体重需在 ${KG_MIN} – ${KG_MAX} kg 之间` };
    }
    return { value: round1(weight) };
  }

  function parseImportText(text) {
    const normalizedText = text
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    if (!normalizedText.trim()) throw new Error('文件是空的，请选择包含记录的 CSV 文件');

    const delimiter = detectDelimiter(normalizedText);
    const rawRows = parseDelimitedRows(normalizedText, delimiter);
    const rows = [];
    rawRows.forEach((cells, index) => {
      if (cells.some((cell) => String(cell).trim() !== '')) {
        rows.push({ cells, line: index + 1 });
      }
    });
    if (!rows.length) throw new Error('文件中没有可读取的内容');

    const headers = rows[0].cells;
    let dateIndex = findHeaderIndex(headers, ['日期', 'date', '时间', 'day']);
    let weightIndex = findHeaderIndex(headers, ['体重kg', '体重', 'weightkg', 'weight', '重量', 'kg']);
    let noteIndex = findHeaderIndex(headers, ['备注', 'note', 'notes', 'comment', 'comments', '说明']);
    let dataStart = 1;

    if (dateIndex < 0 || weightIndex < 0) {
      const firstDate = parseImportDate(headers[0]);
      const firstWeight = parseImportWeight(headers[1]);
      if (firstDate.key && firstWeight.value != null) {
        dateIndex = 0;
        weightIndex = 1;
        noteIndex = 2;
        dataStart = 0;
      } else {
        throw new Error('未找到「日期」和「体重」列，请使用本应用导出的 CSV 格式');
      }
    }

    const byDate = new Map();
    const invalid = [];
    let duplicateCount = 0;

    for (let index = dataStart; index < rows.length; index += 1) {
      const { cells, line } = rows[index];
      const dateResult = parseImportDate(cells[dateIndex]);
      if (!dateResult.key) {
        invalid.push({ line, reason: dateResult.error });
        continue;
      }

      const weightResult = parseImportWeight(cells[weightIndex]);
      if (weightResult.value == null) {
        invalid.push({ line, reason: weightResult.error });
        continue;
      }

      const note = noteIndex >= 0 ? String(cells[noteIndex] ?? '').trim().slice(0, MAX_NOTE) : '';
      if (byDate.has(dateResult.key)) duplicateCount += 1;
      byDate.set(dateResult.key, {
        date: dateResult.key,
        weight: weightResult.value,
        note,
      });
    }

    if (!byDate.size) {
      throw new Error('没有可导入的有效记录，请检查日期和体重格式');
    }

    return {
      records: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
      invalid,
      duplicateCount,
    };
  }

  function setImportError(message) {
    els.importError.textContent = message || '';
  }

  function setImportDropState(fileName, subtitle) {
    const loaded = Boolean(fileName);
    els.importDrop.classList.toggle('is-loaded', loaded);
    els.importDropTitle.textContent = loaded ? fileName : '点击选择或拖拽 CSV 文件';
    els.importDropSub.textContent =
      subtitle || (loaded ? '文件已读取，点击可重新选择' : '支持本应用导出的 CSV：日期,体重(kg),备注');
  }

  function getImportMode() {
    const checked = els.importDialog.querySelector('input[name="import-mode"]:checked');
    return checked ? checked.value : 'merge';
  }

  function updateImportPlan() {
    const parsed = importState.parsed;
    if (!parsed) {
      els.importConfirm.disabled = true;
      els.importConfirm.textContent = '导入数据';
      els.importPlan.textContent = '';
      els.importPlan.classList.remove('is-warning');
      return;
    }

    const mode = getImportMode();
    const existingDates = new Set(state.records.map((record) => record.date));
    const conflictCount = parsed.records.filter((record) => existingDates.has(record.date)).length;
    const addedCount = parsed.records.length - conflictCount;
    let plan = '';
    let label = '导入数据';
    let disabled = false;
    let warning = false;

    if (mode === 'merge') {
      if (addedCount > 0) {
        plan = conflictCount
          ? `将新增 ${addedCount} 条记录，跳过 ${conflictCount} 条同日期记录。`
          : `将新增 ${addedCount} 条记录。`;
        label = `导入 ${addedCount} 条`;
      } else {
        plan = '所有记录的日期都已存在。可以切换到「合并并覆盖同日期」或「替换全部记录」。';
        label = '没有新记录';
        disabled = true;
        warning = true;
      }
    } else if (mode === 'overwrite') {
      plan = conflictCount
        ? `将新增 ${addedCount} 条，覆盖 ${conflictCount} 条同日期记录。`
        : `将新增 ${addedCount} 条记录。`;
      label = `导入 ${parsed.records.length} 条`;
    } else {
      plan = state.records.length
        ? `将清空现有 ${state.records.length} 条记录，并导入 ${parsed.records.length} 条。`
        : `将导入 ${parsed.records.length} 条记录。`;
      label = '替换并导入';
    }

    els.importPlan.textContent = plan;
    els.importPlan.classList.toggle('is-warning', warning);
    els.importConfirm.disabled = disabled;
    els.importConfirm.textContent = label;
  }

  function renderImportPreview() {
    const parsed = importState.parsed;
    if (!parsed) {
      els.importPreview.hidden = true;
      updateImportPlan();
      return;
    }

    const count = parsed.records.length;
    const first = parsed.records[0].date;
    const last = parsed.records[count - 1].date;
    const conflictCount = parsed.records.filter((record) => recordForDate(record.date)).length;

    els.importPreview.hidden = false;
    els.importCount.textContent = `${count} 条`;
    els.importRange.textContent = dateRangeLabel(first, last);
    els.importConflicts.textContent = `${conflictCount} 条`;

    const notes = [];
    if (parsed.invalid.length) {
      const examples = parsed.invalid
        .slice(0, 2)
        .map((item) => `第 ${item.line} 行（${item.reason}）`)
        .join('；');
      notes.push(
        `${parsed.invalid.length} 行格式有误将被跳过：${examples}${parsed.invalid.length > 2 ? ' 等' : ''}`
      );
    }
    if (parsed.duplicateCount) {
      notes.push(`文件内有 ${parsed.duplicateCount} 条同日期记录，已保留最后一条。`);
    }

    els.importNotes.hidden = notes.length === 0;
    els.importNotes.textContent = notes.join('；');
    updateImportPlan();
  }

  function resetImportState() {
    importState.parsed = null;
    importState.fileName = '';
    importState.readToken += 1;
    els.importFile.value = '';
    els.importPreview.hidden = true;
    els.importNotes.hidden = true;
    els.importNotes.textContent = '';
    els.importError.textContent = '';
    els.importDrop.classList.remove('is-dragover');
    setImportDropState('');
    const mergeOption = els.importDialog.querySelector('input[name="import-mode"][value="merge"]');
    if (mergeOption) mergeOption.checked = true;
    updateImportPlan();
  }

  function openImportDialog() {
    if (els.settingsDialog.open) els.settingsDialog.close();
    if (els.importDialog.open) return;
    resetImportState();
    els.importDialog.showModal();
    window.setTimeout(() => els.importDrop.focus(), 60);
  }

  function closeImportDialog() {
    if (els.importDialog.open) els.importDialog.close();
  }

  async function handleImportFile(file) {
    if (!file) return;
    setImportError('');

    importState.fileName = file.name;
    importState.parsed = null;
    els.importPreview.hidden = true;
    updateImportPlan();
    setImportDropState(file.name);

    if (file.size > MAX_IMPORT_BYTES) {
      setImportDropState(file.name, '文件超过 2 MB，请重新选择');
      setImportError('文件太大，请选择 2 MB 以内的 CSV 文件');
      return;
    }

    const token = (importState.readToken += 1);
    setImportError('');

    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (error) {
      if (token !== importState.readToken) return;
      setImportDropState(file.name, '读取失败，请重新选择文件');
      setImportError('无法读取该文件，请换一个文件重试');
      return;
    }
    if (token !== importState.readToken) return;

    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (error) {
      try {
        text = new TextDecoder('gbk').decode(buffer);
      } catch (fallbackError) {
        text = new TextDecoder('utf-8').decode(buffer);
      }
    }

    try {
      const parsed = parseImportText(text);
      if (token !== importState.readToken) return;
      importState.parsed = parsed;
      setImportDropState(file.name, `已读取 ${parsed.records.length} 条有效记录，点击可重新选择`);
      renderImportPreview();
    } catch (error) {
      if (token !== importState.readToken) return;
      importState.parsed = null;
      els.importPreview.hidden = true;
      updateImportPlan();
      setImportDropState(file.name, '解析失败，点击重新选择');
      setImportError(error.message || '无法解析该 CSV 文件');
    }
  }

  function applyImport(mode) {
    const parsed = importState.parsed;
    if (!parsed) return;

    const now = Date.now();
    const imported = parsed.records.map((record, index) => ({
      ...record,
      updatedAt: now + index,
    }));

    let added = 0;
    let replaced = 0;
    let skipped = 0;

    if (mode === 'replace') {
      state.records = imported;
    } else {
      const byDate = new Map(state.records.map((record) => [record.date, record]));
      imported.forEach((record) => {
        if (byDate.has(record.date)) {
          if (mode === 'overwrite') {
            byDate.set(record.date, record);
            replaced += 1;
          } else {
            skipped += 1;
          }
        } else {
          byDate.set(record.date, record);
          added += 1;
        }
      });
      state.records = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    const saved = persist();
    state.range = chooseInitialRange();
    syncRangeButtons();
    resetEditing();
    els.weightInput.value = '';
    els.noteInput.value = '';
    els.dateInput.value = todayKey();
    clearFormError();
    renderAll();
    closeImportDialog();

    let message;
    if (mode === 'replace') {
      message = `已用 ${imported.length} 条记录替换原有数据`;
    } else {
      const parts = [`新增 ${added} 条`];
      if (replaced) parts.push(`覆盖 ${replaced} 条`);
      if (skipped) parts.push(`跳过 ${skipped} 条`);
      message = `已导入 ${imported.length} 条：${parts.join('，')}`;
    }
    if (parsed.invalid.length) {
      message += `，另有 ${parsed.invalid.length} 行格式有误未导入`;
    }
    toast(saved ? message : `${message}；浏览器存储不可用，刷新后会丢失`);
  }

  function handleImportConfirm() {
    const parsed = importState.parsed;
    if (!parsed) return;
    const mode = getImportMode();

    if (mode === 'replace' && state.records.length) {
      openConfirm({
        title: '替换全部记录？',
        message: `将删除现有 ${state.records.length} 条记录，并用导入的 ${parsed.records.length} 条记录替换，此操作无法撤销。`,
        confirmText: '替换并导入',
        onConfirm: () => applyImport('replace'),
      });
      return;
    }

    applyImport(mode);
  }

  /* ---------------- Toast ---------------- */

  let toastTimer = 0;

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove('show');
    }, 2800);
  }

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    els.entryForm.addEventListener('submit', handleSubmit);

    els.weightInput.addEventListener('input', clearFormError);
    els.dateInput.addEventListener('change', handleDateChange);
    els.noteInput.addEventListener('input', clearFormError);

    els.cancelEdit.addEventListener('click', cancelEditing);

    els.rangeSwitch.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-range]');
      if (!button) return;
      const value = button.dataset.range;
      state.range = value === 'all' ? 'all' : Number(value);
      syncRangeButtons();
      renderChart();
    });

    els.historyList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const { action, date } = button.dataset;
      if (action === 'edit' && date) startEdit(date);
      if (action === 'delete' && date) askDeleteRecord(date);
    });

    els.settingsBtn.addEventListener('click', openSettings);
    els.goalSettingsBtn.addEventListener('click', openSettings);
    els.exportBtn.addEventListener('click', exportCsv);
    els.footerExportBtn.addEventListener('click', exportCsv);
    els.settingsExportBtn.addEventListener('click', exportCsv);
    els.importBtn.addEventListener('click', openImportDialog);
    els.settingsImportBtn.addEventListener('click', openImportDialog);
    els.clearDataBtn.addEventListener('click', askClearAll);
    els.settingsForm.addEventListener('submit', handleSettingsSubmit);

    els.importDrop.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) handleImportFile(file);
      event.target.value = '';
    });

    ['dragenter', 'dragover'].forEach((type) => {
      els.importDrop.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        els.importDrop.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach((type) => {
      els.importDrop.addEventListener(type, () => {
        els.importDrop.classList.remove('is-dragover');
      });
    });
    els.importDrop.addEventListener('drop', (event) => {
      event.preventDefault();
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) handleImportFile(file);
    });
    els.importDialog.addEventListener('dragover', (event) => event.preventDefault());
    els.importDialog.addEventListener('drop', (event) => {
      if (!event.target.closest('#import-drop')) event.preventDefault();
    });

    els.importDialog.querySelectorAll('input[name="import-mode"]').forEach((input) => {
      input.addEventListener('change', updateImportPlan);
    });
    els.importConfirm.addEventListener('click', handleImportConfirm);
    els.importDialog.addEventListener('click', (event) => {
      if (event.target === els.importDialog || event.target.closest('[data-close-import]')) {
        closeImportDialog();
      }
    });
    els.importDialog.addEventListener('close', resetImportState);

    [els.heightInput, els.targetInput].forEach((input) => {
      input.addEventListener('input', () => {
        els.settingsError.textContent = '';
      });
    });

    els.settingsDialog.addEventListener('click', (event) => {
      if (event.target === els.settingsDialog || event.target.closest('[data-close]')) {
        els.settingsDialog.close();
      }
    });

    els.confirmCancel.addEventListener('click', () => els.confirmDialog.close());
    els.confirmOk.addEventListener('click', () => {
      const callback = state.pendingConfirm;
      state.pendingConfirm = null;
      els.confirmDialog.close();
      if (typeof callback === 'function') callback();
    });
    els.confirmDialog.addEventListener('close', () => {
      state.pendingConfirm = null;
    });
    els.confirmDialog.addEventListener('click', (event) => {
      if (event.target === els.confirmDialog) els.confirmDialog.close();
    });

    document.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'focus-entry') focusEntry();
      if (action.dataset.action === 'open-settings') openSettings();
    });

    els.chartWrap.addEventListener('pointermove', onChartPointerMove);
    els.chartWrap.addEventListener('pointerleave', hideChartTooltip);
    window.addEventListener('scroll', hideChartTooltip, { passive: true });

    window.addEventListener('storage', (event) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      loadState();
      renderAll();
      toast('已同步其他页面中的修改');
    });
  }

  function bindResize() {
    if (typeof ResizeObserver === 'function') {
      let frame = 0;
      const observer = new ResizeObserver(() => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          if (els.chartWrap.clientWidth > 0) renderChart();
        });
      });
      observer.observe(els.chartWrap);
    } else {
      window.addEventListener('resize', renderChart);
    }
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    state.storageOk = checkStorage();
    loadState();
    state.range = chooseInitialRange();

    els.dateInput.max = todayKey();
    els.dateInput.value = todayKey();
    setTodayText();
    syncRangeButtons();
    bindEvents();
    bindResize();
    renderAll();
    updateFormHint();
    updateEntryCopy();

    if (!state.storageOk) {
      window.setTimeout(() => toast('浏览器存储不可用，记录无法长期保存'), 700);
    }
  }

  init();
})();
