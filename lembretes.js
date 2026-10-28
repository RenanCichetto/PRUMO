// Prumo — módulo de lembretes
// Guarda data, hora e repetição. O aviso (notificação) entra na etapa seguinte; por ora a lista
// mostra o que está atrasado, o que é de hoje e o que vem depois.
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, uid, pad } = P;
  const st = () => P.state;

  const REPEATS = [
    ['none', 'Não repetir'],
    ['daily', 'Todo dia'],
    ['weekdays', 'Dias úteis (seg a sex)'],
    ['weekly', 'Toda semana'],
  ];
  const repeatLabel = (r) => (REPEATS.find((x) => x[0] === r) || REPEATS[0])[1];

  let form = null; // { id, text, date, time, repeat }

  const blank = () => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return { id: null, text: '', date: P.dayStr(d), time: `${pad(d.getHours())}:00`, repeat: 'none' };
  };
  const fromReminder = (r) => {
    const d = new Date(r.dueAt);
    return { id: r.id, text: r.text, date: P.dayStr(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, repeat: r.repeat || 'none' };
  };

  const when = (ts) => {
    const d = new Date(ts);
    const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const diff = Math.round((P.startOfDay(d) - P.startOfDay(new Date())) / 86400000);
    if (diff === 0) return `Hoje · ${t}`;
    if (diff === 1) return `Amanhã · ${t}`;
    if (diff === -1) return `Ontem · ${t}`;
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' + t;
  };

  // próxima ocorrência de um lembrete que se repete (sempre no futuro)
  function nextDue(r) {
    const d = new Date(r.dueAt);
    const step = () => {
      if (r.repeat === 'weekly') d.setDate(d.getDate() + 7);
      else if (r.repeat === 'weekdays') {
        do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      } else d.setDate(d.getDate() + 1);
    };
    do { step(); } while (d.getTime() <= Date.now());
    return d.getTime();
  }

  function row(r, late) {
    return (
      `<div class="card${late ? ' late' : ''}"><div class="row">` +
      `<button class="check-btn${r.done ? ' on' : ''}" data-act="l-done" data-id="${esc(r.id)}" aria-label="Concluir">${r.done ? '✓' : ''}</button>` +
      `<div class="grow"><div${r.done ? ' style="text-decoration:line-through;opacity:.6"' : ''}>${esc(r.text)}</div>` +
      `<div class="muted">${esc(when(r.dueAt))}${r.repeat && r.repeat !== 'none' ? ' · ' + esc(repeatLabel(r.repeat)) : ''}</div></div>` +
      `<button class="ghost small" data-act="l-edit" data-id="${esc(r.id)}">Editar</button></div></div>`
    );
  }

  function viewList() {
    const now = Date.now();
    const today = P.startOfDay(new Date());
    const open = st().reminders.filter((r) => !r.done).sort((a, b) => a.dueAt - b.dueAt);
    const late = open.filter((r) => r.dueAt < now);
    const todays = open.filter((r) => r.dueAt >= now && P.startOfDay(new Date(r.dueAt)) === today);
    const next = open.filter((r) => r.dueAt >= now && P.startOfDay(new Date(r.dueAt)) > today);
    const done = st().reminders.filter((r) => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 8);

    const group = (title, arr, isLate) => (arr.length ? `<h2>${title}</h2>` + arr.map((r) => row(r, isLate)).join('') : '');
    return (
      '<div class="row between"><h2 style="margin:8px 0">Lembretes</h2>' +
      '<button class="accent small" data-act="l-new">+ Novo</button></div>' +
      (st().reminders.length
        ? group('Atrasados', late, true) + group('Hoje', todays) + group('Próximos', next) + group('Concluídos', done)
        : '<div class="empty">Nenhum lembrete ainda.</div>') +
      (open.length || !st().reminders.length
        ? '<p class="muted" style="margin-top:18px">Os avisos no celular (notificação do Prumo) chegam na próxima etapa. Por enquanto, a lista mostra o que está atrasado e o que vem hoje.</p>'
        : '')
    );
  }

  function viewForm() {
    return (
      `<h2>${form.id ? 'Editar lembrete' : 'Novo lembrete'}</h2>` +
      '<label class="f">O que lembrar</label>' +
      `<input type="text" data-in="l-text" placeholder="Ex.: Pagar o boleto da internet" value="${esc(form.text)}">` +
      '<label class="f">Dia</label>' +
      `<input type="date" data-in="l-date" value="${esc(form.date)}">` +
      '<label class="f">Hora</label>' +
      `<input type="time" data-in="l-time" value="${esc(form.time)}">` +
      '<label class="f">Repetir</label>' +
      '<select data-in="l-repeat">' +
      REPEATS.map(([v, l]) => `<option value="${v}"${form.repeat === v ? ' selected' : ''}>${l}</option>`).join('') +
      '</select>' +
      '<div class="row" style="margin-top:16px"><button class="ghost grow" data-act="l-cancel">Cancelar</button>' +
      '<button class="primary grow" data-act="l-save">Salvar</button></div>' +
      (form.id ? '<button class="danger block" style="margin-top:12px" data-act="l-del">Excluir lembrete</button>' : '')
    );
  }

  function save() {
    const text = form.text.trim();
    if (!text) return alert('Escreva o que você quer lembrar.');
    if (!form.date || !form.time) return alert('Escolha o dia e a hora.');
    const dueAt = new Date(`${form.date}T${form.time}`).getTime();
    if (!Number.isFinite(dueAt)) return alert('Dia ou hora inválidos.');
    if (form.id) {
      const r = st().reminders.find((x) => x.id === form.id);
      if (r) Object.assign(r, { text, dueAt, repeat: form.repeat });
    } else {
      st().reminders.push({ id: uid(), text, dueAt, repeat: form.repeat, done: false, createdAt: Date.now() });
    }
    form = null;
    P.save();
    P.render();
  }

  P.register({
    id: 'lembretes',
    title: 'Lembretes',
    onEnter() { form = null; },
    back() {
      if (!form) return false;
      form = null;
      return true;
    },
    status() {
      const open = st().reminders.filter((r) => !r.done);
      const late = open.filter((r) => r.dueAt < Date.now()).length;
      const today = P.startOfDay(new Date());
      const todays = open.filter((r) => r.dueAt >= Date.now() && P.startOfDay(new Date(r.dueAt)) === today).length;
      if (late) return `${late} atrasado${late === 1 ? '' : 's'}`;
      return todays ? `${todays} para hoje` : 'Nada para hoje';
    },
    view() {
      return form ? viewForm() : viewList();
    },
    act(name, el) {
      switch (name) {
        case 'l-new': form = blank(); P.render(); return true;
        case 'l-edit': {
          const r = st().reminders.find((x) => x.id === el.dataset.id);
          if (r) form = fromReminder(r);
          P.render();
          return true;
        }
        case 'l-cancel': form = null; P.render(); return true;
        case 'l-save': save(); return true;
        case 'l-del':
          if (form && form.id && confirm('Excluir este lembrete?')) {
            st().reminders = st().reminders.filter((x) => x.id !== form.id);
            form = null;
            P.save();
            P.render();
          }
          return true;
        case 'l-done': {
          const r = st().reminders.find((x) => x.id === el.dataset.id);
          if (!r) return true;
          if (r.done) {
            r.done = false;
            delete r.doneAt;
          } else if (r.repeat && r.repeat !== 'none') {
            r.dueAt = nextDue(r); // lembrete que se repete: vai para a próxima data
          } else {
            r.done = true;
            r.doneAt = Date.now();
          }
          P.save();
          P.render();
          return true;
        }
      }
      return false;
    },
    input(el) {
      const k = el.dataset.in;
      if (!k || !k.startsWith('l-') || !form) return false;
      if (k === 'l-text') form.text = el.value;
      else if (k === 'l-date') form.date = el.value;
      else if (k === 'l-time') form.time = el.value;
      else if (k === 'l-repeat') form.repeat = el.value;
      return true;
    },
  });
})();
