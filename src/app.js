/**
 * Antigravity History Manager — Frontend Application Controller (Tauri v2)
 * Neo-Dark UX, Multi-Language RU/EN, Full Keyboard Navigation, High Polish
 */

(function () {
  'use strict';

  // --- App State ---
  const state = {
    conversations: [],
    filteredConversations: [],
    selectedIds: new Set(),
    lastSelectedIndex: null,
    sortColumn: 'date',
    sortDirection: 'desc',
    searchQuery: '',
    envInfo: null,
    settings: {
      export_dir: '',
      format: 'all',
      organize_folders: true,
      thinking: true,
      full: false,
      today: false,
      language: 'ru',
      sound_enabled: true,
      sound_volume: 80
    },
    isRunning: false,
    wasInterrupted: false,
    currentPid: null,
    activeCommandType: null,
    lastExportCount: 0,
    unreadErrorsCount: 0,
    isDrawerOpen: false,
    logEntries: [],
    contextTargetId: null,
    contextTargetTitle: null
  };

  // --- DOM Elements Cache ---
  const elements = {
    // Top Bar
    statusIndicator: document.getElementById('status-indicator'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    langSwitcher: document.getElementById('lang-switcher'),
    langBtns: document.querySelectorAll('#lang-switcher .lang-btn'),
    btnToggleLog: document.getElementById('btn-toggle-log'),
    logUnreadDot: document.getElementById('log-unread-dot'),
    btnMoreMenu: document.getElementById('btn-more-menu'),
    moreMenuDropdown: document.getElementById('more-menu-dropdown'),

    // Subheader
    inputSearch: document.getElementById('input-search'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    btnRefresh: document.getElementById('btn-refresh'),
    sourceIndicator: document.getElementById('source-indicator'),
    sourceText: document.getElementById('source-text'),

    // Table / Cards Grid
    tableScrollContainer: document.getElementById('table-scroll-container'),
    chatsTable: document.getElementById('chats-grid') || document.getElementById('chats-table'),
    chkMaster: document.getElementById('chk-master'),
    chatsTbody: document.getElementById('chats-grid') || document.getElementById('chats-tbody'),
    thSortables: document.querySelectorAll('.chat-table th.sortable'),
    sortTitleIcon: document.getElementById('sort-title-icon') || { textContent: '' },
    sortStepsIcon: document.getElementById('sort-steps-icon') || { textContent: '' },
    sortDateIcon: document.getElementById('sort-date-icon') || { textContent: '' },

    // Fallback Views
    viewMissingCli: document.getElementById('view-missing-cli'),
    viewMissingDb: document.getElementById('view-missing-db'),
    btnRetryCli: document.getElementById('btn-retry-cli'),
    btnRetryDb: document.getElementById('btn-retry-db'),
    btnCopyInstallCmd: document.getElementById('btn-copy-install-cmd'),
    cmdInstallText: document.getElementById('cmd-install-text'),

    // Bottom Bar
    bottomBar: document.getElementById('bottom-bar'),
    barStandardMode: document.getElementById('bar-standard-mode'),
    barProgressMode: document.getElementById('bar-progress-mode'),
    barSuccessMode: document.getElementById('bar-success-mode'),
    barErrorMode: document.getElementById('bar-error-mode'),

    selectionCountText: document.getElementById('selection-count-text'),
    btnQuickSelectAll: document.getElementById('btn-quick-select-all'),
    btnQuickClearSel: document.getElementById('btn-quick-clear-sel'),
    chipFolderBtn: document.getElementById('chip-folder-btn'),
    chipFolderText: document.getElementById('chip-folder-text'),
    btnOpenFolderIcon: document.getElementById('btn-open-folder-icon'),
    chipFormatBtn: document.getElementById('chip-format-btn'),
    chipFormatText: document.getElementById('chip-format-text'),
    formatDropdown: document.getElementById('format-dropdown'),
    btnOpenOptions: document.getElementById('btn-open-options'),
    btnMainExport: document.getElementById('btn-main-export'),
    mainExportLabel: document.getElementById('main-export-label'),

    // In-Progress Bar Elements
    progressBarFill: document.getElementById('progress-bar-fill'),
    progressStatusText: document.getElementById('progress-status-text'),
    btnProgressViewLog: document.getElementById('btn-progress-view-log'),
    btnInterrupt: document.getElementById('btn-interrupt'),

    // Completed Bar Elements
    successStatusText: document.getElementById('success-status-text'),
    btnSuccessOpenDir: document.getElementById('btn-success-open-dir'),
    btnSuccessClose: document.getElementById('btn-success-close'),
    errorStatusText: document.getElementById('error-status-text'),
    btnErrorViewDetails: document.getElementById('btn-error-view-details'),
    btnErrorClose: document.getElementById('btn-error-close'),

    // Options Popover
    optionsPopoverOverlay: document.getElementById('options-popover-overlay'),
    optionsPopover: document.getElementById('options-popover'),
    btnCloseOptions: document.getElementById('btn-close-options'),
    optOrganizeFolders: document.getElementById('opt-organize-folders'),
    optThinking: document.getElementById('opt-thinking'),
    optFull: document.getElementById('opt-full'),
    optToday: document.getElementById('opt-today'),
    optSoundEnabled: document.getElementById('opt-sound-enabled'),
    optSoundVolume: document.getElementById('opt-sound-volume'),
    soundControlsRow: document.getElementById('sound-controls-row'),
    soundVolumeVal: document.getElementById('sound-volume-val'),
    btnTestSound: document.getElementById('btn-test-sound'),

    // Log Drawer
    logDrawer: document.getElementById('log-drawer'),
    drawerBody: document.getElementById('drawer-body'),
    btnCopyLog: document.getElementById('btn-copy-log'),
    btnClearLog: document.getElementById('btn-clear-log'),
    btnCloseDrawer: document.getElementById('btn-close-drawer'),

    // Row Context Menu
    tableContextMenu: document.getElementById('table-context-menu'),
    ctxExportSingle: document.getElementById('ctx-export-single'),
    ctxRevealDb: document.getElementById('ctx-reveal-db'),
    ctxCopyId: document.getElementById('ctx-copy-id'),
    ctxCopyTitle: document.getElementById('ctx-copy-title'),

    // Modals
    modalExportId: document.getElementById('modal-export-id'),
    inputModalId: document.getElementById('input-modal-id'),
    btnSubmitExportId: document.getElementById('btn-submit-export-id'),

    modalRecoverDialog: document.getElementById('modal-recover-dialog'),
    btnConfirmRecover: document.getElementById('btn-confirm-recover'),

    modalServerDialog: document.getElementById('modal-server-dialog'),
    serverStatusContent: document.getElementById('server-status-content'),
    btnServerOpenLog: document.getElementById('btn-server-open-log'),

    modalSettingsDialog: document.getElementById('modal-settings-dialog'),
    settingsLangToggle: document.getElementById('settings-lang-toggle'),
    settingsExportDir: document.getElementById('settings-export-dir'),
    btnSettingsBrowse: document.getElementById('btn-settings-browse'),
    btnSettingsSave: document.getElementById('btn-settings-save'),

    modalAboutDialog: document.getElementById('modal-about-dialog'),

    // Toasts
    toastContainer: document.getElementById('toast-container')
  };

  // --- HTML Escape Helper ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Highlight Matching Substring ---
  function highlightMatch(text, query) {
    if (!query) return text;
    const q = query.trim();
    if (!q) return text;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="hl-match">$1</mark>');
  }

  // --- Toast Manager (Max 3, Collapsing Duplicates, 4s Timeout) ---
  const toastManager = {
    activeToasts: [],

    show(message, type = 'info', duration = 4000) {
      if (!message || !elements.toastContainer) return;
      const cleanMsg = String(message).trim();

      // Check for duplicate message
      const existing = this.activeToasts.find(t => t.message === cleanMsg && t.type === type);
      if (existing) {
        existing.count += 1;
        existing.updateCountBadge();
        existing.resetTimer();
        return;
      }

      // Max 3 toasts
      if (this.activeToasts.length >= 3) {
        const oldest = this.activeToasts.shift();
        oldest.dismiss();
      }

      const toast = {
        message: cleanMsg,
        type,
        count: 1,
        timer: null,
        elem: null,

        dismiss: () => {
          if (toast.timer) clearTimeout(toast.timer);
          if (toast.elem && toast.elem.parentNode) {
            toast.elem.classList.add('fade-out');
            setTimeout(() => {
              if (toast.elem && toast.elem.parentNode) {
                toast.elem.parentNode.removeChild(toast.elem);
              }
            }, 250);
          }
          const idx = toastManager.activeToasts.indexOf(toast);
          if (idx !== -1) toastManager.activeToasts.splice(idx, 1);
        },

        resetTimer: () => {
          if (toast.timer) clearTimeout(toast.timer);
          toast.timer = setTimeout(() => toast.dismiss(), duration);
        },

        updateCountBadge: () => {
          let badge = toast.elem.querySelector('.toast-counter');
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'toast-counter';
            toast.elem.appendChild(badge);
          }
          badge.textContent = `×${toast.count}`;
        }
      };

      const elem = document.createElement('div');
      elem.className = `toast-item toast-${type}`;
      elem.setAttribute('role', 'alert');

      const msgSpan = document.createElement('span');
      msgSpan.className = 'toast-msg';
      msgSpan.textContent = cleanMsg;
      elem.appendChild(msgSpan);

      elem.addEventListener('click', () => toast.dismiss());
      elements.toastContainer.appendChild(elem);
      toast.elem = elem;
      toast.resetTimer();

      this.activeToasts.push(toast);
    }
  };

  // --- Clipboard Helper ---
  async function copyToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      // Fallback below
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const res = document.execCommand('copy');
      document.body.removeChild(textarea);
      return res;
    } catch (e) {
      console.error('Clipboard copy failed:', e);
      return false;
    }
  }

  // --- Shorten Long Paths Gracefully (Windows Backslashes, Middle Truncation) ---
  function formatPathDisplay(pathStr) {
    if (!pathStr) return '...\\antigravity_export';
    const clean = pathStr.replace(/\//g, '\\');
    if (clean.length <= 32) return clean;
    const parts = clean.split('\\');
    if (parts.length <= 2) return clean.substring(0, 12) + '...' + clean.slice(-12);
    return parts[0] + '\\...\\' + parts.slice(-1).join('\\');
  }

  // --- Bottom Bar Mode Controller ---
  function setBarMode(mode) {
    if (!elements.bottomBar) return;
    elements.barStandardMode.style.display = (mode === 'standard') ? 'flex' : 'none';
    elements.barProgressMode.style.display = (mode === 'progress') ? 'flex' : 'none';
    elements.barSuccessMode.style.display = (mode === 'success') ? 'flex' : 'none';
    elements.barErrorMode.style.display = (mode === 'error') ? 'flex' : 'none';
  }

  // --- Log Drawer Controller ---
  function openLogDrawer() {
    state.isDrawerOpen = true;
    elements.logDrawer.classList.add('open');
    elements.btnToggleLog.classList.add('active');
    // Clear unread error dot
    state.unreadErrorsCount = 0;
    elements.logUnreadDot.style.display = 'none';
    // Auto-scroll to end
    setTimeout(() => {
      elements.drawerBody.scrollTop = elements.drawerBody.scrollHeight;
    }, 50);
  }

  function closeLogDrawer() {
    state.isDrawerOpen = false;
    elements.logDrawer.classList.remove('open');
    elements.btnToggleLog.classList.remove('active');
  }

  function toggleLogDrawer() {
    if (state.isDrawerOpen) {
      closeLogDrawer();
    } else {
      openLogDrawer();
    }
  }

  function appendLog(text, tag = 'info') {
    if (!text && text !== '') return;
    const cleanText = String(text);

    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join(':');

    // Categorize log level for styling
    let level = 'info';
    const lower = cleanText.toLowerCase();
    if (tag === 'stderr' || lower.includes('error') || lower.includes('[err') || lower.includes('traceback')) {
      level = 'error';
    } else if (lower.includes('warning') || lower.includes('[warn')) {
      level = 'warn';
    } else if (cleanText.startsWith('[CMD]') || cleanText.startsWith('[Demo]')) {
      level = 'cmd';
    }

    state.logEntries.push({ time: timeStr, text: cleanText, level });
    if (state.logEntries.length > 2000) {
      state.logEntries.shift();
    }

    // Append to drawer DOM
    const row = document.createElement('div');
    row.className = `log-line log-${level}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${timeStr}]`;

    const textSpan = document.createElement('span');
    textSpan.className = 'log-text';
    textSpan.textContent = cleanText;

    row.appendChild(timeSpan);
    row.appendChild(textSpan);

    const isAtBottom = (elements.drawerBody.scrollHeight - elements.drawerBody.scrollTop) <= (elements.drawerBody.clientHeight + 60);
    elements.drawerBody.appendChild(row);

    if (isAtBottom) {
      elements.drawerBody.scrollTop = elements.drawerBody.scrollHeight;
    }

    // Unread errors indicator if drawer closed
    if (!state.isDrawerOpen && (level === 'error' || level === 'warn')) {
      state.unreadErrorsCount++;
      elements.logUnreadDot.style.display = 'inline-block';
    }

    // Also update server modal if open and this is server info
    if (state.activeCommandType === 'info' && elements.modalServerDialog.style.display !== 'none') {
      if (elements.serverStatusContent.textContent === window.i18n.t('modal_server.loading')) {
        elements.serverStatusContent.textContent = '';
      }
      elements.serverStatusContent.textContent += (cleanText + '\n');
    }
  }

  // --- Language Switching ---
  function setLanguage(lang) {
    window.i18n.setLanguage(lang);
    state.settings.language = lang;

    // Update Top bar language toggle
    elements.langBtns.forEach(btn => {
      if (btn.dataset.lang === lang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update settings modal toggle if present
    if (elements.settingsLangToggle) {
      elements.settingsLangToggle.querySelectorAll('.segment-btn').forEach(btn => {
        if (btn.dataset.lang === lang) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Save settings
    saveCurrentSettings();

    // Re-render UI components
    updateStatusDisplay();
    updateSourceIndicator();
    updateTableSelectionSummary();
    renderTable();

    // Re-render success status text if active
    if (elements.successStatusText) {
      if (state.lastExportCount > 0) {
        elements.successStatusText.textContent = window.i18n.plural('saved_dialogues', state.lastExportCount, { count: state.lastExportCount });
      } else {
        elements.successStatusText.textContent = window.i18n.t('progress.done');
      }
    }
  }

  // --- Environment & Status Indicator ---
  function updateStatusDisplay() {
    if (!state.envInfo) {
      elements.statusDot.className = 'status-dot dot-idle';
      elements.statusText.textContent = window.i18n.t('status.ready');
      return;
    }

    const { status_code, demo_mode, cli_available, antigravity_found, db_count } = state.envInfo;

    // Status Dot Class
    let dotClass = 'dot-idle';
    let labelKey = 'status.ready';

    if (demo_mode) {
      dotClass = 'dot-green dot-glow';
      labelKey = 'status.demo';
    } else if (state.isRunning) {
      dotClass = 'dot-green dot-pulse';
      labelKey = 'status.running';
    } else if (status_code === 'connected') {
      dotClass = 'dot-green';
      labelKey = 'status.connected';
    } else if (status_code === 'db_only') {
      dotClass = 'dot-yellow';
      labelKey = 'status.db_only';
    } else if (status_code === 'cli_missing') {
      dotClass = 'dot-yellow';
      labelKey = 'status.cli_missing';
    } else if (status_code === 'antigravity_missing') {
      dotClass = 'dot-red';
      labelKey = 'status.antigravity_missing';
    }

    elements.statusDot.className = `status-dot ${dotClass}`;
    elements.statusText.textContent = window.i18n.t(labelKey);

    // Detailed Tooltip
    const tooltipLines = [
      `Status: ${window.i18n.t(labelKey)}`,
      `CLI (aghistory): ${cli_available ? 'OK' : 'Not Found'}`,
      `Antigravity Folder: ${antigravity_found ? 'OK' : 'Not Found'}`,
      `Database Files: ${db_count} .db found`
    ];
    if (demo_mode) {
      tooltipLines.push('Mode: DEMO (neutral mock data)');
    }
    elements.statusIndicator.setAttribute('title', tooltipLines.join('\n'));
  }

  function updateSourceIndicator() {
    if (!state.envInfo) {
      elements.sourceText.textContent = '...';
      return;
    }
    const count = state.conversations.length;
    const dialoguesStr = window.i18n.plural('dialogues', count, { count });
    if (state.envInfo.status_code === 'db_only' || (!state.envInfo.active_server_found && !state.envInfo.demo_mode)) {
      elements.sourceText.textContent = window.i18n.t('source.db_only', { count: dialoguesStr });
    } else {
      elements.sourceText.textContent = window.i18n.t('source.live', { count: dialoguesStr });
    }
  }

  // --- Table Selection & Bottom Bar Summary ---
  function updateTableSelectionSummary() {
    const selCount = state.selectedIds.size;
    const totalCount = state.conversations.length;
    const filtCount = state.filteredConversations.length;

    // Selection count text
    if (selCount === 0) {
      elements.selectionCountText.textContent = window.i18n.t('bar.selected_zero', { total: totalCount });
      elements.btnQuickSelectAll.style.display = 'inline-block';
      elements.btnQuickClearSel.style.display = 'none';
      elements.mainExportLabel.textContent = window.i18n.t('bar.export_all_btn', { count: totalCount });
    } else {
      elements.selectionCountText.textContent = window.i18n.plural('selected', selCount, { count: selCount, total: totalCount });
      elements.btnQuickSelectAll.style.display = 'none';
      elements.btnQuickClearSel.style.display = 'inline-block';
      elements.mainExportLabel.textContent = window.i18n.plural('export_selected_btn', selCount, { count: selCount });
    }

    // Master checkbox state
    if (filtCount === 0 || selCount === 0) {
      elements.chkMaster.checked = false;
      elements.chkMaster.indeterminate = false;
    } else {
      // Check how many of the visible filtered items are selected
      let visibleSel = 0;
      for (const item of state.filteredConversations) {
        if (state.selectedIds.has(item.id)) visibleSel++;
      }
      if (visibleSel === filtCount) {
        elements.chkMaster.checked = true;
        elements.chkMaster.indeterminate = false;
      } else if (visibleSel > 0) {
        elements.chkMaster.checked = false;
        elements.chkMaster.indeterminate = true;
      } else {
        elements.chkMaster.checked = false;
        elements.chkMaster.indeterminate = false;
      }
    }
  }

  // --- Filtering & Sorting ---
  function applyFilterAndSort() {
    const query = state.searchQuery.toLowerCase().trim();

    // 1. Filter
    if (!query) {
      state.filteredConversations = [...state.conversations];
    } else {
      state.filteredConversations = state.conversations.filter(c => {
        const titleMatch = c.title && c.title.toLowerCase().includes(query);
        const idMatch = c.id && c.id.toLowerCase().includes(query);
        return titleMatch || idMatch;
      });
    }

    // 2. Sort
    const col = state.sortColumn;
    const dir = state.sortDirection === 'asc' ? 1 : -1;

    state.filteredConversations.sort((a, b) => {
      if (col === 'title') {
        const tA = (a.title || '').trim();
        const tB = (b.title || '').trim();
        return tA.localeCompare(tB) * dir;
      } else if (col === 'steps') {
        const sA = Number(a.steps) || 0;
        const sB = Number(b.steps) || 0;
        return (sA - sB) * dir;
      } else { // 'date'
        const dA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const dB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return (dA - dB) * dir;
      }
    });

    // Update Header Sort Icons
    elements.sortTitleIcon.textContent = (col === 'title') ? (dir === 1 ? '▲' : '▼') : '';
    elements.sortStepsIcon.textContent = (col === 'steps') ? (dir === 1 ? '▲' : '▼') : '';
    elements.sortDateIcon.textContent = (col === 'date') ? (dir === 1 ? '▲' : '▼') : '';
  }

  // --- Render Cards Grid ---
  function renderTable() {
    applyFilterAndSort();

    elements.chatsTbody.innerHTML = '';

    if (state.filteredConversations.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'empty-grid-card font-ui';
      emptyCard.textContent = state.searchQuery
        ? window.i18n.t('table.empty_search')
        : window.i18n.t('table.empty_list');
      elements.chatsTbody.appendChild(emptyCard);
      updateTableSelectionSummary();
      return;
    }

    const maxSteps = Math.max(1, ...state.conversations.map(c => Number(c.steps) || 0));
    const fragment = document.createDocumentFragment();

    state.filteredConversations.forEach((item, index) => {
      const isSelected = state.selectedIds.has(item.id);
      const card = document.createElement('div');
      card.className = `chat-card chat-row ${isSelected ? 'selected' : ''}`;
      card.dataset.id = item.id;
      card.dataset.index = index;

      const convId = item.id || item.cascade_id || '';
      const shortId = convId.length > 8 ? convId.substring(0, 8) : convId;
      const formattedDate = window.i18n.formatDate(item.updated_at);

      const stepsCount = Number(item.steps) || 0;
      const formattedSteps = stepsCount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');

      const ratio = Math.min(1, Math.max(0, stepsCount / maxSteps));
      const barWidth = Math.max(6, Math.round(Math.sqrt(ratio) * 100));

      const isUntitled = !item.title;
      const displayTitle = item.title || window.i18n.t('card.untitled');

      card.innerHTML = `
        <div class="card-top-row">
          <div class="card-top-left">
            <div class="round-chk ${isSelected ? 'checked' : ''}" aria-hidden="true">
              <svg class="chk-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0B10" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <code class="chat-id-code font-mono" data-id="${convId}" title="${window.i18n.t('table.copy_id_title')}">${shortId}…</code>
            <button type="button" class="btn-copy-inline btn-copy-outline" data-id="${convId}" title="${window.i18n.t('table.copy_id_title')}" aria-label="Copy UUID">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
          <div class="card-date font-ui">${formattedDate}</div>
        </div>

        <div class="card-steps-row">
          <span class="card-steps-num font-brand">${formattedSteps}</span>
          <span class="card-steps-label font-ui">${window.i18n.t('card.steps_label')}</span>
        </div>

        <div class="card-progress-track">
          <div class="card-progress-fill" style="width: ${barWidth}%;"></div>
        </div>

        <div class="card-title-row">
          <div class="card-title font-ui ${isUntitled ? 'untitled' : ''}" title="${escapeHtml(item.title || '')}">
            ${highlightMatch(escapeHtml(displayTitle), state.searchQuery)}
          </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    elements.chatsTbody.appendChild(fragment);
    updateTableSelectionSummary();
  }

  // --- Card Click & Multi-Selection Handler ---
  function setupTableEvents() {
    // Master Checkbox
    if (elements.chkMaster) {
      elements.chkMaster.addEventListener('change', () => {
        const checked = elements.chkMaster.checked;
        if (checked) {
          state.filteredConversations.forEach(c => state.selectedIds.add(c.id));
        } else {
          state.filteredConversations.forEach(c => state.selectedIds.delete(c.id));
        }
        renderTable();
      });
    }

    // Grid Clicks (Delegation)
    elements.chatsTbody.addEventListener('click', async (e) => {
      // 1. Inline Copy ID Button or Code
      const copyBtn = e.target.closest('.btn-copy-inline') || e.target.closest('.chat-id-code');
      if (copyBtn) {
        e.stopPropagation();
        const id = copyBtn.dataset.id;
        const ok = await copyToClipboard(id);
        if (ok) {
          toastManager.show(window.i18n.t('toast.copied_id', { id }), 'info');
        }
        return;
      }

      // 2. Card Click (with Shift support)
      const card = e.target.closest('.chat-card') || e.target.closest('.chat-row');
      if (!card) return;

      const id = card.dataset.id;
      const index = parseInt(card.dataset.index, 10);

      if (e.shiftKey && state.lastSelectedIndex !== null) {
        const start = Math.min(state.lastSelectedIndex, index);
        const end = Math.max(state.lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          const item = state.filteredConversations[i];
          if (item) state.selectedIds.add(item.id);
        }
      } else {
        if (state.selectedIds.has(id)) {
          state.selectedIds.delete(id);
        } else {
          state.selectedIds.add(id);
        }
      }
      state.lastSelectedIndex = index;
      renderTable();
    });

    // Context Menu on Row
    elements.chatsTbody.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.chat-row');
      if (!row) return;
      e.preventDefault();

      const id = row.dataset.id;
      const conv = state.conversations.find(c => c.id === id);
      state.contextTargetId = id;
      state.contextTargetTitle = conv ? conv.title : id;

      // Position Context Menu
      const menu = elements.tableContextMenu;
      menu.style.display = 'block';

      const menuWidth = 220;
      const menuHeight = 160;
      let x = e.clientX;
      let y = e.clientY;

      if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
      if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

      menu.style.left = `${Math.max(8, x)}px`;
      menu.style.top = `${Math.max(8, y)}px`;
    });
  }

  // --- Context Menu Actions ---
  function setupContextMenu() {
    elements.ctxExportSingle.addEventListener('click', () => {
      elements.tableContextMenu.style.display = 'none';
      if (state.contextTargetId) {
        startExport([state.contextTargetId]);
      }
    });

    elements.ctxRevealDb.addEventListener('click', async () => {
      elements.tableContextMenu.style.display = 'none';
      if (!state.contextTargetId) return;
      try {
        await window.api.revealDbFile(state.contextTargetId);
      } catch (err) {
        toastManager.show(err.message || String(err), 'error');
      }
    });

    elements.ctxCopyId.addEventListener('click', async () => {
      elements.tableContextMenu.style.display = 'none';
      if (!state.contextTargetId) return;
      const ok = await copyToClipboard(state.contextTargetId);
      if (ok) {
        toastManager.show(window.i18n.t('toast.copied_id', { id: state.contextTargetId }), 'info');
      }
    });

    elements.ctxCopyTitle.addEventListener('click', async () => {
      elements.tableContextMenu.style.display = 'none';
      if (!state.contextTargetTitle) return;
      const ok = await copyToClipboard(state.contextTargetTitle);
      if (ok) {
        toastManager.show(window.i18n.t('toast.copied_title'), 'info');
      }
    });
  }

  // --- Dropdowns & Popovers Controller ---
  function setupPopoversAndDropdowns() {
    // 1. Language Toggle in Header
    elements.langBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lang = btn.dataset.lang;
        setLanguage(lang);
      });
    });

    // 2. Format Selector Chip & Dropdown
    elements.chipFormatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = elements.formatDropdown.style.display === 'block';
      closeAllDropdowns();
      if (!isVisible) {
        const rect = elements.chipFormatBtn.getBoundingClientRect();
        elements.formatDropdown.style.bottom = `${window.innerHeight - rect.top + 6}px`;
        elements.formatDropdown.style.left = `${rect.left}px`;
        elements.formatDropdown.style.display = 'block';
      }
    });

    elements.formatDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const fmt = item.dataset.format;
        state.settings.format = fmt;

        // Update active class
        elements.formatDropdown.querySelectorAll('.dropdown-item').forEach(i => {
          i.classList.toggle('active', i.dataset.format === fmt);
        });

        // Update Chip text
        const fmtLabels = {
          all: window.i18n.t('bar.format_all'),
          md: window.i18n.t('bar.format_md'),
          json: window.i18n.t('bar.format_json')
        };
        elements.chipFormatText.textContent = fmtLabels[fmt] || fmt;

        elements.formatDropdown.style.display = 'none';
        saveCurrentSettings();
      });
    });

    // 3. Options Popover
    elements.btnOpenOptions.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllDropdowns();
      elements.optionsPopoverOverlay.style.display = 'flex';
      // Sync checkbox states
      if (elements.optOrganizeFolders) {
        elements.optOrganizeFolders.checked = state.settings.organize_folders !== false;
      }
      elements.optThinking.checked = state.settings.thinking;
      elements.optFull.checked = state.settings.full;
      elements.optToday.checked = state.settings.today;
      if (elements.optSoundEnabled) {
        elements.optSoundEnabled.checked = state.settings.sound_enabled !== false;
      }
      if (elements.optSoundVolume) {
        elements.optSoundVolume.value = state.settings.sound_volume ?? 80;
      }
      if (elements.soundVolumeVal) {
        elements.soundVolumeVal.textContent = (state.settings.sound_volume ?? 80) + '%';
      }
      if (elements.soundControlsRow) {
        elements.soundControlsRow.classList.toggle('disabled', state.settings.sound_enabled === false);
      }
    });

    elements.btnCloseOptions.addEventListener('click', () => {
      elements.optionsPopoverOverlay.style.display = 'none';
    });

    elements.optionsPopoverOverlay.addEventListener('click', (e) => {
      if (e.target === elements.optionsPopoverOverlay) {
        elements.optionsPopoverOverlay.style.display = 'none';
      }
    });

    [elements.optOrganizeFolders, elements.optThinking, elements.optFull, elements.optToday].forEach(chk => {
      if (!chk) return;
      chk.addEventListener('change', () => {
        if (elements.optOrganizeFolders) {
          state.settings.organize_folders = elements.optOrganizeFolders.checked;
        }
        state.settings.thinking = elements.optThinking.checked;
        state.settings.full = elements.optFull.checked;
        state.settings.today = elements.optToday.checked;
        saveCurrentSettings();
      });
    });

    if (elements.optSoundEnabled) {
      elements.optSoundEnabled.addEventListener('change', () => {
        state.settings.sound_enabled = elements.optSoundEnabled.checked;
        if (elements.soundControlsRow) {
          elements.soundControlsRow.classList.toggle('disabled', !state.settings.sound_enabled);
        }
        saveCurrentSettings();
      });
    }

    if (elements.optSoundVolume) {
      elements.optSoundVolume.addEventListener('input', () => {
        const val = parseInt(elements.optSoundVolume.value, 10) || 0;
        state.settings.sound_volume = val;
        if (elements.soundVolumeVal) {
          elements.soundVolumeVal.textContent = val + '%';
        }
      });
      elements.optSoundVolume.addEventListener('change', () => {
        saveCurrentSettings();
      });
    }

    if (elements.btnTestSound) {
      elements.btnTestSound.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.audioManager) {
          const vol = (state.settings.sound_volume ?? 80) / 100;
          window.audioManager.playTest(vol);
        }
      });
    }

    // 4. Header More Menu (...)
    elements.btnMoreMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = elements.moreMenuDropdown.style.display === 'block';
      closeAllDropdowns();
      if (!isVisible) {
        const rect = elements.btnMoreMenu.getBoundingClientRect();
        elements.moreMenuDropdown.style.top = `${rect.bottom + 6}px`;
        elements.moreMenuDropdown.style.right = `${window.innerWidth - rect.right}px`;
        elements.moreMenuDropdown.style.left = 'auto';
        elements.moreMenuDropdown.style.display = 'block';
      }
    });

    // More Menu Items
    document.getElementById('menu-item-server').addEventListener('click', () => {
      closeAllDropdowns();
      openServerModal();
    });

    document.getElementById('menu-item-export-id').addEventListener('click', () => {
      closeAllDropdowns();
      openModal(elements.modalExportId);
      elements.inputModalId.value = '';
      setTimeout(() => elements.inputModalId.focus(), 100);
    });

    document.getElementById('menu-item-db-folder').addEventListener('click', async () => {
      closeAllDropdowns();
      try {
        if (state.envInfo && state.envInfo.antigravity_dir) {
          const dbDir = state.envInfo.antigravity_dir + '\\conversations';
          await window.api.openFolder(dbDir);
          toastManager.show(window.i18n.t('toast.db_folder_opened'), 'info');
        }
      } catch (err) {
        toastManager.show(err.message || String(err), 'error');
      }
    });

    document.getElementById('menu-item-recover').addEventListener('click', () => {
      closeAllDropdowns();
      openModal(elements.modalRecoverDialog);
    });

    document.getElementById('menu-item-settings').addEventListener('click', () => {
      closeAllDropdowns();
      openSettingsModal();
    });

    document.getElementById('menu-item-about').addEventListener('click', () => {
      closeAllDropdowns();
      openModal(elements.modalAboutDialog);
    });

    // Document click to close all popups/menus
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown-menu') &&
          !e.target.closest('#btn-more-menu') &&
          !e.target.closest('#chip-format-btn')) {
        closeAllDropdowns();
      }
    });
  }

  function closeAllDropdowns() {
    elements.moreMenuDropdown.style.display = 'none';
    elements.formatDropdown.style.display = 'none';
    elements.tableContextMenu.style.display = 'none';
  }

  // --- Modals Management ---
  function openModal(modalElem) {
    if (!modalElem) return;
    modalElem.style.display = 'flex';
  }

  function closeModal(modalElem) {
    if (!modalElem) return;
    modalElem.style.display = 'none';
  }

  function setupModals() {
    // All close buttons inside modals with [data-close-modal]
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-backdrop');
        if (modal) closeModal(modal);
      });
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // 1. Export by ID Submit
    elements.btnSubmitExportId.addEventListener('click', () => {
      const id = elements.inputModalId.value.trim();
      if (!id) {
        toastManager.show(window.i18n.t('toast.enter_id'), 'warn');
        return;
      }
      closeModal(elements.modalExportId);
      startExport([id]);
    });

    // 2. Recover Dialog Confirm (Safe: runs dry-run or demo)
    elements.btnConfirmRecover.addEventListener('click', async () => {
      closeModal(elements.modalRecoverDialog);
      if (state.envInfo && state.envInfo.demo_mode) {
        startCommand('recover');
      } else {
        // Safe dry-run or log prompt
        appendLog('[WARN] Recover confirmed by user. Running dry validation...');
        toastManager.show('Recover initiated (dry scan)', 'info');
        startCommand('recover', { full: true }); // passes --dry-run
      }
    });

    // 3. Server Status Modal actions
    elements.btnServerOpenLog.addEventListener('click', () => {
      closeModal(elements.modalServerDialog);
      openLogDrawer();
    });

    // 4. Settings Modal
    elements.btnSettingsBrowse.addEventListener('click', async () => {
      try {
        const picked = await window.api.pickExportDirectory(elements.settingsExportDir.value);
        if (picked) {
          elements.settingsExportDir.value = picked;
        }
      } catch (err) {
        console.error(err);
      }
    });

    if (elements.settingsLangToggle) {
      elements.settingsLangToggle.querySelectorAll('.segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          elements.settingsLangToggle.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    }

    elements.btnSettingsSave.addEventListener('click', () => {
      state.settings.export_dir = elements.settingsExportDir.value.trim();
      elements.chipFolderText.textContent = formatPathDisplay(state.settings.export_dir);
      elements.chipFolderBtn.setAttribute('title', state.settings.export_dir);

      // Check chosen language
      const activeLangBtn = elements.settingsLangToggle ? elements.settingsLangToggle.querySelector('.segment-btn.active') : null;
      if (activeLangBtn) {
        const lang = activeLangBtn.dataset.lang;
        if (lang !== window.i18n.getLanguage()) {
          setLanguage(lang);
        }
      }

      saveCurrentSettings();
      closeModal(elements.modalSettingsDialog);
      toastManager.show(window.i18n.t('toast.saved'), 'success');
    });
  }

  function openServerModal() {
    openModal(elements.modalServerDialog);
    elements.serverStatusContent.textContent = window.i18n.t('modal_server.loading');
    startCommand('info');
  }

  function openSettingsModal() {
    openModal(elements.modalSettingsDialog);
    elements.settingsExportDir.value = state.settings.export_dir || '';
    if (elements.settingsLangToggle) {
      const cur = window.i18n.getLanguage();
      elements.settingsLangToggle.querySelectorAll('.segment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === cur);
      });
    }
  }

  // --- Folder Picking & Opening ---
  function setupFolderActions() {
    // Click on Folder Chip -> Pick Folder
    elements.chipFolderBtn.addEventListener('click', async (e) => {
      if (e.target.closest('#btn-open-folder-icon')) return;
      try {
        const picked = await window.api.pickExportDirectory(state.settings.export_dir);
        if (picked) {
          state.settings.export_dir = picked;
          elements.chipFolderText.textContent = formatPathDisplay(picked);
          elements.chipFolderBtn.setAttribute('title', picked);
          saveCurrentSettings();
          toastManager.show(window.i18n.t('toast.folder_selected', { path: picked }), 'info');
        }
      } catch (err) {
        toastManager.show(err.message || String(err), 'error');
      }
    });

    // Open Folder Icon Button
    elements.btnOpenFolderIcon.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await window.api.openFolder(state.settings.export_dir);
      } catch (err) {
        toastManager.show(err.message || String(err), 'error');
      }
    });

    // Success State "Open Folder" Button
    elements.btnSuccessOpenDir.addEventListener('click', async () => {
      try {
        await window.api.openFolder(state.settings.export_dir);
      } catch (err) {
        toastManager.show(err.message || String(err), 'error');
      }
    });

    // Success State Close Button
    elements.btnSuccessClose.addEventListener('click', () => {
      setBarMode('standard');
    });

    // Error State "View Details" Button
    elements.btnErrorViewDetails.addEventListener('click', () => {
      openLogDrawer();
      setBarMode('standard');
    });

    // Error State Close Button
    elements.btnErrorClose.addEventListener('click', () => {
      setBarMode('standard');
    });

    // Copy install command button
    elements.btnCopyInstallCmd.addEventListener('click', async () => {
      const cmd = elements.cmdInstallText.textContent.trim();
      const ok = await copyToClipboard(cmd);
      if (ok) toastManager.show(window.i18n.t('missing_cli.copy_cmd') + ' ✓', 'info');
    });

    // Quick selection buttons in bottom bar
    elements.btnQuickSelectAll.addEventListener('click', () => {
      state.filteredConversations.forEach(c => state.selectedIds.add(c.id));
      renderTable();
    });

    elements.btnQuickClearSel.addEventListener('click', () => {
      state.selectedIds.clear();
      renderTable();
    });
  }

  // --- Export Execution Engine ---
  async function startExport(chatIds = null) {
    if (state.isRunning) return;

    // Check CLI availability
    if (state.envInfo && !state.envInfo.cli_available && !state.envInfo.demo_mode) {
      toastManager.show(window.i18n.t('missing_cli.desc'), 'warn');
      return;
    }

    state.isRunning = true;
    state.activeCommandType = 'export';

    // Determine target IDs
    let targets = chatIds;
    if (!targets && state.selectedIds.size > 0) {
      targets = Array.from(state.selectedIds);
    }

    const totalToExport = targets ? targets.length : state.conversations.length;
    state.lastExportCount = totalToExport;

    // Transition bottom bar to Progress Mode
    setBarMode('progress');
    elements.progressStatusText.textContent = targets
      ? window.i18n.t('progress.exporting', { current: 1, total: totalToExport })
      : window.i18n.t('progress.exporting_all', { total: totalToExport });

    updateStatusDisplay();

    appendLog(`[CMD] Starting export (${totalToExport} conversations) -> ${state.settings.export_dir}`);

    try {
      const pid = await window.api.runCommand({
        cmd_type: 'export',
        chat_id: (targets && targets.length === 1) ? targets[0] : null,
        chat_ids: (targets && targets.length > 1) ? targets : null,
        output_dir: state.settings.export_dir,
        format: state.settings.format,
        organize_folders: state.settings.organize_folders !== false,
        thinking: state.settings.thinking,
        full: state.settings.full,
        today: state.settings.today
      });
      state.currentPid = pid;
    } catch (err) {
      state.isRunning = false;
      setBarMode('error');
      updateStatusDisplay();
      appendLog(`[ERROR] Export failed to start: ${err.message || String(err)}`, 'error');
      toastManager.show(err.message || String(err), 'error');
    }
  }

  // General Command Runner (list, info, recover)
  async function startCommand(cmdType, extraOpts = {}) {
    if (state.isRunning) return;

    state.isRunning = true;
    state.activeCommandType = cmdType;
    updateStatusDisplay();

    try {
      const pid = await window.api.runCommand({
        cmd_type: cmdType,
        output_dir: state.settings.export_dir,
        format: state.settings.format,
        organize_folders: state.settings.organize_folders !== false,
        thinking: state.settings.thinking,
        full: Boolean(extraOpts.full || state.settings.full),
        today: Boolean(extraOpts.today || state.settings.today)
      });
      state.currentPid = pid;
    } catch (err) {
      state.isRunning = false;
      updateStatusDisplay();
      appendLog(`[ERROR] ${cmdType} failed: ${err.message || String(err)}`, 'error');
      toastManager.show(err.message || String(err), 'error');
    }
  }

  // --- Stop Running Command ---
  async function stopCommand() {
    if (!state.isRunning) return;
    state.wasInterrupted = true;
    elements.progressStatusText.textContent = window.i18n.t('progress.stopping');
    appendLog('[CMD] Interrupting process...');
    try {
      await window.api.stopRunningCommand();
      toastManager.show(window.i18n.t('toast.stopped'), 'warn');
    } catch (err) {
      console.error('Stop command error:', err);
    }
  }

  // --- IPC Event Listeners Setup ---
  function setupIpcListeners() {
    // Process output stream
    window.api.onCmdOutput((payload) => {
      if (payload && payload.text) {
        appendLog(payload.text, payload.tag || 'info');
      }
    });

    // Process finished event
    window.api.onCmdFinished((payload) => {
      const { cmd_type, success, exported_count } = payload;
      state.isRunning = false;
      state.currentPid = null;
      updateStatusDisplay();

      if (cmd_type === 'export') {
        if (success) {
          const count = exported_count || state.lastExportCount || 1;
          state.lastExportCount = count;
          setBarMode('success');
          elements.successStatusText.textContent = window.i18n.plural('saved_dialogues', count, { count });
          toastManager.show(window.i18n.plural('saved_dialogues', count, { count }), 'success');

          // Play success chime
          if (state.settings.sound_enabled !== false && window.audioManager) {
            const vol = (state.settings.sound_volume ?? 80) / 100;
            window.audioManager.playSuccess(vol);
          }

          // Request window attention if window not in focus or minimized
          if (document.hidden || !document.hasFocus()) {
            window.api.requestWindowAttention().catch(() => {});
          }
        } else {
          setBarMode('error');
          elements.errorStatusText.textContent = window.i18n.t('progress.error');
          toastManager.show(window.i18n.t('progress.error'), 'error');

          // If NOT user-interrupted, play error sound
          if (!state.wasInterrupted && state.settings.sound_enabled !== false && window.audioManager) {
            const vol = (state.settings.sound_volume ?? 80) / 100;
            window.audioManager.playError(vol);
          }

          if (!state.wasInterrupted && (document.hidden || !document.hasFocus())) {
            window.api.requestWindowAttention().catch(() => {});
          }
        }
        state.wasInterrupted = false;
      } else {
        if (success) {
          appendLog(`[CMD] ${cmd_type} completed successfully.`);
        } else {
          appendLog(`[CMD] ${cmd_type} terminated with error code ${payload.code}.`, 'error');
        }
      }
    });
  }

  // --- Save / Load Settings ---
  async function loadSettings() {
    try {
      const saved = await window.api.loadSettings();
      if (saved) {
        if (saved.export_dir) state.settings.export_dir = saved.export_dir;
        if (saved.format) state.settings.format = saved.format;
        if (typeof saved.organize_folders === 'boolean') state.settings.organize_folders = saved.organize_folders;
        if (typeof saved.thinking === 'boolean') state.settings.thinking = saved.thinking;
        if (typeof saved.full === 'boolean') state.settings.full = saved.full;
        if (typeof saved.today === 'boolean') state.settings.today = saved.today;
        if (typeof saved.sound_enabled === 'boolean') state.settings.sound_enabled = saved.sound_enabled;
        if (typeof saved.sound_volume === 'number') state.settings.sound_volume = saved.sound_volume;
      }
    } catch (err) {
      console.warn('Could not load settings:', err);
    }

    // Sync sound controls in Options popover
    if (elements.optSoundEnabled) {
      elements.optSoundEnabled.checked = state.settings.sound_enabled !== false;
    }
    if (elements.optSoundVolume) {
      elements.optSoundVolume.value = state.settings.sound_volume ?? 80;
    }
    if (elements.soundVolumeVal) {
      elements.soundVolumeVal.textContent = (state.settings.sound_volume ?? 80) + '%';
    }
    if (elements.soundControlsRow) {
      elements.soundControlsRow.classList.toggle('disabled', state.settings.sound_enabled === false);
    }

    // Apply to UI chips
    elements.chipFolderText.textContent = formatPathDisplay(state.settings.export_dir);
    elements.chipFolderBtn.setAttribute('title', state.settings.export_dir || '');

    const fmtLabels = {
      all: window.i18n.t('bar.format_all'),
      md: window.i18n.t('bar.format_md'),
      json: window.i18n.t('bar.format_json')
    };
    elements.chipFormatText.textContent = fmtLabels[state.settings.format] || state.settings.format;
  }

  async function saveCurrentSettings() {
    try {
      await window.api.saveSettings(state.settings);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  // --- Load Environment & Conversations ---
  async function refreshData() {
    try {
      // 1. Get Environment
      const env = await window.api.getEnvStatus();
      state.envInfo = {
        ...env,
        cli_available: Boolean(env.aghistory_found || env.cli_available),
        aghistory_found: Boolean(env.aghistory_found || env.cli_available),
        demo_mode: Boolean(env.is_demo || env.demo_mode),
        is_demo: Boolean(env.is_demo || env.demo_mode),
        db_count: (env.db_files_count !== undefined) ? env.db_files_count : (env.db_count || 0),
        db_files_count: (env.db_files_count !== undefined) ? env.db_files_count : (env.db_count || 0),
        active_server_found: (env.status_code === 'connected')
      };

      if (!state.settings.export_dir && env.default_export_dir) {
        state.settings.export_dir = env.default_export_dir;
        elements.chipFolderText.textContent = formatPathDisplay(env.default_export_dir);
        elements.chipFolderBtn.setAttribute('title', env.default_export_dir);
      }

      updateStatusDisplay();

      // View Handling (Fallback views)
      if (env.status_code === 'antigravity_missing') {
        elements.viewMissingDb.style.display = 'flex';
        elements.viewMissingCli.style.display = 'none';
        elements.tableScrollContainer.style.display = 'none';
        elements.bottomBar.style.display = 'none';
        return;
      } else if (env.status_code === 'cli_missing' && env.db_count === 0) {
        elements.viewMissingCli.style.display = 'flex';
        elements.viewMissingDb.style.display = 'none';
        elements.tableScrollContainer.style.display = 'none';
        elements.bottomBar.style.display = 'none';
        return;
      } else {
        elements.viewMissingCli.style.display = 'none';
        elements.viewMissingDb.style.display = 'none';
        elements.tableScrollContainer.style.display = 'block';
        elements.bottomBar.style.display = 'block';
      }

      // 2. Load Conversations
      const rawList = await window.api.getConversationsDb();
      state.conversations = Array.isArray(rawList) ? rawList.map(c => {
        const id = c.cascade_id || c.id || '';
        return {
          id: id,
          cascade_id: id,
          title: c.title || '',
          steps: (c.step_count !== undefined) ? c.step_count : (c.steps || 0),
          step_count: (c.step_count !== undefined) ? c.step_count : (c.steps || 0),
          updated_at: c.last_modified || c.updated_at || '',
          last_modified: c.last_modified || c.updated_at || '',
          source: c.source || 'db'
        };
      }) : [];

      updateSourceIndicator();
      renderTable();
    } catch (err) {
      console.error('Failed to refresh data:', err);
      toastManager.show(err.message || String(err), 'error');
    }
  }

  // --- Keyboard Shortcuts Controller ---
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ctrl+F / Cmd+F -> Focus Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        elements.inputSearch.focus();
        elements.inputSearch.select();
        return;
      }

      // Ctrl+A / Cmd+A -> Select all filtered conversations (if not typing in text field)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          state.filteredConversations.forEach(c => state.selectedIds.add(c.id));
          renderTable();
          return;
        }
      }

      // F5 -> Refresh Conversations
      if (e.key === 'F5') {
        e.preventDefault();
        refreshData();
        toastManager.show(window.i18n.t('toast.list_refreshed'), 'info');
        return;
      }

      // Escape -> Close topmost open element
      if (e.key === 'Escape') {
        // If dropdown open, close it
        if (elements.moreMenuDropdown.style.display === 'block' ||
            elements.formatDropdown.style.display === 'block' ||
            elements.tableContextMenu.style.display === 'block') {
          closeAllDropdowns();
          return;
        }
        // If popover open, close it
        if (elements.optionsPopoverOverlay.style.display === 'flex') {
          elements.optionsPopoverOverlay.style.display = 'none';
          return;
        }
        // If any modal open, close it
        const openModal = document.querySelector('.modal-backdrop[style*="display: flex"]');
        if (openModal) {
          closeModal(openModal);
          return;
        }
        // If search input focused, clear search
        if (document.activeElement === elements.inputSearch && elements.inputSearch.value) {
          elements.inputSearch.value = '';
          state.searchQuery = '';
          renderTable();
          return;
        }
        // If drawer open, close it
        if (state.isDrawerOpen) {
          closeLogDrawer();
          return;
        }
      }
    });
  }

  // --- Wire User Action Handlers ---
  function setupActions() {
    // Search input
    elements.inputSearch.addEventListener('input', () => {
      state.searchQuery = elements.inputSearch.value;
      elements.btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
      renderTable();
    });

    elements.btnClearSearch.addEventListener('click', () => {
      elements.inputSearch.value = '';
      state.searchQuery = '';
      elements.btnClearSearch.style.display = 'none';
      renderTable();
      elements.inputSearch.focus();
    });

    // Refresh button
    elements.btnRefresh.addEventListener('click', async () => {
      await refreshData();
      toastManager.show(window.i18n.t('toast.list_refreshed'), 'info');
    });

    // Missing views retry buttons
    elements.btnRetryCli.addEventListener('click', () => refreshData());
    elements.btnRetryDb.addEventListener('click', () => refreshData());

    // Drawer Header Buttons
    elements.btnToggleLog.addEventListener('click', () => toggleLogDrawer());
    elements.btnCloseDrawer.addEventListener('click', () => closeLogDrawer());

    elements.btnCopyLog.addEventListener('click', async () => {
      const fullLog = state.logEntries.map(e => `[${e.time}] ${e.text}`).join('\n');
      const ok = await copyToClipboard(fullLog);
      if (ok) toastManager.show(window.i18n.t('toast.copied_log'), 'info');
    });

    elements.btnClearLog.addEventListener('click', () => {
      state.logEntries = [];
      elements.drawerBody.innerHTML = '';
    });

    // Progress bar view log button
    elements.btnProgressViewLog.addEventListener('click', () => openLogDrawer());

    // Main Export Button
    elements.btnMainExport.addEventListener('click', () => {
      startExport();
    });

    // Interrupt button
    elements.btnInterrupt.addEventListener('click', () => {
      stopCommand();
    });
  }

  // --- App Initialization ---
  async function initApp() {
    try {
      // 1. Initialize i18n
      await window.i18n.init();

      // 2. Load Settings
      await loadSettings();

      // 3. Setup Listeners and UI
      setupTableEvents();
      setupContextMenu();
      setupPopoversAndDropdowns();
      setupModals();
      setupFolderActions();
      setupActions();
      setupKeyboardShortcuts();
      setupIpcListeners();

      // 4. Initial Fetch
      await refreshData();

      // Expose state and helper for automation/extensions
      window.appState = state;
      window.setExportDir = (dir) => {
        state.settings.export_dir = dir;
        elements.chipFolderText.textContent = formatPathDisplay(dir);
        elements.chipFolderBtn.setAttribute('title', dir);
        saveCurrentSettings();
      };

      appendLog('[Ready] Antigravity History Manager v2.0 initialized.');
    } catch (err) {
      console.error('Fatal initialization error:', err);
    }
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
