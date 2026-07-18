/** TEMPORARY debug-only addition, not part of the real feature set: mounts
 * an always-visible floating button on every library page (including the
 * main manager/list view, not just a game-detail page) that opens
 * TagManager's dialog directly. Exists purely to isolate whether the
 * "black box" bug is in TagManager's own rendering or in
 * patchLibraryApp.tsx's icon-row mount/navigation-detection logic, without
 * needing to navigate to a specific game page first. Remove once that's
 * confirmed. */
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { useState } from 'react';
import type { JSX } from 'react';
import { TagManager } from '../components/TagManager';

// Arbitrary appid -- doesn't need to be synced/tracked. TagManager renders
// its shell (default "Game" name, "0h 0m", "Not found" HLTB match) even for
// an appid with no stored record, which is enough to confirm the dialog
// itself renders.
const DEBUG_TEST_APPID = 400;
const DEBUG_ROOT_ID = 'library-tracker-debug-test-button';

function DebugTestButton({ windowRef }: { windowRef: Window }): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<>
			<div
				onClick={() => setOpen(true)}
				style={{
					position: 'fixed',
					bottom: '16px',
					right: '16px',
					zIndex: 999999,
					background: '#66c0f4',
					color: '#1b2838',
					padding: '10px 16px',
					borderRadius: '6px',
					fontWeight: 700,
					fontSize: '13px',
					cursor: 'pointer',
					boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
				}}
			>
				TEST TAG MODAL
			</div>
			{open && <TagManager appid={DEBUG_TEST_APPID} windowRef={windowRef} onClose={() => setOpen(false)} />}
		</>
	);
}

let debugRoot: Root | null = null;

/** Idempotent -- safe to call on every popup creation / navigation tick. */
export function mountDebugTestButton(doc: Document, windowRef: Window): void {
	if (debugRoot) {
		return;
	}
	const el = doc.createElement('div');
	el.id = DEBUG_ROOT_ID;
	doc.body.appendChild(el);
	debugRoot = createRoot(el);
	debugRoot.render(<DebugTestButton windowRef={windowRef} />);
}
