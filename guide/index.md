# AI Agent Guide: unplayable

**Role**: You are an AI assistant tasked with understanding, integrating, or extending `unplayable` audio recording and processing capabilities in applications.

**Goal**: Provide a comprehensive understanding of `unplayable`'s capabilities, architecture, and usage patterns to facilitate correct implementation and extension.

## Core Capabilities

`unplayable` is a cross-platform audio recording and processing library for Node.js. It wraps FFmpeg to provide a consistent API for managing audio devices and capturing audio.

*   **Audio Recording**: Captures audio from system devices using FFmpeg (via `avfoundation` on macOS, with intended support for others).
*   **Device Management**: Lists, detects, and validates audio input devices.
*   **File Processing**: Validates and manages audio files (MP3, WAV, FLAC, etc.).
*   **Configuration**: Manages recording settings (paths, timeouts, log levels) via files or environment variables.
*   **Type-Safe**: Written in TypeScript with comprehensive type definitions.

## Quick Start Context

When analyzing or generating code using `unplayable`, keep these patterns in mind:

1.  **Factory Creation**: Use `createUnplayable()` to instantiate the main class with config.
2.  **Convenience Wrappers**: Use `processAudio()` or `recordAudio()` for simple one-off tasks.
3.  **Device Discovery**: Use `getAudioDevices()` to inspect available inputs before recording.
4.  **Error Handling**: Wrap calls in try/catch blocks handling specific error types (`AudioDeviceError`, `AudioRecordingError`).

```typescript
import { createUnplayable } from '@utilarium/unplayable';

const unplayable = await createUnplayable();

// Record for 10 seconds
const result = await unplayable.processAudio({
    maxRecordingTime: 10,
    outputDirectory: './recordings'
});
```

## Documentation Structure

This guide directory contains specialized documentation for different aspects of the system:

*   [Configuration](./configuration.md): Details on configuration options, environment variables, and file formats.
*   [Usage Patterns](./usage.md): Common patterns for recording, device selection, and error handling.
*   [Architecture](./architecture.md): Internal design, module structure, and data flow.
*   [Development](./development.md): Guide for contributing to `unplayable` itself.

