import { withSupabase } from 'npm:@supabase/server@1';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ManagedRole = 'requester' | 'executor';
type Action = 'list' | 'create' | 'update_role';

interface RequestBody {
	action?: Action;
	full_name?: string;
	email?: string;
	password?: string;
	role?: ManagedRole;
	user_id?: string;
}

const json = (status: number, body: Record<string, unknown>) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' },
	});

const authenticatedHandler = withSupabase({ auth: 'user' }, async (request, context) => {
	if (request.method !== 'POST') {
		return json(405, { error: 'Method not allowed' });
	}

	// withSupabase проверяет пользовательский JWT. Admin-клиент существует
	// только внутри Edge Function и использует секретный ключ Supabase.
	const adminClient = context.supabaseAdmin;
	const actorId = context.userClaims?.id;
	if (!actorId) return json(401, { error: 'Authentication required' });

	const { data: actorProfile, error: actorError } = await adminClient
		.from('profiles')
		.select('id, role')
		.eq('id', actorId)
		.maybeSingle();

	if (actorError) {
		return json(500, { error: 'Could not verify administrator permissions' });
	}
	if (actorProfile?.role !== 'superadmin') {
		return json(403, { error: 'Only a superadmin can manage users' });
	}

	let body: RequestBody;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: 'Invalid JSON body' });
	}

	if (body.action === 'list') {
		const { data, error } = await adminClient
			.from('profiles')
			.select('id, full_name, email, role, created_at')
			.order('created_at', { ascending: false });
		if (error) return json(500, { error: 'Could not load users' });
		return json(200, { users: data ?? [] });
	}

	if (body.action === 'create') {
		const fullName = body.full_name?.trim();
		const email = body.email?.trim().toLowerCase();
		const password = body.password ?? '';
		const role = body.role;

		if (!fullName || fullName.length > 120) {
			return json(400, { error: 'Укажите имя длиной от 1 до 120 символов.' });
		}
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
			return json(400, { error: 'Укажите корректный email.' });
		}
		if (password.length < 12 || password.length > 128) {
			return json(400, { error: 'Временный пароль должен содержать от 12 до 128 символов.' });
		}
		if (role !== 'requester' && role !== 'executor') {
			return json(400, { error: 'Можно назначить только роль постановщика или исполнителя.' });
		}

		const { data: created, error: createError } = await adminClient.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
			user_metadata: { full_name: fullName },
		});
		if (createError || !created.user) {
			return json(400, { error: createError?.message ?? 'Не удалось создать пользователя.' });
		}

		const { error: profileError } = await adminClient.from('profiles').insert({
			id: created.user.id,
			full_name: fullName,
			email,
			role,
		});

		if (profileError) {
			// Компенсирующее удаление: не оставляем Auth-пользователя без профиля.
			await adminClient.auth.admin.deleteUser(created.user.id);
			return json(500, { error: 'Пользователь Auth создан, но профиль не сохранился. Операция отменена.' });
		}

		return json(201, {
			user: {
				id: created.user.id,
				full_name: fullName,
				email,
				role,
				created_at: created.user.created_at,
			},
		});
	}

	if (body.action === 'update_role') {
		const userId = body.user_id;
		const role = body.role;
		if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
			return json(400, { error: 'Некорректный идентификатор пользователя.' });
		}
		if (userId === actorId) {
			return json(400, { error: 'Нельзя изменить собственную роль.' });
		}
		if (role !== 'requester' && role !== 'executor') {
			return json(400, { error: 'Можно назначить только роль постановщика или исполнителя.' });
		}

		const { data: target, error: targetError } = await adminClient
			.from('profiles')
			.select('id, role')
			.eq('id', userId)
			.maybeSingle();
		if (targetError) return json(500, { error: 'Не удалось проверить пользователя.' });
		if (!target) return json(404, { error: 'Пользователь не найден.' });
		if (target.role === 'superadmin') {
			return json(403, { error: 'Нельзя изменить роль суперадминистратора через этот интерфейс.' });
		}

		if (target.role === 'executor' && role === 'requester') {
			const { count, error: tasksError } = await adminClient
				.from('tasks')
				.select('id', { count: 'exact', head: true })
				.eq('assignee_id', userId)
				.is('archived_at', null);
			if (tasksError) return json(500, { error: 'Не удалось проверить активные задачи пользователя.' });
			if ((count ?? 0) > 0) {
				return json(409, { error: 'Сначала переназначьте или архивируйте активные задачи пользователя.' });
			}
		}

		const { error: updateError } = await adminClient
			.from('profiles')
			.update({ role })
			.eq('id', userId);
		if (updateError) return json(500, { error: 'Не удалось изменить роль пользователя.' });
		return json(200, { success: true });
	}

	return json(400, { error: 'Unknown action' });
});

Deno.serve((request) => {
	if (request.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}
	return authenticatedHandler(request);
});
