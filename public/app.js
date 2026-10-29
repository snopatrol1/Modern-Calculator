(() => {
  const resultEl = document.getElementById('result');
  const exprEl = document.getElementById('expression');
  const keysEl = document.getElementById('keys');
  const clearKey = document.getElementById('clearKey');
  const themeToggle = document.getElementById('themeToggle');

  const MAX_DIGITS = 15;
  const SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };

  let tokens = [];      // alternating number strings and operators
  let current = '0';    // number being typed ('' right after an operator)
  let justEvaluated = false;
  let error = false;

  // --- Math ---------------------------------------------------------------

  const tidy = (n) => parseFloat(n.toPrecision(12));

  function evaluate(list) {
    const out = [];
    const ops = [];
    const apply = () => {
      const b = out.pop();
      const a = out.pop();
      const op = ops.pop();
      if (op === '/' && b === 0) throw new Error('div0');
      out.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
    };
    for (const t of list) {
      if (t in PRECEDENCE) {
        while (ops.length && PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[t]) apply();
        ops.push(t);
      } else {
        out.push(parseFloat(t));
      }
    }
    while (ops.length) apply();
    const v = tidy(out[0]);
    if (!Number.isFinite(v)) throw new Error('overflow');
    return v;
  }

  // --- Formatting ---------------------------------------------------------

  const grouper = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  function formatTyped(str) {
    if (str === '' || str === '-') return str || '0';
    const neg = str.startsWith('-');
    const [int, frac] = (neg ? str.slice(1) : str).split('.');
    const grouped = grouper.format(BigInt(int || '0'));
    return (neg ? '−' : '') + grouped + (frac !== undefined ? '.' + frac : '');
  }

  function formatNumber(n) {
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) {
      return n.toExponential(6).replace(/\.?0+e/, 'e').replace('-', '−');
    }
    return formatTyped(String(n));
  }

  const toStr = (n) => {
    const abs = Math.abs(n);
    return abs !== 0 && (abs >= 1e15 || abs < 1e-6) ? n.toExponential() : String(n);
  };

  const exprText = (list) =>
    list.map((t) => (t in SYMBOLS ? ` ${SYMBOLS[t]} ` : formatNumber(parseFloat(t)))).join('');

  // --- Rendering ----------------------------------------------------------

  function fitResult() {
    const box = resultEl.parentElement;
    let size = window.innerHeight < 520 && window.matchMedia('(orientation: landscape)').matches ? 56 : 76;
    resultEl.style.setProperty('--result-size', size + 'px');
    const max = box.clientWidth - 12;
    while (resultEl.scrollWidth > max && size > 24) {
      size -= 2;
      resultEl.style.setProperty('--result-size', size + 'px');
    }
  }

  function render({ animate = false } = {}) {
    let text;
    if (error) {
      text = 'Undefined';
    } else if (current !== '') {
      text = /e/.test(current) ? formatNumber(parseFloat(current)) : formatTyped(current);
    } else {
      // Mid-expression: preview what's been entered so far
      try { text = formatNumber(evaluate(tokens.slice(0, -1))); } catch { text = '0'; }
    }
    resultEl.textContent = text;
    resultEl.classList.toggle('error', error);

    if (!justEvaluated) {
      exprEl.innerHTML = tokens.length ? escape(exprText(tokens)) : '&nbsp;';
    }

    const pendingOp = current === '' ? tokens[tokens.length - 1] : null;
    keysEl.querySelectorAll('.op').forEach((k) => k.classList.toggle('active', k.dataset.op === pendingOp));

    clearKey.textContent = current !== '' && current !== '0' && !justEvaluated && !error ? 'C' : 'AC';

    if (animate) {
      resultEl.classList.remove('pop');
      void resultEl.offsetWidth;
      resultEl.classList.add('pop');
    }
    fitResult();
  }

  const escape = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // --- Actions ------------------------------------------------------------

  function resetIfDone() {
    if (justEvaluated || error) {
      tokens = [];
      current = '0';
      justEvaluated = false;
      error = false;
      exprEl.innerHTML = '&nbsp;';
    }
  }

  function inputDigit(d) {
    resetIfDone();
    if (current.replace(/[-.]/g, '').length >= MAX_DIGITS) return;
    if (current === '0') current = d;
    else if (current === '-0') current = '-' + d;
    else current += d;
  }

  function inputDecimal() {
    resetIfDone();
    if (current === '') current = '0';
    if (!current.includes('.')) current += '.';
  }

  function inputOperator(op) {
    if (error) return;
    justEvaluated = false;
    if (current === '') {
      if (tokens.length) tokens[tokens.length - 1] = op;
      else tokens.push('0', op);
    } else {
      tokens.push(normalize(current), op);
      current = '';
    }
  }

  function equals() {
    if (error) return;
    if (justEvaluated) return;
    const list = [...tokens];
    if (current === '') list.pop();
    else list.push(normalize(current));
    if (list.length < 3) return;
    exprEl.textContent = exprText(list) + ' =';
    try {
      current = toStr(evaluate(list));
    } catch {
      error = true;
      current = '0';
    }
    tokens = [];
    justEvaluated = true;
  }

  function clear() {
    if (clearKey.textContent === 'C') {
      current = tokens.length ? '' : '0';
    } else {
      tokens = [];
      current = '0';
      error = false;
      justEvaluated = false;
      exprEl.innerHTML = '&nbsp;';
    }
  }

  function negate() {
    if (error) return;
    if (current === '') current = '-0';
    else current = current.startsWith('-') ? current.slice(1) : '-' + current;
    if (justEvaluated) { justEvaluated = false; exprEl.innerHTML = '&nbsp;'; }
  }

  function percent() {
    if (error || current === '') return;
    let value = parseFloat(current) / 100;
    // "200 + 10%" means 10% of 200, like a desk calculator
    const op = tokens[tokens.length - 1];
    if (op === '+' || op === '-') {
      try { value = evaluate(tokens.slice(0, -1)) * value; } catch { /* keep plain percent */ }
    }
    current = toStr(tidy(value));
    if (justEvaluated) { justEvaluated = false; exprEl.innerHTML = '&nbsp;'; }
  }

  function backspace() {
    if (justEvaluated || error || current === '') return;
    current = current.slice(0, -1);
    if (current === '' || current === '-') current = tokens.length ? '' : '0';
  }

  const normalize = (s) => (s.endsWith('.') ? s.slice(0, -1) : s) || '0';

  // --- Wiring -------------------------------------------------------------

  function handle(key) {
    const { digit, op, action } = key.dataset;
    if (digit !== undefined) inputDigit(digit);
    else if (op) inputOperator(op);
    else if (action === 'decimal') inputDecimal();
    else if (action === 'equals') equals();
    else if (action === 'clear') clear();
    else if (action === 'negate') negate();
    else if (action === 'percent') percent();
    else if (action === 'backspace') backspace();
    render({ animate: action === 'equals' });
  }

  keysEl.addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if (key) handle(key);
  });

  const KEYMAP = {
    Enter: '[data-action="equals"]', '=': '[data-action="equals"]',
    Escape: '[data-action="clear"]', Delete: '[data-action="clear"]',
    Backspace: '[data-action="backspace"]',
    '.': '[data-action="decimal"]', ',': '[data-action="decimal"]',
    '%': '[data-action="percent"]',
    '+': '[data-op="+"]', '-': '[data-op="-"]', '*': '[data-op="*"]', x: '[data-op="*"]', '/': '[data-op="/"]',
  };

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const selector = /^\d$/.test(e.key) ? `[data-digit="${e.key}"]` : KEYMAP[e.key];
    if (!selector) return;
    e.preventDefault();
    const key = keysEl.querySelector(selector);
    if (e.key === 'Escape' || e.key === 'Delete') clearKey.textContent = 'AC';
    handle(key);
    key.classList.add('pressed');
    setTimeout(() => key.classList.remove('pressed'), 120);
  });

  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]').content = next === 'dark' ? '#121110' : '#f3efe8';
    localStorage.setItem('calc-theme', next);
  });

  window.addEventListener('resize', fitResult);
  document.fonts?.ready.then(fitResult);
  render();
})();
