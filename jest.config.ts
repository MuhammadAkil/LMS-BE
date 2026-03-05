import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: 'src',
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/__tests__/**/*.spec.ts',
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                // Override for tests: relax strict checks on test files
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                noImplicitAny: false,
            },
        }],
    },
    moduleNameMapper: {
        // Resolve paths used in source (matches tsconfig baseUrl: ./src)
        '^config/(.*)$': '<rootDir>/config/$1',
        '^service/(.*)$': '<rootDir>/service/$1',
        '^repository/(.*)$': '<rootDir>/repository/$1',
        '^domain/(.*)$': '<rootDir>/domain/$1',
        '^dto/(.*)$': '<rootDir>/dto/$1',
        '^middleware/(.*)$': '<rootDir>/middleware/$1',
        '^util/(.*)$': '<rootDir>/util/$1',
    },
    collectCoverageFrom: [
        'service/Company*.ts',
        'controller/Company*.ts',
        'middleware/CompanyGuards.ts',
        '!**/*.d.ts',
    ],
    coverageDirectory: '<rootDir>/../coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    // Setup files run before each test suite
    setupFilesAfterEnv: [],
    // Increase timeout for integration-style tests
    testTimeout: 15000,
    verbose: true,
};

export default config;
