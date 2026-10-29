// Prumo — controle financeiro de despesas e receitas
// Cada lançamento já guarda "source" e "externalId", para no futuro receber lançamentos vindos de bancos
// sem mudar a estrutura (valores em centavos, para não ter erro de arredondamento).
// Lançamentos recorrentes: um modelo (recurring) gera os lançamentos sozinho a cada período.
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, uid, pad } = P;
  const st = () => P.state;

  const INCOME_CATS = ['Salário', 'Rendimentos', 'Outras receitas'];
  const PERIODS = [
    ['day', 'Dia'],
    ['week', 'Semana'],
    ['month', 'Mês'],
    ['year', 'Ano'],
  ];
  const EVERY = { day: 'a cada dia', week: 'a cada semana', month: 'a cada mês', year: 'a cada ano' };

  let month = P.dayStr().slice(0, 7); // 'AAAA-MM'
  let form = null; // { kind, amount, desc, cat, date, rec, period }

  const blank = () => ({
    kind: 'out',
    amount: '',
    desc: '',
    cat: st().expenseCats[0] || 'Outros',
    date: P.dayStr(),
    rec: false,
    period: 'month',
  });

  const monthLabel = (k) => {
    const [y, m] = k.split('-').map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const shiftMonth = (k, n) => {
    const [y, m] = k.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const brDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

  // "1.234,56" -> 123456 | "12,5" -> 1250 | "12.5" -> 1250
  const toCents = (v) => {
    let s = String(v ?? '').trim().replace(/[^\d.,]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  // ---------- recorrência ----------
  // próxima data depois de "dateStr": mês e ano mantêm o dia original (ex.: dia 31 vira 30 ou 28 quando preciso)
  function addPeriod(dateStr, period, anchor) {
    const [y, m, d] = dateStr.split('-').map(Number);
    let dt;
    if (period === 'day') dt = new Date(y, m - 1, d + 1);
    else if (period === 'week') dt = new Date(y, m - 1, d + 7);
    else {
      const first = new Date(y, m - 1 + (period === 'year' ? 12 : 1), 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      dt = new Date(first.getFullYear(), first.getMonth(), Math.min(anchor || d, last));
    }
    return P.dayStr(dt);
  }

  // cria os lançamentos que já venceram (até hoje); roda sempre que a tela de despesas é montada
  function materialize() {
    const today = P.dayStr();
    let changed = false;
    st().recurring.forEach((r) => {
      let guard = 0;
      while (r.next <= today && guard++ < 800) {
        st().expenses.push({
          id: uid(),
          kind: r.kind,
          amount: r.amount,
          date: r.next,
          desc: r.desc,
          cat: r.cat,
          source: 'recorrente',
          externalId: null,
          recurringId: r.id,
          createdAt: Date.now(),
        });
        r.next = addPeriod(r.next, r.period, r.anchor);
        changed = true;
      }
    });
    if (changed) P.save();
  }

  const ofMonth = (k) => st().expenses.filter((e) => String(e.date).startsWith(k));
  const sum = (arr, kind) => arr.filter((e) => e.kind === kind).reduce((n, e) => n + e.amount, 0);

  // ---------- telas ----------
  function viewMes() {
    const list = ofMonth(month).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    const out = sum(list, 'out');
    const inc = sum(list, 'in');
    const bal = inc - out;

    const byCat = {};
    list.filter((e) => e.kind === 'out').forEach((e) => { byCat[e.cat || 'Outros'] = (byCat[e.cat || 'Outros'] || 0) + e.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

    return (
      '<div class="row between" style="margin:6px 0 12px">' +
      '<button class="small" data-act="d-prev" aria-label="Mês anterior">‹</button>' +
      `<b>${esc(monthLabel(month))}</b>` +
      '<button class="small" data-act="d-next" aria-label="Próximo mês">›</button></div>' +
      '<div class="sum3">' +
      `<div class="card"><span class="muted">Receitas</span><b class="pos">${P.brl(inc)}</b></div>` +
      `<div class="card"><span class="muted">Despesas</span><b>${P.brl(out)}</b></div>` +
      `<div class="card"><span class="muted">Saldo</span><b class="${bal < 0 ? 'neg' : 'pos'}">${P.brl(bal)}</b></div></div>` +
      (cats.length
        ? '<h2 style="margin-top:6px">Para onde foi</h2><div class="card">' +
          cats
            .map(
              ([c, v]) =>
                `<div style="margin-bottom:10px"><div class="row between" style="margin-bottom:4px"><span>${esc(c)}</span>` +
                `<span class="amt">${P.brl(v)}</span></div><div class="row"><div class="bar gold"><i style="width:${Math.max(3, Math.round((v / out) * 100))}%"></i></div>` +
                `<span class="muted" style="width:40px;text-align:right">${Math.round((v / out) * 100)}%</span></div></div>`
            )
            .join('') +
          '</div>'
        : '') +
      '<h2>Lançamentos</h2>' +
      (list.length
        ? list
            .map(
              (e) =>
                '<div class="card"><div class="row">' +
                `<div class="grow"><div>${esc(e.desc || e.cat || '')}</div>` +
                `<div class="muted">${esc(e.date.slice(8, 10))}/${esc(e.date.slice(5, 7))} · ${esc(e.cat || '')}${e.recurringId ? ' · recorrente' : ''}</div></div>` +
                `<span class="amt ${e.kind === 'in' ? 'pos' : ''}">${e.kind === 'in' ? '+' : '−'} ${P.brl(e.amount)}</span>` +
                `<button class="danger small" data-act="d-del" data-id="${esc(e.id)}" aria-label="Excluir lançamento">✕</button></div></div>`
            )
            .join('')
        : '<div class="empty">Nenhum lançamento neste mês.</div>')
    );
  }

  function viewLancar() {
    if (!form) form = blank();
    const cats = form.kind === 'in' ? INCOME_CATS : st().expenseCats;
    return (
      '<h2 style="margin:8px 0">Novo lançamento</h2>' +
      '<div class="row">' +
      `<button class="opt out${form.kind === 'out' ? ' on' : ''}" data-act="d-kind" data-k="out">Despesa</button>` +
      `<button class="opt${form.kind === 'in' ? ' on' : ''}" data-act="d-kind" data-k="in">Receita</button></div>` +
      '<label class="f">Valor (R$)</label>' +
      `<input type="text" inputmode="decimal" data-in="d-amount" placeholder="0,00" value="${esc(form.amount)}">` +
      '<label class="f">Descrição</label>' +
      `<input type="text" data-in="d-desc" placeholder="Ex.: Mercado" value="${esc(form.desc)}">` +
      '<label class="f">Categoria</label>' +
      '<select data-in="d-cat">' +
      cats.map((c) => `<option${c === form.cat ? ' selected' : ''}>${esc(c)}</option>`).join('') +
      '</select>' +
      `<label class="f">${form.rec ? 'Data do primeiro lançamento' : 'Data'}</label>` +
      `<input type="date" data-in="d-date" value="${esc(form.date)}">` +
      '<label class="f">Tipo</label>' +
      '<div class="row">' +
      `<button class="opt${form.rec ? '' : ' on'}" data-act="d-rec" data-v="0">Eventual</button>` +
      `<button class="opt${form.rec ? ' on' : ''}" data-act="d-rec" data-v="1">Recorrente</button></div>` +
      (form.rec
        ? '<label class="f">Repetir a cada</label>' +
          '<select data-in="d-period">' +
          PERIODS.map(([v, l]) => `<option value="${v}"${form.period === v ? ' selected' : ''}>${l}</option>`).join('') +
          '</select>' +
          '<p class="muted" style="margin:8px 0 0">Os próximos lançamentos entram sozinhos nas datas seguintes, e você acompanha ou para na aba Recorrentes.</p>'
        : '') +
      `<button class="primary block" style="margin-top:16px" data-act="d-save">${form.rec ? 'Criar recorrente' : 'Lançar'}</button>`
    );
  }

  function viewRec() {
    const list = st().recurring.slice().sort((a, b) => a.next.localeCompare(b.next));
    return (
      '<h2 style="margin:8px 0">Recorrentes</h2>' +
      (list.length
        ? list
            .map(
              (r) =>
                '<div class="card"><div class="row">' +
                `<div class="grow"><div>${esc(r.desc || r.cat || '')}</div>` +
                `<div class="muted">${esc(EVERY[r.period] || '')} · próximo em ${esc(brDate(r.next))}</div>` +
                `<div class="muted">${esc(r.cat || '')}</div></div>` +
                `<span class="amt ${r.kind === 'in' ? 'pos' : ''}">${r.kind === 'in' ? '+' : '−'} ${P.brl(r.amount)}</span></div>` +
                `<button class="danger small" style="margin-top:10px" data-act="d-recdel" data-id="${esc(r.id)}">Parar recorrência</button></div>`
            )
            .join('')
        : '<div class="empty">Nenhum lançamento recorrente.<br>Em Lançar, escolha o tipo Recorrente.</div>')
    );
  }

  P.register({
    id: 'despesas',
    title: 'Despesas',
    tabs: [
      ['mes', 'Mês'],
      ['lancar', 'Lançar'],
      ['rec', 'Recorrentes'],
    ],
    onEnter() {
      form = null;
      month = P.dayStr().slice(0, 7);
    },
    status() {
      materialize();
      const out = sum(ofMonth(P.dayStr().slice(0, 7)), 'out');
      return out ? `${P.brl(out)} no mês` : 'Sem gastos no mês';
    },
    view(tab) {
      materialize();
      return tab === 'lancar' ? viewLancar() : tab === 'rec' ? viewRec() : viewMes();
    },
    act(name, el) {
      switch (name) {
        case 'd-prev': month = shiftMonth(month, -1); P.render(); return true;
        case 'd-next': month = shiftMonth(month, 1); P.render(); return true;
        case 'd-kind':
          if (!form) form = blank();
          form.kind = el.dataset.k;
          form.cat = (form.kind === 'in' ? INCOME_CATS : st().expenseCats)[0];
          P.render();
          return true;
        case 'd-rec':
          if (!form) form = blank();
          form.rec = el.dataset.v === '1';
          P.render();
          return true;
        case 'd-save': {
          if (!form) return true;
          const amount = toCents(form.amount);
          if (amount <= 0) return alert('Informe um valor maior que zero.'), true;
          if (!form.date) return alert('Escolha a data.'), true;
          if (form.rec) {
            st().recurring.push({
              id: uid(),
              kind: form.kind,
              amount,
              desc: form.desc.trim(),
              cat: form.cat,
              period: form.period,
              anchor: Number(form.date.slice(8, 10)),
              next: form.date,
              createdAt: Date.now(),
            });
            materialize();
            month = P.dayStr().slice(0, 7);
            form = null;
            P.save();
            P.go({ tab: 'rec' });
            window.scrollTo(0, 0);
            return true;
          }
          st().expenses.push({
            id: uid(),
            kind: form.kind,
            amount,
            date: form.date,
            desc: form.desc.trim(),
            cat: form.cat,
            source: 'manual',
            externalId: null,
            createdAt: Date.now(),
          });
          month = form.date.slice(0, 7);
          form = null;
          P.save();
          P.go({ tab: 'mes' });
          window.scrollTo(0, 0);
          return true;
        }
        case 'd-del':
          if (confirm('Excluir este lançamento?')) {
            st().expenses = st().expenses.filter((e) => e.id !== el.dataset.id);
            P.save();
            P.render();
          }
          return true;
        case 'd-recdel':
          if (confirm('Parar esta recorrência? Os lançamentos que já entraram continuam no histórico.')) {
            st().recurring = st().recurring.filter((r) => r.id !== el.dataset.id);
            P.save();
            P.render();
          }
          return true;
      }
      return false;
    },
    input(el) {
      const k = el.dataset.in;
      if (!k || !k.startsWith('d-') || !form) return false;
      if (k === 'd-amount') form.amount = el.value;
      else if (k === 'd-desc') form.desc = el.value;
      else if (k === 'd-cat') form.cat = el.value;
      else if (k === 'd-date') form.date = el.value;
      else if (k === 'd-period') form.period = el.value;
      return true;
    },
  });
})();
