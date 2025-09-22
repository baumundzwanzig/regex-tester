// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// Globale Referenzen für DecorationTypes
let mainDecorationType: vscode.TextEditorDecorationType | undefined;
let groupDecorationTypes: vscode.TextEditorDecorationType[] = [];
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
		// Default: global flag, falls leer
		const flags = flagsInput !== undefined ? flagsInput : 'g';

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


		// Haupt-Match-Dekoration
		mainDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(255,255,0,0.4)',
			border: '1px solid orange'
		});

		// Farben für Gruppen
		const groupColors = [
			'rgba(135,206,250,0.4)', // Gruppe 1: hellblau
			'rgba(144,238,144,0.4)', // Gruppe 2: hellgrün
			'rgba(255,182,193,0.4)', // Gruppe 3: rosa
			'rgba(221,160,221,0.4)', // Gruppe 4: lila
			'rgba(255,165,0,0.4)'    // Gruppe 5: orange
		];
		groupDecorationTypes = groupColors.map(color =>
			vscode.window.createTextEditorDecorationType({ backgroundColor: color })
		);

		// Haupt-Matches hervorheben
		const mainDecorations: vscode.DecorationOptions[] = matches.map(m => {
			const startPos = editor.document.positionAt(m.start);
			const endPos = editor.document.positionAt(m.end);
			return {
				range: new vscode.Range(startPos, endPos),
				hoverMessage: m.groups && m.groups.length > 0 ? 'Groups: ' + m.groups.join(', ') : 'Match'
			};
		});
		editor.setDecorations(mainDecorationType, mainDecorations);

		// Gruppen hervorheben
		matches.forEach(m => {
			if (m.groups) {
				m.groups.forEach((group, idx) => {
					if (group && group.length > 0 && idx < groupDecorationTypes.length) {
						const groupStart = text.indexOf(group, m.start);
						if (groupStart !== -1) {
							const groupEnd = groupStart + group.length;
							const startPos = editor.document.positionAt(groupStart);
							const endPos = editor.document.positionAt(groupEnd);
							const decoration: vscode.DecorationOptions = {
								range: new vscode.Range(startPos, endPos),
								hoverMessage: `Group ${idx + 1}: ${group}`
							};
							editor.setDecorations(groupDecorationTypes[idx], [decoration]);
						}
					}
				});
			}
		});

		// Gruppen im Output anzeigen
		if (matches.length > 0) {
			const output = vscode.window.createOutputChannel('RegEx Tester');
			output.clear();
			output.appendLine('Found Matches:');
			const groupLabels = ['Blau', 'Grün', 'Rosa', 'Lila', 'Orange'];
			matches.forEach((m, i) => {
				output.appendLine(`Match ${i + 1}: [${m.start}, ${m.end}], Value: ${text.slice(m.start, m.end)}`);
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

	// Event-Listener: Entferne Markierungen bei Cursorbewegung oder Klick
	clearDecorationsDisposable = vscode.window.onDidChangeTextEditorSelection(event => {
		const editor = event.textEditor;
		if (mainDecorationType) {
			editor.setDecorations(mainDecorationType, []);
		}
		if (groupDecorationTypes.length > 0) {
			groupDecorationTypes.forEach(type => editor.setDecorations(type, []));
		}
	});
	context.subscriptions.push(clearDecorationsDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        if (mainDecorationType) {
            editor.setDecorations(mainDecorationType, []);
        }
        groupDecorationTypes.forEach(type => editor.setDecorations(type, []));
    }
    if (mainDecorationType) {
        mainDecorationType.dispose();
        mainDecorationType = undefined;
    }
    groupDecorationTypes.forEach(type => type.dispose());
    groupDecorationTypes = [];
    if (clearDecorationsDisposable) {
        clearDecorationsDisposable.dispose();
        clearDecorationsDisposable = undefined;
    }
}
