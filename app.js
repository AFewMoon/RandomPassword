/* RandomPassword · 纯前端逻辑（普通脚本，非 ES Module，可在 file:// 下直接运行）

   生成模型：每类字符集各自指定数量（固定）或数量区间（随机），
   各类取满自己的部分后合并，最后整体随机排列。
   总长 = 各类数量之和，并与总长输入框双向同步。 */
(function () {
  'use strict';

  /* ============================================================
     1. 字符池常量
     ============================================================ */
  var UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var LOWER = 'abcdefghijklmnopqrstuvwxyz';
  var DIGITS = '0123456789';
  var SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/~';

  var POOLS = [
    { key: 'upper', chars: UPPER, label: '大写字母' },
    { key: 'lower', chars: LOWER, label: '小写字母' },
    { key: 'digits', chars: DIGITS, label: '数字' },
    { key: 'symbols', chars: SYMBOLS, label: '符号' }
  ];

  var LIMITS = {
    maxCount: 256,   // 单类数量上限
    maxTotal: 1024,  // 总长上限（= 4 类各自上限之和）
    maxBatch: 50,
    maxHistory: 20,
    modeBump: 2      // 固定 → 随机 时给出的浮动空间
  };

  var STORAGE_KEY = 'randompassword.history.v1';
  var HINT_DEFAULT = '骰子 = 每次生成在该区间内随机取数量，锁 = 每次固定取该数量（数量为 0 即不参与）。';
  var HINT_ERROR = '至少要保留 1 个字符：请让任意一类的上限大于 0。';

  /* ============================================================
     2. 随机数模块 —— crypto 优先，拒绝采样消除取模偏差
     ============================================================ */
  var hasCrypto = typeof window !== 'undefined' &&
    window.crypto && typeof window.crypto.getRandomValues === 'function';

  var UINT32_RANGE = 4294967296; // 2^32

  /** 返回 [0, maxExclusive) 内的均匀随机整数 */
  function randomInt(maxExclusive) {
    if (!(maxExclusive > 0)) {
      throw new RangeError('randomInt: maxExclusive 必须大于 0');
    }
    if (!hasCrypto) {
      return Math.floor(Math.random() * maxExclusive);
    }
    // 拒绝采样：丢弃落入尾部不完整区间的样本，保证等概率
    var limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    var buf = new Uint32Array(1);
    var value;
    do {
      window.crypto.getRandomValues(buf);
      value = buf[0];
    } while (value >= limit);
    return value % maxExclusive;
  }

  /** 从给定字符池中随机取一个字符 */
  function pick(pool) {
    return pool.charAt(randomInt(pool.length));
  }

  /** Fisher-Yates 原地洗牌 */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /* ============================================================
     3. 配置模型
     每类配置为 { mode: 'fixed' | 'random', min, max }；
     mode 为 fixed 时恒有 min === max（即「数量」），
     mode 为 random 时 min ≤ max 表示区间。
     ============================================================ */
  var $ = function (id) { return document.getElementById(id); };

  function toInt(raw, fallback) {
    var n = parseInt(raw, 10);
    return isFinite(n) ? Math.floor(n) : fallback;
  }

  function clampInt(n, min, max) {
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function rowOf(key) {
    return document.querySelector('.charset-row[data-pool="' + key + '"]');
  }

  function modeOf(key) {
    var btn = $(key + '-mode');
    return btn && btn.getAttribute('aria-pressed') === 'true' ? 'random' : 'fixed';
  }

  /** 读取当前配置并归一化（fixed 时 max = min；random 时 max ≥ min；空值按 0） */
  function getConfig() {
    var cfg = {};
    for (var i = 0; i < POOLS.length; i++) {
      var key = POOLS[i].key;
      var minEl = $(key + '-min');
      var maxEl = $(key + '-max');
      var mode = modeOf(key);
      var lo = clampInt(toInt(minEl && minEl.value, 0), 0, LIMITS.maxCount);
      var hi = clampInt(toInt(maxEl && maxEl.value, 0), 0, LIMITS.maxCount);
      if (mode === 'fixed') {
        hi = lo;
      } else if (hi < lo) {
        hi = lo;
      }
      cfg[key] = { mode: mode, min: lo, max: hi };
    }
    return cfg;
  }

  /** 把配置写回界面（含模式按钮状态与无障碍标签） */
  function writeConfig(cfg) {
    for (var i = 0; i < POOLS.length; i++) {
      var pool = POOLS[i];
      var key = pool.key;
      var t = cfg[key];
      var minEl = $(key + '-min');
      var maxEl = $(key + '-max');
      var btn = $(key + '-mode');
      var row = rowOf(key);
      var isRandom = t.mode === 'random';

      if (minEl) minEl.value = String(t.min);
      if (maxEl) maxEl.value = String(t.max);
      if (btn) {
        btn.setAttribute('aria-pressed', isRandom ? 'true' : 'false');
        btn.setAttribute('aria-label', pool.label +
          (isRandom ? '：随机数量，点击切换为固定数量' : '：固定数量，点击切换为随机区间'));
      }
      if (row) {
        if (isRandom) row.classList.remove('is-fixed');
        else row.classList.add('is-fixed');
      }
      if (minEl) minEl.setAttribute('aria-label', pool.label + (isRandom ? '最小数量' : '数量'));
      if (maxEl) maxEl.setAttribute('aria-label', pool.label + '最大数量');
    }
  }

  /** 该类的代表值：固定取数量，随机取区间上限 */
  function representative(t) {
    return t.max;
  }

  function sumBy(cfg, field) {
    var sum = 0;
    for (var i = 0; i < POOLS.length; i++) sum += cfg[POOLS[i].key][field];
    return sum;
  }

  /* ============================================================
     4. 生成模块
     ============================================================ */
  /**
   * 生成一条密码：先定各类数量，再逐类取字符，最后整体随机排列。
   * @returns {{value: string, poolSize: number, counts: Object}}
   */
  function generatePassword(cfg) {
    var parts = [];
    var counts = {};
    var poolSize = 0;

    for (var i = 0; i < POOLS.length; i++) {
      var pool = POOLS[i];
      var t = cfg[pool.key];
      var n = t.mode === 'random'
        ? randomInt(t.max - t.min + 1) + t.min
        : t.min;
      counts[pool.key] = n;
      if (n <= 0) continue;
      poolSize += pool.chars.length;
      for (var k = 0; k < n; k++) parts.push(pick(pool.chars));
    }

    if (!parts.length) {
      var err = new Error('请至少保留 1 个字符');
      err.code = 'NO_CHARSET';
      throw err;
    }
    if (parts.length > LIMITS.maxTotal) {
      var over = new Error('总长超出上限 ' + LIMITS.maxTotal);
      over.code = 'TOO_LONG';
      throw over;
    }

    return { value: shuffle(parts).join(''), poolSize: poolSize, counts: counts };
  }

  function generatePasswords(cfg, count) {
    var n = Math.max(1, Math.floor(count || 1));
    var out = [];
    for (var i = 0; i < n; i++) out.push(generatePassword(cfg));
    return out;
  }

  /** 校验配置是否能产出至少一个字符 */
  function validateConfig(cfg) {
    for (var i = 0; i < POOLS.length; i++) {
      var t = cfg[POOLS[i].key];
      if (representative(t) > 0) return null;
    }
    return HINT_ERROR;
  }

  /* ============================================================
     5. 评估模块 —— 熵与强度分级
     ============================================================ */
  function calcEntropy(length, poolSize) {
    if (poolSize <= 1 || length <= 0) return 0;
    return length * (Math.log(poolSize) / Math.LN2);
  }

  function getStrength(bits) {
    if (bits < 36) return { level: 'weak', label: '弱', percent: 25 };
    if (bits < 64) return { level: 'fair', label: '中', percent: 50 };
    if (bits < 90) return { level: 'good', label: '强', percent: 75 };
    return { level: 'strong', label: '极强', percent: 100 };
  }

  /* ============================================================
     6. 存储模块 —— localStorage，失败降级为内存
     ============================================================ */
  var memoryHistory = [];
  var storageOk = (function () {
    try {
      var probe = '__rp_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function loadHistory() {
    if (!storageOk) return memoryHistory.slice();
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data)) return [];
      return data.filter(function (item) {
        return item && typeof item.value === 'string';
      });
    } catch (e) {
      return memoryHistory.slice();
    }
  }

  function saveHistory(list) {
    memoryHistory = list.slice();
    if (!storageOk) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      storageOk = false;
    }
  }

  function addHistory(value) {
    if (!value) return;
    var list = loadHistory().filter(function (item) { return item.value !== value; });
    list.unshift({ value: value, time: Date.now() });
    saveHistory(list.slice(0, LIMITS.maxHistory));
  }

  function clearStoredHistory() {
    memoryHistory = [];
    if (storageOk) {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 忽略 */ }
    }
  }

  /* ============================================================
     7. DOM 引用与提示
     ============================================================ */
  var el = {
    password: $('password'),
    heroStatus: $('hero-status'),
    strengthBar: $('strength-bar'),
    strengthLabel: $('strength-label'),
    entropyLabel: $('entropy-label'),
    btnGenerate: $('btn-generate'),
    btnCopy: $('btn-copy'),
    copyStatus: $('copy-status'),
    total: $('total-length'),
    totalBadge: $('total-badge'),
    charsets: $('charsets'),
    charsetHint: $('charset-hint'),
    batchCount: $('batch-count'),
    btnBatch: $('btn-batch'),
    batchList: $('batch-list'),
    batchHint: $('batch-hint'),
    historyList: $('history-list'),
    historyCount: $('history-count'),
    historyEmpty: $('history-empty'),
    btnClearHistory: $('btn-clear-history'),
    toast: $('toast')
  };

  var lastPassword = '';
  var toastTimer = null;

  function showToast(message, type) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.className = 'toast is-show' + (type ? ' is-' + type : '');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.toast.className = 'toast';
    }, 2200);
  }

  function setHint(node, text, type) {
    if (!node) return;
    node.textContent = text;
    node.className = 'hint' + (type ? ' is-' + type : '');
  }

  function readBatchCount() {
    var raw = parseInt(el.batchCount.value, 10);
    if (!isFinite(raw)) raw = 1;
    return clampInt(raw, 1, LIMITS.maxBatch);
  }

  /* ============================================================
     8. 渲染模块
     ============================================================ */
  function renderPassword(value, animate) {
    if (!el.password) return;
    el.password.textContent = value;
    el.password.className = 'hero__password';
    if (animate) {
      void el.password.offsetWidth; // 触发重排以重放动画
      el.password.classList.add('is-fresh');
    }
  }

  function renderStrength(result) {
    if (!el.strengthBar) return;
    if (!result || !result.value) {
      el.strengthBar.style.width = '0%';
      el.strengthBar.setAttribute('data-level', '');
      if (el.strengthLabel) el.strengthLabel.textContent = '强度 —';
      if (el.entropyLabel) el.entropyLabel.textContent = '熵 —';
      return;
    }
    var bits = calcEntropy(result.value.length, result.poolSize);
    var grade = getStrength(bits);
    el.strengthBar.style.width = grade.percent + '%';
    el.strengthBar.setAttribute('data-level', grade.level);
    if (el.strengthLabel) el.strengthLabel.textContent = '强度 ' + grade.label;
    if (el.entropyLabel) {
      el.entropyLabel.textContent = '熵 ' + bits.toFixed(1) + ' bit · 字符池 ' + result.poolSize;
    }
  }

  function renderHeroStatus(text, isError) {
    if (!el.heroStatus) return;
    el.heroStatus.textContent = text;
    el.heroStatus.className = isError ? 'is-error' : '';
  }

  var COUNTS_ORDER = ['upper', 'lower', 'digits', 'symbols'];

  function countsSummary(counts) {
    return COUNTS_ORDER.map(function (key) { return counts[key]; }).join('/');
  }

  function renderTotalBadge(cfg) {
    if (!el.totalBadge) return;
    var lo = sumBy(cfg, 'min');
    var hi = sumBy(cfg, 'max');
    var allFixed = lo === hi;
    el.totalBadge.textContent = allFixed ? '固定 ' + hi : '实际总长 ' + lo + ' – ' + hi;
    el.totalBadge.className = 'badge' + (allFixed ? '' : ' is-live');
  }

  /** 各类 → 总长：把总长输入同步为各类代表值之和 */
  function syncTotalFromConfig(cfg) {
    if (el.total) el.total.value = String(sumBy(cfg, 'max'));
    renderTotalBadge(cfg);
  }

  function createListItem(value, time) {
    var li = document.createElement('li');
    li.className = 'list__item';

    var span = document.createElement('span');
    span.className = 'list__value';
    span.textContent = value;

    if (time) {
      var timeEl = document.createElement('span');
      timeEl.className = 'list__time';
      timeEl.textContent = formatTime(time);
      li.appendChild(timeEl);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list__copy';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制该密码');
    btn.addEventListener('click', function () {
      copyText(value).then(function (ok) {
        if (ok) {
          btn.textContent = '已复制';
          btn.classList.add('is-done');
          window.setTimeout(function () {
            btn.textContent = '复制';
            btn.classList.remove('is-done');
          }, 1400);
        } else {
          showToast('复制失败，请手动选中', 'error');
        }
      });
    });

    li.insertBefore(span, li.firstChild);
    li.appendChild(btn);
    return li;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function renderHistory() {
    if (!el.historyList) return;
    var list = loadHistory();
    el.historyList.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      el.historyList.appendChild(createListItem(list[i].value, list[i].time));
    }
    if (el.historyCount) el.historyCount.textContent = String(list.length);
    if (el.historyEmpty) el.historyEmpty.hidden = list.length > 0;
  }

  /* ============================================================
     9. 复制模块 —— clipboard API + execCommand 回退
     ============================================================ */
  function copyText(text) {
    if (!text) return Promise.resolve(false);

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    var ok = false;
    try {
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  /* ============================================================
     10. 总长 → 各类：按占比分配，随机类区间等比缩放
     ============================================================ */
  function applyTotal(target) {
    var cfg = getConfig();
    var n = clampInt(Math.floor(target), 0, LIMITS.maxTotal);

    var weights = [];
    var sumW = 0;
    for (var i = 0; i < POOLS.length; i++) {
      var w = representative(cfg[POOLS[i].key]);
      weights.push(w);
      sumW += w;
    }
    if (sumW <= 0) {
      // 全为 0 时退化为均分
      for (var j = 0; j < weights.length; j++) weights[j] = 1;
      sumW = weights.length;
    }

    var alloc = [];
    var used = 0;
    for (var k = 0; k < weights.length; k++) {
      var share = Math.floor(n * weights[k] / sumW);
      alloc.push(share);
      used += share;
    }

    // 舍入余数（可能为正也可能为负）补到小写类；小写不可用时补到第一个非零类
    var remainder = n - used;
    if (remainder !== 0) {
      var targetIdx = -1;
      for (var a = 0; a < POOLS.length; a++) {
        if (POOLS[a].key === 'lower' && alloc[a] > 0) { targetIdx = a; break; }
      }
      if (targetIdx < 0) {
        for (var b = 0; b < POOLS.length; b++) {
          if (alloc[b] > 0) { targetIdx = b; break; }
        }
      }
      if (targetIdx < 0) {
        for (var c = 0; c < POOLS.length; c++) {
          if (POOLS[c].key === 'lower') { targetIdx = c; break; }
        }
      }
      if (targetIdx < 0) targetIdx = 0;
      alloc[targetIdx] = Math.max(0, alloc[targetIdx] + remainder);
    }

    for (var m = 0; m < POOLS.length; m++) {
      var key = POOLS[m].key;
      var t = cfg[key];
      var value = clampInt(alloc[m], 0, LIMITS.maxCount);
      if (t.mode === 'fixed') {
        t.min = value;
        t.max = value;
      } else {
        var oldMax = t.max;
        t.max = value;
        t.min = oldMax > 0 ? clampInt(Math.round(t.min * value / oldMax), 0, value) : 0;
      }
    }

    writeConfig(cfg);
    syncTotalFromConfig(cfg);
  }

  /* ============================================================
     11. 交互模块
     ============================================================ */
  function invalidateConfig(message) {
    if (el.charsets) {
      el.charsets.classList.remove('is-invalid');
      void el.charsets.offsetWidth;
      el.charsets.classList.add('is-invalid');
      window.setTimeout(function () { el.charsets.classList.remove('is-invalid'); }, 400);
    }
    setHint(el.charsetHint, message || HINT_ERROR, 'error');
  }

  function doGenerate() {
    var cfg = getConfig();
    var problem = validateConfig(cfg);
    if (problem) {
      invalidateConfig(problem);
      showToast('请至少保留 1 个字符', 'error');
      return;
    }
    setHint(el.charsetHint, HINT_DEFAULT, null);

    var result;
    try {
      result = generatePassword(cfg);
    } catch (e) {
      showToast(e.message || '生成失败', 'error');
      return;
    }

    lastPassword = result.value;
    renderPassword(result.value, true);
    renderStrength(result);
    renderHeroStatus('已生成 · ' + result.value.length + ' 位 · ' + countsSummary(result.counts) +
      ' · ' + new Date().toLocaleTimeString(), false);
    if (el.copyStatus) {
      el.copyStatus.textContent = '';
      el.copyStatus.className = 'hint';
    }
    addHistory(result.value);
    renderHistory();
  }

  function doCopy() {
    if (!lastPassword) {
      showToast('还没有可复制的密码', 'error');
      return;
    }
    copyText(lastPassword).then(function (ok) {
      if (ok) {
        if (el.password) {
          el.password.classList.add('is-copied');
          window.setTimeout(function () { el.password.classList.remove('is-copied'); }, 600);
        }
        if (el.copyStatus) {
          el.copyStatus.textContent = '已复制到剪贴板';
          el.copyStatus.className = 'hint is-ok';
        }
        showToast('已复制', 'ok');
      } else {
        showToast('复制失败，请手动选中', 'error');
      }
    });
  }

  function doBatch() {
    var cfg = getConfig();
    var problem = validateConfig(cfg);
    if (problem) {
      invalidateConfig(problem);
      showToast('请至少保留 1 个字符', 'error');
      return;
    }

    var count = readBatchCount();
    if (el.batchCount) el.batchCount.value = String(count);

    var results;
    try {
      results = generatePasswords(cfg, count);
    } catch (e) {
      showToast(e.message || '批量生成失败', 'error');
      return;
    }

    var frag = document.createDocumentFragment();
    var minLen = results[0].value.length;
    var maxLen = minLen;
    for (var i = 0; i < results.length; i++) {
      var len = results[i].value.length;
      if (len < minLen) minLen = len;
      if (len > maxLen) maxLen = len;
      frag.appendChild(createListItem(results[i].value, null));
      addHistory(results[i].value);
    }
    el.batchList.innerHTML = '';
    el.batchList.appendChild(frag);
    renderHistory();
    setHint(el.batchHint, '已生成 ' + results.length + ' 条 · 长度 ' +
      (minLen === maxLen ? String(minLen) : minLen + '–' + maxLen), 'ok');
  }

  /** 单行数量输入：归一化本行，并同步总长 */
  function onRowInput(key, role) {
    var cfg = getConfig();
    var t = cfg[key];
    var minEl = $(key + '-min');
    var maxEl = $(key + '-max');

    if (t.mode === 'fixed') {
      if (role === 'min') { if (maxEl) maxEl.value = String(t.min); }
      else if (minEl) minEl.value = String(t.max);
    } else {
      // 只在越界时回写另一个输入框，避免打断正在输入的字段
      if (role === 'min' && minEl && minEl.value !== '' && t.max < t.min && maxEl) {
        maxEl.value = String(t.min);
      } else if (role === 'max' && maxEl && maxEl.value !== '' && t.max < t.min && minEl) {
        minEl.value = String(t.max);
      }
    }
    syncTotalFromConfig(cfg);
  }

  function onTotalInput() {
    if (!el.total) return;
    if (el.total.value === '') return; // 正在清空输入，不打断
    var n = toInt(el.total.value, 0);
    applyTotal(n);
    setHint(el.charsetHint, HINT_DEFAULT, null);
  }

  /** 切换某一类的固定 / 随机模式 */
  function toggleMode(key) {
    var cfg = getConfig();
    var t = cfg[key];
    if (t.mode === 'random') {
      t.mode = 'fixed';
      t.max = t.min; // 固定值取区间下限
    } else {
      t.mode = 'random';
      t.max = clampInt(t.min + LIMITS.modeBump, 0, LIMITS.maxCount);
    }
    writeConfig(cfg);
    syncTotalFromConfig(cfg);
    renderTotalBadge(cfg);
  }

  function clearHistory() {
    var list = loadHistory();
    if (!list.length) {
      showToast('历史记录已为空');
      return;
    }
    if (el.btnClearHistory.dataset.confirm !== '1') {
      el.btnClearHistory.dataset.confirm = '1';
      el.btnClearHistory.textContent = '确认清除？';
      window.setTimeout(function () {
        el.btnClearHistory.dataset.confirm = '0';
        el.btnClearHistory.textContent = '清除历史';
      }, 3000);
      return;
    }
    el.btnClearHistory.dataset.confirm = '0';
    el.btnClearHistory.textContent = '清除历史';
    clearStoredHistory();
    renderHistory();
    showToast('历史记录已清空', 'ok');
  }

  /* ============================================================
     12. 事件绑定与初始化
     ============================================================ */
  function bindEvents() {
    if (el.btnGenerate) el.btnGenerate.addEventListener('click', doGenerate);
    if (el.btnCopy) el.btnCopy.addEventListener('click', doCopy);
    if (el.btnBatch) el.btnBatch.addEventListener('click', doBatch);
    if (el.btnClearHistory) el.btnClearHistory.addEventListener('click', clearHistory);

    if (el.password) {
      el.password.addEventListener('click', function () {
        if (!lastPassword) return;
        if (window.getSelection) {
          var sel = window.getSelection();
          var range = document.createRange();
          range.selectNodeContents(el.password);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    }

    // 每类：数量输入 + 模式切换
    for (var i = 0; i < POOLS.length; i++) {
      (function (key) {
        var minEl = $(key + '-min');
        var maxEl = $(key + '-max');
        var btn = $(key + '-mode');
        if (minEl) {
          minEl.addEventListener('input', function () { onRowInput(key, 'min'); });
          minEl.addEventListener('blur', function () { onRowInput(key, 'min'); });
        }
        if (maxEl) {
          maxEl.addEventListener('input', function () { onRowInput(key, 'max'); });
          maxEl.addEventListener('blur', function () { onRowInput(key, 'max'); });
        }
        if (btn) {
          btn.addEventListener('click', function () {
            toggleMode(key);
            setHint(el.charsetHint, HINT_DEFAULT, null);
          });
        }
      })(POOLS[i].key);
    }

    if (el.total) {
      el.total.addEventListener('input', onTotalInput);
      el.total.addEventListener('blur', function () {
        var cfg = getConfig();
        syncTotalFromConfig(cfg);
      });
      el.total.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doGenerate();
      });
    }

    if (el.batchCount) {
      el.batchCount.addEventListener('blur', function () {
        el.batchCount.value = String(readBatchCount());
      });
      el.batchCount.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doBatch();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) doGenerate();
    });
  }

  function init() {
    renderPassword('点击「生成」开始', false);
    if (el.password) el.password.classList.add('is-placeholder');

    var cfg = getConfig();
    writeConfig(cfg);
    syncTotalFromConfig(cfg);
    setHint(el.charsetHint, HINT_DEFAULT, null);

    bindEvents();
    renderHistory();
    renderStrength(null);
    renderHeroStatus('已就绪 · 本地生成，无网络请求', false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
