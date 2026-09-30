/* RandomPassword · 纯前端逻辑（普通脚本，非 ES Module，可在 file:// 下直接运行）
   规则对齐原 Python 脚本：大写随机 1–3 位 → 其余由小写 + 数字补齐 → 整体打乱。 */
(function () {
  'use strict';

  /* ============================================================
     1. 字符池常量（与上游 Python 源码逐一对应）
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

  var LIMITS = { minLength: 1, maxLength: 256, rangeMax: 128, maxBatch: 50, maxHistory: 20 };
  var STORAGE_KEY = 'randompassword.history.v1';

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
     3. 生成模块
     ============================================================ */
  /**
   * 生成一条密码。
   * @param {number} length 目标长度
   * @param {Object} options { upper, lower, digits, symbols } 布尔开关
   * @returns {string}
   */
  function generatePassword(length, options) {
    var enabled = [];
    for (var i = 0; i < POOLS.length; i++) {
      if (options[POOLS[i].key]) enabled.push(POOLS[i]);
    }
    if (!enabled.length) {
      var err = new Error('请至少启用一种字符类型');
      err.code = 'NO_CHARSET';
      throw err;
    }

    var len = Math.max(1, Math.floor(length));
    var chars = [];
    var upperPool = null;
    var fillPools = []; // 填充池：与原脚本一致，不含大写字母

    for (var k = 0; k < enabled.length; k++) {
      if (enabled[k].key === 'upper') upperPool = enabled[k];
      else fillPools.push(enabled[k]);
    }
    // 仅启用大写时，填充池退化为大写本身
    var fillSource = fillPools.length ? fillPools : (upperPool ? [upperPool] : []);
    var fillChars = fillSource.map(function (p) { return p.chars; }).join('');

    // 步骤一：沿用原脚本规则 —— 大写随机 1–3 位
    if (upperPool && len > 0) {
      var othersCount = fillPools.length;
      var maxUpper = Math.max(1, len - othersCount); // 给其他类型留出位置
      var want = randomInt(3) + 1;                   // 1 ~ 3
      var upperCount = Math.min(want, maxUpper, len);
      for (var u = 0; u < upperCount; u++) chars.push(pick(upperPool.chars));
    }

    // 步骤二：其余每种启用类型至少保留一位
    for (var t = 0; t < fillPools.length; t++) {
      if (chars.length >= len) break;
      chars.push(pick(fillPools[t].chars));
    }

    // 步骤三：剩余长度从填充池中随机取字符（允许重复）
    while (chars.length < len) chars.push(pick(fillChars));

    // 步骤四：整体打乱顺序
    return shuffle(chars).join('');
  }

  function generatePasswords(length, options, count) {
    var n = Math.max(1, Math.floor(count || 1));
    var out = [];
    for (var i = 0; i < n; i++) out.push(generatePassword(length, options));
    return out;
  }

  /* ============================================================
     4. 评估模块 —— 熵与强度分级
     ============================================================ */
  function poolSizeOf(options) {
    var size = 0;
    for (var i = 0; i < POOLS.length; i++) {
      if (options[POOLS[i].key]) size += POOLS[i].chars.length;
    }
    return size;
  }

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
     5. 存储模块 —— localStorage，失败降级为内存
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
     6. DOM 引用与工具
     ============================================================ */
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    password: $('password'),
    heroStatus: $('hero-status'),
    strengthBar: $('strength-bar'),
    strengthLabel: $('strength-label'),
    entropyLabel: $('entropy-label'),
    btnGenerate: $('btn-generate'),
    btnCopy: $('btn-copy'),
    copyStatus: $('copy-status'),
    length: $('length'),
    lengthRange: $('length-range'),
    lengthHint: $('length-hint'),
    charsetHint: $('charset-hint'),
    switches: document.querySelectorAll('.switch input[data-pool]'),
    switchWrap: document.querySelector('.switches'),
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

  function readOptions() {
    var options = {};
    for (var i = 0; i < POOLS.length; i++) {
      var input = document.getElementById('opt-' + POOLS[i].key);
      options[POOLS[i].key] = !!(input && input.checked);
    }
    return options;
  }

  function readLength() {
    var raw = parseInt(el.length.value, 10);
    if (!isFinite(raw)) raw = 16;
    return Math.min(LIMITS.maxLength, Math.max(LIMITS.minLength, raw));
  }

  function readBatchCount() {
    var raw = parseInt(el.batchCount.value, 10);
    if (!isFinite(raw)) raw = 1;
    return Math.min(LIMITS.maxBatch, Math.max(1, raw));
  }

  /* ============================================================
     7. 渲染模块
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

  function renderStrength() {
    var length = readLength();
    var options = readOptions();
    var size = poolSizeOf(options);
    var bits = calcEntropy(length, size);
    var grade = getStrength(bits);

    if (el.strengthBar) {
      el.strengthBar.style.width = (lastPassword ? grade.percent : 0) + '%';
      el.strengthBar.setAttribute('data-level', lastPassword ? grade.level : '');
    }
    if (el.strengthLabel) {
      el.strengthLabel.textContent = lastPassword ? '强度 ' + grade.label : '强度 —';
    }
    if (el.entropyLabel) {
      el.entropyLabel.textContent = lastPassword
        ? '熵 ' + bits.toFixed(1) + ' bit · 字符池 ' + size
        : '熵 —';
    }
  }

  function renderHeroStatus(text, isError) {
    if (!el.heroStatus) return;
    el.heroStatus.textContent = text;
    el.heroStatus.className = isError ? 'is-error' : '';
  }

  function createListItem(value, time, extraClass) {
    var li = document.createElement('li');
    li.className = 'list__item' + (extraClass ? ' ' + extraClass : '');

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
     8. 复制模块 —— clipboard API + execCommand 回退
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
     9. 交互模块
     ============================================================ */
  function validateCharset() {
    var options = readOptions();
    var enabled = POOLS.filter(function (p) { return options[p.key]; });
    if (!enabled.length) {
      if (el.switchWrap) {
        el.switchWrap.classList.remove('is-invalid');
        void el.switchWrap.offsetWidth;
        el.switchWrap.classList.add('is-invalid');
        window.setTimeout(function () { el.switchWrap.classList.remove('is-invalid'); }, 400);
      }
      setHint(el.charsetHint, '至少要启用一种字符类型。', 'error');
      return null;
    }
    setHint(el.charsetHint, '已启用：' + enabled.map(function (p) { return p.label; }).join('、') +
      ' · 规则对齐原 Python 脚本（大写随机 1–3 位，其余补齐后整体打乱）。', null);
    return options;
  }

  function doGenerate() {
    var options = validateCharset();
    if (!options) {
      showToast('请至少启用一种字符类型', 'error');
      return;
    }
    var length = readLength();
    var value;
    try {
      value = generatePassword(length, options);
    } catch (e) {
      showToast(e.message || '生成失败', 'error');
      return;
    }
    lastPassword = value;
    renderPassword(value, true);
    renderStrength();
    renderHeroStatus('已生成 · ' + length + ' 位 · ' + new Date().toLocaleTimeString(), false);
    if (el.copyStatus) {
      el.copyStatus.textContent = '';
      el.copyStatus.className = 'hint';
    }
    addHistory(value);
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
    var options = validateCharset();
    if (!options) {
      showToast('请至少启用一种字符类型', 'error');
      return;
    }
    var length = readLength();
    var count = readBatchCount();
    if (el.batchCount) el.batchCount.value = String(count);

    var values;
    try {
      values = generatePasswords(length, options, count);
    } catch (e) {
      showToast(e.message || '批量生成失败', 'error');
      return;
    }

    var frag = document.createDocumentFragment();
    for (var i = 0; i < values.length; i++) {
      frag.appendChild(createListItem(values[i], null));
      addHistory(values[i]);
    }
    el.batchList.innerHTML = '';
    el.batchList.appendChild(frag);
    renderHistory();
    setHint(el.batchHint, '已生成 ' + values.length + ' 条 · ' + length + ' 位', 'ok');
  }

  function syncLength(source) {
    var value;
    if (source === 'range') {
      value = parseInt(el.lengthRange.value, 10);
      if (el.length) el.length.value = String(value);
    } else {
      value = readLength();
      if (el.length) el.length.value = String(value);
      if (el.lengthRange) el.lengthRange.value = String(Math.min(value, LIMITS.rangeMax));
    }
    if (el.lengthHint) {
      el.lengthHint.textContent = '范围 ' + LIMITS.minLength + ' – ' + LIMITS.maxLength +
        ' · 当前 ' + value;
      el.lengthHint.className = 'hint';
    }
    renderStrength();
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
     10. 事件绑定与初始化
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

    if (el.lengthRange) {
      el.lengthRange.addEventListener('input', function () { syncLength('range'); });
    }
    if (el.length) {
      el.length.addEventListener('input', function () { syncLength('number'); });
      el.length.addEventListener('blur', function () {
        el.length.value = String(readLength());
        syncLength('number');
      });
      el.length.addEventListener('keydown', function (e) {
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

    for (var i = 0; i < el.switches.length; i++) {
      el.switches[i].addEventListener('change', function () {
        var options = validateCharset();
        if (options && lastPassword) doGenerate();
        else renderStrength();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) doGenerate();
    });
  }

  function init() {
    renderPassword('点击「生成」开始', false);
    if (el.password) el.password.classList.add('is-placeholder');
    bindEvents();
    syncLength('number');
    validateCharset();
    renderHistory();
    renderStrength();
    renderHeroStatus('已就绪 · 本地生成，无网络请求', false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
