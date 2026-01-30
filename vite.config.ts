import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import replace from '@rollup/plugin-replace';

export default defineConfig({
    plugins: [
        dts({
            insertTypesEntry: true,
            rollupTypes: true,
        }),
        replace({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
            preventAssignment: true,
        }),
    ],
    build: {
        lib: {
            entry: {
                unplayable: 'src/unplayable.ts',
                cli: 'src/cli.ts'
            },
            name: 'Unplayable',
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
        },
        rollupOptions: {
            external: [
                // Node built-ins
                /^node:/,
                // Dependencies
                'winston',
                'glob',
                'zod',
                'commander',
                '@utilarium/cardigantime'
            ],
        },
        target: 'esnext',
        minify: false,
        sourcemap: true,
    },
});
