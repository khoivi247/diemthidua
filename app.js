// 👇 DÁN URL APPS SCRIPT CỦA M VÀO ĐÂY
const API = 'https://script.google.com/macros/s/AKfycbyYrxI-VE0mUHnp_QRUevUydQ7yn1jDTnnRwwEF1lAL_7oD3F-sBltjrG34f3joAS_Xfw/exec';

const $ = id => document.getElementById(id);
const fmtNum = n => (Math.round(n * 100) / 100).toLocaleString('vi-VN');
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// Kiểm tra giá trị có phải số không
function isNumeric(v) {
  if (v === '' || v === null || v === undefined) return false;
  return !isNaN(Number(v)) && isFinite(Number(v));
}
// Hiển thị score: số thì format, chữ thì hiện nguyên, trống thì "Chưa nhập"
function fmtScore(v) {
  if (v === '' || v === null || v === undefined) {
    return '<span class="text-empty">Chưa nhập</span>';
  }
  if (isNumeric(v)) return fmtNum(Number(v));
  return escapeHtml(String(v));
}

// ===== So sánh tên lớp =====
function parseClassName(name) {
  const s = String(name).trim().toUpperCase();
  const m = s.match(/^(\d+)\s*([A-Z]*)/);
  if (!m) return { grade: 999, letter: s };
  return { grade: parseInt(m[1], 10), letter: m[2] || '' };
}
function compareClassName(a, b) {
  const pa = parseClassName(a);
  const pb = parseClassName(b);
  if (pa.grade !== pb.grade) return pa.grade - pb.grade;
  if (pa.letter === '' && pb.letter !== '') return -1;
  if (pa.letter !== '' && pb.letter === '') return 1;
  return pa.letter.localeCompare(pb.letter);
}

// ===== Ngày tháng =====
// Cộng n ngày vào chuỗi yyyy-MM-dd
function addDays(dateStr, n) {
  if (!dateStr) return '';
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return '';
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ===== State =====
let schoolData = [];
let schoolWeeks = [];
let schoolWeek = null;
let chart = null;

let myData = [];
let myWeeks = [];
let myWeek = null;
let myChart = null;

let specialData = [];
let specialType = 'collective_good';
let specialWeek = null;
let specialChart = null;

let token = null;
let isAdmin = false;
let currentTab = 'school';

// ===== Tính điểm =====
function calcSDB(good, fair, total) {
  if (!total) return 0;
  return (good * 100 + fair * 50) / total;
}
function calcTotal(good, fair, total, redFlag) {
  return calcSDB(good, fair, total) + redFlag;
}

function formatDate(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  }
  const s = String(d);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const day = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${day}/${m}/${y}`;
  }
  return s;
}

function dateKey(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const text = String(value);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const localized = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (localized) {
    return `${localized[3]}-${localized[2].padStart(2, '0')}-${localized[1].padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function flashStatus(msg, isErr) {
  const el = $('status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status ' + (isErr ? 'err' : 'ok');
  clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => {
    el.textContent = '';
    el.className = 'status';
  }, 2500);
}

function typeTitle(text) {
  const el = $('title');
  if (!el) return;
  el.textContent = '';
  el.classList.add('typing');
  let i = 0;
  const t = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) {
      clearInterval(t);
      setTimeout(() => el.classList.remove('typing'), 600);
    }
  }, 50);
}

// ===== Tabs =====
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + tab);
  });
  if (tab === 'school') loadSchool().then(loadSpecial);
  else if (tab === 'myclass') loadMy();
}

document.querySelectorAll('.tabs .tab').forEach(tab => {
  tab.onclick = () => switchTab(tab.dataset.tab);
});

// =================== TAB TOÀN TRƯỜNG ===================
function renderSchoolSkeleton() {
  $('list').innerHTML = Array.from({ length: 5 }).map(() => `
    <div class="skeleton-row">
      <div class="skeleton" style="width:24px;height:16px;"></div>
      <div class="skeleton" style="max-width:120px;"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    </div>
  `).join('');
  $('podium').innerHTML = '';
}

async function loadSchoolWeeks() {
  const res = await fetch(`${API}?action=weeks`);
  const j = await res.json();
  schoolWeeks = j.data || [];
  if (!schoolWeeks.length) {
    $('weekSelect').innerHTML = '<option>Chưa có dữ liệu</option>';
    $('weekRange').textContent = '';
    populateSpecialWeekSelectors();
    return;
  }
  $('weekSelect').innerHTML = schoolWeeks
    .map(w => `<option value="${w.week}">Tuần ${w.week}</option>`)
    .join('');
  if (!schoolWeek || !schoolWeeks.find(w => String(w.week) === String(schoolWeek))) {
    schoolWeek = schoolWeeks[0].week;
  }
  $('weekSelect').value = schoolWeek;
  updateSchoolWeekRange();
  populateSpecialWeekSelectors();
}

function updateSchoolWeekRange() {
  const w = schoolWeeks.find(x => String(x.week) === String(schoolWeek));
  if (w) $('weekRange').textContent = `${formatDate(w.from)} → ${formatDate(w.to)}`;
}

function populateSpecialWeekSelectors() {
  const select = $('specialWeekSelect');
  const entrySelect = $('spWeek');
  if (!select || !entrySelect) return;
  if (!schoolWeeks.length) {
    select.innerHTML = '<option value="">Chưa có tuần</option>';
    entrySelect.innerHTML = '<option value="">Chưa có tuần</option>';
    specialWeek = null;
    $('specialWeekRange').textContent = '';
    return;
  }
  if (!specialWeek || !schoolWeeks.some(w => String(w.week) === String(specialWeek))) {
    specialWeek = schoolWeeks.some(w => String(w.week) === String(schoolWeek))
      ? schoolWeek
      : schoolWeeks[0].week;
  }
  const options = schoolWeeks
    .map(w => `<option value="${escapeHtml(w.week)}">Tuần ${escapeHtml(w.week)}</option>`)
    .join('');
  select.innerHTML = options;
  entrySelect.innerHTML = options;
  select.value = specialWeek;
  entrySelect.value = specialWeek;
  updateSpecialWeekRange();
}

function updateSpecialWeekRange() {
  const week = schoolWeeks.find(w => String(w.week) === String(specialWeek));
  $('specialWeekRange').textContent = week
    ? `${formatDate(week.from)} → ${formatDate(week.to)}`
    : '';
}

function getSpecialWeekForRecord(record) {
  if (record.week !== undefined && schoolWeeks.some(w => String(w.week) === String(record.week))) {
    return String(record.week);
  }
  const date = dateKey(record.date);
  if (!date) return '';
  const week = schoolWeeks.find(w => {
    const from = dateKey(w.from);
    const to = dateKey(w.to);
    return from && to && date >= from && date <= to;
  });
  return week ? String(week.week) : '';
}

function getSelectedSpecialData() {
  return specialData.filter(record => getSpecialWeekForRecord(record) === String(specialWeek));
}

async function loadSchool() {
  renderSchoolSkeleton();
  try {
    await loadSchoolWeeks();
    const res = await fetch(`${API}?week=${schoolWeek}`);
    const j = await res.json();
    const rows = (j.data || []).slice();
    // Sort theo điểm số giảm dần (chỉ lớp có số lên đầu)
    rows.sort((a, b) => {
      const aN = isNumeric(a.score), bN = isNumeric(b.score);
      if (aN && bN) return Number(b.score) - Number(a.score);
      if (aN) return -1;
      if (bN) return 1;
      return 0;
    });
    schoolData = rows;
    renderSchool();
    flashStatus('Đã cập nhật ' + new Date().toLocaleTimeString('vi-VN'), false);
  } catch (e) {
    $('list').innerHTML = '<div class="empty">Không tải được dữ liệu</div>';
    flashStatus('Lỗi: ' + e.message, true);
  }
}

function renderSchool() {
  renderSchoolPodium();
  renderSchoolList();
  renderSchoolChart();
}

function renderSchoolPodium() {
  const numericRows = schoolData.filter(t => isNumeric(t.score));
  if (!numericRows.length) { $('podium').innerHTML = ''; return; }
  const top3 = numericRows.slice(0, 3);
  const order = [1, 0, 2];
  $('podium').innerHTML = order.filter(i => top3[i]).map(i => {
    const t = top3[i];
    const rank = i + 1;
    return `
      <div class="podium-card rank-${rank}" style="animation-delay:${i * 0.15}s">
        <div class="rank-badge">TOP ${rank}</div>
        <div class="class-name">${escapeHtml(t.class)}</div>
        <div class="score">${fmtScore(t.score)}</div>
        <div class="score-label">điểm</div>
      </div>
    `;
  }).join('');
}

function renderSchoolList() {
  if (!schoolData.length) {
    $('list').innerHTML = '<div class="empty">Tuần này chưa có dữ liệu</div>';
    return;
  }
  const sorted = schoolData.slice().sort((a, b) => compareClassName(a.class, b.class));
  const numericRows = schoolData.filter(t => isNumeric(t.score));
  const ranks = numericRows.slice().sort((a, b) => Number(b.score) - Number(a.score));
  const rankOf = new Map(ranks.map((t, i) => [t.class, i + 1]));

  $('list').innerHTML = sorted.map(t => {
    const rank = rankOf.get(t.class);
    const topClass = rank && rank <= 3 ? `top-${rank}` : '';
    const scoreIsNum = isNumeric(t.score);
    const scoreIsEmpty = (t.score === '' || t.score === null || t.score === undefined);
    const scoreClass = scoreIsNum ? '' : (scoreIsEmpty ? 'empty-score' : 'text-score');
    return `
      <div class="row ${topClass}">
        <div class="rank">${rank || '—'}</div>
        <div class="class-name">${escapeHtml(t.class)}</div>
        <div class="sub-score">${formatDate(t.from)}</div>
        <div class="sub-score">${formatDate(t.to)}</div>
        <div class="total-score ${scoreClass}">${fmtScore(t.score)}</div>
        <div class="actions ${isAdmin ? 'show' : ''}">
          <button class="mini-btn" onclick="editSchool(${t.row})">Sửa</button>
          <button class="mini-btn danger" onclick="deleteSchool(${t.row})">Xóa</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSchoolChart() {
  if (typeof Chart === 'undefined') return;
  const ctx = $('chart');
  if (!ctx) return;

  const numericData = schoolData.filter(t => isNumeric(t.score));
  if (!numericData.length) {
    if (chart) { chart.destroy(); chart = null; }
    return;
  }

  const sortedByClass = numericData.slice().sort((a, b) => compareClassName(a.class, b.class));
  const labels = sortedByClass.map(t => t.class);
  const values = sortedByClass.map(t => Number(t.score));

  const ranks = numericData.slice().sort((a, b) => Number(b.score) - Number(a.score));
  const rankOf = new Map(ranks.map((t, i) => [t.class, i]));

  const colors = labels.map(lbl => {
    const r = rankOf.get(lbl);
    if (r === 0) return 'rgba(189,129,33,.85)';
    if (r === 1) return 'rgba(100,123,119,.75)';
    if (r === 2) return 'rgba(184,94,72,.8)';
    return 'rgba(36,104,91,.7)';
  });
  const borders = labels.map(lbl => {
    const r = rankOf.get(lbl);
    if (r === 0) return '#bd8121';
    if (r === 1) return '#647b77';
    if (r === 2) return '#b85e48';
    return '#24685b';
  });

  if (chart) { chart.destroy(); chart = null; }

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Điểm thi đua',
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
        borderRadius: 5,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#203735',
          borderColor: '#d6e1dc',
          borderWidth: 1,
          titleColor: '#fbfcfa',
          bodyColor: '#fbfcfa',
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: c => ' ' + c.parsed.y + ' điểm' },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#647b77',
            font: { size: 11 },
            autoSkip: false,
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(32,55,53,.1)' },
          ticks: { color: '#647b77', font: { size: 12 }, precision: 0 },
        },
      },
    },
  });
}

// =================== TAB LỚP T ===================
async function loadMyWeeks() {
  const res = await fetch(`${API}?action=myweeks`);
  const j = await res.json();
  myWeeks = j.data || [];
  if (!myWeeks.length) {
    $('myWeekSelect').innerHTML = '<option>Chưa có dữ liệu</option>';
    $('myWeekRange').textContent = '';
    return;
  }
  $('myWeekSelect').innerHTML = myWeeks
    .map(w => `<option value="${w.week}">Tuần ${w.week}</option>`)
    .join('');
  if (!myWeek || !myWeeks.find(w => String(w.week) === String(myWeek))) {
    myWeek = myWeeks[0].week;
  }
  $('myWeekSelect').value = myWeek;
  updateMyWeekRange();
}

function updateMyWeekRange() {
  const w = myWeeks.find(x => String(x.week) === String(myWeek));
  if (w) $('myWeekRange').textContent = `${formatDate(w.from)} → ${formatDate(w.to)}`;
}

async function loadMy() {
  $('myList').innerHTML = Array.from({ length: 3 }).map(() => `
    <div class="skeleton-row">
      <div class="skeleton" style="width:24px;height:16px;"></div>
      <div class="skeleton" style="max-width:120px;"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    </div>
  `).join('');

  try {
    await loadMyWeeks();
    const res = await fetch(`${API}?action=myclass`);
    const j = await res.json();
    myData = (j.data || []).map(r => ({
      ...r,
      sdb: calcSDB(r.good, r.fair, r.total),
      totalScore: calcTotal(r.good, r.fair, r.total, r.redFlag),
    }));
    myData.sort((a, b) => Number(a.week) - Number(b.week));
    renderMy();
    flashStatus('Đã cập nhật ' + new Date().toLocaleTimeString('vi-VN'), false);
  } catch (e) {
    $('myList').innerHTML = '<div class="empty">Không tải được dữ liệu</div>';
    flashStatus('Lỗi: ' + e.message, true);
  }
}

function renderMy() {
  const cur = myData.find(d => String(d.week) === String(myWeek));
  if (cur) {
    animateValue($('mySdb'), fmtNum(cur.sdb));
    animateValue($('myRed'), fmtNum(cur.redFlag));
    animateValue($('myTotal'), fmtNum(cur.totalScore));
  } else {
    $('mySdb').textContent = '—';
    $('myRed').textContent = '—';
    $('myTotal').textContent = '—';
  }
  renderMyList();
  renderMyChart();
}

function animateValue(el, newText) {
  if (!el) return;
  if (el.textContent === newText) return;
  el.textContent = newText;
  el.classList.remove('anim');
  void el.offsetWidth;
  el.classList.add('anim');
}

function renderMyList() {
  if (!myData.length) {
    $('myList').innerHTML = '<div class="empty">Chưa có dữ liệu</div>';
    return;
  }
  const sorted = myData.slice().sort((a, b) => Number(b.week) - Number(a.week));
  $('myList').innerHTML = sorted.map((t, i) => `
    <div class="row" style="animation-delay:${Math.min(i * 0.03, 0.4)}s">
      <div class="rank">T${t.week}</div>
      <div class="class-name">Tuần ${t.week}</div>
      <div class="sub-score">SĐB ${fmtNum(t.sdb)}</div>
      <div class="sub-score">Cờ đỏ ${fmtNum(t.redFlag)}</div>
      <div class="total-score">${fmtNum(t.totalScore)}</div>
      <div class="actions ${isAdmin ? 'show' : ''}">
        <button class="mini-btn" onclick="editMy(${t.row})">Sửa</button>
        <button class="mini-btn danger" onclick="deleteMy(${t.row})">Xóa</button>
      </div>
    </div>
  `).join('');
}

function renderMyChart() {
  if (typeof Chart === 'undefined') return;
  const ctx = $('myChart');
  if (!ctx) return;
  if (!myData.length) {
    if (myChart) { myChart.destroy(); myChart = null; }
    return;
  }
  const labels = myData.map(t => 'Tuần ' + t.week);
  const values = myData.map(t => Math.round(t.totalScore * 100) / 100);

  if (myChart) { myChart.destroy(); myChart = null; }

  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Điểm thi đua',
        data: values,
        borderColor: '#24685b',
        backgroundColor: 'rgba(36,104,91,.14)',
        borderWidth: 2,
        pointBackgroundColor: '#24685b',
        pointBorderColor: '#fbfcfa',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#203735',
          borderColor: '#d6e1dc',
          borderWidth: 1,
          titleColor: '#fbfcfa',
          bodyColor: '#fbfcfa',
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: c => ' ' + c.parsed.y + ' điểm' },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#647b77', font: { size: 12 } } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(32,55,53,.1)' },
          ticks: { color: '#647b77', font: { size: 12 } },
        },
      },
    },
  });
}

// =================== SPECIAL ===================
async function loadSpecial() {
  $('specialRankingSection').hidden = true;
  $('specialList').innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="skeleton-row">
      <div class="skeleton" style="width:24px;height:16px;"></div>
      <div class="skeleton" style="max-width:120px;"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    </div>
  `).join('');
  try {
    if (!schoolWeeks.length) await loadSchoolWeeks();
    const res = await fetch(`${API}?action=special&type=${encodeURIComponent(specialType)}`);
    const j = await res.json();
    specialData = j.data || [];
    renderSpecial();
    flashStatus('Đã cập nhật ' + new Date().toLocaleTimeString('vi-VN'), false);
  } catch (e) {
    $('specialList').innerHTML = '<div class="empty">Không tải được dữ liệu</div>';
    flashStatus('Lỗi: ' + e.message, true);
  }
}

function renderSpecial() {
  renderSpecialList();
  renderSpecialRanking();
  renderSpecialChart();
  updateSpecialTabStyles();
}

function updateSpecialTabStyles() {
  document.querySelectorAll('.special-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.type === specialType);
  });
}

function renderSpecialList() {
  const weeklyData = getSelectedSpecialData();
  if (!weeklyData.length) {
    $('specialList').innerHTML = `<div class="empty">Tuần ${escapeHtml(specialWeek || '')} chưa có dữ liệu cho mục này</div>`;
    return;
  }
  const sorted = weeklyData.slice().sort((a, b) => {
    return b.row - a.row;
  });

  $('specialList').innerHTML = sorted.map(t => {
    const cls = t.class ? escapeHtml(t.class) : '';
    const student = t.student ? ` – ${escapeHtml(t.student)}` : '';
    const pointClass = t.point >= 0 ? 'point-plus' : 'point-minus';
    const pointText = (t.point >= 0 ? '+' : '') + t.point;
    return `
      <div class="special-row">
        <div class="special-date">Tuần ${escapeHtml(specialWeek || '')}</div>
        <div class="special-main">
          <div class="special-title">
            ${cls}${student}
            <span class="special-point ${pointClass}">${pointText}</span>
          </div>
          <div class="special-content">${escapeHtml(t.content)}</div>
        </div>
        <div class="actions ${isAdmin ? 'show' : ''}">
          <button class="mini-btn" onclick="editSpecial(${t.row})">Sửa</button>
          <button class="mini-btn danger" onclick="deleteSpecial(${t.row})">Xóa</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSpecialRanking() {
  const section = $('specialRankingSection');
  const list = $('specialRanking');
  if (specialType !== 'personal_good') {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const totals = new Map();
  getSelectedSpecialData().forEach(record => {
    const student = String(record.student || '').trim();
    if (!student) return;
    const className = String(record.class || '').trim();
    const key = `${className.toLocaleLowerCase()}|${student.toLocaleLowerCase()}`;
    const current = totals.get(key) || { className, student, points: 0, records: 0 };
    current.points += Number(record.point) || 0;
    current.records += 1;
    totals.set(key, current);
  });
  const ranked = Array.from(totals.values()).sort((a, b) =>
    b.points - a.points
    || compareClassName(a.className, b.className)
    || a.student.localeCompare(b.student, 'vi')
  );
  $('specialRankingNote').textContent = `${Math.min(6, ranked.length)} học sinh dẫn đầu · cộng dồn điểm tuyên dương trong tuần`;
  if (!ranked.length) {
    list.innerHTML = `<div class="empty">Tuần ${escapeHtml(specialWeek || '')} chưa có điểm tuyên dương cá nhân để xếp hạng</div>`;
    return;
  }
  list.innerHTML = ranked.map((student, index) => {
    const award = index === 0
      ? { name: 'Giải nhất', className: 'award-first' }
      : index < 3
        ? { name: 'Giải nhì', className: 'award-second' }
        : index < 6
          ? { name: 'Giải ba', className: 'award-third' }
          : null;
    return `
      <div class="ranking-row ${award ? `ranking-featured ${award.className}` : ''}">
        <div class="ranking-rank">
          <span class="ranking-place">${index + 1}</span>
          ${award ? `<span class="ranking-award">${award.name}</span>` : ''}
        </div>
        <div class="ranking-student">
          <strong>${escapeHtml(student.student)}</strong>
          <span>${escapeHtml(student.class || 'Chưa có lớp')} · ${student.records} lượt tuyên dương</span>
        </div>
        <div class="ranking-points">${fmtNum(student.points)} <span>điểm</span></div>
      </div>
    `;
  }).join('');
}

function renderSpecialChart() {
  if (typeof Chart === 'undefined') return;
  const ctx = $('specialChart');
  if (!ctx) return;

  const weeklyData = getSelectedSpecialData();
  if (!weeklyData.length) {
    if (specialChart) { specialChart.destroy(); specialChart = null; }
    return;
  }

  const byClass = {};
  weeklyData.forEach(t => {
    if (!t.class) return;
    byClass[t.class] = (byClass[t.class] || 0) + t.point;
  });
  const labels = Object.keys(byClass).sort((a, b) => compareClassName(a, b));
  const values = labels.map(l => byClass[l]);

  const colors = values.map(v => v >= 0 ? 'rgba(52,122,81,.72)' : 'rgba(179,78,69,.72)');
  const borders = values.map(v => v >= 0 ? '#347a51' : '#b34e45');

  if (specialChart) { specialChart.destroy(); specialChart = null; }

  specialChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Điểm cộng/trừ',
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
        borderRadius: 5,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#203735',
          borderColor: '#d6e1dc',
          borderWidth: 1,
          titleColor: '#fbfcfa',
          bodyColor: '#fbfcfa',
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: c => ' ' + (c.parsed.y >= 0 ? '+' : '') + c.parsed.y + ' điểm' },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#647b77', font: { size: 11 }, autoSkip: false, maxRotation: 45 },
        },
        y: {
          grid: { color: 'rgba(32,55,53,.1)' },
          ticks: { color: '#647b77', font: { size: 12 }, precision: 0 },
        },
      },
    },
  });
}

document.querySelectorAll('.special-tab').forEach(btn => {
  btn.onclick = () => {
    specialType = btn.dataset.type;
    updateSpecialTabStyles();
    loadSpecial();
  };
});

$('specialWeekSelect').addEventListener('change', e => {
  specialWeek = e.target.value;
  $('spWeek').value = specialWeek;
  updateSpecialWeekRange();
  renderSpecial();
});

$('spWeek').addEventListener('change', e => {
  specialWeek = e.target.value;
  $('specialWeekSelect').value = specialWeek;
  updateSpecialWeekRange();
  renderSpecial();
});

// =================== ADMIN ===================
$('adminBtn').onclick = () => {
  if (isAdmin) {
    token = null;
    isAdmin = false;
    $('adminBtn').textContent = 'Đăng nhập admin';
    $('adminBtn').classList.remove('active');
    $('addFormSchool').classList.remove('show');
    $('addFormMy').classList.remove('show');
    $('addFormSpecial').classList.remove('show');
    $('tabMyClass').classList.add('hidden');
    if (currentTab === 'myclass') switchTab('school');
    renderSchoolList();
    renderMyList();
    renderSpecialList();
    flashStatus('Đã đăng xuất', false);
  } else {
    $('modalBg').classList.add('show');
    setTimeout(() => $('pw').focus(), 100);
  }
};

$('btnCancel').onclick = () => {
  $('modalBg').classList.remove('show');
  $('pw').value = '';
};

$('modalBg').onclick = e => {
  if (e.target === $('modalBg')) $('btnCancel').click();
};

$('pw').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btnLogin').click();
});

$('btnLogin').onclick = async () => {
  const pw = $('pw').value;
  if (!pw) return;
  $('btnLogin').disabled = true;
  $('btnLogin').textContent = 'Đang kiểm tra...';

  try {
    const res = await fetch(`${API}?action=verify&password=${encodeURIComponent(pw)}`);
    const j = await res.json();
    if (j.ok && j.token) {
      token = j.token;
      isAdmin = true;
      $('adminBtn').textContent = 'Admin đang đăng nhập';
      $('adminBtn').classList.add('active');
      $('addFormSchool').classList.add('show');
      $('addFormMy').classList.add('show');
      $('addFormSpecial').classList.add('show');
      $('tabMyClass').classList.remove('hidden');
      $('modalBg').classList.remove('show');
      $('pw').value = '';

      const ws = schoolWeeks.find(x => String(x.week) === String(schoolWeek));
      if (ws) {
        $('fsWeek').value = ws.week;
        $('fsFrom').value = String(ws.from).slice(0, 10);
        $('fsTo').value = String(ws.to).slice(0, 10);
      }
      $('spWeek').value = specialWeek || schoolWeek || '';
      renderSchoolList();
      renderMyList();
      renderSpecialList();
      flashStatus('Đăng nhập thành công', false);
    } else {
      flashStatus('Sai mật khẩu', true);
      $('pw').value = '';
      $('pw').focus();
    }
  } catch (e) {
    flashStatus('Lỗi: ' + e.message, true);
  } finally {
    $('btnLogin').disabled = false;
    $('btnLogin').textContent = 'Đăng nhập';
  }
};

async function post(body) {
  const url = `${API}?action=${encodeURIComponent(body.action)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, token }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Request failed');
  return j;
}

// =================== TỰ ĐỘNG ĐIỀN TUẦN & NGÀY ===================
// Tìm tuần gần nhất có dữ liệu (trước tuần đang nhập)
function findPreviousWeek(currentWeekNum) {
  const sorted = schoolWeeks.slice().sort((a, b) => b.week - a.week);
  for (const w of sorted) {
    if (Number(w.week) < Number(currentWeekNum)) return w;
  }
  return null;
}

// Khi admin nhập tuần → tự điền ngày (thứ 2 → chủ nhật)
function autoFillWeekDates() {
  const weekInput = $('fsWeek');
  const w = Number(weekInput.value);
  if (!w) return;

  // 1. Nếu tuần này đã có dữ liệu → điền từ dữ liệu cũ
  const existing = schoolWeeks.find(x => Number(x.week) === w);
  if (existing) {
    $('fsFrom').value = String(existing.from).slice(0, 10);
    $('fsTo').value = String(existing.to).slice(0, 10);
    return;
  }

  // 2. Nếu chưa có → lấy tuần trước đó
  //    from mới = to cũ + 1 ngày (thứ 2 tuần sau)
  //    to mới = from mới + 6 ngày (chủ nhật)
  const prev = findPreviousWeek(w);
  if (prev) {
    const newFrom = addDays(prev.to, 1);
    const newTo = addDays(newFrom, 6);
    $('fsFrom').value = newFrom;
    $('fsTo').value = newTo;
  }
  // 3. Nếu chưa có tuần nào → để trống cho admin tự nhập
}

// Gắn sự kiện cho ô Tuần
$('fsWeek').addEventListener('change', autoFillWeekDates);
$('fsWeek').addEventListener('input', autoFillWeekDates);

// =================== SAO CHÉP LỚP TỪ TUẦN TRƯỚC ===================
async function copyClassesFromPreviousWeek() {
  const w = Number($('fsWeek').value);
  if (!w) {
    flashStatus('Vui lòng nhập tuần trước', true);
    return;
  }
  const from = $('fsFrom').value;
  const to = $('fsTo').value;
  if (!from || !to) {
    flashStatus('Vui lòng nhập ngày trước', true);
    return;
  }

  const prev = findPreviousWeek(w);
  if (!prev) {
    flashStatus('Chưa có tuần nào trước đó để sao chép', true);
    return;
  }

  // Lấy danh sách lớp của tuần trước
  let prevData = [];
  try {
    const res = await fetch(`${API}?week=${prev.week}`);
    const j = await res.json();
    prevData = j.data || [];
  } catch (e) {
    flashStatus('Lỗi tải dữ liệu tuần trước: ' + e.message, true);
    return;
  }

  if (!prevData.length) {
    flashStatus('Tuần trước không có lớp nào', true);
    return;
  }

  // Kiểm tra tuần hiện tại đã có lớp nào chưa
  const curData = schoolData.filter(t => Number(t.week) === w);
  const curClasses = new Set(curData.map(t => String(t.class)));

  // Những lớp cần thêm (chưa có trong tuần hiện tại)
  const toAdd = prevData.filter(t => !curClasses.has(String(t.class)));

  if (!toAdd.length) {
    flashStatus('Tất cả lớp đã có trong tuần này rồi', false);
    return;
  }

  if (!confirm(`Sẽ thêm ${toAdd.length} lớp từ tuần ${prev.week} vào tuần ${w} với điểm "Chưa nhập".\nTiếp tục?`)) return;

  $('btnCopyClasses').disabled = true;
  $('btnCopyClasses').textContent = 'Đang sao chép...';

  let ok = 0, fail = 0;
  for (const t of toAdd) {
    try {
      await post({
        action: 'addSchool',
        week: w,
        from: from,
        to: to,
        class: t.class,
        score: '',   // điểm trống
      });
      ok++;
    } catch (e) {
      fail++;
      console.error('Lỗi thêm lớp', t.class, e);
    }
  }

  $('btnCopyClasses').disabled = false;
  $('btnCopyClasses').textContent = '📋 Sao chép danh sách lớp từ tuần trước';

  await loadSchool();
  flashStatus(`Đã sao chép ${ok} lớp${fail ? `, lỗi ${fail}` : ''}`, fail > 0);
}

$('btnCopyClasses').addEventListener('click', copyClassesFromPreviousWeek);

// =================== CRUD TOÀN TRƯỜNG ===================
$('addFormSchool').addEventListener('submit', async e => {
  e.preventDefault();
  if (!isAdmin) return;
  const rawScore = $('fsScore').value.trim();
  const payload = {
    action: 'addSchool',
    week: $('fsWeek').value,
    from: $('fsFrom').value,
    to: $('fsTo').value,
    class: $('fsClass').value.trim(),
    score: rawScore === '' ? '' : (isNumeric(rawScore) ? Number(rawScore) : rawScore),
  };
  $('btnAddSchool').disabled = true;
  $('btnAddSchool').textContent = 'Đang thêm...';
  try {
    await post(payload);
    $('fsClass').value = '';
    $('fsScore').value = '';
    await loadSchool();
    flashStatus('Đã thêm', false);
  } catch (err) {
    flashStatus('Lỗi: ' + err.message, true);
  } finally {
    $('btnAddSchool').disabled = false;
    $('btnAddSchool').textContent = 'Thêm';
  }
});

window.editSchool = async function(row) {
  if (!isAdmin) return;
  const t = schoolData.find(x => x.row === row);
  if (!t) return;
  const cls = prompt('Tên lớp:', t.class);
  if (cls === null) return;
  const scoreRaw = prompt('Điểm thi đua (số, chữ, hoặc để trống):', t.score);
  if (scoreRaw === null) return;
  const scoreVal = scoreRaw.trim() === '' ? '' : (isNumeric(scoreRaw.trim()) ? Number(scoreRaw.trim()) : scoreRaw.trim());
  try {
    await post({
      action: 'updateSchool', row,
      week: t.week, from: t.from, to: t.to,
      class: cls, score: scoreVal,
    });
    await loadSchool();
    flashStatus('Đã cập nhật', false);
  } catch (e) { flashStatus('Lỗi: ' + e.message, true); }
};

window.deleteSchool = async function(row) {
  if (!isAdmin) return;
  if (!confirm('Xóa dòng này?')) return;
  try {
    await post({ action: 'deleteSchool', row });
    await loadSchool();
    flashStatus('Đã xóa', false);
  } catch (e) { flashStatus('Lỗi: ' + e.message, true); }
};

// =================== CRUD LỚP T ===================
$('addFormMy').addEventListener('submit', async e => {
  e.preventDefault();
  if (!isAdmin) return;
  const payload = {
    action: 'addMy',
    week: $('fmWeek').value,
    from: $('fmFrom').value,
    to: $('fmTo').value,
    good: Number($('fmGood').value),
    fair: Number($('fmFair').value),
    total: Number($('fmTotal').value),
    redFlag: Number($('fmRed').value),
  };
  $('btnAddMy').disabled = true;
  $('btnAddMy').textContent = 'Đang thêm...';
  try {
    await post(payload);
    $('fmGood').value = '';
    $('fmFair').value = '';
    $('fmTotal').value = '';
    $('fmRed').value = '';
    await loadMy();
    flashStatus('Đã thêm', false);
  } catch (err) {
    flashStatus('Lỗi: ' + err.message, true);
  } finally {
    $('btnAddMy').disabled = false;
    $('btnAddMy').textContent = 'Thêm';
  }
});

window.editMy = async function(row) {
  if (!isAdmin) return;
  const t = myData.find(x => x.row === row);
  if (!t) return;
  const good = prompt('Số giờ tốt:', t.good);
  if (good === null) return;
  const fair = prompt('Số giờ khá:', t.fair);
  if (fair === null) return;
  const total = prompt('Tổng số tiết:', t.total);
  if (total === null) return;
  const redFlag = prompt('Điểm cờ đỏ:', t.redFlag);
  if (redFlag === null) return;
  try {
    await post({
      action: 'updateMy', row,
      week: t.week, from: t.from, to: t.to,
      good: Number(good), fair: Number(fair),
      total: Number(total), redFlag: Number(redFlag),
    });
    await loadMy();
    flashStatus('Đã cập nhật', false);
  } catch (e) { flashStatus('Lỗi: ' + e.message, true); }
};

window.deleteMy = async function(row) {
  if (!isAdmin) return;
  if (!confirm('Xóa dòng này?')) return;
  try {
    await post({ action: 'deleteMy', row });
    await loadMy();
    flashStatus('Đã xóa', false);
  } catch (e) { flashStatus('Lỗi: ' + e.message, true); }
};

// =================== CRUD SPECIAL ===================
$('addFormSpecial').addEventListener('submit', async e => {
  e.preventDefault();
  if (!isAdmin) return;
  const week = schoolWeeks.find(w => String(w.week) === String($('spWeek').value));
  const weekStart = week ? dateKey(week.from) : '';
  if (!weekStart) {
    flashStatus('Tuần đã chọn chưa có ngày bắt đầu. Hãy tạo tuần ở phần thi đua trước.', true);
    return;
  }
  const payload = {
    action: 'addSpecial',
    type: specialType,
    class: $('spClass').value.trim(),
    student: $('spStudent').value.trim(),
    content: $('spContent').value.trim(),
    date: weekStart,
    point: Number($('spPoint').value),
  };
  $('btnAddSpecial').disabled = true;
  $('btnAddSpecial').textContent = 'Đang thêm...';
  try {
    await post(payload);
    $('spClass').value = '';
    $('spStudent').value = '';
    $('spContent').value = '';
    $('spPoint').value = '';
    await loadSpecial();
    flashStatus('Đã thêm', false);
  } catch (err) {
    flashStatus('Lỗi: ' + err.message, true);
  } finally {
    $('btnAddSpecial').disabled = false;
    $('btnAddSpecial').textContent = 'Thêm';
  }
});

window.editSpecial = async function(row) {
  if (!isAdmin) return;
  const t = specialData.find(x => x.row === row);
  if (!t) return;
  const cls = prompt('Lớp:', t.class); if (cls === null) return;
  const student = prompt('Học sinh (để trống nếu tập thể):', t.student); if (student === null) return;
  const content = prompt('Nội dung:', t.content); if (content === null) return;
  const currentWeek = getSpecialWeekForRecord(t);
  const weekNumber = prompt('Tuần:', currentWeek); if (weekNumber === null) return;
  const week = schoolWeeks.find(w => String(w.week) === String(weekNumber.trim()));
  if (!week) {
    flashStatus('Tuần không tồn tại. Hãy chọn một tuần đã được tạo.', true);
    return;
  }
  const date = dateKey(week.from);
  if (!date) {
    flashStatus('Tuần đã chọn chưa có ngày bắt đầu.', true);
    return;
  }
  const point = prompt('Điểm (+/-):', t.point); if (point === null) return;
  try {
    await post({
      action: 'updateSpecial', row,
      type: t.type, class: cls, student, content, date, point: Number(point),
    });
    await loadSpecial();
    flashStatus('Đã cập nhật', false);
  } catch (e) { flashStatus('Lỗi: ' + e.message, true); }
};

window.deleteSpecial = async function(row) {
  if (!isAdmin) return;
  if (!confirm('Xóa dòng này?')) return;
  try {
    await post({ action: 'deleteSpecial', row });
    await loadSpecial();
    flashStatus('Đã xóa', false);
  } catch (e) { flashStatus('Lỗi: ' + e.message, true); }
};

// =================== Week selectors ===================
$('weekSelect').onchange = e => {
  schoolWeek = e.target.value;
  updateSchoolWeekRange();
  (async () => {
    renderSchoolSkeleton();
    try {
      const res = await fetch(`${API}?week=${schoolWeek}`);
      const j = await res.json();
      const rows = (j.data || []).slice();
      rows.sort((a, b) => {
        const aN = isNumeric(a.score), bN = isNumeric(b.score);
        if (aN && bN) return Number(b.score) - Number(a.score);
        if (aN) return -1;
        if (bN) return 1;
        return 0;
      });
      schoolData = rows;
      renderSchool();
    } catch (err) { flashStatus('Lỗi: ' + err.message, true); }
  })();
};

$('myWeekSelect').onchange = e => {
  myWeek = e.target.value;
  updateMyWeekRange();
  renderMy();
};

// =================== Export ===================
$('btnCsv').onclick = () => {
  if (!schoolData.length) { flashStatus('Không có dữ liệu để xuất', true); return; }
  const w = schoolWeeks.find(x => String(x.week) === String(schoolWeek));
  const header = ['Hạng', 'Lớp', 'Điểm thi đua'];
  const sorted = schoolData.slice().sort((a, b) => compareClassName(a.class, b.class));
  const numericRows = schoolData.filter(t => isNumeric(t.score));
  const ranks = numericRows.slice().sort((a, b) => Number(b.score) - Number(a.score));
  const rankOf = new Map(ranks.map((t, i) => [t.class, i + 1]));
  const rows = sorted.map(t => [
    rankOf.get(t.class) || '—',
    t.class,
    (t.score === '' || t.score === null || t.score === undefined) ? 'Chưa nhập' : t.score
  ]);
  const meta = [
    [`Bảng xếp hạng thi đua tuần ${schoolWeek}`],
    [`Từ ${formatDate(w?.from)} đến ${formatDate(w?.to)}`],
    [],
  ];
  const csv = [...meta, header, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thi-dua-tuan-${schoolWeek}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  flashStatus('Đã xuất CSV', false);
};

$('btnPdf').onclick = () => {
  if (!schoolData.length) { flashStatus('Không có dữ liệu để xuất', true); return; }
  const w = schoolWeeks.find(x => String(x.week) === String(schoolWeek));
  const printHeader = document.createElement('div');
  printHeader.className = 'print-header';
  printHeader.innerHTML = `
    Bảng xếp hạng thi đua tuần ${schoolWeek}<br>
    <span style="font-size:12px;font-weight:400;">
      Từ ${formatDate(w?.from)} đến ${formatDate(w?.to)}
    </span>
  `;
  document.querySelector('.wrap').prepend(printHeader);
  setTimeout(() => {
    window.print();
    setTimeout(() => printHeader.remove(), 500);
  }, 300);
};

// =================== Init ===================
typeTitle('Sổ thi đua');
switchTab('school');
