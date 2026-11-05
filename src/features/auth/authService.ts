import type { SessionUser } from './authTypes';
import { getSupabaseClient } from '../../lib/supabase';

export async function getSessionUser(): Promise<SessionUser | null> {
	const { data, error } = await getSupabaseClient().auth.getSession();

	if (error) throw error;

	return data.session?.user ? { id: data.session.user.id } : null;
}

export function subscribeToAuthChanges(onChange: (user: SessionUser | null) => void): () => void {
	const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
		onChange(session?.user ? { id: session.user.id } : null);
	});

	return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
	const { error } = await getSupabaseClient().auth.signInWithPassword({
		email,
		password,
	});

	if (error) throw error;
}

export async function signOut(): Promise<void> {
	const { error } = await getSupabaseClient().auth.signOut();

	if (error) throw error;
}
