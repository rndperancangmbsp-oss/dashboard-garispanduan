(() => {
  'use strict';

  const state = {
    records: [],
    filtered: [],
    page: 1,
    pageSize: 15,
    sortKey: 'tajuk',
    sortDir: 'asc',
    filters: { search: '', kategori: '', subKategori: '', jabatan: '', kelulusan: '', year: '', hashtag: '' },
    preview: Boolean(window.GP_PREVIEW_MODE),
  };

  const $ = (id) => document.getElementById(id);
  const filterEls = {
    search: $('searchInput'),
    kategori: $('categoryFilter'),
    subKategori: $('subCategoryFilter'),
    jabatan: $('departmentFilter'),
    kelulusan: $('approvalFilter'),
    year: $('yearFilter'),
    hashtag: $('hashtagFilter'),
  };

  const FIELD_CONFIG = [
    { name: 'ID', title: 'ID', type: 'Any', optional: false, description: 'Kod unik rekod.' },
    { name: 'Kategori', title: 'KATEGORI', type: 'Any', optional: false },
    { name: 'SubKategori', title: 'SUB KATEGORI', type: 'Any', optional: false },
    { name: 'Tajuk', title: 'TAJUK', type: 'Any', optional: false },
    { name: 'Sinopsis', title: 'SIPNOPSIS', type: 'Any', optional: true },
    { name: 'Link', title: 'LINK', type: 'Any', optional: true },
    { name: 'Jabatan', title: 'JABATAN', type: 'Any', optional: true },
    { name: 'Kelulusan', title: 'KELULUSAN', type: 'Any', optional: true },
    { name: 'Tarikh', title: 'TARIKH', type: 'Any', optional: true },
    { name: 'Hashtag', title: 'HASHTAG', type: 'Any', optional: true },
  ];

  // Fallback pemetaan untuk jadual yang menggunakan tajuk/ID kolum berbeza.
  // Ini membolehkan widget membaca data walaupun pemetaan Grist belum disimpan
  // atau mapColumnNames tidak memproses keseluruhan array rekod.
  const FIELD_ALIASES = {
    ID: ['id', 'kod', 'kodid', 'idgarispanduan'],
    Kategori: ['kategori', 'category'],
    SubKategori: ['subkategori', 'subkategory', 'subcategory'],
    Tajuk: ['tajuk', 'title', 'namadokumen', 'namagarispanduan'],
    Sinopsis: ['sinopsis', 'sipnopsis', 'penerangan', 'ringkasan', 'description'],
    Link: ['link', 'pautan', 'url', 'dokumen'],
    Jabatan: ['jabatan', 'agensi', 'jabatanagensi', 'department'],
    Kelulusan: ['kelulusan', 'approval', 'statuskelulusan'],
    Tarikh: ['tarikh', 'date', 'tarikhkelulusan'],
    Hashtag: ['hashtag', 'tag', 'katakunci', 'keywords'],
  };

  function normalizeKey(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function autoMapRecord(raw) {
    const output = {};
    const entries = Object.entries(raw || {}).map(([key, value]) => [normalizeKey(key), value]);
    FIELD_CONFIG.forEach((field) => {
      const accepted = new Set([
        normalizeKey(field.name),
        normalizeKey(field.title),
        ...(FIELD_ALIASES[field.name] || []).map(normalizeKey),
      ]);
      const match = entries.find(([key]) => accepted.has(key));
      if (match) output[field.name] = match[1];
    });
    return output;
  }


  function safeText(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
      const arr = value[0] === 'L' ? value.slice(1) : value;
      return arr.map(safeText).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') return String(value.value ?? value.display ?? value.name ?? '').trim();
    return String(value).trim();
  }

  function parseList(value) {
    if (Array.isArray(value)) {
      const arr = value[0] === 'L' ? value.slice(1) : value;
      return arr.map(safeText).map(v => v.replace(/^#/, '').trim()).filter(Boolean);
    }
    const text = safeText(value);
    if (!text) return [];
    return text.split(/[,;|\n]+/).map(v => v.replace(/^#/, '').trim()).filter(Boolean);
  }

  function parseDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number') {
      const ms = Math.abs(value) < 1e11 ? value * 1000 : value;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const text = safeText(value);
    if (!text) return null;
    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime())) return direct;
    const m = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += y < 50 ? 2000 : 1900;
      const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? new Date(Number(yearMatch[0]), 0, 1) : null;
  }

  function formatDate(date, raw = '') {
    if (date) return new Intl.DateTimeFormat('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    return raw || '—';
  }

  function escapeHtml(value) {
    return safeText(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function validUrl(value) {
    const text = safeText(value);
    if (!text) return '';
    try {
      const url = new URL(text, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function consolidateApproval(value) {
    const text = safeText(value).toLowerCase();
    if (!text) return 'Tiada Rekod';
    if (text.includes('majlis penuh')) return 'Majlis Penuh';
    if (text.includes('spc') || text.includes('jawatankuasa perancang negeri')) return 'SPC / JPN';
    if (text.includes('mmk') || text.includes('majlis mesyuarat kerajaan')) return 'MMK';
    if (text.includes('warta')) return 'Warta Kerajaan';
    if (text.includes('belum') || text.includes('perlu pengesahan') || text.includes('tidak dinyatakan')) return 'Perlu Pengesahan';
    if (text.includes('jabatan') || text.includes('mbsp')) return 'Jabatan / MBSP';
    return 'Lain-lain';
  }

  function normalizeRecord(record) {
    const tarikh = parseDate(record.Tarikh);
    const hashtags = parseList(record.Hashtag).slice(0, 20);
    const normalized = {
      rowId: record.id ?? record.ID ?? null,
      id: safeText(record.ID),
      kategori: safeText(record.Kategori),
      subKategori: safeText(record.SubKategori),
      tajuk: safeText(record.Tajuk),
      sinopsis: safeText(record.Sinopsis),
      link: validUrl(record.Link),
      linkRaw: safeText(record.Link),
      jabatan: safeText(record.Jabatan),
      kelulusan: safeText(record.Kelulusan),
      approvalGroup: consolidateApproval(record.Kelulusan),
      tarikh,
      tarikhRaw: safeText(record.Tarikh),
      year: tarikh ? tarikh.getFullYear() : '',
      hashtags,
    };
    normalized.searchText = [
      normalized.id, normalized.kategori, normalized.subKategori, normalized.tajuk,
      normalized.sinopsis, normalized.jabatan, normalized.kelulusan, hashtags.join(' '),
    ].join(' ').toLowerCase();
    return normalized;
  }

  function uniqueValues(records, key) {
    return [...new Set(records.map(r => safeText(r[key])).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ms', { sensitivity: 'base', numeric: true }));
  }

  function updateSelect(select, values, placeholder, currentValue = '') {
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    if (values.includes(currentValue)) select.value = currentValue;
  }

  function refreshFilterOptions() {
    updateSelect(filterEls.kategori, uniqueValues(state.records, 'kategori'), 'Semua kategori', state.filters.kategori);
    const subSource = state.filters.kategori ? state.records.filter(r => r.kategori === state.filters.kategori) : state.records;
    updateSelect(filterEls.subKategori, uniqueValues(subSource, 'subKategori'), 'Semua subkategori', state.filters.subKategori);
    updateSelect(filterEls.jabatan, uniqueValues(state.records, 'jabatan'), 'Semua jabatan', state.filters.jabatan);
    updateSelect(filterEls.kelulusan, uniqueValues(state.records, 'approvalGroup'), 'Semua kelulusan', state.filters.kelulusan);
    const years = [...new Set(state.records.map(r => r.year).filter(Boolean))].sort((a, b) => b - a).map(String);
    updateSelect(filterEls.year, years, 'Semua tahun', String(state.filters.year || ''));
    const hashtags = [...new Set(state.records.flatMap(r => r.hashtags))].sort((a, b) => a.localeCompare(b, 'ms', { sensitivity: 'base' }));
    updateSelect(filterEls.hashtag, hashtags, 'Semua hashtag', state.filters.hashtag);
  }

  function filterLabels() {
    const f = state.filters;
    const labels = [];
    if (f.search) labels.push(`Carian: ${f.search}`);
    if (f.kategori) labels.push(f.kategori);
    if (f.subKategori) labels.push(f.subKategori);
    if (f.jabatan) labels.push(f.jabatan);
    if (f.kelulusan) labels.push(f.kelulusan);
    if (f.year) labels.push(String(f.year));
    if (f.hashtag) labels.push(`#${f.hashtag}`);
    return labels;
  }

  function applyFilters() {
    const f = state.filters;
    state.filtered = state.records.filter(record => {
      if (f.search && !record.searchText.includes(f.search.toLowerCase())) return false;
      if (f.kategori && record.kategori !== f.kategori) return false;
      if (f.subKategori && record.subKategori !== f.subKategori) return false;
      if (f.jabatan && record.jabatan !== f.jabatan) return false;
      if (f.kelulusan && record.approvalGroup !== f.kelulusan) return false;
      if (f.year && String(record.year) !== String(f.year)) return false;
      if (f.hashtag && !record.hashtags.includes(f.hashtag)) return false;
      return true;
    });
    sortRecords();
    const maxPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page > maxPage) state.page = maxPage;
    render();
  }

  function sortRecords() {
    const direction = state.sortDir === 'asc' ? 1 : -1;
    const key = state.sortKey;
    state.filtered.sort((a, b) => {
      const av = key === 'tarikh' ? (a.tarikh?.getTime() || 0) : safeText(a[key]);
      const bv = key === 'tarikh' ? (b.tarikh?.getTime() || 0) : safeText(b[key]);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
      return String(av).localeCompare(String(bv), 'ms', { numeric: true, sensitivity: 'base' }) * direction;
    });
  }

  function render() {
    const total = state.records.length;
    const filtered = state.filtered.length;
    $('recordSummary').textContent = `${filtered.toLocaleString('ms-MY')} daripada ${total.toLocaleString('ms-MY')} rekod`;
    const labels = filterLabels();
    $('activeFilters').innerHTML = labels.length
      ? labels.map(label => `<span class="filter-chip">${escapeHtml(label)}</span>`).join('')
      : '<span class="empty-filter">Tiada penapis aktif</span>';
    $('updatedAt').textContent = `Kemas kini: ${new Intl.DateTimeFormat('ms-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`;
    renderTable();
    $('loadingOverlay').classList.add('hidden');
    $('app').setAttribute('aria-busy', 'false');
  }

  function renderTable() {
    const total = state.filtered.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize;
    const end = Math.min(start + state.pageSize, total);
    const records = state.filtered.slice(start, end);

    $('pageInfo').textContent = `Rekod ${total ? start + 1 : 0}–${end} daripada ${total} · Halaman ${state.page} daripada ${pages}`;
    $('prevPageBtn').disabled = state.page <= 1;
    $('nextPageBtn').disabled = state.page >= pages;

    document.querySelectorAll('thead [data-sort] span').forEach(span => { span.textContent = ''; });
    const activeSort = document.querySelector(`thead [data-sort="${CSS.escape(state.sortKey)}"] span`);
    if (activeSort) activeSort.textContent = state.sortDir === 'asc' ? '▲' : '▼';

    if (!records.length) {
      $('tableBody').innerHTML = '<tr><td colspan="10"><div class="empty-state">Tiada rekod sepadan dengan penapis.</div></td></tr>';
      return;
    }

    $('tableBody').innerHTML = records.map((record, index) => {
      const tags = record.hashtags.length
        ? `<div class="tag-list">${record.hashtags.slice(0, 5).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}</div>`
        : '<span class="no-link">—</span>';
      return `<tr data-row-index="${start + index}">
        <td><strong>${escapeHtml(record.id || '—')}</strong></td>
        <td><button class="title-button" type="button" data-view="${start + index}" title="${escapeHtml(record.tajuk)}">${escapeHtml(record.tajuk || 'Tanpa tajuk')}</button></td>
        <td><span class="category-badge" title="${escapeHtml(record.kategori)}">${escapeHtml(record.kategori || '—')}</span></td>
        <td>${escapeHtml(record.subKategori || '—')}</td>
        <td><div class="cell-clamp" title="${escapeHtml(record.sinopsis)}">${escapeHtml(record.sinopsis || '—')}</div></td>
        <td>${escapeHtml(record.jabatan || '—')}</td>
        <td><div class="cell-clamp" title="${escapeHtml(record.kelulusan)}">${escapeHtml(record.kelulusan || '—')}</div></td>
        <td>${escapeHtml(formatDate(record.tarikh, record.tarikhRaw))}</td>
        <td>${tags}</td>
        <td>${record.link ? `<a class="link-button" href="${escapeHtml(record.link)}" target="_blank" rel="noopener noreferrer">Buka ↗</a>` : '<span class="no-link">Tiada pautan</span>'}</td>
      </tr>`;
    }).join('');
  }

  function showDetail(record) {
    if (!record) return;
    const tags = record.hashtags.length
      ? record.hashtags.slice(0, 5).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')
      : '<span class="no-link">Tiada hashtag</span>';
    $('detailTitle').textContent = record.id || 'Butiran Garis Panduan';
    $('detailContent').innerHTML = `
      <h3 class="detail-title">${escapeHtml(record.tajuk || 'Tanpa tajuk')}</h3>
      <div class="detail-grid">
        <div class="detail-box"><span>Kategori</span><strong>${escapeHtml(record.kategori || 'Tidak dinyatakan')}</strong></div>
        <div class="detail-box"><span>Subkategori</span><strong>${escapeHtml(record.subKategori || 'Tidak dinyatakan')}</strong></div>
        <div class="detail-box"><span>Jabatan / Agensi</span><strong>${escapeHtml(record.jabatan || 'Tidak dinyatakan')}</strong></div>
        <div class="detail-box"><span>Kelulusan</span><strong>${escapeHtml(record.kelulusan || 'Tidak dinyatakan')}</strong></div>
        <div class="detail-box"><span>Tarikh</span><strong>${escapeHtml(formatDate(record.tarikh, record.tarikhRaw))}</strong></div>
        <div class="detail-box"><span>ID</span><strong>${escapeHtml(record.id || 'Tidak dinyatakan')}</strong></div>
      </div>
      <div class="detail-section"><h3>Sinopsis</h3><p>${escapeHtml(record.sinopsis || 'Sinopsis belum disediakan.')}</p></div>
      <div class="detail-section"><h3>Hashtag</h3><div class="tag-list">${tags}</div></div>
      <div class="detail-actions">
        ${record.link ? `<a class="button button-primary" href="${escapeHtml(record.link)}" target="_blank" rel="noopener noreferrer">Buka Dokumen ↗</a>` : ''}
        ${!state.preview && record.rowId ? '<button id="selectRowBtn" class="button button-secondary" type="button">Pilih Rekod dalam Grist</button>' : ''}
      </div>`;
    $('detailModal').hidden = false;
    document.body.classList.add('modal-open');
    $('selectRowBtn')?.addEventListener('click', async () => {
      try {
        await window.grist.setCursorPos({ rowId: record.rowId });
        showToast('Rekod dipilih dalam Grist.');
      } catch {
        showToast('Rekod tidak dapat dipilih.');
      }
    });
  }

  function closeDetail() {
    $('detailModal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  function exportCsv() {
    const headers = ['ID','KATEGORI','SUB KATEGORI','TAJUK','SIPNOPSIS','LINK','JABATAN','KELULUSAN','TARIKH','HASHTAG'];
    const quote = value => `"${safeText(value).replace(/"/g, '""')}"`;
    const rows = state.filtered.map(record => [
      record.id, record.kategori, record.subKategori, record.tajuk, record.sinopsis,
      record.linkRaw || record.link, record.jabatan, record.kelulusan,
      formatDate(record.tarikh, record.tarikhRaw), record.hashtags.join('; '),
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senarai-garis-panduan-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`${state.filtered.length} rekod dieksport.`);
  }

  let toastTimer;
  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function resetFilters() {
    state.filters = { search: '', kategori: '', subKategori: '', jabatan: '', kelulusan: '', year: '', hashtag: '' };
    state.page = 1;
    Object.values(filterEls).forEach(control => { control.value = ''; });
    refreshFilterOptions();
    applyFilters();
  }

  function bindEvents() {
    filterEls.search.addEventListener('input', debounce(() => {
      state.filters.search = filterEls.search.value.trim();
      state.page = 1;
      applyFilters();
    }, 180));

    ['kategori','subKategori','jabatan','kelulusan','year','hashtag'].forEach(key => {
      filterEls[key].addEventListener('change', () => {
        state.filters[key] = filterEls[key].value;
        if (key === 'kategori') {
          state.filters.subKategori = '';
          refreshFilterOptions();
        }
        state.page = 1;
        applyFilters();
      });
    });

    $('resetBtn').addEventListener('click', resetFilters);
    $('exportBtn').addEventListener('click', exportCsv);
    $('printBtn').addEventListener('click', () => window.print());
    $('pageSizeSelect').addEventListener('change', () => {
      state.pageSize = Number($('pageSizeSelect').value) || 15;
      state.page = 1;
      renderTable();
    });
    $('prevPageBtn').addEventListener('click', () => { if (state.page > 1) { state.page--; renderTable(); } });
    $('nextPageBtn').addEventListener('click', () => {
      const pages = Math.ceil(state.filtered.length / state.pageSize);
      if (state.page < pages) { state.page++; renderTable(); }
    });
    document.querySelector('thead').addEventListener('click', event => {
      const button = event.target.closest('[data-sort]');
      if (!button) return;
      const key = button.dataset.sort;
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = key; state.sortDir = 'asc'; }
      sortRecords();
      renderTable();
    });
    $('tableBody').addEventListener('click', event => {
      const button = event.target.closest('[data-view]');
      if (button) showDetail(state.filtered[Number(button.dataset.view)]);
    });
    document.querySelectorAll('[data-close-detail]').forEach(element => element.addEventListener('click', closeDetail));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(); });
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function loadRecords(records) {
    state.records = records.map(normalizeRecord).filter(record => record.id || record.tajuk || record.kategori);
    state.page = 1;
    refreshFilterOptions();
    applyFilters();
  }

  function showMappingMessage() {
    $('mappingBanner').hidden = false;
    $('mappingMessage').textContent = 'Padankan kolum ID, KATEGORI, SUB KATEGORI, TAJUK, SIPNOPSIS, LINK, JABATAN, KELULUSAN, TARIKH dan HASHTAG.';
    $('loadingOverlay').classList.add('hidden');
  }
  const demoRecords = [
    { id:1, ID:'GP-001', Kategori:'PIAWAIAN PERANCANGAN', SubKategori:'PERUMAHAN', Tajuk:'Garis Panduan Piawaian Perumahan Majlis Bandaraya Seberang Perai', Sinopsis:'Panduan umum perancangan perumahan tidak berstrata, berstrata dan komuniti berpagar meliputi jalan, anjakan, kawasan lapang, kemudahan masyarakat dan tempat letak kenderaan.', Link:'https://example.com/gp-perumahan.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Perlu Pengesahan', Tarikh:'2021-12-08', Hashtag:['Perumahan','Berstrata','GatedCommunity','KemudahanMasyarakat','TLK'] },
    { id:2, ID:'GP-002', Kategori:'PIAWAIAN PERANCANGAN', SubKategori:'PERNIAGAAN', Tajuk:'Garis Panduan Piawaian Perancangan Perniagaan di Kawasan MBSP', Sinopsis:'Panduan pembangunan perniagaan tidak berstrata dan berstrata yang merangkumi hierarki jalan, anjakan bangunan, ruang solat, pusat penjaja dan tempat letak kenderaan.', Link:'https://example.com/gp-perniagaan.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Majlis Penuh', Tarikh:'2017-03-30', Hashtag:['Perniagaan','Komersial','HierarkiJalan','AnjakanBangunan','TLK'] },
    { id:3, ID:'GP-003', Kategori:'PIAWAIAN PERANCANGAN', SubKategori:'INDUSTRI', Tajuk:'Garis Panduan Piawaian Perancangan Industri di Kawasan MBSP', Sinopsis:'Panduan pembangunan industri tidak berstrata dan berstrata meliputi jalan, lorong industri, anjakan bangunan, gerai, ruang solat serta keperluan parkir kereta, motosikal dan lori.', Link:'https://example.com/gp-industri.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Jawatankuasa Perancang Negeri Bil. 6/2020', Tarikh:'2020-08-28', Hashtag:['Industri','Kilang','Gudang','HierarkiJalan','TLK'] },
    { id:4, ID:'GP-004', Kategori:'PIAWAIAN PERANCANGAN', SubKategori:'UMUM', Tajuk:'Piawaian Perancangan 1989', Sinopsis:'Manual piawaian asas pembangunan perbandaran di Seberang Perai yang merangkumi kediaman, industri, kawasan lapang, kemudahan awam, jalan, pembentungan dan kawasan perniagaan.', Link:'', Jabatan:'Majlis Perbandaran Seberang Perai', Kelulusan:'Majlis Penuh', Tarikh:'1989-12-28', Hashtag:['PiawaianPerancangan','PerancanganFizikal','Kediaman','Industri','KemudahanAwam'] },
    { id:5, ID:'GP-005', Kategori:'PERUMAHAN', SubKategori:'RUMAH MAMPU MILIK', Tajuk:'Garis Panduan Rumah Mampu Milik Negeri Pulau Pinang 2023', Sinopsis:'Menetapkan dasar, komponen, kategori dan keperluan pelaksanaan rumah mampu milik bagi projek pembangunan perumahan di Negeri Pulau Pinang.', Link:'https://example.com/rmm-2023.pdf', Jabatan:'LPNPP', Kelulusan:'SPC Bil. 7/2023', Tarikh:'2023-12-21', Hashtag:['RMM','RMKu','Perumahan','LPNPP'] },
    { id:6, ID:'GP-006', Kategori:'PERUMAHAN', SubKategori:'PENGINAPAN PEKERJA', Tajuk:'Garis Panduan Perancangan Pembinaan Penginapan Pekerja Negeri Pulau Pinang 2022', Sinopsis:'Panduan lokasi, susun atur, kemudahan, keselamatan dan pengurusan pembangunan penginapan pekerja di Negeri Pulau Pinang.', Link:'https://example.com/penginapan-pekerja-2022.pdf', Jabatan:'PLANMalaysia@Pulau Pinang', Kelulusan:'SPC Bil. 4/2022', Tarikh:'2022-04-28', Hashtag:['PenginapanPekerja','Asrama','CLQ','Industri'] },
    { id:7, ID:'GP-007', Kategori:'PENGANGKUTAN', SubKategori:'TEMPAT LETAK KENDERAAN', Tajuk:'Garis Panduan Tempat Letak Kenderaan Pindaan 2015', Sinopsis:'Menetapkan piawaian penyediaan petak kereta, motosikal, pelawat dan petak khas bagi jenis pembangunan di kawasan MBSP.', Link:'https://example.com/tlk-2015.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'SPC Bil. 11/2015', Tarikh:'2015-09-29', Hashtag:['TLK','Parkir','Motosikal','OKU'] },
    { id:8, ID:'GP-008', Kategori:'PENGANGKUTAN', SubKategori:'LALUAN BASIKAL', Tajuk:'Garis Panduan Penyediaan dan Pelaksanaan Laluan Basikal di MBSP', Sinopsis:'Panduan perancangan, reka bentuk dan pelaksanaan rangkaian laluan basikal yang selamat serta berhubung dengan guna tanah dan sistem pengangkutan.', Link:'https://example.com/laluan-basikal.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Majlis Penuh Ke-536', Tarikh:'2019-01-25', Hashtag:['Basikal','MobilitiAktif','Pengangkutan','RekaBentukJalan'] },
    { id:9, ID:'GP-009', Kategori:'KEMUDAHAN MASYARAKAT', SubKategori:'TADIKA TASKA PUSAT JAGAAN', Tajuk:'Garis Panduan Penyediaan Tadika, Taska dan Pusat Jagaan Bagi Pembangunan Perumahan Baru', Sinopsis:'Menetapkan kadar penyediaan, keluasan, lokasi dan jenis bangunan bagi tadika, taska dan pusat jagaan dalam pembangunan perumahan baharu.', Link:'https://example.com/ttpj.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Majlis Penuh Bil. 478 (4/2014)', Tarikh:'2014-04-24', Hashtag:['Tadika','Taska','PusatJagaan','Perumahan'] },
    { id:10, ID:'GP-010', Kategori:'KEMUDAHAN MASYARAKAT', SubKategori:'TEMPAT IBADAT ISLAM', Tajuk:'Garis Panduan Tempat Ibadat Islam Negeri Pulau Pinang 2021', Sinopsis:'Panduan perancangan tapak dan bangunan masjid, surau dan ruang solat termasuk saiz tapak, kapasiti, akses dan kemudahan sokongan.', Link:'https://example.com/tempat-ibadat-islam.pdf', Jabatan:'PLANMalaysia@Pulau Pinang', Kelulusan:'SPC Bil. 12/2021', Tarikh:'2021-12-08', Hashtag:['Masjid','Surau','RuangSolat','KemudahanMasyarakat'] },
    { id:11, ID:'GP-011', Kategori:'ALAM SEKITAR', SubKategori:'PENILAIAN IMPAK SOSIAL', Tajuk:'Panduan Pelaksanaan Penilaian Impak Sosial Bagi Projek Pembangunan', Sinopsis:'Panduan pelaksanaan penilaian impak sosial bagi mengenal pasti isu, kumpulan terkesan, langkah mitigasi dan kaedah pemantauan projek pembangunan.', Link:'https://example.com/ppsia.pdf', Jabatan:'PLANMalaysia@Pulau Pinang', Kelulusan:'SPC Bil. 7/2023', Tarikh:'2023-12-21', Hashtag:['SIA','PPSIA','ImpakSosial','Mitigasi'] },
    { id:12, ID:'GP-012', Kategori:'ALAM SEKITAR', SubKategori:'TANAH BUKIT', Tajuk:'Garis Panduan Keselamatan di Tanah Bukit Edisi Kedua', Sinopsis:'Panduan kawalan pembangunan di kawasan berbukit merangkumi kategori cerun, risiko, reka bentuk, kajian teknikal dan langkah keselamatan.', Link:'https://example.com/tanah-bukit.pdf', Jabatan:'Kerajaan Negeri Pulau Pinang', Kelulusan:'SPC Bil. 8/2020', Tarikh:'2020-11-30', Hashtag:['TanahBukit','Cerun','Keselamatan','KSAS'] },
    { id:13, ID:'GP-013', Kategori:'INDUSTRI', SubKategori:'PEMUTIHAN KILANG', Tajuk:'Garis Panduan Pemutihan Kilang-Kilang Tanpa Kebenaran', Sinopsis:'Tatacara dan syarat pertimbangan permohonan pemutihan kilang tanpa kebenaran merancang termasuk dokumen, kelayakan tapak dan rujukan teknikal.', Link:'https://example.com/pemutihan-kilang.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'MMK Bil. 47/2017', Tarikh:'2017-12-28', Hashtag:['PemutihanKilang','Industri','Penguatkuasaan','PKM'] },
    { id:14, ID:'GP-014', Kategori:'PERNIAGAAN', SubKategori:'STESEN MINYAK', Tajuk:'Garis Panduan Perancangan Pembinaan Stesen Minyak 2020', Sinopsis:'Panduan lokasi, akses, susun atur, anjakan keselamatan dan keperluan teknikal bagi pembangunan stesen minyak.', Link:'https://example.com/stesen-minyak.pdf', Jabatan:'PLANMalaysia@Pulau Pinang', Kelulusan:'SPC Bil. 5/2020', Tarikh:'2020-07-23', Hashtag:['StesenMinyak','Akses','Keselamatan','Perniagaan'] },
    { id:15, ID:'GP-015', Kategori:'PERTANIAN DAN PENTERNAKAN', SubKategori:'AKUAKULTUR', Tajuk:'Garis Panduan Pembangunan Akuakultur di Kawasan MBSP 2021', Sinopsis:'Panduan kesesuaian lokasi, susun atur, akses, zon penampan, utiliti dan kawalan impak bagi projek akuakultur.', Link:'https://example.com/akuakultur.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Majlis Penuh Ke-565 (7/2021)', Tarikh:'2021-07-27', Hashtag:['Akuakultur','Pertanian','ZonPenampan','AlamSekitar'] },
    { id:16, ID:'GP-016', Kategori:'FI CAJ DAN SUMBANGAN', SubKategori:'CAJ PEMAJUAN', Tajuk:'Garis Panduan Caj Pemajuan Bagi Penambahan Nisbah Plot dan Densiti', Sinopsis:'Menetapkan asas pengiraan dan pengenaan caj pemajuan bagi peningkatan nisbah plot atau densiti pembangunan di Seberang Perai.', Link:'https://example.com/caj-pemajuan.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Majlis Penuh Ke-463 (1/2013)', Tarikh:'2013-01-25', Hashtag:['CajPemajuan','Densiti','NisbahPlot','Sumbangan'] },
    { id:17, ID:'GP-017', Kategori:'PENGURUSAN KM OSC', SubKategori:'PEMBAHAGIAN FASA', Tajuk:'Garis Panduan Permohonan Pembahagian Fasa Pembangunan', Sinopsis:'Menetapkan maklumat, pelan, justifikasi dan tatacara permohonan pembahagian fasa bagi pembangunan yang dilaksanakan secara berperingkat.', Link:'https://example.com/pembahagian-fasa.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Majlis Penuh Ke-547 (1/2020)', Tarikh:'2020-01-29', Hashtag:['PembahagianFasa','KM','OSC','PelanSusunatur'] },
    { id:18, ID:'GP-018', Kategori:'PENGURUSAN KM OSC', SubKategori:'PENAMAAN TAMAN DAN JALAN', Tajuk:'Garis Panduan Kaedah Penamaan Nama Taman, Jalan, Bangunan dan Tempat Awam di MBSP', Sinopsis:'Panduan pemilihan, semakan dan kelulusan nama taman, jalan, bangunan serta tempat awam bagi memastikan kesesuaian dan keseragaman.', Link:'https://example.com/penamaan.pdf', Jabatan:'Jabatan Perancang Bandar MBSP', Kelulusan:'Majlis Penuh Ke-556 (10/2020)', Tarikh:'2020-10-22', Hashtag:['Penamaan','NamaTaman','NamaJalan','JUPEM'] },
    { id:19, ID:'GP-019', Kategori:'TENAGA DAN TEKNOLOGI', SubKategori:'LADANG SOLAR', Tajuk:'Garis Panduan Perancangan Ladang Solar Negeri Pulau Pinang', Sinopsis:'Panduan pemilihan tapak, kesesuaian guna tanah, akses, zon penampan, impak alam sekitar dan komponen sokongan ladang solar.', Link:'https://example.com/ladang-solar.pdf', Jabatan:'PLANMalaysia@Pulau Pinang', Kelulusan:'SPC Bil. 12/2021', Tarikh:'2021-12-08', Hashtag:['LadangSolar','TenagaBolehBaharu','GunaTanah','AlamSekitar'] },
    { id:20, ID:'GP-020', Kategori:'LAIN-LAIN', SubKategori:'TAPAK PERKHEMAHAN', Tajuk:'Garis Panduan Perancangan Tapak Perkhemahan Negeri Pulau Pinang Pindaan 2025', Sinopsis:'Panduan lokasi, kapasiti, akses kecemasan, kemudahan, keselamatan dan pengurusan bagi pembangunan serta pengoperasian tapak perkhemahan.', Link:'', Jabatan:'PLANMalaysia@Pulau Pinang', Kelulusan:'SPC Bil. 2/2025', Tarikh:'2025-02-27', Hashtag:['TapakPerkhemahan','Pelancongan','Keselamatan','Kemudahan'] },
  ];
  bindEvents();

  if (state.preview || typeof window.grist === 'undefined') {
    loadRecords(demoRecords);
    return;
  }

  try {
    window.grist.ready({ columns: FIELD_CONFIG, requiredAccess: 'read table', allowSelectBy: true });

    window.grist.onOptions?.((options, interaction) => {
      const access = interaction?.accessLevel || interaction?.access_level || '';
      if (access && access !== 'read table' && access !== 'full') {
        $('mappingBanner').hidden = false;
        $('mappingMessage').textContent = 'Akses data belum diluluskan. Pilih Read selected table atau Full document access dalam Widget options.';
      }
    });

    window.grist.onRecords((records, mappings) => {
      try {
        const rawRecords = Array.isArray(records) ? records : [];
        const mappedRecords = rawRecords.map(raw => {
          let mapped = null;
          try {
            // mapColumnNames perlu dibuat bagi setiap RowRecord.
            mapped = window.grist.mapColumnNames(raw);
          } catch (error) {
            console.warn('Pemetaan Grist gagal bagi satu rekod:', error);
          }
          return {
            ...autoMapRecord(raw),
            ...(mapped || {}),
            id: raw?.id,
          };
        });

        const missingRequired = FIELD_CONFIG
          .filter(field => !field.optional)
          .filter(field => !mappings || mappings[field.name] == null || mappings[field.name] === '');

        if (missingRequired.length && !mappedRecords.some(row => row.Tajuk || row.ID || row.Kategori)) {
          showMappingMessage();
          return;
        }

        $('mappingBanner').hidden = true;
        loadRecords(mappedRecords);

        if (!rawRecords.length) {
          $('mappingBanner').hidden = false;
          $('mappingMessage').textContent = 'Tiada rekod diterima daripada jadual terpilih. Semak Select Data, penapis jadual dan tetapan Select By.';
        }
      } catch (error) {
        console.error('Ralat memproses rekod Grist:', error);
        $('mappingBanner').hidden = false;
        $('mappingMessage').textContent = `Ralat membaca data Grist: ${error?.message || error}`;
        loadRecords([]);
      }
    });
  } catch (error) {
    console.error('Ralat memulakan Grist Plugin API:', error);
    $('mappingBanner').hidden = false;
    $('mappingMessage').textContent = `Sambungan Grist gagal: ${error?.message || error}`;
    $('loadingOverlay').classList.add('hidden');
  }
})();
