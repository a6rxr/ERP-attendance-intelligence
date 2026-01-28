# ERP Attendance Intelligence 🎓

A premium Chrome extension for KL University students to analyze, predict, and optimize their attendance across all subjects and LTPS components.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![License](https://img.shields.io/badge/license-MIT-purple)

## ✨ Features

### 📊 Intelligent Attendance Tracking
- **Real-time Data Extraction**: Automatically scrapes attendance data directly from ERP HTML tables
- **LTPS Component Breakdown**: Tracks Lecture (L), Tutorial (T), Practical (P), and Skill (S) components separately
- **Accurate Calculations**: Uses the exact same logic as ERP (no TCBR in calculations)

### 🔮 Predictive Analytics
- **Classes Needed**: Shows exactly how many classes you need to attend to reach your target
- **Safe Bunks**: Calculates how many classes you can safely skip
- **Next Class Warnings**: Alerts you if missing the next class would drop you below threshold

### 🎨 Premium UI/UX
- **Light & Dark Themes**: Beautiful glassmorphic design with smooth transitions
- **Color-coded Status**: 🟢 Safe, 🟡 Borderline, 🔴 Critical
- **Animated Progress Bars**: Visual representation of your attendance journey
- **Responsive Design**: Optimized for the Chrome extension popup

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

1. **Navigate to ERP Attendance Page**:
   ```
   https://newerp.kluniversity.in/index.php?r=studentattendance%2Fstudentdailyattendance%2Fsearchgetinput
   ```

2. **Open the Extension**:
   - Click the extension icon in your Chrome toolbar

3. **Fetch Your Data**:
   - Click the "Fetch Attendance Data" button
   - Your attendance data will be analyzed and displayed

4. **Review Your Results**:
   - Check your overall attendance for each subject
   - Expand LTPS components for detailed breakdowns
   - See action messages for each subject/component

5. **Customize Settings**:
   - Click the ⚙️ gear icon
   - Adjust your attendance threshold
   - Change sort order
   - Switch between ERP Standard and TCBR-Corrected
   - Toggle between light/dark themes

## 📁 File Structure

```
erp-attendance-extension/
├── manifest.json        # Extension configuration (Manifest V3)
├── content.js          # DOM scraping & data extraction
├── calculations.js     # Attendance math & simulation engine
├── popup.html          # Extension popup UI structure
├── popup.css           # Premium styling (light/dark themes)
├── popup.js            # UI controller & event handling
├── icons/              # Extension icons
│   ├── icon16.svg      # 16x16 icon
│   ├── icon32.svg      # 32x32 icon
│   ├── icon48.svg      # 48x48 icon
│   └── icon128.svg     # 128x128 icon
└── README.md           # This file
```

## 🧮 Calculation Logic

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
