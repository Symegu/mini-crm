import type { Profile, Task, TaskStatus } from '../../types';

/** Матрица доступных действий в интерфейсе — повторяет статусы и роли из SQL. */
export function getAvailableActions(task: Task, profile: Profile): TaskStatus[] {
	if (profile.role === 'requester' && task.status === 'review') {
		return ['accepted', 'rework'];
	}

	if (profile.role === 'executor' && task.assignee_id === profile.id) {
		if (task.status === 'new' || task.status === 'rework') {
			return ['in_progress'];
		}

		if (task.status === 'in_progress') {
			return ['review'];
		}
	}

	return [];
}
