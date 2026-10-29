// Prumo — bloco de notas: a primeira linha vira o título
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, uid } = P;
  const st = () => P.state;

  let openId = null; // nota aberta para edição

  const lines = (n) => String(n.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const custom = (n) => String(n.title || '').trim();
  const titleOf = (n) => (custom(n) || lines(n)[0] || 'Nota vazia').slice(0, 70);
  const previewOf = (n) => (custom(n) ? lines(n) : lines(n).slice(1)).join(' · ').slice(0, 90);

  function closeNote() {
    const n = st().notes.find((x) => x.id === openId);
    if (n && !String(n.text || '').trim() && !custom(n)) st().notes = st().notes.filter((x) => x.id !== openId);
    openId = null;
    P.save();
  }

  function viewList() {
    const notes = st().notes.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    return (
      '<div class="row between"><h2 style="margin:8px 0">Notas</h2><button class="accent small" data-act="n-new">+ Nova</button></div>' +
      (notes.length
        ? '<input type="search" data-in="n-search" placeholder="Buscar nas notas" style="margin-bottom:12px">' +
          notes
            .map(
              (n) =>
                `<button class="note-item" data-act="n-open" data-id="${esc(n.id)}" data-text="${esc((String(n.title || '') + ' ' + String(n.text || '')).toLowerCase())}">` +
                `<b>${esc(titleOf(n))}</b><span class="muted">${esc(previewOf(n) || P.ago(n.updatedAt))}</span></button>`
            )
            .join('')
        : '<div class="empty">Nenhuma nota ainda.</div>')
    );
  }

  function viewEdit() {
    const n = st().notes.find((x) => x.id === openId);
    if (!n) return viewList();
    return (
      '<div class="row between" style="margin:8px 0 10px"><span class="muted">Editado ' + esc(P.ago(n.updatedAt)) + '</span>' +
      '<button class="danger small" data-act="n-del">Excluir</button></div>' +
      `<input type="text" data-in="n-title" placeholder="Título da nota (opcional)" value="${esc(n.title || '')}" style="margin-bottom:10px;font-weight:700">` +
      `<textarea data-in="n-text" placeholder="Escreva aqui. Sem título, a primeira linha é usada como título.">${esc(n.text || '')}</textarea>`
    );
  }

  P.register({
    id: 'notas',
    title: 'Notas',
    onEnter() { openId = null; },
    back() {
      if (!openId) return false;
      closeNote();
      return true;
    },
    status() {
      const n = st().notes.length;
      return n ? `${n} nota${n === 1 ? '' : 's'}` : 'Nenhuma nota';
    },
    view() {
      return openId ? viewEdit() : viewList();
    },
    act(name, el) {
      switch (name) {
        case 'n-new': {
          const n = { id: uid(), title: '', text: '', createdAt: Date.now(), updatedAt: Date.now() };
          st().notes.push(n);
          openId = n.id;
          P.save();
          P.render();
          const t = P.$('[data-in="n-title"]');
          if (t) t.focus();
          return true;
        }
        case 'n-open': openId = el.dataset.id; P.render(); window.scrollTo(0, 0); return true;
        case 'n-del':
          if (confirm('Excluir esta nota?')) {
            st().notes = st().notes.filter((x) => x.id !== openId);
            openId = null;
            P.save();
            P.render();
          }
          return true;
      }
      return false;
    },
    input(el) {
      const k = el.dataset.in;
      if (k === 'n-title') {
        const n = st().notes.find((x) => x.id === openId);
        if (n) {
          n.title = el.value;
          n.updatedAt = Date.now();
          P.save();
        }
        return true;
      }
      if (k === 'n-text') {
        const n = st().notes.find((x) => x.id === openId);
        if (n) {
          n.text = el.value;
          n.updatedAt = Date.now();
          P.save();
        }
        return true;
      }
      if (k === 'n-search') {
        const q = el.value.trim().toLowerCase();
        document.querySelectorAll('.note-item').forEach((it) => {
          it.hidden = Boolean(q) && !it.dataset.text.includes(q);
        });
        return true;
      }
      return false;
    },
  });
})();
