// Prumo — dashboards: cartão "Hoje" na tela inicial e aba "Resumo" dentro de cada módulo.
// Só lê os dados dos módulos (nada aqui altera o que você já registrou), exceto o "Saldo inicial" de Despesas.
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc } = P;
  const st = () => P.state;
  const on = (id) => !!st().modules[id] && !!P.modules[id];

  // ---------- utilitários ----------
  const DAY = 86400000;
  const fmtN = (n) => Math.round(n).toLocaleString('pt-BR');
  const kcalOf = (m) => Math.max(0, Number(m.kcal) || 0);
  const lastDays = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d; });
  const wd = (d) => d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3);
  const brDay = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const monthKey = (off = 0) => { const n = new Date(); return P.dayStr(new Date(n.getFullYear(), n.getMonth() + off, 1)).slice(0, 7); };
  const monthName = (k) => { const [y, m] = k.split('-').map(Number); const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); return s.charAt(0).toUpperCase() + s.slice(1); };

  // gráfico de colunas simples: items = [{ label, value, text }]
  function cols(items, cls = '') {
    const max = Math.max(1, ...items.map((i) => i.value));
    return (
      '<div class="cols">' +
      items
        .map((i) => `<div class="col"><span class="v">${esc(i.text ?? (i.value || ''))}</span><i class="${cls}" style="height:${i.value ? Math.max(4, Math.round((i.value / max) * 68)) : 2}%"></i><span>${esc(i.label)}</span></div>`)
        .join('') +
      '</div>'
    );
  }
  const stat = (label, value, cls = '') => `<div class="card"><span class="muted">${esc(label)}</span><b class="${cls}">${value}</b></div>`;
  const sum3 = (...cells) => `<div class="sum3">${cells.join('')}</div>`;
  const box = (title, inner) => `<h2 style="margin:16px 0 8px">${esc(title)}</h2><div class="card">${inner}</div>`;
  const barRow = (label, text, pct, cls = '') =>
    `<div style="margin-bottom:10px"><div class="row between" style="margin-bottom:4px"><span>${esc(label)}</span><span class="muted">${esc(text)}</span></div>` +
    `<div class="bar ${cls}"><i style="width:${Math.max(2, Math.min(100, Math.round(pct)))}%"></i></div></div>`;
  const note = (t) => `<p class="muted" style="margin:0">${esc(t)}</p>`;

  // ---------- dados compartilhados ----------
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

  function foodDay(key) {
    const log = st().mealLog[key] || {};
    const meals = st().meals;
    return {
      plan: meals.reduce((n, m) => n + kcalOf(m), 0),
      eaten: meals.filter((m) => log[m.id] === 'ok').reduce((n, m) => n + kcalOf(m), 0),
      ok: meals.filter((m) => log[m.id] === 'ok').length,
      off: meals.filter((m) => log[m.id] === 'off').length,
      total: meals.length,
    };
  }

  function taskInfo() {
    const kb = st().kanban;
    const last = kb.columns[kb.columns.length - 1].id;
    const today = P.dayStr();
    const doneDay = (t) => P.dayStr(new Date(t.doneAt || t.createdAt || Date.now()));
    const done = kb.columns.length > 1 ? kb.tasks.filter((t) => t.col === last) : [];
    const open = kb.tasks.filter((t) => !done.includes(t));
    return { kb, last, today, doneDay, done, open, late: open.filter((t) => t.due && t.due < today) };
  }

  function money() {
    if (P.materializeExpenses) P.materializeExpenses();
    const today = P.dayStr();
    const ex = st().expenses;
    const sum = (arr, kind) => arr.filter((e) => e.kind === kind).reduce((n, e) => n + e.amount, 0);
    const dayList = ex.filter((e) => e.date === today);
    const upTo = ex.filter((e) => e.date <= today);
    const opening = Number(st().openingBalance) || 0;
    return {
      today,
      ex,
      dayOut: sum(dayList, 'out'),
      dayIn: sum(dayList, 'in'),
      opening,
      balance: opening + sum(upTo, 'in') - sum(upTo, 'out'),
      sum,
    };
  }

  function sessionsOn(key) {
    return st().sessions.filter((s) => P.dayStr(new Date(s.endedAt)) === key);
  }
  const volume = (s) => s.entries.reduce((n, e) => n + e.sets.reduce((m, x) => m + num(x.kg) * num(x.reps), 0), 0);

  // ---------- cartão "Hoje" na tela inicial ----------
  P.dashboardHome = () => {
    const today = P.dayStr();
    const cells = [];
    const cell = (mod, label, big, small, cls = '') =>
      `<button class="dcell" data-act="open-mod" data-id="${mod}"><span class="muted">${label}</span><b class="${cls}">${big}</b><span class="muted">${small}</span></button>`;

    if (on('alimentacao')) {
      const f = foodDay(today);
      cells.push(
        f.total
          ? cell('alimentacao', 'Calorias', `${fmtN(f.eaten)} kcal`, f.plan ? `de ${fmtN(f.plan)} no plano` : `${f.ok} de ${f.total} refeições`)
          : cell('alimentacao', 'Calorias', '—', 'monte seu plano')
      );
    }
    if (on('tarefas')) {
      const t = taskInfo();
      const doneToday = t.done.filter((x) => t.doneDay(x) === today).length;
      cells.push(
        cell('tarefas', 'Tarefas', `${doneToday} feita${doneToday === 1 ? '' : 's'} hoje`, `${t.open.length} pendente${t.open.length === 1 ? '' : 's'}${t.late.length ? ` · ${t.late.length} atrasada${t.late.length === 1 ? '' : 's'}` : ''}`)
      );
    }
    if (on('treino')) {
      const a = st().active;
      const s = sessionsOn(today);
      cells.push(
        a
          ? cell('treino', 'Treino', 'Em andamento', esc(a.name), 'pos')
          : s.length
          ? cell('treino', 'Treino', 'Feito hoje', esc(s[0].name), 'pos')
          : cell('treino', 'Treino', 'Nada hoje', st().sessions.length ? `último ${P.ago(st().sessions[0].endedAt)}` : 'sem treinos ainda')
      );
    }
    if (on('despesas')) {
      const m = money();
      cells.push(
        cell(
          'despesas',
          'Dinheiro hoje',
          m.dayOut || m.dayIn ? `${m.dayIn ? '+' + P.brl(m.dayIn) + ' ' : ''}${m.dayOut ? '−' + P.brl(m.dayOut) : ''}`.trim() : 'Sem lançamentos',
          `Saldo ${P.brl(m.balance)}`,
          ''
        )
      );
    }
    if (!cells.length) return '';
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return `<div class="card dash"><div class="muted" style="margin-bottom:8px">Hoje · ${esc(d)}</div><div class="dgrid">${cells.join('')}</div></div>`;
  };

  // ---------- resumo de cada módulo ----------
  const R = {};

  R.treino = () => {
    const ss = st().sessions;
    if (!ss.length) return '<div class="empty">Termine um treino para ver o resumo aqui.</div>';
    const days = lastDays(7);
    const perDay = days.map((d) => ({ label: wd(d), value: sessionsOn(P.dayStr(d)).length }));
    const now = Date.now();
    const inRange = (a, b) => ss.filter((s) => s.endedAt > now - b * DAY && s.endedAt <= now - a * DAY);
    const w1 = inRange(0, 7), w0 = inRange(7, 14), m1 = inRange(0, 30);
    const v1 = w1.reduce((n, s) => n + volume(s), 0), v0 = w0.reduce((n, s) => n + volume(s), 0);
    const avgMin = m1.length ? Math.round(m1.reduce((n, s) => n + (s.endedAt - s.startedAt), 0) / m1.length / 60000) : 0;
    const diff = v0 ? Math.round(((v1 - v0) / v0) * 100) : null;

    // evolução de carga por exercício: maior carga da primeira sessão x da última
    const byEx = {};
    ss.slice().reverse().forEach((s) => s.entries.forEach((e) => {
      const mx = Math.max(0, ...e.sets.map((x) => num(x.kg)));
      (byEx[e.name] = byEx[e.name] || []).push({ mx, at: s.endedAt });
    }));
    const evo = Object.entries(byEx)
      .filter(([, a]) => a.length >= 2 && a[a.length - 1].mx > 0)
      .sort((a, b) => b[1][b[1].length - 1].at - a[1][a[1].length - 1].at)
      .slice(0, 5)
      .map(([n, a]) => {
        const first = a[0].mx, last = a[a.length - 1].mx, d = last - first;
        return `<div class="row between" style="margin-bottom:8px"><span>${esc(n)}</span><span class="${d > 0 ? 'pos' : d < 0 ? 'neg' : 'muted'}">${fmtN(first)} → ${fmtN(last)} kg${d ? ` (${d > 0 ? '+' : ''}${fmtN(d)})` : ''}</span></div>`;
      })
      .join('');

    return (
      sum3(stat('7 dias', `${w1.length} treino${w1.length === 1 ? '' : 's'}`), stat('30 dias', `${m1.length} treino${m1.length === 1 ? '' : 's'}`), stat('Duração média', avgMin ? `${avgMin} min` : '—')) +
      box('Treinos nos últimos 7 dias', cols(perDay)) +
      box('Volume da semana', `<b style="font-size:20px">${fmtN(v1)} kg</b> <span class="muted">(carga × repetições)</span><div class="muted" style="margin-top:4px">${diff === null ? 'Sem semana anterior para comparar.' : `${diff >= 0 ? '+' : ''}${diff}% em relação aos 7 dias anteriores`}</div>`) +
      box('Evolução de carga', evo || note('Repita um exercício em 2 treinos para ver a evolução.'))
    );
  };

  R.alimentacao = () => {
    if (!st().meals.length) return '<div class="empty">Monte seu plano na aba Plano para ver o resumo.</div>';
    const days = lastDays(7);
    const data = days.map((d) => ({ d, f: foodDay(P.dayStr(d)) }));
    const kc = data.map((x) => ({ label: wd(x.d), value: x.f.eaten, text: x.f.eaten ? fmtN(x.f.eaten) : '' }));
    const logged = data.filter((x) => x.f.ok + x.f.off > 0);
    const okSum = data.reduce((n, x) => n + x.f.ok, 0), totSum = data.reduce((n, x) => n + x.f.total, 0);
    const adher = totSum ? Math.round((okSum / totSum) * 100) : 0;
    const avgKcal = logged.length ? Math.round(logged.reduce((n, x) => n + x.f.eaten, 0) / logged.length) : 0;
    const plan = data[0].f.plan;
    // refeição mais "furada" nos últimos 30 dias
    const off = {};
    lastDays(30).forEach((d) => { const log = st().mealLog[P.dayStr(d)] || {}; Object.entries(log).forEach(([id, v]) => { if (v === 'off') off[id] = (off[id] || 0) + 1; }); });
    const worst = Object.entries(off).sort((a, b) => b[1] - a[1])[0];
    const wm = worst && st().meals.find((m) => m.id === worst[0]);
    return (
      sum3(stat('Seguidas (7 dias)', `${adher}%`, adher >= 70 ? 'pos' : ''), stat('Média kcal/dia', avgKcal ? fmtN(avgKcal) : '—'), stat('Plano do dia', plan ? fmtN(plan) + ' kcal' : '—')) +
      box('Calorias por dia (refeições seguidas)', cols(kc)) +
      box('Onde você mais fugiu (30 dias)', wm ? `<div class="row between"><span>${esc(wm.name)}</span><span class="muted">${worst[1]} vez${worst[1] === 1 ? '' : 'es'}</span></div>` : note('Nenhuma fuga marcada. Continue assim!'))
    );
  };

  R.tarefas = () => {
    const t = taskInfo();
    const days = lastDays(7);
    const per = days.map((d) => ({ label: wd(d), value: t.done.filter((x) => t.doneDay(x) === P.dayStr(d)).length }));
    const wkFrom = P.dayStr(days[0]), mk = monthKey();
    const week = t.done.filter((x) => t.doneDay(x) >= wkFrom).length;
    const month = t.done.filter((x) => t.doneDay(x).slice(0, 7) === mk).length;
    const upcoming = t.open.filter((x) => x.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
    const maxCol = Math.max(1, ...t.kb.columns.map((c) => t.kb.tasks.filter((x) => x.col === c.id).length));
    return (
      sum3(stat('Pendentes', String(t.open.length)), stat('Atrasadas', String(t.late.length), t.late.length ? 'neg' : ''), stat('Feitas no mês', String(month))) +
      box('Concluídas nos últimos 7 dias', cols(per) + `<p class="muted" style="margin:8px 0 0">${week} na semana</p>`) +
      box('Por coluna', t.kb.columns.map((c) => { const n = t.kb.tasks.filter((x) => x.col === c.id).length; return barRow(c.name, String(n), (n / maxCol) * 100); }).join('')) +
      box('Próximos prazos', upcoming.length ? upcoming.map((x) => `<div class="row between" style="margin-bottom:8px"><span>${esc(x.title)}</span><span class="${x.due < t.today ? 'neg' : 'muted'}">${esc(brDay(x.due))}${x.due < t.today ? ' · atrasada' : ''}</span></div>`).join('') : note('Nenhuma tarefa pendente com prazo.'))
    );
  };

  R.lembretes = () => {
    const rs = st().reminders;
    const open = rs.filter((r) => !r.done).sort((a, b) => a.dueAt - b.dueAt);
    const now = Date.now(), today = P.startOfDay(new Date());
    const late = open.filter((r) => r.dueAt < now);
    const todays = open.filter((r) => r.dueAt >= now && P.startOfDay(new Date(r.dueAt)) === today);
    const next = open.filter((r) => r.dueAt >= now).slice(0, 4);
    const doneWeek = rs.filter((r) => r.done && r.doneAt && r.doneAt > now - 7 * DAY).length;
    return (
      sum3(stat('Atrasados', String(late.length), late.length ? 'neg' : ''), stat('Hoje', String(todays.length)), stat('Feitos (7 dias)', String(doneWeek))) +
      box('Próximos lembretes', next.length ? next.map((r) => `<div class="row between" style="margin-bottom:8px"><span>${esc(r.text)}</span><span class="muted">${esc(new Date(r.dueAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span></div>`).join('') : note('Nenhum lembrete pela frente.'))
    );
  };

  R.notas = () => {
    const ns = st().notes.filter((n) => String(n.text || '').trim() || String(n.title || '').trim());
    const now = Date.now();
    const recent = ns.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
    const title = (n) => (String(n.title || '').trim() || String(n.text || '').split('\n').map((l) => l.trim()).find(Boolean) || 'Nota vazia').slice(0, 50);
    return (
      sum3(stat('Notas', String(ns.length)), stat('Editadas (7 dias)', String(ns.filter((n) => n.updatedAt > now - 7 * DAY).length)), stat('Criadas no mês', String(ns.filter((n) => P.dayStr(new Date(n.createdAt)).slice(0, 7) === monthKey()).length))) +
      box('Últimas editadas', recent.length ? recent.map((n) => `<div class="row between" style="margin-bottom:8px"><span>${esc(title(n))}</span><span class="muted">${esc(P.ago(n.updatedAt))}</span></div>`).join('') : note('Nenhuma nota ainda.'))
    );
  };

  let saldoDraft = null;
  const toCents = (v) => {
    let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
    const neg = s.startsWith('-');
    s = s.replace(/-/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? (neg ? -1 : 1) * Math.round(n * 100) : 0;
  };
  const centsStr = (c) => (c / 100).toFixed(2).replace('.', ',');

  R.despesas = () => {
    const m = money();
    const cur = monthKey(), prev = monthKey(-1);
    const of = (k) => m.ex.filter((e) => String(e.date).startsWith(k));
    const out = (k) => m.sum(of(k), 'out'), inc = (k) => m.sum(of(k), 'in');
    const pending = m.sum(m.ex.filter((e) => String(e.date).startsWith(cur) && e.date > m.today), 'out');
    const o1 = out(cur), o0 = out(prev);
    const delta = o0 ? Math.round(((o1 - o0) / o0) * 100) : null;
    const months = [-5, -4, -3, -2, -1, 0].map((o) => { const k = monthKey(o); return { label: monthName(k), value: out(k) / 100, text: out(k) ? fmtN(out(k) / 100) : '' }; });
    const byCat = {};
    of(cur).filter((e) => e.kind === 'out').forEach((e) => { byCat[e.cat || 'Outros'] = (byCat[e.cat || 'Outros'] || 0) + e.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (saldoDraft === null) saldoDraft = centsStr(m.opening);
    return (
      `<div class="card live"><span class="muted">Saldo disponível hoje</span><b style="display:block;font-size:26px" class="${m.balance < 0 ? 'neg' : 'pos'}">${P.brl(m.balance)}</b>` +
      '<span class="muted">Saldo inicial + receitas − despesas até hoje</span></div>' +
      sum3(stat('Receitas do mês', P.brl(inc(cur)), 'pos'), stat('Despesas do mês', P.brl(o1)), stat('A vencer no mês', P.brl(pending))) +
      box('Despesas por mês', cols(months, 'gold') + `<p class="muted" style="margin:8px 0 0">${delta === null ? 'Sem mês anterior para comparar.' : `Este mês: ${delta >= 0 ? '+' : ''}${delta}% em relação ao mês passado`} (valores em R$)</p>`) +
      box('Maiores categorias do mês', cats.length ? cats.map(([c, v]) => barRow(c, P.brl(v), (v / cats[0][1]) * 100, 'gold')).join('') : note('Sem despesas neste mês.')) +
      box('Saldo inicial', '<p class="muted" style="margin-top:0">Quanto você tinha na conta antes de começar a lançar aqui. Ajuste quando quiser.</p>' +
        `<div class="row"><input type="text" inputmode="decimal" data-in="r-saldo" value="${esc(saldoDraft)}"><button class="primary" data-act="r-saldo-save">Salvar</button></div>`)
    );
  };

  P.coreActs['r-saldo-save'] = () => {
    st().openingBalance = toCents(saldoDraft);
    saldoDraft = null;
    P.save();
    P.render();
    return true;
  };
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el && el.dataset && el.dataset.in === 'r-saldo') saldoDraft = el.value;
  });

  // ---------- liga a aba "Resumo" em cada módulo ----------
  const FIRST = { tarefas: ['quadro', 'Quadro'], lembretes: ['lista', 'Lembretes'], notas: ['lista', 'Notas'] };
  Object.keys(R).forEach((id) => {
    const m = P.modules[id];
    if (!m) return;
    if (!m.tabs.length && FIRST[id]) m.tabs.push(FIRST[id]);
    m.tabs.push(['resumo', 'Resumo']);
    const view = m.view.bind(m);
    m.view = (tab) => {
      if (tab !== 'resumo') return view(tab);
      try { return R[id](); } catch (e) { return '<div class="empty">Não foi possível montar o resumo.</div>'; }
    };
    if (m.footer) {
      const footer = m.footer.bind(m);
      m.footer = (tab) => (tab === 'resumo' ? '' : footer(tab));
    }
    const enter = m.onEnter ? m.onEnter.bind(m) : null;
    m.onEnter = () => { saldoDraft = null; if (enter) enter(); };
  });
})();
