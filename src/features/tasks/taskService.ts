import type { HistoryItem, Task, TaskStatus } from '../../types';

import { getSupabaseClient } from '../../lib/supabase';

export interface TaskInput {
	title: string;
	description: string;
	project_id: string;
	assignee_id: string;
}

type Relation<T> = T | T[] | null;

interface TaskQueryRow extends Omit<Task, 'projects' | 'assignee' | 'author'> {
	projects: Relation<Pick<{ name: string }, 'name'>>;
	assignee: Relation<Pick<{ full_name: string }, 'full_name'>>;
	author: Relation<Pick<{ full_name: string }, 'full_name'>>;
}

interface HistoryQueryRow extends Omit<HistoryItem, 'actor'> {
	actor: Relation<Pick<{ full_name: string }, 'full_name'>>;
}

/**
 * Приводит связь PostgREST к единому формату.
 * В интерфейсе используем объект или null, а не массив.
 */
function normalizeOne<T>(relation: T | T[] | null | undefined): T | null {
	if (Array.isArray(relation)) {
		return relation[0] ?? null;
	}

	return relation ?? null;
}

const TASK_SELECT =
	'id, title, description, project_id, assignee_id, author_id, status, created_at, updated_at, archived_at, projects(name), assignee:profiles!tasks_assignee_id_fkey(full_name), author:profiles!tasks_author_id_fkey(full_name)' as const;

/** Загружает задачи, доступные текущему пользователю согласно RLS. */
export async function listTasks(): Promise<Task[]> {
	const { data, error } = await getSupabaseClient()
		.from('tasks')
		.select(TASK_SELECT)
		.order('created_at', { ascending: false })
		.returns<TaskQueryRow[]>();

	if (error) throw error;

	return (data ?? []).map((row) => ({
		...row,
		projects: normalizeOne(row.projects),
		assignee: normalizeOne(row.assignee),
		author: normalizeOne(row.author),
	}));
}

export async function saveTaskRecord(
	input: TaskInput,
	authorId: string,
	taskId?: string | null,
): Promise<void> {
	const client = getSupabaseClient();

	const result = taskId
		? await client.from('tasks').update(input).eq('id', taskId)
		: await client.from('tasks').insert({
				...input,
				author_id: authorId,
				status: 'new',
			});

	if (result.error) throw result.error;
}

export async function archiveTaskRecord(taskId: string): Promise<void> {
	const { error } = await getSupabaseClient()
		.from('tasks')
		.update({
			archived_at: new Date().toISOString(),
		})
		.eq('id', taskId);

	if (error) throw error;
}

export async function transitionTaskStatus(
	taskId: string,
	nextStatus: TaskStatus,
	comment: string | null,
): Promise<void> {
	const { error } = await getSupabaseClient().rpc('transition_task', {
		p_task_id: taskId,
		p_to_status: nextStatus,
		p_comment: comment,
	});

	if (error) throw error;
}

/** История доступна только в пределах RLS-доступа пользователя к задаче. */
export async function loadTaskHistory(taskId: string): Promise<HistoryItem[]> {
	const { data, error } = await getSupabaseClient()
		.from('task_status_history')
		.select(
			'id, task_id, actor_id, from_status, to_status, comment, created_at, actor:profiles!task_status_history_actor_id_fkey(full_name)',
		)
		.eq('task_id', taskId)
		.order('created_at', { ascending: false })
		.returns<HistoryQueryRow[]>();

	if (error) throw error;

	return (data ?? []).map((row) => ({
		...row,
		actor: normalizeOne(row.actor),
	}));
}
