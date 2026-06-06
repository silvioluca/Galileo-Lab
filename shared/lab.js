/* Shared UI component builders for all Galileo Lab simulations */

const Lab = {};

Lab.Slider = function ({ label, min, max, value, step = 1, unit = '', onChange }) {
  const group = document.createElement('div');
  group.className = 'ctrl-group';

  const row = document.createElement('div');
  row.className = 'ctrl-label-row';

  const lbl = document.createElement('span');
  lbl.className = 'ctrl-label';
  lbl.textContent = label;

  const val = document.createElement('span');
  val.className = 'ctrl-value';
  val.textContent = formatVal(value) + unit;

  row.append(lbl, val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.value = value;
  input.step = step;
  input.className = 'ctrl-slider';

  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = formatVal(v) + unit;
    onChange(v);
  });

  group.append(row, input);

  function formatVal(v) {
    return step < 1 ? v.toFixed(String(step).split('.')[1]?.length || 1) : String(v);
  }

  return {
    el: group,
    setValue(v) {
      input.value = v;
      val.textContent = formatVal(v) + unit;
    },
    getValue() { return parseFloat(input.value); },
  };
};

Lab.Toggle = function ({ label, value = false, onChange }) {
  const row = document.createElement('div');
  row.className = 'ctrl-toggle-row';

  const lbl = document.createElement('span');
  lbl.className = 'ctrl-label';
  lbl.textContent = label;

  const btn = document.createElement('button');
  btn.className = 'ctrl-toggle' + (value ? ' active' : '');
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-checked', String(value));
  btn.setAttribute('aria-label', label);

  const knob = document.createElement('span');
  knob.className = 'toggle-knob';
  btn.appendChild(knob);

  let state = value;
  btn.addEventListener('click', () => {
    state = !state;
    btn.classList.toggle('active', state);
    btn.setAttribute('aria-checked', String(state));
    onChange(state);
  });

  row.append(lbl, btn);
  return {
    el: row,
    getValue() { return state; },
    setValue(v) {
      state = v;
      btn.classList.toggle('active', v);
      btn.setAttribute('aria-checked', String(v));
    },
  };
};

Lab.RadioGroup = function ({ label, options, value, onChange }) {
  const group = document.createElement('div');
  group.className = 'ctrl-group';

  const lbl = document.createElement('div');
  lbl.className = 'ctrl-label';
  lbl.style.marginBottom = '8px';
  lbl.textContent = label;

  const list = document.createElement('div');
  list.className = 'ctrl-radio-list';

  let currentValue = value;

  options.forEach(opt => {
    const row = document.createElement('label');
    row.className = 'ctrl-radio-row' + (opt.value === value ? ' checked' : '');

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.className = 'ctrl-radio';
    radio.name = 'radio-' + label.replace(/\s/g, '_');
    radio.value = opt.value;
    radio.checked = opt.value === value;

    const dot = document.createElement('span');
    dot.className = 'ctrl-radio-dot';

    const optLbl = document.createElement('span');
    optLbl.className = 'ctrl-radio-label';
    optLbl.textContent = opt.label;

    const hint = document.createElement('span');
    hint.className = 'ctrl-radio-hint';
    hint.textContent = opt.hint || '';

    row.append(radio, dot, optLbl, hint);

    radio.addEventListener('change', () => {
      if (radio.checked) {
        list.querySelectorAll('.ctrl-radio-row').forEach(r => r.classList.remove('checked'));
        row.classList.add('checked');
        currentValue = opt.value;
        onChange(opt.value, opt);
      }
    });

    list.appendChild(row);
  });

  group.append(lbl, list);
  return {
    el: group,
    getValue() { return currentValue; },
    setValue(v) {
      currentValue = v;
      const rows = list.querySelectorAll('.ctrl-radio-row');
      rows.forEach(r => r.classList.remove('checked'));
      const inputs = list.querySelectorAll('input.ctrl-radio');
      inputs.forEach(inp => {
        const on = inp.value === String(v);
        inp.checked = on;
        if (on && inp.closest) inp.closest('.ctrl-radio-row').classList.add('checked');
      });
    },
  };
};

Lab.Section = function (title) {
  const sec = document.createElement('div');
  sec.className = 'panel-section';

  const h = document.createElement('div');
  h.className = 'panel-section-title';
  h.textContent = title;

  sec.appendChild(h);
  return {
    el: sec,
    add(component) {
      sec.appendChild(component.el || component);
      return this;
    },
  };
};

Lab.SubPanel = function () {
  const el = document.createElement('div');
  el.className = 'ctrl-sub';
  return {
    el,
    add(component) { el.appendChild(component.el || component); return this; },
    show() { el.style.display = ''; },
    hide() { el.style.display = 'none'; },
  };
};

Lab.Readout = class {
  constructor(container, fields) {
    this._cells = {};
    fields.forEach(f => {
      const cell = document.createElement('div');
      cell.className = 'readout-cell';

      const lbl = document.createElement('span');
      lbl.className = 'readout-label';
      lbl.textContent = f.label;

      const val = document.createElement('span');
      val.className = 'readout-value';
      val.textContent = '—';

      cell.append(lbl, val);
      container.appendChild(cell);
      this._cells[f.key] = val;
    });
  }

  set(key, value) {
    if (this._cells[key]) this._cells[key].textContent = value;
  }

  reset() {
    Object.values(this._cells).forEach(v => { v.textContent = '—'; });
  }
};

/* Slider + editable number input, synced */
Lab.SliderInput = function ({ label, min, max, value, step = 1, unit = '', hint = '', onChange }) {
  const group = document.createElement('div');
  group.className = 'ctrl-group';

  const labelRow = document.createElement('div');
  labelRow.className = 'ctrl-label-row';

  const lbl = document.createElement('span');
  lbl.className = 'ctrl-label';
  lbl.textContent = label;
  labelRow.appendChild(lbl);

  if (hint) {
    const h = document.createElement('span');
    h.className = 'ctrl-hint';
    h.textContent = hint;
    labelRow.appendChild(h);
  }

  const inputRow = document.createElement('div');
  inputRow.className = 'ctrl-slider-input-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min; slider.max = max; slider.value = value; slider.step = step;
  slider.className = 'ctrl-slider';

  const num = document.createElement('input');
  num.type = 'number';
  num.min = min; num.max = max; num.value = value; num.step = step;
  num.className = 'ctrl-number';
  if (unit) num.title = unit;

  let current = Number(value);

  function fmt(v) {
    const decimals = step < 1 ? String(step).split('.')[1]?.length || 1 : 0;
    return Number(v).toFixed(decimals);
  }

  slider.addEventListener('input', () => {
    current = parseFloat(slider.value);
    num.value = fmt(current);
    onChange(current);
  });

  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (!isNaN(v) && v >= min && v <= max) {
      current = v;
      slider.value = v;
      onChange(current);
    }
  });

  num.addEventListener('change', () => {
    let v = parseFloat(num.value);
    if (isNaN(v)) v = current;
    v = Math.max(min, Math.min(max, v));
    current = v;
    slider.value = v;
    num.value = fmt(v);
    onChange(current);
  });

  inputRow.append(slider, num);
  if (unit) {
    const u = document.createElement('span');
    u.className = 'ctrl-unit';
    u.textContent = unit;
    inputRow.appendChild(u);
  }

  group.append(labelRow, inputRow);

  return {
    el: group,
    getValue() { return current; },
    setValue(v) {
      current = v;
      slider.value = v;
      num.value = fmt(v);
    },
  };
};

Lab.initTheme = function (toggleBtnId = 'themeToggle') {
  const stored = localStorage.getItem('gl-theme') || 'dark';
  document.documentElement.dataset.theme = stored;
  const btn = document.getElementById(toggleBtnId);
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('gl-theme', next);
    });
  }
};
