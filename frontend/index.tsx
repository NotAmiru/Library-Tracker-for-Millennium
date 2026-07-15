import { definePlugin, staticClasses } from 'millennium';
import { FaTrophy } from 'react-icons/fa';

import { Settings } from './components/Settings';

export default definePlugin(() => {
	return {
		title: <div className={staticClasses.Title}>Library Tracker</div>,
		content: <Settings />,
		icon: <FaTrophy />,
		onDismount() {},
	};
});
