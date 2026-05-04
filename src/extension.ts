import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

const rExprType = new yaml.Type('!r', {
    kind: 'scalar',
    construct: (data: string) => ({ __rExpr: data }),
});
const RMARKDOWN_SCHEMA = yaml.DEFAULT_SCHEMA.extend([rExprType]);

/**
 * Converts a JavaScript value to its R literal representation.
 *
 * @param val - The value to convert. Supports null, boolean, number, string,
 *              objects with a `__rExpr` property (raw R expressions), arrays,
 *              and plain objects (converted to R named lists).
 * @returns A string containing the R literal for the given value.
 * @sideEffects None.
 */
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

/**
 * Extracts the `params` block from an RMarkdown YAML front matter and returns
 * an R assignment command string.
 *
 * @param document - The VS Code text document to parse.
 * @returns An R command string like `params <- list(...)`, or `undefined` if
 *          the document has no YAML front matter or no `params` key.
 * @sideEffects None.
 */
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

/** Terminal names recognised as R interactive sessions. */
const R_TERMINAL_NAMES = ['R', 'R Interactive'];

/**
 * Finds the most appropriate R terminal among the open VS Code terminals.
 * Prefers the currently active terminal if it is an R terminal; otherwise
 * returns the most recently opened R terminal.
 *
 * @returns The matching `vscode.Terminal`, or `undefined` if none is open.
 * @sideEffects None.
 */
function findRTerminal(): vscode.Terminal | undefined {
    const active = vscode.window.activeTerminal;
    if (active && R_TERMINAL_NAMES.includes(active.name)) return active;
    return vscode.window.terminals
        .slice()
        .reverse()
        .find(t => R_TERMINAL_NAMES.includes(t.name));
}

/**
 * Minimal interface for a terminal that can receive text.
 * Using a structural interface instead of `vscode.Terminal` directly keeps
 * the cache helper testable without a real VS Code extension host.
 */
export interface TextSink {
    sendText(text: string): void;
}

/**
 * Per-terminal cache mapping file system paths to the last R params command
 * that was sent to that terminal.  Using a WeakMap means closed terminals are
 * garbage-collected automatically without any explicit cleanup.
 *
 * Outer key : TextSink (vscode.Terminal in production, mock in tests)
 * Inner key : document fsPath
 * Value     : last injected params command string
 */
type TerminalCache = WeakMap<TextSink, Map<string, string>>;

/**
 * Determines whether the given params command should be sent to the terminal.
 * Returns true when the command differs from the last one sent to that
 * terminal for that file, and updates the cache if injection should proceed.
 *
 * @param cache   - The shared per-terminal command cache.
 * @param terminal - The target R terminal (any TextSink).
 * @param fsPath  - Absolute path of the active Rmd document.
 * @param cmd     - The R params command string about to be sent.
 * @returns `true` if the command is new or changed, `false` if it matches
 *          the previously injected command.
 * @sideEffects Updates `cache` when returning `true`.
 */
export function shouldInject(
    cache: TerminalCache,
    terminal: TextSink,
    fsPath: string,
    cmd: string,
): boolean {
    let fileMap = cache.get(terminal);
    if (!fileMap) {
        fileMap = new Map<string, string>();
        cache.set(terminal, fileMap);
    }
    if (fileMap.get(fsPath) === cmd) return false;
    fileMap.set(fsPath, cmd);
    return true;
}

/**
 * Activates the extension, registering event listeners that automatically
 * inject RMarkdown params into an R terminal when an Rmd file is focused.
 *
 * @param context - The VS Code extension context used to register disposables.
 * @returns void
 * @sideEffects Registers event listeners on `vscode.window`; sends text to R
 *              terminals via `terminal.sendText`.
 */
export function activate(context: vscode.ExtensionContext): void {
    const cache: TerminalCache = new WeakMap();

    const handleEditor = (editor: vscode.TextEditor | undefined) => {
        if (!editor) return;
        const enabled = vscode.workspace.getConfiguration('vscode-morrr').get<boolean>('enabled', true);
        if (!enabled) return;
        const doc = editor.document;
        if (doc.languageId !== 'rmd' && !/\.Rmd$/i.test(doc.fileName)) return;

        const cmd = getParamsCommand(doc);
        if (!cmd) return;

        const terminal = findRTerminal();
        if (!terminal) return;

        if (!shouldInject(cache, terminal, doc.uri.fsPath, cmd)) return;

        terminal.sendText(cmd);
    };

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(handleEditor)
    );

    handleEditor(vscode.window.activeTextEditor);
}

export function deactivate(): void {}
