import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { GameTagBadge } from '../components/GameTagBadge';
import { logError, logInfo } from './log';

// routerHook.addPatch('/library/app/:appid', ...) (the original approach
// here) never fired on a real desktop Millennium install, and a follow-up
// MutationObserver + document.querySelector approach *also* never fired --
// live-device DevTools investigation with the user found why: a v1
// "loose files" plugin's frontend script runs inside its own dedicated
// iframe (visible in DevTools' frame dropdown as
// "millennium-<plugin-name>"), whose `document` is just a near-empty
// `#root` overlay shell, completely separate from the real page the user
// is looking at (confirmed directly: document.querySelector for a
// manually-verified real element returned null from inside that frame,
// but found it instantly from "top"). Every DOM query in this file was
// therefore querying the wrong document all along.
//
// Since steamloopback.host is the same origin for every one of Steam's
// internal frames, `window.top` should be reachable directly rather than
// needing a purpose-built bridge -- this targets `window.top`'s document
// instead of our own iframe's. diagnoseExecutionContext() logs exactly
// what's reachable so this can be re-diagnosed from the Logs panel alone
// if that assumption turns out to be wrong too.
const APP_ID_PATTERN = /\/app\/(\d+)/;

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
let loggedMissingContainerFor: number | null = null;

/** The real top-level Steam window, if reachable from this plugin's
 * iframe -- same-origin access can still throw (e.g. a future Millennium
 * version that sandboxes plugin frames cross-origin), so every caller
 * treats a thrown/undefined result as "not reachable" rather than
 * crashing the whole plugin. */
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

function currentAppIdFromLocation(): number | null {
	const pathname = topWindow()?.MainWindowBrowserManager?.m_lastLocation?.pathname;
	if (!pathname) {
		return null;
	}
	const match = pathname.match(APP_ID_PATTERN);
	return match ? Number(match[1]) : null;
}

function unmount(): void {
	mountedRoot?.unmount();
	mountedRoot = null;
	mountedContainer?.remove();
	mountedContainer = null;
	currentAppId = null;
}

function handleMutation(): void {
	const appid = currentAppIdFromLocation();

	if (appid === null) {
		if (currentAppId !== null) {
			unmount();
		}
		return;
	}

	if (appid === currentAppId && mountedContainer?.isConnected) {
		return;
	}

	const topDoc = topWindow()?.document;
	if (!topDoc) {
		return;
	}

	const container = topDoc.querySelector<HTMLElement>(CONTAINER_SELECTOR);
	if (!container) {
		if (loggedMissingContainerFor !== appid) {
			loggedMissingContainerFor = appid;
			logInfo(`game page detected (appid=${appid}) but container selector "${CONTAINER_SELECTOR}" found nothing`);
		}
		return;
	}

	unmount();
	currentAppId = appid;
	loggedMissingContainerFor = null;
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

/** Watches the real top-level Steam window's DOM (not this plugin's own
 * iframe -- see the block comment above) for the desktop game-detail
 * page and mounts GameTagBadge directly into it. Idempotent -- calling
 * this more than once (e.g. a plugin reload) is a no-op after the first.
 * Gamepad/Big Picture mode isn't handled yet -- this silently no-ops in
 * that mode rather than throwing, same as it does on any other
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
