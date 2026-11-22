(function () {
'use strict';

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
function rid() {
  try { const a = new Uint8Array(8); crypto.getRandomValues(a); return 'u' + Array.from(a, b => b.toString(36).padStart(2, '0')).join(''); }
  catch (e) { return 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
}
const pend = {};
function schedule(k, fn) { if (pend[k]) return; pend[k] = requestAnimationFrame(() => { pend[k] = 0; fn(); }); }

const S = {
  uid: LS.get('nd_uid') || rid(),
  code: LS.get('nd_code') || '',
  name: LS.get('nd_name') || '',
  db: null, off: 0, refs: [],
  members: {}, partner: null, since: null, tab: 'chat',
  msgs: {}, moods: {}, places: {}, notes: {}, answers: {},
  presence: {}, typing: {}, read: {}, myRead: 0,
  unread: 0, loadedAt: 0, stick: true, pickMood: null,
  qcat: 'all', qi: 0, map: null, markers: {}, temp: null, mapFit: false, emojiOpen: false, chatFocus: false
};
LS.set('nd_uid', S.uid);

const now = () => Date.now() + S.off;
const R = p => S.db.ref('rooms/' + S.code + (p ? '/' + p : ''));
const nameOf = u => (S.members[u] && S.members[u].name) || 'Amor';
const initial = n => (String(n || '?').trim()[0] || '?').toUpperCase();

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- datas ---------- */
const fmtTime = ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
function dayLabel(ts) {
  const d = new Date(ts), t = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const diff = Math.round((b - a) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtFull(ts) { const d = new Date(ts); return d.toLocaleDateString('pt-BR') + ' às ' + fmtTime(ts); }
function ago(ts) {
  const s = (now() - ts) / 1000;
  if (s < 60) return 'agora';
  const m = s / 60; if (m < 60) return 'há ' + Math.floor(m) + ' min';
  const h = m / 60; if (h < 24) return 'há ' + Math.floor(h) + ' h';
  const d = Math.floor(h / 24); return d === 1 ? 'ontem' : 'há ' + d + ' dias';
}
function lastSeen(ts) {
  const d = new Date(ts), t = new Date();
  const diff = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (diff === 0) return 'visto por último hoje às ' + fmtTime(ts);
  if (diff === 1) return 'visto por último ontem às ' + fmtTime(ts);
  return 'visto por último em ' + d.toLocaleDateString('pt-BR');
}
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* ================= telas ================= */
function go(id) {
  const next = $('#screen-' + id); if (!next) return;
  $$('.screen').forEach(s => {
    if (s === next) { s.classList.remove('out'); s.classList.add('active'); }
    else { if (s.classList.contains('active')) s.classList.add('out'); s.classList.remove('active'); }
  });
  document.body.dataset.screen = id;
  if (id !== 'main') closeIsland();
}
function showStep(p, n) {
  $('#' + p + 'Step1').classList.toggle('show', n === 1);
  $('#' + p + 'Step2').classList.toggle('show', n === 2);
}

/* ================= folhas (sheets) ================= */
const layer = () => $('#sheetLayer');
let sheetCb = null, sheetTok = 0;
function openSheet(html, opts) {
  opts = opts || {};
  closeSheet(true);
  const L = layer();
  L.innerHTML = '<div class="backdrop"></div><div class="sheet"><div class="grab"></div>' + html + '</div>';
  const sh = $('.sheet', L);
  L.classList.add('show'); void sh.offsetHeight; L.classList.add('open');
  sheetCb = opts.onClose || null;
  $('.backdrop', L).addEventListener('click', () => closeSheet());
  enableDrag(sh);
  if (opts.onOpen) opts.onOpen(sh);
  return sh;
}
function closeSheet(instant) {
  const L = layer();
  if (!L.classList.contains('show')) return;
  const cb = sheetCb; sheetCb = null;
  const tok = ++sheetTok;
  L.classList.remove('open');
  const done = () => { if (tok !== sheetTok) return; L.classList.remove('show'); L.innerHTML = ''; };
  if (instant) done(); else setTimeout(done, 420);
  if (cb) cb();
}
function enableDrag(sh) {
  const g = $('.grab', sh); let y0 = null, dy = 0;
  g.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; sh.style.transition = 'none'; try { g.setPointerCapture(e.pointerId); } catch (x) {} });
  g.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = 'translateY(' + dy + 'px)'; });
  const end = () => { if (y0 === null) return; y0 = null; sh.style.transition = ''; const far = dy > 90; sh.style.transform = ''; if (far) closeSheet(); };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
}

/* ================= Firebase ================= */
function configOk() {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.databaseURL && !/COLE_AQUI/.test(c.apiKey + c.databaseURL));
}
function initFirebase() {
  firebase.initializeApp(window.FIREBASE_CONFIG);
  S.db = firebase.database();
  S.db.ref('.info/serverTimeOffset').on('value', s => { S.off = s.val() || 0; });
}
function on(path, ev, cb, q) {
  let ref = R(path); if (q) ref = q(ref);
  ref.on(ev, cb); S.refs.push([ref, ev, cb]);
}
function clearRefs() { S.refs.forEach(a => { try { a[0].off(a[1], a[2]); } catch (e) {} }); S.refs = []; }

/* ================= código / pareamento ================= */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() { let c = ''; const a = new Uint32Array(6); try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 6; i++) a[i] = Math.floor(Math.random() * 1e9); } for (let i = 0; i < 6; i++) c += ALPHA[a[i] % ALPHA.length]; return c; }
const fmtCode = c => c.slice(0, 3) + '-' + c.slice(3);
const normCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
function saveSession() { LS.set('nd_code', S.code); LS.set('nd_name', S.name); }
function forget() { LS.del('nd_code'); S.code = ''; }

async function createRoom(name) {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code = genCode();
    const s = await S.db.ref('rooms/' + code + '/meta').once('value');
    if (!s.exists()) break;
  }
  S.code = code; S.name = name;
  await S.db.ref('rooms/' + code).set({
    meta: { owner: S.uid, created: now() },
    members: { [S.uid]: { name: name, joined: now() } }
  });
  saveSession();
}
function showCreateWaiting() {
  go('create'); showStep('c', 2);
  $('#cCode').textContent = fmtCode(S.code);
  clearRefs();
  on('members', 'value', s => { if (Object.keys(s.val() || {}).length >= 2) enterMain(); });
  on('requests', 'value', s => renderReq(s.val() || {}));
}
function renderReq(reqs) {
  const box = $('#cReq'); const ids = Object.keys(reqs);
  box.innerHTML = ids.map(id => '<div class="req"><b>' + esc(reqs[id].name) + '<small>quer entrar no seu espaço</small></b><button class="no" data-no="' + id + '" type="button">Recusar</button><button class="ok" data-ok="' + id + '" type="button">Confirmar</button></div>').join('');
  if (ids.length && navigator.vibrate) navigator.vibrate(40);
}
async function joinRoom(code, name) {
  const ms = await S.db.ref('rooms/' + code + '/members').once('value');
  const members = ms.val();
  if (!members) throw new Error('Código não encontrado.');
  S.code = code; S.name = name;
  if (members[S.uid]) { saveSession(); return 'member'; }
  if (Object.keys(members).length >= 2) { S.code = ''; throw new Error('Esse espaço já tem duas pessoas.'); }
  await S.db.ref('rooms/' + code + '/requests/' + S.uid).set({ name: name, ts: now() });
  saveSession();
  return 'requested';
}
function showJoinWaiting() {
  go('join'); showStep('j', 2);
  clearRefs();
  on('members/' + S.uid, 'value', s => { if (s.val()) enterMain(); });
  on('requests/' + S.uid, 'value', async s => {
    if (s.exists()) return;
    const m = await R('members/' + S.uid).once('value');
    if (m.exists()) return enterMain();
    clearRefs(); forget(); showStep('j', 1);
    $('#jErr').textContent = 'O pedido não foi aceito. Confira o código e tente de novo.';
  });
}

/* ================= boot ================= */
async function boot() {
  if (!configOk() || !window.firebase) { go('setup'); return; }
  try { initFirebase(); } catch (e) { go('setup'); return; }
  if (!S.code || !S.name) { go('welcome'); return; }
  try {
    const ms = (await R('members').once('value')).val() || {};
    const n = Object.keys(ms).length;
    if (ms[S.uid]) { if (n >= 2) enterMain(); else showCreateWaiting(); return; }
    const rq = await R('requests/' + S.uid).once('value');
    if (rq.exists()) { showJoinWaiting(); return; }
    forget(); go('welcome');
  } catch (e) { toast('Sem conexão. Tentando de novo…'); setTimeout(boot, 3000); }
}

/* ================= entrar no app ================= */
function enterMain() {
  clearRefs();
  S.loadedAt = now(); S.msgs = {}; S.moods = {}; msgEls.clear(); sepEls.clear();
  $('#msgs').innerHTML = ''; S.unread = 0; S.myRead = 0; S.mapFit = false;
  go('main'); setTab('chat');

  on('members', 'value', s => {
    S.members = s.val() || {};
    S.partner = Object.keys(S.members).find(k => k !== S.uid) || null;
    if (S.members[S.uid]) { S.name = S.members[S.uid].name; LS.set('nd_name', S.name); }
    renderHeader(); schedule('mood', renderMoods); schedule('msgs', renderMessages); schedule('places', renderPlaces); renderNotes(); updateQuizMeta();
  });
  on('meta/since', 'value', s => { S.since = s.val(); renderIsland(); });
  const mq = q => q.orderByKey().limitToLast(200);
  const upsert = s => {
    const m = s.val(); if (!m) return; m.id = s.key;
    const first = !S.msgs[s.key]; S.msgs[s.key] = m;
    if (first && m.u !== S.uid && m.ts >= S.loadedAt - 1500) incoming(m);
    schedule('msgs', renderMessages);
  };
  on('messages', 'child_added', upsert, mq);
  on('messages', 'child_changed', upsert, mq);
  on('messages', 'child_removed', s => { delete S.msgs[s.key]; msgEls.delete(s.key); schedule('msgs', renderMessages); }, mq);
  on('moods', 'child_added', s => { S.moods[s.key] = s.val(); schedule('mood', renderMoods); }, q => q.orderByKey().limitToLast(80));
  on('places', 'value', s => { S.places = s.val() || {}; schedule('places', renderPlaces); });
  on('notes', 'value', s => { S.notes = s.val() || {}; renderNotes(); });
  on('answers', 'value', s => { S.answers = s.val() || {}; updateQuizMeta(); });
  on('presence', 'value', s => { S.presence = s.val() || {}; updateSub(); });
  on('typing', 'value', s => { S.typing = s.val() || {}; updateSub(); });
  on('read', 'value', s => { S.read = s.val() || {}; schedule('msgs', renderMessages); });

  const myP = R('presence/' + S.uid);
  const conn = S.db.ref('.info/connected');
  const cb = s => { if (s.val()) { myP.onDisconnect().set({ on: false, ts: firebase.database.ServerValue.TIMESTAMP }); myP.set({ on: !document.hidden, ts: now() }); } };
  conn.on('value', cb); S.refs.push([conn, 'value', cb]);

  renderHeader(); renderMoodGrid(); renderQuizCats(); renderQuiz(); renderIsland();
  if (!enterMain.done) { enterMain.done = true; setTimeout(() => openIsland(), 900); setTimeout(() => closeIsland(), 4600); }
}

/* ================= ilha dinâmica ================= */
function togetherInfo() {
  if (!S.since) return null;
  const [y0, m0, d0] = S.since.split('-').map(Number);
  const a = new Date(y0, m0 - 1, d0), t = new Date(), b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const days = Math.round((b - a) / 864e5);
  if (days < 0) return { future: true, days: -days };
  let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
  if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { days, y, m, d };
}
function joinPt(parts) { if (parts.length <= 1) return parts.join(''); return parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1]; }
function renderIsland() {
  const i = togetherInfo();
  if (!i) {
    $('#islSmall').textContent = 'Definir data'; $('#islNum').textContent = '—'; $('#islUnit').textContent = '';
    $('#islDet').textContent = 'Conte desde quando estamos juntos'; $('#islEdit').textContent = 'Definir data'; return;
  }
  $('#islEdit').textContent = 'Alterar data';
  $('#islNum').textContent = i.days.toLocaleString('pt-BR');
  if (i.future) {
    $('#islSmall').textContent = 'Faltam ' + i.days + (i.days === 1 ? ' dia' : ' dias');
    $('#islUnit').textContent = i.days === 1 ? 'dia para o início' : 'dias para o início'; $('#islDet').textContent = ''; return;
  }
  $('#islSmall').textContent = i.days.toLocaleString('pt-BR') + (i.days === 1 ? ' dia juntos' : ' dias juntos');
  $('#islUnit').textContent = i.days === 1 ? 'dia' : 'dias';
  const p = [];
  if (i.y) p.push(i.y + (i.y > 1 ? ' anos' : ' ano'));
  if (i.m) p.push(i.m + (i.m > 1 ? ' meses' : ' mês'));
  if (i.d) p.push(i.d + (i.d > 1 ? ' dias' : ' dia'));
  $('#islDet').textContent = p.length ? joinPt(p) : 'Começando hoje 💜';
}
function openIsland() { $('#island').classList.add('open'); }
function closeIsland() { $('#island').classList.remove('open'); }
function editSince() {
  closeIsland();
  openSheet('<h3>Desde quando estamos juntos?</h3><p class="sub">Essa data aparece para vocês dois.</p><input class="field" type="date" id="sinceIn" value="' + esc(S.since || todayISO()) + '"><button class="btn primary" id="sinceSave" type="button">Salvar</button>', {
    onOpen: sh => {
      $('#sinceSave', sh).onclick = async () => {
        const v = $('#sinceIn', sh).value; if (!v) return;
        try { await R('meta/since').set(v); closeSheet(); toast('Data atualizada 💜'); } catch (e) { toast('Não foi possível salvar'); }
      };
    }
  });
}

/* ================= abas ================= */
const TABS = ['chat', 'status', 'map', 'quiz', 'notes'];
function setTab(t) {
  const i = TABS.indexOf(t); S.tab = t;
  $$('.page').forEach(p => {
    const j = TABS.indexOf(p.dataset.tab);
    p.classList.toggle('active', j === i); p.classList.toggle('before', j < i); p.classList.toggle('after', j > i);
  });
  $$('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#tabInd').style.transform = 'translateX(' + (i * 100) + '%)';
  updateTabsVisibility();
  if (t === 'map') setTimeout(() => { ensureMap(); if (S.map) S.map.invalidateSize(); }, 520);
  if (t === 'chat') { S.unread = 0; updateBadge(); setTimeout(() => scrollBottom(false), 60); markRead(); }
  if (t === 'status') schedule('mood', renderMoods);
  if (t !== 'map') closeMapRes();
}
function updateTabsVisibility() { document.body.classList.toggle('hide-tabs', S.tab === 'chat' && (S.chatFocus || S.emojiOpen)); }
function updateBadge() {
  $('#chatDot').classList.toggle('show', S.unread > 0 && S.tab !== 'chat');
  const n = $('#toBottomN'); n.textContent = S.unread > 0 ? S.unread : ''; n.classList.toggle('show', S.unread > 0);
}

/* ================= conversa ================= */
const msgEls = new Map(), sepEls = new Map();
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\u200d|\ufe0f|\s)+$/u;
const CHK1 = '<svg viewBox="0 0 18 12"><path d="M4 6.5l3.5 3.5L14 2.5"/></svg>';
const CHK2 = '<svg viewBox="0 0 18 12"><path d="M1 6.5L4.5 10 11 2.5M7 8.8L8.2 10 15 2.5"/></svg>';

function photoOf(u) { return (u && S.members[u] && S.members[u].photo) || ''; }
function setAvatar(el, u) {
  const ph = photoOf(u);
  el.classList.toggle('ph', !!ph); el.style.backgroundImage = ph ? 'url(' + ph + ')' : '';
  el.textContent = ph ? '' : (u ? initial(nameOf(u)) : '💜');
}
function avHtml(u, cls) {
  const ph = photoOf(u);
  return '<div class="' + cls + (ph ? ' ph' : '') + '"' + (ph ? ' style="background-image:url(' + ph + ')"' : '') + '>' + (ph ? '' : esc(initial(nameOf(u)))) + '</div>';
}
function squareCompress(file, size, q) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const w = im.naturalWidth, h = im.naturalHeight, s = Math.min(w, h);
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, size, size);
      x.drawImage(im, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
  });
}
function profileSheet() {
  const mine = !!photoOf(S.uid), pa = S.partner;
  const sh = openSheet('<h3>Foto de perfil</h3><p class="sub">Toque na sua foto para trocar.</p><div class="prof-row">' +
    '<button class="prof" data-a="pick" type="button"><span class="av-wrap">' + avHtml(S.uid, 'avatar big') + '<i class="cam"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg></i></span><b>Você</b><small>' + esc(S.name) + '</small></button>' +
    (pa ? '<button class="prof" data-a="view" type="button"><span class="av-wrap">' + avHtml(pa, 'avatar big') + '</span><b>' + esc(nameOf(pa)) + '</b><small>' + (photoOf(pa) ? 'Toque para ampliar' : 'Sem foto ainda') + '</small></button>' : '') +
    '</div><button class="btn primary" data-a="pick" type="button">' + (mine ? 'Trocar minha foto' : 'Escolher minha foto') + '</button>' +
    (mine ? '<div style="height:10px"></div><button class="btn ghost" data-a="rem" type="button">Remover minha foto</button>' : ''));
  sh.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'pick') $('#avIn').click();
    if (a === 'rem') { R('members/' + S.uid + '/photo').remove(); closeSheet(); toast('Foto removida'); }
    if (a === 'view' && photoOf(pa)) { closeSheet(); openViewer(photoOf(pa)); }
  });
}
function renderHeader() {
  $('#chName').textContent = S.partner ? nameOf(S.partner) : 'Conversa';
  setAvatar($('#chAvatar'), S.partner);
  updateSub();
}
function updateSub() {
  const el = $('#chSub'); if (!el) return;
  const p = S.partner; let txt = '', live = false;
  if (p) {
    const t = S.typing[p];
    if (t && now() - t < 4500) { txt = 'digitando…'; live = true; }
    else if (S.presence[p] && S.presence[p].on) { txt = 'online'; live = true; }
    else if (S.presence[p] && S.presence[p].ts) txt = lastSeen(S.presence[p].ts);
  }
  el.textContent = txt; el.classList.toggle('live', live);
}
function nearBottom() { const s = $('#msgsScroll'); return s.scrollHeight - s.scrollTop - s.clientHeight < 140; }
function scrollBottom(smooth) { const s = $('#msgsScroll'); s.scrollTo({ top: s.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

function replyKey(m) {
  if (!m.r) return '';
  const o = S.msgs[m.r.id];
  return m.r.id + (o && o.d ? 'x' : '') + nameOf(m.r.u);
}
function quoteHtml(m) {
  const r = m.r; if (!r) return '';
  const o = S.msgs[r.id], gone = !!(o && o.d), mine = r.u === S.uid;
  const body = gone ? 'Mensagem apagada' : (r.t || (r.i ? '📷 Foto' : (r.a ? '🎤 Mensagem de voz' : '')));
  return '<div class="quote' + (mine ? ' mine' : '') + (gone ? ' gone' : '') + '" data-q="' + esc(r.id) + '"><b>' + esc(mine ? 'Você' : nameOf(r.u)) + '</b><span>' + esc(body) + '</span></div>';
}
function startReply(id) {
  const m = S.msgs[id]; if (!m || m.d) return;
  S.reply = { id: id, u: m.u, t: (m.t || '').slice(0, 140), i: m.i ? 1 : 0, a: m.a ? 1 : 0 };
  renderReplyBar(); $('#msgInput').focus();
}
function clearReply() { S.reply = null; renderReplyBar(); }
function renderReplyBar() {
  const b = $('#replyBar'); if (!b) return; const r = S.reply;
  b.classList.toggle('open', !!r);
  if (r) { $('#rpName').textContent = r.u === S.uid ? 'Você' : nameOf(r.u); $('#rpTxt').textContent = r.t || (r.i ? '📷 Foto' : (r.a ? '🎤 Mensagem de voz' : '')); }
}
function jumpTo(id) {
  const e = msgEls.get(id);
  if (!e || !e.el.isConnected) return toast('Essa mensagem não está mais aqui');
  e.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const b = $('.bubble', e.el); if (!b) return;
  b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  setTimeout(() => b.classList.remove('flash'), 1700);
}
function buildMsg(m, isNew) {
  const partnerRead = S.partner ? (S.read[S.partner] || 0) : 0;
  const read = m.ts <= partnerRead;
  const key = (m.d ? 'd' : '') + '|' + (m.t || '') + '|' + (m.i ? m.i.length : 0) + '|' + (m.a ? m.a.length : 0) + '|' + (read ? 'r' : 's') + '|' + m.ts + '|' + replyKey(m);
  let ent = msgEls.get(m.id);
  if (ent && ent.key === key) return ent.el;
  const mine = m.u === S.uid;
  const el = ent ? ent.el : document.createElement('div');
  el.className = 'msg ' + (mine ? 'me' : 'them') + (!ent && isNew ? ' pop' : '');
  el.dataset.id = m.id;
  const time = fmtTime(m.ts);
  const ticks = mine ? (read ? CHK2 : CHK1) : '';
  const meta = '<span class="meta' + (read ? ' read' : '') + '">' + time + ticks + '</span>';
  let html;
  if (m.d) {
    html = '<div class="bubble"><div class="del"><svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>Mensagem apagada</div>' + meta + '</div>';
  } else {
    const emo = m.t && !m.i && !m.r && EMOJI_ONLY.test(m.t) && (m.t.match(/\p{Extended_Pictographic}/gu) || []).length <= 3;
    html = '<div class="bubble' + (m.i ? ' has-pic' : '') + (m.a ? ' has-aud' : '') + (emo ? ' emo' : '') + '">' + quoteHtml(m) +
      (m.a ? audioHtml(m) : '') +
      (m.i ? '<div class="pic"><img src="' + m.i + '" alt="Foto"></div>' : '') +
      (m.t ? '<div class="txt' + (emo ? ' big' : '') + '">' + esc(m.t) + '</div>' : '') + meta + '</div>';
  }
  el.innerHTML = html;
  if (m.a && !m.d) paintVm(el);
  const img = $('img', el); if (img) img.addEventListener('load', () => { if (S.stick) scrollBottom(false); });
  msgEls.set(m.id, { el, key });
  return el;
}
function sepEl(ts) {
  const k = dayKey(ts); const label = dayLabel(ts);
  let e = sepEls.get(k);
  if (!e) { const el = document.createElement('div'); el.className = 'day-sep'; e = { el, label: '' }; sepEls.set(k, e); }
  if (e.label !== label) { e.el.innerHTML = '<span>' + esc(label) + '</span>'; e.label = label; }
  return e.el;
}
function renderMessages() {
  const box = $('#msgs'); if (!box) return;
  const list = Object.values(S.msgs).sort((a, b) => (a.ts - b.ts) || (a.id < b.id ? -1 : 1));
  const first = box.children.length === 0;
  const stick = first || nearBottom() || (list.length && list[list.length - 1].u === S.uid);
  const nodes = []; let last = '';
  list.forEach(m => {
    const k = dayKey(m.ts);
    if (k !== last) { nodes.push(sepEl(m.ts)); last = k; }
    nodes.push(buildMsg(m, m.ts >= S.loadedAt - 1500));
  });
  nodes.forEach((n, i) => { if (box.children[i] !== n) box.insertBefore(n, box.children[i] || null); });
  while (box.children.length > nodes.length) box.lastChild.remove();
  if (stick) { S.stick = true; scrollBottom(!first); }
  markRead();
}
function incoming(m) {
  if (S.tab !== 'chat') { S.unread++; updateBadge(); }
  else if (!nearBottom()) { S.unread++; updateBadge(); }
  if (document.hidden) notify(nameOf(m.u), m.d ? 'Mensagem' : (m.a ? '🎤 Mensagem de voz' : (m.i && !m.t ? '📷 Foto' : m.t)));
  else if (navigator.vibrate) navigator.vibrate(12);
}
function markRead() {
  if (S.tab !== 'chat' || document.hidden || !S.partner || !S.code) return;
  let last = 0; for (const id in S.msgs) { const m = S.msgs[id]; if (m.u !== S.uid && m.ts > last) last = m.ts; }
  if (last > S.myRead) { S.myRead = now(); R('read/' + S.uid).set(S.myRead); }
}
async function notify(title, body) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification(title, { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'msg', renotify: true });
  } catch (e) {}
}


/* ================= mensagens de voz ================= */
const MAXREC = 90;
const AUD = { el: null, id: null, speed: 1 };
const REC = { mr: null, stream: null, chunks: [], t0: 0, timer: 0, cancel: false, mime: '' };
function fmtDur(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function barsFor(id) {
  let h = hash(id) || 7, out = '';
  for (let i = 0; i < 32; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const v = h / 0x7fffffff, ht = Math.round(24 + (v * 0.7 + 0.3 * Math.abs(Math.sin(i * 0.8))) * 76);
    out += '<i style="height:' + ht + '%"></i>';
  }
  return out;
}
function audioHtml(m) {
  return '<div class="vm" data-id="' + esc(m.id) + '"><button class="vm-play" type="button" aria-label="Reproduzir"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg></button><div class="vm-mid"><div class="vm-bars">' + barsFor(m.id) + '</div><div class="vm-time">' + fmtDur(m.ad) + '</div></div><button class="vm-spd" type="button">' + AUD.speed + 'x</button></div>';
}
function paintVm(el) {
  const vm = $('.vm', el); if (!vm) return;
  const id = vm.dataset.id, m = S.msgs[id], act = AUD.id === id && AUD.el;
  const tot = (m && m.ad) || 0, cur = act ? AUD.el.currentTime : 0, p = tot ? Math.min(1, cur / tot) : 0;
  vm.classList.toggle('active', !!act); vm.classList.toggle('playing', !!act && !AUD.el.paused);
  const bars = $$('.vm-bars i', vm), n = Math.round(p * bars.length);
  bars.forEach((b, i) => b.classList.toggle('on', i < n));
  $('.vm-time', vm).textContent = fmtDur(act ? cur : tot);
  $('.vm-spd', vm).textContent = AUD.speed + 'x';
}
function paintById(id) { const e = id && msgEls.get(id); if (e) paintVm(e.el); }
function stopAudio() {
  const old = AUD.id, a = AUD.el; AUD.el = null; AUD.id = null;
  if (a) { try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {} }
  paintById(old);
}
function toggleAudio(id) {
  const m = S.msgs[id]; if (!m || !m.a) return;
  if (AUD.id === id && AUD.el) { if (AUD.el.paused) AUD.el.play().catch(() => toast('Não foi possível reproduzir')); else AUD.el.pause(); return; }
  stopAudio();
  const a = new Audio(m.a); a.preload = 'auto'; a.playbackRate = AUD.speed;
  AUD.el = a; AUD.id = id;
  const paint = () => paintById(id);
  a.addEventListener('timeupdate', paint); a.addEventListener('play', paint); a.addEventListener('pause', paint);
  a.addEventListener('ended', () => { if (AUD.el === a) stopAudio(); });
  a.play().catch(() => { toast('Não foi possível reproduzir'); if (AUD.el === a) stopAudio(); });
  paint();
}
function seekAudio(id, ratio) {
  const m = S.msgs[id]; if (!m || !m.a) return;
  if (!(AUD.id === id && AUD.el)) toggleAudio(id);
  const tot = m.ad || 0; if (!AUD.el || !tot) return;
  try { AUD.el.currentTime = Math.max(0, Math.min(1, ratio)) * tot; } catch (e) {}
  paintById(id);
}
function cycleSpeed() {
  AUD.speed = AUD.speed === 1 ? 1.5 : (AUD.speed === 1.5 ? 2 : 1);
  if (AUD.el) AUD.el.playbackRate = AUD.speed;
  paintById(AUD.id);
}
function pickMime() {
  if (!window.MediaRecorder) return null;
  const c = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (let i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
  return '';
}
function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
async function startRec() {
  if (REC.mr || REC.busy) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return toast('Este navegador não grava áudio');
  REC.busy = true;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { REC.busy = false; return toast('Permita o microfone para gravar'); }
  const mime = pickMime(); let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 20000 } : { audioBitsPerSecond: 20000 }); }
  catch (e) { try { mr = new MediaRecorder(stream); } catch (x) { stream.getTracks().forEach(t => t.stop()); REC.busy = false; return toast('Não consegui gravar'); } }
  stopAudio();
  REC.mr = mr; REC.stream = stream; REC.chunks = []; REC.cancel = false; REC.t0 = Date.now(); REC.mime = mr.mimeType || mime || 'audio/webm'; REC.busy = false;
  mr.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  mr.onstop = finishRec;
  mr.start(250);
  $('#recTime').textContent = '0:00'; $('.composer-wrap').classList.add('recording');
  clearInterval(REC.timer); REC.timer = setInterval(() => {
    const s = (Date.now() - REC.t0) / 1000; $('#recTime').textContent = fmtDur(s);
    if (s >= MAXREC) { toast('Limite de ' + MAXREC + ' segundos'); stopRec(false); }
  }, 200);
  if (navigator.vibrate) navigator.vibrate(18);
}
function stopRec(cancel) {
  if (!REC.mr) return;
  REC.cancel = !!cancel; clearInterval(REC.timer);
  try { if (REC.mr.state !== 'inactive') REC.mr.stop(); else finishRec(); } catch (e) { finishRec(); }
}
async function finishRec() {
  const dur = (Date.now() - REC.t0) / 1000, cancel = REC.cancel, chunks = REC.chunks, mime = (REC.mime || 'audio/webm').split(';')[0];
  clearInterval(REC.timer);
  if (REC.stream) REC.stream.getTracks().forEach(t => t.stop());
  REC.mr = null; REC.stream = null; REC.chunks = [];
  $('.composer-wrap').classList.remove('recording');
  if (cancel) return;
  if (dur < 0.8 || !chunks.length) return toast('Áudio muito curto');
  try {
    const data = await blobToDataURL(new Blob(chunks, { type: mime }));
    if (data.length > 1400000) return toast('Áudio grande demais');
    sendMessage('', null, { a: data, ad: Math.max(1, Math.round(dur)) });
  } catch (e) { toast('Não foi possível enviar o áudio'); }
}

function sendMessage(text, img, aud) {
  text = (text || '').trim(); if (!text && !img && !aud) return;
  const ref = R('messages').push();
  const data = { u: S.uid, t: text, ts: now() }; if (img) data.i = img;
  if (aud) { data.a = aud.a; data.ad = aud.ad; }
  if (S.reply) { data.r = S.reply; clearReply(); }
  ref.set(data).catch(() => toast('Não foi possível enviar'));
  R('typing/' + S.uid).set(0);
  S.stick = true;
}
function autosize() { const t = $('#msgInput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; $('#btnSend').classList.toggle('has', t.value.trim().length > 0); $('.pill').classList.toggle('has-text', t.value.length > 0); }

function compress(file, max, q) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      let w = im.naturalWidth, h = im.naturalHeight; const k = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
  });
}
async function pickPhoto(file) {
  if (!file) return;
  try {
    const data = await compress(file, 960, 0.72);
    openSheet('<h3>Enviar foto</h3><img class="prev-img" src="' + data + '" alt=""><input class="field" id="capIn" maxlength="300" placeholder="Adicionar legenda…"><button class="btn primary" id="picSend" type="button">Enviar</button>', {
      onOpen: sh => { $('#picSend', sh).onclick = () => { sendMessage($('#capIn', sh).value, data); closeSheet(); setTab('chat'); }; }
    });
  } catch (e) { toast('Não consegui abrir essa foto'); }
}

function msgMenu(id) {
  const m = S.msgs[id]; if (!m || m.d) return;
  const mine = m.u === S.uid;
  const sh = openSheet('<div class="act-list"><button data-a="reply" type="button">Responder</button>' +
    (m.t ? '<button data-a="copy" type="button">Copiar texto</button>' : '') +
    (m.i ? '<button data-a="save" type="button">Salvar foto</button>' : '') +
    (mine ? '<button class="danger" data-a="del" type="button">Apagar para todos</button>' : '') +
    '<button class="cancel" data-a="x" type="button">Cancelar</button></div>');
  sh.addEventListener('click', async e => {
    const a = e.target.closest('button'); if (!a) return;
    const act = a.dataset.a;
    if (act === 'reply') startReply(id);
    if (act === 'copy') { try { await navigator.clipboard.writeText(m.t); toast('Copiado'); } catch (x) { toast('Não foi possível copiar'); } }
    if (act === 'save') { const l = document.createElement('a'); l.href = m.i; l.download = 'foto-' + m.id + '.jpg'; document.body.appendChild(l); l.click(); l.remove(); }
    if (act === 'del') { R('messages/' + id).update({ d: true, t: null, i: null, a: null, ad: null, r: null }).catch(() => toast('Não foi possível apagar')); }
    closeSheet();
  });
}
function openViewer(src) { const v = $('#viewer'); $('img', v).src = src; v.classList.add('show'); }

/* emojis */
const EMO = [
  ['😀', '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 😶 😐 😑 😬 🙄 😯 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 😈 👻 💀 🤡 💩'],
  ['❤️', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💋 💌 💍 💎 👑 🌹 🌷 🌸 🌺 💐 🥀 😍 🥰 😘 💑 💏 🫶 🫂 ✨ 💫 ⭐ 🌟 🔥 💥 🎉 🎁 🎈'],
  ['👍', '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👋 🤚 🖐️ ✋ 👏 🙌 🫶 🙏 🤝 💪 👀 👅 👄 🧠 🦋 🫡 🤷 🤦 🙆 🙅 💃 🕺 🚶 🏃 🧘 🛌'],
  ['🐶', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦉 🦄 🐝 🦋 🐌 🐞 🐢 🐙 🐬 🐳 🌻 🌈 🌙 ☀️ ⛅ 🌧️ ❄️ 🌊 🍀 🌵'],
  ['🍕', '🍕 🍔 🍟 🌭 🍿 🍩 🍪 🎂 🍰 🍫 🍬 🍭 🍦 🍓 🍒 🍑 🍉 🍇 🍌 🍎 🥑 🍳 🥞 🍝 🍣 🍜 ☕ 🧋 🍷 🍺 🥂 🍾'],
  ['⚽', '⚽ 🏀 🎮 🎬 🎵 🎧 🎤 📸 📚 ✈️ 🚗 🏖️ 🏝️ ⛰️ 🏠 🌃 🎁 🎊 🛍️ 💻 📱 💡 🕯️ 🎯 🎲 🧩 🎨 🎸']
];
let emoCat = 0;
function renderEmojiTabs() {
  $('#emojiTabs').innerHTML = EMO.map((c, i) => '<button type="button" data-i="' + i + '" class="' + (i === emoCat ? 'on' : '') + '">' + c[0] + '</button>').join('');
  $('#emojiGrid').innerHTML = EMO[emoCat][1].split(' ').map(e => '<button type="button" data-e="' + e + '">' + e + '</button>').join('');
}
function toggleEmoji(open) {
  S.emojiOpen = open; $('#emojiPanel').classList.toggle('open', open);
  if (open) { $('#msgInput').blur(); S.chatFocus = false; if (!$('#emojiGrid').children.length) renderEmojiTabs(); }
  updateTabsVisibility(); setTimeout(() => { if (S.stick) scrollBottom(false); }, 300);
}
function insertEmoji(e) {
  const t = $('#msgInput'); const s = t.selectionStart == null ? t.value.length : t.selectionStart, en = t.selectionEnd == null ? s : t.selectionEnd;
  t.value = t.value.slice(0, s) + e + t.value.slice(en); const p = s + e.length; t.setSelectionRange(p, p); autosize();
}

/* ================= status / sentimentos ================= */
const MOODS = [['😊', 'Felicidade'], ['🥰', 'Amor'], ['🤩', 'Animação'], ['😌', 'Calma'], ['🥹', 'Gratidão'], ['🥺', 'Saudade'], ['🫶', 'Carência'], ['✨', 'Inspiração'], ['😴', 'Sono'], ['😮‍💨', 'Cansaço'], ['😔', 'Tristeza'], ['😰', 'Ansiedade'], ['😤', 'Estresse'], ['😡', 'Raiva'], ['🥱', 'Tédio'], ['🤒', 'Dodói'], ['🍕', 'Fome'], ['💭', 'Reflexão'], ['🌧️', 'Dia difícil'], ['🤪', 'Travessura']];
function renderMoodGrid() {
  $('#moodGrid').innerHTML = MOODS.map((m, i) => '<button type="button" class="chip" data-i="' + i + '"><span>' + m[0] + '</span>' + m[1] + '</button>').join('');
}
function lastMood(u) { let b = null; for (const id in S.moods) { const m = S.moods[id]; if (m.u === u && (!b || m.ts > b.ts)) b = m; } return b; }
function moodCard(u, who) {
  const m = u ? lastMood(u) : null;
  if (!m) return avHtml(u, 'mini-av') + '<div class="who">' + esc(who) + '</div><div class="em">🫥</div><div class="lb">Sem status</div><div class="tx">ainda não contou</div>';
  return avHtml(u, 'mini-av') + '<div class="who">' + esc(who) + '</div><div class="em">' + esc(m.e) + '</div><div class="lb">' + esc(m.l) + '</div>' + (m.t ? '<div class="tx">' + esc(m.t) + '</div>' : '') + '<div class="ag">' + ago(m.ts) + '</div>';
}
function renderMoods() {
  const them = S.partner ? lastMood(S.partner) : null, me = lastMood(S.uid);
  const a = $('#moodThem'), b = $('#moodMe'); if (!a) return;
  a.className = 'mood-card' + (them ? '' : ' nobody'); b.className = 'mood-card' + (me ? '' : ' nobody');
  a.innerHTML = moodCard(S.partner, S.partner ? nameOf(S.partner) : 'Amor');
  b.innerHTML = moodCard(S.uid, 'Você');
  const list = Object.keys(S.moods).sort().reverse().slice(0, 14).map(id => S.moods[id]);
  $('#moodHist').innerHTML = list.length ? list.map(m => '<div class="hrow"><div class="e">' + esc(m.e) + '</div><div class="b">' + esc(m.u === S.uid ? 'Você' : nameOf(m.u)) + ' · ' + esc(m.l) + (m.t ? '<small>' + esc(m.t) + '</small>' : '') + '</div><div class="t">' + ago(m.ts) + '</div></div>').join('') : '<div class="empty" style="margin-top:14px">Nada por aqui ainda.</div>';
}

/* ================= mapa ================= */
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); }); }
function loadCss(href) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
let leafletLoading = null;
function needLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = (async () => {
    const srcs = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'];
    for (let i = 0; i < srcs.length && !window.L; i++) {
      try { await loadScript(srcs[i]); loadCss(srcs[i].replace('leaflet.js', 'leaflet.css')); } catch (e) {}
    }
    leafletLoading = null;
    if (!window.L) throw new Error('leaflet');
  })();
  return leafletLoading;
}
async function ensureMap() {
  if (S.map || S.mapBusy) return;
  S.mapBusy = true;
  const msg = $('#mapMsg');
  try {
    if (!window.L) { msg.innerHTML = 'Carregando mapa…'; msg.classList.add('show'); await needLeaflet(); }
    buildMap(); msg.classList.remove('show');
  } catch (e) {
    msg.innerHTML = 'Não consegui carregar o mapa.<br>Verifique a internet e tente de novo.<br><button class="btn primary" id="mapRetry" type="button">Tentar de novo</button>';
    msg.classList.add('show');
  }
  S.mapBusy = false;
}
function addTiles(m) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  $('#map').classList.add('osm');
}
function buildMap() {
  const m = L.map('map', { zoomControl: false, worldCopyJump: true }).setView([-14.2, -51.9], 4);
  addTiles(m);
  m.attributionControl.setPrefix(false);
  S.map = m; S.layerG = L.layerGroup().addTo(m);
  m.on('click', e => { closeMapRes(); pickPoint(e.latlng.lat, e.latlng.lng, '', true, ''); });
  renderPlaces();
  setTimeout(() => m.invalidateSize(), 150);
  setTimeout(() => $('#mapHint').classList.add('hide'), 6000);
}
function pinIcon(cls) { return L.divIcon({ className: 'pinwrap', html: '<div class="pin ' + cls + '"></div>', iconSize: [34, 34], iconAnchor: [17, 41], popupAnchor: [0, -44], tooltipAnchor: [0, 0] }); }
const shortDate = ts => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + fmtTime(ts);
function popupHtml(id, p, mine) {
  const who = mine ? 'você' : nameOf(p.u);
  const where = p.addr || (Number(p.lat).toFixed(4) + ', ' + Number(p.lng).toFixed(4));
  return '<div class="pop-t">' + esc(p.name) + '</div><div class="pop-m"><div>👤 Marcado por <b>' + esc(who) + '</b></div><div>🕒 ' + esc(fmtFull(p.ts)) + '</div><div>📍 ' + esc(where) + '</div></div>' + (mine ? '<button class="pop-del" data-del="' + id + '" type="button">Remover este lugar</button>' : '');
}
function renderPlaces() {
  if (!S.map || !window.L) return;
  S.layerG.clearLayers(); S.markers = {};
  const ids = Object.keys(S.places);
  ids.forEach(id => {
    const p = S.places[id]; const mine = p.u === S.uid; const who = mine ? 'Você' : nameOf(p.u);
    const mk = L.marker([p.lat, p.lng], { icon: pinIcon(mine ? 'mine' : 'theirs') }).addTo(S.layerG);
    mk.bindTooltip('<b>' + esc(p.name) + '</b><span>' + esc(who) + ' · ' + esc(shortDate(p.ts)) + '</span>', { permanent: true, direction: 'bottom', offset: [0, 4], className: 'dtip' });
    mk.bindPopup(popupHtml(id, p, mine), { className: 'dpop', closeButton: false, autoPanPadding: [30, 120] });
    S.markers[id] = mk;
  });
  if (!S.mapFit) {
    S.mapFit = true;
    if (ids.length) { const b = L.latLngBounds(ids.map(i => [S.places[i].lat, S.places[i].lng])); S.map.fitBounds(b, { padding: [70, 70], maxZoom: 15 }); }
  }
}
async function reverseInfo(lat, lng) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4500);
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=pt-BR&lat=' + lat + '&lon=' + lng, { signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json(); if (!j) return { name: '', addr: '' };
    const a = j.address || {};
    const road = [a.road || a.pedestrian || a.footway || '', a.house_number || ''].filter(Boolean).join(', ');
    const city = a.city || a.town || a.village || a.municipality || '';
    const addr = [road, a.suburb || a.neighbourhood || '', city, a.state || ''].filter(Boolean).join(', ') || (j.display_name || '').split(',').slice(0, 4).join(',').trim();
    return { name: j.name || road || '', addr: addr };
  } catch (e) { return { name: '', addr: '' }; }
}
function pickPoint(lat, lng, name, reverse, addrIn) {
  if (S.temp) { S.map.removeLayer(S.temp); S.temp = null; }
  S.temp = L.marker([lat, lng], { icon: pinIcon('temp'), interactive: false }).addTo(S.map);
  let addr = addrIn || '';
  openSheet('<h3>Marcar nosso date</h3><p class="sub">Dê um nome para esse lugar.</p><input class="field" id="plName" maxlength="60" placeholder="Ex.: Pizzaria do centro" value="' + esc(name || '') + '"><div class="addr" id="plAddr">📍 ' + (addr ? esc(addr) : (reverse ? 'Buscando o endereço…' : 'Endereço não encontrado')) + '</div><div class="row"><button class="btn ghost" id="plCancel" type="button">Cancelar</button><button class="btn primary" id="plSave" type="button">Marcar</button></div>', {
    onClose: () => { if (S.temp && S.map) { S.map.removeLayer(S.temp); S.temp = null; } },
    onOpen: sh => {
      const inp = $('#plName', sh); let typed = false; inp.addEventListener('input', () => { typed = true; });
      if (reverse) reverseInfo(lat, lng).then(r => {
        if (!inp.isConnected) return;
        if (r.name && !typed) inp.value = r.name;
        if (r.addr) { addr = r.addr; $('#plAddr', sh).textContent = '📍 ' + r.addr; } else $('#plAddr', sh).textContent = '📍 Endereço não encontrado';
      });
      $('#plCancel', sh).onclick = () => closeSheet();
      $('#plSave', sh).onclick = async () => {
        const nm = inp.value.trim(); if (!nm) { inp.focus(); return; }
        const b = $('#plSave', sh); b.disabled = true;
        try {
          if (!addr && reverse) addr = (await reverseInfo(lat, lng)).addr;
          const data = { name: nm, lat: +lat.toFixed(6), lng: +lng.toFixed(6), u: S.uid, ts: now() }; if (addr) data.addr = addr;
          await R('places').push(data); closeSheet(); toast('Date marcado 💜');
        } catch (e) { toast('Não foi possível marcar'); b.disabled = false; }
      };
    }
  });
}
function closeMapRes() { const r = $('#mapRes'); if (r) r.classList.remove('open'); }
async function searchPlaces() {
  const q = $('#mapQ').value.trim(); if (!q) return;
  const box = $('#mapRes'); box.innerHTML = '<button type="button">Buscando…</button>'; box.classList.add('open');
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=pt-BR&q=' + encodeURIComponent(q));
    const arr = await r.json();
    if (!arr.length) { box.innerHTML = '<button type="button">Nada encontrado</button>'; return; }
    box.innerHTML = arr.map((it, i) => '<button type="button" data-i="' + i + '">' + esc(it.name || it.display_name.split(',')[0]) + '<small>' + esc(it.display_name) + '</small></button>').join('');
    box._res = arr;
  } catch (e) { box.innerHTML = '<button type="button">Erro na busca. Tente de novo.</button>'; }
}
function locateMe() {
  if (!navigator.geolocation) return toast('Localização indisponível');
  toast('Buscando sua localização…');
  navigator.geolocation.getCurrentPosition(async p => { await ensureMap(); if (S.map) S.map.flyTo([p.coords.latitude, p.coords.longitude], 16, { duration: 1.4 }); }, () => toast('Permita a localização para usar'), { enableHighAccuracy: true, timeout: 10000 });
}
function placesList() {
  const ids = Object.keys(S.places).sort((a, b) => S.places[b].ts - S.places[a].ts);
  const html = ids.length ? '<div class="pl-list">' + ids.map(id => { const p = S.places[id]; return '<button type="button" data-id="' + id + '"><span style="font-size:24px">📍</span><span><b>' + esc(p.name) + '</b><small>' + esc(p.u === S.uid ? 'você' : nameOf(p.u)) + ' · ' + esc(fmtFull(p.ts)) + '</small>' + (p.addr ? '<small>' + esc(p.addr) + '</small>' : '') + '</span></button>'; }).join('') + '</div>' : '<div class="empty" style="margin:20px 0">Nenhum date marcado ainda.<br>Toque no mapa para marcar o primeiro 💜</div>';
  const sh = openSheet('<h3>Nossos dates</h3><p class="sub">' + ids.length + (ids.length === 1 ? ' lugar marcado' : ' lugares marcados') + '</p>' + html);
  sh.addEventListener('click', async e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const p = S.places[b.dataset.id]; closeSheet(); if (!p) return;
    await ensureMap(); if (!S.map) return;
    S.map.flyTo([p.lat, p.lng], 16, { duration: 1.2 });
    setTimeout(() => S.markers[b.dataset.id] && S.markers[b.dataset.id].openPopup(), 1300);
  });
}

/* ================= perguntas ================= */
const QDATA = {
  f: ['Divertidas', ['Qual foi a primeira coisa que você reparou em mim?', 'Se a gente fosse um casal de filme, qual seria?', 'Qual música é a nossa cara?', 'Qual é o seu maior vício em comida?', 'Qual hábito meu mais faz você rir?', 'Se você pudesse me dar um apelido novo, qual seria?', 'Qual superpoder você escolheria para nós dois?', 'Qual a coisa mais boba que te dá medo?', 'Qual foi o seu momento mais constrangedor?', 'Qual série ou filme você assistiria mil vezes?', 'Qual comida você nunca abre mão?', 'Se hoje fosse folga total, o que a gente faria?']],
  n: ['Nós dois', ['Qual foi o seu momento favorito com a gente até hoje?', 'Quando você percebeu que estava gostando de mim?', 'O que eu faço que melhora o seu dia?', 'Qual foi o nosso melhor date?', 'Qual lembrança nossa faz você sorrir só de pensar?', 'O que você mais admira em mim?', 'O que a gente poderia fazer mais vezes?', 'Qual foi a sua primeira impressão sobre mim?', 'O que você mais gosta no nosso jeito de ser juntos?', 'Qual música te lembra a gente?', 'Quando você sentiu que a gente se conectou de verdade?', 'Qual é a nossa melhor piada interna?']],
  s: ['Sonhos', ['Se dinheiro não fosse problema, onde você moraria?', 'Qual viagem dos sonhos você quer fazer comigo?', 'Qual sonho você ainda não contou para ninguém?', 'Como seria o seu dia perfeito?', 'Qual profissão você teria se pudesse escolher qualquer uma?', 'Qual lugar do mundo você mais quer conhecer?', 'Qual experiência você quer viver antes de envelhecer?', 'Se pudesse aprender qualquer coisa do zero, o que seria?', 'Como seria a casa dos seus sonhos?', 'Qual é o seu maior objetivo para este ano?', 'Qual projeto você gostaria de fazer junto comigo?', 'O que você faria se não tivesse medo de falhar?']],
  p: ['Profundas', ['Qual é o seu maior medo?', 'O que faz você se sentir em paz?', 'Qual foi a fase mais difícil da sua vida e o que te ajudou?', 'O que você mais precisa de mim quando está mal?', 'Do que você mais se orgulha na sua vida?', 'Qual é a lição mais importante que a vida te ensinou?', 'O que você gostaria de mudar em você?', 'Como você demonstra amor e como gosta de receber?', 'Qual insegurança você tem e quase nunca fala?', 'O que significa amor para você?', 'Qual lembrança de infância você guarda com mais carinho?', 'O que você nunca quer perder?']],
  u: ['Futuro', ['Onde você imagina a gente daqui a 5 anos?', 'Você quer ter filhos? Quantos?', 'Como você imagina a nossa rotina morando juntos?', 'Quais valores você quer que a nossa família tenha?', 'Qual tradição nossa você quer criar?', 'Qual é o primeiro lugar que a gente deveria viajar juntos?', 'Qual bichinho de estimação teríamos?', 'Como você imagina a gente envelhecendo?', 'O que você quer que a gente conquiste juntos este ano?', 'O que é essencial para você num relacionamento daqui para frente?', 'Como você quer comemorar o nosso próximo aniversário de namoro?', 'Qual é o maior plano que você tem para nós dois?']]
};
const QUESTIONS = []; Object.keys(QDATA).forEach(k => QDATA[k][1].forEach((t, i) => QUESTIONS.push({ id: k + i, cat: k, t })));
const qList = () => S.qcat === 'all' ? QUESTIONS : QUESTIONS.filter(q => q.cat === S.qcat);
function renderQuizCats() {
  $('#qCats').innerHTML = '<button class="cat on" data-c="all" type="button">Todas</button>' + Object.keys(QDATA).map(k => '<button class="cat" data-c="' + k + '" type="button">' + QDATA[k][0] + '</button>').join('');
}
function ansOf(qid, u) { return S.answers[qid] && S.answers[qid][u] ? S.answers[qid][u].t : ''; }
function otherHtml(q) {
  const p = S.partner; if (!p) return '';
  const mine = ansOf(q.id, S.uid), theirs = ansOf(q.id, p), nm = esc(nameOf(p));
  if (theirs && mine) return '<div class="q-other"><small>Resposta de ' + nm + '</small>' + esc(theirs) + '</div>';
  if (theirs) return '<div class="q-other locked"><span class="blur">Uma resposta secreta aguardando você</span>' + nm + ' já respondeu. Responda para ver 👀</div>';
  return '<div class="q-other locked">' + nm + ' ainda não respondeu.</div>';
}
function renderQuiz(dir) {
  const list = qList(); if (!list.length) return;
  S.qi = (S.qi % list.length + list.length) % list.length;
  const q = list[S.qi];
  $('#qStage').innerHTML = '<div class="q-card ' + (dir === 'l' ? 'in-l' : 'in-r') + '" data-q="' + q.id + '"><div class="q-cat">' + esc(QDATA[q.cat][0]) + ' · ' + (S.qi + 1) + '/' + list.length + '</div><div class="q-text">' + esc(q.t) + '</div><textarea id="qAns" maxlength="600" placeholder="Escreva sua resposta…">' + esc(ansOf(q.id, S.uid)) + '</textarea><button class="btn primary" id="qSave" type="button">Salvar resposta</button><div id="qOther">' + otherHtml(q) + '</div></div>';
  updateQuizMeta();
}
function updateQuizMeta() {
  const list = qList(); if (!list.length || !$('#qProg')) return;
  const q = list[((S.qi % list.length) + list.length) % list.length];
  const mine = QUESTIONS.filter(x => ansOf(x.id, S.uid)).length;
  const both = S.partner ? QUESTIONS.filter(x => ansOf(x.id, S.uid) && ansOf(x.id, S.partner)).length : 0;
  $('#qProg').textContent = both + ' respondidas pelos dois · ' + mine + ' por você';
  $('#qBar').style.width = Math.round(mine / QUESTIONS.length * 100) + '%';
  const o = $('#qOther'); if (o && q) o.innerHTML = otherHtml(q);
}
function quizMove(d) { S.qi += d; renderQuiz(d < 0 ? 'l' : 'r'); }

/* ================= bilhetes ================= */
const NCOL = [{ bg: '#7c3aed', fg: '#ffffff' }, { bg: '#a78bfa', fg: '#150a2b' }, { bg: '#f5f3ff', fg: '#2e1065' }, { bg: '#1f1b2e', fg: '#e9e5ff' }, { bg: '#4c1d95', fg: '#ffffff' }, { bg: '#ddd6fe', fg: '#2e1065' }];
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function renderNotes() {
  const g = $('#notesGrid'); if (!g) return;
  const ids = Object.keys(S.notes).sort((a, b) => S.notes[b].ts - S.notes[a].ts);
  $('#notesEmpty').style.display = ids.length ? 'none' : 'block';
  g.innerHTML = ids.map(id => {
    const n = S.notes[id], c = NCOL[n.c] || NCOL[0], rot = ((hash(id) % 5) - 2) * 0.9;
    return '<div class="note" data-id="' + id + '" style="background:' + c.bg + ';color:' + c.fg + ';transform:rotate(' + rot + 'deg)"><div class="nt">' + esc(n.t) + '</div><div class="nf"><span>' + esc(n.u === S.uid ? 'você' : nameOf(n.u)) + '</span><span>' + new Date(n.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + '</span></div></div>';
  }).join('');
}
function newNote() {
  let col = 0;
  const sh = openSheet('<h3>Novo bilhete</h3><p class="sub">Deixe um recado para ler quando quiser.</p><textarea class="field area" id="ntText" rows="5" maxlength="500" placeholder="Escreva aqui…" style="margin-top:0"></textarea><div class="color-row">' + NCOL.map((c, i) => '<button type="button" data-c="' + i + '" class="' + (i === 0 ? 'on' : '') + '" style="background:' + c.bg + '"></button>').join('') + '</div><button class="btn primary" id="ntSave" type="button">Colar no mural</button>');
  sh.addEventListener('click', async e => {
    const b = e.target.closest('[data-c]');
    if (b) { col = +b.dataset.c; $$('.color-row button', sh).forEach(x => x.classList.toggle('on', x === b)); return; }
    if (e.target.closest('#ntSave')) {
      const t = $('#ntText', sh).value.trim(); if (!t) return;
      try { await R('notes').push({ t: t, c: col, u: S.uid, ts: now() }); closeSheet(); toast('Bilhete colado 💌'); } catch (x) { toast('Não foi possível salvar'); }
    }
  });
}
function readNote(id) {
  const n = S.notes[id]; if (!n) return; const c = NCOL[n.c] || NCOL[0]; const mine = n.u === S.uid;
  const sh = openSheet('<div class="read-note" style="background:' + c.bg + ';color:' + c.fg + '">' + esc(n.t) + '</div><p class="sub" style="text-align:center;margin:0 0 14px">de ' + esc(mine ? 'você' : nameOf(n.u)) + ' · ' + esc(fmtFull(n.ts)) + '</p>' + (mine ? '<button class="btn danger" id="ntDel" type="button">Apagar bilhete</button>' : ''));
  const d = $('#ntDel', sh); if (d) d.onclick = () => { R('notes/' + id).remove(); closeSheet(); };
}

/* ================= ajustes ================= */
function settings() {
  const perm = ('Notification' in window) ? Notification.permission : 'denied';
  const sh = openSheet('<h3>Ajustes</h3><p class="sub">Só vocês dois veem tudo isso.</p>' +
    '<div class="set-row"><div>Foto de perfil<small>Trocar a sua foto</small></div><button class="mini" data-a="photo" type="button">Abrir</button></div>' +
    '<div class="set-row"><div>Código do casal<small>' + esc(fmtCode(S.code)) + '</small></div><button class="mini" data-a="copy" type="button">Copiar</button></div>' +
    '<div class="set-row"><div>Seu nome<small>' + esc(S.name) + '</small></div><button class="mini" data-a="name" type="button">Alterar</button></div>' +
    '<div class="set-row"><div>Data de namoro<small>' + esc(S.since ? S.since.split('-').reverse().join('/') : 'não definida') + '</small></div><button class="mini" data-a="since" type="button">Alterar</button></div>' +
    (perm === 'default' ? '<div class="set-row"><div>Notificações<small>Avisos de mensagens novas</small></div><button class="mini" data-a="notif" type="button">Ativar</button></div>' : '') +
    '<div style="height:16px"></div><button class="btn danger" data-a="leave" type="button">Sair neste aparelho</button>');
  sh.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'copy') { try { await navigator.clipboard.writeText(fmtCode(S.code)); toast('Código copiado'); } catch (x) { toast(fmtCode(S.code)); } }
    if (a === 'photo') { closeSheet(true); setTimeout(profileSheet, 30); }
    if (a === 'since') { closeSheet(true); setTimeout(editSince, 30); }
    if (a === 'notif') { try { await Notification.requestPermission(); } catch (x) {} closeSheet(); }
    if (a === 'name') {
      closeSheet(true);
      setTimeout(() => {
        const s2 = openSheet('<h3>Seu nome</h3><p class="sub">Assim a outra pessoa vê você.</p><input class="field" id="nmIn" maxlength="24" value="' + esc(S.name) + '"><button class="btn primary" id="nmSave" type="button">Salvar</button>');
        $('#nmSave', s2).onclick = async () => { const v = $('#nmIn', s2).value.trim(); if (!v) return; await R('members/' + S.uid + '/name').set(v); closeSheet(); toast('Nome atualizado'); };
      }, 30);
    }
    if (a === 'leave') {
      if (!confirm('Sair neste aparelho? Para voltar você precisará de um novo pedido com o código.')) return;
      closeSheet(true); leave();
    }
  });
}
function leave() {
  try { R('presence/' + S.uid).set({ on: false, ts: now() }); } catch (e) {}
  clearRefs(); forget(); S.members = {}; S.partner = null; S.msgs = {}; msgEls.clear(); sepEls.clear(); $('#msgs').innerHTML = '';
  S.places = {}; S.notes = {}; S.answers = {}; S.since = null; if (S.layerG) S.layerG.clearLayers();
  stopAudio(); if (REC.mr) stopRec(true); S.reply = null; renderReplyBar(); document.body.classList.remove('hide-tabs'); go('welcome');
}

/* ================= eventos ================= */
function initUI() {
  /* boas-vindas */
  $('#btnCreate').onclick = () => { go('create'); showStep('c', 1); setTimeout(() => $('#cName').focus(), 500); };
  $('#btnJoin').onclick = () => { go('join'); showStep('j', 1); };
  $$('[data-back]').forEach(b => b.onclick = () => go('welcome'));

  /* criar */
  $('#cGo').onclick = async () => {
    const n = $('#cName').value.trim(); if (!n) return toast('Digite seu nome');
    const b = $('#cGo'); b.disabled = true;
    try { await createRoom(n); showCreateWaiting(); } catch (e) { toast('Não foi possível criar. Verifique a conexão.'); }
    b.disabled = false;
  };
  $('#cCopy').onclick = async () => { try { await navigator.clipboard.writeText(fmtCode(S.code)); toast('Código copiado'); } catch (e) { toast(fmtCode(S.code)); } };
  $('#cShare').onclick = async () => {
    const txt = 'Entra no nosso espaço! Código: ' + fmtCode(S.code) + ' 💜 ' + location.href.split('#')[0];
    if (navigator.share) { try { await navigator.share({ text: txt }); } catch (e) {} } else { try { await navigator.clipboard.writeText(txt); toast('Mensagem copiada'); } catch (e) {} }
  };
  $('#cReq').addEventListener('click', async e => {
    const ok = e.target.closest('[data-ok]'), no = e.target.closest('[data-no]');
    if (ok) {
      const id = ok.dataset.ok; ok.disabled = true;
      try {
        const rq = (await R('requests/' + id).once('value')).val(); if (!rq) return;
        const ms = (await R('members').once('value')).val() || {};
        if (Object.keys(ms).length >= 2) return toast('Já existem duas pessoas aqui');
        await R('members/' + id).set({ name: rq.name, joined: now() });
        await R('requests/' + id).remove();
      } catch (x) { toast('Não foi possível confirmar'); ok.disabled = false; }
    }
    if (no) { R('requests/' + no.dataset.no).remove(); }
  });

  /* entrar */
  $('#jCode').addEventListener('input', e => { const v = normCode(e.target.value); e.target.value = v.length > 3 ? v.slice(0, 3) + '-' + v.slice(3) : v; });
  $('#jGo').onclick = async () => {
    const code = normCode($('#jCode').value), name = $('#jName').value.trim(), err = $('#jErr'); err.textContent = '';
    if (code.length < 6) { err.textContent = 'O código tem 6 caracteres.'; return; }
    if (!name) { err.textContent = 'Digite seu nome.'; return; }
    const b = $('#jGo'); b.disabled = true;
    try { const r = await joinRoom(code, name); if (r === 'member') enterMain(); else showJoinWaiting(); }
    catch (e) { err.textContent = e.message && e.message.length < 80 ? e.message : 'Não foi possível entrar. Verifique a conexão.'; }
    b.disabled = false;
  };
  $('#jCancel').onclick = async () => {
    try { await R('requests/' + S.uid).remove(); } catch (e) {}
    clearRefs(); forget(); showStep('j', 1);
  };

  /* ilha */
  $('#island').addEventListener('click', e => {
    if (e.target.closest('#islEdit')) { editSince(); return; }
    $('#island').classList.toggle('open');
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#island')) closeIsland(); });

  /* abas */
  $$('#tabbar .tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#btnSettings').onclick = settings;
  $('#chAvatar').onclick = profileSheet;
  $('#avIn').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const d = await squareCompress(f, 256, 0.82); await R('members/' + S.uid + '/photo').set(d); closeSheet(); toast('Foto atualizada 💜'); }
    catch (x) { toast('Não consegui usar essa foto'); }
  };

  /* chat */
  const inp = $('#msgInput'); let typT = 0, lastTyp = 0;
  inp.addEventListener('input', () => {
    autosize();
    if (now() - lastTyp > 2000) { lastTyp = now(); R('typing/' + S.uid).set(now()); }
    clearTimeout(typT); typT = setTimeout(() => { R('typing/' + S.uid).set(0); lastTyp = 0; }, 3500);
  });
  inp.addEventListener('focus', () => { S.chatFocus = true; if (S.emojiOpen) toggleEmoji(false); updateTabsVisibility(); setTimeout(() => scrollBottom(false), 350); });
  inp.addEventListener('blur', () => { S.chatFocus = false; setTimeout(updateTabsVisibility, 80); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !/Android|iPhone|iPad/i.test(navigator.userAgent)) { e.preventDefault(); $('#btnSend').click(); }
  });
  $('#btnSend').onclick = () => {
    const v = inp.value.trim();
    if (!v) { startRec(); return; }
    sendMessage(v); inp.value = ''; autosize();
    if (!S.emojiOpen) inp.focus();
  };
  $('#btnAttach').onclick = () => $('#fileIn').click();
  $('#btnCam').onclick = () => $('#camIn').click();
  $('#recCancel').onclick = () => stopRec(true);
  $('#recSend').onclick = () => stopRec(false);
  $('#fileIn').onchange = e => { pickPhoto(e.target.files[0]); e.target.value = ''; };
  $('#camIn').onchange = e => { pickPhoto(e.target.files[0]); e.target.value = ''; };
  $('#btnEmoji').onclick = () => toggleEmoji(!S.emojiOpen);
  $('#emojiTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; emoCat = +b.dataset.i; renderEmojiTabs(); });
  $('#emojiGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (b) insertEmoji(b.dataset.e); });

  const sc = $('#msgsScroll');
  sc.addEventListener('scroll', () => {
    S.stick = nearBottom();
    $('#toBottom').classList.toggle('show', !S.stick);
    if (S.stick && S.unread) { S.unread = 0; updateBadge(); }
  }, { passive: true });
  $('#toBottom').onclick = () => { scrollBottom(true); S.unread = 0; updateBadge(); };
  sc.addEventListener('click', () => { if (S.emojiOpen) toggleEmoji(false); });

  /* mensagens: toque, foto, segurar e deslizar para responder */
  const msgs = $('#msgs'); let lp = null, sx = 0, sy = 0, fired = false, sw = null;
  const THRESH = 52;
  msgs.addEventListener('click', e => {
    if (fired) { fired = false; return; }
    const vp = e.target.closest('.vm-play'); if (vp) { toggleAudio(vp.closest('.vm').dataset.id); return; }
    const vs = e.target.closest('.vm-spd'); if (vs) { cycleSpeed(); return; }
    const vb = e.target.closest('.vm-bars'); if (vb) { const r = vb.getBoundingClientRect(); seekAudio(vb.closest('.vm').dataset.id, (e.clientX - r.left) / r.width); return; }
    const q = e.target.closest('.quote'); if (q) { jumpTo(q.dataset.q); return; }
    const im = e.target.closest('.pic img'); if (im) openViewer(im.src);
  });
  msgs.addEventListener('pointerdown', e => {
    const b = e.target.closest('.bubble'); if (!b) return;
    sx = e.clientX; sy = e.clientY; fired = false; b.classList.add('press');
    sw = { el: b.closest('.msg'), on: false, done: false };
    lp = setTimeout(() => {
      if (sw && sw.on) return;
      fired = true; b.classList.remove('press'); sw = null;
      if (navigator.vibrate) navigator.vibrate(15);
      msgMenu(b.closest('.msg').dataset.id);
    }, 430);
  });
  const cancelLp = () => { clearTimeout(lp); $$('.bubble.press').forEach(x => x.classList.remove('press')); };
  const endSwipe = () => {
    if (!sw) return;
    const el = sw.el, hit = sw.on && sw.done, was = sw.on; sw = null;
    el.classList.remove('swiping', 'armed', 'swl'); el.style.transform = ''; el.style.removeProperty('--sw');
    if (was) fired = true;
    if (hit) startReply(el.dataset.id);
  };
  const abortSwipe = () => { if (sw) sw.done = false; endSwipe(); };
  msgs.addEventListener('pointermove', e => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (sw && !sw.on && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      sw.on = true; sw.dir = dx > 0 ? 1 : -1; cancelLp();
      sw.el.classList.add('swiping'); sw.el.classList.toggle('swl', sw.dir < 0);
    }
    if (sw && sw.on) {
      const d = Math.max(0, dx * sw.dir);
      const x = Math.min(d < THRESH ? d : THRESH + (d - THRESH) * 0.25, 92);
      sw.el.style.transform = 'translateX(' + (x * sw.dir) + 'px)';
      sw.el.style.setProperty('--sw', Math.min(1, x / THRESH));
      const done = d >= THRESH;
      if (done && !sw.done && navigator.vibrate) navigator.vibrate(12);
      sw.done = done; sw.el.classList.toggle('armed', done);
      return;
    }
    if (Math.abs(dx) > 9 || Math.abs(dy) > 9) cancelLp();
  });
  msgs.addEventListener('pointerup', () => { cancelLp(); endSwipe(); });
  msgs.addEventListener('pointercancel', () => { cancelLp(); abortSwipe(); });
  msgs.addEventListener('pointerleave', () => { cancelLp(); abortSwipe(); });
  msgs.addEventListener('contextmenu', e => { const b = e.target.closest('.bubble'); if (!b) return; e.preventDefault(); if (!fired) { fired = true; cancelLp(); sw = null; msgMenu(b.closest('.msg').dataset.id); } });
  $('#rpClose').onclick = clearReply;
  $('#viewer').onclick = () => $('#viewer').classList.remove('show');

  /* status */
  $('#moodGrid').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return; S.pickMood = MOODS[+b.dataset.i];
    $$('#moodGrid .chip').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#moodSave').onclick = async () => {
    if (!S.pickMood) return toast('Escolha como você está');
    try {
      await R('moods').push({ u: S.uid, e: S.pickMood[0], l: S.pickMood[1], t: $('#moodText').value.trim(), ts: now() });
      $('#moodText').value = ''; $$('#moodGrid .chip').forEach(x => x.classList.remove('on')); S.pickMood = null; toast('Status atualizado 💜');
    } catch (e) { toast('Não foi possível atualizar'); }
  };
  setInterval(() => { if (S.code && S.tab === 'status') renderMoods(); updateSub(); }, 30000);
  setInterval(() => { if (S.code) updateSub(); }, 1500);

  /* mapa */
  $('#mapGo').onclick = searchPlaces;
  $('#mapQ').addEventListener('keydown', e => { if (e.key === 'Enter') searchPlaces(); });
  $('#mapRes').addEventListener('click', async e => {
    const b = e.target.closest('[data-i]'); if (!b) return; const it = $('#mapRes')._res[+b.dataset.i]; if (!it) return;
    closeMapRes(); await ensureMap(); if (!S.map) return;
    const lat = +it.lat, lng = +it.lon; S.map.flyTo([lat, lng], 17, { duration: 1.2 });
    const parts = it.display_name.split(',');
    const ad = (parts.length > 1 ? parts.slice(1, 4) : parts).join(',').trim();
    setTimeout(() => pickPoint(lat, lng, it.name || parts[0], false, ad), 900);
  });
  $('#mapMsg').addEventListener('click', e => { if (e.target.closest('#mapRetry')) ensureMap(); });
  $('#mapLocate').onclick = locateMe;
  $('#mapList').onclick = placesList;
  $('#map').addEventListener('click', e => {
    const d = e.target.closest('[data-del]'); if (!d) return;
    if (confirm('Remover este lugar do mapa?')) { R('places/' + d.dataset.del).remove(); if (S.map) S.map.closePopup(); }
  });

  /* perguntas */
  $('#qCats').addEventListener('click', e => {
    const b = e.target.closest('.cat'); if (!b) return; S.qcat = b.dataset.c; S.qi = 0;
    $$('#qCats .cat').forEach(x => x.classList.toggle('on', x === b)); renderQuiz('r');
  });
  $('#qPrev').onclick = () => quizMove(-1);
  $('#qNext').onclick = () => quizMove(1);
  $('#qRand').onclick = () => { const n = qList().length; S.qi = Math.floor(Math.random() * n); renderQuiz('r'); };
  $('#qStage').addEventListener('click', async e => {
    if (!e.target.closest('#qSave')) return;
    const card = $('.q-card'); const id = card.dataset.q; const t = $('#qAns').value.trim();
    try {
      if (t) await R('answers/' + id + '/' + S.uid).set({ t: t, ts: now() }); else await R('answers/' + id + '/' + S.uid).remove();
      toast(t ? 'Resposta salva 💜' : 'Resposta removida');
    } catch (x) { toast('Não foi possível salvar'); }
  });
  let tx = 0;
  $('#qStage').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('#qStage').addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 70 && document.activeElement.tagName !== 'TEXTAREA') quizMove(dx < 0 ? 1 : -1); }, { passive: true });

  /* bilhetes */
  $('#noteAdd').onclick = newNote;
  $('#notesGrid').addEventListener('click', e => { const n = e.target.closest('.note'); if (n) readNote(n.dataset.id); });

  /* visibilidade */
  document.addEventListener('visibilitychange', () => {
    if (!S.code || !S.db || document.body.dataset.screen !== 'main') return;
    if (document.hidden && REC.mr) { stopRec(true); toast('Gravação cancelada'); }
    R('presence/' + S.uid).set({ on: !document.hidden, ts: now() });
    if (!document.hidden) markRead();
  });
  window.addEventListener('resize', () => { if (S.stick) scrollBottom(false); if (S.map) S.map.invalidateSize(); });
  setInterval(renderIsland, 60000);
  autosize();
}

/* ================= PWA ================= */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

initUI();
boot();
})();
