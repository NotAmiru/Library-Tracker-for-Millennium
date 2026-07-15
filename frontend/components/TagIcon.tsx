import type { JSX } from 'react';
import { FaCheckCircle, FaClock, FaTimesCircle, FaTrophy } from 'react-icons/fa';
import type { TagName } from '../types';

export const TAG_COLORS: Record<TagName, string> = {
	mastered: '#f5576c',
	completed: '#38ef7d',
	in_progress: '#764ba2',
	dropped: '#c9a171',
};

export const TAG_LABELS: Record<TagName, string> = {
	mastered: 'Mastered',
	completed: 'Completed',
	in_progress: 'In Progress',
	dropped: 'Dropped',
};

export function TagIcon({ tag }: { tag: TagName }): JSX.Element {
	switch (tag) {
		case 'mastered':
			return <FaTrophy color={TAG_COLORS.mastered} />;
		case 'completed':
			return <FaCheckCircle color={TAG_COLORS.completed} />;
		case 'in_progress':
			return <FaClock color={TAG_COLORS.in_progress} />;
		case 'dropped':
			return <FaTimesCircle color={TAG_COLORS.dropped} />;
	}
}
