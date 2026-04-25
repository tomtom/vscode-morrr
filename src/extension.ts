import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

const rExprType = new yaml.Type('!r', {
    kind: 'scalar',
    construct: (data: string) => ({ __rExpr: data }),
});
const RMARKDOWN_SCHEMA = yaml.DEFAULT_SCHEMA.extend([rExprType]);

function valueToR(val: unknown): string {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    if (typeof val === 'object' && '__rExpr' in (val as object)) return (val as { __rExpr: string }).__rExpr;
    if (Array.isArray(val)) return `c(${val.map(valueToR).join(', ')})`;
    const obj = val as Record<string, unknown>;
    if ('value' in obj) return valueToR(obj['value']);
    const entries = Object.entries(obj).map(([k, v]) => `${k} = ${valueToR(v)}`);
    return `list(${entries.join(', ')})`;
}

function getParamsCommand(document: vscode.TextDocument): string | undefined {
    const text = document.getText();
    const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match || !/^\s*params\s*:/m.test(match[1])) return undefined;
    try {
        const frontmatter = yaml.load(match[1], { schema: RMARKDOWN_SCHEMA }) as Record<string, unknown>;
        const params = frontmatter?.['params'] as Record<string, unknown> | undefined;
        if (!params || typeof params !== 'object') return undefined;
        const entries = Object.entries(params).map(([k, v]) => `${k} = ${valueToR(v)}`);
        return `params <- list(${entries.join(', ')})`;
    } catch {
        return undefined;
    }
}

const R_TERMINAL_NAMES = ['R', 'R Interactive'];

function findRTerminal(): vscode.Terminal | undefined {
    const active = vscode.window.activeTerminal;
    if (active && R_TERMINAL_NAMES.includes(active.name)) return active;
    return vscode.window.terminals
        .slice()
        .reverse()
        .find(t => R_TERMINAL_NAMES.includes(t.name));
}

export function activate(context: vscode.ExtensionContext): void {
    let lastPath: string | undefined;

    const handleEditor = (editor: vscode.TextEditor | undefined) => {
        if (!editor) return;
        const enabled = vscode.workspace.getConfiguration('vscode-morrr').get<boolean>('enabled', true);
        if (!enabled) return;
        const doc = editor.document;
        if (doc.languageId !== 'rmd' && !/\.Rmd$/i.test(doc.fileName)) return;
        if (doc.uri.fsPath === lastPath) return;
        lastPath = doc.uri.fsPath;

        const cmd = getParamsCommand(doc);
        if (!cmd) return;

        const terminal = findRTerminal();
        if (!terminal) return;

        terminal.sendText(cmd);
    };

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(handleEditor)
    );

    handleEditor(vscode.window.activeTextEditor);
}

export function deactivate(): void {}
