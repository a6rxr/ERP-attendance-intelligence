/**
 * ERP Attendance Intelligence - Calculations Module
 * 
 * Contains all mathematical logic for attendance calculations and simulations.
 * 
 * ATTENDANCE MODE SUPPORT:
 * - "ERP": Uses raw attended value as-is (ERP's display behavior)
 * - "TCBR_CORRECTED": Uses attended + tcbr for effective attended
 * 
 * Formula Reference:
 * - effectiveAttended = (mode === "TCBR_CORRECTED") ? attended + tcbr : attended
 * - Component Percentage = (effectiveAttended / conducted) * 100
 * - Subject Percentage = Average of all component percentages (equal weight)
 */

const AttendanceCalculator = {

    /**
     * Current attendance mode
     * "ERP" - Use raw attended value (matches ERP display)
     * "TCBR_CORRECTED" - Add TCBR to attended for effective attendance
     */
    attendanceMode: "ERP",

    /**
     * Set the attendance calculation mode
     * @param {string} mode - "ERP" or "TCBR_CORRECTED"
     */
    setMode(mode) {
        if (mode === "ERP" || mode === "TCBR_CORRECTED") {
            this.attendanceMode = mode;
            // console.log(`[Calculations] Mode set to: ${mode}`);
        } else {
            // console.warn(`[Calculations] Invalid mode: ${mode}, defaulting to ERP`);
            this.attendanceMode = "ERP";
        }
    },

    /**
     * Get effective attended count based on current mode
     * @param {number} attended - Raw attended classes
     * @param {number} tcbr - Total Classes Before Registration
     * @returns {number} Effective attended count
     */
    getEffectiveAttended(attended, tcbr) {
        if (this.attendanceMode === "TCBR_CORRECTED") {
            return attended + (tcbr || 0);
        }
        return attended;
    },

    /**
     * Calculate component attendance percentage
     * @param {number} attended - Raw attended classes
     * @param {number} conducted - Classes conducted (NEVER modified)
     * @param {number} tcbr - TCBR value
     * @returns {number} Percentage (0-100)
     */
    calculateComponentPercentage(attended, conducted, tcbr = 0) {
        if (conducted <= 0) return 100; // No classes conducted = 100% by default

        const effectiveAttended = this.getEffectiveAttended(attended, tcbr);
        const percentage = (effectiveAttended / conducted) * 100;

        // Sanity guard: percentage should be 0-100
        if (percentage < 0) {
            // console.warn(`[Calculations] Negative percentage detected, clamping to 0`);
            return 0;
        }
        if (percentage > 100) {
            // console.warn(`[Calculations] Percentage > 100 detected (${percentage.toFixed(1)}%), clamping to 100`);
            return 100;
        }

        return percentage;
    },

    /**
     * Calculate final subject attendance (average of all components)
     * Each component has EQUAL weight regardless of class count
     * @param {Object} components - Object with LTPS components
     * @returns {number} Average percentage across all components
     */
    calculateSubjectPercentage(components) {
        const componentTypes = Object.keys(components);
        if (componentTypes.length === 0) return 0;

        let totalPercentage = 0;
        let validComponents = 0;

        for (const type of componentTypes) {
            const comp = components[type];
            if (comp.conducted > 0) {
                const percentage = this.calculateComponentPercentage(
                    comp.attended,
                    comp.conducted,
                    comp.tcbr || 0
                );
                totalPercentage += percentage;
                validComponents++;
            }
        }

        if (validComponents === 0) return 100;
        return totalPercentage / validComponents;
    },

    /**
     * Determine status based on percentage and threshold
     * @param {number} percentage - Current attendance percentage
     * @param {number} threshold - Minimum required percentage
     * @returns {string} 'safe', 'borderline', or 'critical'
     */
    getStatus(percentage, threshold) {
        if (percentage >= threshold + 5) return 'safe';
        if (percentage >= threshold) return 'borderline';
        return 'critical';
    },

    /**
     * Calculate danger score for sorting (higher = more dangerous)
     * @param {number} percentage - Current attendance percentage
     * @param {number} threshold - Minimum required percentage
     * @returns {number} Danger score (0-100+)
     */
    calculateDangerScore(percentage, threshold) {
        if (percentage >= threshold) {
            // Above threshold: danger based on margin
            return Math.max(0, threshold + 10 - percentage);
        } else {
            // Below threshold: high danger
            return 50 + (threshold - percentage);
        }
    },

    /**
     * CASE 1: Below Threshold - Calculate classes needed to reach threshold
     * 
     * Mathematical derivation:
     * (effectiveAttended + x) / (conducted + x) >= threshold/100
     * 
     * Solving for x:
     * effectiveAttended + x >= (threshold/100) * (conducted + x)
     * x - (threshold/100) * x >= (threshold/100) * conducted - effectiveAttended
     * x * (1 - threshold/100) >= (threshold/100) * conducted - effectiveAttended
     * x >= ((threshold/100) * conducted - effectiveAttended) / (1 - threshold/100)
     * 
     * @param {number} attended - Raw attended classes
     * @param {number} conducted - Classes conducted (NEVER modified)
     * @param {number} threshold - Target percentage (e.g., 75)
     * @param {number} tcbr - TCBR value
     * @returns {number} Minimum classes to attend consecutively (0 if already at threshold)
     */
    classesNeededToReachThreshold(attended, conducted, threshold, tcbr = 0) {
        const effectiveAttended = this.getEffectiveAttended(attended, tcbr);
        const currentPercentage = this.calculateComponentPercentage(attended, conducted, tcbr);

        // Already at or above threshold
        if (currentPercentage >= threshold) return 0;

        // Edge case: threshold is 100% (or higher)
        if (threshold >= 100) {
            // If we have missed ANY class, we can NEVER reach 100% again
            // (unless conducted resets, which we don't assume)
            if (effectiveAttended < conducted) {
                return Infinity; // Impossible
            }
            return 0; // Already at 100%
        }

        const thresholdDecimal = threshold / 100;

        // Formula: x = ceil((threshold * conducted - effectiveAttended * 100) / (100 - threshold))
        // Derived from: (effectiveAttended + x) / (conducted + x) >= threshold/100
        const numerator = (thresholdDecimal * conducted) - effectiveAttended;
        const denominator = 1 - thresholdDecimal;

        if (denominator <= 0) {
            return Infinity; // Should be caught by threshold >= 100, but safety first
        }

        const classesNeeded = Math.ceil(numerator / denominator);

        // Return exact number, let UI handle display caps if needed
        return Math.max(0, classesNeeded);
    },

    /**
     * CASE 2: Above Threshold - Calculate classes that can be skipped
     * 
     * Mathematical derivation:
     * effectiveAttended / (conducted + x) >= threshold/100
     * effectiveAttended >= (threshold/100) * (conducted + x)
     * effectiveAttended - (threshold/100) * conducted >= (threshold/100) * x
     * x <= (effectiveAttended - (threshold/100) * conducted) / (threshold/100)
     * 
     * @param {number} attended - Raw attended classes
     * @param {number} conducted - Classes conducted (NEVER modified)
     * @param {number} threshold - Minimum percentage (e.g., 75)
     * @param {number} tcbr - TCBR value
     * @returns {number} Maximum classes that can be skipped (0 if below threshold)
     */
    classesCanSkip(attended, conducted, threshold, tcbr = 0) {
        const effectiveAttended = this.getEffectiveAttended(attended, tcbr);
        const currentPercentage = this.calculateComponentPercentage(attended, conducted, tcbr);

        // Already below threshold
        if (currentPercentage < threshold) return 0;

        // Edge case: threshold is 0%
        if (threshold <= 0) {
            return 100; // Arbitrary large number, capped
        }

        const thresholdDecimal = threshold / 100;

        // Formula: x = floor((effectiveAttended - threshold * conducted / 100) / (threshold / 100))
        const numerator = effectiveAttended - (thresholdDecimal * conducted);
        const denominator = thresholdDecimal;

        if (denominator <= 0) {
            return 100; // Cap for edge case
        }

        const canSkip = Math.floor(numerator / denominator);

        // Sanity guard: cap at reasonable number
        if (canSkip > 100) {
            // console.warn(`[Calculations] Can skip (${canSkip}) capped at 100`);
            return 100;
        }

        return Math.max(0, canSkip);
    },

    /**
     * Simulate what happens if next class is missed
     * @param {number} attended - Raw attended classes
     * @param {number} conducted - Classes conducted
     * @param {number} threshold - Minimum percentage
     * @param {number} tcbr - TCBR value
     * @returns {Object} Simulation results
     */
    simulateMissNextClass(attended, conducted, threshold, tcbr = 0) {
        const currentPercentage = this.calculateComponentPercentage(attended, conducted, tcbr);
        const newConducted = conducted + 1;
        // When missing next class, attended stays same, conducted increases
        const newPercentage = this.calculateComponentPercentage(attended, newConducted, tcbr);

        return {
            currentPercentage: currentPercentage,
            newPercentage: newPercentage,
            percentageDrop: currentPercentage - newPercentage,
            wouldFallBelowThreshold: currentPercentage >= threshold && newPercentage < threshold,
            isAlreadyBelowThreshold: currentPercentage < threshold
        };
    },

    /**
     * Calculate overall subject classes needed/can skip
     * Based on the average of component percentages
     * 
     * @param {Object} components - LTPS components (raw data)
     * @param {number} threshold - Target percentage
     * @returns {Object} Calculation results for the subject
     */
    calculateSubjectSimulation(components, threshold) {
        const componentTypes = Object.keys(components);
        if (componentTypes.length === 0) {
            return { status: 'safe', classesNeeded: 0, canSkip: 0 };
        }

        const currentPercentage = this.calculateSubjectPercentage(components);
        const status = this.getStatus(currentPercentage, threshold);

        // Calculate component-wise data
        const componentData = {};
        let weakestComponent = null;
        let weakestPercentage = 100;
        let totalClassesNeeded = 0;
        let minCanSkip = Infinity;

        for (const type of componentTypes) {
            const comp = components[type];
            const tcbr = comp.tcbr || 0;
            const compPercentage = this.calculateComponentPercentage(comp.attended, comp.conducted, tcbr);
            const compNeeded = this.classesNeededToReachThreshold(comp.attended, comp.conducted, threshold, tcbr);
            const compCanSkip = this.classesCanSkip(comp.attended, comp.conducted, threshold, tcbr);
            const simulation = this.simulateMissNextClass(comp.attended, comp.conducted, threshold, tcbr);

            componentData[type] = {
                percentage: compPercentage,
                classesNeeded: compNeeded,
                canSkip: compCanSkip,
                status: this.getStatus(compPercentage, threshold),
                nextClassSimulation: simulation,
                // Include raw values for display
                conducted: comp.conducted,
                attended: comp.attended,
                effectiveAttended: this.getEffectiveAttended(comp.attended, tcbr),
                tcbr: tcbr
            };

            // Track weakest component
            if (compPercentage < weakestPercentage) {
                weakestPercentage = compPercentage;
                weakestComponent = type;
            }

            // Track total classes needed
            if (compNeeded > 0) {
                totalClassesNeeded += compNeeded;
            }

            // Track minimum skip capability
            if (compCanSkip < minCanSkip) {
                minCanSkip = compCanSkip;
            }
        }

        return {
            percentage: currentPercentage,
            status: status,
            dangerScore: this.calculateDangerScore(currentPercentage, threshold),
            componentData: componentData,
            weakestComponent: weakestComponent,
            weakestPercentage: weakestPercentage,
            // For below threshold: sum of all classes needed
            totalClassesNeeded: Math.min(totalClassesNeeded, 300), // Sanity cap
            // For above threshold: minimum across all components (bottleneck)
            canSkip: minCanSkip === Infinity ? 0 : Math.min(minCanSkip, 100) // Sanity cap
        };
    },

    /**
     * Process all subjects and return enriched data
     * @param {Object} rawData - Raw scraped data
     * @param {number} threshold - Attendance threshold
     * @returns {Array} Processed subjects with calculations
     */
    processAllSubjects(rawData, threshold) {
        if (!rawData || !rawData.subjects) return [];

        const processed = [];

        for (const subjectKey of Object.keys(rawData.subjects)) {
            const subject = rawData.subjects[subjectKey];
            const simulation = this.calculateSubjectSimulation(subject.components, threshold);

            // Calculate totals across all components
            let totalConducted = 0;
            let totalAttended = 0;
            let totalEffectiveAttended = 0;

            for (const compType of Object.keys(subject.components)) {
                const comp = subject.components[compType];
                totalConducted += comp.conducted;
                totalAttended += comp.attended;
                totalEffectiveAttended += this.getEffectiveAttended(comp.attended, comp.tcbr || 0);
            }

            processed.push({
                courseCode: subject.courseCode,
                courseName: subject.courseName,
                components: subject.components,
                totalConducted: totalConducted,
                totalAttended: totalAttended,
                totalEffectiveAttended: totalEffectiveAttended,
                totalAbsent: totalConducted - totalAttended,
                ...simulation
            });
        }

        return processed;
    },

    /**
     * Sort subjects by specified criteria
     * @param {Array} subjects - Processed subjects
     * @param {string} sortBy - 'danger', 'name', or 'percentage'
     * @returns {Array} Sorted subjects
     */
    sortSubjects(subjects, sortBy = 'danger') {
        const sorted = [...subjects];

        switch (sortBy) {
            case 'danger':
                sorted.sort((a, b) => b.dangerScore - a.dangerScore);
                break;
            case 'name':
                sorted.sort((a, b) => a.courseName.localeCompare(b.courseName));
                break;
            case 'percentage':
                sorted.sort((a, b) => a.percentage - b.percentage);
                break;
            default:
                sorted.sort((a, b) => b.dangerScore - a.dangerScore);
        }

        return sorted;
    },

    /**
     * Calculate aggregate statistics
     * @param {Array} subjects - Processed subjects
     * @param {number} threshold - Attendance threshold
     * @returns {Object} Aggregate stats
     */
    calculateAggregateStats(subjects, threshold) {
        if (subjects.length === 0) {
            return {
                totalSubjects: 0,
                averageAttendance: 0,
                safeCount: 0,
                borderlineCount: 0,
                criticalCount: 0,
                mostAtRisk: null
            };
        }

        let totalPercentage = 0;
        let safeCount = 0;
        let borderlineCount = 0;
        let criticalCount = 0;
        let mostAtRisk = null;
        let lowestPercentage = 100;

        for (const subject of subjects) {
            totalPercentage += subject.percentage;

            switch (subject.status) {
                case 'safe':
                    safeCount++;
                    break;
                case 'borderline':
                    borderlineCount++;
                    break;
                case 'critical':
                    criticalCount++;
                    break;
            }

            if (subject.percentage < lowestPercentage) {
                lowestPercentage = subject.percentage;
                mostAtRisk = subject;
            }
        }

        return {
            totalSubjects: subjects.length,
            averageAttendance: totalPercentage / subjects.length,
            safeCount: safeCount,
            borderlineCount: borderlineCount,
            criticalCount: criticalCount,
            mostAtRisk: mostAtRisk
        };
    },

    /**
     * Get current mode display text
     * @returns {string} Current mode description
     */
    getModeDisplayText() {
        return this.attendanceMode === "TCBR_CORRECTED"
            ? "TCBR-Corrected"
            : "ERP Standard";
    },

    /**
     * Get LTPS type display info
     * @param {string} type - L, T, P, or S
     * @returns {Object} Display name and icon
     */
    getLTPSInfo(type) {
        const info = {
            'L': { name: 'Lecture', icon: '📚', color: '#6366f1' },
            'T': { name: 'Tutorial', icon: '📝', color: '#8b5cf6' },
            'P': { name: 'Practical', icon: '🔬', color: '#06b6d4' },
            'S': { name: 'Skill', icon: '🎯', color: '#10b981' }
        };
        return info[type] || { name: type, icon: '📖', color: '#6b7280' };
    }
};

// Export for use in popup.js
if (typeof window !== 'undefined') {
    window.AttendanceCalculator = AttendanceCalculator;
}
