import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../lib/format';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getSessionUser, subscribeToAuthChanges } from './authService';
import type { SessionUser } from './authTypes';

export function useAuthSession(onError: (message: string) => void) {
	const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
	const [authReady, setAuthReady] = useState(false);

	useEffect(() => {
		if (!isSupabaseConfigured) {
			setAuthReady(true);
			return;
		}

		let isMounted = true;

		const unsubscribe = subscribeToAuthChanges((user) => {
			if (!isMounted) return;

			setSessionUser(user);
			setAuthReady(true);
		});

		void getSessionUser()
			.then((user) => {
				if (!isMounted) return;

				setSessionUser(user);
				setAuthReady(true);
			})
			.catch((error: unknown) => {
				if (!isMounted) return;

				onError(getErrorMessage(error));
				setAuthReady(true);
			});

		return () => {
			isMounted = false;
			unsubscribe();
		};
	}, [onError]);

	return {
		sessionUser,
		authReady,
	};
}
