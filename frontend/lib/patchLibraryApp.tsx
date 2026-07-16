import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { GameTagBadge } from '../components/GameTagBadge';
import { logError, logInfo } from './log';

// routerHook.addPatch('/library/app/:appid', ...) (the original approach
// here) never fires on a real desktop Millennium install: it only invokes
// its callback for routes whose `props.path` exactly matches a string
// Steam's own React tree registered, and empirically -- confirmed via a
// live device test with diagnostic logging on every render -- desktop
// mode's library route list never contains that literal path. Rather than
// guess at the real one, this instead mirrors the *proven*, real-device
// desktop-mode approach used by jcdoll/hltb-millennium-plugin's
// frontend/injection/{detector,observer}.ts: read Steam's own internal
// navigation state directly (bypassing React Router entirely) and use a
// MutationObserver to notice when the game-detail page's DOM has
// (re)settled, rather than trying to hook into React's render cycle.
const APP_ID_PATTERN = /\/app\/(\d+)/;

// The container Steam renders the game-detail page's icon row (gear /
// controller / info / heart) into. Lifted from the same reference plugin,
// which anchors its own badge here. This is a webpack-hashed class name --
// it can drift across Steam Client updates, which is the most likely
// failure mode if this ever stops working again; the diagnostic logging
// below is there specifically to distinguish "appid never detected" from
// "appid detected but this selector found nothing" so that's fast to
// re-diagnose without needing DevTools access.
const CONTAINER_SELECTOR = '.NZMJ6g2iVnFsOOp-lDmIP';
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

function currentAppIdFromLocation(): number | null {
	const pathname = window.MainWindowBrowserManager?.m_lastLocation?.pathname;
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

	const container = document.querySelector<HTMLElement>(CONTAINER_SELECTOR);
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
		const root = document.createElement('div');
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

/** Watches the DOM for Steam's desktop game-detail page and mounts
 * GameTagBadge directly into it. Idempotent -- calling this more than
 * once (e.g. a plugin reload) is a no-op after the first. Gamepad/Big
 * Picture mode isn't handled yet (MainWindowBrowserManager's pathname
 * doesn't track navigation there) -- this silently no-ops in that mode
 * rather than throwing, same as it does on any other non-game-detail
 * page. */
export function patchLibraryApp(): void {
	if (installed) {
		return;
	}
	installed = true;

	try {
		observer = new MutationObserver(handleMutation);
		observer.observe(document.body, { childList: true, subtree: true });
		logInfo('game-detail page observer installed');
		handleMutation();
	} catch (error) {
		logError('failed to install game-detail page observer', error);
	}
}
