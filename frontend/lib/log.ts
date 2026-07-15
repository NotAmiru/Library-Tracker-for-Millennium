import { jsonRpc } from './rpc';

const PREFIX = '[LibraryTracker]';

// Piped to the backend's logger too (see main.lua's log_frontend), since
// CEF DevTools console access varies a lot by Millennium setup and
// everyone testing this plugin has already found the Logs panel that
// backend logger:info/warn/error calls show up in. Uses the same
// jsonRpc single-{data}-argument convention as every other RPC in this
// plugin (see rpc.ts for why that convention exists at all), and never
// throws back into logError/logInfo itself -- that would risk a
// logging-about-logging loop.
const logFrontendRpc = jsonRpc<{ success: boolean }>('log_frontend');

function pipeToBackend(level: 'info' | 'warn' | 'error', message: string): void {
	logFrontendRpc({ level, message }).catch(() => {
		// Deliberately swallowed: if the backend logger itself is
		// unreachable, there's nothing more useful to do than what
		// console.log/console.error below already did.
	});
}

/** All frontend errors funnel through here rather than being left as
 * unhandled promise rejections, which otherwise fail silently in Steam's
 * UI (no visible crash, just a stuck loading state or a no-op button) --
 * this at least puts a clearly-prefixed trace in the CEF console and the
 * backend Logs panel. */
export function logError(context: string, error: unknown): void {
	const message = `${context}: ${error instanceof Error ? error.message : String(error)}`;
	console.error(`${PREFIX} ${context}:`, error);
	pipeToBackend('error', message);
}

export function logInfo(message: string): void {
	console.log(`${PREFIX} ${message}`);
	pipeToBackend('info', message);
}
