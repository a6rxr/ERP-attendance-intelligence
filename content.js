/**
 * ERP Attendance Intelligence - Content Script
 * Scrapes attendance data from KL University ERP tables
 * 
 * EXTRACTION RULES:
 * - Parse ONLY <table><tbody><tr> rows
 * - Map columns by header names (not index)
 * - Extract ONLY raw facts: courseCode, courseName, ltpsType, totalConducted, totalAttended, tcbr
 * - NO percentages, NO aggregation, NO assumptions
 */

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchAttendance') {
        try {
            const attendanceData = scrapeAttendanceData();
            sendResponse({ success: true, data: attendanceData });
        } catch (error) {
            // console.error('[ERP Extension] Scraping error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    return true; // Keep message channel open for async response
});

/**
 * Main scraping function - extracts attendance data from ERP tables
 * @returns {Object} Structured attendance data grouped by subject and LTPS components
 */
function scrapeAttendanceData() {
    // Find all tables on the page
    const tables = document.querySelectorAll('table');
    let attendanceTable = null;
    let headerRow = null;
    let columnMap = {};

    // Look for table containing attendance data by checking headers
    for (const table of tables) {
        const thead = table.querySelector('thead');
        const firstRow = thead ? thead.querySelector('tr') : table.querySelector('tr');

        if (!firstRow) continue;

        const headers = firstRow.querySelectorAll('th, td');
        const headerTexts = Array.from(headers).map(h => h.innerText.trim().toLowerCase());

        // Normalize header texts for strict matching
        const normalizedHeaders = Array.from(headers).map(h =>
            h.innerText.replace(/\s+/g, '').toLowerCase()
        );

        // Check if this table has expected attendance columns using normalized keys
        const hasCode = normalizedHeaders.some(h => h === 'coursecode');
        const hasConducted = normalizedHeaders.some(h => h === 'totalconducted');
        const hasAttended = normalizedHeaders.some(h => h === 'totalattended');

        if (hasCode && (hasConducted || hasAttended)) {
            attendanceTable = table;
            headerRow = firstRow;

            // Build column index map from normalized headers
            headers.forEach((header, index) => {
                const normalized = header.innerText.replace(/\s+/g, '').toLowerCase();

                // Map using strict normalized key matching
                switch (normalized) {
                    case 'coursecode':
                        columnMap.courseCode = index;
                        break;
                    case 'coursedesc':
                        columnMap.courseName = index;
                        break;
                    case 'ltps':
                        columnMap.ltpsType = index;
                        break;
                    case 'totalconducted':
                        columnMap.totalConducted = index;
                        break;
                    case 'totalattended':
                        columnMap.totalAttended = index;
                        break;
                    case 'totalabsent':
                        columnMap.totalAbsent = index;
                        break;
                    case 'tcbr':
                        columnMap.tcbr = index;
                        break;
                    case 'percentage':
                        columnMap.percentage = index;
                        break;
                }
            });

            break;
        }
    }

    if (!attendanceTable) {
        throw new Error('Could not find attendance table on this page. Please ensure you are on the correct ERP attendance page.');
    }

    // Log column mapping for debugging
    // console.log('[ERP Extension] Column mapping:', columnMap);

    // If we couldn't map columns by name, try positional fallback
    if (Object.keys(columnMap).length < 3) {
        // console.warn('[ERP Extension] Few columns mapped by name, using positional fallback');
        columnMap = buildPositionalColumnMap(headerRow);
    }

    // Extract data from tbody rows
    const tbody = attendanceTable.querySelector('tbody') || attendanceTable;
    const rows = tbody.querySelectorAll('tr');
    const subjects = {};
    let skippedRows = 0;

    for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue; // Skip rows with too few cells (likely header)

        const rowData = extractRowData(cells, columnMap);

        if (!rowData) {
            skippedRows++;
            continue;
        }

        // Sanity checks - discard invalid rows
        if (!validateRowData(rowData)) {
            skippedRows++;
            continue;
        }

        // Group by subject code
        const subjectKey = rowData.courseCode;

        if (!subjects[subjectKey]) {
            subjects[subjectKey] = {
                courseCode: rowData.courseCode,
                courseName: rowData.courseName,
                components: {}
            };
        }

        // Add LTPS component (raw facts only)
        subjects[subjectKey].components[rowData.ltpsType] = {
            conducted: rowData.totalConducted,
            attended: rowData.totalAttended,
            tcbr: rowData.tcbr
        };

        // Update course name if this one is longer/better
        if (rowData.courseName.length > subjects[subjectKey].courseName.length) {
            subjects[subjectKey].courseName = rowData.courseName;
        }
    }

    if (Object.keys(subjects).length === 0) {
        throw new Error('No valid attendance data found. The table may be empty or in an unexpected format.');
    }

    // console.log(`[ERP Extension] Extracted ${Object.keys(subjects).length} subjects, skipped ${skippedRows} invalid rows`);

    return {
        subjects: subjects,
        scrapedAt: new Date().toISOString(),
        pageUrl: window.location.href
    };
}

/**
 * Build column map based on common positional patterns when headers don't match
 */
function buildPositionalColumnMap(headerRow) {
    const headers = headerRow ? headerRow.querySelectorAll('th, td') : [];
    const numCols = headers.length;

    // Common ERP patterns:
    // Pattern A: S.No | Code | Name | LTPS | Conducted | Attended | Absent | TCBR | %
    // Pattern B: Code | Name | Type | Total | Present | Absent | Before | Percentage

    const map = {};

    if (numCols >= 8) {
        // Assume pattern with S.No first
        map.courseCode = 1;
        map.courseName = 2;
        map.ltpsType = 3;
        map.totalConducted = 4;
        map.totalAttended = 5;
        map.totalAbsent = 6;
        map.tcbr = 7;
    } else if (numCols >= 6) {
        // Compact pattern
        map.courseCode = 0;
        map.courseName = 1;
        map.ltpsType = 2;
        map.totalConducted = 3;
        map.totalAttended = 4;
        map.tcbr = 5;
    }

    return map;
}

/**
 * Extract raw attendance data from a table row
 * @param {NodeList} cells - Table cells
 * @param {Object} columnMap - Column indices
 * @returns {Object|null} Extracted raw data or null if invalid
 */
function extractRowData(cells, columnMap) {
    const getCellValue = (index) => {
        if (index === undefined || index >= cells.length) return '';
        return cells[index].innerText.trim();
    };

    const getCellNumber = (index) => {
        const val = getCellValue(index);
        const num = parseInt(val.replace(/[^0-9-]/g, ''), 10);
        return isNaN(num) ? 0 : num;
    };

    // Extract course code
    let courseCode = getCellValue(columnMap.courseCode);
    if (!courseCode) {
        // Try first cell as fallback
        courseCode = cells[0] ? cells[0].innerText.trim() : '';
    }

    // Skip if no valid course code
    if (!courseCode || courseCode.toLowerCase() === 's.no' || /^\d+$/.test(courseCode)) {
        return null;
    }

    // Extract course name
    let courseName = getCellValue(columnMap.courseName);

    // Extract LTPS type
    let ltpsType = getCellValue(columnMap.ltpsType).toUpperCase();

    // Validate LTPS type
    if (!['L', 'T', 'P', 'S'].includes(ltpsType)) {
        // Try to extract from course name or other cells
        const allText = Array.from(cells).map(c => c.innerText).join(' ');
        const ltpsMatch = allText.match(/\b([LTPS])\b/);
        if (ltpsMatch) {
            ltpsType = ltpsMatch[1];
        } else {
            ltpsType = 'L'; // Default to Lecture if not found
        }
    }

    // Extract numeric values
    const totalConducted = getCellNumber(columnMap.totalConducted);
    const totalAttended = getCellNumber(columnMap.totalAttended);
    const tcbr = getCellNumber(columnMap.tcbr);

    // Clean course name - remove trailing LTPS indicator if present
    courseName = courseName.replace(/\s*[-–]\s*[LTPS]\s*$/i, '').trim();

    return {
        courseCode: courseCode,
        courseName: courseName,
        ltpsType: ltpsType,
        totalConducted: totalConducted,
        totalAttended: totalAttended,
        tcbr: tcbr
    };
}

/**
 * Validate row data with sanity guards
 * @param {Object} rowData - Extracted row data
 * @returns {boolean} True if valid, false if should be discarded
 */
function validateRowData(rowData) {
    // Guard: conducted > 300 is unreasonable
    if (rowData.totalConducted > 300) {
        // console.warn(`[ERP Extension] Discarding row: conducted (${rowData.totalConducted}) > 300`, rowData);
        return false;
    }

    // Guard: attended > conducted is invalid
    if (rowData.totalAttended > rowData.totalConducted) {
        // console.warn(`[ERP Extension] Discarding row: attended (${rowData.totalAttended}) > conducted (${rowData.totalConducted})`, rowData);
        return false;
    }

    // Guard: negative values are invalid
    if (rowData.totalConducted < 0 || rowData.totalAttended < 0) {
        // console.warn(`[ERP Extension] Discarding row: negative values`, rowData);
        return false;
    }

    // Guard: TCBR should not exceed conducted
    if (rowData.tcbr > rowData.totalConducted) {
        // console.warn(`[ERP Extension] Discarding row: tcbr (${rowData.tcbr}) > conducted (${rowData.totalConducted})`, rowData);
        return false;
    }

    return true;
}

// Log that content script is loaded
// console.log('🎓 ERP Attendance Intelligence - Content Script Loaded');
