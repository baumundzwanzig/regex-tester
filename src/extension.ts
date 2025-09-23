// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { RegexWebviewProvider } from './regexWebviewProvider';
import { highlightMatches } from './highlighter';

// Globale Referenzen für DecorationTypes - DEPRECATED, moved to highlighter.ts
let clearDecorationsDisposable: vscode.Disposable | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "regex-tester" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json

	// Command für Regex-Suche
	const findRegexDisposable = vscode.commands.registerCommand('regex-tester.findRegex', async () => {
		// InputBox für Regex-Pattern
		const regexInput = await vscode.window.showInputBox({
			prompt: 'Insert a RegEx pattern',
			placeHolder: 'e.g. (\w+)' 
		});
		if (!regexInput) {
			return;
		}

		// InputBox für Flags
		const flagsInput = await vscode.window.showInputBox({
			prompt: 'Insert RegEx flags (e.g. gi)',
			placeHolder: 'gi'
		});
		// Default: global flag, falls leer oder nur Leerzeichen
		let flags = flagsInput && flagsInput.trim() !== '' ? flagsInput.trim() : 'g';
		if (!flags.includes('g')) {
			flags += 'g';
		}

		// Aktives Dokument holen
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No editor is open.');
			return;
		}

		const text = editor.document.getText();
		let regex: RegExp;
		try {
			regex = new RegExp(regexInput, flags);
		} catch (e) {
			vscode.window.showErrorMessage('Invalid regex: ' + e);
			return;
		}

		// Matches suchen
		const matches: Array<{start: number, end: number, groups?: string[]}> = [];
		let match: RegExpExecArray | null;
		while ((match = regex.exec(text)) !== null) {
			matches.push({
				start: match.index,
				end: regex.lastIndex,
				groups: match.slice(1)
			});
		}

		// Highlighting anwenden
		highlightMatches(editor, matches);

		// Gruppen im Output anzeigen
		if (matches.length > 0) {
			const output = vscode.window.createOutputChannel('RegEx Tester');
			output.clear();
			output.appendLine('Found Matches:');
			const groupLabels = ['Blau', 'Grün', 'Rosa', 'Lila', 'Orange'];
			matches.forEach((m, i) => {
				const startPos = editor.document.positionAt(m.start);
				const lineNumber = startPos.line + 1; // VS Code lines are 0-indexed
				const columnNumber = startPos.character + 1; // VS Code columns are 0-indexed
				output.appendLine(`Match ${i + 1}: Line ${lineNumber}, Column ${columnNumber}, [${m.start}, ${m.end}], Value: ${text.slice(m.start, m.end)}`);
				if (m.groups && m.groups.length > 0) {
					m.groups.forEach((group, idx) => {
						output.appendLine(`  Group ${idx + 1} (${groupLabels[idx] || 'Color'}): ${group}`);
					});
				}
			});
			output.show();
		} else {
			vscode.window.showInformationMessage('No matches found.');
		}
	});
	context.subscriptions.push(findRegexDisposable);

	// Kontextmenü-Command: Suche mit Auswahl als Regex
	const findRegexFromSelectionDisposable = vscode.commands.registerCommand('regex-tester.findRegexFromSelection', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No editor is open.');
			return;
		}
		const selection = editor.document.getText(editor.selection);
		if (!selection) {
			vscode.window.showErrorMessage('No text selected.');
			return;
		}
		// Flags abfragen
		const flagsInput = await vscode.window.showInputBox({
			prompt: 'Insert RegEx flags (e.g. gi)',
			placeHolder: 'gi',
			value: 'g'
		}) || 'g';
		let flags = flagsInput.trim();
		if (!flags.includes('g')) {
			flags += 'g';
		}

		const text = editor.document.getText();
		let regex: RegExp;
		try {
			regex = new RegExp(selection, flags);
		} catch (e) {
			vscode.window.showErrorMessage('Invalid regex: ' + e);
			return;
		}

		// Matches suchen
		const matches: Array<{start: number, end: number, groups?: string[]}> = [];
		let match: RegExpExecArray | null;
		while ((match = regex.exec(text)) !== null) {
			matches.push({
				start: match.index,
				end: regex.lastIndex,
				groups: match.slice(1)
			});
		}

		// Highlighting anwenden
		highlightMatches(editor, matches);

		// Gruppen im Output anzeigen
		if (matches.length > 0) {
			const output = vscode.window.createOutputChannel('RegEx Tester');
			output.clear();
			output.appendLine('Found Matches:');
			const groupLabels = ['Blau', 'Grün', 'Rosa', 'Lila', 'Orange'];
			matches.forEach((m, i) => {
				const startPos = editor.document.positionAt(m.start);
				const lineNumber = startPos.line + 1; // VS Code lines are 0-indexed
				const columnNumber = startPos.character + 1; // VS Code columns are 0-indexed
				output.appendLine(`Match ${i + 1}: Line ${lineNumber}, Column ${columnNumber}, [${m.start}, ${m.end}], Value: ${text.slice(m.start, m.end)}`);
				if (m.groups && m.groups.length > 0) {
					m.groups.forEach((group, idx) => {
						output.appendLine(`  Group ${idx + 1} (${groupLabels[idx] || 'Color'}): ${group}`);
					});
				}
			});
			output.show();
		} else {
			vscode.window.showInformationMessage('No matches found.');
		}
	});
	context.subscriptions.push(findRegexFromSelectionDisposable);

	// Event-Listener: Entferne Markierungen bei Cursorbewegung oder Klick
	clearDecorationsDisposable = vscode.window.onDidChangeTextEditorSelection(event => {
		const editor = event.textEditor;
		// Use new highlighting function to clear
		highlightMatches(editor, []);
	});
	context.subscriptions.push(clearDecorationsDisposable);

	// Webview Provider registrieren
	const webviewProvider = new RegexWebviewProvider(context.extensionUri, context);
	
	// Editor change listener für Webview
	const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			webviewProvider.onEditorChanged();
		}
	});
	context.subscriptions.push(editorChangeDisposable);

	// Document change listener für Webview
	const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
		const editor = vscode.window.activeTextEditor;
		if (editor && event.document === editor.document) {
			webviewProvider.onDocumentChanged();
		}
	});
	context.subscriptions.push(documentChangeDisposable);
	
	// Command für Webview
	const openWebviewDisposable = vscode.commands.registerCommand('regex-tester.openWebview', () => {
		// Create and show panel
		const panel = vscode.window.createWebviewPanel(
			'regexAnalyzer',
			'RegEx Analyzer',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		// Set the webview's initial html content
		panel.webview.html = webviewProvider.getWebviewContent(panel.webview);

		// Set the panel in provider for communication
		webviewProvider.setPanel(panel);

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(
			message => {
				webviewProvider.handleMessage(message, panel.webview);
			},
			undefined,
			context.subscriptions
		);
	});
	context.subscriptions.push(openWebviewDisposable);

	// Register provider for cleanup
	context.subscriptions.push({
		dispose: () => {
			webviewProvider.dispose();
		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        // Use new highlighting function to clear all decorations
        highlightMatches(editor, []);
    }
    if (clearDecorationsDisposable) {
        clearDecorationsDisposable.dispose();
        clearDecorationsDisposable = undefined;
    }
}
