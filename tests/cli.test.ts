import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mocks = vi.hoisted(() => ({
    recordAudio: vi.fn(),
    listAudioDevices: vi.fn(),
    consoleLog: vi.fn(),
    consoleError: vi.fn(),
    processExit: vi.fn(),
    configure: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    ensureDirectories: vi.fn()
}));

// Mock Unplayable class
const mockUnplayable = {
    recordAudio: mocks.recordAudio
};

// Mock cardigantime
mocks.create.mockReturnValue({
    configure: mocks.configure,
    read: mocks.read
});

// Mock modules
vi.mock('@utilarium/cardigantime', () => ({
    create: (...args: any[]) => mocks.create(...args)
}));

vi.mock('../src/configuration', () => ({
    createConfiguration: vi.fn(() => ({
        ensureDirectories: mocks.ensureDirectories
    }))
}));

vi.mock('../src/unplayable', async () => {
    const actual = await vi.importActual<any>('../src/unplayable');
    return {
        ...actual,
        Unplayable: vi.fn(function() { return mockUnplayable; }),
        createDefaultLogger: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        }))
    };
});

vi.mock('../src/devices', () => ({
    listAudioDevices: mocks.listAudioDevices
}));

// Import the CLI creation function
import { createProgram } from '../src/cli';

describe('CLI', () => {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalProcessExit = process.exit;

    beforeEach(() => {
        vi.clearAllMocks();
        console.log = mocks.consoleLog;
        console.error = mocks.consoleError;
        process.exit = mocks.processExit as any;

        // Default config mock
        mocks.read.mockResolvedValue({
            outputDirectory: '/default/output',
            logging: { level: 'info' }
        });
    });

    afterEach(() => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        process.exit = originalProcessExit;
    });

    it('should create program with correct metadata', async () => {
        const program = await createProgram();
        expect(program.name()).toBe('unplayable');
        expect(program.description()).toBe('Audio recording and processing utility');
    });

    describe('devices command', () => {
        it('should list available devices', async () => {
            mocks.listAudioDevices.mockResolvedValue([
                { index: '0', name: 'Microphone' },
                { index: '1', name: 'Speaker' }
            ]);

            const program = await createProgram();
            await program.parseAsync(['node', 'unplayable', 'devices']);

            expect(mocks.listAudioDevices).toHaveBeenCalled();
            expect(mocks.consoleLog).toHaveBeenCalledWith(expect.stringContaining('Available Audio Devices'));
            expect(mocks.consoleLog).toHaveBeenCalledWith(expect.stringContaining('[0] Microphone'));
            expect(mocks.consoleLog).toHaveBeenCalledWith(expect.stringContaining('[1] Speaker'));
        });

        it('should handle no devices found', async () => {
            mocks.listAudioDevices.mockResolvedValue([]);

            const program = await createProgram();
            await program.parseAsync(['node', 'unplayable', 'devices']);

            expect(mocks.consoleLog).toHaveBeenCalledWith(expect.stringContaining('No devices found'));
        });

        it('should handle errors listing devices', async () => {
            mocks.listAudioDevices.mockRejectedValue(new Error('Device error'));

            const program = await createProgram();
            await program.parseAsync(['node', 'unplayable', 'devices']);

            expect(mocks.consoleError).toHaveBeenCalledWith('Failed to list devices:', 'Device error');
            expect(mocks.processExit).toHaveBeenCalledWith(1);
        });
    });

    describe('record command', () => {
        it('should record audio with defaults', async () => {
            mocks.recordAudio.mockResolvedValue('/path/to/recording.wav');

            const program = await createProgram();
            await program.parseAsync(['node', 'unplayable', 'record']);

            expect(mocks.recordAudio).toHaveBeenCalledWith({
                maxRecordingTime: 60,
                outputDirectory: '/default/output'
            });
            expect(mocks.consoleLog).toHaveBeenCalledWith(expect.stringContaining('Success! Audio saved to'));
            expect(mocks.consoleLog).toHaveBeenCalledWith(expect.stringContaining('/path/to/recording.wav'));
        });

        it('should accept custom time and output options', async () => {
            mocks.recordAudio.mockResolvedValue('/custom/recording.wav');

            const program = await createProgram();
            await program.parseAsync([
                'node', 
                'unplayable', 
                'record', 
                '--time', '10', 
                '--output', '/custom/output'
            ]);

            // cardigantime read should be called with overrides
            expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({
                outputDirectory: '/custom/output'
            }));

            // Mock that config returns updated value
            mocks.read.mockResolvedValueOnce({
                outputDirectory: '/custom/output',
                logging: { level: 'info' }
            });

            // But recordAudio gets args from CLI options too
            expect(mocks.recordAudio).toHaveBeenCalledWith(expect.objectContaining({
                maxRecordingTime: 10
            }));
        });

        it('should accept device index', async () => {
            mocks.recordAudio.mockResolvedValue('/path/to/recording.wav');

            const program = await createProgram();
            await program.parseAsync(['node', 'unplayable', 'record', '--device', '2']);

            expect(mocks.recordAudio).toHaveBeenCalledWith(expect.objectContaining({
                audioDevice: '2'
            }));
        });

        it('should handle recording errors', async () => {
            mocks.recordAudio.mockRejectedValue(new Error('Recording failed'));

            const program = await createProgram();
            await program.parseAsync(['node', 'unplayable', 'record']);

            expect(mocks.consoleError).toHaveBeenCalledWith('\nRecording failed:', 'Recording failed');
            expect(mocks.processExit).toHaveBeenCalledWith(1);
        });
    });

    describe('configuration integration', () => {
        it('should configure cardigantime with correct options', async () => {
            await createProgram();

            expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
                defaults: expect.objectContaining({
                    configDirectory: expect.stringContaining('.unplayable'),
                    configFile: 'config.yaml'
                })
            }));
            
            expect(mocks.configure).toHaveBeenCalled();
        });
    });
});

