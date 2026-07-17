import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Millennium } from '@steambrew/client';
import { GameTagBadge } from '../components/GameTagBadge';
import { logError, logInfo } from './log';

// Every earlier approach in this file's history failed for the same
// underlying reason: this plugin's script runs in its own isolated CDP
// world (confirmed via Millennium's own loader log: "Created isolated
// CDP world for plugin 'library-tracker'"), sharing nothing with the
// real page except, unreliably, some webpack-reflected module/prototype
// definitions -- not the real DOM, not window-scoped runtime singletons
// like window.appStore or window.MainWindowBrowserManager. routerHook
// (React-tree patching), Router.WindowStore (a heuristic "most content"
// guess at the right window), and manual DOM-injection with
// MutationObserver polling were all worked through and all had real,
// confirmed failure modes tied to that isolation.
//
// The actual fix came from studying a *working* third-party Millennium
// plugin (steam-easygrid, which does successfully render a button in
// this exact icon row -- confirmed via its own screenshot) rather than
// guessing further: it uses Millennium.AddWindowCreateHook to get a
// direct callback reference to Steam's real desktop popup object the
// moment it's created. Critically, code running inside that callback can
// access window-scoped runtime globals like MainWindowBrowserManager
// directly (as bare identifiers) that are permanently unreachable from
// this file's own top-level module code -- Millennium apparently
// bridges that specific callback into the real window's execution
// context, unlike a plugin's ordinary script evaluation. Whatever the
// exact native mechanism, it's proven to work, so this mirrors
// steam-easygrid's pattern as closely as possible rather than
// reinventing it: wait for the "SP Desktop_uid0" popup specifically,
// then MainWindowBrowserManager.m_browser's "finished-request" event for
// real navigation detection, reading popup.m_popup.document for the
// *actual* page DOM (instead of a heuristic "which window has the most
// content" guess).
//
// One thing that DIDN'T carry over cleanly: on a real device,
// "finished-request" fired once (at listener registration) and never
// again while browsing between library pages. It's a CEF network-level
// event, and Steam's library is a single-page app -- in-app navigation
// is a client-side React Router state change, not necessarily a new
// network request. Rather than trust the event alone, a cheap
// m_lastLocation.pathname poll runs alongside it as a safety net (see
// onPopupCreation).
const DESKTOP_WINDOW_NAME = 'SP Desktop_uid0';
const APP_PAGE_PATTERN = /^\/library\/app\/(\d+)/;
const MANAGE_BUTTON_SELECTOR = '[aria-label="Manage"]';
const CONTROLLER_BUTTON_SELECTOR = '[aria-label="Configure Controller"]';
const ROOT_ELEMENT_ID = 'library-tracker-game-badge';
const ROW_ANCESTOR_SEARCH_DEPTH = 5;
const POLL_INTERVAL_MS = 1500;

interface MainWindowBrowserManagerLike {
	m_lastLocation?: { pathname?: string };
	m_browser?: { on: (event: string, callback: (currentUrl: unknown, previousUrl: unknown) => void) => void };
}

declare global {
	// eslint-disable-next-line no-var -- ambient global, matches how Steam's own script actually declares it
	var MainWindowBrowserManager: MainWindowBrowserManagerLike | undefined;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** typeof never throws on an undeclared identifier, unlike accessing it
 * directly -- the safe way to check for a bare global that may not exist
 * yet (or ever, outside the specially-bridged callback context this is
 * only ever called from). */
function getMainWindowBrowserManager(): MainWindowBrowserManagerLike | null {
	return typeof MainWindowBrowserManager !== 'undefined' && MainWindowBrowserManager ? MainWindowBrowserManager : null;
}

async function waitForMainWindowBrowserManager(maxAttempts = 100, delayMs = 100): Promise<MainWindowBrowserManagerLike | null> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const mwbm = getMainWindowBrowserManager();
		if (mwbm?.m_browser) {
			return mwbm;
		}
		await sleep(delayMs);
	}
	return null;
}

/** Walks up from a "Manage" (gear icon) button looking for the ancestor
 * that's actually the shared icon row (i.e. also contains a "Configure
 * Controller" descendant) -- Steam wraps each icon in its own
 * single-child focus/tooltip wrapper first, so the row is a few DOM
 * levels above the button's immediate parent, not the parent itself
 * (confirmed via a real-device candidate dump during earlier debugging).
 * There can be more than one [aria-label="Manage"] element in the DOM at
 * once (also confirmed via a real-device aria-label dump), so this is
 * applied to every match and the one furthest down the page is
 * preferred -- the real hero-banner icon row sits below any
 * top-of-window chrome a duplicate might belong to. */
function findRowAncestor(button: HTMLElement): HTMLElement | null {
	let node: HTMLElement | null = button.parentElement;
	for (let depth = 0; node && depth < ROW_ANCESTOR_SEARCH_DEPTH; depth++) {
		if (node.querySelector(CONTROLLER_BUTTON_SELECTOR)) {
			return node;
		}
		node = node.parentElement;
	}
	return null;
}

function findContainer(doc: Document): HTMLElement | null {
	const manageButtons = Array.from(doc.querySelectorAll<HTMLElement>(MANAGE_BUTTON_SELECTOR));
	const rows = manageButtons
		.map((button) => findRowAncestor(button))
		.filter((row): row is HTMLElement => row !== null)
		.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
	return rows[0] ?? null;
}

let mountedRoot: Root | null = null;
let mountedContainer: HTMLElement | null = null;
let currentAppId: number | null = null;

function unmount(): void {
	mountedRoot?.unmount();
	mountedRoot = null;
	mountedContainer?.remove();
	mountedContainer = null;
	currentAppId = null;
}

async function mountForAppId(doc: Document, appid: number): Promise<void> {
	if (appid === currentAppId && mountedContainer?.isConnected) {
		return;
	}

	// The icon row might not exist in the DOM the instant navigation
	// completes -- Millennium.findElement (a purpose-built API for
	// exactly this, used the same way by steam-easygrid) polls for it
	// instead of guessing a fixed delay.
	try {
		await Millennium.findElement(doc, MANAGE_BUTTON_SELECTOR, 8000);
	} catch (error) {
		logError(`Millennium.findElement(${MANAGE_BUTTON_SELECTOR}) failed for appid=${appid}`, error);
	}

	const container = findContainer(doc);
	if (!container) {
		logInfo(`game page for appid=${appid} detected but icon row container never appeared`);
		return;
	}

	unmount();
	currentAppId = appid;
	logInfo(`mounting game badge for appid=${appid}`);

	try {
		const root = doc.createElement('div');
		root.id = ROOT_ELEMENT_ID;
		container.appendChild(root);
		mountedContainer = root;
		mountedRoot = createRoot(root);
		mountedRoot.render(<GameTagBadge appid={appid} />);
	} catch (error) {
		logError(`failed to mount game badge for appid=${appid}`, error);
	}
}

let loggedPathname: string | undefined;

async function handleNavigation(doc: Document, pathname: string | undefined): Promise<void> {
	if (pathname !== loggedPathname) {
		loggedPathname = pathname;
		logInfo(`navigation check: pathname=${String(pathname)}`);
	}

	const match = pathname?.match(APP_PAGE_PATTERN);
	if (!match) {
		if (currentAppId !== null) {
			unmount();
		}
		return;
	}
	await mountForAppId(doc, Number(match[1]));
}

interface DesktopPopup {
	m_strName?: string;
	m_popup?: { document?: Document };
}

let installed = false;

async function onPopupCreation(popup: DesktopPopup): Promise<void> {
	if (popup?.m_strName !== DESKTOP_WINDOW_NAME || installed) {
		return;
	}
	installed = true;

	logInfo(`desktop popup window created (${DESKTOP_WINDOW_NAME}), waiting for MainWindowBrowserManager`);

	const mwbm = await waitForMainWindowBrowserManager();
	if (!mwbm?.m_browser) {
		logError('MainWindowBrowserManager never became available on the desktop popup', new Error('timed out waiting for MainWindowBrowserManager'));
		return;
	}

	const doc = popup.m_popup?.document;
	if (!doc) {
		logError('desktop popup has no m_popup.document', new Error('no document on popup.m_popup'));
		return;
	}

	logInfo('MainWindowBrowserManager ready, registering finished-request listener');
	mwbm.m_browser.on('finished-request', () => {
		void handleNavigation(doc, mwbm.m_lastLocation?.pathname);
	});

	// "finished-request" fired once on registration but never again while
	// the user browsed between library pages on a real device -- it's a
	// CEF network-level event ("a resource load finished"), and Steam's
	// library is a single-page app where in-app navigation is a client-
	// side React Router state change, not necessarily a new network
	// request. Rather than trust the event alone, this also polls
	// m_lastLocation.pathname directly -- cheap (a plain property read,
	// no DOM/native call) and catches any navigation the event misses.
	// handleNavigation() itself is a no-op when the appid hasn't changed,
	// so polling doesn't cause repeated remounts.
	setInterval(() => {
		void handleNavigation(doc, mwbm.m_lastLocation?.pathname);
	}, POLL_INTERVAL_MS);

	// Covers the plugin loading *after* the user has already navigated to
	// a game page, where no fresh navigation event will fire.
	void handleNavigation(doc, mwbm.m_lastLocation?.pathname);
}

/** Registers a Millennium.AddWindowCreateHook callback that waits for
 * Steam's real desktop window ("SP Desktop_uid0"), then mounts
 * GameTagBadge directly into its game-detail page's icon row whenever
 * real navigation (MainWindowBrowserManager.m_browser's
 * "finished-request" event) lands on one. See the file-level comment for
 * why this specific mechanism, not DOM polling or routerHook, is what
 * actually reaches the real page. Idempotent -- calling this more than
 * once is a no-op after the first successful registration. Gamepad/Big
 * Picture mode isn't handled yet -- "SP Desktop_uid0" is desktop-only,
 * so this silently no-ops there rather than throwing. */
export function patchLibraryApp(): void {
	try {
		Millennium.AddWindowCreateHook?.((context) => {
			void onPopupCreation(context as DesktopPopup);
		});
		logInfo('AddWindowCreateHook registered');
	} catch (error) {
		logError('failed to register AddWindowCreateHook', error);
	}
}
