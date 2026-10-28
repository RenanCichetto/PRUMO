// Prumo — módulo de treino
(() => {
  'use strict';
  const P = window.Prumo;
  const { esc, uid, num, $ } = P;
  const st = () => P.state;

  let draft = null; // treino em edição

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
  const fmtElapsed = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  // ---------- som e vibração do descanso ----------
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

  // ---------- barra fixa no rodapé: tempo do treino e descanso ----------
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
    if (!st().active) {
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
      : fmtElapsed(now - st().active.startedAt);
  }
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  P.hooks.click.push(unlockAudio);
  P.hooks.render.push(tick);

  // ---------- regras do treino ----------
  function startWorkout(id) {
    const w = st().workouts.find((x) => x.id === id);
    if (!w) return;
    if (st().active && !confirm('Já existe um treino em andamento. Substituir por este?')) return;
    const last = st().sessions.find((s) => s.workoutId === id);
    const entries = w.exercises.map((ex) => {
      const prev = last && last.entries.find((e) => e.name.toLowerCase() === ex.name.toLowerCase());
      const sets = Array.from({ length: ex.sets }, (_, i) => {
        const p = prev ? prev.sets[i] || prev.sets[prev.sets.length - 1] : null;
        // carga com vírgula, igual ao que o teclado em português digita
        return { kg: p ? String(p.kg || '').replace('.', ',') : '', reps: p ? String(p.reps || '') : String(ex.reps || ''), done: false };
      });
      return { name: ex.name, restSec: ex.restSec, sets };
    });
    st().active = { workoutId: id, name: w.name, startedAt: Date.now(), entries };
    restEnd = 0;
    restDoneUntil = 0;
    P.save();
    P.go({ mod: 'treino', tab: 'hoje', overlay: null });
  }

  function finishWorkout() {
    const a = st().active;
    if (!a) return;
    const entries = a.entries
      .map((e) => ({
        name: e.name,
        sets: e.sets.filter((s) => s.done).map((s) => ({ kg: num(s.kg), reps: num(s.reps) })),
      }))
      .filter((e) => e.sets.length);
    if (!entries.length) {
      if (confirm('Nenhuma série foi marcada. Descartar este treino?')) {
        st().active = null;
        P.save();
        P.render();
      }
      return;
    }
    st().sessions.unshift({ id: uid(), workoutId: a.workoutId, name: a.name, startedAt: a.startedAt, endedAt: Date.now(), entries });
    st().active = null;
    P.save();
    P.go({ tab: 'historico' });
  }

  const newDraft = () => ({ id: null, name: '', exercises: [{ id: uid(), name: '', sets: 3, reps: '10', restSec: 90 }] });

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
    const i = st().workouts.findIndex((x) => x.id === w.id);
    if (i >= 0) st().workouts[i] = w;
    else st().workouts.push(w);
    draft = null;
    P.save();
    P.render();
  }

  // ---------- telas ----------
  function viewHoje() {
    if (st().active) return viewSession();
    if (!st().workouts.length) {
      return (
        '<div class="empty"><p>Você ainda não tem treinos.</p>' +
        '<button class="primary" data-act="new-workout">Criar meu primeiro treino</button></div>'
      );
    }
    const last = st().sessions[0];
    return (
      '<h2>Qual treino hoje?</h2>' +
      (last ? `<p class="muted">Último: ${esc(last.name)} · ${esc(fmtDate(last.endedAt))}</p>` : '') +
      st().workouts
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
    const a = st().active;
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
      (st().workouts.length
        ? st().workouts
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
    const list = st().sessions.length
      ? st().sessions
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
      '<button class="small" data-act="overlay" data-id="backup">Backup</button></div>' +
      list
    );
  }

  // ---------- registro ----------
  P.register({
    id: 'treino',
    title: 'Treino',
    tabs: [
      ['hoje', 'Hoje'],
      ['treinos', 'Treinos'],
      ['historico', 'Histórico'],
    ],
    onEnter() {
      draft = null;
    },
    status() {
      if (st().active) return 'Em andamento';
      const l = st().sessions[0];
      return l ? `Último treino ${P.ago(l.endedAt)}` : 'Nenhum treino ainda';
    },
    view(tab) {
      return tab === 'treinos' ? viewTreinos() : tab === 'historico' ? viewHistorico() : viewHoje();
    },
    act(name, b) {
      const ei = Number(b.dataset.ei);
      const si = Number(b.dataset.si);
      const i = Number(b.dataset.i);
      const id = b.dataset.id;
      switch (name) {
        case 'start': startWorkout(id); return true;
        case 'toggle': {
          const e = st().active.entries[ei];
          const s = e.sets[si];
          s.done = !s.done;
          P.save();
          P.render();
          if (s.done) startRest(e.restSec);
          return true;
        }
        case 'add-set': {
          const e = st().active.entries[ei];
          const lastSet = e.sets[e.sets.length - 1];
          e.sets.push({ kg: lastSet ? lastSet.kg : '', reps: lastSet ? lastSet.reps : '', done: false });
          P.save();
          P.render();
          return true;
        }
        case 'del-set': {
          const e = st().active.entries[ei];
          if (e.sets.length > 1) e.sets.pop();
          P.save();
          P.render();
          return true;
        }
        case 'finish': finishWorkout(); return true;
        case 'cancel-session':
          if (confirm('Cancelar este treino? Nada será salvo no histórico.')) {
            st().active = null;
            P.save();
            P.render();
          }
          return true;
        case 'rest-add':
          if (restEnd) restEnd += 15000;
          tick();
          return true;
        case 'rest-skip': stopRest(); return true;
        case 'new-workout':
          draft = newDraft();
          P.go({ mod: 'treino', tab: 'treinos', overlay: null });
          return true;
        case 'edit':
          draft = JSON.parse(JSON.stringify(st().workouts.find((w) => w.id === id)));
          P.render();
          return true;
        case 'del-workout':
          if (confirm('Excluir este treino? O histórico dele continua guardado.')) {
            st().workouts = st().workouts.filter((w) => w.id !== id);
            P.save();
            P.render();
          }
          return true;
        case 'add-ex':
          draft.exercises.push({ id: uid(), name: '', sets: 3, reps: '10', restSec: 90 });
          P.render();
          return true;
        case 'del-ex':
          draft.exercises.splice(i, 1);
          if (!draft.exercises.length) draft.exercises.push({ id: uid(), name: '', sets: 3, reps: '10', restSec: 90 });
          P.render();
          return true;
        case 'save-edit': saveDraft(); return true;
        case 'cancel-edit':
          draft = null;
          P.render();
          return true;
        case 'del-session':
          if (confirm('Excluir esta sessão do histórico?')) {
            st().sessions = st().sessions.filter((s) => s.id !== id);
            P.save();
            P.render();
          }
          return true;
      }
      return false;
    },
    input(el) {
      if (el.dataset.ei !== undefined && st().active) {
        st().active.entries[Number(el.dataset.ei)].sets[Number(el.dataset.si)][el.dataset.f] = el.value;
        P.save();
        return true;
      }
      if (el.dataset.d === 'name' && draft) {
        draft.name = el.value;
        return true;
      }
      if (el.dataset.d === 'ex' && draft) {
        draft.exercises[Number(el.dataset.i)][el.dataset.f] = el.value;
        return true;
      }
      return false;
    },
  });
})();
