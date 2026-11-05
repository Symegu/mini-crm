import type { Profile, Project, Task } from '../../types';
import { getSupabaseClient } from '../../lib/supabase';
import { listTasks } from '../tasks/taskService';

export interface CrmData {
	profile: Profile;
	projects: Project[];
	tasks: Task[];
	people: Profile[];
}

export async function loadCrmData(userId: string): Promise<CrmData> {
	const client = getSupabaseClient();

	const profileResult = await client
		.from('profiles')
		.select('id, full_name, role')
		.eq('id', userId)
		.single();

	if (profileResult.error) {
		if (profileResult.error.code === 'PGRST116') {
			throw new Error(
				'Профиль не найден. Первого пользователя должен настроить владелец Supabase.',
			);
		}

		throw profileResult.error;
	}

	const profile: Profile = profileResult.data;

	if (profile.role === 'superadmin') {
		return {
			profile,
			projects: [],
			tasks: [],
			people: [],
		};
	}

	const [projectsResult, tasks, peopleResult] = await Promise.all([
		client
			.from('projects')
			.select('id, name, address, created_at, archived_at')
			.order('created_at', { ascending: false }),

		listTasks(),

		client
			.from('profiles')
			.select('id, full_name, role')
			.order('full_name', { ascending: true }),
	]);

	if (projectsResult.error) throw projectsResult.error;
	if (peopleResult.error) throw peopleResult.error;

	const projects: Project[] = projectsResult.data ?? [];
	const people: Profile[] = peopleResult.data ?? [];

	return {
		profile,
		projects,
		tasks,
		people,
	};
}
