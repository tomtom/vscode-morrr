/**
 * Tests for the shouldInject cache helper and the core params-injection logic,
 * including the window-focus guard introduced in issue 2.
 *
 * VS Code API is fully stubbed via src/__mocks__/vscode.ts so no real extension
 * host is required.
 */

import { shouldInject, TextSink, activate, LOAD_PARAMS_COMMAND } from '../extension';
import * as vscodeStub from '../__mocks__/vscode';
import { makeTerminal, makeDocument } from '../__mocks__/vscode';

// Re-export type alias so tests read clearly
type TerminalCache = WeakMap<TextSink, Map<string, string>>;

const FILE_A = '/workspace/report.Rmd';
const FILE_B = '/workspace/analysis.Rmd';
const CMD_1 = 'params <- list(n = 10)';
const CMD_2 = 'params <- list(n = 20)';

const RMD_WITH_PARAMS = `---
title: Test
params:
  n: 10
---
`;

function makeCache(): TerminalCache {
    return new WeakMap();
}

/** Minimal ExtensionContext stub — only subscriptions is needed. */
function makeContext() {
    return { subscriptions: { push: jest.fn() } };
}

beforeEach(() => {
    jest.clearAllMocks();
    vscodeStub.window.state.focused = true;
    vscodeStub.window.activeTextEditor = undefined;
    vscodeStub.window.activeTerminal = undefined;
    vscodeStub.window.terminals = [];
});

// ---------------------------------------------------------------------------
// shouldInject cache helper
// ---------------------------------------------------------------------------

describe('shouldInject', () => {
    it('returns true on first call for a terminal+file combination', () => {
        const cache = makeCache();
        const terminal = makeTerminal('R');
        expect(shouldInject(cache, terminal, FILE_A, CMD_1)).toBe(true);
    });

    it('returns false when the same command is sent again to the same terminal and file', () => {
        const cache = makeCache();
        const terminal = makeTerminal('R');
        shouldInject(cache, terminal, FILE_A, CMD_1); // first call — populates cache
        expect(shouldInject(cache, terminal, FILE_A, CMD_1)).toBe(false);
    });

    it('returns true when the command changes for the same terminal and file', () => {
        const cache = makeCache();
        const terminal = makeTerminal('R');
        shouldInject(cache, terminal, FILE_A, CMD_1);
        expect(shouldInject(cache, terminal, FILE_A, CMD_2)).toBe(true);
    });

    it('updates the cache after returning true so a subsequent identical call returns false', () => {
        const cache = makeCache();
        const terminal = makeTerminal('R');
        shouldInject(cache, terminal, FILE_A, CMD_1);
        shouldInject(cache, terminal, FILE_A, CMD_2); // updates cache to CMD_2
        expect(shouldInject(cache, terminal, FILE_A, CMD_2)).toBe(false);
    });

    it('treats different terminals independently for the same file and command', () => {
        const cache = makeCache();
        const terminalA = makeTerminal('R');
        const terminalB = makeTerminal('R Interactive');

        shouldInject(cache, terminalA, FILE_A, CMD_1); // inject into terminal A
        // terminal B has never seen this file — should also inject
        expect(shouldInject(cache, terminalB, FILE_A, CMD_1)).toBe(true);
    });

    it('treats different files independently for the same terminal and command', () => {
        const cache = makeCache();
        const terminal = makeTerminal('R');
        shouldInject(cache, terminal, FILE_A, CMD_1);
        expect(shouldInject(cache, terminal, FILE_B, CMD_1)).toBe(true);
    });

    it('does not cross-contaminate state between two separate caches', () => {
        const cacheA = makeCache();
        const cacheB = makeCache();
        const terminal = makeTerminal('R');
        shouldInject(cacheA, terminal, FILE_A, CMD_1);
        // cacheB is fresh — should still return true
        expect(shouldInject(cacheB, terminal, FILE_A, CMD_1)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Window-focus guard (issue 2)
// ---------------------------------------------------------------------------

describe('activate — window focus guard', () => {
    /**
     * Calls activate and returns the handleEditor callback that was registered
     * with onDidChangeActiveTextEditor.
     */
    function activateAndGetHandler() {
        let registeredHandler: ((e: vscodeStub.TextEditor | undefined) => void) | undefined;
        (vscodeStub.window.onDidChangeActiveTextEditor as jest.Mock).mockImplementation(
            (cb: (e: vscodeStub.TextEditor | undefined) => void) => {
                registeredHandler = cb;
                return { dispose: jest.fn() };
            },
        );
        activate(makeContext() as never);
        return registeredHandler!;
    }

    it('does not inject params when the VS Code window does not have focus', () => {
        vscodeStub.window.state.focused = false;
        const terminal = makeTerminal('R');
        vscodeStub.window.terminals = [terminal];
        vscodeStub.window.activeTerminal = terminal;

        const handleEditor = activateAndGetHandler();
        const editor = { document: makeDocument(FILE_A, RMD_WITH_PARAMS) };
        handleEditor(editor);

        expect(terminal.sendText).not.toHaveBeenCalled();
    });

    it('injects params when the VS Code window has focus', () => {
        vscodeStub.window.state.focused = true;
        const terminal = makeTerminal('R');
        vscodeStub.window.terminals = [terminal];
        vscodeStub.window.activeTerminal = terminal;

        const handleEditor = activateAndGetHandler();
        const editor = { document: makeDocument(FILE_A, RMD_WITH_PARAMS) };
        handleEditor(editor);

        expect(terminal.sendText).toHaveBeenCalledWith('params <- list(n = 10)');
    });

    it('injects params when the window regains focus via onDidChangeWindowState', () => {
        const terminal = makeTerminal('R');
        vscodeStub.window.terminals = [terminal];
        vscodeStub.window.activeTerminal = terminal;

        const editor = { document: makeDocument(FILE_A, RMD_WITH_PARAMS) };
        vscodeStub.window.activeTextEditor = editor;

        let windowStateHandler: ((s: { focused: boolean }) => void) | undefined;
        (vscodeStub.window.onDidChangeWindowState as jest.Mock).mockImplementation(
            (cb: (s: { focused: boolean }) => void) => {
                windowStateHandler = cb;
                return { dispose: jest.fn() };
            },
        );

        // Window starts unfocused — activate fires handleEditor on startup but skips
        vscodeStub.window.state.focused = false;
        activate(makeContext() as never);
        expect(terminal.sendText).not.toHaveBeenCalled();

        // Window regains focus — onDidChangeWindowState fires
        vscodeStub.window.state.focused = true;
        windowStateHandler!({ focused: true });

        expect(terminal.sendText).toHaveBeenCalledWith('params <- list(n = 10)');
    });
});

// ---------------------------------------------------------------------------
// Manual command (issue 3)
// ---------------------------------------------------------------------------

describe('activate — loadParams command', () => {
    /**
     * Calls activate and returns the callback registered for LOAD_PARAMS_COMMAND.
     */
    function activateAndGetCommand(): () => void {
        let commandHandler: (() => void) | undefined;
        (vscodeStub.commands.registerCommand as jest.Mock).mockImplementation(
            (id: string, cb: () => void) => {
                if (id === LOAD_PARAMS_COMMAND) commandHandler = cb;
                return { dispose: jest.fn() };
            },
        );
        activate(makeContext() as never);
        return commandHandler!;
    }

    it('sends params to the R terminal when invoked manually', () => {
        const terminal = makeTerminal('R');
        vscodeStub.window.terminals = [terminal];
        vscodeStub.window.activeTerminal = terminal;
        vscodeStub.window.activeTextEditor = { document: makeDocument(FILE_A, RMD_WITH_PARAMS) };

        const runCommand = activateAndGetCommand();
        runCommand();

        expect(terminal.sendText).toHaveBeenCalledWith('params <- list(n = 10)');
    });

    it('sends params even when the window does not have focus', () => {
        vscodeStub.window.state.focused = false;
        const terminal = makeTerminal('R');
        vscodeStub.window.terminals = [terminal];
        vscodeStub.window.activeTerminal = terminal;
        vscodeStub.window.activeTextEditor = { document: makeDocument(FILE_A, RMD_WITH_PARAMS) };

        const runCommand = activateAndGetCommand();
        runCommand();

        expect(terminal.sendText).toHaveBeenCalledWith('params <- list(n = 10)');
    });

    it('sends params even when they are unchanged since last injection', () => {
        // Start unfocused so activate's startup handleEditor call is a no-op
        vscodeStub.window.state.focused = false;
        const terminal = makeTerminal('R');
        vscodeStub.window.terminals = [terminal];
        vscodeStub.window.activeTerminal = terminal;
        vscodeStub.window.activeTextEditor = { document: makeDocument(FILE_A, RMD_WITH_PARAMS) };

        const runCommand = activateAndGetCommand();

        vscodeStub.window.state.focused = true;
        runCommand(); // first manual call
        runCommand(); // second manual call — params unchanged, but manual so must send again

        expect(terminal.sendText).toHaveBeenCalledTimes(2);
    });

    it('shows an info message when no R terminal is open', () => {
        vscodeStub.window.terminals = [];
        vscodeStub.window.activeTerminal = undefined;
        vscodeStub.window.activeTextEditor = { document: makeDocument(FILE_A, RMD_WITH_PARAMS) };

        const runCommand = activateAndGetCommand();
        runCommand();

        expect(vscodeStub.window.showInformationMessage).toHaveBeenCalledWith(
            'No R terminal found. Please open an R terminal first.',
        );
    });

    it('shows an info message when the active document has no params', () => {
        const terminal = makeTerminal('R');
        vscodeStub.window.terminals = [terminal];
        vscodeStub.window.activeTerminal = terminal;
        vscodeStub.window.activeTextEditor = {
            document: makeDocument(FILE_A, '---\ntitle: No params here\n---\n'),
        };

        const runCommand = activateAndGetCommand();
        runCommand();

        expect(vscodeStub.window.showInformationMessage).toHaveBeenCalledWith(
            'No params found in YAML metadata.',
        );
        expect(terminal.sendText).not.toHaveBeenCalled();
    });
});
