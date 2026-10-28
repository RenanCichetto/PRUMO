// Prumo — módulo de treino (primeira entrega)
// Dados ficam no aparelho (localStorage). Sincronização com Supabase entra numa etapa futura.
(() => {
  'use strict';

  const KEY = 'prumo.v1';
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  // ---------- estado ----------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.workouts) && Array.isArray(s.sessions)) {
        return { workouts: s.workouts, sessions: s.sessions, active: s.active || null };
      }
    } catch (e) { /* começa vazio */ }
    return { workouts: [], sessions: [], active: null };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sem espaço ou bloqueado */ }
  }

  let state = load();
  let tab = 'hoje';
  let draft = null; // treino em edição
  let screen = null; // subtela do Histórico ('backup')

  // ---------- formatação ----------
  const fmtDate = (ts) => {
    const d = new Date(ts);
    return (
      d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) +
      ' · ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    );
  };
  const fmtDur = (ms) => {
    const min = Math.max(1, Math.round(ms / 60000));
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
  };
  const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const fmtKg = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

  // ---------- cronômetro de descanso ----------
  let restEnd = 0;
  let restDoneUntil = 0;
  let audioCtx = null;

  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* sem áudio */ }
  }
  function beep() {
    try {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.2;
      o.start();
      o.stop(audioCtx.currentTime + 0.35);
    } catch (e) { /* sem áudio */ }
  }
  function buzz() {
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* sem vibração */ }
  }

  function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  // Barra fixa no rodapé: mostra o tempo do treino e, durante o descanso, a contagem regressiva.
  let dockMode = '';
  function setDock(mode) {
    if (mode === dockMode) return;
    dockMode = mode;
    const d = $('#dock');
    if (mode === 'none') {
      d.hidden = true;
      d.className = '';
      d.innerHTML = '';
    } else if (mode === 'rest') {
      d.hidden = false;
      d.className = 'rest';
      d.innerHTML =
        '<div><div class="lbl">Descanso</div><div class="time" id="dockTime"></div></div>' +
        '<div class="row"><button data-act="rest-add">+15s</button><button data-act="rest-skip">Pular</button></div>';
    } else {
      d.hidden = false;
      d.className = '';
      d.innerHTML = '<div><div class="lbl">Treino em andamento</div><div class="time" id="dockTime"></div></div>';
    }
  }

  function startRest(sec) {
    if (!sec || sec <= 0) return;
    restEnd = Date.now() + sec * 1000;
    restDoneUntil = 0;
    tick();
  }
  function stopRest() {
    restEnd = 0;
    restDoneUntil = 0;
    tick();
  }

  function tick() {
    if (!state.active) {
      restEnd = 0;
      restDoneUntil = 0;
      return setDock('none');
    }
    const now = Date.now();
    if (restEnd && restEnd - now <= 0) {
      restEnd = 0;
      restDoneUntil = now + 4000;
      beep();
      buzz();
    }
    if (restDoneUntil && now > restDoneUntil) restDoneUntil = 0;
    const resting = restEnd > 0 || restDoneUntil > 0;
    setDock(resting ? 'rest' : 'elapsed');
    const t = $('#dockTime');
    if (!t) return;
    t.textContent = resting
      ? restEnd
        ? fmtClock(Math.ceil((restEnd - now) / 1000))
        : 'Pronto!'
      : fmtElapsed(now - state.active.startedAt);
  }
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);

  // ---------- regras do treino ----------
  function startWorkout(id) {
    const w = state.workouts.find((x) => x.id === id);
    if (!w) return;
    if (state.active && !confirm('Já existe um treino em andamento. Substituir por este?')) return;
    const last = state.sessions.find((s) => s.workoutId === id);
    const entries = w.exercises.map((ex) => {
      const prev = last && last.entries.find((e) => e.name.toLowerCase() === ex.name.toLowerCase());
      const sets = Array.from({ length: ex.sets }, (_, i) => {
        const p = prev ? prev.sets[i] || prev.sets[prev.sets.length - 1] : null;
        // carga com vírgula, igual ao que o teclado em português digita
        return { kg: p ? String(p.kg || '').replace('.', ',') : '', reps: p ? String(p.reps || '') : String(ex.reps || ''), done: false };
      });
      return { name: ex.name, restSec: ex.restSec, sets };
    });
    state.active = { workoutId: id, name: w.name, startedAt: Date.now(), entries };
    stopRest();
    save();
    tab = 'hoje';
    render();
  }

  function finishWorkout() {
    const a = state.active;
    if (!a) return;
    const entries = a.entries
      .map((e) => ({
        name: e.name,
        sets: e.sets.filter((s) => s.done).map((s) => ({ kg: num(s.kg), reps: num(s.reps) })),
      }))
      .filter((e) => e.sets.length);
    if (!entries.length) {
      if (confirm('Nenhuma série foi marcada. Descartar este treino?')) {
        state.active = null;
        stopRest();
        save();
        render();
      }
      return;
    }
    state.sessions.unshift({ id: uid(), workoutId: a.workoutId, name: a.name, startedAt: a.startedAt, endedAt: Date.now(), entries });
    state.active = null;
    stopRest();
    save();
    tab = 'historico';
    render();
  }

  function newDraft() {
    return { id: null, name: '', exercises: [{ id: uid(), name: '', sets: 3, reps: '10', restSec: 90 }] };
  }

  function saveDraft() {
    const name = draft.name.trim();
    const exercises = draft.exercises
      .map((e) => ({
        id: e.id,
        name: String(e.name).trim(),
        sets: Math.min(20, Math.max(1, Math.round(num(e.sets)) || 3)),
        reps: String(e.reps || '').trim() || '10',
        restSec: Math.min(600, Math.max(0, Math.round(num(e.restSec)))),
      }))
      .filter((e) => e.name);
    if (!name) return alert('Dê um nome ao treino.');
    if (!exercises.length) return alert('Adicione pelo menos um exercício com nome.');
    const w = { id: draft.id || uid(), name, exercises };
    const i = state.workouts.findIndex((x) => x.id === w.id);
    if (i >= 0) state.workouts[i] = w;
    else state.workouts.push(w);
    draft = null;
    save();
    render();
  }

  // ---------- telas ----------
  function viewHoje() {
    if (state.active) return viewSession();
    if (!state.workouts.length) {
      return (
        '<div class="empty"><p>Você ainda não tem treinos.</p>' +
        '<button class="primary" data-act="new-workout">Criar meu primeiro treino</button></div>'
      );
    }
    const last = state.sessions[0];
    return (
      '<h2>Qual treino hoje?</h2>' +
      (last ? `<p class="muted">Último: ${esc(last.name)} · ${esc(fmtDate(last.endedAt))}</p>` : '') +
      state.workouts
        .map(
          (w) =>
            `<div class="card"><div class="row between"><div class="grow"><b>${esc(w.name)}</b>` +
            `<div class="muted">${w.exercises.length} exercício${w.exercises.length === 1 ? '' : 's'}</div></div>` +
            `<button class="primary" data-act="start" data-id="${esc(w.id)}">Iniciar</button></div></div>`
        )
        .join('')
    );
  }

  function viewSession() {
    const a = state.active;
    return (
      `<h2 style="margin:8px 0 12px">${esc(a.name)}</h2>` +
      a.entries
        .map(
          (e, ei) =>
            `<div class="card"><div class="ex-name">${esc(e.name)}</div>` +
            '<div class="set-head"><span>Série</span><span>Carga (kg)</span><span>Reps</span><span></span></div>' +
            e.sets
              .map(
                (s, si) =>
                  `<div class="set${s.done ? ' done' : ''}"><span class="n">${si + 1}</span>` +
                  `<input type="text" inputmode="decimal" data-ei="${ei}" data-si="${si}" data-f="kg" value="${esc(s.kg)}" placeholder="0">` +
                  `<input type="text" inputmode="numeric" data-ei="${ei}" data-si="${si}" data-f="reps" value="${esc(s.reps)}" placeholder="0">` +
                  `<button class="check" data-act="toggle" data-ei="${ei}" data-si="${si}">✓</button></div>`
              )
              .join('') +
            `<div class="row"><button class="ghost small" data-act="add-set" data-ei="${ei}">+ Série</button>` +
            (e.sets.length > 1 ? `<button class="ghost small" data-act="del-set" data-ei="${ei}">− Série</button>` : '') +
            '</div></div>'
        )
        .join('') +
      '<button class="primary block" data-act="finish">Finalizar treino</button>' +
      '<button class="ghost block" style="margin-top:8px" data-act="cancel-session">Cancelar treino</button>'
    );
  }

  function viewTreinos() {
    if (draft) return viewEdit();
    return (
      '<div class="row between"><h2 style="margin:8px 0">Meus treinos</h2>' +
      '<button class="accent small" data-act="new-workout">+ Novo</button></div>' +
      (state.workouts.length
        ? state.workouts
            .map(
              (w) =>
                `<div class="card"><b>${esc(w.name)}</b>` +
                `<div class="muted" style="margin:6px 0 10px">${esc(
                  w.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · ')
                )}</div>` +
                `<div class="row"><button class="small" data-act="edit" data-id="${esc(w.id)}">Editar</button>` +
                `<button class="danger small" data-act="del-workout" data-id="${esc(w.id)}">Excluir</button></div></div>`
            )
            .join('')
        : '<div class="empty">Nenhum treino criado ainda.</div>')
    );
  }

  function viewEdit() {
    return (
      `<h2>${draft.id ? 'Editar treino' : 'Novo treino'}</h2>` +
      `<input type="text" data-d="name" placeholder="Nome (ex.: Treino A – Peito e tríceps)" value="${esc(draft.name)}">` +
      '<div style="height:14px"></div>' +
      '<div class="edit-ex-head"><span>Exercício</span><span>Séries</span><span>Reps</span><span>Desc.(s)</span><span></span></div>' +
      draft.exercises
        .map(
          (e, i) =>
            `<div class="edit-ex"><input type="text" data-d="ex" data-i="${i}" data-f="name" placeholder="Supino reto" value="${esc(e.name)}">` +
            `<input class="num" type="text" inputmode="numeric" data-d="ex" data-i="${i}" data-f="sets" value="${esc(e.sets)}">` +
            `<input class="num" type="text" data-d="ex" data-i="${i}" data-f="reps" value="${esc(e.reps)}">` +
            `<input class="num" type="text" inputmode="numeric" data-d="ex" data-i="${i}" data-f="restSec" value="${esc(e.restSec)}">` +
            `<button class="x" data-act="del-ex" data-i="${i}">✕</button></div>`
        )
        .join('') +
      '<button class="ghost block" data-act="add-ex">+ Exercício</button>' +
      '<div class="row" style="margin-top:14px"><button class="ghost grow" data-act="cancel-edit">Cancelar</button>' +
      '<button class="primary grow" data-act="save-edit">Salvar</button></div>'
    );
  }

  function viewHistorico() {
    if (screen === 'backup') return viewBackup();
    const list = state.sessions.length
      ? state.sessions
          .map((s) => {
            const sets = s.entries.reduce((n, e) => n + e.sets.length, 0);
            const vol = s.entries.reduce((n, e) => n + e.sets.reduce((m, x) => m + x.kg * x.reps, 0), 0);
            return (
              `<div class="card"><div class="row between"><b>${esc(s.name)}</b>` +
              `<button class="danger small" data-act="del-session" data-id="${esc(s.id)}">Excluir</button></div>` +
              `<div class="muted">${esc(fmtDate(s.endedAt))}</div>` +
              `<div class="stat"><span><b>${fmtDur(s.endedAt - s.startedAt)}</b> de treino</span>` +
              `<span><b>${sets}</b> séries</span><span><b>${fmtKg(vol)}</b> kg de volume</span></div>` +
              '<details><summary>Ver detalhes</summary>' +
              s.entries
                .map(
                  (e) =>
                    `<div class="detail-ex"><b>${esc(e.name)}</b><br><span class="muted">${esc(
                      e.sets.map((x) => `${fmtKg(x.kg)} kg × ${x.reps}`).join('  ·  ')
                    )}</span></div>`
                )
                .join('') +
              '</details></div>'
            );
          })
          .join('')
      : '<div class="empty">Nenhum treino finalizado ainda.</div>';

    return (
      '<div class="row between"><h2 style="margin:8px 0">Histórico</h2>' +
      '<button class="small" data-act="open-backup">Backup</button></div>' +
      list
    );
  }

  function viewBackup() {
    return (
      '<button class="ghost small" style="margin-top:8px" data-act="close-backup">← Voltar</button>' +
      '<h2>Backup</h2>' +
      '<div class="card"><p class="muted" style="margin-top:0">Seus dados ficam só neste aparelho: ' +
      `${state.workouts.length} treino(s) e ${state.sessions.length} sessão(ões) no histórico. ` +
      'Exporte uma cópia de vez em quando para não perder nada.</p>' +
      '<button class="primary block" data-act="export">Exportar backup</button>' +
      '<button class="block" style="margin-top:8px" data-act="import">Importar backup</button>' +
      '<p class="muted" style="margin-bottom:0">Importar substitui os dados que estão no aparelho.</p>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden></div>'
    );
  }

  const TITLES = { hoje: 'Treino', treinos: 'Meus treinos', historico: 'Histórico' };

  function render() {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#sub').textContent = tab === 'historico' && screen === 'backup' ? 'Backup' : TITLES[tab];
    $('#view').innerHTML = tab === 'hoje' ? viewHoje() : tab === 'treinos' ? viewTreinos() : viewHistorico();
    tick();
  }

  // ---------- backup ----------
  async function exportData() {
    const text = JSON.stringify({ app: 'prumo', version: 1, exportedAt: new Date().toISOString(), ...state, active: null }, null, 2);
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
        if (!data || !Array.isArray(data.workouts) || !Array.isArray(data.sessions)) throw new Error('formato');
        if (!confirm(`Importar ${data.workouts.length} treino(s) e ${data.sessions.length} sessão(ões)? Isso substitui os dados atuais.`)) return;
        state = { workouts: data.workouts, sessions: data.sessions, active: null };
        stopRest();
        save();
        render();
      } catch (e) {
        alert('Esse arquivo não parece um backup do Prumo.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- eventos ----------
  document.addEventListener('click', (ev) => {
    unlockAudio();

    const t = ev.target.closest('[data-tab]');
    if (t) {
      tab = t.dataset.tab;
      screen = null;
      render();
      return;
    }

    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const ei = Number(b.dataset.ei);
    const si = Number(b.dataset.si);
    const i = Number(b.dataset.i);
    const id = b.dataset.id;

    switch (act) {
      case 'start': return startWorkout(id);
      case 'toggle': {
        const e = state.active.entries[ei];
        const s = e.sets[si];
        s.done = !s.done;
        save();
        render();
        if (s.done) startRest(e.restSec);
        return;
      }
      case 'add-set': {
        const e = state.active.entries[ei];
        const lastSet = e.sets[e.sets.length - 1];
        e.sets.push({ kg: lastSet ? lastSet.kg : '', reps: lastSet ? lastSet.reps : '', done: false });
        save();
        return render();
      }
      case 'del-set': {
        const e = state.active.entries[ei];
        if (e.sets.length > 1) e.sets.pop();
        save();
        return render();
      }
      case 'finish': return finishWorkout();
      case 'cancel-session':
        if (confirm('Cancelar este treino? Nada será salvo no histórico.')) {
          state.active = null;
          stopRest();
          save();
          render();
        }
        return;
      case 'rest-add':
        if (restEnd) restEnd += 15000;
        return tick();
      case 'rest-skip': return stopRest();
      case 'new-workout':
        draft = newDraft();
        tab = 'treinos';
        return render();
      case 'edit':
        draft = JSON.parse(JSON.stringify(state.workouts.find((w) => w.id === id)));
        return render();
      case 'del-workout':
        if (confirm('Excluir este treino? O histórico dele continua guardado.')) {
          state.workouts = state.workouts.filter((w) => w.id !== id);
          save();
          render();
        }
        return;
      case 'add-ex':
        draft.exercises.push({ id: uid(), name: '', sets: 3, reps: '10', restSec: 90 });
        return render();
      case 'del-ex':
        draft.exercises.splice(i, 1);
        if (!draft.exercises.length) draft.exercises.push({ id: uid(), name: '', sets: 3, reps: '10', restSec: 90 });
        return render();
      case 'save-edit': return saveDraft();
      case 'cancel-edit':
        draft = null;
        return render();
      case 'del-session':
        if (confirm('Excluir esta sessão do histórico?')) {
          state.sessions = state.sessions.filter((s) => s.id !== id);
          save();
          render();
        }
        return;
      case 'open-backup':
        screen = 'backup';
        return render();
      case 'close-backup':
        screen = null;
        return render();
      case 'export': return exportData();
      case 'import': return $('#importFile').click();
    }
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.ei !== undefined && state.active) {
      state.active.entries[Number(el.dataset.ei)].sets[Number(el.dataset.si)][el.dataset.f] = el.value;
      save();
    } else if (el.dataset.d === 'name' && draft) {
      draft.name = el.value;
    } else if (el.dataset.d === 'ex' && draft) {
      draft.exercises[Number(el.dataset.i)][el.dataset.f] = el.value;
    }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'importFile' && ev.target.files[0]) {
      importData(ev.target.files[0]);
      ev.target.value = '';
    }
  });

  // sem zoom por pinça (o toque duplo é bloqueado no CSS com touch-action)
  ['gesturestart', 'gesturechange'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));

  // ---------- início ----------
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ok */ }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  render();
})();
