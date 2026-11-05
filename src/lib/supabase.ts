import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type AppSupabaseClient = SupabaseClient<Database>;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase: AppSupabaseClient | null = isSupabaseConfigured
	? createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true,
			},
		})
	: null;

export function getSupabaseClient(): AppSupabaseClient {
	if (!supabase) {
		throw new Error(
			'Supabase не настроен. Проверьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.',
		);
	}

	return supabase;
}
