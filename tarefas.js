// Prumo — módulo de tarefas (Kanban): colunas editáveis, prazo por tarefa e filtro das concluídas por período
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, uid } = P;
  const st = () => P.state;
  const kb = () => st().kanban;

  let sel = null; // coluna aberta
  let newText = '';
  let newDue = ''; // prazo da nova tarefa (AAAA-MM-DD, opcional)
  let editDue = '';
  let period = 'all'; // filtro das concluídas: all | today | week | month | prev
  let editing = null; // id da tarefa em edição
  let editText = '';
  let manage = false; // painel de colunas
  let newCol = '';

  const colIndex = (id) => kb().columns.findIndex((c) => c.id === id);
  const lastId = () => kb().columns[kb().columns.length - 1].id;
  const brDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  const doneDay = (t) => P.dayStr(new Date(t.doneAt || t.createdAt || Date.now()));
  const PERIODS = [
    ['all', 'Todas'],
    ['today', 'Hoje'],
    ['week', '7 dias'],
    ['month', 'Este mês'],
    ['prev', 'Mês passado'],
  ];
  // a tarefa concluída entra no período escolhido?
  function inPeriod(t) {
    if (period === 'all') return true;
    const d = doneDay(t);
    const today = P.dayStr();
    if (period === 'today') return d === today;
    if (period === 'week') {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      return d >= P.dayStr(from) && d <= today;
    }
    const now = new Date();
    const ref = period === 'month' ? now : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.slice(0, 7) === P.dayStr(ref).slice(0, 7);
  }

  function viewColumns() {
    return (
      '<div class="card"><b>Colunas</b><div style="height:8px"></div>' +
      kb().columns
        .map(
          (c) =>
            `<div class="row" style="margin-bottom:8px"><input type="text" data-in="t-colname" data-id="${esc(c.id)}" value="${esc(c.name)}">` +
            (kb().columns.length > 1 ? `<button class="danger small" data-act="t-coldel" data-id="${esc(c.id)}">✕</button>` : '') +
            '</div>'
        )
        .join('') +
      '<div class="row"><input type="text" data-in="t-colnew" data-enter="t-coladd" placeholder="Nova coluna" value="' + esc(newCol) + '">' +
      '<button class="accent small" data-act="t-coladd">Criar</button></div>' +
      '<button class="primary block" style="margin-top:12px" data-act="t-manage">Pronto</button></div>'
    );
  }

  function taskCard(t, i, n) {
    if (editing === t.id) {
      return (
        `<div class="card"><input type="text" data-in="t-edit" data-enter="t-save" value="${esc(editText)}">` +
        '<label class="f">Prazo (opcional)</label>' +
        `<input type="date" data-in="t-editdue" value="${esc(editDue)}">` +
        '<div class="row" style="margin-top:12px"><button class="ghost grow" data-act="t-cancel">Cancelar</button>' +
        '<button class="primary grow" data-act="t-save">Salvar</button></div></div>'
      );
    }
    const done = t.col === lastId();
    const late = !done && t.due && t.due < P.dayStr();
    const info = done
      ? `<div class="muted" style="margin:-6px 0 10px">Concluída em ${esc(brDate(doneDay(t)))}${t.due ? ' · prazo ' + esc(brDate(t.due)) : ''}</div>`
      : t.due
      ? `<div class="${late ? 'neg' : 'muted'}" style="margin:-6px 0 10px;font-size:14px">Prazo ${esc(brDate(t.due))}${late ? ' · atrasada' : ''}</div>`
      : '';
    return (
      `<div class="card${late ? ' late' : ''}"><div style="margin-bottom:10px">${esc(t.title)}</div>` + info +
      '<div class="row">' +
      `<button class="small" data-act="t-move" data-id="${esc(t.id)}" data-d="-1"${i === 0 ? ' disabled' : ''} aria-label="Mover para a coluna anterior">‹</button>` +
      `<button class="small" data-act="t-move" data-id="${esc(t.id)}" data-d="1"${i === n - 1 ? ' disabled' : ''} aria-label="Mover para a próxima coluna">›</button>` +
      '<span class="grow"></span>' +
      `<button class="small ghost" data-act="t-edit" data-id="${esc(t.id)}">Editar</button>` +
      `<button class="small danger" data-act="t-del" data-id="${esc(t.id)}">✕</button></div></div>`
    );
  }

  function view() {
    const cols = kb().columns;
    if (!cols.some((c) => c.id === sel)) sel = cols[0].id;
    const seg = cols
      .map((c) => `<button data-act="t-col" data-id="${esc(c.id)}" class="${c.id === sel ? 'on' : ''}"><span>${esc(c.name)}</span><small>${kb().tasks.filter((t) => t.col === c.id).length}</small></button>`)
      .join('');
    const idx = colIndex(sel);
    const isDone = sel === lastId() && cols.length > 1;
    let tasks = kb().tasks.filter((t) => t.col === sel);
    const total = tasks.length;
    if (isDone) {
      tasks = tasks.filter(inPeriod).sort((a, b) => doneDay(b).localeCompare(doneDay(a)) || (b.doneAt || 0) - (a.doneAt || 0));
    } else {
      tasks.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.createdAt || 0) - (b.createdAt || 0));
    }
    const filter = isDone
      ? '<div class="seg" style="flex-wrap:wrap;overflow:visible">' + PERIODS.map(([v, l]) => `<button data-act="t-period" data-v="${v}" class="${period === v ? 'on' : ''}">${l}</button>`).join('') + '</div>' +
        `<p class="muted" style="margin:0 0 10px">${tasks.length} de ${total} concluída${total === 1 ? '' : 's'} no período</p>`
      : '';
    return (
      `<div class="seg fill">${seg}</div>` +
      '<div class="row" style="margin-bottom:12px">' +
      `<input type="text" data-in="t-new" data-enter="t-add" placeholder="Nova tarefa em “${esc(cols[idx].name)}”" value="${esc(newText)}">` +
      '<button class="accent" data-act="t-add">+</button></div>' +
      '<div class="row" style="margin:-4px 0 12px"><label class="f" style="margin:0;white-space:nowrap">Prazo (opcional)</label>' +
      `<input type="date" data-in="t-newdue" value="${esc(newDue)}"></div>` +
      filter +
      (tasks.length ? tasks.map((t) => taskCard(t, idx, cols.length)).join('') : `<div class="empty">${total ? 'Nenhuma tarefa concluída neste período.' : 'Nenhuma tarefa nesta coluna.'}</div>`) +
      (manage ? viewColumns() : '<button class="ghost block" style="margin-top:8px" data-act="t-manage">Editar colunas</button>')
    );
  }

  P.register({
    id: 'tarefas',
    title: 'Tarefas',
    onEnter() { editing = null; manage = false; newText = ''; newDue = ''; period = 'all'; },
    back() {
      if (editing || manage) {
        editing = null;
        manage = false;
        return true;
      }
      return false;
    },
    status() {
      const cols = kb().columns;
      const last = cols[cols.length - 1].id;
      const n = kb().tasks.filter((t) => t.col !== last).length;
      const late = kb().tasks.filter((t) => t.col !== last && t.due && t.due < P.dayStr()).length;
      return n ? `${n} pendente${n === 1 ? '' : 's'}${late ? ` · ${late} atrasada${late === 1 ? '' : 's'}` : ''}` : 'Tudo em dia';
    },
    view,
    act(name, el) {
      switch (name) {
        case 't-col': sel = el.dataset.id; editing = null; P.render(); return true;
        case 't-add': {
          const title = newText.trim();
          if (!title) return true;
          const nt = { id: uid(), title, col: sel, createdAt: Date.now() };
          if (newDue) nt.due = newDue;
          if (sel === lastId() && kb().columns.length > 1) nt.doneAt = Date.now();
          kb().tasks.push(nt);
          newText = '';
          newDue = '';
          P.save();
          P.render();
          const i = P.$('[data-in="t-new"]');
          if (i) i.focus();
          return true;
        }
        case 't-move': {
          const t = kb().tasks.find((x) => x.id === el.dataset.id);
          if (!t) return true;
          const next = kb().columns[colIndex(t.col) + Number(el.dataset.d)];
          if (next) {
            t.col = next.id;
            if (next.id === lastId()) t.doneAt = Date.now();
            else delete t.doneAt;
          }
          P.save();
          P.render();
          return true;
        }
        case 't-edit': {
          const t = kb().tasks.find((x) => x.id === el.dataset.id);
          if (t) { editing = t.id; editText = t.title; editDue = t.due || ''; }
          P.render();
          return true;
        }
        case 't-save': {
          const t = kb().tasks.find((x) => x.id === editing);
          const title = editText.trim();
          if (t && title) {
            t.title = title;
            if (editDue) t.due = editDue;
            else delete t.due;
          }
          editing = null;
          P.save();
          P.render();
          return true;
        }
        case 't-period': period = el.dataset.v; P.render(); return true;
        case 't-cancel': editing = null; P.render(); return true;
        case 't-del':
          if (confirm('Excluir esta tarefa?')) {
            kb().tasks = kb().tasks.filter((x) => x.id !== el.dataset.id);
            P.save();
            P.render();
          }
          return true;
        case 't-manage': manage = !manage; P.render(); return true;
        case 't-coladd': {
          const name2 = newCol.trim();
          if (!name2) return true;
          kb().columns.push({ id: uid(), name: name2 });
          newCol = '';
          P.save();
          P.render();
          return true;
        }
        case 't-coldel': {
          const cols = kb().columns;
          if (cols.length <= 1) return true;
          const id = el.dataset.id;
          const c = cols.find((x) => x.id === id);
          if (!confirm(`Excluir a coluna “${c ? c.name : ''}”? As tarefas dela vão para outra coluna.`)) return true;
          const rest = cols.filter((x) => x.id !== id);
          kb().tasks.forEach((t) => { if (t.col === id) t.col = rest[0].id; });
          kb().columns = rest;
          if (sel === id) sel = rest[0].id;
          P.save();
          P.render();
          return true;
        }
      }
      return false;
    },
    input(el) {
      const k = el.dataset.in;
      if (!k || !k.startsWith('t-')) return false;
      if (k === 't-new') newText = el.value;
      else if (k === 't-edit') editText = el.value;
      else if (k === 't-newdue') newDue = el.value;
      else if (k === 't-editdue') editDue = el.value;
      else if (k === 't-colnew') newCol = el.value;
      else if (k === 't-colname') {
        const c = kb().columns.find((x) => x.id === el.dataset.id);
        if (c) { c.name = el.value; P.save(); }
      }
      return true;
    },
  });
})();
