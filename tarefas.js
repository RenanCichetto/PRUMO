// Prumo — módulo de tarefas (Kanban): colunas editáveis, tarefas que andam de coluna
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, uid } = P;
  const st = () => P.state;
  const kb = () => st().kanban;

  let sel = null; // coluna aberta
  let newText = '';
  let editing = null; // id da tarefa em edição
  let editText = '';
  let manage = false; // painel de colunas
  let newCol = '';

  const colIndex = (id) => kb().columns.findIndex((c) => c.id === id);

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
        '<div class="row" style="margin-top:8px"><button class="ghost grow" data-act="t-cancel">Cancelar</button>' +
        '<button class="primary grow" data-act="t-save">Salvar</button></div></div>'
      );
    }
    return (
      `<div class="card"><div style="margin-bottom:10px">${esc(t.title)}</div>` +
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
    const tasks = kb().tasks.filter((t) => t.col === sel);
    return (
      `<div class="seg fill">${seg}</div>` +
      '<div class="row" style="margin-bottom:12px">' +
      `<input type="text" data-in="t-new" data-enter="t-add" placeholder="Nova tarefa em “${esc(cols[idx].name)}”" value="${esc(newText)}">` +
      '<button class="accent" data-act="t-add">+</button></div>' +
      (tasks.length ? tasks.map((t) => taskCard(t, idx, cols.length)).join('') : '<div class="empty">Nenhuma tarefa nesta coluna.</div>') +
      (manage ? viewColumns() : '<button class="ghost block" style="margin-top:8px" data-act="t-manage">Editar colunas</button>')
    );
  }

  P.register({
    id: 'tarefas',
    title: 'Tarefas',
    onEnter() { editing = null; manage = false; newText = ''; },
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
      return n ? `${n} pendente${n === 1 ? '' : 's'}` : 'Tudo em dia';
    },
    view,
    act(name, el) {
      switch (name) {
        case 't-col': sel = el.dataset.id; editing = null; P.render(); return true;
        case 't-add': {
          const title = newText.trim();
          if (!title) return true;
          kb().tasks.push({ id: uid(), title, col: sel, createdAt: Date.now() });
          newText = '';
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
          if (next) t.col = next.id;
          P.save();
          P.render();
          return true;
        }
        case 't-edit': {
          const t = kb().tasks.find((x) => x.id === el.dataset.id);
          if (t) { editing = t.id; editText = t.title; }
          P.render();
          return true;
        }
        case 't-save': {
          const t = kb().tasks.find((x) => x.id === editing);
          const title = editText.trim();
          if (t && title) t.title = title;
          editing = null;
          P.save();
          P.render();
          return true;
        }
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
      else if (k === 't-colnew') newCol = el.value;
      else if (k === 't-colname') {
        const c = kb().columns.find((x) => x.id === el.dataset.id);
        if (c) { c.name = el.value; P.save(); }
      }
      return true;
    },
  });
})();
