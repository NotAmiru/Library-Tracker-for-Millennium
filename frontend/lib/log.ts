const PREFIX = '[LibraryTracker]';

/** All frontend errors funnel through here rather than being left as
 * unhandled promise rejections, which otherwise fail silently in Steam's
 * UI (no visible crash, just a stuck loading state or a no-op button) --
 * this at least puts a clearly-prefixed trace in the CEF console. */
export function logError(context: string, error: unknown): void {
	console.error(`${PREFIX} ${context}:`, error);
}

export function logInfo(message: string): void {
	console.log(`${PREFIX} ${message}`);
}
