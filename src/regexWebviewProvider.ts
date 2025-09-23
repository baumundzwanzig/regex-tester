import * as vscode from 'vscode';
import * as path from 'path';
import { highlightRegexMatches, highlightRegexMatchesInEditor, clearAllHighlights } from './highlighter';

export class RegexWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'regex-tester.webview';
    
    private _view?: vscode.WebviewView;
    private _panel?: vscode.WebviewPanel;
    private _mainDecorationType?: vscode.TextEditorDecorationType;
    private _groupDecorationTypes: vscode.TextEditorDecorationType[] = [];
    private _lastActiveEditor?: vscode.TextEditor; // Store the last editor we worked with

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        
        // Store the currently active editor immediately
        if (vscode.window.activeTextEditor) {
            this._lastActiveEditor = vscode.window.activeTextEditor;
            console.log('[resolveWebviewView] Stored initial editor:', this._lastActiveEditor.document.fileName);
        }

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                this.handleMessage(message, webviewView.webview);
            },
            undefined,
            []
        );

        // Auto-load editor text when view is resolved
        console.log('[resolveWebviewView] Setting up auto-load...');
        
        // Also send when webview becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                console.log('[resolveWebviewView] Webview became visible, sending editor text...');
                setTimeout(() => {
                    this._sendActiveEditorText(webviewView.webview);
                }, 100);
            }
        });
    }

    public getWebviewContent(webview: vscode.Webview): string {
        return this._getHtmlForWebview(webview);
    }

    public setPanel(panel: vscode.WebviewPanel) {
        this._panel = panel;
        
        // Store the currently active editor immediately
        if (vscode.window.activeTextEditor) {
            this._lastActiveEditor = vscode.window.activeTextEditor;
            console.log('[setPanel] Stored initial editor:', this._lastActiveEditor.document.fileName);
        }
        
        console.log('[setPanel] Panel set, ready signal will trigger auto-load');
    }

    public handleMessage(message: any, webview: vscode.Webview) {
        // Simple debug for @listitem issue
        if (message.type === 'analyzeRegex' && message.regex && message.regex.includes('@listitem')) {
            console.log('[LISTITEM DEBUG] Received regex:', message.regex);
            console.log('[LISTITEM DEBUG] Character codes:', Array.from(String(message.regex)).map(c => c.charCodeAt(0)).join(','));
        }
        
        switch (message.type) {
            case 'analyzeRegex':
                this._analyzeRegex(message.regex, message.flags, message.testString, webview);
                break;
            case 'getActiveEditorText':
                this._sendActiveEditorText(webview);
                break;
            case 'clearHighlights':
                this._clearHighlights();
                break;
                break;
        }
    }

    private _analyzeRegex(regexPattern: string, flags: string, testString: string, webview?: vscode.Webview) {
        const targetWebview = webview || this._panel?.webview || this._view?.webview;
        if (!targetWebview) {
            console.log('No target webview for analysis');
            return;
        }

        console.log('[_analyzeRegex] ===== ANALYSIS START =====');
        console.log('[_analyzeRegex] Raw parameters:', {
            regexPattern: `"${regexPattern}"`,
            regexLength: regexPattern.length,
            flags: `"${flags}"`,
            testStringLength: testString.length,
            testStringPreview: testString.substring(0, 200).replace(/\n/g, '\\n')
        });

        // FIX: Try multiple decoding strategies for escaped patterns
        let correctedPattern = regexPattern;
        const decodingStrategies = [
            { name: 'original', pattern: regexPattern },
            { name: 'single-unescape', pattern: regexPattern.replace(/\\\\/g, '\\') },
            { name: 'double-unescape', pattern: regexPattern.replace(/\\\\\\\\/g, '\\') },
            { name: 'json-parse', pattern: (() => { try { return JSON.parse('"' + regexPattern + '"'); } catch { return regexPattern; }})() },
            // Special fix for @listitem pattern - convert single \ to double \\
            { name: 'listitem-fix', pattern: regexPattern.includes('@listitem') ? regexPattern.replace(/\\([()])/g, '\\\\$1') : regexPattern }
        ];
        
        console.log('[_analyzeRegex] Testing decoding strategies:');
        decodingStrategies.forEach(strategy => {
            console.log(`[_analyzeRegex] ${strategy.name}: "${strategy.pattern}" (length: ${strategy.pattern.length})`);
        });
        
        // Use the most likely correct pattern (the one that seems most reasonable)
        if (regexPattern.includes('\\\\')) {
            // Try single unescape first
            correctedPattern = regexPattern.replace(/\\\\/g, '\\');
            console.log('[_analyzeRegex] Applied single unescape correction');
        }

        // Test specific problematic pattern
        if (regexPattern.includes('@listitem')) {
            console.log('[_analyzeRegex] DEBUGGING @listitem pattern:');
            console.log('[_analyzeRegex] Pattern contains backslashes:', correctedPattern.includes('\\'));
            console.log('[_analyzeRegex] Original pattern character codes:', regexPattern.split('').map(c => `${c}(${c.charCodeAt(0)})`));
            console.log('[_analyzeRegex] Corrected pattern character codes:', correctedPattern.split('').map(c => `${c}(${c.charCodeAt(0)})`));
            
            // Check if the test string contains potential matches
            const simpleTest = testString.includes('@listitem(');
            console.log('[_analyzeRegex] Text contains "@listitem(":', simpleTest);
            
            if (simpleTest) {
                const allMatches = [];
                let index = testString.indexOf('@listitem(');
                while (index !== -1) {
                    const endIndex = testString.indexOf(')', index);
                    if (endIndex !== -1) {
                        allMatches.push({
                            start: index,
                            end: endIndex + 1,
                            text: testString.substring(index, endIndex + 1)
                        });
                    }
                    index = testString.indexOf('@listitem(', index + 1);
                }
                console.log('[_analyzeRegex] Manual search found potential matches:', allMatches);
            }
        }

        try {
            console.log('[_analyzeRegex] Testing all decoding strategies...');
            
            let bestStrategy = decodingStrategies[0]; // default to original
            let bestMatches = [];
            
            // Test each strategy to see which one finds matches
            for (const strategy of decodingStrategies) {
                try {
                    const testRegex = new RegExp(strategy.pattern, flags);
                    const tempMatches = [];
                    let tempMatch;
                    testRegex.lastIndex = 0;
                    
                    while ((tempMatch = testRegex.exec(testString)) !== null && tempMatches.length < 100) {
                        tempMatches.push(tempMatch);
                        if (!flags.includes('g')) {
                            break;
                        }
                        if (tempMatch[0].length === 0) {
                            testRegex.lastIndex++;
                        }
                    }
                    
                    console.log(`[_analyzeRegex] Strategy '${strategy.name}' found ${tempMatches.length} matches`);
                    
                    if (tempMatches.length > bestMatches.length) {
                        bestStrategy = strategy;
                        bestMatches = tempMatches;
                    }
                } catch (e) {
                    const errorMsg = e instanceof Error ? e.message : String(e);
                    console.log(`[_analyzeRegex] Strategy '${strategy.name}' failed:`, errorMsg);
                }
            }
            
            correctedPattern = bestStrategy.pattern;
            console.log(`[_analyzeRegex] Selected best strategy: '${bestStrategy.name}' with ${bestMatches.length} matches`);
            console.log('[_analyzeRegex] Final corrected pattern:', `"${correctedPattern}"`);

            console.log('[_analyzeRegex] Creating final RegExp object with best pattern...');
            const regex = new RegExp(correctedPattern, flags);
            console.log('[_analyzeRegex] RegExp created successfully:', {
                source: regex.source,
                flags: regex.flags,
                global: regex.global,
                multiline: regex.multiline,
                ignoreCase: regex.ignoreCase
            });

            // Test the regex first
            console.log('[_analyzeRegex] Testing regex.test()...');
            const testResult = regex.test(testString);
            console.log('[_analyzeRegex] regex.test() result:', testResult);
            
            // Reset for exec
            regex.lastIndex = 0;

            const matches: Array<{
                index: number;
                value: string;
                groups: string[];
                line: number;
                column: number;
            }> = [];

            let match: RegExpExecArray | null;
            const lines = testString.split('\n');
            let matchCount = 0;
            const maxMatches = 1000;

            console.log('[_analyzeRegex] Starting regex.exec() loop...');
            
            while ((match = regex.exec(testString)) !== null && matchCount < maxMatches) {
                matchCount++;
                console.log(`[_analyzeRegex] Match ${matchCount} found:`, {
                    fullMatch: `"${match[0]}"`,
                    index: match.index,
                    length: match[0].length,
                    groups: match.slice(1),
                    context: testString.substring(Math.max(0, match.index - 20), match.index + match[0].length + 20)
                });

                // Calculate line and column
                let line = 0;
                let column = match.index;
                let tempPos = 0;
                
                for (let i = 0; i < lines.length; i++) {
                    if (tempPos + lines[i].length >= match.index) {
                        line = i + 1;
                        column = match.index - tempPos + 1;
                        break;
                    }
                    tempPos += lines[i].length + 1; // +1 for newline
                }

                matches.push({
                    index: match.index,
                    value: match[0],
                    groups: match.slice(1),
                    line: line,
                    column: column
                });

                // Prevent infinite loops
                if (match[0].length === 0) {
                    console.log('[_analyzeRegex] Zero-length match detected, advancing...');
                    regex.lastIndex++;
                }

                if (!flags.includes('g')) {
                    console.log('[_analyzeRegex] Non-global regex, stopping after first match');
                    break;
                }
            }

            console.log('[_analyzeRegex] Match search completed:', {
                totalMatches: matchCount,
                reachedMaxMatches: matchCount >= maxMatches
            });

            targetWebview.postMessage({
                type: 'regexResults',
                matches: matches,
                isValid: true,
                error: null
            });

            // Highlight matches in editor
            console.log('[_analyzeRegex] Sending', matches.length, 'matches to webview and highlighting in editor');
            this._highlightMatchesInEditor(correctedPattern, flags, testString);
            
            console.log('[_analyzeRegex] ===== ANALYSIS END =====');

        } catch (error) {
            console.error('[_analyzeRegex] ERROR during analysis:', {
                error: error instanceof Error ? error.message : String(error),
                originalPattern: regexPattern,
                correctedPattern: correctedPattern,
                flags,
                textLength: testString.length
            });
            
            targetWebview.postMessage({
                type: 'regexResults',
                matches: [],
                isValid: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private _sendActiveEditorText(webview?: vscode.Webview) {
        const targetWebview = webview || this._panel?.webview || this._view?.webview;
        if (!targetWebview) {
            console.log('[_sendActiveEditorText] No target webview found');
            return;
        }

        // Try to use the last active editor first, then fall back to current active editor
        let editor = this._lastActiveEditor || vscode.window.activeTextEditor;
        
        // If we found an editor, update _lastActiveEditor
        if (editor) {
            this._lastActiveEditor = editor;
        }
        
        const text = editor ? editor.document.getText() : '';
        
        console.log('[_sendActiveEditorText] Using editor:', {
            hasEditor: !!editor,
            fileName: editor?.document.fileName || 'none',
            textLength: text.length,
            editorSource: this._lastActiveEditor === editor ? 'stored' : 'active'
        });
        console.log('[_sendActiveEditorText] Text preview:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
        
        targetWebview.postMessage({
            type: 'activeEditorText',
            text: text
        });
    }

    private _highlightMatchesInEditor(regexPattern: string, flags: string, testString: string) {
        console.log('[WebviewProvider] ===== _highlightMatchesInEditor START =====');
        console.log('[WebviewProvider] Parameters:', { 
            regexPattern: `"${regexPattern}"`, 
            flags: `"${flags}"`, 
            testStringLength: testString.length
        });
        
        // Apply the same decoding logic as in _analyzeRegex to ensure consistency
        const decodingStrategies = [
            { name: 'original', pattern: regexPattern },
            { name: 'single-unescape', pattern: regexPattern.replace(/\\\\/g, '\\') },
            { name: 'double-unescape', pattern: regexPattern.replace(/\\\\\\\\/g, '\\\\').replace(/\\\\/g, '\\') },
            { name: 'json-parse', pattern: (() => {
                try {
                    return JSON.parse('"' + regexPattern + '"');
                } catch {
                    return regexPattern;
                }
            })() },
            // Special fix for @listitem pattern - convert single \ to double \\
            { name: 'listitem-fix', pattern: regexPattern.includes('@listitem') ? regexPattern.replace(/\\([()])/g, '\\\\$1') : regexPattern }
        ];
        
        let bestPattern = regexPattern;
        let bestMatchCount = 0;
        
        // Test each strategy to find the one that produces the most matches
        for (const strategy of decodingStrategies) {
            try {
                const testRegex = new RegExp(strategy.pattern, flags);
                const tempMatches = Array.from(testString.matchAll(testRegex));
                console.log(`[WebviewProvider] Highlighting strategy '${strategy.name}' found ${tempMatches.length} matches`);
                
                if (tempMatches.length > bestMatchCount) {
                    bestPattern = strategy.pattern;
                    bestMatchCount = tempMatches.length;
                }
            } catch (e) {
                console.log(`[WebviewProvider] Highlighting strategy '${strategy.name}' failed:`, e);
            }
        }
        
        console.log(`[WebviewProvider] Using best pattern for highlighting: "${bestPattern}" (${bestMatchCount} matches)`);
        
        // Try to get the editor - first check stored editor, then active editor
        let editor = this._lastActiveEditor;
        if (!editor || !vscode.window.visibleTextEditors.includes(editor)) {
            editor = vscode.window.activeTextEditor;
        }
        
        if (!editor) {
            console.log('[WebviewProvider] ERROR: No editor found for highlighting (neither stored nor active)');
            return;
        }

        console.log('[WebviewProvider] Using editor for highlighting:', {
            fileName: editor.document.fileName,
            editorTextLength: editor.document.getText().length,
            testStringLength: testString.length,
            textMatches: editor.document.getText() === testString ? 'YES' : 'NO',
            editorSource: this._lastActiveEditor === editor ? 'stored' : 'active'
        });

        // Always use the editor text for highlighting to ensure consistency
        const editorText = editor.document.getText();
        console.log('[WebviewProvider] Using editor text for highlighting instead of provided text');
        
        // Use the shared highlighting function with the corrected pattern and specific editor
        highlightRegexMatchesInEditor(editor, bestPattern, flags, editorText);
        
        console.log('[WebviewProvider] Called highlightRegexMatches with corrected pattern:', bestPattern);
        console.log('[WebviewProvider] ===== _highlightMatchesInEditor END =====');
    }

    private _clearDecorations(editor: vscode.TextEditor) {
        // Use shared highlighting function to clear
        clearAllHighlights();
    }

    private _clearHighlights() {
        console.log('[_clearHighlights] Clearing all highlights...');
        
        // Clear highlights from stored editor if available
        if (this._lastActiveEditor) {
            console.log('[_clearHighlights] Clearing from stored editor:', this._lastActiveEditor.document.fileName);
            highlightRegexMatchesInEditor(this._lastActiveEditor, '', '', '');
        }
        
        // Also clear from currently active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            console.log('[_clearHighlights] Clearing from active editor:', activeEditor.document.fileName);
            highlightRegexMatchesInEditor(activeEditor, '', '', '');
        }
        
        // Fallback to global clear
        clearAllHighlights();
        
        console.log('[_clearHighlights] Clear highlights completed');
    }

    public dispose() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this._clearDecorations(editor);
        }
    }

    public onEditorChanged() {
        // Auto-update text when active editor changes
        console.log('Editor changed, updating webview text');
        this._sendActiveEditorText();
    }

    public onDocumentChanged() {
        // Auto-update text when document content changes
        console.log('Document changed, updating webview text');
        setTimeout(() => {
            this._sendActiveEditorText();
        }, 500); // Debounce to avoid too frequent updates
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RegEx Analyzer</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
        }
        
        .container {
            max-width: 100%;
        }
        
        .input-group {
            margin-bottom: 16px;
        }
        
        label {
            display: block;
            margin-bottom: 4px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        
        input, textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-editor-font-family);
            border-radius: 3px;
            box-sizing: border-box;
        }
        
        textarea {
            min-height: 100px;
            resize: vertical;
            font-family: var(--vscode-editor-font-family);
        }
        
        .regex-input {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        }
        
        .regex-input.valid {
            border-color: var(--vscode-inputValidation-infoBackground);
            box-shadow: 0 0 0 1px var(--vscode-inputValidation-infoBackground);
        }
        
        .regex-input.invalid {
            border-color: var(--vscode-inputValidation-errorBorder);
            box-shadow: 0 0 0 1px var(--vscode-inputValidation-errorBorder);
        }
        
        .button-group {
            margin: 16px 0;
            display: flex;
            gap: 8px;
        }
        
        button {
            padding: 6px 12px;
            border: none;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 3px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .secondary-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .secondary-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .results {
            margin-top: 20px;
        }
        
        .error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            padding: 8px;
            border-radius: 3px;
            margin-bottom: 16px;
        }
        
        .match-item {
            background-color: var(--vscode-editor-selectionBackground);
            border: 1px solid var(--vscode-editor-selectionHighlightBorder);
            border-radius: 3px;
            padding: 12px;
            margin-bottom: 8px;
        }
        
        .match-header {
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-symbolIcon-textForeground);
        }
        
        .match-details {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
            line-height: 1.4;
        }
        
        .match-value {
            background-color: var(--vscode-editor-findMatchBackground);
            padding: 2px 4px;
            border-radius: 2px;
            font-weight: 500;
        }
        
        .group-item {
            margin-left: 16px;
            padding: 4px 0;
            border-left: 2px solid var(--vscode-editor-selectionHighlightBorder);
            padding-left: 8px;
            margin-top: 4px;
        }
        
        .location {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
        }
        
        .no-matches {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            text-align: center;
            padding: 20px;
        }
        
        .analyzing {
            color: var(--vscode-charts-blue);
            font-style: italic;
            text-align: center;
            padding: 20px;
            animation: pulse 1.5s ease-in-out infinite alternate;
        }
        
        @keyframes pulse {
            from { opacity: 0.6; }
            to { opacity: 1.0; }
        }
        
        .summary {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 12px;
            border-radius: 3px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>🔍 RegEx Analyzer</h2>
        
        <div class="input-group">
            <label for="regex">Regular Expression:</label>
            <input type="text" id="regex" class="regex-input" placeholder="Enter your regex pattern..." value="\\w+">
        </div>
        
        <div class="input-group">
            <label for="flags">Flags:</label>
            <input type="text" id="flags" placeholder="g, i, m, s, u, y" value="g" maxlength="10">
        </div>
        
        <div class="input-group">
            <label for="testString">Test String:</label>
            <textarea id="testString" placeholder="Enter text to test against..."></textarea>
        </div>
        
        <div class="button-group">
            <button id="analyzeBtn">🔍 Analyze</button>
            <button id="loadEditorBtn" class="secondary-button">📄 Load from Active Editor</button>
            <button id="clearBtn" class="secondary-button">🗑️ Clear</button>
            <button id="clearHighlightsBtn" class="secondary-button">✨ Clear Highlights</button>
            <button id="debugBtn" class="secondary-button">🐛 Debug Pattern</button>
        </div>
        
        <div id="results" class="results"></div>
    </div>

    <script>
        console.log('=== WEBVIEW SCRIPT STARTING ===');
        const vscode = acquireVsCodeApi();
        console.log('vscode API acquired:', !!vscode);
        
        // Elements
        const regexInput = document.getElementById('regex');
        const flagsInput = document.getElementById('flags');
        const testStringInput = document.getElementById('testString');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const loadEditorBtn = document.getElementById('loadEditorBtn');
        const clearBtn = document.getElementById('clearBtn');
        const clearHighlightsBtn = document.getElementById('clearHighlightsBtn');
        const debugBtn = document.getElementById('debugBtn');
        const resultsDiv = document.getElementById('results');
        
        // Event listeners
        analyzeBtn.addEventListener('click', analyzeRegex);
        loadEditorBtn.addEventListener('click', loadFromEditor);
        clearBtn.addEventListener('click', clearAll);
        clearHighlightsBtn.addEventListener('click', clearHighlights);
        debugBtn.addEventListener('click', debugPattern);
        
        // Auto-analyze on input change (with debounce)
        let debounceTimer;
        let regexDebounceTimer;
        
        // Faster debounce for regex input (more responsive)
        regexInput.addEventListener('input', (event) => {
            // Direct event debugging
            console.log('Raw input event:', event.target.value);
            console.log('Raw input value character codes:', Array.from(event.target.value).map(c => c.charCodeAt(0)));
            
            clearTimeout(regexDebounceTimer);
            validateRegex(); // Immediate validation
            regexDebounceTimer = setTimeout(analyzeRegex, 300); // Faster for regex changes
        });
        
        // Regular debounce for flags input
        flagsInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            validateRegex(); // Validate when flags change too
            debounceTimer = setTimeout(analyzeRegex, 300);
        });
        
        // Slower debounce for test string input (can be larger text)
        testStringInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(analyzeRegex, 800); // Slower for large text changes
        });
        
        function validateRegex() {
            const regex = regexInput.value.trim();
            const flags = flagsInput.value.trim();
            
            regexInput.classList.remove('valid', 'invalid');
            
            if (regex) {
                try {
                    new RegExp(regex, flags);
                    regexInput.classList.add('valid');
                } catch (e) {
                    regexInput.classList.add('invalid');
                }
            }
        }
        
        function analyzeRegex() {
            const regex = regexInput.value.trim();
            const flags = flagsInput.value.trim();
            const testString = testStringInput.value;
            
            console.log('[Webview] analyzeRegex called with:', {
                regex: regex,
                regexLength: regex.length,
                flags: flags,
                characterCodes: regex.split('').map(c => c + '(' + c.charCodeAt(0) + ')').join(' ')
            });
            
            if (!regex) {
                resultsDiv.innerHTML = '<div class="no-matches">Enter a regex pattern to start analyzing</div>';
                // Clear highlights when no regex
                vscode.postMessage({
                    type: 'clearHighlights'
                });
                return;
            }
            
            // Show analyzing indicator
            resultsDiv.innerHTML = '<div class="analyzing">🔍 Analyzing regex...</div>';
            
            vscode.postMessage({
                type: 'analyzeRegex',
                regex: regex,
                flags: flags,
                testString: testString
            });
        }
        
        function loadFromEditor() {
            console.log('Loading from editor...');
            vscode.postMessage({
                type: 'getActiveEditorText'
            });
        }
        
        function clearAll() {
            regexInput.value = '';
            flagsInput.value = 'g';
            testStringInput.value = '';
            resultsDiv.innerHTML = '';
        }
        
        function clearHighlights() {
            vscode.postMessage({
                type: 'clearHighlights'
            });
        }
        
        function debugPattern() {
            const regex = regexInput.value.trim();
            const flags = flagsInput.value.trim();
            const testString = testStringInput.value;
            
            if (!regex) {
                resultsDiv.innerHTML = '<div class="error">🐛 Debug: Please enter a regex pattern first!</div>';
                return;
            }
            
            // Show detailed debug information
            const characterCodes = regex.split('').map(c => c + '(' + c.charCodeAt(0) + ')').join(' ');
            const containsBackslashes = regex.includes('\\\\') ? 'Yes' : 'No';
            const escapedPattern = JSON.stringify(regex);
            
            // Create persistent debug info that won't be overwritten
            resultsDiv.innerHTML = 
                '<div class="summary debug-info" style="background: #f0f8ff; border: 2px solid #4a90e2; padding: 15px; margin-bottom: 10px;">' +
                    '<h3>🐛 Debug Information (Persistent)</h3>' +
                    '<strong>Pattern:</strong> "' + regex + '"<br>' +
                    '<strong>Pattern Length:</strong> ' + regex.length + '<br>' +
                    '<strong>Flags:</strong> "' + flags + '"<br>' +
                    '<strong>Text Length:</strong> ' + testString.length + '<br>' +
                    '<strong>Character Codes:</strong> ' + characterCodes + '<br>' +
                    '<strong>Contains Backslashes:</strong> ' + containsBackslashes + '<br>' +
                    '<strong>Escaped Pattern:</strong> ' + escapedPattern + '<br>' +
                    '<button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 5px 10px; background: #ff6b6b; color: white; border: none; border-radius: 3px; cursor: pointer;">Close Debug Info</button>' +
                '</div>' +
                '<div class="analyzing">🔍 Running analysis with debug info...</div>';
            
            // Send debug analysis request - results will appear below debug info
            vscode.postMessage({
                type: 'analyzeRegex',
                regex: regex,
                flags: flags,
                testString: testString
            });
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('Received message from extension:', message.type, message);
            
            switch (message.type) {
                case 'regexResults':
                    displayResults(message);
                    break;
                case 'activeEditorText':
                    console.log('*** RECEIVED activeEditorText message ***');
                    console.log('Message text length:', message.text?.length || 'undefined');
                    console.log('Text preview:', message.text ? message.text.substring(0, 100) + (message.text.length > 100 ? '...' : '') : 'no text');
                    console.log('Current testStringInput value before:', testStringInput.value.length, 'characters');
                    
                    if (message.text !== undefined) {
                        testStringInput.value = message.text;
                        console.log('Set testStringInput.value to:', message.text.length, 'characters');
                        console.log('Current testStringInput value after:', testStringInput.value.length, 'characters');
                        
                        // Auto-analyze if we have a regex pattern
                        if (regexInput.value.trim()) {
                            console.log('Auto-analyzing with regex:', regexInput.value);
                            analyzeRegex();
                        }
                    } else {
                        console.log('ERROR: message.text is undefined!');
                    }
                    break;
            }
        });
        
        function displayResults(data) {
            // Check if there's existing debug info to preserve
            const existingDebugInfo = resultsDiv.querySelector('.debug-info');
            let debugInfoHtml = '';
            if (existingDebugInfo) {
                debugInfoHtml = existingDebugInfo.outerHTML;
            }
            
            let resultsHtml = '';
            if (!data.isValid) {
                resultsHtml = \`<div class="error">❌ Invalid regex: \${data.error}</div>\`;
            } else if (data.matches.length === 0) {
                resultsHtml = '<div class="no-matches">No matches found</div>';
            } else {
                resultsHtml = \`
                    <div class="summary">
                        <strong>📊 Summary:</strong> \${data.matches.length} match\${data.matches.length !== 1 ? 'es' : ''} found
                    </div>
                \`;
                
                data.matches.forEach((match, index) => {
                    resultsHtml += \`
                        <div class="match-item">
                            <div class="match-header">Match \${index + 1}</div>
                            <div class="match-details">
                                <div><strong>Value:</strong> <span class="match-value">\${escapeHtml(match.value)}</span></div>
                                <div class="location">
                                    <strong>Location:</strong> Line \${match.line}, Column \${match.column} (Index: \${match.index})
                                </div>
                                \${match.groups.length > 0 ? \`
                                    <div><strong>Groups:</strong></div>
                                    \${match.groups.map((group, i) => 
                                        group ? \`<div class="group-item">Group \${i + 1}: <span class="match-value">\${escapeHtml(group)}</span></div>\` : ''
                                    ).join('')}
                                \` : ''}
                            </div>
                        </div>
                    \`;
                });
            }
            
            // Combine debug info (if exists) with new results
            resultsDiv.innerHTML = debugInfoHtml + resultsHtml;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Initial analysis if regex is pre-filled
        if (regexInput.value) {
            analyzeRegex();
        }
        
        // Auto-load editor text when webview opens
        console.log('Webview loaded, requesting editor text via getActiveEditorText...');
        
        // Use the same mechanism as the Load from Editor button
        function autoLoadEditorText() {
            console.log('Auto-loading editor text...');
            vscode.postMessage({
                type: 'getActiveEditorText'
            });
        }
        
        // Try loading immediately and with delays
        autoLoadEditorText();
        setTimeout(autoLoadEditorText, 200);
        setTimeout(autoLoadEditorText, 500);
    </script>
</body>
</html>`;
    }
}