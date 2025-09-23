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
        setTimeout(() => {
            this._sendActiveEditorText(webviewView.webview);
        }, 100);
    }

    public getWebviewContent(webview: vscode.Webview): string {
        return this._getHtmlForWebview(webview);
    }

    public setPanel(panel: vscode.WebviewPanel) {
        this._panel = panel;
        // Send initial editor text when panel is set
        setTimeout(() => {
            this._sendActiveEditorText();
        }, 100);
    }

    public handleMessage(message: any, webview: vscode.Webview) {
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
        }
    }

    private _analyzeRegex(regexPattern: string, flags: string, testString: string, webview?: vscode.Webview) {
        const targetWebview = webview || this._panel?.webview || this._view?.webview;
        if (!targetWebview) {
            console.log('No target webview for analysis');
            return;
        }

        console.log('Analyzing regex:', regexPattern, 'with flags:', flags, 'on text length:', testString.length);

        try {
            const regex = new RegExp(regexPattern, flags);
            const matches: Array<{
                index: number;
                value: string;
                groups: string[];
                line: number;
                column: number;
            }> = [];

            let match: RegExpExecArray | null;
            const lines = testString.split('\n');

            while ((match = regex.exec(testString)) !== null) {
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

                if (!flags.includes('g')) {
                    break;
                }
            }

            targetWebview.postMessage({
                type: 'regexResults',
                matches: matches,
                isValid: true,
                error: null
            });

            // Highlight matches in editor
            console.log('Sending', matches.length, 'matches to webview and highlighting in editor');
            this._highlightMatchesInEditor(regexPattern, flags, testString);

        } catch (error) {
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
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this._lastActiveEditor = editor; // Store the editor we're working with
        }
        const text = editor ? editor.document.getText() : '';
        
        console.log('Sending editor text to webview:', text.length, 'characters');
        console.log('Stored editor for highlighting:', editor?.document.fileName || 'none');
        
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
        
        // Use the shared highlighting function with the specific editor
        highlightRegexMatchesInEditor(editor, regexPattern, flags, editorText);
        
        console.log('[WebviewProvider] Called highlightRegexMatches with editor text');
        console.log('[WebviewProvider] ===== _highlightMatchesInEditor END =====');
    }

    private _clearDecorations(editor: vscode.TextEditor) {
        // Use shared highlighting function to clear
        clearAllHighlights();
    }

    private _clearHighlights() {
        clearAllHighlights();
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
        </div>
        
        <div id="results" class="results"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Elements
        const regexInput = document.getElementById('regex');
        const flagsInput = document.getElementById('flags');
        const testStringInput = document.getElementById('testString');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const loadEditorBtn = document.getElementById('loadEditorBtn');
        const clearBtn = document.getElementById('clearBtn');
        const clearHighlightsBtn = document.getElementById('clearHighlightsBtn');
        const resultsDiv = document.getElementById('results');
        
        // Event listeners
        analyzeBtn.addEventListener('click', analyzeRegex);
        loadEditorBtn.addEventListener('click', loadFromEditor);
        clearBtn.addEventListener('click', clearAll);
        clearHighlightsBtn.addEventListener('click', clearHighlights);
        
        // Auto-analyze on input change (with debounce)
        let debounceTimer;
        let regexDebounceTimer;
        
        // Faster debounce for regex input (more responsive)
        regexInput.addEventListener('input', () => {
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
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('Received message from extension:', message.type, message);
            
            switch (message.type) {
                case 'regexResults':
                    displayResults(message);
                    break;
                case 'activeEditorText':
                    console.log('Setting editor text:', message.text.length, 'characters');
                    testStringInput.value = message.text;
                    // Auto-analyze if we have a regex pattern
                    if (regexInput.value.trim()) {
                        console.log('Auto-analyzing with regex:', regexInput.value);
                        analyzeRegex();
                    }
                    break;
            }
        });
        
        function displayResults(data) {
            if (!data.isValid) {
                resultsDiv.innerHTML = \`<div class="error">❌ Invalid regex: \${data.error}</div>\`;
                return;
            }
            
            if (data.matches.length === 0) {
                resultsDiv.innerHTML = '<div class="no-matches">No matches found</div>';
                return;
            }
            
            let html = \`
                <div class="summary">
                    <strong>📊 Summary:</strong> \${data.matches.length} match\${data.matches.length !== 1 ? 'es' : ''} found
                </div>
            \`;
            
            data.matches.forEach((match, index) => {
                html += \`
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
            
            resultsDiv.innerHTML = html;
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
        console.log('Webview loaded, requesting editor text...');
        loadFromEditor();
    </script>
</body>
</html>`;
    }
}