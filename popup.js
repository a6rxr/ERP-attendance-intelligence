/**
 * ERP Attendance Intelligence — Popup Script
 * UI controller and event handling for the Chrome extension popup.
 *
 * Attendance modes:
 *   "ERP"            — raw attended value (matches ERP display)
 *   "TCBR_CORRECTED" — adds TCBR to attended for effective attendance
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Record<string, Element|null>} Cached DOM element references */
const el = {};

/** Application state — all mutable runtime data lives here */
let state = {
    theme: 'light',
    threshold: 75,
    sortBy: 'danger',
    attendanceMode: 'ERP',
    attendanceData: null,
    processedSubjects: [],
    lastFetched: null,
    subjectWeightages: {},  // courseCode → { L, T, P, S } (0–100)
    simulatedBunks: {}   // courseCode → { L: n, T: n, … }
};

/** Set of course codes whose component accordion is currently expanded */
const expandedCards = new Set();

/** Course code of the subject whose weightage modal is open, or null */
let activeWeightageSubject = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
    cacheElements();
    await loadSettings();
    applyTheme(state.theme);
    AttendanceCalculator.setMode(state.attendanceMode);
    setupEventListeners();
    syncSettingsUI();
    if (state.attendanceData) renderResults();
}

// ---------------------------------------------------------------------------
// DOM caching
// ---------------------------------------------------------------------------

function cacheElements() {
    const $ = id => document.getElementById(id);
    Object.assign(el, {
        themeToggle: $('themeToggle'),
        settingsBtn: $('settingsBtn'),
        settingsPanel: $('settingsPanel'),
        thresholdInput: $('thresholdInput'),
        sortSelect: $('sortSelect'),
        attendanceModeSelect: $('attendanceModeSelect'),
        saveSettingsBtn: $('saveSettingsBtn'),
        statsBar: $('statsBar'),
        totalSubjects: $('totalSubjects'),
        avgAttendance: $('avgAttendance'),
        safeCount: $('safeCount'),
        criticalCount: $('criticalCount'),
        initialState: $('initialState'),
        loadingState: $('loadingState'),
        errorState: $('errorState'),
        resultsContainer: $('resultsContainer'),
        fetchBtn: $('fetchBtn'),
        retryBtn: $('retryBtn'),
        refreshBtn: $('refreshBtn'),
        subjectsGrid: $('subjectsGrid'),
        errorMessage: $('errorMessage'),
        lastUpdated: $('lastUpdated'),
        subjectCardTemplate: $('subjectCardTemplate'),
        componentTemplate: $('componentTemplate'),
        bunkSimBar: $('bunkSimBar'),
        bunkSimBarText: $('bunkSimBarText'),
        bunkSimResetBtn: $('bunkSimResetBtn')
    });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEYS = ['theme', 'threshold', 'sortBy', 'attendanceMode', 'lastData', 'subjectWeightages'];
const SAFE_STATE_KEYS = ['theme', 'threshold', 'sortBy', 'attendanceMode', 'subjectWeightages'];

function loadSettings() {
    return new Promise(resolve => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(STORAGE_KEYS, result => {
                if (result.theme) state.theme = result.theme;
                if (result.threshold) state.threshold = result.threshold;
                if (result.sortBy) state.sortBy = result.sortBy;
                if (result.attendanceMode) state.attendanceMode = result.attendanceMode;
                if (result.subjectWeightages) state.subjectWeightages = result.subjectWeightages;
                if (result.lastData) {
                    state.attendanceData = result.lastData.data;
                    state.lastFetched = result.lastData.timestamp;
                }
                resolve();
            });
        } else {
            // Dev/testing fallback — only merge known safe keys to prevent prototype pollution
            try {
                const saved = JSON.parse(localStorage.getItem('erpAttendanceSettings') || 'null');
                if (saved && typeof saved === 'object') {
                    for (const key of SAFE_STATE_KEYS) {
                        if (key in saved) state[key] = saved[key];
                    }
                }
            } catch { /* use defaults */ }
            resolve();
        }
    });
}

function saveSettings() {
    const payload = {
        theme: state.theme,
        threshold: state.threshold,
        sortBy: state.sortBy,
        attendanceMode: state.attendanceMode,
        subjectWeightages: state.subjectWeightages
    };
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set(payload);
    } else {
        localStorage.setItem('erpAttendanceSettings', JSON.stringify(payload));
    }
}

function saveAttendanceData() {
    if (!state.attendanceData) return;
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ lastData: { data: state.attendanceData, timestamp: state.lastFetched } });
    }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function setupEventListeners() {
    el.themeToggle.addEventListener('click', toggleTheme);
    el.settingsBtn.addEventListener('click', () => el.settingsPanel.classList.toggle('hidden'));
    el.saveSettingsBtn.addEventListener('click', handleSaveSettings);

    for (const btn of [el.fetchBtn, el.retryBtn, el.refreshBtn]) {
        btn.addEventListener('click', fetchAttendanceData);
    }

    document.getElementById('weightageModalClose').addEventListener('click', closeWeightageModal);
    document.getElementById('weightageApplyBtn').addEventListener('click', applyWeightages);
    document.getElementById('weightageResetBtn').addEventListener('click', resetWeightages);
    document.getElementById('weightageModalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeWeightageModal();
    });

    el.bunkSimResetBtn.addEventListener('click', resetBunkSimulations);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            el.settingsPanel.classList.add('hidden');
            closeWeightageModal();
        }
    });
}

// ---------------------------------------------------------------------------
// Settings UI
// ---------------------------------------------------------------------------

function syncSettingsUI() {
    el.thresholdInput.value = state.threshold;
    el.sortSelect.value = state.sortBy;
    el.attendanceModeSelect.value = state.attendanceMode;
}

function handleSaveSettings() {
    const newThreshold = parseInt(el.thresholdInput.value, 10);
    if (isNaN(newThreshold) || newThreshold < 0 || newThreshold > 100) {
        el.thresholdInput.classList.add('input-error');
        setTimeout(() => el.thresholdInput.classList.remove('input-error'), 1000);
        return;
    }

    const modeChanged = state.attendanceMode !== el.attendanceModeSelect.value;
    state.threshold = newThreshold;
    state.sortBy = el.sortSelect.value;
    state.attendanceMode = el.attendanceModeSelect.value;

    AttendanceCalculator.setMode(state.attendanceMode);
    saveSettings();
    el.settingsPanel.classList.add('hidden');

    if (state.attendanceData) renderResults();
    showToast(modeChanged ? `Mode: ${AttendanceCalculator.getModeDisplayText()}` : 'Settings saved!');
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    saveSettings();
}

function applyTheme(theme) {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    document.body.classList.toggle('light-theme', theme === 'light');
}

// ---------------------------------------------------------------------------
// View state
// ---------------------------------------------------------------------------

/**
 * Switches between: 'initial' | 'loading' | 'error' | 'results'
 * @param {string} viewName
 */
function showView(viewName) {
    el.initialState.classList.add('hidden');
    el.loadingState.classList.add('hidden');
    el.errorState.classList.add('hidden');
    el.resultsContainer.classList.add('hidden');
    el.statsBar.classList.add('hidden');
    el.refreshBtn.classList.add('hidden');

    switch (viewName) {
        case 'initial': el.initialState.classList.remove('hidden'); break;
        case 'loading': el.loadingState.classList.remove('hidden'); break;
        case 'error': el.errorState.classList.remove('hidden'); break;
        case 'results':
            el.resultsContainer.classList.remove('hidden');
            el.statsBar.classList.remove('hidden');
            el.refreshBtn.classList.remove('hidden');
            break;
    }
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchAttendanceData() {
    showView('loading');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('No active tab found.');
        if (!tab.url?.includes('newerp.kluniversity.in')) {
            throw new Error('Please navigate to the KL University ERP attendance page first.');
        }

        let response;
        try {
            response = await chrome.tabs.sendMessage(tab.id, { action: 'fetchAttendance' });
        } catch {
            throw new Error('ERP page not ready. Please refresh the page and try again.');
        }

        if (!response?.success) {
            throw new Error(response?.error || 'Failed to fetch attendance data.');
        }

        state.attendanceData = response.data;
        state.lastFetched = new Date().toISOString();
        state.simulatedBunks = {}; // Clear simulations on fresh fetch
        saveAttendanceData();
        renderResults();
    } catch (error) {
        el.errorMessage.textContent = error.message || 'An unexpected error occurred.';
        showView('error');
    }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderResults() {
    if (!state.attendanceData) { showView('initial'); return; }

    AttendanceCalculator.setMode(state.attendanceMode);

    state.processedSubjects = AttendanceCalculator.sortSubjects(
        AttendanceCalculator.processAllSubjects(
            state.attendanceData,
            state.threshold,
            state.subjectWeightages,
            state.simulatedBunks
        ),
        state.sortBy
    );

    const stats = AttendanceCalculator.calculateAggregateStats(state.processedSubjects, state.threshold);
    updateStatsBar(stats);
    renderSubjectCards();
    updateBunkSimBar();
    updateLastUpdated();
    showView('results');
}

function updateStatsBar(stats) {
    el.totalSubjects.textContent = stats.totalSubjects;
    el.avgAttendance.textContent = `${stats.averageAttendance.toFixed(1)}%`;
    el.safeCount.textContent = stats.safeCount;
    el.criticalCount.textContent = stats.criticalCount + stats.borderlineCount;
}

function renderSubjectCards() {
    el.subjectsGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const subject of state.processedSubjects) {
        fragment.appendChild(createSubjectCard(subject));
    }
    el.subjectsGrid.appendChild(fragment);
}

// ---------------------------------------------------------------------------
// Subject card
// ---------------------------------------------------------------------------

function createSubjectCard(subject) {
    const card = el.subjectCardTemplate.content.cloneNode(true).querySelector('.subject-card');
    card.classList.add(`status-${subject.status}`);

    card.querySelector('.subject-name').textContent = subject.courseName;
    card.querySelector('.subject-code').textContent = subject.courseCode;

    const badge = card.querySelector('.status-badge');
    badge.classList.add(`badge-${subject.status}`);
    badge.querySelector('.badge-text').textContent = STATUS_LABELS[subject.status] ?? subject.status;

    // Percentage & progress
    card.querySelector('.percentage-value').textContent = subject.percentage.toFixed(1);
    const fill = card.querySelector('.progress-fill');
    fill.style.width = `${Math.min(100, Math.max(0, subject.percentage))}%`;
    fill.classList.add(`fill-${subject.status}`);
    const marker = card.querySelector('.threshold-marker');
    const labelT = card.querySelector('.label-threshold');
    marker.style.left = labelT.style.left = `${state.threshold}%`;
    labelT.textContent = `${state.threshold}%`;

    // Summary counts
    const isEffective = state.attendanceMode === 'TCBR_CORRECTED';
    card.querySelector('.conducted-value').textContent = subject.totalConducted;
    card.querySelector('.attended-value').textContent = isEffective ? subject.totalEffectiveAttended : subject.totalAttended;
    card.querySelector('.absent-value').textContent = subject.totalAbsent;

    // Action message
    setActionMessage(card, subject);

    // Components accordion
    buildComponentsSection(card, subject);

    // Simulation warning
    setSimulationWarning(card, subject);

    // Bunk indicator on card
    const subjectBunks = state.simulatedBunks[subject.courseCode] || {};
    if (Object.values(subjectBunks).some(n => n > 0)) card.classList.add('has-sim');

    // Weightage button
    const wBtn = card.querySelector('.weightage-btn');
    if (state.subjectWeightages[subject.courseCode]) {
        wBtn.querySelector('.weightage-custom-badge').classList.remove('hidden');
    }
    wBtn.addEventListener('click', () => openWeightageModal(subject));

    return card;
}

const STATUS_LABELS = { safe: '🟢 Safe', borderline: '🟡 Borderline', critical: '🔴 Critical' };

function setActionMessage(card, subject) {
    const icon = card.querySelector('.action-icon');
    const text = card.querySelector('.action-text');
    const msg = card.querySelector('.action-message');

    if (subject.percentage < state.threshold) {
        icon.textContent = '📈';
        msg.classList.add('action-attend');
        const needed = subject.totalClassesNeeded;
        if (needed === Infinity) {
            text.textContent = `Impossible to reach ${state.threshold}% — missed classes are permanent`;
            msg.classList.add('action-impossible');
        } else {
            const n = Math.min(needed, 200);
            text.textContent = `Attend ${n}${needed > 200 ? '+' : ''} more class${n !== 1 ? 'es' : ''} to reach ${state.threshold}%`;
        }
    } else {
        icon.textContent = '✨';
        msg.classList.add('action-skip');
        const skip = Math.min(subject.canSkip, 100);
        text.textContent = skip > 0
            ? `You can skip ${skip} class${skip !== 1 ? 'es' : ''} safely`
            : 'Stay on track — no room to skip';
    }
}

function buildComponentsSection(card, subject) {
    const grid = card.querySelector('.components-grid');
    const header = card.querySelector('.components-header');

    if (expandedCards.has(subject.courseCode)) {
        grid.classList.remove('collapsed');
        header.classList.add('expanded');
    }

    for (const [type, compData] of Object.entries(subject.componentData)) {
        grid.appendChild(createComponentItem(type, compData, subject));
    }

    header.addEventListener('click', () => {
        const collapsed = grid.classList.toggle('collapsed');
        header.classList.toggle('expanded', !collapsed);
        collapsed ? expandedCards.delete(subject.courseCode) : expandedCards.add(subject.courseCode);
    });
}

function setSimulationWarning(card, subject) {
    if (subject.status === 'critical') return;
    const weakType = subject.weakestComponent;
    if (!weakType) return;
    const sim = subject.componentData[weakType]?.nextClassSimulation;
    if (!sim?.wouldFallBelowThreshold) return;

    const warning = card.querySelector('.simulation-warning');
    warning.querySelector('.warning-text').textContent =
        `Missing next ${AttendanceCalculator.getLTPSInfo(weakType).name} class would drop you below ${state.threshold}%`;
    warning.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Component item
// ---------------------------------------------------------------------------

function createComponentItem(type, compData, subject) {
    const item = el.componentTemplate.content.cloneNode(true).querySelector('.component-item');
    const ltpsInfo = AttendanceCalculator.getLTPSInfo(type);
    const isEffective = state.attendanceMode === 'TCBR_CORRECTED';

    item.classList.add(`comp-${compData.status}`);
    item.querySelector('.component-icon').textContent = ltpsInfo.icon;
    item.querySelector('.component-type').textContent = ltpsInfo.name;
    item.querySelector('.component-percentage').textContent = `${compData.percentage.toFixed(1)}%`;

    const fill = item.querySelector('.component-progress-fill');
    fill.style.width = `${Math.min(100, Math.max(0, compData.percentage))}%`;
    fill.style.backgroundColor = ltpsInfo.color;

    const displayed = isEffective ? compData.effectiveAttended : compData.attended;
    item.querySelector('.component-attended').textContent = `${displayed}/${compData.conducted}`;

    const action = item.querySelector('.component-action');
    if (compData.classesNeeded === Infinity) {
        action.textContent = 'Impossible';
        action.style.color = 'var(--text-tertiary)';
    } else if (compData.classesNeeded > 0) {
        action.textContent = `+${Math.min(compData.classesNeeded, 100)} needed`;
        action.classList.add('need-classes');
    } else if (compData.canSkip > 0) {
        action.textContent = `${Math.min(compData.canSkip, 50)} skippable`;
        action.classList.add('can-skip');
    } else {
        action.textContent = 'On track';
        action.classList.add('on-track');
    }

    if (compData.simulatedBunks > 0) {
        const badge = item.querySelector('.bunk-sim-badge');
        badge.textContent = `-${compData.simulatedBunks} simulated`;
        badge.classList.remove('hidden');
    }

    item.querySelector('.bunk-btn').addEventListener('click', e => {
        e.stopPropagation();
        handleBunkClick(subject.courseCode, type, e.currentTarget);
    });

    return item;
}

// ---------------------------------------------------------------------------
// Bunk simulation
// ---------------------------------------------------------------------------

function handleBunkClick(courseCode, type, btnEl) {
    (state.simulatedBunks[courseCode] ??= {})[type] =
        (state.simulatedBunks[courseCode][type] || 0) + 1;
    spawnBunkFloat(btnEl);
    renderResults();
}

function resetBunkSimulations() {
    state.simulatedBunks = {};
    renderResults();
    showToast('Simulations cleared');
}

function spawnBunkFloat(anchor) {
    const rect = anchor.getBoundingClientRect();
    const label = Object.assign(document.createElement('div'), {
        className: 'bunk-float-label',
        textContent: '-1 bunk'
    });
    document.body.appendChild(label);
    label.style.left = `${rect.left + window.scrollX + (rect.width - label.offsetWidth) / 2}px`;
    label.style.top = `${rect.top + window.scrollY - 4}px`;
    label.addEventListener('animationend', () => label.remove(), { once: true });
}

function updateBunkSimBar() {
    let total = 0, subjects = 0;
    for (const bunks of Object.values(state.simulatedBunks)) {
        const sum = Object.values(bunks).reduce((a, b) => a + b, 0);
        if (sum > 0) { total += sum; subjects++; }
    }
    const visible = total > 0;
    el.bunkSimBar.classList.toggle('hidden', !visible);
    if (visible) {
        el.bunkSimBarText.textContent =
            `Simulating ${total} bunk${total !== 1 ? 's' : ''} across ${subjects} subject${subjects !== 1 ? 's' : ''}`;
    }
}

// ---------------------------------------------------------------------------
// Weightage modal
// ---------------------------------------------------------------------------

function openWeightageModal(subject) {
    activeWeightageSubject = subject.courseCode;
    document.getElementById('weightageModalSubject').textContent = subject.courseName;

    const container = document.getElementById('weightageSliders');
    container.innerHTML = '';
    const current = state.subjectWeightages[subject.courseCode] || {};

    for (const type of Object.keys(subject.componentData)) {
        const info = AttendanceCalculator.getLTPSInfo(type);
        const def = DEFAULT_WEIGHTAGES[type] ?? 100;
        const val = current[type] ?? def;
        const row = document.createElement('div');
        row.className = 'weightage-slider-row';
        row.innerHTML = `
            <div class="weightage-slider-label">
                <span class="weightage-slider-icon">${info.icon}</span>
                <span class="weightage-slider-name">${info.name} (${type})</span>
                <span class="weightage-default-hint">Default: ${def}%</span>
            </div>
            <div class="weightage-slider-control">
                <input type="range" min="0" max="100" step="5" value="${val}"
                    id="weightageSlider_${type}" class="weightage-range"
                    aria-label="${info.name} weightage">
                <div class="weightage-value-display">
                    <span class="weightage-value-number" id="weightageVal_${type}">${val}</span>
                    <span class="weightage-value-pct">%</span>
                </div>
            </div>`;
        container.appendChild(row);
        row.querySelector(`#weightageSlider_${type}`).addEventListener('input', e => {
            document.getElementById(`weightageVal_${type}`).textContent = e.target.value;
        });
    }

    const overlay = document.getElementById('weightageModalOverlay');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

function closeWeightageModal() {
    const overlay = document.getElementById('weightageModalOverlay');
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 250);
    activeWeightageSubject = null;
}

function applyWeightages() {
    if (!activeWeightageSubject) return;
    const subject = state.processedSubjects.find(s => s.courseCode === activeWeightageSubject);
    if (!subject) return;

    const newW = {};
    let isDefault = true;
    for (const type of Object.keys(subject.componentData)) {
        const input = document.getElementById(`weightageSlider_${type}`);
        if (!input) continue;
        const val = parseInt(input.value, 10);
        newW[type] = val;
        if (val !== (DEFAULT_WEIGHTAGES[type] ?? 100)) isDefault = false;
    }

    if (isDefault) delete state.subjectWeightages[activeWeightageSubject];
    else state.subjectWeightages[activeWeightageSubject] = newW;

    saveSettings();
    closeWeightageModal();
    renderResults();
    showToast('Weightages updated!');
}

function resetWeightages() {
    if (!activeWeightageSubject) return;
    const subject = state.processedSubjects.find(s => s.courseCode === activeWeightageSubject);
    if (!subject) return;
    for (const type of Object.keys(subject.componentData)) {
        const input = document.getElementById(`weightageSlider_${type}`);
        const disp = document.getElementById(`weightageVal_${type}`);
        const def = DEFAULT_WEIGHTAGES[type] ?? 100;
        if (input) input.value = def;
        if (disp) disp.textContent = def;
    }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function showToast(message) {
    const toast = Object.assign(document.createElement('div'), {
        className: 'toast',
        textContent: message
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function updateLastUpdated() {
    if (!state.lastFetched) return;
    const date = new Date(state.lastFetched);
    if (isNaN(date.getTime())) return;
    const modeLabel = state.attendanceMode === 'TCBR_CORRECTED' ? ' (TCBR)' : '';
    el.lastUpdated.textContent = formatRelativeTime(date) + modeLabel;
}

function formatRelativeTime(date) {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', init);
