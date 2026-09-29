// Kalendarz opon — logika aplikacji
'use strict';

/* ================= Ustawienia warsztatu ================= */
const HOURS_WEEKDAY = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];  // 8:00–18:00, okienka po 60 min
const HOURS_SATURDAY = [8, 9, 10, 11, 12, 13];                 // 8:00–14:00
const SERVICES = { kola: 'Wymiana kół', opony: 'Wymiana opon', naprawa: 'Naprawa' };
const STATUSES = { planned: 'Zaplanowana', done: 'Wykonana', noshow: 'Nie przyjechał' };
const STORE_TEXT = 'Klient chce zostawić opony w przechowalni';
const STORED_TEXT = 'Klient ma już opony w przechowalni';
const storeNo = b => b.storeNo ? ` – nr ${esc(b.storeNo)}` : '';

const TIRE_SIZES = [
  '155/65 R14', '165/70 R14', '175/65 R14', '165/65 R15', '175/65 R15', '185/55 R15', '185/60 R15',
  '185/65 R15', '195/50 R15', '195/60 R15', '195/65 R15', '195/45 R16', '195/55 R16', '205/55 R16',
  '205/60 R16', '215/55 R16', '215/60 R16', '215/65 R16', '205/50 R17', '215/55 R17', '215/60 R17',
  '215/65 R17', '225/45 R17', '225/50 R17', '225/55 R17', '225/65 R17', '235/65 R17', '225/40 R18',
  '225/45 R18', '235/45 R18', '235/50 R18', '235/55 R18', '235/60 R18', '245/40 R18', '245/45 R18',
  '255/55 R18', '235/50 R19', '245/45 R19', '255/35 R19', '255/45 R19', '195/70 R15C', '205/65 R16C',
  '215/65 R16C', '225/70 R15C', '215/70 R15C', '235/65 R16C',
];

/* ================= Daty ================= */
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const DAYS_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const todayIso = () => iso(new Date());
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = s => { const d = parse(s); return `${cap(DAYS[d.getDay()])}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`; };
const shortDate = s => { const d = parse(s); return `${DAYS[d.getDay()].slice(0, 3)}. ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
const hourLabel = h => `${h}:00`;
const weekStart = s => { const d = parse(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ================= Reguły dni otwarcia ================= */
// Zwraca { open, reason } dla danego dnia. Soboty są czynne (8–14);
// wolną sobotę, urlop czy święto zamyka się przyciskiem „Zablokuj dzień”.
function dayState(date) {
  const wd = parse(date).getDay();
  const blocked = Store.blocked()[date];
  if (blocked !== undefined) return { open: false, reason: blocked || 'Dzień zablokowany', kind: 'blocked' };
  if (wd === 0) return { open: false, reason: 'Niedziela – nieczynne', kind: 'sunday' };
  return { open: true };
}

const hoursFor = date => {
  const st = dayState(date);
  if (!st.open) return [];
  return parse(date).getDay() === 6 ? HOURS_SATURDAY : HOURS_WEEKDAY;
};

const bookingsOn = date => Store.bookings().filter(b => b.date === date).sort((a, b) => a.hour - b.hour);

function freeHours(date, exceptId) {
  const taken = new Set(bookingsOn(date).filter(b => b.id !== exceptId).map(b => b.hour));
  return hoursFor(date).filter(h => !taken.has(h));
}

/* ================= Nawigacja (adres w pasku) ================= */
function route() {
  const h = location.hash;
  let m;
  if ((m = h.match(/^#\/dzien\/(\d{4}-\d{2}-\d{2})$/))) return { view: 'day', date: m[1] };
  if ((m = h.match(/^#\/tydzien\/(\d{4}-\d{2}-\d{2})$/))) return { view: 'week', start: weekStart(m[1]) };
  if ((m = h.match(/^#\/miesiac\/(\d{4}-\d{2}-\d{2})$/))) return { view: 'month', center: weekStart(m[1]) };
  if (h === '#/statystyki') return { view: 'stats' };
  return { view: 'week', start: weekStart(todayIso()) };
}
const goDay = date => { location.hash = `#/dzien/${date}`; };
const goWeek = date => { location.hash = `#/tydzien/${weekStart(date)}`; };
const goMonth = date => { location.hash = `#/miesiac/${weekStart(date)}`; };

// Dzień, na który „patrzy” aktualny widok — zakładki przenoszą go między widokami.
function focusDate(r = route()) {
  if (r.view === 'day') return r.date;
  if (r.view === 'stats') return todayIso();
  const start = r.view === 'week' ? r.start : r.center;
  return weekStart(todayIso()) === start ? todayIso() : start;
}

let signedIn = false;   // kalendarz pokazuje się dopiero po zalogowaniu

function render() {
  if (!signedIn) return;
  const r = route();
  $$('.tabs [data-tab]').forEach(t => t.classList.toggle('on',
    t.dataset.tab === r.view && (r.view !== 'day' || r.date === todayIso())));
  $('#fab').hidden = r.view === 'stats';
  $('.foot').hidden = r.view === 'stats';
  if (r.view === 'day') renderDay(r.date);
  else if (r.view === 'stats') renderStats();
  else if (r.view === 'week') renderWeek(r.start);
  else renderMonth(r.center);
}

function setupTabs() {
  $$('.tabs [data-tab]').forEach(t => t.onclick = () => {
    const d = focusDate();
    if (t.dataset.tab === 'day') goDay(todayIso());
    else if (t.dataset.tab === 'week') goWeek(d);
    else goMonth(d);
  });
}

const LEGEND = `
  <div class="legend">
    <span><i class="sw" style="background:var(--navy-soft);box-shadow:inset 3px 0 0 var(--navy)"></i>bieżący tydzień</span>
    <span><i class="sw" style="background:#fff;box-shadow:inset 0 0 0 3px var(--navy)"></i>dzisiaj (napis DZIŚ)</span>
    <span><i class="sw" style="background:var(--navy)"></i>liczba wizyt</span>
    <span><i class="sw" style="background:var(--green-bg);border:2px solid var(--green)"></i>wolne godziny</span>
    <span><i class="sw" style="background:var(--orange-bg);border:2px solid var(--orange)"></i>klient zostawia opony w przechowalni</span>
    <span><i class="sw" style="background:var(--purple-bg);border:2px solid var(--purple)"></i>klient ma już opony w przechowalni</span>
    <span><i class="sw" style="background:repeating-linear-gradient(135deg,#e6e8ec 0 4px,#f3f4f7 4px 8px)"></i>nieczynne / zablokowane</span>
  </div>
  <p class="howto">Kliknij dzień, aby zobaczyć godziny i dodać wizytę.</p>`;

/* ================= Kafelek dnia (wspólny dla miesiąca i tygodnia) ================= */
function dayCell(date, { withList = false, first = false } = {}) {
  const today = todayIso();
  const d = parse(date);
  const st = dayState(date);
  const list = bookingsOn(date);
  const stores = list.filter(b => b.store).length;
  const stored = list.filter(b => b.stored).length;
  const hours = hoursFor(date);
  const cls = ['day', !withList && d.getMonth() % 2 && 'alt', date < today && 'past', date === today && 'today', !st.open && 'closed'].filter(Boolean).join(' ');

  const plural = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? few : many;
  let pills = date === today ? '<span class="pill today-pill">DZIŚ</span>' : '';
  if (st.kind === 'blocked') pills += `<span class="pill blocked">zablokowany</span>`;
  if (st.kind === 'sunday') pills += `<span class="pill sun">nieczynne</span>`;
  if (list.length) pills += `<span class="pill count" title="${list.length} ${plural(list.length, 'wizyta', 'wizyty', 'wizyt')}">${list.length}<span class="long">&nbsp;${plural(list.length, 'wizyta', 'wizyty', 'wizyt')}</span></span>`;
  if (st.open && date >= today) {
    const free = hours.length - list.filter(b => hours.includes(b.hour)).length;
    pills += free > 0
      ? `<span class="pill free" title="${free} ${plural(free, 'wolna godzina', 'wolne godziny', 'wolnych godzin')}">${free}<span class="long">&nbsp;wolne</span></span>`
      : `<span class="pill full">pełne</span>`;
  }
  if (stores) pills += `<span class="pill store" title="${STORE_TEXT}: ${stores}">${stores}<span class="long">&nbsp;przechowalnia</span></span>`;
  if (stored) pills += `<span class="pill stored" title="${STORED_TEXT}: ${stored}">${stored}<span class="long">&nbsp;z przechowalni</span></span>`;

  const items = withList && list.length ? `<span class="mini">${list.map(b =>
    `<span class="mini-row${b.store ? ' store' : ''}${b.stored ? ' stored' : ''}${b.status !== 'planned' ? ' dim' : ''}"><b>${hourLabel(b.hour)}</b> ${esc(b.plate || b.name)}</span>`).join('')}</span>` : '';
  const monthTag = `<small>${MONTHS_GEN[d.getMonth()].slice(0, 3)}</small>`;
  const label = withList ? `<span class="dname">${cap(DAYS[d.getDay()])}</span>${d.getDate()} ${monthTag}`
    : d.getDate() === 1 || first ? `${d.getDate()} ${monthTag}` : d.getDate();

  return `<button class="${cls}" data-date="${date}" aria-label="${longDate(date)}"><span class="num">${label}</span>${pills ? `<span class="pills">${pills}</span>` : ''}${items}</button>`;
}

/* ================= Widok miesiąca: 5 tygodni, wybrany tydzień zawsze w środku ================= */
function renderMonth(center) {
  const today = todayIso();
  const thisWeek = weekStart(today);
  const first = addDays(center, -14);
  const last = addDays(center, 20);

  let weeks = '';
  for (let w = 0; w < 5; w++) {
    const cur = addDays(first, 7 * w);
    let cells = '';
    for (let i = 0; i < 7; i++) cells += dayCell(addDays(cur, i), { first: w === 0 && i === 0 });
    weeks += `<div class="week${cur === thisWeek ? ' current' : ''}">${cells}</div>`;
  }

  const fd = parse(first), ld = parse(last);
  const title = fd.getMonth() === ld.getMonth()
    ? `${cap(MONTHS[fd.getMonth()])} ${fd.getFullYear()}`
    : `${cap(MONTHS[fd.getMonth()])}${fd.getFullYear() !== ld.getFullYear() ? ' ' + fd.getFullYear() : ''} – ${MONTHS[ld.getMonth()]} ${ld.getFullYear()}`;
  const isCurrent = center === thisWeek;
  $('#app').innerHTML = `
    ${draftBar()}
    <div class="viewbar">
      <button class="btn round" id="prev" title="4 tygodnie wcześniej">‹</button>
      <h1>${title}</h1>
      <button class="btn round" id="next" title="4 tygodnie później">›</button>
      <span class="spacer"></span>
      ${isCurrent ? '' : '<button class="btn" id="back-now">Wróć do bieżącego tygodnia</button>'}
    </div>
    <div class="month">
      <div class="month-head">${DAYS_SHORT.map(d => `<div>${d}</div>`).join('')}</div>
      ${weeks}
    </div>
    ${LEGEND}`;

  $('#prev').onclick = () => goMonth(addDays(center, -28));
  $('#next').onclick = () => goMonth(addDays(center, 28));
  $('#back-now')?.addEventListener('click', () => goMonth(today));
  $$('.day').forEach(el => el.onclick = () => goDay(el.dataset.date));
  bindDraftBar();
  fitMonth();
}

// Automatyczne dopasowanie: jeśli miesiąc nie mieści się na ekranie (np. laptop),
// cała siatka pomniejsza się proporcjonalnie — wygląd bez zmian, strona się nie przewija.
const FIT_MIN_SCALE = 0.85;   // mniej = napisy za małe do czytania; wtedy zostaje lekkie przewijanie
function fitMonth() {
  const month = $('.month:not(.week-only)');
  if (!month) return;
  month.style.zoom = '';
  const main = $('#app');
  const mainBottomPad = parseFloat(getComputedStyle(main).paddingBottom) || 0;
  const monthRect = month.getBoundingClientRect();
  const top = monthRect.top + window.scrollY;
  const after = main.getBoundingClientRect().bottom - mainBottomPad - monthRect.bottom;   // legenda pod kalendarzem
  const available = window.innerHeight - top - after - mainBottomPad;
  if (monthRect.height <= available) return;
  const scale = Math.max(FIT_MIN_SCALE, available / monthRect.height);
  month.style.zoom = scale;
}
let fitTimer;
window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitMonth, 100); });

/* ================= Widok tygodnia (jeden tydzień w wyglądzie miesiąca) ================= */
function renderWeek(start) {
  const today = todayIso();
  const end = addDays(start, 6);
  let cells = '';
  for (let i = 0; i < 7; i++) cells += dayCell(addDays(start, i), { withList: true });

  const s = parse(start), e = parse(end);
  const title = s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${e.getDate()} ${MONTHS_GEN[e.getMonth()]} ${e.getFullYear()}`
    : `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} – ${e.getDate()} ${MONTHS_GEN[e.getMonth()]} ${e.getFullYear()}`;
  const isCurrent = start === weekStart(today);

  $('#app').innerHTML = `
    ${draftBar()}
    <div class="viewbar">
      <button class="btn round" id="prev" title="Poprzedni tydzień">‹</button>
      <h1>${title}</h1>
      <button class="btn round" id="next" title="Następny tydzień">›</button>
      <span class="spacer"></span>
      ${isCurrent ? '' : '<button class="btn" id="back-now">Wróć do bieżącego tygodnia</button>'}
    </div>
    <div class="month week-only">
      <div class="month-head">${DAYS_SHORT.map(d => `<div>${d}</div>`).join('')}</div>
      <div class="week${isCurrent ? ' current' : ''}">${cells}</div>
    </div>
    ${LEGEND}`;

  $('#prev').onclick = () => goWeek(addDays(start, -7));
  $('#next').onclick = () => goWeek(addDays(start, 7));
  $('#back-now')?.addEventListener('click', () => goWeek(today));
  $$('.day').forEach(el => el.onclick = () => goDay(el.dataset.date));
  bindDraftBar();
}

/* ================= Statystyki (zablokowane hasłem) ================= */
// Skrót SHA-256 hasła — samo hasło nie jest zapisane w plikach strony.
// Uwaga: to blokada przed przypadkowym zajrzeniem; prawdziwa ochrona będzie po podłączeniu logowania (Firebase).
const STATS_PASSWORD_HASH = '6a9ab2991c6c2644a12f046c5408b3a6bf7b31060345011726c49f0d00b065d8';
const STATS_UNLOCK_KEY = 'kalendarz-opon:statystyki';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function statsUnlocked() { try { return sessionStorage.getItem(STATS_UNLOCK_KEY) === '1'; } catch (e) { return false; } }
function setStatsUnlocked(on) { try { on ? sessionStorage.setItem(STATS_UNLOCK_KEY, '1') : sessionStorage.removeItem(STATS_UNLOCK_KEY); } catch (e) {} }

function openStats() {
  if (statsUnlocked()) { location.hash = '#/statystyki'; return; }
  openModal(`
    <div class="modal-head"><h2>Statystyki</h2><button class="close-x" data-close aria-label="Zamknij">×</button></div>
    <div class="modal-body">
      <div class="field">
        <label for="s-pass">Hasło</label>
        <input id="s-pass" type="password" autocomplete="current-password">
        <span class="err" id="s-err"></span>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Anuluj</button><button class="btn primary" id="s-ok">Otwórz</button></div>`);
  const tryOpen = async () => {
    if (!STATS_PASSWORD_HASH) { $('#s-err').textContent = 'Hasło nie zostało jeszcze ustawione.'; return; }
    if (await sha256($('#s-pass').value) !== STATS_PASSWORD_HASH) {
      $('#s-err').textContent = 'Nieprawidłowe hasło'; $('#s-pass').select(); return;
    }
    setStatsUnlocked(true);
    closeModal();
    location.hash = '#/statystyki';
  };
  $('#s-ok').onclick = tryOpen;
  $('#s-pass').addEventListener('keydown', e => { if (e.key === 'Enter') tryOpen(); });
  setTimeout(() => $('#s-pass').focus(), 50);
}

let statsRange = null;   // { from, to } — pamiętane do odświeżenia strony

function statsPresets() {
  const t = parse(todayIso());
  const y = t.getFullYear(), m = t.getMonth();
  return {
    week: { label: 'Ten tydzień', from: weekStart(todayIso()), to: addDays(weekStart(todayIso()), 6) },
    month: { label: 'Ten miesiąc', from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    prev: { label: 'Poprzedni miesiąc', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    year: { label: 'Ten rok', from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) },
  };
}

function renderStats() {
  if (!statsUnlocked()) { location.hash = ''; openStats(); return; }
  const presets = statsPresets();
  if (!statsRange) statsRange = { from: presets.month.from, to: presets.month.to };
  const { from, to } = statsRange;

  // Liczymy wszystkie wizyty oprócz „Nie przyjechał”.
  const list = Store.bookings().filter(b => b.date >= from && b.date <= to && b.status !== 'noshow');
  const count = k => list.filter(b => b.service === k).length;
  const tires = {};
  list.forEach(b => { if (b.tire) tires[b.tire] = (tires[b.tire] || 0) + 1; });
  const top = Object.entries(tires).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top.length ? top[0][1] : 1;
  const activePreset = Object.entries(presets).find(([, p]) => p.from === from && p.to === to)?.[0];

  $('#app').innerHTML = `
    <div class="viewbar">
      <h1>Statystyki</h1>
      <span class="spacer"></span>
      <button class="btn" id="stats-lock">Zablokuj statystyki</button>
    </div>
    <div class="stats-period">
      <div class="choices">
        ${Object.entries(presets).map(([k, p]) => `<button type="button" class="choice ${activePreset === k ? 'on' : ''}" data-preset="${k}">${p.label}</button>`).join('')}
      </div>
      <div class="row">
        <div class="field"><label for="st-from">Od dnia</label><input id="st-from" type="date" value="${from}"></div>
        <div class="field"><label for="st-to">Do dnia</label><input id="st-to" type="date" value="${to}"></div>
      </div>
    </div>
    <div class="stat-tiles">
      <div class="stat-tile"><span class="stat-num">${count('opony')}</span><span class="stat-label">Wymiana opon</span></div>
      <div class="stat-tile"><span class="stat-num">${count('kola')}</span><span class="stat-label">Wymiana kół</span></div>
      <div class="stat-tile"><span class="stat-num">${count('naprawa')}</span><span class="stat-label">Naprawa</span></div>
      <div class="stat-tile total"><span class="stat-num">${list.length}</span><span class="stat-label">Razem</span></div>
    </div>
    <div class="stat-box">
      <h2>Najczęstsze rozmiary opon</h2>
      ${top.length ? top.map(([size, n], i) => `
        <div class="tire-row">
          <span class="tire-pos">${i + 1}.</span>
          <span class="tire-size">${esc(size)}</span>
          <span class="tire-bar"><span style="width:${Math.round(n / max * 100)}%"></span></span>
          <span class="tire-n">${n}</span>
        </div>`).join('') : '<p class="hint">Brak wizyt z wpisanym rozmiarem opon w tym okresie.</p>'}
    </div>
    <p class="howto">Okres: ${esc(shortDate(from))} ${parse(from).getFullYear()} – ${esc(shortDate(to))} ${parse(to).getFullYear()}. Liczone są wszystkie wizyty oprócz „Nie przyjechał”.</p>`;

  $$('[data-preset]').forEach(el => el.onclick = () => { const p = presets[el.dataset.preset]; statsRange = { from: p.from, to: p.to }; renderStats(); });
  const setRange = () => {
    let f = $('#st-from').value, t = $('#st-to').value;
    if (!f || !t) return;
    if (t < f) [f, t] = [t, f];
    statsRange = { from: f, to: t }; renderStats();
  };
  $('#st-from').onchange = setRange;
  $('#st-to').onchange = setRange;
  $('#stats-lock').onclick = () => { setStatsUnlocked(false); goWeek(todayIso()); toast('Statystyki zablokowane'); };
}

/* ================= Kopia do Excela ================= */
function exportCsv() {
  const cols = [['Data', b => b.date], ['Godzina', b => hourLabel(b.hour)], ['Klient', b => b.name], ['Telefon', b => b.phone],
    ['Rejestracja', b => b.plate], ['Samochód', b => b.car], ['Usługa', b => SERVICES[b.service]], ['Rozmiar opon', b => b.tire],
    ['Własne opony', b => b.own ? 'tak' : ''], ['Chce zostawić w przechowalni', b => b.store ? 'tak' : ''],
    ['Ma już w przechowalni', b => b.stored ? 'tak' : ''], ['Nr w przechowalni', b => b.storeNo], ['Status', b => STATUSES[b.status]], ['Uwagi', b => b.notes]];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const list = Store.bookings().sort((a, b) => (a.date + pad(a.hour)).localeCompare(b.date + pad(b.hour)));
  const csv = [cols.map(c => cell(c[0])).join(';'), ...list.map(b => cols.map(c => cell(c[1](b))).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `wizyty-kopia-${todayIso()}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Pobrano kopię: ${list.length} wizyt`);
}

/* ================= Widok dnia ================= */
function renderDay(date) {
  const d = parse(date);
  const st = dayState(date);
  const list = bookingsOn(date);
  const baseHours = parse(date).getDay() === 6 ? HOURS_SATURDAY : parse(date).getDay() === 0 ? [] : HOURS_WEEKDAY;
  const hours = st.open ? baseHours : [];
  const allHours = [...new Set([...hours, ...list.map(b => b.hour)])].sort((a, b) => a - b);
  const isBlocked = Store.blocked()[date] !== undefined;

  const slots = allHours.map(h => {
    const b = list.find(x => x.hour === h);
    if (!b) return `
      <button class="slot free no-print-free" data-hour="${h}">
        <span class="time">${hourLabel(h)}</span>
        <span class="body"><span class="no-print">+ Wolne – kliknij, aby dodać wizytę</span></span>
      </button>`;
    const cls = ['slot', 'booked', b.store && 'store', b.stored && !b.store && 'stored', b.status === 'done' && 'done', b.status === 'noshow' && 'noshow'].filter(Boolean).join(' ');
    return `
      <button class="${cls}" data-id="${b.id}">
        <span class="time">${hourLabel(h)}</span>
        <span class="body">
          <span class="line1">${b.plate ? `<span class="plate">${esc(b.plate)}</span>` : ''}<span>${esc(b.name)}</span></span>
          <span class="line2">${esc(SERVICES[b.service] || '')}${b.car ? ' · ' + esc(b.car) : ''}${b.tire ? ' · ' + esc(b.tire) : ''}${b.phone ? ' · tel. ' + esc(b.phone) : ''}</span>
          ${b.notes ? `<span class="line2"><em>${esc(b.notes)}</em></span>` : ''}
          <span class="tags">
            ${b.store ? `<span class="tag store">${STORE_TEXT}${storeNo(b)}</span>` : ''}
            ${b.stored ? `<span class="tag stored">${STORED_TEXT}${storeNo(b)}</span>` : ''}
            ${b.own ? '<span class="tag own">Własne opony klienta</span>' : ''}
            ${b.status === 'done' ? '<span class="tag done">✓ Wykonana</span>' : ''}
            ${b.status === 'noshow' ? '<span class="tag noshow">Nie przyjechał</span>' : ''}
          </span>
        </span>
      </button>`;
  }).join('');

  $('#app').innerHTML = `
    ${draftBar()}
    <div class="print-only"><h2>Kalendarz opon – ${longDate(date)}</h2></div>
    <div class="viewbar no-print">
      <button class="btn round" id="prev" title="Poprzedni dzień">‹</button>
      <h1>${longDate(date)}${date === todayIso() ? '<span class="today-badge">dziś</span>' : ''}</h1>
      <button class="btn round" id="next" title="Następny dzień">›</button>
      <span class="spacer"></span>
      <div class="actions">
        ${date === todayIso() ? '' : '<button class="btn" id="back-now">Wróć do dzisiaj</button>'}
        ${d.getDay() !== 0 ? `<button class="btn ${isBlocked ? '' : 'danger'}" id="block">${isBlocked ? 'Odblokuj dzień' : 'Zablokuj dzień'}</button>` : ''}
        <button class="btn" id="print">Drukuj dzień</button>
      </div>
    </div>
    ${!st.open ? `<div class="daynote ${st.kind === 'blocked' ? 'red' : ''}">${esc(st.reason)}${list.length ? ' – poniżej wizyty zapisane wcześniej' : ''}</div>` : ''}
    <div class="slots">${slots || ''}</div>`;

  $('#prev').onclick = () => goDay(addDays(date, -1));
  $('#next').onclick = () => goDay(addDays(date, 1));
  $('#print').onclick = () => window.print();
  $('#back-now')?.addEventListener('click', () => goDay(todayIso()));
  $('#block')?.addEventListener('click', () => {
    if (isBlocked) { Store.setBlocked(date, null); toast('Dzień odblokowany'); }
    else openBlockDialog(date);
  });
  $$('.slot.free').forEach(el => el.onclick = () => openForm({ date, hour: +el.dataset.hour }));
  $$('.slot.booked').forEach(el => el.onclick = () => openDetails(el.dataset.id));
  bindDraftBar();
}

/* ================= Okna ================= */
let modalOnClose = null;
function openModal(html, onClose) {
  const m = $('#modal');
  $('.modal-box', m).innerHTML = html;
  m.hidden = false;
  document.documentElement.classList.add('modal-open');
  modalOnClose = onClose || null;
  m.scrollTop = 0;   // każde okno otwiera się od góry
  $$('[data-close]', m).forEach(b => b.onclick = closeModal);
}
function closeModal() {
  $('#modal').hidden = true;
  document.documentElement.classList.remove('modal-open');
  const fn = modalOnClose; modalOnClose = null;
  if (fn) fn();
  render();
}
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('.confirm-layer')) return $('.confirm-layer').remove();
  if (!$('#modal').hidden) closeModal();
});

function confirmBox(title, text, okLabel, danger = true) {
  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.className = 'modal confirm-layer';
    layer.style.zIndex = 70;
    layer.innerHTML = `
      <div class="modal-box" style="max-width:480px;margin-top:10vh">
        <div class="modal-head"><h2>${esc(title)}</h2></div>
        <div class="modal-body"><p style="margin:0">${esc(text)}</p></div>
        <div class="modal-foot">
          <button class="btn" data-a="no">Nie, wróć</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(okLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(layer);
    layer.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (e.target === layer || a) { layer.remove(); resolve(a === 'yes'); }
    });
    $('[data-a="no"]', layer).focus();
  });
}

let toastTimer;
// action: { label, fn } — opcjonalny przycisk w komunikacie (np. „Cofnij”)
function toast(msg, action = null, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-btn'; b.textContent = action.label;
    b.onclick = () => { t.hidden = true; clearTimeout(toastTimer); action.fn(); };
    t.appendChild(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, ms);
}

/* ================= Szczegóły wizyty ================= */
function openDetails(id) {
  const b = Store.booking(id);
  if (!b) return;
  const phoneDigits = (b.phone || '').replace(/[^\d+]/g, '');
  openModal(`
    <div class="modal-head">
      <h2>${hourLabel(b.hour)} · ${esc(shortDate(b.date))}</h2>
      <button class="close-x" data-close aria-label="Zamknij">×</button>
    </div>
    <div class="modal-body">
      ${b.store ? `<div class="store-banner">${STORE_TEXT}${storeNo(b)}</div>` : ''}
      ${b.stored ? `<div class="store-banner stored">${STORED_TEXT}${storeNo(b)}</div>` : ''}
      <dl class="details">
        <dt>Klient</dt><dd>${esc(b.name)}</dd>
        <dt>Telefon</dt><dd>${b.phone ? `<a class="tel" href="tel:${esc(phoneDigits)}">${esc(b.phone)}</a>` : '—'}</dd>
        <dt>Rejestracja</dt><dd>${b.plate ? `<span class="plate">${esc(b.plate)}</span>` : '—'}</dd>
        <dt>Samochód</dt><dd>${esc(b.car) || '—'}</dd>
        <dt>Usługa</dt><dd>${esc(SERVICES[b.service])}</dd>
        <dt>Rozmiar opon</dt><dd>${esc(b.tire) || '—'}</dd>
        <dt>Własne opony</dt><dd>${b.own ? 'Tak – klient przywiezie' : 'Nie'}</dd>
        ${b.store || b.stored ? `<dt>Nr w przechowalni</dt><dd>${esc(b.storeNo) || '—'}</dd>` : ''}
        <dt>Uwagi</dt><dd>${esc(b.notes) || '—'}</dd>
      </dl>
      <div>
        <div class="legend-title" style="font-weight:700;margin-bottom:10px">Status wizyty</div>
        <div class="status-row">
          ${Object.entries(STATUSES).map(([k, v]) => `<button class="choice ${k} ${b.status === k ? 'on' : ''}" data-status="${k}">${v}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn danger" id="del">Usuń wizytę</button>
      <span style="flex:1"></span>
      <button class="btn" id="edit">Edytuj</button>
      <button class="btn primary" data-close>Zamknij</button>
    </div>`);

  $$('[data-status]').forEach(el => el.onclick = () => {
    Store.saveBooking({ ...Store.booking(id), status: el.dataset.status });
    $$('[data-status]').forEach(x => x.classList.toggle('on', x === el));
    toast('Zapisano: ' + STATUSES[el.dataset.status]);
  });
  $('#edit').onclick = () => { closeModal(); openForm(Store.booking(id)); };
  $('#del').onclick = async () => {
    if (await confirmBox('Usunąć wizytę?', `${b.name}, ${hourLabel(b.hour)} ${shortDate(b.date)}. Tej operacji nie można cofnąć.`, 'Tak, usuń')) {
      const copy = { ...Store.booking(id) };
      Store.deleteBooking(id);
      closeModal();
      toast('Wizyta usunięta', {
        label: 'Cofnij',
        fn: () => {
          if (bookingsOn(copy.date).some(x => x.hour === copy.hour)) return toast('Nie można cofnąć – ta godzina jest już zajęta');
          Store.saveBooking(copy);
          toast('Przywrócono wizytę');
        },
      }, 10000);
    }
  };
}

/* ================= Formularz dodawania / edycji ================= */
const EMPTY_FORM = { date: '', hour: null, service: '', plate: '', phone: '', name: '', car: '', tire: '', own: false, store: false, stored: false, storeNo: '', notes: '' };

function formHasData(f) { return !!(f.plate || f.phone || f.name || f.car || f.tire || f.notes); }

function openForm(preset = {}, restored = false) {
  const editing = !!preset.id;
  const f = { ...EMPTY_FORM, ...preset };
  if (!f.date) {
    const r = route();
    f.date = r.view === 'day' ? r.date : todayIso();
  }
  f.status = f.status || 'planned';

  openModal(`
    <div class="modal-head">
      <h2>${editing ? 'Edycja wizyty' : 'Nowa wizyta'}</h2>
      <button class="close-x" data-close aria-label="Zamknij">×</button>
    </div>
    <div class="modal-body">
      ${restored ? `<div class="banner">Przywrócono niedokończoną wizytę. <button class="btn" id="discard" style="margin-left:auto">Zacznij od nowa</button></div>` : ''}

      <fieldset>
        <legend class="sec">1 · Termin</legend>
        <div class="row">
          <div class="field">
            <label for="f-date">Dzień <span class="req">*</span></label>
            <div class="date-row">
              <input id="f-date" type="date" value="${f.date}">
              <button class="btn" type="button" id="f-today">Dzisiaj</button>
            </div>
            <span class="hint" id="date-hint"></span>
          </div>
        </div>
        <div class="field">
          <label>Godzina <span class="req">*</span></label>
          <div class="hours" id="hours"></div>
          <span class="err" id="hour-err"></span>
        </div>
      </fieldset>

      <fieldset>
        <legend class="sec">2 · Klient i samochód</legend>
        <div class="row">
          <div class="field">
            <label for="f-plate">Nr rejestracyjny</label>
            <input id="f-plate" class="plate-input" value="${esc(f.plate)}" placeholder="np. KR 12345" autocomplete="off">
            <span class="warn" id="plate-warn"></span>
          </div>
          <div class="field">
            <label for="f-phone">Telefon <span class="req">*</span></label>
            <input id="f-phone" type="tel" inputmode="tel" value="${esc(f.phone)}" placeholder="np. 600 100 200" autocomplete="off">
            <span class="warn" id="phone-warn"></span>
          </div>
        </div>
        <div id="known"></div>
        <div class="row">
          <div class="field">
            <label for="f-name">Imię i nazwisko <span class="req">*</span></label>
            <input id="f-name" value="${esc(f.name)}" placeholder="np. Jan Kowalski" autocomplete="off">
            <span class="err" id="name-err"></span>
          </div>
          <div class="field">
            <label for="f-car">Marka i model</label>
            <input id="f-car" value="${esc(f.car)}" placeholder="np. Toyota Corolla" autocomplete="off">
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend class="sec">3 · Usługa</legend>
        <div class="choices" id="services">
          ${Object.entries(SERVICES).map(([k, v]) => `<button type="button" class="choice ${f.service === k ? 'on' : ''}" data-service="${k}">${v}</button>`).join('')}
        </div>
        <span class="err" id="service-err"></span>
        <div class="field">
          <label for="f-tire">Rozmiar opon</label>
          <input id="f-tire" value="${esc(f.tire)}" placeholder="zacznij pisać, np. 205" autocomplete="off" inputmode="text">
          <span class="hint">Wpisz pierwsze cyfry – pojawią się podpowiedzi. Format: 205/55 R16</span>
          <span class="warn" id="tire-warn"></span>
        </div>
        <label class="check" id="own-box">
          <input type="checkbox" id="f-own" ${f.own ? 'checked' : ''}>
          <span>Klient przywiezie własne opony<small>zaznacz, jeśli opony nie są z warsztatu</small></span>
        </label>
        <label class="check store ${f.store ? 'on' : ''}" id="store-box">
          <input type="checkbox" id="f-store" ${f.store ? 'checked' : ''}>
          <span>${STORE_TEXT}<small>wizyta będzie wyróżniona na pomarańczowo</small></span>
        </label>
        <label class="check stored ${f.stored ? 'on' : ''}" id="stored-box">
          <input type="checkbox" id="f-stored" ${f.stored ? 'checked' : ''}>
          <span>${STORED_TEXT}<small>opony trzeba przygotować przed wizytą – wizyta będzie wyróżniona na fioletowo</small></span>
        </label>
        <div class="field" id="storeno-field" ${f.store || f.stored ? '' : 'hidden'}>
          <label for="f-storeno">Numer w przechowalni</label>
          <input id="f-storeno" value="${esc(f.storeNo)}" placeholder="np. 125" autocomplete="off">
          <span class="hint">Numer z etykiety lub miejsca na regale</span>
        </div>
        <div class="field">
          <label for="f-notes">Uwagi</label>
          <textarea id="f-notes" placeholder="np. klient poprosi o sprawdzenie ciśnienia">${esc(f.notes)}</textarea>
        </div>
      </fieldset>
    </div>
    <div class="modal-foot">
      <span class="hint" style="margin-right:auto;align-self:center">Pola z <span class="req">*</span> są wymagane. Wpisane dane zapisują się na bieżąco.</span>
      <button class="btn" id="cancel">Anuluj</button>
      <button class="btn primary" id="save">${editing ? 'Zapisz zmiany' : 'Dodaj wizytę'}</button>
    </div>`,
    () => {
      if (!dirty) Store.clearDraft();
      else if (formHasData(f)) toast('Niedokończona wizyta została zachowana');
    });

  let dirty = restored;
  const saveDraft = () => { dirty = true; Store.saveDraft({ ...f }); };
  const inputs = { date: '#f-date', plate: '#f-plate', phone: '#f-phone', name: '#f-name', car: '#f-car', tire: '#f-tire', notes: '#f-notes' };

  // --- godziny
  function renderHours() {
    const st = f.date ? dayState(f.date) : { open: false, reason: 'Wybierz dzień' };
    const hint = $('#date-hint');
    const base = !f.date ? [] : parse(f.date).getDay() === 6 ? HOURS_SATURDAY : HOURS_WEEKDAY;
    const free = f.date ? freeHours(f.date, f.id) : [];
    if (!st.open) {
      $('#hours').innerHTML = '';
      hint.className = 'warn';
      hint.textContent = f.date ? `${st.reason}. Wybierz inny dzień.` : '';
      return;
    }
    hint.className = 'hint';
    hint.textContent = f.date ? `${longDate(f.date)} · wolnych godzin: ${free.length}` : '';
    if (!free.includes(f.hour)) f.hour = null;
    $('#hours').innerHTML = base.map(h => `<button type="button" class="hour ${f.hour === h ? 'on' : ''}" data-h="${h}" ${free.includes(h) ? '' : 'disabled title="Zajęte"'}>${hourLabel(h)}</button>`).join('');
    $$('#hours .hour').forEach(el => el.onclick = () => {
      f.hour = +el.dataset.h; $('#hour-err').textContent = '';
      $$('#hours .hour').forEach(x => x.classList.toggle('on', x === el));
      saveDraft();
    });
  }
  renderHours();

  $('#f-date').addEventListener('change', e => { f.date = e.target.value; renderHours(); saveDraft(); });
  $('#f-today').onclick = () => { f.date = todayIso(); $('#f-date').value = f.date; renderHours(); saveDraft(); };

  // --- pola tekstowe
  ['plate', 'phone', 'name', 'car', 'tire', 'notes'].forEach(k => {
    $(inputs[k]).addEventListener('input', e => {
      if (k === 'plate') e.target.value = e.target.value.toUpperCase();
      f[k] = e.target.value; saveDraft();
      if (k === 'plate' || k === 'phone') checkKnown();
      if (k === 'name' && f.name.trim()) $('#name-err').textContent = '';
    });
  });

  // walidacja miękka (ostrzega, nie blokuje)
  const plateWarn = () => {
    const p = f.plate.replace(/\s/g, '');
    $('#plate-warn').textContent = p && (p.length < 4 || p.length > 8 || !/^[A-Z0-9]+$/.test(p)) ? 'Sprawdź numer – wygląda nietypowo' : '';
  };
  const phoneWarn = () => {
    const digits = f.phone.replace(/\D/g, '');
    const local = digits.startsWith('48') && digits.length === 11 ? digits.slice(2) : digits;
    if (local.length === 9 && !f.phone.startsWith('+')) {
      f.phone = `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
      $('#f-phone').value = f.phone; saveDraft();
    }
    $('#phone-warn').textContent = f.phone && local.length !== 9 ? 'Numer powinien mieć 9 cyfr' : '';
  };
  const tireWarn = () => {
    const t = normalizeTire(f.tire);
    if (t !== f.tire) { f.tire = t; $('#f-tire').value = t; saveDraft(); }
    $('#tire-warn').textContent = f.tire && !/^\d{3}\/\d{2} R\d{2}C?$/.test(f.tire) ? 'Sprawdź rozmiar – oczekiwany format: 205/55 R16' : '';
  };
  $('#f-plate').addEventListener('blur', () => { f.plate = f.plate.trim().replace(/\s+/g, ' '); $('#f-plate').value = f.plate; plateWarn(); });
  $('#f-phone').addEventListener('blur', phoneWarn);
  $('#f-tire').addEventListener('blur', () => setTimeout(tireWarn, 150));

  // --- stały klient
  function checkKnown() {
    const plate = f.plate.replace(/\s/g, '');
    const phone = f.phone.replace(/\D/g, '');
    const prev = Store.bookings()
      .filter(b => b.id !== f.id && ((plate.length >= 4 && b.plate.replace(/\s/g, '') === plate) || (phone.length >= 9 && b.phone.replace(/\D/g, '').endsWith(phone.slice(-9)))))
      .sort((a, b) => (b.date + pad(b.hour)).localeCompare(a.date + pad(a.hour)))[0];
    const box = $('#known');
    if (!prev || (f.name === prev.name && f.car === prev.car && f.tire === prev.tire)) { box.innerHTML = ''; return; }
    // Ostatnio zostawił opony (albo już je miał) w przechowalni → pewnie nadal tam są.
    const inStorage = (prev.store || prev.stored) && prev.status !== 'noshow';
    box.innerHTML = `<div class="known">✓ Stały klient: ${esc(prev.name)}${prev.car ? ', ' + esc(prev.car) : ''}${prev.tire ? ', ' + esc(prev.tire) : ''}${inStorage ? `<br>Opony w przechowalni${storeNo(prev)}` : ''}
      <button type="button" class="btn" id="fill">Uzupełnij dane</button></div>`;
    $('#fill').onclick = () => {
      ['plate', 'phone', 'name', 'car', 'tire'].forEach(k => { if (prev[k]) { f[k] = prev[k]; $(inputs[k]).value = prev[k]; } });
      if (inStorage) {
        f.stored = true; f.storeNo = prev.storeNo || '';
        $('#f-storeno').value = f.storeNo; syncStore();
      }
      box.innerHTML = ''; saveDraft(); plateWarn(); phoneWarn(); tireWarn();
      toast('Uzupełniono dane z poprzedniej wizyty');
    };
  }
  if (!editing) checkKnown();

  // --- usługa
  $$('[data-service]').forEach(el => el.onclick = () => {
    f.service = el.dataset.service; $('#service-err').textContent = '';
    $$('[data-service]').forEach(x => x.classList.toggle('on', x === el));
    saveDraft();
  });

  // --- pola wyboru
  $('#f-own').onchange = e => { f.own = e.target.checked; saveDraft(); };
  const syncStore = () => {
    $('#f-store').checked = f.store; $('#f-stored').checked = f.stored;
    $('#store-box').classList.toggle('on', f.store);
    $('#stored-box').classList.toggle('on', f.stored);
    $('#storeno-field').hidden = !(f.store || f.stored);
  };
  $('#f-store').onchange = e => { f.store = e.target.checked; syncStore(); saveDraft(); };
  $('#f-stored').onchange = e => { f.stored = e.target.checked; syncStore(); saveDraft(); };
  $('#f-storeno').addEventListener('input', e => { f.storeNo = e.target.value.trim(); saveDraft(); });

  // --- podpowiedzi rozmiaru opon
  attachTireSuggest($('#f-tire'), v => { f.tire = v; saveDraft(); tireWarn(); });

  // --- przyciski
  $('#discard')?.addEventListener('click', () => { Store.clearDraft(); modalOnClose = null; closeModal(); openForm({ date: f.date }); });
  $('#cancel').onclick = async () => {
    if (!editing && formHasData(f) && !(await confirmBox('Odrzucić wpisane dane?', 'Wizyta nie zostanie dodana.', 'Tak, odrzuć'))) return;
    Store.clearDraft(); modalOnClose = null; closeModal(); render();
  };
  $('#save').onclick = () => {
    let bad = null;
    if (!f.date || !dayState(f.date).open || f.hour === null) { $('#hour-err').textContent = 'Wybierz dzień i wolną godzinę'; bad = bad || '#hours'; }
    if (!f.name.trim()) { $('#name-err').textContent = 'Wpisz imię i nazwisko klienta'; bad = bad || '#f-name'; }
    if (!f.phone.trim()) { $('#phone-warn').textContent = 'Wpisz numer telefonu'; bad = bad || '#f-phone'; }
    if (!f.service) { $('#service-err').textContent = 'Wybierz usługę'; bad = bad || '#services'; }
    if (bad) { $(bad).scrollIntoView({ behavior: 'smooth', block: 'center' }); $(bad).focus?.(); return; }
    if (!freeHours(f.date, f.id).includes(f.hour)) { $('#hour-err').textContent = 'Ta godzina została właśnie zajęta – wybierz inną'; renderHours(); return; }

    const { restored: _r, ...clean } = f;
    clean.name = clean.name.trim(); clean.car = clean.car.trim(); clean.notes = clean.notes.trim();
    const saved = Store.saveBooking(clean);
    Store.clearDraft();
    modalOnClose = null; closeModal();
    toast(editing ? 'Zmiany zapisane' : `Dodano wizytę: ${shortDate(saved.date)}, ${hourLabel(saved.hour)}`);
    goDay(saved.date); render();
  };

  if (!restored && !editing) setTimeout(() => $('#f-plate').focus(), 50);
}

function normalizeTire(v) {
  const s = v.toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(\d{3})\/?(\d{2})\/?R?(\d{2})(C?)$/);
  return m ? `${m[1]}/${m[2]} R${m[3]}${m[4]}` : v.trim();
}

function attachTireSuggest(input, onPick) {
  let box = null, active = -1, items = [];
  const digits = s => s.toUpperCase().replace(/[^0-9C]/g, '');
  const used = () => [...new Set(Store.bookings().map(b => b.tire).filter(Boolean))];

  function close() { box?.remove(); box = null; active = -1; }
  function show() {
    const q = digits(input.value);
    close();
    if (q.length < 1) return;
    const all = [...new Set([...used(), ...TIRE_SIZES])];
    items = all.filter(t => digits(t).startsWith(q) && t !== input.value).slice(0, 7);
    if (!items.length) return;
    box = document.createElement('div');
    box.className = 'suggest';
    box.innerHTML = `<div class="hd">Podpowiedzi</div>` + items.map((t, i) => `<button type="button" data-i="${i}">${esc(t)}</button>`).join('');
    input.parentElement.appendChild(box);
    box.addEventListener('mousedown', e => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); pick(items[+b.dataset.i]);
    });
  }
  function pick(v) { input.value = v; close(); onPick(v); }
  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    if (!box) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      $$('button', box).forEach((b, i) => b.classList.toggle('act', i === active));
    } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
}

/* ================= Niedokończona wizyta ================= */
function draftBar() {
  const d = Store.draft();
  if (!d || !formHasData(d) || !$('#modal').hidden) return '';
  const who = d.name || d.plate || d.phone || 'bez nazwy';
  return `<div class="banner no-print" style="margin-bottom:18px">
    Masz niedokończoną ${d.id ? 'edycję' : 'wizytę'}: ${esc(who)}
    <span style="flex:1"></span>
    <button class="btn" id="draft-drop">Odrzuć</button>
    <button class="btn primary" id="draft-open">Dokończ</button>
  </div>`;
}
function bindDraftBar() {
  $('#draft-open')?.addEventListener('click', () => openForm(Store.draft(), true));
  $('#draft-drop')?.addEventListener('click', async () => {
    if (await confirmBox('Odrzucić niedokończoną wizytę?', 'Wpisane dane zostaną usunięte.', 'Tak, odrzuć')) { Store.clearDraft(); render(); }
  });
}

/* ================= Blokowanie dnia ================= */
function openBlockDialog(date) {
  openModal(`
    <div class="modal-head"><h2>Zablokuj dzień</h2><button class="close-x" data-close aria-label="Zamknij">×</button></div>
    <div class="modal-body">
      <div class="field">
        <label for="b-date">Dzień</label>
        <input id="b-date" type="date" value="${date}">
      </div>
      <span class="warn" id="b-warn"></span>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Anuluj</button><button class="btn primary" id="b-save">Zapisz</button></div>`, render);

  const check = () => {
    const n = bookingsOn($('#b-date').value).length;
    $('#b-warn').textContent = n ? `Uwaga: w tym dniu są już zapisane wizyty (${n}). Zostaną w kalendarzu – trzeba je przełożyć.` : '';
  };
  $('#b-date').onchange = check;
  check();
  $('#b-save').onclick = () => {
    const d = $('#b-date').value;
    if (!d) return;
    Store.setBlocked(d, '');
    closeModal(); toast('Dzień zablokowany');
  };
}

/* ================= Wyszukiwarka ================= */
function setupSearch() {
  const input = $('#search'), box = $('#search-results');
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.hidden = true; return; }
    const qd = q.replace(/\D/g, ''), qp = q.replace(/\s/g, '');
    const res = Store.bookings().filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.plate.toLowerCase().replace(/\s/g, '').includes(qp) ||
      (qd.length >= 3 && b.phone.replace(/\D/g, '').includes(qd)) ||
      (b.car || '').toLowerCase().includes(q) ||
      (b.storeNo && b.storeNo.toLowerCase() === q.replace(/^nr\s*/, ''))
    ).sort((a, b) => (b.date + pad(b.hour)).localeCompare(a.date + pad(a.hour))).slice(0, 25);
    box.innerHTML = res.length ? res.map(b => `
      <button data-id="${b.id}">
        <strong>${esc(b.name)}</strong> ${b.plate ? `<span class="plate" style="font-size:.85rem">${esc(b.plate)}</span>` : ''} ${b.store ? '<span class="tag store">zostawia w przechowalni</span>' : ''} ${b.stored ? '<span class="tag stored">ma w przechowalni</span>' : ''} ${b.storeNo ? `<span class="hint">nr ${esc(b.storeNo)}</span>` : ''}<br>
        <span class="hint">${esc(shortDate(b.date))} ${parse(b.date).getFullYear()}, ${hourLabel(b.hour)} · ${esc(SERVICES[b.service])}${b.phone ? ' · ' + esc(b.phone) : ''}</span>
      </button>`).join('') : '<div class="empty">Nic nie znaleziono</div>';
    box.hidden = false;
    $$('button', box).forEach(el => el.onclick = () => {
      const b = Store.booking(el.dataset.id);
      box.hidden = true; input.value = '';
      goDay(b.date); setTimeout(() => openDetails(b.id), 30);
    });
  };
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  document.addEventListener('mousedown', e => { if (!e.target.closest('.search')) box.hidden = true; });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; box.hidden = true; input.blur(); } });
}

/* ================= Dane przykładowe (tylko przy pierwszym uruchomieniu) ================= */
function seedDemo() {
  // Jeden przykładowy dzień (dziś albo najbliższy czynny dzień), żeby było widać, jak wygląda grafik.
  // Każda wizyta ma w uwagach dopisek, że jest przykładowa — można ją spokojnie usunąć.
  let date = todayIso();
  while (!hoursFor(date).length) date = addDays(date, 1);
  const demo = [
    { hour: 8, name: 'Jan Kowalski', phone: '601 234 567', plate: 'KR 4F221', car: 'Toyota Corolla', tire: '205/55 R16', service: 'opony' },
    { hour: 10, name: 'Anna Nowak', phone: '512 887 120', plate: 'KRA 77310', car: 'Skoda Octavia', tire: '205/55 R16', service: 'kola', store: true, storeNo: '101' },
    { hour: 12, name: 'Piotr Wiśniewski', phone: '698 440 012', plate: 'KWI 1234A', car: 'VW Passat', tire: '215/55 R17', service: 'kola', stored: true, storeNo: '57' },
    { hour: 13, name: 'Ewa Kamińska', phone: '663 902 118', plate: 'KR 2HT71', car: 'Opel Astra', tire: '195/65 R15', service: 'naprawa', own: true },
  ];
  demo.forEach(d => Store.saveBooking({
    date, own: false, store: false, stored: false, storeNo: '', status: 'planned', ...d,
    notes: 'Wizyta przykładowa – można usunąć',
  }));
}

/* ================= Start ================= */
$('#fab').onclick = () => {
  const d = Store.draft();
  if (d && formHasData(d)) openForm(d, true); else openForm();
};
$('#btn-export').onclick = exportCsv;
$('#btn-stats').onclick = openStats;

// Powiększenie napisów — zapamiętywane na tym komputerze / telefonie.
function applyZoom(big) {
  document.documentElement.classList.toggle('big', big);
  $('#btn-zoom').textContent = big ? 'A−' : 'A+';
  $('#btn-zoom').title = big ? 'Zmniejsz napisy' : 'Powiększ napisy';
}
let bigText = false;
try { bigText = localStorage.getItem('kalendarz-opon:duze') === '1'; } catch (e) {}
applyZoom(bigText);
$('#btn-zoom').onclick = () => {
  bigText = !bigText;
  applyZoom(bigText);
  try { localStorage.setItem('kalendarz-opon:duze', bigText ? '1' : '0'); } catch (e) {}
};
setupTabs();
setupSearch();
window.addEventListener('hashchange', () => { if (signedIn) { render(); window.scrollTo(0, 0); } });
Store.onChange(() => { if (signedIn && $('#modal').hidden) render(); });

/* ================= Logowanie ================= */
const LOGIN_ERRORS = {
  'auth/invalid-credential': 'Nieprawidłowy e-mail lub hasło',
  'auth/invalid-login-credentials': 'Nieprawidłowy e-mail lub hasło',
  'auth/wrong-password': 'Nieprawidłowy e-mail lub hasło',
  'auth/user-not-found': 'Nieprawidłowy e-mail lub hasło',
  'auth/invalid-email': 'To nie wygląda na adres e-mail',
  'auth/too-many-requests': 'Za dużo prób. Odczekaj chwilę i spróbuj ponownie',
  'auth/network-request-failed': 'Brak internetu – sprawdź połączenie',
};

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#login-btn');
  $('#login-err').textContent = '';
  btn.disabled = true; btn.textContent = 'Logowanie…';
  try {
    await Store.signIn($('#login-email').value.trim(), $('#login-pass').value);
  } catch (err) {
    $('#login-err').textContent = LOGIN_ERRORS[err.code] || 'Nie udało się zalogować';
  } finally {
    btn.disabled = false; btn.textContent = 'Zaloguj się';
  }
});
$('#btn-logout').onclick = async () => {
  if (await confirmBox('Wylogować?', 'Aby znów zobaczyć kalendarz, trzeba będzie podać e-mail i hasło.', 'Tak, wyloguj', false)) {
    setStatsUnlocked(false);
    Store.signOut();
  }
};

Store.start({
  async onSignedIn() {
    signedIn = true;
    $('#login').hidden = true;
    $('#loading').hidden = true;
    document.body.classList.remove('logged-out');
    await Store.seedOnce(seedDemo);
    render();
  },
  onSignedOut() {
    signedIn = false;
    if (!$('#modal').hidden) { modalOnClose = null; closeModal(); }
    $('#app').innerHTML = '';
    $('#loading').hidden = true;
    $('#login').hidden = false;
    $('#login-pass').value = '';
    document.body.classList.add('logged-out');
    setTimeout(() => $('#login-email').focus(), 50);
  },
  onError(err) {
    toast(err && err.code === 'permission-denied'
      ? 'Brak dostępu do bazy – sprawdź reguły Firestore'
      : 'Nie udało się zapisać zmiany – spróbuj ponownie');
  },
});
