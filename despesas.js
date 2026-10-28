// Prumo — controle financeiro de despesas e receitas
// Cada lançamento já guarda "source" e "externalId", para no futuro receber lançamentos vindos de bancos
// sem mudar a estrutura (valores em centavos, para não ter erro de arredondamento).
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, uid, pad } = P;
  const st = () => P.state;

  const INCOME_CATS = ['Salário', 'Rendimentos', 'Outras receitas'];

  let month = P.dayStr().slice(0, 7); // 'AAAA-MM'
  let form = null; // { kind, amount, desc, cat, date }

  const blank = () => ({ kind: 'out', amount: '', desc: '', cat: st().expenseCats[0] || 'Outros', date: P.dayStr() });

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

  // "1.234,56" -> 123456 | "12,5" -> 1250 | "12.5" -> 1250
  const toCents = (v) => {
    let s = String(v ?? '').trim().replace(/[^\d.,]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  const ofMonth = (k) => st().expenses.filter((e) => String(e.date).startsWith(k));
  const sum = (arr, kind) => arr.filter((e) => e.kind === kind).reduce((n, e) => n + e.amount, 0);

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
                `<div class="muted">${esc(e.date.slice(8, 10))}/${esc(e.date.slice(5, 7))} · ${esc(e.cat || '')}</div></div>` +
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
      '<label class="f">Data</label>' +
      `<input type="date" data-in="d-date" value="${esc(form.date)}">` +
      '<button class="primary block" style="margin-top:16px" data-act="d-save">Lançar</button>'
    );
  }

  P.register({
    id: 'despesas',
    title: 'Despesas',
    tabs: [
      ['mes', 'Mês'],
      ['lancar', 'Lançar'],
    ],
    onEnter() {
      form = null;
      month = P.dayStr().slice(0, 7);
    },
    status() {
      const out = sum(ofMonth(P.dayStr().slice(0, 7)), 'out');
      return out ? `${P.brl(out)} no mês` : 'Sem gastos no mês';
    },
    view(tab) {
      return tab === 'lancar' ? viewLancar() : viewMes();
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
        case 'd-save': {
          if (!form) return true;
          const amount = toCents(form.amount);
          if (amount <= 0) return alert('Informe um valor maior que zero.'), true;
          if (!form.date) return alert('Escolha a data.'), true;
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
      return true;
    },
  });
})();
