import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { ErrorBoundary, Router, routerHook } from '@steambrew/client';
import type { ReactNode } from 'react';
import type { RouteComponentProps, RouteProps } from 'react-router';
import { GameTagBadge } from '../components/GameTagBadge';
import { logError, logInfo } from './log';
import { resolveRealWindow } from './steamWindow';

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
// Fixed the ordering (look for the container first, resolve an appid
// only once one's found), but the very next real-device test still came
// back with the container never found at all -- despite the *same*
// hashed class (._1EAxK56o5a9Nieu5HYkJ4k) having been verified moments
// earlier via the user's own DevTools element picker. The most likely
// explanation: that class name is webpack-build-hashed, and picking it
// up again required restarting Steam to load the new plugin build --
// which is exactly the kind of event that can regenerate those hashes.
// A hashed class was never going to be a stable anchor across sessions.
//
// The icon row's actual buttons carry real aria-label text ("Manage",
// "Configure Controller", ...) for accessibility, which is far more
// likely to stay stable across Steam updates than a build hash --
// findContainer() now tries that first and only falls back to the
// hashed class as a secondary attempt.
const APP_ID_PATTERN = /\/app\/(\d+)/;
const HEADER_IMAGE_APP_ID_PATTERN = /store_item_assets\/steam\/apps\/(\d+)\//;

// Fallback only -- see findContainer(). Verified once via the user's own
// DevTools element picker on a real game page, but a webpack-hashed class
// name like this can drift across Steam Client updates/restarts.
const CONTAINER_SELECTOR_FALLBACK = '._1EAxK56o5a9Nieu5HYkJ4k';
const MANAGE_BUTTON_SELECTOR = '[aria-label="Manage"]';
const CONTROLLER_BUTTON_SELECTOR = '[aria-label="Configure Controller"]';
const ROOT_ELEMENT_ID = 'library-tracker-game-badge';

let loggedManageCandidates = false;

/** One-shot, called the first time findContainer() runs against a
 * document with at least one [aria-label="Manage"] match -- dumps every
 * candidate's own rect and where (if anywhere) findRowAncestor() thinks
 * its row is, so any *further* wrong guess here is diagnosable in one
 * shot from the Logs panel instead of another screenshot-and-guess
 * round. */
function logManageButtonCandidates(buttons: HTMLElement[]): void {
	if (loggedManageCandidates || buttons.length === 0) {
		return;
	}
	loggedManageCandidates = true;
	const details = buttons.map((el, index) => {
		const rect = el.getBoundingClientRect();
		const row = findRowAncestor(el);
		const rowDetail = row ? `rowRect=[x=${row.getBoundingClientRect().x},y=${row.getBoundingClientRect().y}],rowChildCount=${row.children.length}` : 'no-row-found';
		return `[${index}] rect=[x=${rect.x},y=${rect.y},w=${rect.width},h=${rect.height}] offsetParent=${el.offsetParent !== null} ${rowDetail}`;
	});
	logInfo(`Manage button candidates: count=${buttons.length}, ${details.join('; ')}`);
}

const ROW_ANCESTOR_SEARCH_DEPTH = 5;

/** Walks up from a Manage button looking for the ancestor that's
 * actually the shared icon row (i.e. also contains a "Configure
 * Controller" descendant), rather than assuming the row is the
 * *immediate* parent. The candidate diagnostic log showed
 * parentChildCount=1 for both Manage buttons on a real page -- Steam
 * wraps each icon in its own single-child focus/tooltip wrapper first,
 * so the immediate parent is never the row; the row is a few levels
 * further up. */
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

/** The icon row Steam renders on the game-detail page (gear / controller
 * / info / heart). Anchors off the "Manage" (gear icon) button's stable
 * aria-label, falling back to the last-known hashed class if that ever
 * stops matching (e.g. a non-English Steam client, where aria-label text
 * is localized).
 *
 * There can be more than one [aria-label="Manage"] element in the DOM at
 * once -- confirmed via the user's own DevTools aria-label dump. Prior
 * fixes here failed for two different reasons: blindly taking the first
 * DOM match landed on a hidden/off-screen duplicate; requiring a
 * same-parent "Configure Controller" sibling filtered out *both* real
 * candidates, because it turns out neither Manage button's immediate
 * parent contains the other icons at all -- Steam wraps each icon in its
 * own single-child wrapper first (parentChildCount=1 for both, per the
 * candidate diagnostic log), so the real shared row is a few DOM levels
 * further up. findRowAncestor() walks up looking for that row instead of
 * assuming it's one specific fixed depth, and among whichever Manage
 * buttons actually resolve to a row this way, prefers the one furthest
 * down the page (the real hero-banner icon row sits below any
 * top-of-window chrome a duplicate might belong to). */
function findContainer(doc: Document): HTMLElement | null {
	const manageButtons = Array.from(doc.querySelectorAll<HTMLElement>(MANAGE_BUTTON_SELECTOR));
	logManageButtonCandidates(manageButtons);

	const rows = manageButtons
		.map((button) => findRowAncestor(button))
		.filter((row): row is HTMLElement => row !== null)
		.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);

	if (rows[0]) {
		return rows[0];
	}
	return doc.querySelector<HTMLElement>(CONTAINER_SELECTOR_FALLBACK);
}

let observer: MutationObserver | null = null;
let mountedRoot: Root | null = null;
let mountedContainer: HTMLElement | null = null;
let currentAppId: number | null = null;
let loggedMissingAppId = false;

function diagnoseSteamWindows(): void {
	try {
		const entries = Router.WindowStore?.SteamUIWindows ?? [];
		const details = entries.map((entry, index) => {
			const win = entry?.BrowserWindow;
			let ariaCount: string;
			try {
				ariaCount = String(win?.document?.querySelectorAll('[aria-label]').length ?? 'no-document');
			} catch (error) {
				ariaCount = `threw: ${String(error)}`;
			}
			return `[${index}] name=${win?.name ?? 'unknown'} ariaLabelCount=${ariaCount}`;
		});
		logInfo(`Steam windows diagnostic: hasWindowStore=${Boolean(Router.WindowStore)}, count=${entries.length}, ${details.join('; ')}`);
	} catch (error) {
		logError('Steam windows diagnostic failed', error);
	}
}

function diagnoseExecutionContext(): void {
	const top = resolveRealWindow();
	let topDocDetail = 'unreachable';
	try {
		topDocDetail = top?.document
			? `rootId=${top.document.getElementById('root') ? 'found' : 'missing'}, manageButtonFound=${Boolean(top.document.querySelector(MANAGE_BUTTON_SELECTOR))}, fallbackClassFound=${Boolean(top.document.querySelector(CONTAINER_SELECTOR_FALLBACK))}, ariaLabelCount=${top.document.querySelectorAll('[aria-label]').length}`
			: 'no document';
	} catch (error) {
		topDocDetail = `threw: ${String(error)}`;
	}
	logInfo(
		`execution context diagnostic: isIframe=${window.top !== window}, ` +
			`resolvedRealWindow=${top !== null}, resolvedDoc=[${topDocDetail}], ` +
			`ownRootId=${document.getElementById('root') ? 'found' : 'missing'}, ` +
			`ownAriaLabelCount=${document.querySelectorAll('[aria-label]').length}, ` +
			`hasMainWindowBrowserManagerOnOwnWindow=${Boolean(window.MainWindowBrowserManager)}, ` +
			`hasMainWindowBrowserManagerOnResolved=${Boolean(top?.MainWindowBrowserManager)}`,
	);
}

/** @steambrew/client's routerHook doesn't rely on plain DOM queries at
 * all -- its constructor reflects into Steam's own webpack module
 * registry (findModuleByExport) and React fiber tree (getReactRoot) to
 * find real page internals, which is a fundamentally different mechanism
 * from document.querySelector. Since our own document has been shown to
 * be isolated from the real page (see diagnoseExecutionContext -- zero
 * aria-label elements where the real page has 15), this checks whether
 * that reflection-based approach reached across regardless, before
 * concluding routerHook is a dead end too. Reads routerHook's private
 * fields via bracket access -- TypeScript's `private` is compile-time
 * only, so this is legal at runtime and the only way to see in without
 * modifying the vendored library. */
function diagnoseRouterHook(): void {
	try {
		const rh = routerHook as unknown as Record<string, unknown>;
		const patchedModes = rh.patchedModes instanceof Set ? Array.from(rh.patchedModes as Set<number>) : String(rh.patchedModes);
		const routes = rh.routes;
		logInfo(
			`routerHook diagnostic: hasRouteComponent=${Boolean(rh.Route)}, hasDesktopRouteComponent=${Boolean(rh.DesktopRoute)}, ` +
				`patchedModes=${JSON.stringify(patchedModes)}, routesLength=${Array.isArray(routes) ? routes.length : String(routes)}`,
		);
	} catch (error) {
		logError('routerHook diagnostic failed', error);
	}
}

/** routerHook's constructor found real Route components (see
 * diagnoseRouterHook's log), so its reflection-based discovery does
 * reach across into the real page despite our own document being
 * isolated -- the missing piece is knowing the *exact* path string Steam
 * registers for the game-detail route, which routerHook.addPatch matches
 * by strict equality against route.props.path. Rather than keep
 * guessing, this monkey-patches the (Logger-inherited) debug() method
 * routerHook already calls with the real route list on every render
 * (`this.debug('Route list: ', routeList)` inside processList) and pulls
 * every route's real .props.path out of it -- legal at runtime since
 * TypeScript's `private`/inherited-method typing is compile-time only. */
function sniffRoutePaths(): void {
	try {
		const rh = routerHook as unknown as { debug: (...args: unknown[]) => void };
		if (typeof rh.debug !== 'function') {
			logError('routerHook route-path sniffer: debug() not found on routerHook', new Error('no debug method'));
			return;
		}
		const originalDebug = rh.debug.bind(rh);
		const seen = new Set<string>();
		rh.debug = (...args: unknown[]) => {
			originalDebug(...args);
			if (args[0] !== 'Route list: ' || !Array.isArray(args[1])) {
				return;
			}
			const paths = (args[1] as Array<{ props?: { path?: string } }>)
				.map((entry) => entry?.props?.path)
				.filter((path): path is string => Boolean(path));
			const key = paths.join(',');
			if (paths.length > 0 && !seen.has(key)) {
				seen.add(key);
				logInfo(`routerHook route list paths: ${JSON.stringify(paths)}`);
			}
		};
	} catch (error) {
		logError('failed to install routerHook route-path sniffer', error);
	}
}

const LIBRARY_APP_ROUTE = '/library/app/:appid';

function extractAppIdFromRouteProps(props: RouteComponentProps<{ appid?: string }>): number | null {
	const raw = props.match?.params?.appid;
	if (!raw) {
		return null;
	}
	const appid = Number(raw);
	return Number.isFinite(appid) ? appid : null;
}

/** Wraps a matched route's own render output with our badge appended
 * alongside it. Rendered through routerHook, this executes as part of
 * the real page's own React tree (unlike everything else in this file),
 * so it's the one code path that can actually reach the visible page --
 * fixed-positioned since it isn't a DOM sibling of Steam's icon row the
 * way the (currently unreachable) DOM-injection code below assumes. */
function withRouterHookBadge(render: (props: RouteComponentProps<{ appid?: string }>) => ReactNode) {
	return (props: RouteComponentProps<{ appid?: string }>): ReactNode => {
		let original: ReactNode;
		try {
			original = render(props);
		} catch (error) {
			logError('routerHook-patched library-app route render threw', error);
			original = null;
		}

		const appid = extractAppIdFromRouteProps(props);
		if (appid === null) {
			return original;
		}

		return (
			<>
				{original}
				<div style={{ position: 'fixed', top: '80px', right: '24px', zIndex: 1000 }}>
					<ErrorBoundary>
						<GameTagBadge appid={appid} />
					</ErrorBoundary>
				</div>
			</>
		);
	};
}

function installRouterHookPatch(): void {
	try {
		routerHook.addPatch(LIBRARY_APP_ROUTE, (route: RouteProps) => {
			logInfo(`routerHook patch callback fired for registered path=${LIBRARY_APP_ROUTE}, route.path=${String(route.path)}`);
			try {
				if (typeof route.render === 'function') {
					route.render = withRouterHookBadge(route.render as (props: RouteComponentProps<{ appid?: string }>) => ReactNode);
				} else if (route.component) {
					const Component = route.component;
					route.render = withRouterHookBadge((props) => <Component {...props} />);
					delete route.component;
				} else {
					logInfo('routerHook patch fired but route has neither render nor component');
				}
			} catch (error) {
				logError('failed to patch library-app route props via routerHook', error);
			}
			return route;
		});
		logInfo(`routerHook.addPatch registered for ${LIBRARY_APP_ROUTE}`);
	} catch (error) {
		logError('routerHook.addPatch registration failed', error);
	}
}

function appIdFromLocation(): number | null {
	const pathname = resolveRealWindow()?.MainWindowBrowserManager?.m_lastLocation?.pathname;
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
	const topDoc = resolveRealWindow()?.document;
	if (!topDoc) {
		return;
	}

	const container = findContainer(topDoc);
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
	const containerRect = container.getBoundingClientRect();
	logInfo(`mounting game badge for appid=${appid}, containerRect=[x=${containerRect.x}, y=${containerRect.y}, w=${containerRect.width}, h=${containerRect.height}]`);

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
let observedDocument: Document | null = null;

/** The very first diagnostic run confirmed the whole premise here is
 * timing-sensitive: Router.WindowStore.SteamUIWindows had exactly one
 * entry named "SP DesktopLoginWindow_uid0" (the login window, with zero
 * aria-label elements) -- because this plugin's frontend loads early in
 * Steam's startup sequence, before the real desktop library window has
 * necessarily registered itself. A MutationObserver attached once, at
 * that moment, to whatever document resolveRealWindow() happened to
 * return would keep watching that wrong (or eventually detached) body
 * forever, even though calling resolveRealWindow() again *later* would
 * find the real window once it exists.
 *
 * Re-resolves and re-attaches (tearing down the old observer) whenever
 * the resolved document changes, and also directly re-runs
 * handleMutation() on the same interval as a safety net -- Millennium
 * doesn't expose a "the real window is now ready" event to wait for
 * instead, so polling is the pragmatic option here. */
function ensureObserverAttached(): void {
	const doc = resolveRealWindow()?.document;
	if (!doc || doc === observedDocument) {
		return;
	}

	observer?.disconnect();
	observedDocument = doc;
	try {
		observer = new MutationObserver(handleMutation);
		observer.observe(doc.body, { childList: true, subtree: true });
		logInfo(`game-detail page observer (re)attached, resolved doc ariaLabelCount=${doc.querySelectorAll('[aria-label]').length}`);
	} catch (error) {
		logError('failed to (re)attach game-detail page observer', error);
	}
}

const POLL_INTERVAL_MS = 2000;

/** Watches the real Steam desktop window's DOM for the game-detail page
 * and mounts GameTagBadge directly into it. Idempotent -- calling this
 * more than once (e.g. a plugin reload) is a no-op after the first.
 * Gamepad/Big Picture mode isn't handled yet -- this silently no-ops in
 * that mode rather than throwing, same as it does on any other
 * non-game-detail page. */
export function patchLibraryApp(): void {
	if (installed) {
		return;
	}
	installed = true;

	diagnoseSteamWindows();
	diagnoseExecutionContext();
	diagnoseRouterHook();
	sniffRoutePaths();
	installRouterHookPatch();

	ensureObserverAttached();
	handleMutation();
	setInterval(() => {
		ensureObserverAttached();
		handleMutation();
	}, POLL_INTERVAL_MS);
}
