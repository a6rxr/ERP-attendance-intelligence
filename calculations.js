/**
 * ERP Attendance Intelligence — Calculations Module
 *
 * All mathematical logic for attendance calculations and simulations.
 *
 * ATTENDANCE MODES:
 *   "ERP"            — uses raw attended value (matches ERP display)
 *   "TCBR_CORRECTED" — adds TCBR to attended for effective attendance
 *
 * KEY FORMULA:
 *   effectiveAttended = mode === "TCBR_CORRECTED" ? attended + tcbr : attended
 *   componentPct      = (effectiveAttended / conducted) * 100
 *   subjectPct        = weighted average of all component percentages
 */

/** Default weightage for each LTPS component type (0–100 scale). */
const DEFAULT_WEIGHTAGES = { L: 100, T: 100, P: 100, S: 100 };

const AttendanceCalculator = {

    /** @type {"ERP"|"TCBR_CORRECTED"} */
    attendanceMode: 'ERP',

    /** @param {"ERP"|"TCBR_CORRECTED"} mode */
    setMode(mode) {
        this.attendanceMode = (mode === 'ERP' || mode === 'TCBR_CORRECTED') ? mode : 'ERP';
    },

    /** @returns {string} Human-readable mode label */
    getModeDisplayText() {
        return this.attendanceMode === 'TCBR_CORRECTED' ? 'TCBR-Corrected' : 'ERP Standard';
    },

    /**
     * Effective attended count for the current mode.
     * @param {number} attended
     * @param {number} tcbr
     */
    getEffectiveAttended(attended, tcbr) {
        return this.attendanceMode === 'TCBR_CORRECTED' ? attended + (tcbr || 0) : attended;
    },

    /**
     * Attendance percentage for a single component.
     * Returns 100 when nothing has been conducted (no penalty for zero-conducted components).
     */
    calculateComponentPercentage(attended, conducted, tcbr = 0) {
        if (conducted <= 0) return 100;
        const pct = (this.getEffectiveAttended(attended, tcbr) / conducted) * 100;
        return Math.min(100, Math.max(0, pct));
    },

    /**
     * Weighted-average attendance across all components.
     * Components with weightage=0 are excluded from the average.
     * @param {Object} components  Raw LTPS component map
     * @param {Object} weightages  Per-type overrides (0–100)
     */
    calculateSubjectPercentage(components, weightages = {}) {
        let weightedSum = 0, totalWeight = 0;
        for (const [type, comp] of Object.entries(components)) {
            if (comp.conducted <= 0) continue;
            const pct = this.calculateComponentPercentage(comp.attended, comp.conducted, comp.tcbr || 0);
            const w = ((weightages[type] ?? DEFAULT_WEIGHTAGES[type] ?? 100)) / 100;
            weightedSum += pct * w;
            totalWeight += w;
        }
        return totalWeight === 0 ? 100 : weightedSum / totalWeight;
    },

    /**
     * Status bucket based on distance from threshold.
     * @returns {"safe"|"borderline"|"critical"}
     */
    getStatus(percentage, threshold) {
        if (percentage >= threshold + 5) return 'safe';
        if (percentage >= threshold) return 'borderline';
        return 'critical';
    },

    /** Higher score = more danger. Used for default sort. */
    calculateDangerScore(percentage, threshold) {
        return percentage >= threshold
            ? Math.max(0, threshold + 10 - percentage)
            : 50 + (threshold - percentage);
    },

    /**
     * Consecutive classes needed to reach `threshold`.
     * Returns Infinity when the threshold is mathematically unreachable.
     * Formula: x = ceil((T*C - A*100) / (100 - T))  where T=threshold, C=conducted, A=effectiveAttended
     */
    classesNeededToReachThreshold(attended, conducted, threshold, tcbr = 0) {
        const effective = this.getEffectiveAttended(attended, tcbr);
        if (this.calculateComponentPercentage(attended, conducted, tcbr) >= threshold) return 0;
        if (threshold >= 100) return effective < conducted ? Infinity : 0;

        const numerator = (threshold / 100) * conducted - effective;
        const denominator = 1 - threshold / 100;
        if (denominator <= 0) return Infinity;
        return Math.max(0, Math.ceil(numerator / denominator));
    },

    /**
     * Maximum classes that can be skipped while staying at / above `threshold`.
     * Formula: x = floor((A - T*C/100) / (T/100))
     */
    classesCanSkip(attended, conducted, threshold, tcbr = 0) {
        const effective = this.getEffectiveAttended(attended, tcbr);
        if (this.calculateComponentPercentage(attended, conducted, tcbr) < threshold) return 0;
        if (threshold <= 0) return 999;

        const t = threshold / 100;
        return Math.max(0, Math.floor((effective - t * conducted) / t));
    },

    /**
     * What happens if the very next class is missed?
     * @returns {{ currentPercentage, newPercentage, percentageDrop, wouldFallBelowThreshold, isAlreadyBelowThreshold }}
     */
    simulateMissNextClass(attended, conducted, threshold, tcbr = 0) {
        const current = this.calculateComponentPercentage(attended, conducted, tcbr);
        const next = this.calculateComponentPercentage(attended, conducted + 1, tcbr);
        return {
            currentPercentage: current,
            newPercentage: next,
            percentageDrop: current - next,
            wouldFallBelowThreshold: current >= threshold && next < threshold,
            isAlreadyBelowThreshold: current < threshold
        };
    },

    /**
     * Full simulation for a subject — applies simulated bunks as an overlay on `conducted`,
     * then calculates all component-level and subject-level statistics.
     *
     * @param {Object} components      Raw LTPS component map (never mutated)
     * @param {number} threshold
     * @param {Object} weightages      Per-type weightage overrides
     * @param {Object} simulatedBunks  Extra absences to overlay: { L: n, T: n, … }
     */
    calculateSubjectSimulation(components, threshold, weightages = {}, simulatedBunks = {}) {
        const types = Object.keys(components);
        if (types.length === 0) return { status: 'safe', classesNeeded: 0, canSkip: 0 };

        // Build a read-only overlay with simulated bunks applied to conducted
        const overlaid = {};
        for (const type of types) {
            const extra = simulatedBunks[type] || 0;
            overlaid[type] = extra > 0
                ? { ...components[type], conducted: components[type].conducted + extra }
                : components[type];
        }

        const subjectPct = this.calculateSubjectPercentage(overlaid, weightages);
        const componentData = {};
        let weakestComponent = null, weakestPct = 101;
        let totalClassesNeeded = 0, minCanSkip = Infinity;

        for (const type of types) {
            const comp = overlaid[type];
            const raw = components[type];
            const tcbr = comp.tcbr || 0;
            const extra = simulatedBunks[type] || 0;

            const pct = this.calculateComponentPercentage(comp.attended, comp.conducted, tcbr);
            const needed = this.classesNeededToReachThreshold(comp.attended, comp.conducted, threshold, tcbr);
            const canSkip = this.classesCanSkip(comp.attended, comp.conducted, threshold, tcbr);
            const sim = this.simulateMissNextClass(comp.attended, comp.conducted, threshold, tcbr);

            componentData[type] = {
                percentage: pct,
                classesNeeded: needed,
                canSkip,
                status: this.getStatus(pct, threshold),
                nextClassSimulation: sim,
                conducted: comp.conducted,
                rawConducted: raw.conducted,
                attended: comp.attended,
                effectiveAttended: this.getEffectiveAttended(comp.attended, tcbr),
                tcbr,
                simulatedBunks: extra
            };

            if (pct < weakestPct) { weakestPct = pct; weakestComponent = type; }
            if (needed > 0 && needed !== Infinity) totalClassesNeeded += needed;
            if (canSkip < minCanSkip) minCanSkip = canSkip;
        }

        return {
            percentage: subjectPct,
            status: this.getStatus(subjectPct, threshold),
            dangerScore: this.calculateDangerScore(subjectPct, threshold),
            componentData,
            weakestComponent,
            weakestPercentage: weakestPct,
            totalClassesNeeded: Math.min(totalClassesNeeded, 300),
            canSkip: minCanSkip === Infinity ? 0 : minCanSkip,
            weightages
        };
    },

    /**
     * Processes every subject in raw scraped data into enriched result objects.
     * @param {Object} rawData           Scraped data ({ subjects })
     * @param {number} threshold
     * @param {Object} allWeightages     Map of courseCode → weightage overrides
     * @param {Object} allSimulatedBunks Map of courseCode → simulated bunk counts
     * @returns {Array}
     */
    processAllSubjects(rawData, threshold, allWeightages = {}, allSimulatedBunks = {}) {
        if (!rawData?.subjects) return [];

        return Object.values(rawData.subjects).map(subject => {
            const sim = this.calculateSubjectSimulation(
                subject.components,
                threshold,
                allWeightages[subject.courseCode] || {},
                allSimulatedBunks[subject.courseCode] || {}
            );

            let totalConducted = 0, totalAttended = 0, totalEffectiveAttended = 0;
            for (const comp of Object.values(subject.components)) {
                totalConducted += comp.conducted;
                totalAttended += comp.attended;
                totalEffectiveAttended += this.getEffectiveAttended(comp.attended, comp.tcbr || 0);
            }

            return {
                courseCode: subject.courseCode,
                courseName: subject.courseName,
                components: subject.components,
                totalConducted,
                totalAttended,
                totalEffectiveAttended,
                totalAbsent: totalConducted - totalAttended,
                ...sim
            };
        });
    },

    /**
     * Sorts processed subjects.
     * @param {Array}   subjects
     * @param {"danger"|"name"|"percentage"} sortBy
     */
    sortSubjects(subjects, sortBy = 'danger') {
        const sorted = [...subjects];
        switch (sortBy) {
            case 'name': sorted.sort((a, b) => a.courseName.localeCompare(b.courseName)); break;
            case 'percentage': sorted.sort((a, b) => a.percentage - b.percentage); break;
            default: sorted.sort((a, b) => b.dangerScore - a.dangerScore);
        }
        return sorted;
    },

    /**
     * Aggregate statistics across all processed subjects.
     * @param {Array}  subjects
     * @param {number} threshold
     */
    calculateAggregateStats(subjects, threshold) {
        if (subjects.length === 0) {
            return { totalSubjects: 0, averageAttendance: 0, safeCount: 0, borderlineCount: 0, criticalCount: 0 };
        }
        let total = 0, safeCount = 0, borderlineCount = 0, criticalCount = 0;
        for (const s of subjects) {
            total += s.percentage;
            if (s.status === 'safe') safeCount++;
            else if (s.status === 'borderline') borderlineCount++;
            else criticalCount++;
        }
        return {
            totalSubjects: subjects.length,
            averageAttendance: total / subjects.length,
            safeCount,
            borderlineCount,
            criticalCount
        };
    },

    /**
     * Display metadata for LTPS component types.
     * @param {"L"|"T"|"P"|"S"} type
     */
    getLTPSInfo(type) {
        const INFO = {
            L: { name: 'Lecture', icon: '📚', color: '#6366f1' },
            T: { name: 'Tutorial', icon: '📝', color: '#8b5cf6' },
            P: { name: 'Practical', icon: '🔬', color: '#06b6d4' },
            S: { name: 'Skill', icon: '🎯', color: '#10b981' }
        };
        return INFO[type] ?? { name: type, icon: '📖', color: '#6b7280' };
    }
};

if (typeof window !== 'undefined') {
    window.AttendanceCalculator = AttendanceCalculator;
    window.DEFAULT_WEIGHTAGES = DEFAULT_WEIGHTAGES;
}
