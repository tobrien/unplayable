# Usage Patterns

**Purpose**: Common patterns for integrating `unplayable` into applications.

## Basic Recording

The most common use case is recording audio for a fixed duration.

```typescript
import { createUnplayable } from '@utilarium/unplayable';

const unplayable = await createUnplayable();

try {
    const result = await unplayable.processAudio({
        maxRecordingTime: 60, // seconds
        outputDirectory: './recordings'
    });
    
    console.log(`Saved to: ${result.audioFilePath}`);
} catch (err) {
    console.error('Recording failed:', err);
}
```

## Interactive Device Selection

For CLI tools, you might want to ask the user to pick a device.

```typescript
const unplayable = await createUnplayable();

// Get list of devices
const devices = await unplayable.getAudioDevices();

// Interactive prompt (built-in helper)
const selectedDevice = await unplayable.selectAudioDevice();

if (selectedDevice) {
    console.log(`Selected: ${selectedDevice.name}`);
    
    // Configure this device for future use
    await unplayable.saveDeviceConfig({
        audioDevice: selectedDevice.index,
        audioDeviceName: selectedDevice.name
    });
}
```

## Validating Existing Files

You can use the library to validate audio files without recording.

```typescript
const unplayable = await createUnplayable();

try {
    await unplayable.validateAudioFile('./uploads/user-input.wav');
    console.log('File is valid');
} catch (err) {
    console.error('Invalid file:', err.message);
}
```

## Dry Run Mode

Useful for testing integration without actually creating files or accessing hardware.

```typescript
const result = await unplayable.processAudio({
    dryRun: true,
    maxRecordingTime: 30
});

// Logs "DRY RUN: Would start audio recording"
```

## Error Handling

Handle specific error types to provide better user feedback.

```typescript
import { 
    AudioDeviceError, 
    AudioRecordingError 
} from '@utilarium/unplayable';

try {
    await unplayable.recordAudio();
} catch (error) {
    if (error instanceof AudioDeviceError) {
        // Device disconnected or permissions denied
        console.error('Check your microphone settings');
    } else if (error instanceof AudioRecordingError) {
        // FFmpeg crashed or timed out
        console.error('Recording process failed');
    } else {
        console.error('Unknown error', error);
    }
}
```

