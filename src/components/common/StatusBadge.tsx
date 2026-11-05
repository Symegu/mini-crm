import { STATUS_LABELS, type TaskStatus } from '../../types';

interface StatusBadgeProps {
	status: TaskStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
	return <span className={`status status-${status}`}>{STATUS_LABELS[status]}</span>;
}
