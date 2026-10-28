// Prumo — módulo de alimentação: plano de refeições e acompanhamento do dia
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, uid } = P;
  const st = () => P.state;

  const MODELO = [
    ['Café da manhã', '07:00'],
    ['Lanche da manhã', '10:00'],
    ['Almoço', '12:30'],
    ['Lanche da tarde', '16:00'],
    ['Jantar', '20:00'],
  ];

  let draft = null; // refeição em edição: { id, name, time, desc }
  const blank = () => ({ id: null, name: '', time: '', desc: '' });

  const sorted = () => st().meals.slice().sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  const logOf = (day) => st().mealLog[day] || {};
  const countOk = (day) => {
    const log = logOf(day);
    return st().meals.filter((m) => log[m.id] === 'ok').length;
  };

  function viewHoje() {
    const meals = sorted();
    if (!meals.length) {
      return (
        '<div class="empty"><p>Você ainda não montou seu plano de refeições.</p>' +
        '<button class="primary" data-tab="plano">Montar meu plano</button></div>'
      );
    }
    const day = P.dayStr();
    const log = logOf(day);
    const ok = countOk(day);
    const cards = meals
      .map((m) => {
        const s = log[m.id];
        return (
          `<div class="card"><div class="row between"><b>${esc(m.name)}</b><span class="muted">${esc(m.time || '')}</span></div>` +
          (m.desc ? `<div class="muted" style="margin:4px 0 8px">${esc(m.desc)}</div>` : '<div style="height:8px"></div>') +
          `<div class="row"><button class="opt${s === 'ok' ? ' on' : ''}" data-act="a-mark" data-id="${esc(m.id)}" data-s="ok">Segui</button>` +
          `<button class="opt${s === 'off' ? ' on out' : ''}" data-act="a-mark" data-id="${esc(m.id)}" data-s="off">Fugi do plano</button></div></div>`
        );
      })
      .join('');

    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = P.dayStr(d);
      const n = countOk(key);
      const pct = Math.round((n / meals.length) * 100);
      const label = i === 0 ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
      return (
        `<div class="row" style="margin-bottom:8px"><span class="muted" style="width:64px">${esc(label)}</span>` +
        `<div class="bar"><i style="width:${pct}%"></i></div><span class="muted" style="width:44px;text-align:right">${n}/${meals.length}</span></div>`
      );
    }).join('');

    return (
      `<h2 style="margin:8px 0 2px">Hoje</h2><p class="muted" style="margin-top:0">${ok} de ${meals.length} refeições seguidas</p>` +
      cards +
      '<h2>Últimos 7 dias</h2><div class="card">' + week + '</div>'
    );
  }

  function viewPlano() {
    const meals = sorted();
    const editing = !!draft;
    const form =
      `<div class="card"><b>${draft && draft.id ? 'Editar refeição' : 'Nova refeição'}</b>` +
      '<label class="f">Nome</label>' +
      `<input type="text" data-in="a-name" placeholder="Ex.: Almoço" value="${esc(draft ? draft.name : '')}">` +
      '<label class="f">Horário</label>' +
      `<input type="time" data-in="a-time" value="${esc(draft ? draft.time : '')}">` +
      '<label class="f">O que comer (opcional)</label>' +
      `<input type="text" data-in="a-desc" placeholder="Ex.: Arroz, feijão, frango e salada" value="${esc(draft ? draft.desc : '')}">` +
      '<div class="row" style="margin-top:14px">' +
      (editing && draft.id ? '<button class="ghost grow" data-act="a-cancel">Cancelar</button>' : '') +
      `<button class="primary grow" data-act="a-save">${draft && draft.id ? 'Salvar' : 'Adicionar'}</button></div></div>`;
    if (!draft) draft = blank();
    const list = meals.length
      ? meals
          .map(
            (m) =>
              `<div class="card"><div class="row between"><b>${esc(m.name)}</b><span class="muted">${esc(m.time || '')}</span></div>` +
              (m.desc ? `<div class="muted" style="margin:4px 0">${esc(m.desc)}</div>` : '') +
              `<div class="row" style="margin-top:8px"><button class="small" data-act="a-edit" data-id="${esc(m.id)}">Editar</button>` +
              `<button class="danger small" data-act="a-del" data-id="${esc(m.id)}">Excluir</button></div></div>`
          )
          .join('')
      : '<div class="empty"><p>Nenhuma refeição no plano.</p><button class="accent" data-act="a-modelo">Usar modelo de 5 refeições</button></div>';
    return '<h2 style="margin:8px 0">Meu plano</h2>' + list + form;
  }

  P.register({
    id: 'alimentacao',
    title: 'Alimentação',
    tabs: [
      ['hoje', 'Hoje'],
      ['plano', 'Plano'],
    ],
    onEnter() { draft = null; },
    status() {
      const n = st().meals.length;
      if (!n) return 'Monte seu plano';
      return `${countOk(P.dayStr())} de ${n} hoje`;
    },
    view(tab) {
      if (tab === 'plano') return viewPlano();
      return viewHoje();
    },
    act(name, el) {
      switch (name) {
        case 'a-mark': {
          const day = P.dayStr();
          const log = (st().mealLog[day] = st().mealLog[day] || {});
          const id = el.dataset.id;
          const s = el.dataset.s;
          if (log[id] === s) delete log[id];
          else log[id] = s;
          P.save();
          P.render();
          return true;
        }
        case 'a-save': {
          const name2 = (draft.name || '').trim();
          if (!name2) return alert('Dê um nome à refeição.'), true;
          const item = { id: draft.id || uid(), name: name2, time: draft.time || '', desc: (draft.desc || '').trim() };
          const i = st().meals.findIndex((m) => m.id === item.id);
          if (i >= 0) st().meals[i] = item;
          else st().meals.push(item);
          draft = null;
          P.save();
          P.render();
          return true;
        }
        case 'a-edit': {
          const m = st().meals.find((x) => x.id === el.dataset.id);
          if (m) draft = { ...m };
          P.render();
          window.scrollTo(0, document.body.scrollHeight);
          return true;
        }
        case 'a-cancel': draft = null; P.render(); return true;
        case 'a-del':
          if (confirm('Excluir esta refeição do plano?')) {
            st().meals = st().meals.filter((m) => m.id !== el.dataset.id);
            P.save();
            P.render();
          }
          return true;
        case 'a-modelo':
          MODELO.forEach(([n, t]) => st().meals.push({ id: uid(), name: n, time: t, desc: '' }));
          P.save();
          P.render();
          return true;
      }
      return false;
    },
    input(el) {
      const k = el.dataset.in;
      if (!k || !k.startsWith('a-') || !draft) return false;
      if (k === 'a-name') draft.name = el.value;
      else if (k === 'a-time') draft.time = el.value;
      else if (k === 'a-desc') draft.desc = el.value;
      return true;
    },
  });
})();
