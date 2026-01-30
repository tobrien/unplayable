#!/usr/bin/env node

import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { create } from '@utilarium/cardigantime';
import { Command } from 'commander';

import { createConfiguration } from './configuration';
import { listAudioDevices } from './devices';
import { createAudioProcessor } from './processor';
import { 
    UnplayableConfigSchema 
} from './types';
import { 
    Unplayable, 
    createDefaultLogger 
} from './unplayable';

export async function createProgram() {
    const program = new Command();
    
    // Create cardigantime manager
    // We use the shape from UnplayableConfigSchema
    const manager = create({
        configShape: UnplayableConfigSchema.shape,
        defaults: {
            configDirectory: path.join(os.homedir(), '.unplayable'),
            configFile: 'config.yaml',
            pathResolution: {
                pathFields: ['outputDirectory', 'preferencesDirectory']
            }
        }
    });

    program
        .name('unplayable')
        .description('Audio recording and processing utility')
        .version('0.0.1');

    // Configure cardigantime (adds -c, etc)
    await manager.configure(program);

    // Command: record
    program
        .command('record')
        .description('Record audio from a device')
        .option('-o, --output <dir>', 'Output directory')
        .option('-t, --time <seconds>', 'Maximum recording time (seconds)', (val) => parseInt(val, 10))
        .option('-d, --device <index>', 'Audio device index')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .action(async (options: any) => {
            // Map CLI flags to config structure
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const overrides: any = {};
            if (options.output) overrides.outputDirectory = options.output;
            
            const config = await manager.read(overrides);
            
            // Create Unplayable instance manually
            const logger = createDefaultLogger(
                config.logging?.level || 'info',
                config.logging?.silent || false
            );
            
            const configManager = createConfiguration(config, logger);
            await configManager.ensureDirectories();
            
            const processor = createAudioProcessor(logger, configManager);
            const unplayable = new Unplayable(processor, configManager, logger);

            console.log('Starting recording...');
            try {
                const filePath = await unplayable.recordAudio({
                    maxRecordingTime: options.time || 60, // Default 60s
                    audioDevice: options.device,
                    outputDirectory: config.outputDirectory
                });
                console.log(`\nSuccess! Audio saved to:\n${filePath}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                console.error('\nRecording failed:', err.message);
                process.exit(1);
            }
        });

    // Command: devices
    program
        .command('devices')
        .description('List available audio devices')
        .action(async () => {
            const config = await manager.read({});
            const logger = createDefaultLogger(
                config.logging?.level || 'info',
                config.logging?.silent || true 
            );

            try {
                const devices = await listAudioDevices(logger);
                console.log('\nAvailable Audio Devices:');
                console.log('------------------------');
                if (devices.length === 0) {
                    console.log('No devices found.');
                } else {
                    devices.forEach(d => {
                        console.log(`[${d.index}] ${d.name}`);
                    });
                }
                console.log('');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                console.error('Failed to list devices:', err.message);
                process.exit(1);
            }
        });

    return program;
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    createProgram()
        .then(program => program.parseAsync(process.argv))
        .catch(console.error);
}
