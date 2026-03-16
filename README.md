# ERP Attendance Intelligence 🎓

A premium, highly-optimized Chrome extension for KL University students to analyze, predict, and run interactive simulations on their attendance across all subjects and LTPS components.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Design](https://img.shields.io/badge/design-spatial_computing-black)
![License](https://img.shields.io/badge/license-MIT-purple)

## ✨ New in Version 1.1.0

- **Spatial Computing UI**: Completely redesigned interface utilizing Apple-inspired design tokens, glassmorphism (`backdrop-filter: blur()`), and spring-like animations.
- **TCBR-Corrected Mode**: Toggle between standard ERP math and an advanced mode that factors in Total Classes Before Registration for true attendance visibility.
- **Interactive Bunk Simulations**: Click the "Bunk" button on any component to run real-time "what if" scenarios. See exactly how skipping a class affects your percentage before you do it.
- **Custom Subject Weightages**: Not all components are weighed equally by faculty. You can now define custom percentage weights (e.g., 50% Lecture, 25% Tutorial, 25% Practical) per subject.
- **DOM Rendering Optimizations**: Uses `DocumentFragment` for zero-stutter rendering, even when running heavy simulations across 20+ subjects.
- **Offline Support**: Mathematical calculations and previously fetched data are now accessible even when the ERP is down.

## 🔮 Core Analytics

- **Real-time Extraction**: Scrapes attendance data via DOM parsing directly from ERP HTML tables. Includes positional fallbacks in case ERP headers change.
- **Classes Needed**: Calculates exactly how many consecutive classes you must attend to mathematically reach your target threshold.
- **Safe Bunks**: Calculates the maximum number of classes you can safely skip.
- **Next Class Risk**: Warns you with a ⚠️ if missing the *very next class* would drop you below your safety threshold.

## 🎨 Premium UI/UX

- **Light & Dark Themes**: Fully responsive `.light-theme` and `.dark-theme` mapping to iOS Semantic colors.
- **Color-coded Status**: 🟢 Safe, 🟡 Borderline, 🔴 Critical mapping.
- **Reduced Visual Noise**: Minimalist layout, focusing only on actionable data.
- **Animated Progress Bars**: Visual representation of your attendance journey.

## 📥 Installation

1. **Download/Clone** this repository.
2. Ensure the `icons/` folder contains the required PNG assets (16x16, 32x32, 48x48, 128x128).
3. Open Chrome and navigate to `chrome://extensions/`.
4. Toggle **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select this extension folder.
6. Pin "Attendance Intelligence" to your toolbar.

### ⚙️ Customization
- **Adjustable Threshold**: Set your own minimum attendance requirement (default: 75%)
- **Sort Options**: View subjects by risk level, name, or attendance percentage
- **Attendance Mode Toggle**: Choose whether TCBR should be included in attendance calculations, allowing more flexible and realistic analysis.
- **Persistent Settings**: Your preferences are saved across sessions

## 📥 Installation

### Method 1: Load Unpacked (Development)

1. **Download/Clone** this folder to your computer

2. **Open Chrome Extensions**:
   - Navigate to `chrome://extensions/`
   - OR go to Menu → More Tools → Extensions

3. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**:
   - Click "Load unpacked"
   - Select this extension folder (`erp-attendance-intelligence`)

5. **Pin the Extension** (recommended):
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "ERP Attendance Intelligence"

## 🚀 Usage

1. **Navigate to ERP**: Log into `newerp.kluniversity.in` and open your attendance page.
2. **Open Extension**: Click the extension icon.
3. **Fetch**: Click "Fetch Attendance Data". 
4. **Simulate**: Expand any subject's LTPS accordion and click "Bunk" to simulate missing a class.
5. **Customize Engine**: Open Settings (⚙️) to change modes (ERP vs TCBR), set your global threshold, or adjust sorting rules.

## 🧮 Calculation Engine

The engine is decoupled into `calculations.js`, a pure math module. 

### Attendance Modes
- **ERP Standard**: `effective_attended = attended`
- **TCBR Corrected**: `effective_attended = attended + tcbr`

### Sub-Component Formula
```javascript
component_percentage = (effective_attended / conducted) * 100
```
*(Note: Components with 0 classes conducted mathematically return a 100% safety buffer).*

5. **Customize Settings**:
   - Click the ⚙️ gear icon
   - Adjust your attendance threshold
   - Change sort order
   - Switch between ERP Standard and TCBR-Corrected
   - Toggle between light/dark themes

### Aggregated Subject Percentage
```javascript
subject_percentage = Σ(component_percentage * component_weightage) / Σ(component_weightages)
```

### Simulation Scenarios
Simulations act as temporary overlays on top of `conducted`. A simulated bunk translates to `conducted + 1` mathematically without altering `attended`.

## 📁 Architecture

```
erp-attendance-extension/
├── manifest.json       # Extension configuration (Manifest V3, Offline Enabled)
├── content.js          # Independent DOM scraping logic & element normalization
├── calculations.js     # Pure math, aggregation logic, & simulation overlay engine
├── popup.html          # HTML structural templates (Semantic DOM)
├── popup.css           # CSS Custom Properties (Design tokens & Spatial themes)
├── popup.js            # Reactive state management & DocumentFragment rendering
└── icons/              # PNG visual assets
```

## 🔧 Security & Privacy

<<<<<<< HEAD
- **Zero External Tracking**: 100% of data processing happens securely in your local browser client.
- **XSS Prevention**: `popup.js` avoids `.innerHTML` for payload injection, preventing arbitrary code execution.
- **Least Privilege**: Only asks for `activeTab` and `storage`. Specifically scoped to `https://newerp.kluniversity.in/*`.

## 📄 License

MIT License - Feel free to use, modify, and distribute. Built to give students clarity and control over their semester.

## How the Math Works (Simplified)

Component Attendance
percentage = effectiveAttended / conducted × 100

effectiveAttended = attended (ERP Mode)

effectiveAttended = attended + TCBR (TCBR-Corrected Mode)

## Subject Attendance
subjectPercentage = average(all component percentages)

LTPS components are equally weighted.

## Classes Needed (Below Threshold)
(effectiveAttended + x) / (conducted + x) ≥ threshold

Solves for minimum x classes you must attend consecutively.

## Classes You Can Skip (Above Threshold)
effectiveAttended / (conducted + x) ≥ threshold

Solves for maximum x safe skips.

```

### ⚠️ Important: TCBR
The extension internally supports multiple attendance calculation modes:

- **ERP Mode**: Matches ERP’s displayed attendance exactly  
- **TCBR-Corrected Mode**: Includes TCBR for deeper analysis

The default behavior matches ERP to avoid confusion, while advanced users
can switch modes from the settings panel.


## 🔧 Technical Details

- **Platform**: Chrome Extension (Manifest V3)
- **Permissions**: 
  - `activeTab`: Access current tab for data extraction
  - `storage`: Save settings and cached data
- **Host Permissions**: `https://newerp.kluniversity.in/*`
- **No External APIs**: 100% client-side processing
- **CSP Compliant**: Safe for university network policies

## 🐛 Troubleshooting

### "Could not find attendance table"
- Make sure you're on the correct ERP attendance page
- Wait for the page to fully load before clicking Fetch
- Try refreshing the ERP page

### "Could not communicate with the page"
- Refresh the ERP page
- Close and reopen the extension popup
- If issue persists, reload the extension in `chrome://extensions/`

### Extension not showing in toolbar
- Go to `chrome://extensions/`
- Make sure the extension is enabled
- Click the puzzle piece icon and pin the extension

### Icons not loading
- Ensure PNG versions of icons exist in the `icons/` folder
- Check that file names match those in `manifest.json`
```

## 📄 License

MIT License - Feel free to use, modify, and distribute.

## 🙏 Credits

Built with ❤️ for KL University students who want to optimize their attendance.
Built for students who think ahead, not just attend. 



**Disclaimer**: This extension is an unofficial tool. Always verify attendance data with official ERP records.
