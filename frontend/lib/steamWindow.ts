import { Router } from '@steambrew/client';

declare global {
	interface Window {
		MainWindowBrowserManager?: {
			m_lastLocation?: { pathname?: string };
		};
	}
}

/** This plugin's frontend script runs in its own isolated top-level
 * browsing context, not inside the real Steam window -- confirmed via
 * live DevTools with the user (document.querySelectorAll('[aria-label]')
 * returns 0 in our own console vs 15+ in the real window's), which also
 * ruled out window.top (there's no parent/child relationship to escape
 * through; it just resolves back to itself). Anything tied to the real
 * page's own script realm -- its DOM, and JS singletons like
 * window.appStore that Steam's own webpack bundle creates -- is
 * therefore unreachable via the bare `window`/`document` globals
 * anywhere in this plugin.
 *
 * @steambrew/client's `Router` module is reflected via webpack-module
 * search (the same mechanism routerHook's constructor uses successfully)
 * and exposes Router.WindowStore.SteamUIWindows -- an array Steam itself
 * maintains of every real UI window, each carrying an actual
 * `BrowserWindow: Window` reference handed to us directly, sidestepping
 * the window.top dead end entirely.
 *
 * Since window names aren't confirmed stable, this picks whichever
 * window's document has the most [aria-label] elements -- a cheap proxy
 * for "this is the real, content-rich page." Router.WindowStore can also
 * only have the (empty) login window registered this early in Steam's
 * startup, before the real desktop window exists yet -- callers that
 * need this to eventually succeed should re-resolve on a timer rather
 * than caching a single result (see patchLibraryApp.tsx's
 * ensureObserverAttached). */
export function resolveRealWindow(): Window | null {
	try {
		const entries = Router.WindowStore?.SteamUIWindows ?? [];
		let best: Window | null = null;
		let bestScore = -1;
		for (const entry of entries) {
			const candidate = entry?.BrowserWindow;
			if (!candidate) {
				continue;
			}
			let score = -1;
			try {
				score = candidate.document?.querySelectorAll('[aria-label]').length ?? -1;
			} catch {
				score = -1;
			}
			if (score > bestScore) {
				bestScore = score;
				best = candidate;
			}
		}
		if (best && bestScore > 0) {
			return best;
		}
	} catch {
		// fall through to the legacy window.top guess below
	}
	try {
		return window.top && window.top !== window ? window.top : window;
	} catch {
		return null;
	}
}
