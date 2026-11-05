/** Роли пользователей, назначаемые администратором через Supabase. */
export type Role = 'superadmin' | 'requester' | 'executor';

/** Статусы задачи и допустимые значения enum public.task_status в PostgreSQL. */
export type TaskStatus = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework';

export interface Profile {
	id: string;
	full_name: string;
	role: Role;
}

export interface Project {
	id: string;
	name: string;
	address: string;
	created_at: string;
	archived_at: string | null;
}

export interface Task {
	id: string;
	title: string;
	description: string;
	project_id: string;
	assignee_id: string;
	author_id: string;
	status: TaskStatus;
	created_at: string;
	updated_at: string;
	archived_at: string | null;
	projects?: Pick<Project, 'name'> | null;
	assignee?: Pick<Profile, 'full_name'> | null;
	author?: Pick<Profile, 'full_name'> | null;
}

export interface HistoryItem {
	id: string;
	task_id: string;
	actor_id: string;
	from_status: TaskStatus | null;
	to_status: TaskStatus;
	comment: string | null;
	created_at: string;
	actor?: Pick<Profile, 'full_name'> | null;
}

export type AppView = 'projects' | 'my-tasks' | 'users';
export type ModalType = 'project' | 'task' | null;

export const STATUS_LABELS: Record<TaskStatus, string> = {
	new: 'Новая',
	in_progress: 'В работе',
	review: 'На проверке',
	accepted: 'Принята',
	rework: 'На доработке',
};

export const ROLE_LABELS: Record<Role, string> = {
	superadmin: 'Суперадминистратор',
	requester: 'Постановщик',
	executor: 'Исполнитель',
};
