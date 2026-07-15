#!/usr/bin/env node
// Wrapper around @steambrew/starlight's native binary.
//
// As published, starlight's `lsp`/`pack` commands look for `types.zip` and
// `webkit-types.zip` in the current working directory, but the npm package
// only ships them inside its own install location
// (node_modules/@steambrew/starlight/bin/millennium/types/) with no logic
// to find them relative to that location. Without this staging step,
// `starlight lsp` silently skips installing type stubs and `tsc` can't
// resolve the `millennium` module.
import { existsSync, copyFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = process.cwd();
const starlightPkgDir = join(projectRoot, 'node_modules', '@steambrew', 'starlight');
const typesDir = join(starlightPkgDir, 'bin', 'millennium', 'types');

const platformBinary = process.platform === 'win32' ? 'starlight-win32-x64.exe' : 'starlight-linux-x64';
const binaryPath = join(starlightPkgDir, 'binaries', platformBinary);

if (!existsSync(binaryPath)) {
	console.error(`starlight binary not found for this platform: ${binaryPath}`);
	process.exit(1);
}

const stagedFiles = ['types.zip', 'webkit-types.zip']
	.map((name) => ({ src: join(typesDir, name), dest: join(projectRoot, name) }))
	.filter(({ src }) => existsSync(src));

for (const { src, dest } of stagedFiles) {
	copyFileSync(src, dest);
}

// starlight's `-o <dir>` output flag requires the directory to already
// exist; create it up front so a fresh checkout can build immediately.
const args = process.argv.slice(2);
const outFlagIndex = args.findIndex((arg) => arg === '-o' || arg === '--of');
if (outFlagIndex !== -1 && args[outFlagIndex + 1]) {
	mkdirSync(args[outFlagIndex + 1], { recursive: true });
}

try {
	const result = spawnSync(binaryPath, args, { stdio: 'inherit' });
	process.exitCode = result.status ?? 1;
} finally {
	for (const { dest } of stagedFiles) {
		if (existsSync(dest)) rmSync(dest);
	}
}
