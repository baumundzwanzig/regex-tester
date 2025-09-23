# Change Log

All notable changes to the "regex-tester" extension will be documented in this file.


## [0.5.0] - 2025-01-16

### ✨ New Features
- **📚 Regex History**: Added comprehensive regex history functionality that saves your last 20 regex patterns
  - Dropdown interface with timestamps for easy pattern selection
  - Automatic duplicate detection and removal
  - Clear history option for privacy
  - Persistent storage across VS Code sessions
  - Intuitive focus/blur dropdown behavior
  - Removed "Find Regex" button, because the shortcut is more handy. You can now toggle the Analyzer with the Editorview button.

### 🎨 Enhanced
- **🔍 Better User Experience**: History dropdown appears when focusing the regex input field
- **💾 Smart Storage**: Uses VS Code workspace state for reliable pattern persistence
- **🕒 Time-based Organization**: Most recent patterns appear first with human-readable timestamps

## [0.4.0] - 2025-09-23

### 🐛 Fixed
- **🔧 Auto-loading Text from Editor**: Fixed issue where text from active editor wasn't automatically loaded when opening the webview
- **✨ Clear Highlights Button**: Fixed malfunctioning "Clear Highlights" button that wasn't removing editor highlighting
- **🏷️ @listitem Pattern Escaping**: Fixed critical issue with backslash escaping in patterns like `@listitem\((.*)\)` that prevented matches from being found
- **🎯 Editor Focus Handling**: Fixed problem where webview couldn't access editor text when webview had focus instead of editor
- **🔄 Persistent Debug Window**: Fixed debug information window that was disappearing immediately after opening

### ✨ Enhanced
- **🧠 Intelligent Escaping Detection**: Added multiple decoding strategies to automatically handle different backslash escaping scenarios
- **📝 Persistent Debug Information**: Debug window now stays open with a "Close Debug Info" button for better debugging experience
- **🎨 Visual Debug Improvements**: Debug info is now displayed in a distinctive blue-bordered box for better visibility
- **🔍 Comprehensive Logging**: Enhanced debug logging throughout the entire pipeline for easier troubleshooting
- **⚡ Robust Editor State Management**: Improved handling of editor references to ensure consistent behavior regardless of focus state

### 🏗️ Technical Improvements
- **🎯 Multi-Strategy Pattern Correction**: Implemented automatic testing of different escaping strategies to find the best match
- **📱 Ready-Signal Communication**: Enhanced webview-extension communication with proper initialization signals
- **🔄 Consistent Highlighting Logic**: Both webview analysis and editor highlighting now use the same corrected regex patterns
- **🛡️ Better Error Recovery**: Improved fallback mechanisms when primary editor detection fails
- **📊 Enhanced Debug Infrastructure**: Added character code analysis and pattern transformation tracking

### 🎨 User Experience
- **🚀 Seamless Workflow**: Text now loads automatically when opening webview with an active editor
- **🔧 Reliable Debug Tools**: Debug functionality works consistently without disappearing
- **✅ Consistent Results**: Webview and editor highlighting now always show the same matches
- **🎯 Pattern-Specific Fixes**: Special handling for common patterns like `@listitem\((.*)\)` that require specific escaping

## [0.3.3] - 2025-09-23

### Added
- **🎉 Interactive Webview-based Regex Analyzer**: Brand new dedicated interface for comprehensive regex testing
- **⚡ Real-time Auto-update**: Regex matches now update automatically while typing (300ms debounce for regex, 800ms for text)
- **✅ Live Regex Validation**: Visual feedback with green/red borders shows regex validity while typing
- **🎯 Smart Editor Highlighting**: Matches are highlighted in real-time in the editor, even when webview has focus
- **📤 Auto-load Editor Text**: Automatically loads text from active editor into analyzer
- **⏳ Loading Indicators**: Visual feedback with "🔍 Analyzing regex..." and pulsing animation
- **🧹 Smart Highlight Management**: Automatically clears editor highlights when regex field is empty
- **🔧 Enhanced Debugging**: Comprehensive logging system for troubleshooting
- **💾 Editor State Persistence**: Remembers which editor to highlight even when focus changes
- **🎨 Improved Visual Design**: Modern CSS styling with VS Code theme integration

### Technical Improvements
- **🏗️ Modular Architecture**: Separated highlighting logic into dedicated `highlighter.ts` module
- **🔄 Circular Dependency Resolution**: Fixed import/export issues between modules
- **⚡ Performance Optimization**: Intelligent debouncing with different speeds for different input types
- **🎯 Specific Editor Targeting**: New `highlightRegexMatchesInEditor()` function for precise editor control
- **🛡️ Robust Error Handling**: Better error catching and user feedback
- **🧪 Enhanced Testing**: Comprehensive debug logging for development and troubleshooting

### Changed
- **📈 Improved User Experience**: Instant feedback and responsive interface
- **🎛️ Better Input Handling**: Separate debounce timers for regex (300ms), flags (300ms), and text (800ms)
- **👁️ Visual Feedback**: Real-time validation and status indicators
- **🔗 Seamless Integration**: Works smoothly regardless of focus state between editor and webview

## [0.3.2] - 2025-09-23

### Added
- Line and column numbers are now displayed in the output panel for each match
- Enhanced match information showing position details (Line X, Column Y)

### Changed
- Improved output format to include precise location information for better navigation

## [0.3.1] - Previous Release

### Added
- Basic regex testing functionality
- Match highlighting with different colors for groups
- Output panel showing matches and groups
- Context menu integration for testing selected text as regex

## [0.3.0] - Previous Release

### Added
- Initial regex testing capabilities
- Visual highlighting of matches in the editor

## [0.2.0] - Previous Release

### Added
- Core functionality for regex pattern matching

## [0.1.5] - Previous Release

### Added
- Initial release