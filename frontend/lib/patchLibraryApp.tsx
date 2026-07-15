import { ErrorBoundary, routerHook } from 'millennium';
import type { ReactNode } from 'react';
import type { RouteComponentProps, RouteProps } from 'react-router';
import { GameTagBadge } from '../components/GameTagBadge';
import { logError } from './log';

const LIBRARY_APP_ROUTE = '/library/app/:appid';

function extractAppId(props: RouteComponentProps<{ appid?: string }>): number | null {
	const raw = props.match?.params?.appid;
	if (!raw) {
		return null;
	}
	const appid = Number(raw);
	return Number.isFinite(appid) ? appid : null;
}

/** Wraps a route's existing render output with our badge appended
 * alongside it, rather than trying to splice into Steam's own React tree
 * -- Millennium's RoutePatch contract hands us the route's props directly
 * (unlike Decky's renderFunc-interception pattern), so a plain Fragment
 * wrap is sufficient and far less fragile than tree-walking. */
function withBadge(render: (props: RouteComponentProps<{ appid?: string }>) => ReactNode) {
	return (props: RouteComponentProps<{ appid?: string }>): ReactNode => {
		let original: ReactNode;
		try {
			original = render(props);
		} catch (error) {
			// The route we patched is misbehaving for reasons that have
			// nothing to do with us -- surface it rather than silently
			// swallowing the whole page, but don't let it stop us from at
			// least trying to render our own badge below.
			logError('original library-app route render threw', error);
			original = null;
		}

		const appid = extractAppId(props);
		if (appid === null) {
			return original;
		}

		return (
			<>
				{original}
				{/* ErrorBoundary keeps a badge-rendering failure (e.g. an
				    unexpected RPC response shape) from taking down the
				    whole game-detail page along with it. */}
				<ErrorBoundary>
					<GameTagBadge appid={appid} />
				</ErrorBoundary>
			</>
		);
	};
}

let installed = false;

/** Registers the game-detail page badge injection. Idempotent -- calling
 * this more than once (e.g. a plugin reload) is a no-op after the first.
 * Failing to register the patch at all (e.g. routerHook's internals
 * changed on a Steam update) is logged, not thrown -- the rest of the
 * plugin (QAM dashboard, settings) should keep working either way. */
export function patchLibraryApp(): void {
	if (installed) {
		return;
	}
	installed = true;

	try {
		routerHook.addPatch(LIBRARY_APP_ROUTE, (route: RouteProps) => {
			try {
				if (typeof route.render === 'function') {
					route.render = withBadge(route.render as (props: RouteComponentProps<{ appid?: string }>) => ReactNode);
				} else if (route.component) {
					const Component = route.component;
					route.render = withBadge((props) => <Component {...props} />);
					delete route.component;
				}
			} catch (error) {
				logError('failed to patch library-app route props', error);
			}
			return route;
		});
	} catch (error) {
		logError('failed to register library-app route patch', error);
	}
}
