'use strict';

/* =========================================================
 * 訪問歯科 進捗ダッシュボード（テスト版）
 * データはブラウザの localStorage に保存。
 * 本番（Xサーバー / PHP + MySQL）では Store 部分を API 呼び出しに差し替える想定。
 * 患者氏名・写真は保存しない（健診結果のお知らせ作成画面でのみ一時的に扱う）。
 * ========================================================= */

const STORE_KEY = 'houmon-dashboard-v1';

const STATUSES = ['受付', '初診日調整中', '初診日確定', '初診済・医院処理中', '継続訪問', '終了・中止'];
const VISIT_KINDS = ['初診', '再診', 'その他'];

const OPTIONS = {
  check: ['未', '済', '対象外'],
  doc: ['未', '後日返信待ち', '回収済', '対象外'],
  give: ['未', '渡した', '対象外'],
  copy: ['未', '写真・コピー取得済', '対象外'],
};
const DONE_VALUES = new Set(['済', '回収済', '対象外', '渡した', '写真・コピー取得済']);

const PHASES = [
  { id: 'pre', title: '初診前', place: '医院' },
  { id: 'day', title: '初診当日', place: '訪問先' },
  { id: 'post', title: '初診後', place: '医院' },
];

// 段階（左メニューの各項目）。start = このステータス以降で「やること」になる
const SECTIONS = [
  {
    id: 'p', phase: 'pre', menu: '受付・初診日調整', title: '新患受付・初診日調整', role: '受付・事務', start: '受付',
    items: [
      { id: 'p1', label: '依頼元・本人／家族の連絡先、生年月日・住所・訪問先を確認', type: 'check' },
      { id: 'p2', label: '通院困難な理由、主訴・緊急性、希望日時、診療対象者・同意者を確認', type: 'check' },
      { id: 'p3', label: '施設担当者・主治医・ケアマネジャー等の連絡先を確認', type: 'check' },
      { id: 'p4', label: '診療体制・訪問エリア・移動・当日の安全条件を確認し、担当者へ共有', type: 'check' },
      { id: 'p5', label: '医療保険の資格情報・負担割合・公費・医療証の有無を確認', type: 'check' },
      { id: 'p6', label: '介護保険証・負担割合証・要介護認定・担当ケアマネを確認（該当者）', type: 'check' },
      { id: 'p7', label: '問診票・既往歴・内服薬・アレルギー・感染症情報を回収／共有', type: 'check' },
    ],
  },
  {
    id: 'q', phase: 'pre', menu: '初診前の準備', title: '初診前の準備', role: 'コーディネーター・診療担当', start: '受付',
    items: [
      { id: 'q1', label: '予約登録・カルテ作成、必要な保険情報・連絡先を登録', type: 'check' },
      { id: 'q2', label: '医科情報・お薬手帳・紹介状等を確認し、必要に応じて照会', type: 'check' },
      { id: 'q3', label: '訪問予定表、初診書類、必要器材・検査機器、患者別追加物品を準備', type: 'check' },
      { id: 'q4', label: '施設／家族へ日時・診療場所・立会いの要否・支払等を最終連絡', type: 'check' },
    ],
  },
  {
    id: 'a', phase: 'day', menu: '診療・説明', title: '初診時に行うこと（診療・説明）', role: '歯科医師・歯科衛生士', start: '初診日確定',
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
    id: 'b', phase: 'day', menu: 'お渡しするもの', title: '初診時にお渡しするもの（書類・物品）', role: '助手・歯科衛生士', start: '初診日確定',
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
    id: 'c', phase: 'post', menu: '事務・連携対応', title: '事務・連携対応', role: '事務', start: '初診日確定',
    items: [
      { id: 'c1', label: 'マイナンバーカード／資格確認書・医療証の確認・登録', type: 'check', dependsOn: ['b8'] },
      { id: 'c2', label: '介護保険証・負担割合証の確認・登録', type: 'check', dependsOn: ['b9'] },
      { id: 'c3', label: 'ケアマネジャーへの情報共有（検診結果のお知らせ・写真の送付）', type: 'check', dependsOn: ['a9', 'a11', 'r1'] },
      { id: 'c4', label: '患者原簿の作製・加筆', type: 'check' },
    ],
  },
  {
    id: 'r', phase: 'post', menu: '健診結果のお知らせ作成', title: '歯科健診結果のお知らせ（写真）作成', role: '事務・歯科衛生士', start: '初診日確定', route: '#/notice',
    items: [
      { id: 'r1', label: '健診結果のお知らせ（写真）を作成し、PDF保存または印刷', type: 'check', locked: true, dependsOn: ['a11'] },
    ],
  },
];
const ALL_ITEMS = SECTIONS.flatMap(s => s.items.map(i => ({ ...i, sectionId: s.id })));
const ITEM_BY_ID = Object.fromEntries(ALL_ITEMS.map(i => [i.id, i]));
const SECTION_BY_ID = Object.fromEntries(SECTIONS.map(s => [s.id, s]));
const PHASE_BY_ID = Object.fromEntries(PHASES.map(p => [p.id, p]));

const ICONS = {
  dashboard: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  followup: '<path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4"/>',
  schedule: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  patients: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`; }

/* ---------------- Store ---------------- */

function defaultState() {
  return {
    version: 1,
    settings: {
      facilities: ['施設A', '施設B', '施設C', '施設D'],
      staff: ['院長', '歯科衛生士1', '歯科衛生士2', '事務'],
      clinic: { name: '', tel: '', visitTel: '', fax: '', mobile: '' },
    },
    patients: [],
    visits: [],
    log: [],
  };
}

function normalize(s) {
  const d = defaultState();
  return {
    ...d, ...s,
    settings: { ...d.settings, ...(s.settings || {}), clinic: { ...d.settings.clinic, ...((s.settings || {}).clinic || {}) } },
  };
}

let state = load();
const ui = {
  placeFilter: safeGet(sessionStorage, 'placeFilter') || '',
  scheduleTab: 'today',
  month: ymd(new Date()).slice(0, 7),
  currentUser: safeGet(localStorage, STORE_KEY + ':user') || '',
  showAddForm: false,
};

function safeGet(store, key) { try { return store.getItem(key); } catch (e) { return null; } }
function safeSet(store, key, v) { try { store.setItem(key, v); } catch (e) { /* ignore */ } }

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalize(JSON.parse(raw)) : defaultState();
  } catch (e) {
    console.error(e);
    return defaultState();
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { alert('保存に失敗しました：' + e.message); }
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function nowIso() { return new Date().toISOString(); }

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
function fmtDateJa(s) { const d = parseYmd(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }
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
function visiblePatients() { return state.patients.filter(matchesPlace); }
function itemValue(p, itemId) { return (p.checklist[itemId] && p.checklist[itemId].value) || '未'; }
function isDone(p, itemId) { return DONE_VALUES.has(itemValue(p, itemId)); }
function statusIdx(s) { return STATUSES.indexOf(s); }
function reached(p, section) { return p.status !== '終了・中止' && statusIdx(p.status) >= statusIdx(section.start); }
function sectionOpen(p, s) { return s.items.filter(i => !isDone(p, i.id)); }
function waitingDeps(p, item) { return (item.dependsOn || []).filter(d => !isDone(p, d)).map(d => ITEM_BY_ID[d]); }
function progress(p) {
  const done = ALL_ITEMS.filter(i => isDone(p, i.id)).length;
  return { done, total: ALL_ITEMS.length };
}
function statusClass(s) { return 'st-' + statusIdx(s); }
function placeClass(place) { return place === '訪問先' ? 'visit' : 'clinic'; }
function placeLabel(p) { return p ? p.place : '（削除済み）'; }
function patientLink(p) {
  if (!p) return '<span class="muted">（削除済み）</span>';
  return `<a href="#/patient/${p.id}" class="pno">${esc(p.number)}</a>`;
}
function shortLabel(i) {
  return i.label.replace(/^★\s*/, '★').replace(/（.*?）/g, '').replace(/^介護保険：/, '');
}
function badge(n, cls = '') { return n > 0 ? `<span class="badge ${cls}">${n}</span>` : ''; }
function sortPatients(list) {
  const order = places();
  return list.slice().sort((a, b) => (order.indexOf(a.place) - order.indexOf(b.place)) || a.number.localeCompare(b.number, 'ja', { numeric: true }));
}
function groupByPlace(list) {
  const groups = [];
  sortPatients(list).forEach(p => {
    let g = groups.find(x => x.place === p.place);
    if (!g) { g = { place: p.place, list: [] }; groups.push(g); }
    g.list.push(p);
  });
  return groups;
}
function statusSelect(p) {
  return `<select class="status-select ${statusClass(p.status)}" data-action="patient-status" data-id="${p.id}" aria-label="ステータス">${options(STATUSES, p.status)}</select>`;
}
function memoInput(p) {
  return `<input class="memo-input" type="text" maxlength="60" value="${esc(p.memo || '')}" data-action="patient-memo" data-id="${p.id}" placeholder="メモ（1行・氏名は書かない）">`;
}
function sectionHref(s) { return s.route || `#/stage/${s.id}`; }

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

/* ---------------- Sidebar / header ---------------- */

function stageCounts() {
  const pts = visiblePatients();
  const counts = {};
  SECTIONS.forEach(s => { counts[s.id] = pts.filter(p => reached(p, s) && sectionOpen(p, s).length).length; });
  return counts;
}

function renderSidebar(routeKey) {
  const counts = stageCounts();
  const link = (href, key, label, extra = '', ico = '') =>
    `<a class="nav-item${routeKey === key ? ' active' : ''}" href="${href}">${ico}<span class="nav-text">${label}</span>${extra}</a>`;

  document.getElementById('sidebar').innerHTML = `
    <a class="brand" href="#/" title="トップへ戻る">訪問歯科診療<br>新患・初診時チェックリスト</a>
    <nav class="nav">
      ${link('#/', 'dashboard', 'トップへ戻る', badge(dashboardPatients().length), icon('dashboard'))}
      ${link('#/schedule', 'schedule', '訪問予定', '', icon('schedule'))}
    </nav>
    <div class="nav-heading">やることリスト</div>
    ${PHASES.map(ph => `
      <div class="phase-block phase-${placeClass(ph.place)}">
        <div class="phase-title"><span class="place-tag ${placeClass(ph.place)}">${ph.place}</span><span class="phase-name">${ph.title}</span></div>
        ${SECTIONS.filter(s => s.phase === ph.id).map(s => link(sectionHref(s), 'stage-' + s.id, s.menu, badge(counts[s.id]))).join('')}
      </div>`).join('')}
    <nav class="nav">
      ${link('#/patients', 'patients', '患者一覧', '', icon('patients'))}
      ${link('#/settings', 'settings', '設定', '', icon('settings'))}
    </nav>
    <div class="sidebar-note">テスト版：データはこの端末のブラウザ内だけに保存されます。実在の患者情報・氏名は入力しないでください。</div>`;
}

function renderHeader(title) {
  document.getElementById('page-title').textContent = title;
  document.title = `${title}｜訪問歯科 進捗ダッシュボード`;
  document.getElementById('current-user').innerHTML = options(state.settings.staff, ui.currentUser, { blank: '選択' });
  document.getElementById('place-filter').innerHTML = options(places(), ui.placeFilter, { blank: 'すべて' });
}

function openMenu() { document.body.classList.add('menu-open'); }
function closeMenu() { document.body.classList.remove('menu-open'); }

/* ---------------- Checklist item row ---------------- */

function itemRow(p, i, { compact } = {}) {
  const entry = p.checklist[i.id];
  const v = itemValue(p, i.id);
  const done = DONE_VALUES.has(v);
  const waits = waitingDeps(p, i);
  let control;
  if (i.locked) {
    control = done
      ? `<span class="done-tag">作成済み</span>`
      : `<a class="btn small primary" href="#/notice/${p.id}">作成する</a>`;
  } else {
    control = `<select class="cl-select val-${OPTIONS[i.type].indexOf(v)}" data-action="item" data-pid="${p.id}" data-item="${i.id}" aria-label="${esc(i.label)}">${options(OPTIONS[i.type], v)}</select>`;
  }
  const meta = entry && entry.by ? `${esc(entry.by)} ${fmtDateTime(entry.at)}` : '';
  return `<div class="cl-item${i.sub ? ' sub' : ''}${done ? ' done' : ''}${compact ? ' compact' : ''}">
    <div class="cl-label">${esc(i.label)}
      ${waits.length && !done ? `<div class="wait-note">待ち：${waits.map(w => esc(shortLabel(w))).join('、')}</div>` : ''}
      ${compact && meta ? `<div class="cl-meta">${meta}</div>` : ''}
    </div>
    <div class="cl-control">${control}</div>
    ${compact ? '' : `<div class="cl-meta">${meta}</div>`}
  </div>`;
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
    if (i % 7 === 0 && d > last) break;
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
  const pts = sortPatients(state.patients.filter(p => p.status !== '終了・中止'));
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

/* ダッシュボードの表示ルール
 * - 初診前（資料A）：ステータスに関係なく、残りがあれば「初診前の確認 残りN項目」の1行、なければ「初診前：完了」
 * - 初診当日・初診後（資料B）：初診済以降の患者だけ。完了していない項目を並べ、全部終わっていれば「○○：完了」
 * - 初診前の患者には、資料Bの代わりに初診予定日を1行で出す */
function afterFirstVisit(p) { return statusIdx(p.status) >= statusIdx('初診済・医院処理中'); }
function phaseOpenCount(p, phaseId) {
  return SECTIONS.filter(s => s.phase === phaseId).reduce((n, s) => n + sectionOpen(p, s).length, 0);
}
function dashboardOpenCount(p) {
  if (p.status === '終了・中止') return 0;
  return phaseOpenCount(p, 'pre') + (afterFirstVisit(p) ? phaseOpenCount(p, 'day') + phaseOpenCount(p, 'post') : 0);
}
function dashboardPatients() { return visiblePatients().filter(p => dashboardOpenCount(p) > 0); }

function dashCard(p) {
  const rows = [];
  const doneLine = ph => `<div class="pcard-line done"><span class="dot ${placeClass(ph.place)}"></span>${ph.title}：完了</div>`;
  PHASES.forEach(ph => {
    const groups = SECTIONS.filter(s => s.phase === ph.id).map(s => ({ s, items: sectionOpen(p, s) }));
    const openCount = groups.reduce((n, g) => n + g.items.length, 0);
    if (ph.id === 'pre') {
      const first = groups.find(g => g.items.length);
      rows.push(openCount
        ? `<a class="pcard-line" href="${sectionHref(first.s)}"><span class="dot ${placeClass(ph.place)}"></span>${ph.title}の確認<span class="line-count">残り${openCount}項目</span><span class="chev">›</span></a>`
        : doneLine(ph));
      return;
    }
    if (!afterFirstVisit(p)) {
      if (ph.id === 'day') {
        const fv = state.visits.filter(v => v.patientId === p.id && v.kind === '初診').sort((a, b) => a.date.localeCompare(b.date))[0];
        rows.push(`<div class="pcard-line upcoming"><span class="dot visit"></span>初診日<span class="line-count">${fv ? `${fmtDate(fv.date)}${fv.time ? ' ' + esc(fv.time) : ''} 予定` : '未定'}</span></div>`);
      }
      return;
    }
    if (!openCount) { rows.push(doneLine(ph)); return; }
    groups.filter(g => g.items.length).forEach(({ s, items }) => {
      rows.push(`<div class="pcard-group">
        <a class="pcard-sec" href="${sectionHref(s)}"><span class="dot ${placeClass(ph.place)}"></span>${ph.title}｜${esc(s.menu)}</a>
        <ul class="todo">${items.map(i => {
          const v = itemValue(p, i.id);
          const wait = waitingDeps(p, i).length;
          return `<li${v === '後日返信待ち' ? ' class="pending"' : ''}>${esc(shortLabel(i))}${v === '後日返信待ち' ? '<em class="tag-pending">返信待ち</em>' : ''}${wait ? '<em class="tag-wait">待ち</em>' : ''}</li>`;
        }).join('')}</ul>
      </div>`);
    });
  });
  return `<article class="card pcard">
    <header class="pcard-head">
      ${patientLink(p)}
      ${badge(dashboardOpenCount(p))}
      <span class="spacer"></span>
      ${statusSelect(p)}
    </header>
    ${rows.join('')}
    <footer class="pcard-foot">${memoInput(p)}</footer>
  </article>`;
}

function viewDashboard() {
  const pts = dashboardPatients();
  const t = ymd(new Date());
  const tm = ymd(addDays(new Date(), 1));
  const waitingDocs = visiblePatients().reduce((n, p) => n + ALL_ITEMS.filter(i => itemValue(p, i.id) === '後日返信待ち').length, 0);
  const groups = groupByPlace(pts);
  const noPatients = !state.patients.length;
  return `
  <div class="dash-top">
    <div class="summary">
      <span>今日の訪問 <strong>${visitsBetween(t, t).length}</strong>件</span>
      <span>明日の訪問 <strong>${visitsBetween(tm, tm).length}</strong>件</span>
      <span>後日返信待ちの書類 <strong>${waitingDocs}</strong>件</span>
    </div>
    <button class="btn primary" data-action="toggle-add">${ui.showAddForm ? '閉じる' : '＋ 新患を追加する'}</button>
  </div>

  ${ui.showAddForm ? `<section class="card panel add-panel">
    <div class="panel-head"><h2>新患を追加する</h2><span class="muted">氏名は入力しません。患者番号と氏名の対応は院内で管理してください。</span></div>
    ${patientForm()}
  </section>` : ''}

  ${noPatients && !ui.showAddForm ? `<section class="card welcome">
    <h2 class="card-band">まずは新患を登録しましょう</h2>
    <div class="card-body">
      <p>右上の「＋ 新患を追加する」から、患者番号と訪問先を入れると、その患者のやることリストが作られます。</p>
      <p class="muted">画面の雰囲気を先に見たい場合は、サンプルデータを入れることもできます（あとで「設定」から消去できます）。</p>
      <div class="btn-row">
        <button class="btn primary" data-action="toggle-add">＋ 新患を追加する</button>
        <button class="btn" data-action="sample">サンプルデータを入れる</button>
      </div>
    </div>
  </section>` : ''}

  <section class="block">
    <div class="block-head"><h2>未完了項目一覧</h2>${badge(pts.length)}<span class="muted">終わっていない項目がある患者</span></div>
    ${groups.length ? groups.map(g => `
      <div class="place-group">
        <h3 class="place-title">${esc(g.place)}<span class="muted">${g.list.length}人</span></h3>
        <div class="card-grid">${g.list.map(dashCard).join('')}</div>
      </div>`).join('') : `<div class="card empty-card">${noPatients ? '患者が登録されていません' : '未完了の項目はありません'}</div>`}
  </section>

  <section class="card panel">
    <div class="panel-head"><h2>訪問予定</h2><a class="btn small" href="#/schedule">予定を追加</a></div>
    ${schedulePanel()}
  </section>`;
}

function viewStage(sectionId) {
  const s = SECTION_BY_ID[sectionId];
  if (!s) return viewNotFound();
  const ph = PHASE_BY_ID[s.phase];
  const pts = visiblePatients().filter(p => reached(p, s));
  const open = pts.filter(p => sectionOpen(p, s).length);
  const done = pts.filter(p => !sectionOpen(p, s).length);
  const card = p => {
    const n = sectionOpen(p, s).length;
    return `<article class="card pcard">
      <header class="pcard-head">${patientLink(p)}${badge(n)}<span class="spacer"></span>${statusSelect(p)}</header>
      <div class="pcard-items">${s.items.map(i => itemRow(p, i, { compact: true })).join('')}</div>
      <footer class="pcard-foot">${memoInput(p)}</footer>
    </article>`;
  };
  const notStarted = visiblePatients().filter(p => p.status !== '終了・中止' && !reached(p, s)).length;
  return `
  <section class="card stage-head phase-${placeClass(ph.place)}">
    <div class="stage-title card-band">
      <span class="place-tag ${placeClass(ph.place)}">${ph.title}｜${ph.place}</span>
      <h2>${esc(s.title)}</h2>
    </div>
    <div class="card-body">
      <div class="muted small">担当：${esc(s.role)}　／　対象：ステータスが「${esc(s.start)}」以降の患者${notStarted ? `（まだこの段階に来ていない患者 ${notStarted}人）` : ''}</div>
      ${s.id === 'r' ? '<div class="note-box">お知らせの内容（氏名・写真）は保存されません。作成したら必ずPDFに保存するか印刷してください。</div>' : ''}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>まだ終わっていない人</h2>${badge(open.length)}</div>
    ${open.length ? groupByPlace(open).map(g => `
      <div class="place-group">
        <h3 class="place-title">${esc(g.place)}<span class="muted">${g.list.length}人</span></h3>
        <div class="card-grid wide-cards">${g.list.map(card).join('')}</div>
      </div>`).join('') : '<div class="card empty-card">この段階でやり残しのある患者はいません</div>'}
  </section>

  <details class="card done-list">
    <summary>この段階が完了した人（${done.length}人）</summary>
    ${done.length ? groupByPlace(done).map(g => `<div class="done-row"><span class="muted">${esc(g.place)}</span>${g.list.map(p => patientLink(p)).join('')}</div>`).join('') : '<p class="empty">まだいません</p>'}
  </details>`;
}

function viewFollowup() {
  const t = ymd(new Date());
  const pts = visiblePatients().filter(p => p.status === '継続訪問');
  const next = p => state.visits.filter(v => v.patientId === p.id && v.date >= t && !v.done).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const last = p => state.visits.filter(v => v.patientId === p.id && (v.done || v.date < t)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  return `
  <section class="block">
    <div class="block-head"><h2>継続訪問中の患者</h2><span class="muted">${pts.length}人</span></div>
    ${pts.length ? groupByPlace(pts).map(g => `
      <div class="place-group">
        <h3 class="place-title">${esc(g.place)}<span class="muted">${g.list.length}人</span></h3>
        <div class="card-grid">${g.list.map(p => {
          const n = next(p), l = last(p);
          return `<article class="card pcard">
            <header class="pcard-head">${patientLink(p)}<span class="spacer"></span>${statusSelect(p)}</header>
            <dl class="kv">
              <dt>次回</dt><dd>${n ? `${fmtDate(n.date)} ${esc(n.time || '')} ${esc(n.staff || '')}` : '<span class="warn-text">未定</span>'}</dd>
              <dt>前回</dt><dd>${l ? `${fmtDate(l.date)} ${esc(l.kind)}` : '—'}</dd>
              <dt>担当</dt><dd>${esc(p.staff || '—')}</dd>
            </dl>
            <footer class="pcard-foot">${memoInput(p)}</footer>
          </article>`;
        }).join('')}</div>
      </div>`).join('') : '<div class="card empty-card">継続訪問中の患者はいません</div>'}
  </section>`;
}

function patientForm() {
  return `<form class="form-grid" data-form="patient">
      <label>患者番号<input type="text" name="number" required maxlength="20" placeholder="例：A-001" autocomplete="off"></label>
      <label>訪問先<select name="place" required>${options(places(), ui.placeFilter || '', { blank: '選択' })}</select></label>
      <label>ステータス<select name="status">${options(STATUSES, '受付')}</select></label>
      <label>担当<select name="staff">${options(state.settings.staff, '', { blank: '—' })}</select></label>
      <label class="wide">メモ（1行・氏名は書かない）<input type="text" name="memo" maxlength="60"></label>
      <div class="form-actions"><button class="btn primary" type="submit">追加</button></div>
    </form>`;
}

function viewPatients() {
  const pts = sortPatients(visiblePatients());
  return `
  <section class="card panel">
    <div class="panel-head"><h2>患者を追加</h2><span class="muted">氏名は入力しません。患者番号と氏名の対応は院内で管理してください。</span></div>
    ${patientForm()}
  </section>
  <section class="card panel">
    <div class="panel-head"><h2>患者一覧</h2><span class="muted">${pts.length}人</span></div>
    ${pts.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>訪問先</th><th>患者番号</th><th>ステータス</th><th>チェック進捗</th><th>担当</th><th>メモ</th></tr></thead>
      <tbody>${pts.map(p => {
        const pr = progress(p);
        return `<tr>
          <td>${esc(p.place)}</td><td>${patientLink(p)}</td>
          <td>${statusSelect(p)}</td>
          <td class="nowrap"><div class="bar"><div style="width:${Math.round(pr.done / pr.total * 100)}%"></div></div><span class="muted small">${pr.done}/${pr.total}</span></td>
          <td>${esc(p.staff || '')}</td>
          <td>${memoInput(p)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="empty">患者が登録されていません</p>'}
  </section>`;
}

function viewPatient(id) {
  const p = patientById(id);
  if (!p) return viewNotFound();
  const pr = progress(p);
  const visits = state.visits.filter(v => v.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const logs = state.log.filter(l => l.pid === p.id).slice(0, 30);

  const phases = PHASES.map(ph => `
    <div class="cl-phase phase-${placeClass(ph.place)}">
      <div class="cl-phase-title">${ph.title}<span class="place-tag ${placeClass(ph.place)}">${ph.place}</span></div>
      ${SECTIONS.filter(s => s.phase === ph.id).map(s => `
        <div class="cl-section">
          <div class="cl-head"><h3>${esc(s.title)}</h3><span class="muted small">${esc(s.role)}</span>${reached(p, s) ? badge(sectionOpen(p, s).length) : '<span class="muted small">（まだこの段階ではありません）</span>'}</div>
          ${s.items.map(i => itemRow(p, i)).join('')}
        </div>`).join('')}
    </div>`).join('');

  return `
  <div class="crumb"><a href="#/patients">← 患者一覧</a></div>
  <section class="card panel">
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

  <section class="card panel">
    <div class="panel-head"><h2>チェックリスト</h2><span class="muted">プルダウンを変えると、入力者と日時が自動で記録されます</span></div>
    ${phases}
    <div class="cl-section">
      <div class="cl-head"><h3>備考・特記事項</h3></div>
      <textarea class="remarks" rows="3" maxlength="400" data-action="patient-remarks" data-id="${p.id}" placeholder="氏名・住所などの個人情報は書かないでください">${esc(p.remarks || '')}</textarea>
    </div>
  </section>

  <section class="card panel">
    <div class="panel-head"><h2>訪問予定・履歴</h2></div>
    ${visitForm(p.id)}
    ${visitTable(visits, { showDate: true })}
  </section>

  <section class="card panel">
    <div class="panel-head"><h2>変更履歴</h2><span class="muted">直近30件</span></div>
    ${logs.length ? `<ul class="log">${logs.map(l => `<li><span class="muted small">${fmtDateTime(l.at)}</span> <strong>${esc(l.by)}</strong> ${esc(l.text)}</li>`).join('')}</ul>` : '<p class="empty">履歴はまだありません</p>'}
  </section>`;
}

function viewSchedule() {
  return `
  <section class="card panel">
    <div class="panel-head"><h2>訪問予定を追加</h2><span class="muted">「初診」の予定を入れると初診日確定に、初診を「実施済」にすると初診済・医院処理中に自動で変わります</span></div>
    ${state.patients.length ? visitForm('') : '<p class="empty">先に<a href="#/patients">患者一覧</a>から患者を登録してください</p>'}
  </section>
  <section class="card panel">
    <div class="panel-head"><h2>訪問予定</h2></div>
    ${schedulePanel()}
  </section>`;
}

function viewSettings() {
  const c = state.settings.clinic;
  return `
  <section class="card panel">
    <div class="panel-head"><h2>施設・スタッフ</h2><span class="muted">1行に1つずつ入力</span></div>
    <form class="settings-grid" data-form="settings">
      <label>施設名<textarea name="facilities" rows="6">${esc(state.settings.facilities.join('\n'))}</textarea>
        <span class="muted small">「居宅」は自動で追加されます</span></label>
      <label>スタッフ（入力者・担当者）<textarea name="staff" rows="6">${esc(state.settings.staff.join('\n'))}</textarea></label>
      <div class="form-actions"><button class="btn primary" type="submit">保存</button></div>
    </form>
  </section>
  <section class="card panel">
    <div class="panel-head"><h2>医院の連絡先</h2><span class="muted">健診結果のお知らせの下部に印字されます</span></div>
    <form class="form-grid" data-form="clinic">
      <label class="wide">医院名<input type="text" name="name" value="${esc(c.name)}" maxlength="40"></label>
      <label>電話<input type="text" name="tel" value="${esc(c.tel)}" maxlength="20" inputmode="tel"></label>
      <label>訪問用電話<input type="text" name="visitTel" value="${esc(c.visitTel)}" maxlength="20" inputmode="tel"></label>
      <label>FAX<input type="text" name="fax" value="${esc(c.fax)}" maxlength="20" inputmode="tel"></label>
      <label>訪問用携帯<input type="text" name="mobile" value="${esc(c.mobile)}" maxlength="20" inputmode="tel"></label>
      <div class="form-actions"><button class="btn primary" type="submit">保存</button></div>
    </form>
  </section>
  <section class="card panel">
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

function viewNotFound() {
  return '<section class="card panel"><p>ページが見つかりません。</p><a href="#/">ダッシュボードへ</a></section>';
}

/* ---------------- 健診結果のお知らせ（保存しない） ---------------- */

let notice = null;

const NOTICE_OPTS = {
  perio: ['歯石の除去', '歯磨き指導', '定期的な口腔ケア'],
  jaw: ['上', '下'],
  denture: ['作製', '修理', '調整'],
  func: ['嚥下訓練', '言語訓練'],
  meds: ['抗生物質', '鎮痛薬', 'うがい薬', '軟膏'],
};
const OPT_TO_CHECK = { perio: 'perio', jaw: 'denture', denture: 'denture', func: 'func', meds: 'meds' };

function newNotice(p) {
  const first = state.visits.filter(v => v.patientId === p.id && v.kind === '初診').sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    pid: p.id, dirty: false,
    name: '', place: p.place === '居宅' ? '' : p.place,
    firstDate: first ? fmtDateJa(first.date) : '',
    face: null, photos: [null, null, null, null, null, null],
    checks: {}, opts: {}, cavities: '', memo: '',
  };
}

function discardNotice() {
  if (!notice) return;
  [notice.face, ...notice.photos].forEach(u => { if (u) URL.revokeObjectURL(u); });
  notice = null;
}

function viewNotice(pid) {
  const p = patientById(pid);
  if (!p) return viewNotFound();
  if (!notice || notice.pid !== pid) { discardNotice(); notice = newNotice(p); }
  const n = notice;
  const c = state.settings.clinic;
  const opt = (g, v) => `<span class="opt${(n.opts[g] || []).includes(v) ? ' on' : ''}" data-opt="${g}" data-val="${esc(v)}" role="button" tabindex="0">${esc(v)}</span>`;
  const opts = g => NOTICE_OPTS[g].map(v => opt(g, v)).join('・');
  const chk = k => `<input type="checkbox" class="nchk" data-chk="${k}"${n.checks[k] ? ' checked' : ''}>`;
  const slot = (key, label) => {
    const url = key === 'face' ? n.face : n.photos[key];
    return `<label class="slot${key === 'face' ? ' face' : ''}">
      <input type="file" accept="image/*" hidden data-nphoto="${key}">
      ${url ? `<img src="${url}" alt="">` : `<span class="slot-ph">${label}<small class="no-print">クリックして選択</small></span>`}
      ${url ? `<button type="button" class="slot-del no-print" data-action="notice-del" data-slot="${key}" aria-label="写真を外す">×</button>` : ''}
    </label>`;
  };
  const line1 = [c.name, c.tel].filter(Boolean).join('　');
  const line2 = [c.visitTel && `訪問用電話：${c.visitTel}`, c.fax && `FAX：${c.fax}`, c.mobile && `訪問用携帯：${c.mobile}`].filter(Boolean).join('　');
  const done = isDone(p, 'r1');

  return `
  <div class="notice-warn no-print">
    <strong>この画面の内容は保存されません。</strong>
    入力した氏名や写真は、画面を閉じたり移動したりすると消えます。必ず「PDF保存・印刷」からPDFに保存するか印刷してください。
    印刷画面を閉じたあとの確認で「OK」を押すと「お知らせ作成済み」になり、次の段階（ケアマネへの情報共有）に進めます。
  </div>
  <div class="notice-toolbar no-print">
    <a href="#/notice">← 一覧へ</a>
    <span class="muted">患者番号 <strong>${esc(p.number)}</strong>${done ? '（作成済み）' : ''}</span>
    <span class="spacer"></span>
    <label class="btn">口腔内写真をまとめて選択<input type="file" accept="image/*" multiple hidden data-nphoto="multi"></label>
    <button class="btn primary" data-action="notice-print">PDF保存・印刷</button>
  </div>
  <div class="sheet-wrap">
    <div class="sheet">
      <h1 class="sheet-title">歯科健診結果のお知らせ（写真）</h1>
      <div class="sheet-head">
        <div class="sheet-info">
          <div class="srow"><span class="sl">患者番号</span><span class="sv">${esc(p.number)}</span>
            <span class="sl">患者氏名</span><input class="line-input" data-nfield="name" value="${esc(n.name)}" placeholder="氏名（保存されません）" autocomplete="off"></div>
          <div class="srow"><span class="sl">入居施設</span><input class="line-input" data-nfield="place" value="${esc(n.place)}" placeholder="施設名"></div>
          <div class="srow"><span class="sl">初診日</span><input class="line-input" data-nfield="firstDate" value="${esc(n.firstDate)}" placeholder="例：2026年11月10日"></div>
        </div>
        ${slot('face', '患者顔写真')}
      </div>
      <div class="photo-grid">${[0, 1, 2, 3, 4, 5].map(i => slot(i, '口腔内写真')).join('')}</div>
      <div class="sheet-box">
        <div class="box-title">歯の状態と治療</div>
        <div class="nline">${chk('caries')}<span>虫歯が<input class="num-input" data-nfield="cavities" value="${esc(n.cavities)}" inputmode="numeric" maxlength="2">本あるので治療が必要です。</span></div>
        <div class="nline">${chk('extract')}<span>抜歯をする必要があります。<br><span class="indent">※主治医の先生と相談の結果、抜歯できないこともあります。</span></span></div>
        <div class="nline">${chk('perio')}<span>歯周病になっています。<br><span class="indent">（${opts('perio')}）が必要です。</span></span></div>
        <div class="nline">${chk('denture')}<span>入れ歯（${opts('jaw')}）の（${opts('denture')}）が必要です。</span></div>
        <div class="nline">${chk('func')}<span>お口の機能低下がみられるため（${opts('func')}）が必要です。</span></div>
        <div class="nline">${chk('meds')}<span>お薬の処方を行います。（${opts('meds')}）</span></div>
      </div>
      <textarea class="memo-box" data-nfield="memo" placeholder="訪問先での手書きメモ欄（空欄のまま印刷すると手書きできます）">${esc(n.memo)}</textarea>
      <footer class="sheet-foot">
        ${line1 || line2 ? `<div>${esc(line1)}</div><div>${esc(line2)}</div>` : '<div class="no-print warn-text">医院の連絡先が未設定です（設定画面で入力できます）</div>'}
      </footer>
    </div>
  </div>`;
}

function setNoticePhoto(key, file) {
  if (!file || !notice) return;
  const url = URL.createObjectURL(file);
  if (key === 'face') {
    if (notice.face) URL.revokeObjectURL(notice.face);
    notice.face = url;
  } else {
    const i = Number(key);
    if (notice.photos[i]) URL.revokeObjectURL(notice.photos[i]);
    notice.photos[i] = url;
  }
  notice.dirty = true;
}

function printNotice() {
  if (!requireUser()) return;
  const p = patientById(notice.pid);
  window.print();
  setTimeout(() => {
    if (!notice) return;
    if (isDone(p, 'r1')) { toast('印刷画面を閉じました'); notice.dirty = false; return; }
    if (confirm('PDFに保存、または印刷できましたか？\n\n「OK」で「お知らせ作成済み」にします。\n※入力内容は保存されないため、OKを押すと画面を閉じても大丈夫な状態になります。')) {
      setItem(p, 'r1', '済');
      save();
      notice.dirty = false;
      toast('「お知らせ作成済み」にしました');
      render();
    }
  }, 300);
}

/* ---------------- Router ---------------- */

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'patient' && b) return { name: 'patient', id: b, nav: 'patients', title: '患者詳細' };
  if (a === 'stage' && b && SECTION_BY_ID[b]) {
    const s = SECTION_BY_ID[b];
    return { name: 'stage', id: b, nav: 'stage-' + b, title: `${PHASE_BY_ID[s.phase].title}｜${s.menu}` };
  }
  if (a === 'notice' && b) return { name: 'notice-edit', id: b, nav: 'stage-r', title: '健診結果のお知らせ作成' };
  if (a === 'notice') return { name: 'stage', id: 'r', nav: 'stage-r', title: '初診後｜健診結果のお知らせ作成' };
  if (a === 'followup') return { name: 'followup', nav: 'followup', title: '継続訪問' };
  if (a === 'patients') return { name: 'patients', nav: 'patients', title: '患者一覧' };
  if (a === 'schedule') return { name: 'schedule', nav: 'schedule', title: '訪問予定' };
  if (a === 'settings') return { name: 'settings', nav: 'settings', title: '設定' };
  return { name: 'dashboard', nav: 'dashboard', title: 'ダッシュボード' };
}

function render() {
  const r = currentRoute();
  renderSidebar(r.nav);
  renderHeader(r.title);
  const views = {
    dashboard: () => viewDashboard(),
    stage: () => viewStage(r.id),
    'notice-edit': () => viewNotice(r.id),
    followup: () => viewFollowup(),
    patients: () => viewPatients(),
    patient: () => viewPatient(r.id),
    schedule: () => viewSchedule(),
    settings: () => viewSettings(),
  };
  document.getElementById('app').innerHTML = views[r.name]();
  document.body.classList.toggle('notice-mode', r.name === 'notice-edit');
}

let lastHash = location.hash;
let suppressHash = false;
window.addEventListener('hashchange', () => {
  if (suppressHash) { suppressHash = false; return; }
  const r = currentRoute();
  const stayingOnNotice = notice && r.name === 'notice-edit' && r.id === notice.pid;
  if (notice && !stayingOnNotice) {
    if (notice.dirty && !confirm('健診結果のお知らせは、まだPDF保存・印刷が確認できていません。\n入力した内容（氏名・写真など）は消えます。移動しますか？')) {
      suppressHash = true;
      location.hash = lastHash;
      return;
    }
    discardNotice();
  }
  lastHash = location.hash;
  closeMenu();
  render();
  window.scrollTo(0, 0);
});

window.addEventListener('beforeunload', e => {
  if (notice && notice.dirty) { e.preventDefault(); e.returnValue = ''; }
});

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

document.getElementById('menu-btn').addEventListener('click', () => {
  document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
});
document.getElementById('backdrop').addEventListener('click', closeMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.nfield && notice) {
    notice[el.dataset.nfield] = el.value;
    notice.dirty = true;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'current-user') {
    ui.currentUser = el.value;
    safeSet(localStorage, STORE_KEY + ':user', el.value);
    return;
  }
  if (el.id === 'place-filter') {
    ui.placeFilter = el.value;
    safeSet(sessionStorage, 'placeFilter', el.value);
    render();
    return;
  }
  if (el.dataset.nphoto && notice) {
    const files = [...el.files];
    if (el.dataset.nphoto === 'multi') {
      let slot = 0;
      files.forEach(f => {
        while (slot < 6 && notice.photos[slot]) slot++;
        if (slot < 6) setNoticePhoto(String(slot), f);
      });
      if (files.length && notice.photos.every(Boolean) && files.length > 6) toast('口腔内写真は6枚までです');
    } else {
      setNoticePhoto(el.dataset.nphoto, files[0]);
    }
    render();
    return;
  }
  if (el.classList.contains('nchk') && notice) {
    notice.checks[el.dataset.chk] = el.checked;
    notice.dirty = true;
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
    const p = patientById(v.patientId);
    addLog(v.patientId, `${fmtDate(v.date)} ${v.kind}：${v.done ? '実施済' : '未実施に戻す'}`);
    if (v.done && v.kind === '初診' && p && statusIdx(p.status) < statusIdx('初診済・医院処理中')) setStatus(p, '初診済・医院処理中');
    save(); render();
  } else if (a === 'import') {
    const file = el.files[0];
    if (!file) return;
    file.text().then(txt => {
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.patients) || !Array.isArray(data.visits)) throw new Error('形式が違います');
      if (!confirm('現在のデータを読み込んだデータで置き換えます。よろしいですか？')) return;
      state = normalize(data);
      save(); render(); toast('読み込みました');
    }).catch(err => alert('読み込みに失敗しました：' + err.message));
  }
});

function toggleOpt(el) {
  const g = el.dataset.opt, v = el.dataset.val;
  const list = notice.opts[g] || (notice.opts[g] = []);
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1); else list.push(v);
  el.classList.toggle('on', i < 0);
  if (i < 0) {
    const key = OPT_TO_CHECK[g];
    notice.checks[key] = true;
    const cb = document.querySelector(`.nchk[data-chk="${key}"]`);
    if (cb) cb.checked = true;
  }
  notice.dirty = true;
}

document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.opt && notice) {
    e.preventDefault();
    toggleOpt(e.target);
  }
});

document.addEventListener('click', e => {
  const opt = e.target.closest('[data-opt]');
  if (opt && notice) { toggleOpt(opt); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'file' || el.type === 'text' || el.tagName === 'TEXTAREA') return;
  const a = el.dataset.action;
  if (a === 'toggle-add') {
    ui.showAddForm = !ui.showAddForm; render();
    if (ui.showAddForm) { const f = document.querySelector('form[data-form="patient"] input[name="number"]'); if (f) f.focus(); }
  }
  else if (a === 'schedule-tab') { ui.scheduleTab = el.dataset.tab; render(); }
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
  } else if (a === 'notice-del') {
    e.preventDefault();
    const k = el.dataset.slot;
    if (k === 'face') { URL.revokeObjectURL(notice.face); notice.face = null; }
    else { URL.revokeObjectURL(notice.photos[k]); notice.photos[k] = null; }
    render();
  } else if (a === 'notice-print') {
    printNotice();
  } else if (a === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `houmon-dashboard-${ymd(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  } else if (a === 'sample') {
    if (state.patients.length && !confirm('今のデータにサンプルデータを追加します。よろしいですか？')) return;
    addSampleData(); save(); toast('サンプルデータを追加しました');
    if (location.hash === '#/' || location.hash === '') render(); else location.hash = '#/';
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
  if (kind === 'clinic') {
    state.settings.clinic = { name: fd.name.trim(), tel: fd.tel.trim(), visitTel: fd.visitTel.trim(), fax: fd.fax.trim(), mobile: fd.mobile.trim() };
    save(); render(); toast('連絡先を保存しました');
    return;
  }
  if (!requireUser()) return;
  if (kind === 'patient') {
    const number = fd.number.trim();
    if (state.patients.some(p => p.number === number)) { alert(`患者番号 ${number} はすでに登録されています`); return; }
    const p = { id: uid(), number, place: fd.place, status: fd.status, staff: fd.staff, memo: fd.memo, remarks: '', checklist: {}, createdAt: nowIso(), updatedAt: nowIso() };
    state.patients.push(p);
    addLog(p.id, `患者を登録（${p.place}／${p.status}）`);
    ui.showAddForm = false;
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

/* ---------------- Sample data ---------------- */

function addSampleData() {
  const f = state.settings.facilities;
  const staff = state.settings.staff;
  const s1 = staff[1] || staff[0] || '', s2 = staff[2] || staff[0] || '';
  const today = new Date();
  const d = n => ymd(addDays(today, n));
  const doneValue = i => (i.type === 'doc' ? '回収済' : OPTIONS[i.type][1]);
  const checklist = (sectionIds, overrides = {}) => {
    const c = {};
    ALL_ITEMS.filter(i => sectionIds.includes(i.sectionId)).forEach(i => { c[i.id] = { value: doneValue(i), by: s1, at: nowIso() }; });
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === '未') delete c[k]; else c[k] = { value: v, by: s1, at: nowIso() };
    });
    return c;
  };
  const mk = (number, place, status, staffName, memo, cl = {}) => {
    const p = { id: uid(), number, place, status, staff: staffName, memo, remarks: '', checklist: cl, createdAt: nowIso(), updatedAt: nowIso() };
    state.patients.push(p);
    return p;
  };
  const visit = (p, offset, time, kind, staffName, note = '', done = false) => {
    state.visits.push({ id: uid(), patientId: p.id, date: d(offset), time, kind, staff: staffName, note, done });
  };
  const fa = f[0] || '居宅', fb = f[1] || '居宅', fc = f[2] || '居宅';
  const p1 = mk('S-901', fa, '初診済・医院処理中', s1, '同意書は家族が来週持参',
    checklist(['p', 'q', 'a', 'b'], { b1: '後日返信待ち', b7: '後日返信待ち' }));
  const p2 = mk('S-902', fa, '初診済・医院処理中', s1, '',
    checklist(['p', 'q', 'a', 'b', 'c'], { a10: '未', a11: '未', c2: '未', c3: '未', c4: '未' }));
  const p3 = mk('S-903', fb, '継続訪問', s2, '', checklist(['p', 'q', 'a', 'b', 'c', 'r']));
  const p4 = mk('S-904', fb, '初診日確定', s2, '施設側の立会いあり', checklist(['p'], { q1: '済', q2: '済' }));
  const p5 = mk('S-905', '居宅', '初診日調整中', s1, '家族と日程調整中', checklist([], { p1: '済', p2: '済' }));
  mk('S-906', '居宅', '受付', '', 'ケアマネから依頼');
  const p7 = mk('S-907', fc, '初診済・医院処理中', s2, '',
    checklist(['p', 'q', 'a', 'b', 'c', 'r'], { b2: '後日返信待ち', b4: '後日返信待ち', c4: '未' }));
  visit(p1, -3, '10:00', '初診', s1, '', true);
  visit(p2, -1, '14:00', '初診', s1, '', true);
  visit(p7, -6, '15:00', '初診', s2, '', true);
  visit(p3, 0, '10:30', '再診', s2, '義歯調整');
  visit(p1, 0, '13:30', '再診', s1);
  visit(p4, 1, '11:00', '初診', s2, '');
  visit(p7, 1, '15:00', '再診', s2);
  visit(p2, 4, '14:00', '再診', s1);
  visit(p3, 7, '10:30', '再診', s2);
  void p5;
  addLog(p1.id, 'サンプルデータとして登録');
}

render();
