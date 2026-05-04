/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        // Stub out the vscode API — tests import it from __mocks__
        vscode: '<rootDir>/src/__mocks__/vscode.ts',
    },
    testMatch: ['**/src/tests/**/*.test.ts'],
};
