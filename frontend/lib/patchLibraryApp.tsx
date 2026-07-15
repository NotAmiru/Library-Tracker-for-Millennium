import { routerHook } from 'millennium';
import type { ReactNode } from 'react';
import type { RouteComponentProps, RouteProps } from 'react-router';
import { GameTagBadge } from '../components/GameTagBadge';

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
		const appid = extractAppId(props);
		const original = render(props);
		if (appid === null) {
			return original;
		}
		return (
			<>
				{original}
				<GameTagBadge appid={appid} />
			</>
		);
	};
}

let installed = false;

/** Registers the game-detail page badge injection. Idempotent -- calling
 * this more than once (e.g. a plugin reload) is a no-op after the first. */
export function patchLibraryApp(): void {
	if (installed) {
		return;
	}
	installed = true;

	routerHook.addPatch(LIBRARY_APP_ROUTE, (route: RouteProps) => {
		if (typeof route.render === 'function') {
			route.render = withBadge(route.render as (props: RouteComponentProps<{ appid?: string }>) => ReactNode);
		} else if (route.component) {
			const Component = route.component;
			route.render = withBadge((props) => <Component {...props} />);
			delete route.component;
		}
		return route;
	});
}
