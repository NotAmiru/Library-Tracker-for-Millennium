import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { GameTagBadge } from '../components/GameTagBadge';
import { logError, logInfo } from './log';

// Two earlier approaches here both silently failed on a real desktop
// Millennium install: routerHook.addPatch('/library/app/:appid', ...)
// never fired, and a follow-up MutationObserver + document.querySelector
// approach also never fired. Live-device DevTools diagnostics (run jointly
// with the user, including a real execution-context dump logged from this
// exact code -- see diagnoseExecutionContext()) settled where the earlier
// code comment was wrong: this plugin's script runs directly in the same
// top-level document as the real Steam UI (Millennium injects into what
// its own logs call "SharedJSContext", which *is* the real window --
// isIframe was confirmed false, and document.getElementById('root') finds
// Steam's own React root). window.top vs window was a dead end.
//
// The actual blocker: window.MainWindowBrowserManager -- which the
// original appid-detection method depended on entirely -- does not exist
// in this context (confirmed via the same diagnostic dump). So the old
// code's very first gate (get an appid from that global) always failed
// before it ever got to check whether the container existed, even though
// the container itself is reachable once you're actually on a game page.
//
// Fixed by inverting the order: look for the container first (cheap,
// reliable), and only then try to resolve an appid -- first via
// MainWindowBrowserManager in case it's available on some other
// Millennium/Steam version, and if not, by reading it out of the game's
// own store/library header image URL, which Steam's CDN always serves as
// .../store_item_assets/steam/apps/{appid}/{hash}/header.jpg.
const APP_ID_PATTERN = /\/app\/(\d+)/;
const HEADER_IMAGE_APP_ID_PATTERN = /store_item_assets\/steam\/apps\/(\d+)\//;

// The container Steam renders the game-detail page's icon row (gear /
// controller / info / heart) into -- found via the user's own DevTools
// element picker on a real game page, not guessed. Still a webpack-hashed
// class name, so it can drift across Steam Client updates.
const CONTAINER_SELECTOR = '._1EAxK56o5a9Nieu5HYkJ4k';
const ROOT_ELEMENT_ID = 'library-tracker-game-badge';

declare global {
	interface Window {
		MainWindowBrowserManager?: {
			m_lastLocation?: { pathname?: string };
		};
	}
}

let observer: MutationObserver | null = null;
let mountedRoot: Root | null = null;
let mountedContainer: HTMLElement | null = null;
let currentAppId: number | null = null;
let loggedMissingAppId = false;

/** The real top-level Steam window, if reachable from this plugin's own
 * execution context -- kept as a fallback path (rather than assuming
 * `window` is always correct) in case a future Millennium version does
 * run plugin scripts inside a real iframe of the main window; same-origin
 * access can still throw, so every caller treats a thrown/undefined
 * result as "not reachable" rather than crashing the whole plugin. */
function topWindow(): Window | null {
	try {
		return window.top && window.top !== window ? window.top : window;
	} catch {
		return null;
	}
}

function diagnoseExecutionContext(): void {
	const top = topWindow();
	let topDocDetail = 'unreachable';
	try {
		topDocDetail = top?.document ? `rootId=${top.document.getElementById('root') ? 'found' : 'missing'}, containerFound=${Boolean(top.document.querySelector(CONTAINER_SELECTOR))}` : 'no document';
	} catch (error) {
		topDocDetail = `threw: ${String(error)}`;
	}
	logInfo(
		`execution context diagnostic: isIframe=${window.top !== window}, ` +
			`topReachable=${top !== null}, topDoc=[${topDocDetail}], ` +
			`ownRootId=${document.getElementById('root') ? 'found' : 'missing'}, ` +
			`hasMainWindowBrowserManagerOnOwnWindow=${Boolean(window.MainWindowBrowserManager)}, ` +
			`hasMainWindowBrowserManagerOnTop=${Boolean(top?.MainWindowBrowserManager)}`,
	);
}

function appIdFromLocation(): number | null {
	const pathname = topWindow()?.MainWindowBrowserManager?.m_lastLocation?.pathname;
	if (!pathname) {
		return null;
	}
	const match = pathname.match(APP_ID_PATTERN);
	return match ? Number(match[1]) : null;
}

/** Steam always serves a game's official header art from a URL embedding
 * its appid (.../store_item_assets/steam/apps/{appid}/.../header.jpg) --
 * unlike the CDN paths used for recommendation-rail/community thumbnails
 * elsewhere on the page, so this specific pattern is a reasonably safe
 * document-wide search rather than needing to scope to a container
 * ancestor Steam's DOM structure doesn't give us a reliable handle on. */
function appIdFromHeaderImage(doc: Document): number | null {
	for (const img of Array.from(doc.querySelectorAll('img'))) {
		const src = img.currentSrc || img.src;
		const match = src.match(HEADER_IMAGE_APP_ID_PATTERN);
		if (match) {
			return Number(match[1]);
		}
	}
	return null;
}

function unmount(): void {
	mountedRoot?.unmount();
	mountedRoot = null;
	mountedContainer?.remove();
	mountedContainer = null;
	currentAppId = null;
}

function handleMutation(): void {
	const topDoc = topWindow()?.document;
	if (!topDoc) {
		return;
	}

	const container = topDoc.querySelector<HTMLElement>(CONTAINER_SELECTOR);
	if (!container) {
		if (currentAppId !== null) {
			unmount();
		}
		loggedMissingAppId = false;
		return;
	}

	const appid = appIdFromLocation() ?? appIdFromHeaderImage(topDoc);
	if (appid === null) {
		if (!loggedMissingAppId) {
			loggedMissingAppId = true;
			logInfo('game-detail container found but could not resolve an appid from location or header image');
		}
		return;
	}

	if (appid === currentAppId && mountedContainer?.isConnected) {
		return;
	}

	unmount();
	currentAppId = appid;
	loggedMissingAppId = false;
	logInfo(`mounting game badge for appid=${appid}`);

	try {
		const root = topDoc.createElement('div');
		root.id = ROOT_ELEMENT_ID;
		container.style.position = 'relative';
		container.appendChild(root);
		mountedContainer = root;
		mountedRoot = createRoot(root);
		mountedRoot.render(<GameTagBadge appid={appid} />);
	} catch (error) {
		logError(`failed to mount game badge for appid=${appid}`, error);
	}
}

let installed = false;

/** Watches the real top-level Steam window's DOM for the desktop
 * game-detail page and mounts GameTagBadge directly into it. Idempotent
 * -- calling this more than once (e.g. a plugin reload) is a no-op after
 * the first. Gamepad/Big Picture mode isn't handled yet -- this silently
 * no-ops in that mode rather than throwing, same as it does on any other
 * non-game-detail page. */
export function patchLibraryApp(): void {
	if (installed) {
		return;
	}
	installed = true;

	diagnoseExecutionContext();

	try {
		const topDoc = topWindow()?.document;
		if (!topDoc) {
			logError('cannot install game-detail page observer: top window/document unreachable', new Error('no top document'));
			return;
		}
		observer = new MutationObserver(handleMutation);
		observer.observe(topDoc.body, { childList: true, subtree: true });
		logInfo('game-detail page observer installed against top document');
		handleMutation();
	} catch (error) {
		logError('failed to install game-detail page observer', error);
	}
}
