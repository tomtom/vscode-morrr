/**
 * Tests for the shouldInject cache helper and the core params-injection logic.
 *
 * VS Code API is fully stubbed via src/__mocks__/vscode.ts so no real extension
 * host is required.
 */

import { shouldInject, TextSink } from '../extension';
import { makeTerminal } from '../__mocks__/vscode';

// Re-export type alias so tests read clearly
type TerminalCache = WeakMap<TextSink, Map<string, string>>;

const FILE_A = '/workspace/report.Rmd';
const FILE_B = '/workspace/analysis.Rmd';
const CMD_1 = 'params <- list(n = 10)';
const CMD_2 = 'params <- list(n = 20)';

function makeCache(): TerminalCache {
    return new WeakMap();
}

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
