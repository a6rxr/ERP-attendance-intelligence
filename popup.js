/**
 * ERP Attendance Intelligence - Popup Script
 * Main UI controller and event handling
 * 
 * ATTENDANCE MODE:
 * - "ERP" - Uses raw attended value (matches ERP display)
 * - "TCBR_CORRECTED" - Adds TCBR to attended for effective attendance
 */

// DOM Elements
const elements = {
    // Theme & Settings
    themeToggle: null,
    settingsBtn: null,
    settingsPanel: null,
    thresholdInput: null,
    sortSelect: null,
    saveSettingsBtn: null,
    attendanceModeSelect: null,

    // Stats Bar
    statsBar: null,
    totalSubjects: null,
    avgAttendance: null,
    safeCount: null,
    criticalCount: null,

    // States
    initialState: null,
    loadingState: null,
    errorState: null,
    resultsContainer: null,

    // Buttons
    fetchBtn: null,
    retryBtn: null,
    refreshBtn: null,

    // Results
    subjectsGrid: null,
    alertBanner: null,
    alertMessage: null,
    errorMessage: null,
    lastUpdated: null,

    // Templates
    subjectCardTemplate: null,
    componentTemplate: null
};

// App State
let state = {
    theme: 'light',
    threshold: 75,
    sortBy: 'danger',
    attendanceMode: 'ERP', // "ERP" or "TCBR_CORRECTED"
    attendanceData: null,
    processedSubjects: [],
    lastFetched: null
};

/**
 * Initialize the popup
 */
async function init() {
    // Cache DOM elements
    cacheElements();

    // Inject attendance mode setting if not present
    injectAttendanceModeSetting();

    // Load saved settings
    await loadSettings();

    // Apply saved theme
    applyTheme(state.theme);

    // Set calculator mode
    AttendanceCalculator.setMode(state.attendanceMode);

    // Set up event listeners
    setupEventListeners();

    // Update UI with saved settings
    updateSettingsUI();

    // If we have cached data, render it
    if (state.attendanceData) {
        renderResults();
    }
}

/**
 * Inject the attendance mode setting into the settings panel
 */
function injectAttendanceModeSetting() {
    const settingsContent = document.querySelector('.settings-content');
    if (!settingsContent) return;

    // Check if already injected
    if (document.getElementById('attendanceModeSelect')) return;

    // Create the attendance mode setting
    const settingItem = document.createElement('div');
    settingItem.className = 'setting-item';
    settingItem.innerHTML = `
    <label>
      <span class="setting-label">Attendance Mode</span>
      <span class="setting-hint">How to calculate attendance</span>
    </label>
    <select id="attendanceModeSelect">
      <option value="ERP">ERP Standard</option>
      <option value="TCBR_CORRECTED">TCBR-Corrected</option>
    </select>
  `;

    // Insert before the save button
    const saveBtn = settingsContent.querySelector('.save-settings-btn');
    if (saveBtn) {
        settingsContent.insertBefore(settingItem, saveBtn);
    } else {
        settingsContent.appendChild(settingItem);
    }
}

/**
 * Cache all DOM elements for performance
 */
function cacheElements() {
    elements.themeToggle = document.getElementById('themeToggle');
    elements.settingsBtn = document.getElementById('settingsBtn');
    elements.settingsPanel = document.getElementById('settingsPanel');
    elements.thresholdInput = document.getElementById('thresholdInput');
    elements.sortSelect = document.getElementById('sortSelect');
    elements.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    elements.attendanceModeSelect = document.getElementById('attendanceModeSelect');

    elements.statsBar = document.getElementById('statsBar');
    elements.totalSubjects = document.getElementById('totalSubjects');
    elements.avgAttendance = document.getElementById('avgAttendance');
    elements.safeCount = document.getElementById('safeCount');
    elements.criticalCount = document.getElementById('criticalCount');

    elements.initialState = document.getElementById('initialState');
    elements.loadingState = document.getElementById('loadingState');
    elements.errorState = document.getElementById('errorState');
    elements.resultsContainer = document.getElementById('resultsContainer');

    elements.fetchBtn = document.getElementById('fetchBtn');
    elements.retryBtn = document.getElementById('retryBtn');
    elements.refreshBtn = document.getElementById('refreshBtn');

    elements.subjectsGrid = document.getElementById('subjectsGrid');
    elements.alertBanner = document.getElementById('alertBanner');
    elements.alertMessage = document.getElementById('alertMessage');
    elements.errorMessage = document.getElementById('errorMessage');
    elements.lastUpdated = document.getElementById('lastUpdated');

    elements.subjectCardTemplate = document.getElementById('subjectCardTemplate');
    elements.componentTemplate = document.getElementById('componentTemplate');
}

/**
 * Load settings from chrome.storage
 */
async function loadSettings() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['theme', 'threshold', 'sortBy', 'attendanceMode', 'lastData'], (result) => {
                if (result.theme) state.theme = result.theme;
                if (result.threshold) state.threshold = result.threshold;
                if (result.sortBy) state.sortBy = result.sortBy;
                if (result.attendanceMode) state.attendanceMode = result.attendanceMode;
                if (result.lastData) {
                    state.attendanceData = result.lastData.data;
                    state.lastFetched = result.lastData.timestamp;
                }
                resolve();
            });
        } else {
            // Fallback for testing outside extension context
            const saved = localStorage.getItem('erpAttendanceSettings');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    state = { ...state, ...parsed };
                } catch (e) {
                    // Fail silently, use defaults
                }
            }
            resolve();
        }
    });
}

/**
 * Save settings to chrome.storage
 */
async function saveSettings() {
    const settingsToSave = {
        theme: state.theme,
        threshold: state.threshold,
        sortBy: state.sortBy,
        attendanceMode: state.attendanceMode
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set(settingsToSave);
    } else {
        localStorage.setItem('erpAttendanceSettings', JSON.stringify(settingsToSave));
    }
}

/**
 * Save attendance data for persistence
 */
async function saveAttendanceData() {
    if (!state.attendanceData) return;

    const dataToSave = {
        lastData: {
            data: state.attendanceData,
            timestamp: state.lastFetched
        }
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set(dataToSave);
    }
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Settings panel
    elements.settingsBtn.addEventListener('click', toggleSettings);
    elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);

    // Fetch buttons
    elements.fetchBtn.addEventListener('click', fetchAttendanceData);
    elements.retryBtn.addEventListener('click', fetchAttendanceData);
    elements.refreshBtn.addEventListener('click', fetchAttendanceData);

    // Keyboard accessibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            elements.settingsPanel.classList.add('hidden');
        }
    });
}

/**
 * Update settings UI with current state
 */
function updateSettingsUI() {
    elements.thresholdInput.value = state.threshold;
    elements.sortSelect.value = state.sortBy;

    // Re-cache attendance mode select after injection
    elements.attendanceModeSelect = document.getElementById('attendanceModeSelect');
    if (elements.attendanceModeSelect) {
        elements.attendanceModeSelect.value = state.attendanceMode;
    }
}

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    saveSettings();
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${theme}-theme`);
}

/**
 * Toggle settings panel visibility
 */
function toggleSettings() {
    elements.settingsPanel.classList.toggle('hidden');
}

/**
 * Handle save settings button click
 */
function handleSaveSettings() {
    const newThreshold = parseInt(elements.thresholdInput.value, 10);
    const newSort = elements.sortSelect.value;

    // Re-cache in case it wasn't available during init
    elements.attendanceModeSelect = document.getElementById('attendanceModeSelect');
    const newMode = elements.attendanceModeSelect ? elements.attendanceModeSelect.value : state.attendanceMode;

    // Validate threshold
    if (isNaN(newThreshold) || newThreshold < 0 || newThreshold > 100) {
        elements.thresholdInput.classList.add('input-error');
        setTimeout(() => elements.thresholdInput.classList.remove('input-error'), 1000);
        return;
    }

    // Check if mode changed
    const modeChanged = state.attendanceMode !== newMode;

    state.threshold = newThreshold;
    state.sortBy = newSort;
    state.attendanceMode = newMode;

    // Update calculator mode
    AttendanceCalculator.setMode(state.attendanceMode);

    saveSettings();

    // Re-render if we have data
    if (state.attendanceData) {
        renderResults();
    }

    // Close panel with animation
    elements.settingsPanel.classList.add('hidden');

    // Show save confirmation with mode info if changed
    if (modeChanged) {
        showToast(`Mode: ${AttendanceCalculator.getModeDisplayText()}`);
    } else {
        showToast('Settings saved!');
    }
}

/**
 * Show a toast notification
 */
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

/**
 * Show a specific state (initial, loading, error, or results)
 */
function showState(stateName) {
    elements.initialState.classList.add('hidden');
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.resultsContainer.classList.add('hidden');
    elements.statsBar.classList.add('hidden');

    switch (stateName) {
        case 'initial':
            elements.initialState.classList.remove('hidden');
            elements.refreshBtn.classList.add('hidden');
            break;
        case 'loading':
            elements.loadingState.classList.remove('hidden');
            break;
        case 'error':
            elements.errorState.classList.remove('hidden');
            elements.refreshBtn.classList.add('hidden');
            break;
        case 'results':
            elements.resultsContainer.classList.remove('hidden');
            elements.statsBar.classList.remove('hidden');
            elements.refreshBtn.classList.remove('hidden');
            break;
    }
}

/**
 * Fetch attendance data from content script
 */
async function fetchAttendanceData() {
    showState('loading');

    try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            throw new Error('No active tab found.');
        }

        // Check if we're on the correct domain
        if (!tab.url || !tab.url.includes('newerp.kluniversity.in')) {
            throw new Error('Please navigate to the KL University ERP attendance page first.');
        }

        // Send message to content script
        let response;
        try {
            response = await chrome.tabs.sendMessage(tab.id, { action: 'fetchAttendance' });
        } catch (msgError) {
            throw new Error('ERP page not ready. Please refresh the page and try again.');
        }

        if (!response) {
            throw new Error('Could not communicate with the page. Please refresh and try again.');
        }

        if (!response.success) {
            throw new Error(response.error || 'Failed to fetch attendance data.');
        }

        // Store the data
        state.attendanceData = response.data;
        state.lastFetched = new Date().toISOString();

        // Save for persistence
        saveAttendanceData();

        // Render results
        renderResults();

    } catch (error) {
        // console.error('Fetch error:', error); // Removed for production
        elements.errorMessage.textContent = error.message || 'An unexpected error occurred.';
        showState('error');
    }
}

/**
 * Render all results
 */
function renderResults() {
    if (!state.attendanceData) {
        showState('initial');
        return;
    }

    // Ensure calculator is using current mode
    AttendanceCalculator.setMode(state.attendanceMode);

    // Process subjects with calculations
    state.processedSubjects = AttendanceCalculator.processAllSubjects(
        state.attendanceData,
        state.threshold
    );

    // Sort subjects
    state.processedSubjects = AttendanceCalculator.sortSubjects(
        state.processedSubjects,
        state.sortBy
    );

    // Calculate aggregate stats
    const stats = AttendanceCalculator.calculateAggregateStats(
        state.processedSubjects,
        state.threshold
    );

    // Update stats bar
    updateStatsBar(stats);

    // Update alert banner if needed
    updateAlertBanner(stats);

    // Render subject cards
    renderSubjectCards();

    // Update last updated time
    updateLastUpdated();

    // Show results
    showState('results');
}

/**
 * Update stats bar with aggregate data
 */
function updateStatsBar(stats) {
    elements.totalSubjects.textContent = stats.totalSubjects;
    elements.avgAttendance.textContent = `${stats.averageAttendance.toFixed(1)}%`;
    elements.safeCount.textContent = stats.safeCount;
    elements.criticalCount.textContent = stats.criticalCount + stats.borderlineCount;
}

/**
 * Update alert banner for most at-risk subject
 */
function updateAlertBanner(stats) {
    if (stats.mostAtRisk && stats.mostAtRisk.status === 'critical') {
        const subject = stats.mostAtRisk;
        const needed = subject.totalClassesNeeded;
        elements.alertMessage.textContent =
            `${subject.courseName} is at ${subject.percentage.toFixed(1)}%. ` +
            (needed > 0 ? `Attend ${needed} more class${needed !== 1 ? 'es' : ''} to recover.` : '');
        elements.alertBanner.classList.remove('hidden');
    } else {
        elements.alertBanner.classList.add('hidden');
    }
}

/**
 * Render all subject cards
 */
function renderSubjectCards() {
    // Clear existing cards
    elements.subjectsGrid.innerHTML = '';

    // Create cards for each subject
    for (const subject of state.processedSubjects) {
        const card = createSubjectCard(subject);
        elements.subjectsGrid.appendChild(card);
    }
}

/**
 * Create a subject card element
 */
function createSubjectCard(subject) {
    const template = elements.subjectCardTemplate.content.cloneNode(true);
    const card = template.querySelector('.subject-card');

    // Add status class
    card.classList.add(`status-${subject.status}`);

    // Subject info
    card.querySelector('.subject-name').textContent = subject.courseName;
    card.querySelector('.subject-code').textContent = subject.courseCode;

    // Status badge
    const badge = card.querySelector('.status-badge');
    const badgeText = card.querySelector('.badge-text');
    badge.classList.add(`badge-${subject.status}`);
    badgeText.textContent = getStatusLabel(subject.status);

    // Percentage display
    card.querySelector('.percentage-value').textContent = subject.percentage.toFixed(1);

    // Progress bar
    const progressFill = card.querySelector('.progress-fill');
    const thresholdMarker = card.querySelector('.threshold-marker');
    const labelThreshold = card.querySelector('.label-threshold');
    progressFill.style.width = `${Math.min(100, Math.max(0, subject.percentage))}%`;
    progressFill.classList.add(`fill-${subject.status}`);
    thresholdMarker.style.left = `${state.threshold}%`;
    labelThreshold.style.left = `${state.threshold}%`;
    labelThreshold.textContent = `${state.threshold}%`;

    // Summary values - show effective values based on mode
    card.querySelector('.conducted-value').textContent = subject.totalConducted;
    card.querySelector('.attended-value').textContent =
        state.attendanceMode === 'TCBR_CORRECTED'
            ? subject.totalEffectiveAttended
            : subject.totalAttended;
    card.querySelector('.absent-value').textContent = subject.totalAbsent;

    // Action message
    const actionIcon = card.querySelector('.action-icon');
    const actionText = card.querySelector('.action-text');
    const actionMessage = card.querySelector('.action-message');

    if (subject.status === 'critical' || subject.percentage < state.threshold) {
        actionIcon.textContent = '📈';
        const needed = subject.totalClassesNeeded;

        if (needed === Infinity) {
            actionText.textContent = `Impossible to reach ${state.threshold}% (missed classes are permanent)`;
            actionMessage.classList.add('action-impossible');
            // Add CSS class for impossible state if not exists, reusing critical style for now
            actionMessage.style.backgroundColor = 'var(--bg-secondary)';
            actionMessage.style.border = '1px solid var(--border-strong)';
            actionText.style.color = 'var(--text-tertiary)';
        } else {
            // For very large numbers, show as 200+
            const displayNeeded = needed > 200 ? '200+' : needed;
            actionText.textContent = `Attend ${displayNeeded} more class${needed !== 1 ? 'es' : ''} to reach ${state.threshold}%`;
            actionMessage.classList.add('action-attend');
        }
    } else {
        actionIcon.textContent = '✨';
        const canSkip = Math.min(subject.canSkip, 100); // Sanity display cap
        actionText.textContent = canSkip > 0
            ? `You can skip ${canSkip} class${canSkip !== 1 ? 'es' : ''} safely`
            : 'Stay on track - no room to skip';
        actionMessage.classList.add('action-skip');
    }

    // Components section
    const componentsGrid = card.querySelector('.components-grid');
    const componentsHeader = card.querySelector('.components-header');

    // Add component items
    for (const type of Object.keys(subject.componentData)) {
        const compData = subject.componentData[type];
        const componentEl = createComponentItem(type, compData);
        componentsGrid.appendChild(componentEl);
    }

    // Toggle components visibility
    componentsHeader.addEventListener('click', () => {
        componentsGrid.classList.toggle('collapsed');
        componentsHeader.classList.toggle('expanded');
    });

    // Simulation warning (if missing next class would be critical)
    if (subject.status !== 'critical') {
        const weakestType = subject.weakestComponent;
        if (weakestType && subject.componentData[weakestType]) {
            const sim = subject.componentData[weakestType].nextClassSimulation;
            if (sim && sim.wouldFallBelowThreshold) {
                const warning = card.querySelector('.simulation-warning');
                warning.querySelector('.warning-text').textContent =
                    `⚠️ Missing next ${AttendanceCalculator.getLTPSInfo(weakestType).name} class would drop you below ${state.threshold}%`;
                warning.classList.remove('hidden');
            }
        }
    }

    return card;
}

/**
 * Create a component item element
 */
function createComponentItem(type, compData) {
    const template = elements.componentTemplate.content.cloneNode(true);
    const item = template.querySelector('.component-item');

    const ltpsInfo = AttendanceCalculator.getLTPSInfo(type);

    // Add status class
    item.classList.add(`comp-${compData.status}`);

    // Component header
    item.querySelector('.component-icon').textContent = ltpsInfo.icon;
    item.querySelector('.component-type').textContent = ltpsInfo.name;
    item.querySelector('.component-percentage').textContent = `${compData.percentage.toFixed(1)}%`;

    // Progress bar
    const progressFill = item.querySelector('.component-progress-fill');
    progressFill.style.width = `${Math.min(100, Math.max(0, compData.percentage))}%`;
    progressFill.style.backgroundColor = ltpsInfo.color;

    // Stats - show effective attended in TCBR_CORRECTED mode
    const displayAttended = state.attendanceMode === 'TCBR_CORRECTED'
        ? compData.effectiveAttended
        : compData.attended;
    item.querySelector('.component-attended').textContent =
        `${displayAttended}/${compData.conducted}`;

    const actionSpan = item.querySelector('.component-action');
    if (compData.classesNeeded > 0) {
        if (compData.classesNeeded === Infinity) {
            actionSpan.textContent = 'Impossible';
            actionSpan.classList.add('need-classes'); // Reuse style or add specific one
            actionSpan.style.color = 'var(--text-tertiary)';
        } else {
            const needed = Math.min(compData.classesNeeded, 100); // Sanity cap for display
            actionSpan.textContent = `+${needed} needed`;
            actionSpan.classList.add('need-classes');
        }
    } else if (compData.canSkip > 0) {
        const skip = Math.min(compData.canSkip, 50); // Sanity cap for display
        actionSpan.textContent = `${skip} skippable`;
        actionSpan.classList.add('can-skip');
    } else {
        actionSpan.textContent = 'On track';
        actionSpan.classList.add('on-track');
    }

    return item;
}

/**
 * Get human-readable status label
 */
function getStatusLabel(status) {
    switch (status) {
        case 'safe': return '🟢 Safe';
        case 'borderline': return '🟡 Borderline';
        case 'critical': return '🔴 Critical';
        default: return status;
    }
}

/**
 * Update last updated timestamp
 */
function updateLastUpdated() {
    if (state.lastFetched) {
        const date = new Date(state.lastFetched);
        const modeLabel = state.attendanceMode === 'TCBR_CORRECTED' ? ' (TCBR)' : '';
        elements.lastUpdated.textContent = formatRelativeTime(date) + modeLabel;
    }
}

/**
 * Format date as relative time
 */
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
