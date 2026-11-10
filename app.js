'use strict';

/* =========================================================
 * 訪問歯科 進捗ダッシュボード（テスト版）
 * データはブラウザの localStorage に保存。
 * 本番（Xサーバー / PHP + MySQL）では Store 部分を API 呼び出しに差し替える想定。
 * ========================================================= */

const STORE_KEY = 'houmon-dashboard-v1';

const STATUSES = ['受付', '初診日調整中', '初診日確定', '初診済・医院処理中', '継続訪問', '終了・中止'];
const PRE_FIRST_VISIT = ['受付', '初診日調整中', '初診日確定'];
const VISIT_KINDS = ['初診', '再診', 'その他'];

const OPTIONS = {
  check: ['未', '済', '対象外'],
  doc: ['未', '後日返信待ち', '回収済', '対象外'],
  give: ['未', '渡した', '対象外'],
  copy: ['未', '写真・コピー取得済', '対象外'],
};
const DONE_VALUES = new Set(['済', '回収済', '対象外', '渡した', '写真・コピー取得済']);

// チェックリスト（「初診時チェックリスト（居宅用）」ベース。施設・居宅共通）
const SECTIONS = [
  {
    id: 'a', phase: '訪問先', title: '① 初診時に行うこと（診療・説明）', role: '歯科医師・歯科衛生士',
    items: [
      { id: 'a1', label: '自己紹介・挨拶・訪問診療の流れ、概要などの説明', type: 'check' },
      { id: 'a2', label: '全身状態の観察（意識・体調）', type: 'check' },
      { id: 'a3', label: '医科主病名・既往歴', type: 'check', sub: true },
      { id: 'a4', label: 'アレルギー', type: 'check', sub: true },
      { id: 'a5', label: '感染症', type: 'check', sub: true },
      { id: 'a6', label: '服薬内容（お薬手帳確認）', type: 'check', sub: true },
      { id: 'a7', label: '疼痛・主訴の確認', type: 'check' },
      { id: 'a8', label: '口腔内診査（歯・義歯・粘膜・清掃状態）', type: 'check' },
      { id: 'a9', label: '★ 歯科検診結果のお知らせ記入（複写）', type: 'check', sub: true },
      { id: 'a10', label: '★ 歯式・P検査', type: 'check', sub: true },
      { id: 'a11', label: '★ 口腔内・義歯などの写真撮影', type: 'check', sub: true },
      { id: 'a12', label: '義歯の有無・適合状態確認', type: 'check' },
      { id: 'a13', label: '必要に応じて応急処置', type: 'check' },
    ],
  },
  {
    id: 'b', phase: '訪問先', title: '② 初診時にお渡しするもの（書類・物品）', role: '助手・歯科衛生士',
    items: [
      { id: 'b1', label: '診療申込書・同意書（回収 or 口座振替申込書と一緒に後日返信）', type: 'doc' },
      { id: 'b2', label: '介護保険：契約書（2部記入・1部回収）', type: 'doc' },
      { id: 'b3', label: '介護保険：契約書別紙', type: 'doc' },
      { id: 'b4', label: '介護保険：重要事項説明書（2部記入・1部回収）', type: 'doc' },
      { id: 'b5', label: '個人情報の取扱いについてのお知らせ', type: 'give' },
      { id: 'b6', label: '連絡先案内（医院TEL／緊急時連絡方法）', type: 'give' },
      { id: 'b7', label: '口座振替セット（申込書2枚・記入例・返信用封筒）', type: 'doc' },
      { id: 'b8', label: 'マイナンバーカード読み取り or 資格確認書・医療証（写真 or コピー）', type: 'copy' },
      { id: 'b9', label: '介護保険証・負担割合証（写真 or コピー）', type: 'copy' },
    ],
  },
  {
    id: 'c', phase: '医院', title: '③ 事務・連携対応', role: '事務',
    items: [
      { id: 'c1', label: 'マイナンバーカード／資格確認書・医療証の確認・登録', type: 'check', dependsOn: ['b8'] },
      { id: 'c2', label: '介護保険証・負担割合証の確認・登録', type: 'check', dependsOn: ['b9'] },
      { id: 'c3', label: 'ケアマネジャーへの情報共有（検診結果のお知らせ・写真の送付）', type: 'check', dependsOn: ['a9', 'a11'] },
      { id: 'c4', label: '患者原簿の作製・加筆', type: 'check' },
    ],
  },
];
const ALL_ITEMS = SECTIONS.flatMap(s => s.items.map(i => ({ ...i, phase: s.phase, sectionId: s.id })));
const ITEM_BY_ID = Object.fromEntries(ALL_ITEMS.map(i => [i.id, i]));

/* ---------------- Store ---------------- */

function defaultState() {
  return {
    version: 1,
    settings: {
      facilities: ['施設A', '施設B', '施設C', '施設D'],
      staff: ['院長', '歯科衛生士1', '歯科衛生士2', '事務'],
    },
    patients: [],
    visits: [],
    log: [],
  };
}

let state = load();
const ui = {
  placeFilter: sessionStorage.getItem('placeFilter') || '',
  scheduleTab: 'today',
  month: ymd(new Date()).slice(0, 7),
  currentUser: localStorage.getItem(STORE_KEY + ':user') || '',
};

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return { ...defaultState(), ...s, settings: { ...defaultState().settings, ...(s.settings || {}) } };
  } catch (e) {
    console.error(e);
    return defaultState();
  }
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nowIso() {
  return new Date().toISOString();
}

function addLog(pid, text) {
  state.log.unshift({ at: nowIso(), by: ui.currentUser || '（未選択）', pid, text });
  if (state.log.length > 1000) state.log.length = 1000;
}

/* ---------------- Helpers ---------------- */

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const WD = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDate(s) { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; }
function fmtDateTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function options(list, selected, { blank } = {}) {
  const head = blank !== undefined ? `<option value="">${esc(blank)}</option>` : '';
  return head + list.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}
function places() { return [...state.settings.facilities, '居宅']; }
function patientById(id) { return state.patients.find(p => p.id === id); }
function matchesPlace(p) { return !ui.placeFilter || (p && p.place === ui.placeFilter); }
function itemValue(p, itemId) { return (p.checklist[itemId] && p.checklist[itemId].value) || '未'; }
function isDone(p, itemId) { return DONE_VALUES.has(itemValue(p, itemId)); }
function checklistApplies(p) { return !PRE_FIRST_VISIT.includes(p.status) && p.status !== '終了・中止'; }
function outstandingItems(p) { return ALL_ITEMS.filter(i => !isDone(p, i.id)); }
function progress(p) {
  const done = ALL_ITEMS.filter(i => isDone(p, i.id)).length;
  return { done, total: ALL_ITEMS.length };
}
function waitingDeps(p, item) {
  return (item.dependsOn || []).filter(d => !isDone(p, d)).map(d => ITEM_BY_ID[d]);
}
function statusClass(s) { return 'st-' + STATUSES.indexOf(s); }
function placeLabel(p) { return p ? p.place : '（削除済み）'; }
function patientLink(p) {
  if (!p) return '<span class="muted">（削除済み）</span>';
  return `<a href="#/patient/${p.id}" class="pno">${esc(p.number)}</a>`;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

function requireUser() {
  if (ui.currentUser) return true;
  toast('右上の「入力者」を選んでください');
  document.getElementById('current-user').focus();
  return false;
}

/* ---------------- Header ---------------- */

function renderHeader(route) {
  const userSel = document.getElementById('current-user');
  userSel.innerHTML = options(state.settings.staff, ui.currentUser, { blank: '選択してください' });
  const placeSel = document.getElementById('place-filter');
  placeSel.innerHTML = options(places(), ui.placeFilter, { blank: 'すべて' });
  document.querySelectorAll('[data-nav]').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === route);
  });
}

/* ---------------- Schedule component ---------------- */

function visitsBetween(from, to) {
  return state.visits
    .filter(v => v.date >= from && v.date <= to)
    .filter(v => matchesPlace(patientById(v.patientId)))
    .sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}

function visitRow(v, { showDate }) {
  const p = patientById(v.patientId);
  return `<tr class="${v.done ? 'is-done' : ''}">
    ${showDate ? `<td class="nowrap">${fmtDate(v.date)}</td>` : ''}
    <td class="nowrap">${esc(v.time || '—')}</td>
    <td>${esc(placeLabel(p))}</td>
    <td>${patientLink(p)}</td>
    <td><span class="kind kind-${VISIT_KINDS.indexOf(v.kind)}">${esc(v.kind)}</span></td>
    <td>${esc(v.staff || '')}</td>
    <td class="note">${esc(v.note || '')}</td>
    <td class="nowrap">
      <label class="inline"><input type="checkbox" data-action="visit-done" data-id="${v.id}" ${v.done ? 'checked' : ''}> 実施済</label>
      <button class="link danger" data-action="visit-delete" data-id="${v.id}">削除</button>
    </td>
  </tr>`;
}

function visitTable(list, { showDate }) {
  if (!list.length) return '<p class="empty">予定はありません</p>';
  return `<div class="table-wrap"><table class="table visits">
    <thead><tr>${showDate ? '<th>日付</th>' : ''}<th>時間</th><th>訪問先</th><th>患者番号</th><th>区分</th><th>担当</th><th>メモ</th><th></th></tr></thead>
    <tbody>${list.map(v => visitRow(v, { showDate })).join('')}</tbody>
  </table></div>`;
}

function monthCalendar() {
  const [y, m] = ui.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = startOfWeek(first);
  const last = new Date(y, m, 0);
  const visits = visitsBetween(ymd(start), ymd(addDays(start, 41)));
  const byDate = {};
  visits.forEach(v => { (byDate[v.date] = byDate[v.date] || []).push(v); });
  const today = ymd(new Date());
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d > last) break;
    const key = ymd(d);
    const list = byDate[key] || [];
    const other = d.getMonth() !== m - 1;
    cells += `<div class="cal-cell${other ? ' other' : ''}${key === today ? ' today' : ''}${d.getDay() === 0 ? ' sun' : ''}${d.getDay() === 6 ? ' sat' : ''}">
      <div class="cal-day">${d.getDate()}</div>
      ${list.map(v => {
        const p = patientById(v.patientId);
        return `<a class="cal-item kind-${VISIT_KINDS.indexOf(v.kind)}${v.done ? ' is-done' : ''}" href="#/patient/${p ? p.id : ''}" title="${esc(placeLabel(p))} ${esc(p ? p.number : '')} ${esc(v.kind)} ${esc(v.staff || '')}">${esc(v.time || '')} ${esc(p ? p.number : '?')}</a>`;
      }).join('')}
    </div>`;
  }
  return `<div class="cal-head">
      <button class="btn small" data-action="month-prev">‹ 前月</button>
      <strong>${y}年${m}月</strong>
      <button class="btn small" data-action="month-next">次月 ›</button>
      <button class="btn small ghost" data-action="month-today">今月</button>
    </div>
    <div class="cal">
      ${['月', '火', '水', '木', '金', '土', '日'].map(w => `<div class="cal-wd">${w}</div>`).join('')}
      ${cells}
    </div>`;
}

function schedulePanel() {
  const today = new Date();
  const t = ymd(today);
  const tm = ymd(addDays(today, 1));
  const ws = startOfWeek(today);
  const tabs = [
    ['today', `今日 ${fmtDate(t)}`],
    ['tomorrow', `明日 ${fmtDate(tm)}`],
    ['week', '今週'],
    ['month', '月別'],
  ];
  let body;
  if (ui.scheduleTab === 'today') body = visitTable(visitsBetween(t, t), { showDate: false });
  else if (ui.scheduleTab === 'tomorrow') body = visitTable(visitsBetween(tm, tm), { showDate: false });
  else if (ui.scheduleTab === 'week') body = visitTable(visitsBetween(ymd(ws), ymd(addDays(ws, 6))), { showDate: true });
  else body = monthCalendar();
  return `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab${ui.scheduleTab === k ? ' active' : ''}" data-action="schedule-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body}`;
}

function visitForm(presetPatientId) {
  const pts = state.patients.filter(p => p.status !== '終了・中止').sort((a, b) => a.number.localeCompare(b.number));
  return `<form class="form-grid" data-form="visit">
    <label>日付<input type="date" name="date" required value="${ymd(new Date())}"></label>
    <label>時間<input type="time" name="time"></label>
    <label>患者番号
      <select name="patientId" required>
        <option value="">選択</option>
        ${pts.map(p => `<option value="${p.id}"${p.id === presetPatientId ? ' selected' : ''}>${esc(p.number)}（${esc(p.place)}）</option>`).join('')}
      </select>
    </label>
    <label>区分<select name="kind">${options(VISIT_KINDS, '再診')}</select></label>
    <label>担当<select name="staff">${options(state.settings.staff, '', { blank: '—' })}</select></label>
    <label class="wide">メモ<input type="text" name="note" maxlength="80" placeholder="例：家族立会いあり"></label>
    <div class="form-actions"><button class="btn primary" type="submit">予定を追加</button></div>
  </form>`;
}

/* ---------------- Views ---------------- */

function viewDashboard() {
  const pts = state.patients.filter(matchesPlace);
  const t = ymd(new Date());
  const todayCount = visitsBetween(t, t).length;
  const active = pts.filter(checklistApplies);
  const withOutstanding = active
    .map(p => ({ p, items: outstandingItems(p) }))
    .filter(x => x.items.length)
    .sort((a, b) => a.p.place.localeCompare(b.p.place) || a.p.number.localeCompare(b.p.number));
  const waitingDocs = active.reduce((n, p) => n + ALL_ITEMS.filter(i => itemValue(p, i.id) === '後日返信待ち').length, 0);
  const preFirst = pts.filter(p => PRE_FIRST_VISIT.includes(p.status))
    .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.number.localeCompare(b.number));

  const outstandingRows = withOutstanding.map(({ p, items }) => {
    const visit = items.filter(i => i.phase === '訪問先');
    const clinic = items.filter(i => i.phase === '医院');
    const chip = i => {
      const v = itemValue(p, i.id);
      const wait = waitingDeps(p, i).length ? ' chip-wait' : '';
      return `<span class="chip${v === '後日返信待ち' ? ' chip-pending' : ''}${wait}" title="${esc(i.label)}">${esc(shortLabel(i))}${v === '後日返信待ち' ? '（返信待ち）' : ''}</span>`;
    };
    return `<tr>
      <td class="nowrap">${esc(p.place)}</td>
      <td class="nowrap">${patientLink(p)}</td>
      <td><select class="status-select ${statusClass(p.status)}" data-action="patient-status" data-id="${p.id}">${options(STATUSES, p.status)}</select></td>
      <td>
        ${visit.length ? `<div class="chip-row"><span class="phase phase-visit">訪問先</span>${visit.map(chip).join('')}</div>` : ''}
        ${clinic.length ? `<div class="chip-row"><span class="phase phase-clinic">医院</span>${clinic.map(chip).join('')}</div>` : ''}
      </td>
      <td><input class="memo-input" type="text" maxlength="60" value="${esc(p.memo || '')}" data-action="patient-memo" data-id="${p.id}" placeholder="メモ（1行）"></td>
    </tr>`;
  }).join('');

  return `
  <section class="stats">
    <div class="stat"><div class="stat-label">今日の訪問</div><div class="stat-value">${todayCount}<span>件</span></div></div>
    <div class="stat"><div class="stat-label">未完了がある患者</div><div class="stat-value">${withOutstanding.length}<span>人</span></div></div>
    <div class="stat"><div class="stat-label">後日返信待ちの書類</div><div class="stat-value">${waitingDocs}<span>件</span></div></div>
    <div class="stat"><div class="stat-label">初診前の患者</div><div class="stat-value">${preFirst.length}<span>人</span></div></div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>未完了項目一覧</h2><span class="muted">初診済以降の患者のうち、チェックリストが終わっていないもの</span></div>
    ${outstandingRows ? `<div class="table-wrap"><table class="table outstanding">
      <thead><tr><th>訪問先</th><th>患者番号</th><th>ステータス</th><th>未完了の項目</th><th>メモ</th></tr></thead>
      <tbody>${outstandingRows}</tbody></table></div>` : '<p class="empty">未完了の項目はありません</p>'}
  </section>

  <section class="panel">
    <div class="panel-head"><h2>訪問予定</h2><a class="btn small" href="#/schedule">予定を追加</a></div>
    ${schedulePanel()}
  </section>

  <section class="panel">
    <div class="panel-head"><h2>初診前の患者</h2><span class="muted">受付〜初診日確定</span></div>
    ${preFirst.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>訪問先</th><th>患者番号</th><th>ステータス</th><th>初診予定</th><th>担当</th><th>メモ</th></tr></thead>
      <tbody>${preFirst.map(p => {
        const fv = state.visits.filter(v => v.patientId === p.id && v.kind === '初診').sort((a, b) => a.date.localeCompare(b.date))[0];
        return `<tr>
          <td>${esc(p.place)}</td><td>${patientLink(p)}</td>
          <td><select class="status-select ${statusClass(p.status)}" data-action="patient-status" data-id="${p.id}">${options(STATUSES, p.status)}</select></td>
          <td class="nowrap">${fv ? fmtDate(fv.date) + (fv.time ? ' ' + esc(fv.time) : '') : '<span class="muted">未定</span>'}</td>
          <td>${esc(p.staff || '')}</td>
          <td><input class="memo-input" type="text" maxlength="60" value="${esc(p.memo || '')}" data-action="patient-memo" data-id="${p.id}" placeholder="メモ（1行）"></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="empty">初診前の患者はいません</p>'}
  </section>`;
}

function shortLabel(i) {
  return i.label.replace(/^★\s*/, '★').replace(/（.*?）/g, '').replace(/^介護保険：/, '');
}

function viewPatients() {
  const pts = state.patients.filter(matchesPlace)
    .sort((a, b) => a.place.localeCompare(b.place) || a.number.localeCompare(b.number));
  return `
  <section class="panel">
    <div class="panel-head"><h2>患者を追加</h2><span class="muted">氏名は入力しません。患者番号と氏名の対応は院内で管理してください。</span></div>
    <form class="form-grid" data-form="patient">
      <label>患者番号<input type="text" name="number" required maxlength="20" placeholder="例：A-001" autocomplete="off"></label>
      <label>訪問先<select name="place" required>${options(places(), ui.placeFilter || '', { blank: '選択' })}</select></label>
      <label>ステータス<select name="status">${options(STATUSES, '受付')}</select></label>
      <label>担当<select name="staff">${options(state.settings.staff, '', { blank: '—' })}</select></label>
      <label class="wide">メモ（1行・氏名は書かない）<input type="text" name="memo" maxlength="60"></label>
      <div class="form-actions"><button class="btn primary" type="submit">追加</button></div>
    </form>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>患者一覧</h2><span class="muted">${pts.length}人</span></div>
    ${pts.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>訪問先</th><th>患者番号</th><th>ステータス</th><th>チェック進捗</th><th>担当</th><th>メモ</th></tr></thead>
      <tbody>${pts.map(p => {
        const pr = progress(p);
        return `<tr>
          <td>${esc(p.place)}</td><td>${patientLink(p)}</td>
          <td><select class="status-select ${statusClass(p.status)}" data-action="patient-status" data-id="${p.id}">${options(STATUSES, p.status)}</select></td>
          <td><div class="bar"><div style="width:${Math.round(pr.done / pr.total * 100)}%"></div></div><span class="muted small">${pr.done}/${pr.total}</span></td>
          <td>${esc(p.staff || '')}</td>
          <td><input class="memo-input" type="text" maxlength="60" value="${esc(p.memo || '')}" data-action="patient-memo" data-id="${p.id}"></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="empty">患者が登録されていません</p>'}
  </section>`;
}

function viewPatient(id) {
  const p = patientById(id);
  if (!p) return '<section class="panel"><p>患者が見つかりません。</p><a href="#/patients">患者一覧へ</a></section>';
  const pr = progress(p);
  const visits = state.visits.filter(v => v.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const logs = state.log.filter(l => l.pid === p.id).slice(0, 30);

  const sections = SECTIONS.map(s => `
    <div class="cl-section">
      <div class="cl-head">
        <span class="phase ${s.phase === '訪問先' ? 'phase-visit' : 'phase-clinic'}">${s.phase}</span>
        <h3>${esc(s.title)}</h3>
        <span class="muted small">${esc(s.role)}</span>
      </div>
      ${s.items.map(i => {
        const entry = p.checklist[i.id];
        const v = itemValue(p, i.id);
        const waits = waitingDeps(p, i);
        return `<div class="cl-item${i.sub ? ' sub' : ''}${DONE_VALUES.has(v) ? ' done' : ''}">
          <div class="cl-label">${esc(i.label)}
            ${waits.length && !DONE_VALUES.has(v) ? `<div class="wait-note">待ち：${waits.map(w => esc(shortLabel(w))).join('、')}</div>` : ''}
          </div>
          <select class="cl-select val-${OPTIONS[i.type].indexOf(v)}" data-action="item" data-pid="${p.id}" data-item="${i.id}">${options(OPTIONS[i.type], v)}</select>
          <div class="cl-meta muted small">${entry && entry.by ? `${esc(entry.by)} ${fmtDateTime(entry.at)}` : ''}</div>
        </div>`;
      }).join('')}
    </div>`).join('');

  return `
  <div class="crumb"><a href="#/patients">← 患者一覧</a></div>
  <section class="panel">
    <div class="patient-head">
      <h2>患者番号 <span class="pno-big">${esc(p.number)}</span></h2>
      <div class="bar wide"><div style="width:${Math.round(pr.done / pr.total * 100)}%"></div></div>
      <span class="muted">チェック ${pr.done}/${pr.total}</span>
    </div>
    <form class="form-grid" data-form="patient-edit" data-id="${p.id}">
      <label>患者番号<input type="text" name="number" required maxlength="20" value="${esc(p.number)}"></label>
      <label>訪問先<select name="place">${options(places(), p.place)}</select></label>
      <label>ステータス<select name="status" class="${statusClass(p.status)}">${options(STATUSES, p.status)}</select></label>
      <label>担当<select name="staff">${options(state.settings.staff, p.staff || '', { blank: '—' })}</select></label>
      <label class="wide">メモ（1行・氏名は書かない）<input type="text" name="memo" maxlength="60" value="${esc(p.memo || '')}"></label>
      <div class="form-actions">
        <button class="btn primary" type="submit">基本情報を保存</button>
        <button class="btn danger ghost" type="button" data-action="patient-delete" data-id="${p.id}">この患者を削除</button>
      </div>
    </form>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>初診時チェックリスト</h2><span class="muted">プルダウンを変えると、入力者と日時が自動で記録されます</span></div>
    <div class="cl-actions">
      <button class="btn small" data-action="photo-done" data-pid="${p.id}">写真撮影済みにする</button>
    </div>
    ${sections}
    <div class="cl-section">
      <div class="cl-head"><h3>備考・特記事項</h3></div>
      <textarea class="remarks" rows="3" maxlength="400" data-action="patient-remarks" data-id="${p.id}" placeholder="氏名・住所などの個人情報は書かないでください">${esc(p.remarks || '')}</textarea>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>訪問予定・履歴</h2></div>
    ${visitForm(p.id)}
    ${visitTable(visits, { showDate: true })}
  </section>

  <section class="panel">
    <div class="panel-head"><h2>変更履歴</h2><span class="muted">直近30件</span></div>
    ${logs.length ? `<ul class="log">${logs.map(l => `<li><span class="muted small">${fmtDateTime(l.at)}</span> <strong>${esc(l.by)}</strong> ${esc(l.text)}</li>`).join('')}</ul>` : '<p class="empty">履歴はまだありません</p>'}
  </section>`;
}

function viewSchedule() {
  return `
  <section class="panel">
    <div class="panel-head"><h2>訪問予定を追加</h2><span class="muted">「初診」の予定を入れると、初診前の患者は「初診日確定」になります</span></div>
    ${state.patients.length ? visitForm('') : '<p class="empty">先に<a href="#/patients">患者一覧</a>から患者を登録してください</p>'}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>訪問予定</h2></div>
    ${schedulePanel()}
  </section>`;
}

function viewSettings() {
  return `
  <section class="panel">
    <div class="panel-head"><h2>施設・スタッフ</h2><span class="muted">1行に1つずつ入力</span></div>
    <form class="settings-grid" data-form="settings">
      <label>施設名<textarea name="facilities" rows="6">${esc(state.settings.facilities.join('\n'))}</textarea>
        <span class="muted small">「居宅」は自動で追加されます</span></label>
      <label>スタッフ（入力者・担当者）<textarea name="staff" rows="6">${esc(state.settings.staff.join('\n'))}</textarea></label>
      <div class="form-actions"><button class="btn primary" type="submit">保存</button></div>
    </form>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>データ</h2></div>
    <p class="muted">テスト版ではデータがこのブラウザ内だけに保存されます。別の端末に移すときは書き出し → 読み込みを使ってください。</p>
    <div class="btn-row">
      <button class="btn" data-action="export">データを書き出す（JSON）</button>
      <label class="btn">データを読み込む<input type="file" accept="application/json" data-action="import" hidden></label>
      <button class="btn" data-action="sample">サンプルデータを入れる</button>
      <button class="btn danger" data-action="reset">全データを消去</button>
    </div>
  </section>`;
}

/* ---------------- Router ---------------- */

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('patient/')) return { name: 'patient', id: h.slice(8) };
  if (h === 'patients') return { name: 'patients' };
  if (h === 'schedule') return { name: 'schedule' };
  if (h === 'settings') return { name: 'settings' };
  return { name: 'dashboard' };
}

function render() {
  const r = currentRoute();
  renderHeader(r.name === 'patient' ? 'patients' : r.name);
  const app = document.getElementById('app');
  const html = r.name === 'patient' ? viewPatient(r.id)
    : r.name === 'patients' ? viewPatients()
      : r.name === 'schedule' ? viewSchedule()
        : r.name === 'settings' ? viewSettings()
          : viewDashboard();
  app.innerHTML = html;
}

/* ---------------- Actions ---------------- */

function setStatus(p, status) {
  if (p.status === status) return;
  addLog(p.id, `ステータス：${p.status} → ${status}`);
  p.status = status;
  p.updatedAt = nowIso();
}

function setItem(p, itemId, value) {
  const prev = itemValue(p, itemId);
  if (prev === value) return;
  p.checklist[itemId] = { value, by: ui.currentUser, at: nowIso() };
  p.updatedAt = nowIso();
  addLog(p.id, `${shortLabel(ITEM_BY_ID[itemId])}：${prev} → ${value}`);
}

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'current-user') {
    ui.currentUser = el.value;
    localStorage.setItem(STORE_KEY + ':user', el.value);
    return;
  }
  if (el.id === 'place-filter') {
    ui.placeFilter = el.value;
    sessionStorage.setItem('placeFilter', el.value);
    render();
    return;
  }
  const a = el.dataset.action;
  if (!a) return;
  if (a === 'patient-status') {
    if (!requireUser()) { render(); return; }
    setStatus(patientById(el.dataset.id), el.value);
    save(); render(); toast('ステータスを更新しました');
  } else if (a === 'patient-memo') {
    const p = patientById(el.dataset.id);
    if (!requireUser()) { el.value = p.memo || ''; return; }
    if ((p.memo || '') !== el.value) { addLog(p.id, `メモ：「${el.value}」`); p.memo = el.value; save(); toast('メモを保存しました'); }
  } else if (a === 'patient-remarks') {
    const p = patientById(el.dataset.id);
    if (!requireUser()) { el.value = p.remarks || ''; return; }
    p.remarks = el.value; addLog(p.id, '備考・特記事項を更新'); save(); toast('備考を保存しました');
  } else if (a === 'item') {
    if (!requireUser()) { render(); return; }
    setItem(patientById(el.dataset.pid), el.dataset.item, el.value);
    save(); render();
  } else if (a === 'visit-done') {
    if (!requireUser()) { el.checked = !el.checked; return; }
    const v = state.visits.find(x => x.id === el.dataset.id);
    v.done = el.checked;
    addLog(v.patientId, `${fmtDate(v.date)} ${v.kind}：${v.done ? '実施済' : '未実施に戻す'}`);
    save(); render();
  } else if (a === 'import') {
    const file = el.files[0];
    if (!file) return;
    file.text().then(txt => {
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.patients) || !Array.isArray(data.visits)) throw new Error('形式が違います');
      if (!confirm('現在のデータを読み込んだデータで置き換えます。よろしいですか？')) return;
      state = { ...defaultState(), ...data };
      save(); render(); toast('読み込みました');
    }).catch(err => alert('読み込みに失敗しました：' + err.message));
  }
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'file' || el.type === 'text' || el.tagName === 'TEXTAREA') return;
  const a = el.dataset.action;
  if (a === 'schedule-tab') { ui.scheduleTab = el.dataset.tab; render(); }
  else if (a === 'month-prev' || a === 'month-next') {
    const [y, m] = ui.month.split('-').map(Number);
    const d = new Date(y, m - 1 + (a === 'month-next' ? 1 : -1), 1);
    ui.month = ymd(d).slice(0, 7); render();
  } else if (a === 'month-today') { ui.month = ymd(new Date()).slice(0, 7); render(); }
  else if (a === 'visit-delete') {
    const v = state.visits.find(x => x.id === el.dataset.id);
    if (!v || !confirm(`${fmtDate(v.date)} の予定を削除しますか？`)) return;
    state.visits = state.visits.filter(x => x.id !== v.id);
    addLog(v.patientId, `${fmtDate(v.date)} ${v.kind} の予定を削除`);
    save(); render();
  } else if (a === 'patient-delete') {
    const p = patientById(el.dataset.id);
    if (!confirm(`患者番号 ${p.number} と、その訪問予定を削除します。元に戻せません。よろしいですか？`)) return;
    state.patients = state.patients.filter(x => x.id !== p.id);
    state.visits = state.visits.filter(v => v.patientId !== p.id);
    save(); location.hash = '#/patients'; toast('削除しました');
  } else if (a === 'photo-done') {
    if (!requireUser()) return;
    setItem(patientById(el.dataset.pid), 'a11', '済');
    save(); render(); toast('写真撮影を「済」にしました');
  } else if (a === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `houmon-dashboard-${ymd(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  } else if (a === 'sample') {
    if (state.patients.length && !confirm('今のデータにサンプルデータを追加します。よろしいですか？')) return;
    addSampleData(); save(); toast('サンプルデータを追加しました'); location.hash = '#/';
    render();
  } else if (a === 'reset') {
    if (!confirm('このブラウザ内の全データを消去します。元に戻せません。よろしいですか？')) return;
    state = defaultState(); save(); render(); toast('消去しました');
  }
});

document.addEventListener('submit', e => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(form));
  if (kind === 'settings') {
    const lines = s => s.split('\n').map(x => x.trim()).filter(Boolean);
    state.settings.facilities = lines(fd.facilities).filter(x => x !== '居宅');
    state.settings.staff = lines(fd.staff);
    save(); render(); toast('設定を保存しました');
    return;
  }
  if (!requireUser()) return;
  if (kind === 'patient') {
    const number = fd.number.trim();
    if (state.patients.some(p => p.number === number)) { alert(`患者番号 ${number} はすでに登録されています`); return; }
    const p = { id: uid(), number, place: fd.place, status: fd.status, staff: fd.staff, memo: fd.memo, remarks: '', checklist: {}, createdAt: nowIso(), updatedAt: nowIso() };
    state.patients.push(p);
    addLog(p.id, `患者を登録（${p.place}／${p.status}）`);
    save(); render(); toast(`${number} を追加しました`);
  } else if (kind === 'patient-edit') {
    const p = patientById(form.dataset.id);
    const number = fd.number.trim();
    if (number !== p.number && state.patients.some(x => x.number === number)) { alert(`患者番号 ${number} はすでに登録されています`); return; }
    const changes = [];
    if (number !== p.number) changes.push(`番号 ${p.number}→${number}`);
    if (fd.place !== p.place) changes.push(`訪問先 ${p.place}→${fd.place}`);
    if ((fd.staff || '') !== (p.staff || '')) changes.push(`担当 ${p.staff || '—'}→${fd.staff || '—'}`);
    if ((fd.memo || '') !== (p.memo || '')) changes.push(`メモ「${fd.memo}」`);
    if (changes.length) addLog(p.id, '基本情報：' + changes.join('、'));
    Object.assign(p, { number, place: fd.place, staff: fd.staff, memo: fd.memo, updatedAt: nowIso() });
    setStatus(p, fd.status);
    save(); render(); toast('保存しました');
  } else if (kind === 'visit') {
    const p = patientById(fd.patientId);
    const v = { id: uid(), patientId: p.id, date: fd.date, time: fd.time, kind: fd.kind, staff: fd.staff, note: fd.note, done: false };
    state.visits.push(v);
    addLog(p.id, `${fmtDate(v.date)}${v.time ? ' ' + v.time : ''} ${v.kind} の予定を追加`);
    if (v.kind === '初診' && (p.status === '受付' || p.status === '初診日調整中')) setStatus(p, '初診日確定');
    save(); render(); toast('予定を追加しました');
  }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

/* ---------------- Sample data ---------------- */

function addSampleData() {
  const f = state.settings.facilities;
  const staff = state.settings.staff;
  const today = new Date();
  const d = n => ymd(addDays(today, n));
  const allDone = () => Object.fromEntries(ALL_ITEMS.map(i => [i.id, { value: OPTIONS[i.type][OPTIONS[i.type].length === 3 ? 1 : 2], by: staff[1] || '', at: nowIso() }]));
  const partial = (overrides) => {
    const c = allDone();
    Object.entries(overrides).forEach(([k, v]) => { c[k] = { value: v, by: staff[1] || '', at: nowIso() }; });
    return c;
  };
  const mk = (number, place, status, staffName, memo, checklist = {}) => {
    const p = { id: uid(), number, place, status, staff: staffName, memo, remarks: '', checklist, createdAt: nowIso(), updatedAt: nowIso() };
    state.patients.push(p);
    return p;
  };
  const visit = (p, offset, time, kind, staffName, note = '', done = false) => {
    state.visits.push({ id: uid(), patientId: p.id, date: d(offset), time, kind, staff: staffName, note, done });
  };
  const s1 = staff[1] || staff[0], s2 = staff[2] || staff[0];
  const p1 = mk('S-901', f[0] || '居宅', '初診済・医院処理中', s1, '同意書は家族が来週持参',
    partial({ b1: '後日返信待ち', b7: '後日返信待ち', c1: '未', c3: '未', c4: '未' }));
  const p2 = mk('S-902', f[0] || '居宅', '初診済・医院処理中', s1, '',
    partial({ a10: '未', a11: '未', c3: '未', c2: '未' }));
  const p3 = mk('S-903', f[1] || '居宅', '継続訪問', s2, '', allDone());
  const p4 = mk('S-904', f[1] || '居宅', '初診日確定', s2, '施設側の立会いあり');
  const p5 = mk('S-905', '居宅', '初診日調整中', s1, '家族と日程調整中');
  const p6 = mk('S-906', '居宅', '受付', '', 'ケアマネから依頼');
  const p7 = mk('S-907', f[2] || '居宅', '初診済・医院処理中', s2, '',
    partial({ b2: '後日返信待ち', b4: '後日返信待ち', c4: '未' }));
  visit(p1, -3, '10:00', '初診', s1, '', true);
  visit(p2, -1, '14:00', '初診', s1, '', true);
  visit(p3, 0, '10:30', '再診', s2, '義歯調整');
  visit(p1, 0, '13:30', '再診', s1);
  visit(p4, 1, '11:00', '初診', s2, '');
  visit(p7, 1, '15:00', '再診', s2);
  visit(p2, 4, '14:00', '再診', s1);
  visit(p3, 7, '10:30', '再診', s2);
  addLog(p1.id, 'サンプルデータとして登録');
  void p5; void p6;
}

render();
