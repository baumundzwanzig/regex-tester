import * as vscode from 'vscode';

// Globale Referenzen für DecorationTypes
let mainDecorationType: vscode.TextEditorDecorationType | undefined;
let groupDecorationTypes: vscode.TextEditorDecorationType[] = [];

// Gemeinsame Highlighting-Funktion
export function highlightMatches(editor: vscode.TextEditor, matches: Array<{start: number, end: number, groups?: string[]}>) {
	console.log('highlightMatches called with', matches.length, 'matches');
	
	// Clear existing decorations
	if (mainDecorationType) {
		editor.setDecorations(mainDecorationType, []);
		mainDecorationType.dispose();
		mainDecorationType = undefined;
	}
	groupDecorationTypes.forEach(type => {
		editor.setDecorations(type, []);
		type.dispose();
	});
	groupDecorationTypes = [];

	if (matches.length === 0) {
		console.log('No matches to highlight, cleared existing decorations');
		return;
	}

	const text = editor.document.getText();
	console.log('Highlighting', matches.length, 'matches in document with', text.length, 'characters');

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
		console.log(`Creating decoration for match at ${m.start}-${m.end}`);
		return {
			range: new vscode.Range(startPos, endPos),
			hoverMessage: m.groups && m.groups.length > 0 ? 'Groups: ' + m.groups.join(', ') : 'Match'
		};
	});
	editor.setDecorations(mainDecorationType, mainDecorations);
	console.log('Applied', mainDecorations.length, 'main decorations');

	// Gruppen hervorheben
	matches.forEach((m, matchIndex) => {
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
						console.log(`Applied group ${idx + 1} decoration for match ${matchIndex + 1} at ${groupStart}-${groupEnd}`);
					} else {
						console.log(`Could not find group "${group}" starting from position ${m.start}`);
					}
				}
			});
		}
	});

	console.log('Highlighting completed successfully');
}

// Funktion zum Bereinigen aller Decorations
export function clearAllHighlights() {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		highlightMatches(editor, []);
	}
}

// Neue Funktion für Webview-Integration - arbeitet direkt mit Regex
export function highlightRegexMatches(regex: string, flags: string, text?: string): void {
    console.log('[highlightRegexMatches] ===== START =====');
    console.log('[highlightRegexMatches] Parameters:', { 
        regex: `"${regex}"`, 
        flags: `"${flags}"`, 
        textProvided: !!text,
        textLength: text?.length || 'N/A'
    });
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        console.log('[highlightRegexMatches] ERROR: No active editor found');
        return;
    }

    console.log('[highlightRegexMatches] Active editor:', {
        fileName: editor.document.fileName,
        languageId: editor.document.languageId,
        lineCount: editor.document.lineCount
    });

    // Get text from editor if not provided
    const searchText = text || editor.document.getText();
    console.log('[highlightRegexMatches] Text analysis:', {
        searchTextLength: searchText.length,
        editorTextLength: editor.document.getText().length,
        textSource: text ? 'provided' : 'from editor',
        firstLine: searchText.split('\n')[0] || 'empty',
        preview: searchText.substring(0, 100).replace(/\n/g, '\\n'),
        textMatch: text === editor.document.getText() ? 'SAME' : 'DIFFERENT'
    });

    // Test the regex first
    try {
        console.log('[highlightRegexMatches] Testing regex construction...');
        const regexObj = new RegExp(regex, flags);
        console.log('[highlightRegexMatches] Regex created successfully:', {
            source: regexObj.source,
            flags: regexObj.flags,
            global: regexObj.global,
            multiline: regexObj.multiline,
            ignoreCase: regexObj.ignoreCase
        });

        // Test with a simple test first
        const testResult = regexObj.test(searchText);
        console.log('[highlightRegexMatches] Regex test result:', testResult);
        
        // Reset regex for exec
        regexObj.lastIndex = 0;
        
        const matches: Array<{start: number, end: number, groups?: string[]}> = [];
        let match;
        let matchCount = 0;
        const maxMatches = 1000; // Prevent infinite loops

        console.log('[highlightRegexMatches] Starting match search...');
        
        while ((match = regexObj.exec(searchText)) !== null && matchCount < maxMatches) {
            matchCount++;
            console.log(`[highlightRegexMatches] Match ${matchCount}:`, {
                fullMatch: `"${match[0]}"`,
                index: match.index,
                length: match[0].length,
                groups: match.length > 1 ? match.slice(1) : 'none',
                beforeMatch: searchText.substring(Math.max(0, match.index - 10), match.index),
                afterMatch: searchText.substring(match.index + match[0].length, match.index + match[0].length + 10)
            });

            // Convert to our format
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                groups: match.length > 1 ? match.slice(1) : undefined
            });

            // Prevent infinite loop for zero-length matches
            if (match[0].length === 0) {
                console.log('[highlightRegexMatches] Zero-length match detected, advancing manually');
                regexObj.lastIndex++;
            }
            
            // Break if not global to prevent infinite loop
            if (!regexObj.global) {
                console.log('[highlightRegexMatches] Non-global regex, stopping after first match');
                break;
            }
        }

        console.log('[highlightRegexMatches] Match search completed:', {
            totalMatches: matchCount,
            matchesToHighlight: matches.length,
            reachedMaxMatches: matchCount >= maxMatches
        });

        // Use the existing highlighting function
        highlightMatches(editor, matches);
        console.log(`[highlightRegexMatches] Called highlightMatches with ${matches.length} matches`);

    } catch (error) {
        console.error('[highlightRegexMatches] ERROR in regex processing:', {
            error: error instanceof Error ? error.message : String(error),
            regex,
            flags,
            textLength: searchText.length
        });
    }
    
    console.log('[highlightRegexMatches] ===== END =====');
}