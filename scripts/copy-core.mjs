// The agent core is compiled from Tish (npm run build:core) into src/agents/core, next to the TypeScript that
// imports it; tsc does not copy .js files, so the build copies the core into dist beside the compiled TypeScript.
import { cpSync } from 'node:fs'

cpSync('src/agents/core', 'dist/agents/core', { recursive: true })
