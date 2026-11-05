import { getSupabaseClient } from '../../lib/supabase';

export interface ProjectInput {
	name: string;
	address: string;
}

export async function saveProjectRecord(
	input: ProjectInput,
	projectId?: string | null,
): Promise<void> {
	const client = getSupabaseClient();

	const result = projectId
		? await client.from('projects').update(input).eq('id', projectId)
		: await client.from('projects').insert(input);

	if (result.error) throw result.error;
}

export async function archiveProjectRecord(projectId: string): Promise<void> {
	const { error } = await getSupabaseClient()
		.from('projects')
		.update({
			archived_at: new Date().toISOString(),
		})
		.eq('id', projectId);

	if (error) throw error;
}
