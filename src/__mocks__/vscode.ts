/**
 * Minimal VS Code API stub for unit tests.
 *
 * Only the symbols used by extension.ts are implemented. All other VS Code
 * APIs are intentionally omitted so tests remain fast and dependency-free.
 */

export const window = {
    activeTerminal: undefined as Terminal | undefined,
    terminals: [] as Terminal[],
    activeTextEditor: undefined as TextEditor | undefined,
    onDidChangeActiveTextEditor: jest.fn(() => ({ dispose: jest.fn() })),
    onDidCloseTerminal: jest.fn(() => ({ dispose: jest.fn() })),
};

export const workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
    })),
};

export interface Terminal {
    name: string;
    sendText: jest.Mock;
}

export interface TextDocument {
    languageId: string;
    fileName: string;
    uri: { fsPath: string };
    getText(): string;
}

export interface TextEditor {
    document: TextDocument;
}

/**
 * Factory for creating a minimal Terminal mock.
 * @param name - The terminal name (e.g. "R" or "R Interactive").
 */
export function makeTerminal(name: string): Terminal {
    return { name, sendText: jest.fn() };
}

/**
 * Factory for creating a minimal TextDocument mock.
 * @param fsPath - Absolute file path.
 * @param content - Raw file content.
 * @param languageId - VS Code language identifier (default: "rmd").
 */
export function makeDocument(
    fsPath: string,
    content: string,
    languageId = 'rmd',
): TextDocument {
    return {
        languageId,
        fileName: fsPath,
        uri: { fsPath },
        getText: () => content,
    };
}
