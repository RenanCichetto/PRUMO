// Prumo — núcleo: estado, navegação e utilitários compartilhados pelos módulos.
// Cada módulo se registra com Prumo.register({ id, title, tabs, view, act, input, status, ... }).
(() => {
  'use strict';

  const KEY = 'prumo.v1';
  const P = (window.Prumo = {
    modules: {},
    order: [],
    overlays: {},
    coreActs: {},
    hooks: { click: [], render: [] },
    ui: { mod: null, tab: null, overlay: null },
  });

  // ---------- utilitários ----------
  const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  P.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c]);
  P.$ = (s) => document.querySelector(s);
  P.uid = () => Math.random().toString(36).slice(2, 10);
  P.num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  P.pad = (n) => String(n).padStart(2, '0');
  P.dayStr = (d = new Date()) => `${d.getFullYear()}-${P.pad(d.getMonth() + 1)}-${P.pad(d.getDate())}`;
  P.startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  P.brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  P.ago = (ts) => {
    const days = Math.round((P.startOfDay(new Date()) - P.startOfDay(new Date(ts))) / 86400000);
    return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  };

  // ---------- ícones (traço simples, na cor do texto) ----------
  const ICONS = {
    treino: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    lembretes: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
    alimentacao: '<path d="M7 3v7a2 2 0 0 0 4 0V3M9 3v18M17 21V3c-2.5 1.5-3.5 4.5-3.5 8H17"/>',
    tarefas: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    notas: '<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7"/>',
    despesas: '<path d="M3 7.5h15a3 3 0 0 1 3 3V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7.5 5.5 4H16M16.5 14h2"/>',
  };
  P.icon = (name, size = 26) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // ---------- estado ----------
  const defaults = () => ({
    workouts: [],
    sessions: [],
    active: null,
    modules: { treino: true, lembretes: true, alimentacao: true, tarefas: true, notas: true, despesas: true },
    reminders: [],
    meals: [],
    mealLog: {},
    kanban: {
      columns: [
        { id: 'c1', name: 'A fazer' },
        { id: 'c2', name: 'Fazendo' },
        { id: 'c3', name: 'Feito' },
      ],
      tasks: [],
    },
    notes: [],
    expenses: [],
    expenseCats: ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Compras', 'Contas', 'Outros'],
  });

  // Aceita dados antigos (versão 1, só treino) e completa o que faltar.
  P.normalize = (s) => {
    const d = defaults();
    if (!s || typeof s !== 'object') return d;
    for (const k of Object.keys(d)) {
      if (k === 'active') continue;
      const v = s[k];
      if (v === undefined || v === null) continue;
      if (Array.isArray(d[k])) {
        if (Array.isArray(v)) d[k] = v;
      } else if (typeof d[k] === 'object') {
        if (typeof v === 'object' && !Array.isArray(v)) d[k] = Object.assign(d[k], v);
      }
    }
    if (s.active && typeof s.active === 'object' && Array.isArray(s.active.entries)) d.active = s.active;
    if (!Array.isArray(d.kanban.columns) || !d.kanban.columns.length) d.kanban.columns = defaults().kanban.columns;
    if (!Array.isArray(d.kanban.tasks)) d.kanban.tasks = [];
    return d;
  };

  const load = () => {
    try {
      return P.normalize(JSON.parse(localStorage.getItem(KEY)));
    } catch (e) {
      return defaults();
    }
  };
  P.state = load();
  P.save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(P.state));
    } catch (e) { /* sem espaço ou bloqueado */ }
  };
  P.setState = (s) => {
    P.state = P.normalize(s);
    P.save();
  };

  // ---------- módulos e navegação ----------
  P.register = (def) => {
    def.tabs = def.tabs || [];
    P.modules[def.id] = def;
    P.order.push(def.id);
  };
  const cur = () => (P.ui.mod ? P.modules[P.ui.mod] : null);

  P.render = () => {
    const ui = P.ui;
    const m = cur();
    const ov = ui.overlay && P.overlays[ui.overlay];
    let html;
    let title = '';
    let tabs = false;
    if (ov) {
      html = ov.view();
      title = ov.title;
    } else if (m) {
      if (m.tabs.length && !m.tabs.some((t) => t[0] === ui.tab)) ui.tab = m.tabs[0][0];
      html = m.view(ui.tab);
      title = m.title;
      tabs = m.tabs.length > 1;
    } else {
      html = P.homeView();
    }
    P.$('#view').innerHTML = html;
    P.$('#sub').textContent = title;
    P.$('#back').hidden = !(ov || m);
    const nav = P.$('#tabs');
    nav.hidden = !tabs;
    nav.innerHTML = tabs
      ? m.tabs.map(([id, l]) => `<button data-tab="${id}" class="${id === ui.tab ? 'on' : ''}">${P.esc(l)}</button>`).join('')
      : '';
    document.body.classList.toggle('has-tabs', tabs);
    P.hooks.render.forEach((f) => f());
  };

  P.go = (o) => {
    Object.assign(P.ui, o);
    P.render();
  };

  P.act = (name, el) => {
    if (P.coreActs[name]) return P.coreActs[name](el);
    switch (name) {
      case 'open-mod': {
        const m = P.modules[el.dataset.id];
        if (!m) return;
        if (m.onEnter) m.onEnter();
        P.go({ mod: m.id, tab: m.tabs.length ? m.tabs[0][0] : null, overlay: null });
        window.scrollTo(0, 0);
        return;
      }
      case 'overlay':
        P.go({ overlay: el.dataset.id });
        window.scrollTo(0, 0);
        return;
      case 'back': {
        if (P.ui.overlay) return P.go({ overlay: null });
        const m = cur();
        if (m && m.back && m.back()) return P.render();
        P.go({ mod: null, tab: null, overlay: null });
        window.scrollTo(0, 0);
        return;
      }
    }
    for (const id of P.order) {
      const m = P.modules[id];
      if (m.act && m.act(name, el) === true) return;
    }
  };

  // ---------- eventos ----------
  document.addEventListener('click', (ev) => {
    P.hooks.click.forEach((f) => f());
    const t = ev.target.closest('[data-tab]');
    if (t) {
      P.go({ tab: t.dataset.tab, overlay: null });
      window.scrollTo(0, 0);
      return;
    }
    const b = ev.target.closest('[data-act]');
    if (b) P.act(b.dataset.act, b);
  });

  // Enter num campo com data-enter="acao" dispara a ação (ex.: adicionar tarefa)
  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (ev.key === 'Enter' && t && t.dataset && t.dataset.enter) {
      ev.preventDefault();
      P.act(t.dataset.enter, t);
    }
  });

  const route = (kind) => (ev) => {
    for (const id of P.order) {
      const m = P.modules[id];
      if (m[kind] && m[kind](ev.target) === true) return;
    }
  };
  document.addEventListener('input', route('input'));
  document.addEventListener('change', route('change'));
})();
