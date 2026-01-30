/* eslint-disable @typescript-eslint/no-explicit-any */
import * as os from 'node:os';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AudioProcessor } from '../src/processor';
import { AudioProcessingOptions } from '../src/types';
import { AudioRecordingError } from '../src/error';
import * as devices from '../src/devices';
import * as validation from '../src/validation';
import * as storage from '../src/util/storage';
import * as child from '../src/util/child';

// Mock dependencies
vi.mock('../src/devices');
vi.mock('../src/validation');
vi.mock('../src/util/storage');
vi.mock('../src/util/child');
vi.mock('os');
vi.mock('child_process');

describe('AudioProcessor Coverage', () => {
    let processor: AudioProcessor;
    let mockLogger: any;
    let mockStorage: any;
    let mockChildProcess: any;
    let spawnMock: any;
    let mockStdin: any;

    const baseOptions: AudioProcessingOptions = {
        outputDirectory: '/output',
        maxRecordingTime: 60
    };

    beforeEach(async () => {
        // Setup Logger
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn()
        };

        // Setup Storage
        mockStorage = {
            createDirectory: vi.fn(),
            listFiles: vi.fn().mockResolvedValue([]),
            deleteFile: vi.fn(),
            getFileStats: vi.fn().mockResolvedValue({ size: 1024 }),
            copyFile: vi.fn(),
            ensureDirectory: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn()
        };
        vi.mocked(storage.createStorage).mockReturnValue(mockStorage);
        vi.mocked(storage.generateTimestampedFilename).mockReturnValue('test-recording.wav');
        vi.mocked(storage.generateUniqueFilename).mockResolvedValue('/output/unique-recording.wav');

        // Setup Child Process
        mockChildProcess = {
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn(),
            kill: vi.fn(),
            killed: false
        };
        
        const childProcess = await import('child_process');
        spawnMock = vi.mocked(childProcess.spawn);
        spawnMock.mockReturnValue(mockChildProcess);

        // Setup Stdin
        mockStdin = {
            setRawMode: vi.fn(),
            resume: vi.fn(),
            setEncoding: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn(),
            pause: vi.fn()
        };
        Object.defineProperty(process, 'stdin', {
            value: mockStdin,
            configurable: true
        });

        // Setup Validation
        vi.mocked(validation.validateAudioProcessingOptions).mockResolvedValue(undefined);
        vi.mocked(validation.validateAudioFile).mockResolvedValue(undefined);

        // Setup OS
        vi.mocked(os.tmpdir).mockReturnValue('/tmp');

        processor = new AudioProcessor(mockLogger);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Dry Run', () => {
        it('should handle dry run for recording', async () => {
            const result = await processor.processAudio({ ...baseOptions, dryRun: true });
            expect(result.cancelled).toBe(false);
            expect(result.metadata?.processingTime).toBe(0);
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would start audio recording');
        });

        it('should handle dry run for file processing', async () => {
            const result = await processor.processAudio({ ...baseOptions, dryRun: true, file: 'input.wav' });
            expect(result.cancelled).toBe(false);
            expect(result.metadata?.processingTime).toBe(0);
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would process audio file: input.wav');
        });
    });

    describe('Device Selection', () => {
        it('should auto-detect device when no device specified', async () => {
            vi.mocked(devices.detectBestAudioDevice).mockResolvedValue('2');
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);

            // Mock successful recording flow
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'close') cb(0, null);
            });

            await processor.processAudio({ ...baseOptions });

            expect(devices.detectBestAudioDevice).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Recording from device: [2]'));
        });

        it('should load device from preferences', async () => {
            const prefsDir = '/prefs';
            vi.mocked(devices.audioDeviceConfigExists).mockResolvedValue(true);
            vi.mocked(devices.loadAudioDeviceConfig).mockResolvedValue({
                audioDevice: '3',
                audioDeviceName: 'Saved Device'
            });

            // Mock successful recording flow
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'close') cb(0, null);
            });

            await processor.processAudio({ ...baseOptions, preferencesDirectory: prefsDir });

            expect(devices.loadAudioDeviceConfig).toHaveBeenCalledWith(prefsDir, mockLogger);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Recording from device: [3]'));
        });

        it('should throw if preferences directory has no config', async () => {
            const prefsDir = '/prefs';
            vi.mocked(devices.audioDeviceConfigExists).mockResolvedValue(false);

            await expect(processor.processAudio({ ...baseOptions, preferencesDirectory: prefsDir }))
                .rejects.toThrow('No audio device configured');
        });
        
        it('should throw if preferences config load returns null', async () => {
             const prefsDir = '/prefs';
            vi.mocked(devices.audioDeviceConfigExists).mockResolvedValue(true);
            vi.mocked(devices.loadAudioDeviceConfig).mockResolvedValue(null);

            await expect(processor.processAudio({ ...baseOptions, preferencesDirectory: prefsDir }))
                .rejects.toThrow('No audio device configuration found');
        });

        it('should validate specified device', async () => {
             vi.mocked(devices.validateAudioDevice).mockResolvedValue(false);

             await expect(processor.processAudio({ ...baseOptions, audioDevice: '99' }))
                .rejects.toThrow('Invalid configuration for audioDevice: 99');
        });
    });

    describe('Recording Cleanup', () => {
        it('should handle cleanup errors gracefully', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            mockStorage.listFiles.mockResolvedValue(['temp1.wav']);
            mockStorage.deleteFile.mockRejectedValue(new Error('Delete failed'));

            // Mock successful recording
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'close') cb(0, null);
            });

            await processor.processAudio({ ...baseOptions, audioDevice: '1' });

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to cleanup temporary directory'));
        });

        it('should keep temp files if requested', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            
             // Mock successful recording
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'close') cb(0, null);
            });

            await processor.processAudio({ ...baseOptions, audioDevice: '1', keepTemp: true });

            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Temporary recording kept at'));
            expect(mockStorage.deleteFile).not.toHaveBeenCalled();
        });
    });

    describe('Interactive Recording Edge Cases', () => {
        it('should handle missing setRawMode', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            
            // Remove setRawMode
            const originalSetRawMode = mockStdin.setRawMode;
            mockStdin.setRawMode = undefined;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'close') cb(0, null);
            });

            await processor.processAudio({ ...baseOptions, audioDevice: '1' });
            
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Press ENTER'));
            
            // Restore
            mockStdin.setRawMode = originalSetRawMode;
        });

        it('should ignore other keys', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            let keyHandler: Function;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockStdin.on.mockImplementation((event: string, handler: Function) => {
                if (event === 'data') keyHandler = handler;
            });

            const promise = processor.processAudio({ ...baseOptions, audioDevice: '1' });
            
            await new Promise(r => setTimeout(r, 0));
            
            // Simulate random keys
            if (keyHandler!) {
                keyHandler('a');
                keyHandler('b');
                keyHandler(' ');
            }
            
            // Then close normally
            const closeHandler = mockChildProcess.on.mock.calls.find((call: any[]) => call[0] === 'close')[1];
            closeHandler(0, null);

            await promise;
            // No specific assertion, just ensures it didn't crash or stop early
        });

        it('should handle ENTER key with process hanging', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            vi.useFakeTimers();

            // Setup spawn promise
            let spawnCalledResolve: (value: unknown) => void;
            const spawnCalledPromise = new Promise(resolve => { spawnCalledResolve = resolve; });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            let keyHandler: Function;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockStdin.on.mockImplementation((event: string, handler: Function) => {
                if (event === 'data') keyHandler = handler;
            });

            spawnMock.mockImplementation(() => {
                spawnCalledResolve(true);
                return mockChildProcess;
            });

            // Mock kill to NOT trigger close immediately
            mockChildProcess.kill.mockImplementation(() => {});
            mockChildProcess.killed = false;

            const promise = processor.processAudio({ ...baseOptions, audioDevice: '1' });
            
            await spawnCalledPromise;
            await Promise.resolve();

            // Press ENTER
            if (keyHandler!) keyHandler('\r');

            // Fast forward to trigger force kill timeout (1000ms)
            vi.advanceTimersByTime(1100);

            const result = await promise;
            expect(result.cancelled).toBe(false);
            expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL');
            
            vi.useRealTimers();
        });

        it('should handle Ctrl+C cancellation', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            let keyHandler: Function;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockStdin.on.mockImplementation((event: string, handler: Function) => {
                if (event === 'data') keyHandler = handler;
            });

            const promise = processor.processAudio({ ...baseOptions, audioDevice: '1' });
            
            await new Promise(r => setTimeout(r, 0));
            if (keyHandler!) keyHandler('\u0003'); // Ctrl+C

            const result = await promise;
            expect(result.cancelled).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Ctrl+C pressed'));
        });

        it('should handle stdout logging', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.stdout.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'data') cb(Buffer.from('ffmpeg output'));
            });
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'close') cb(0, null);
            });

            await processor.processAudio({ ...baseOptions, audioDevice: '1' });
            expect(mockLogger.debug).toHaveBeenCalledWith('ffmpeg stdout: ffmpeg output');
        });
        it('should guard against double resolution', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            let keyHandler: Function;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockStdin.on.mockImplementation((event: string, handler: Function) => {
                if (event === 'data') keyHandler = handler;
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            let closeCallback: Function;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'close') closeCallback = cb;
            });

            const promise = processor.processAudio({ ...baseOptions, audioDevice: '1' });
            
            await new Promise(r => setTimeout(r, 0));
            
            // 1. Trigger ENTER -> Sets isFinished = true
            if (keyHandler!) keyHandler('\r');

            // 2. Trigger CLOSE -> Should return early because isFinished is true
            if (closeCallback!) closeCallback(0, null);

            const result = await promise;
            expect(result.cancelled).toBe(false);
        });
    });

    describe('Non-Interactive Recording', () => {
        it('should use child.run when key handling is disabled', async () => {
             vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
             
             // Spy on private method by casting to any
             const spy = vi.spyOn(processor as any, 'shouldEnableKeyHandling');
             spy.mockReturnValue(false);

             vi.mocked(child.run).mockResolvedValue({
                 code: 0,
                 stdout: '',
                 stderr: ''
             });

             await processor.processAudio({ ...baseOptions, audioDevice: '1' });

             expect(child.run).toHaveBeenCalled();
             expect(spawnMock).not.toHaveBeenCalled(); // should use child.run instead
        });

        it('should handle errors in non-interactive mode', async () => {
             vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
             
             const spy = vi.spyOn(processor as any, 'shouldEnableKeyHandling');
             spy.mockReturnValue(false);

             vi.mocked(child.run).mockResolvedValue({
                 code: 1,
                 stdout: '',
                 stderr: 'FFmpeg failed'
             });

             await expect(processor.processAudio({ ...baseOptions, audioDevice: '1' }))
                .rejects.toThrow('FFmpeg exited with code 1');
        });
    });
    
    describe('Output Copying', () => {
        it('should copy to output directory', async () => {
             vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
             
             // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
             mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
                if (event === 'close') cb(0, null);
            });

             await processor.processAudio({ ...baseOptions, audioDevice: '1', outputDirectory: '/final' });

             expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('/final');
             expect(mockStorage.copyFile).toHaveBeenCalled();
        });
    });

    describe('Record Error Handling', () => {
        it('should cleanup temp dir when recording fails', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            mockStorage.listFiles.mockResolvedValue(['temp.wav']);
            
            // Mock recording failure
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
               if (event === 'error') cb(new Error('Spawn failed'));
           });

            await expect(processor.processAudio({ ...baseOptions, audioDevice: '1' }))
                .rejects.toThrow('Spawn failed');

            expect(mockStorage.listFiles).toHaveBeenCalled();
            expect(mockStorage.deleteFile).toHaveBeenCalled();
        });

        it('should handle ffmpeg non-zero exit in interactive mode', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            mockChildProcess.on.mockImplementation((event: string, cb: Function) => {
               if (event === 'close') cb(1, null);
           });

           await expect(processor.processAudio({ ...baseOptions, audioDevice: '1' }))
               .rejects.toThrow(AudioRecordingError);
        });
    });

    describe('Timeout Handling', () => {
        it('should handle max recording time in interactive mode', async () => {
            vi.mocked(devices.validateAudioDevice).mockResolvedValue(true);
            
            // Use fake timers to control setTimeout
            vi.useFakeTimers();

            // Setup a promise that resolves when spawn is called
            let spawnCalledResolve: (value: unknown) => void;
            const spawnCalledPromise = new Promise(resolve => { spawnCalledResolve = resolve; });

            spawnMock.mockImplementation(() => {
                spawnCalledResolve(true);
                return mockChildProcess;
            });

            // Mock close event after kill is called
            mockChildProcess.kill.mockImplementation(() => {
                 const closeHandler = mockChildProcess.on.mock.calls.find((call: any[]) => call[0] === 'close');
                 if (closeHandler && closeHandler[1]) {
                     closeHandler[1](0, 'SIGTERM');
                 }
            });

            const promise = processor.processAudio({ ...baseOptions, audioDevice: '1', maxRecordingTime: 1 });
            
            // Wait for spawn to be called (ensures we are inside recordWithKeyHandling)
            await spawnCalledPromise;
            
            // Give a tick for setTimeout to be registered
            await Promise.resolve();

            // Fast-forward time to trigger timeout
            vi.advanceTimersByTime(1100);

            await promise;

            expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Recording reached maximum time'));
            
            vi.useRealTimers();
        });
    });
});

