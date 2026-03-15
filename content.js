/**
 * ERP Attendance Intelligence - Content Script
 * Scrapes attendance data from KL University ERP tables
 *
 * EXTRACTION RULES:
 * - Parse only <table><tbody><tr> rows
 * - Map columns by normalized header names, not index
 * - Extract only raw facts: courseCode, courseName, ltpsType, totalConducted, totalAttended, tcbr
 * - No percentages, no aggregation, no assumptions
 */

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action !== 'fetchAttendance') return;
    try {
        sendResponse({ success: true, data: scrapeAttendanceData() });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
    return true; // Keep channel open for async response
});

/**
 * Main scraping function — extracts attendance data from ERP tables.
 * @returns {{ subjects: Object, scrapedAt: string, pageUrl: string }}
 */
function scrapeAttendanceData() {
    const { table: attendanceTable, columnMap } = findAttendanceTable();

    if (!attendanceTable) {
        throw new Error('Could not find the attendance table. Please ensure you are on the correct ERP attendance page.');
    }

    const tbody = attendanceTable.querySelector('tbody') || attendanceTable;
    const subjects = {};

    for (const row of tbody.querySelectorAll('tr')) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;

        const rowData = extractRowData(cells, columnMap);
        if (!rowData || !validateRowData(rowData)) continue;

        const key = rowData.courseCode;
        if (!subjects[key]) {
            subjects[key] = { courseCode: key, courseName: rowData.courseName, components: {} };
        }
        subjects[key].components[rowData.ltpsType] = {
            conducted: rowData.totalConducted,
            attended: rowData.totalAttended,
            tcbr: rowData.tcbr
        };
        // Keep the longer/more descriptive name
        if (rowData.courseName.length > subjects[key].courseName.length) {
            subjects[key].courseName = rowData.courseName;
        }
    }

    if (Object.keys(subjects).length === 0) {
        throw new Error('No valid attendance data found. The table may be empty or in an unexpected format.');
    }

    return { subjects, scrapedAt: new Date().toISOString(), pageUrl: window.location.href };
}

/**
 * Locates the attendance table and builds its column map.
 * @returns {{ table: Element|null, columnMap: Object }}
 */
function findAttendanceTable() {
    const COLUMN_KEYS = {
        'coursecode': 'courseCode',
        'coursedesc': 'courseName',
        'ltps': 'ltpsType',
        'totalconducted': 'totalConducted',
        'totalattended': 'totalAttended',
        'totalabsent': 'totalAbsent',
        'tcbr': 'tcbr',
        'percentage': 'percentage'
    };

    for (const table of document.querySelectorAll('table')) {
        const thead = table.querySelector('thead');
        const firstRow = thead ? thead.querySelector('tr') : table.querySelector('tr');
        if (!firstRow) continue;

        const headers = firstRow.querySelectorAll('th, td');
        const normalized = Array.from(headers).map(h => h.innerText.replace(/\s+/g, '').toLowerCase());

        if (!normalized.includes('coursecode')) continue;
        if (!normalized.includes('totalconducted') && !normalized.includes('totalattended')) continue;

        const columnMap = {};
        normalized.forEach((key, i) => {
            if (COLUMN_KEYS[key]) columnMap[COLUMN_KEYS[key]] = i;
        });

        // Positional fallback if fewer than 3 columns were mapped by name
        if (Object.keys(columnMap).length < 3) {
            return { table, columnMap: buildPositionalColumnMap(headers.length) };
        }
        return { table, columnMap };
    }
    return { table: null, columnMap: {} };
}

/**
 * Positional column fallback for non-standard ERP table layouts.
 * @param {number} numCols
 * @returns {Object}
 */
function buildPositionalColumnMap(numCols) {
    if (numCols >= 8) {
        // Pattern: S.No | Code | Name | LTPS | Conducted | Attended | Absent | TCBR
        return { courseCode: 1, courseName: 2, ltpsType: 3, totalConducted: 4, totalAttended: 5, totalAbsent: 6, tcbr: 7 };
    }
    if (numCols >= 6) {
        // Compact pattern: Code | Name | LTPS | Conducted | Attended | TCBR
        return { courseCode: 0, courseName: 1, ltpsType: 2, totalConducted: 3, totalAttended: 4, tcbr: 5 };
    }
    return {};
}

/**
 * Extracts a single row's attendance data from table cells.
 * @param {NodeList} cells
 * @param {Object} columnMap
 * @returns {Object|null}
 */
function extractRowData(cells, columnMap) {
    const text = idx => (idx !== undefined && idx < cells.length)
        ? cells[idx].innerText.trim() : '';
    const num = idx => {
        const n = parseInt(text(idx).replace(/[^0-9-]/g, ''), 10);
        return isNaN(n) ? 0 : n;
    };

    const courseCode = text(columnMap.courseCode) || (cells[0]?.innerText.trim() ?? '');
    if (!courseCode || courseCode.toLowerCase() === 's.no' || /^\d+$/.test(courseCode)) {
        return null;
    }

    const ltpsRaw = text(columnMap.ltpsType).toUpperCase();
    const ltpsType = ['L', 'T', 'P', 'S'].includes(ltpsRaw) ? ltpsRaw : 'L';

    return {
        courseCode,
        courseName: text(columnMap.courseName).replace(/\s*[-–]\s*[LTPS]\s*$/i, '').trim(),
        ltpsType,
        totalConducted: num(columnMap.totalConducted),
        totalAttended: num(columnMap.totalAttended),
        tcbr: num(columnMap.tcbr)
    };
}

/**
 * Validates extracted row data for sanity.
 * @param {Object} rowData
 * @returns {boolean}
 */
function validateRowData(rowData) {
    const { totalConducted: c, totalAttended: a } = rowData;
    return c >= 0 && a >= 0 && c <= 300 && a <= c;
}
