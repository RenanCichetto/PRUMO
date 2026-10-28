// Prumo — tela inicial, ajustes de módulos, backup global e inicialização
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, $ } = P;

  // ---------- tela inicial ----------
  P.homeView = () => {
    const ids = P.order.filter((id) => P.state.modules[id]);
    const a = P.state.active;
    let h = '';
    if (a && P.state.modules.treino) {
      h +=
        `<div class="card live"><div class="row between"><div><div class="muted">Treino em andamento</div><b>${esc(a.name)}</b></div>` +
        '<button class="primary small" data-act="open-mod" data-id="treino">Voltar ao treino</button></div></div>';
    }
    if (!ids.length) {
      h += '<div class="empty">Nenhum módulo ativo. Toque em Módulos para escolher.</div>';
    } else {
      h +=
        '<div class="grid">' +
        ids
          .map((id) => {
            const m = P.modules[id];
            let s = '';
            try { s = m.status ? m.status() : ''; } catch (e) { s = ''; }
            return (
              `<button class="tile" data-act="open-mod" data-id="${id}"><span class="ico">${P.icon(id, 28)}</span>` +
              `<b>${esc(m.title)}</b><span class="muted">${esc(s)}</span></button>`
            );
          })
          .join('') +
        '</div>';
    }
    h +=
      '<div class="row" style="margin-top:16px"><button class="ghost grow" data-act="overlay" data-id="settings">Módulos</button>' +
      '<button class="ghost grow" data-act="overlay" data-id="backup">Backup</button></div>';
    return h;
  };

  // ---------- módulos ativos ----------
  P.overlays.settings = {
    title: 'Módulos',
    view() {
      return (
        '<p class="muted">Escolha quais módulos aparecem na tela inicial. Desligar um módulo só esconde, os dados continuam guardados.</p>' +
        P.order
          .map((id) => {
            const on = !!P.state.modules[id];
            return (
              `<div class="card mod-row"><span class="ico" style="color:var(--gold)">${P.icon(id, 26)}</span>` +
              `<b class="grow">${esc(P.modules[id].title)}</b>` +
              `<button class="switch${on ? ' on' : ''}" data-act="toggle-mod" data-id="${id}" aria-label="${on ? 'Desligar' : 'Ligar'} ${esc(P.modules[id].title)}"><i></i></button></div>`
            );
          })
          .join('')
      );
    },
  };
  P.coreActs['toggle-mod'] = (el) => {
    const id = el.dataset.id;
    P.state.modules[id] = !P.state.modules[id];
    P.save();
    P.render();
    return true;
  };

  // ---------- backup ----------
  P.overlays.backup = {
    title: 'Backup',
    view() {
      const s = P.state;
      const resumo = [
        `${s.workouts.length} treino(s) e ${s.sessions.length} sessão(ões)`,
        `${s.reminders.length} lembrete(s)`,
        `${s.meals.length} refeição(ões) no plano`,
        `${s.kanban.tasks.length} tarefa(s)`,
        `${s.notes.length} nota(s)`,
        `${s.expenses.length} lançamento(s) de despesas`,
      ].join(' · ');
      return (
        '<div class="card"><p class="muted" style="margin-top:0">Seus dados ficam só neste aparelho. ' +
        `Guardado agora: ${esc(resumo)}. Exporte uma cópia de vez em quando para não perder nada.</p>` +
        '<button class="primary block" data-act="export">Exportar backup</button>' +
        '<button class="block" style="margin-top:8px" data-act="import">Importar backup</button>' +
        '<p class="muted" style="margin-bottom:0">Importar substitui os dados que estão no aparelho.</p>' +
        '<input type="file" id="importFile" accept="application/json,.json" hidden></div>'
      );
    },
  };

  async function exportData() {
    const text = JSON.stringify({ app: 'prumo', version: 2, exportedAt: new Date().toISOString(), ...P.state, active: null }, null, 2);
    const name = `prumo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Backup do Prumo' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const valid =
          data && typeof data === 'object' && (data.app === 'prumo' || (Array.isArray(data.workouts) && Array.isArray(data.sessions)));
        if (!valid) throw new Error('formato');
        const n = P.normalize(data);
        const msg =
          `Importar ${n.workouts.length} treino(s), ${n.sessions.length} sessão(ões), ${n.reminders.length} lembrete(s), ` +
          `${n.kanban.tasks.length} tarefa(s), ${n.notes.length} nota(s) e ${n.expenses.length} lançamento(s)? Isso substitui os dados atuais.`;
        if (!confirm(msg)) return;
        P.setState(data);
        P.render();
      } catch (e) {
        alert('Esse arquivo não parece um backup do Prumo.');
      }
    };
    reader.readAsText(file);
  }

  P.coreActs.export = () => { exportData(); return true; };
  P.coreActs.import = () => { const f = $('#importFile'); if (f) f.click(); return true; };
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'importFile' && ev.target.files[0]) {
      importData(ev.target.files[0]);
      ev.target.value = '';
    }
  });

  // ---------- sem zoom ----------
  // O toque duplo é bloqueado no CSS (touch-action); aqui bloqueamos a pinça.
  ['gesturestart', 'gesturechange'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));

  // ---------- início ----------
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ok */ }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  P.render();
})();
