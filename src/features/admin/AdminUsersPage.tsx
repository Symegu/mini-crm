import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, RefreshCw, Search, ShieldCheck, UserRoundPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getErrorMessage } from '../../lib/format';
import { ROLE_LABELS, type Role } from '../../types';

interface ManagedUser {
	id: string;
	full_name: string;
	email: string;
	role: Role;
	created_at: string;
}

interface AdminUsersPageProps {
	currentUserId: string;
	onNotice: (message: string) => void;
	onError: (message: string) => void;
}

const MANAGEABLE_ROLES: Role[] = ['requester', 'executor'];

async function getAdminErrorMessage(error: unknown): Promise<string> {
	if (typeof error === 'object' && error !== null && 'context' in error) {
		const context = error.context;
		if (context instanceof Response) {
			try {
				const payload = await context.clone().json() as { error?: string };
				if (payload.error) return payload.error;
			} catch {
				// Используем стандартное сообщение, если сервер вернул не JSON.
			}
		}
	}
	return getErrorMessage(error);
}

export function AdminUsersPage({ currentUserId, onNotice, onError }: AdminUsersPageProps) {
	const [users, setUsers] = useState<ManagedUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [search, setSearch] = useState('');
	const [fullName, setFullName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [role, setRole] = useState<ManagedUser['role']>('executor');
	const [roleDrafts, setRoleDrafts] = useState<Record<string, ManagedUser['role']>>({});

	const loadUsers = useCallback(async () => {
		if (!supabase) return;
		setLoading(true);
		const { data, error } = await supabase.functions.invoke('admin-users', {
			body: { action: 'list' },
		});
		if (error) {
			onError(await getAdminErrorMessage(error));
		} else if (data?.error) {
			onError(String(data.error));
		} else {
			const nextUsers = (data?.users ?? []) as ManagedUser[];
			setUsers(nextUsers);
			setRoleDrafts(Object.fromEntries(nextUsers.map((user) => [user.id, user.role])));
		}
		setLoading(false);
	}, [onError]);

	useEffect(() => {
		void loadUsers();
	}, [loadUsers]);

	const filteredUsers = useMemo(() => {
		const normalized = search.trim().toLowerCase();
		if (!normalized) return users;
		return users.filter((user) =>
			`${user.full_name} ${user.email} ${ROLE_LABELS[user.role]}`.toLowerCase().includes(normalized),
		);
	}, [users, search]);

	async function createUser(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!supabase) return;
		setSaving(true);
		onError('');
		const { data, error } = await supabase.functions.invoke('admin-users', {
			body: {
				action: 'create',
				full_name: fullName.trim(),
				email: email.trim().toLowerCase(),
				password,
				role,
			},
		});
		if (error || data?.error) {
			onError(data?.error ? String(data.error) : await getAdminErrorMessage(error));
		} else {
			setFullName('');
			setEmail('');
			setPassword('');
			onNotice('Пользователь создан. Передайте ему email и временный пароль безопасным способом.');
			await loadUsers();
		}
		setSaving(false);
	}

	async function updateRole(user: ManagedUser) {
		if (!supabase) return;
		const nextRole = roleDrafts[user.id];
		if (!nextRole || nextRole === user.role) return;
		if (!window.confirm(`Изменить роль пользователя ${user.full_name} на «${ROLE_LABELS[nextRole]}»?`)) return;
		setSaving(true);
		const { data, error } = await supabase.functions.invoke('admin-users', {
			body: { action: 'update_role', user_id: user.id, role: nextRole },
		});
		if (error || data?.error) {
			onError(data?.error ? String(data.error) : await getAdminErrorMessage(error));
		} else {
			onNotice(`Роль пользователя ${user.full_name} изменена.`);
			await loadUsers();
		}
		setSaving(false);
	}

	return (
		<div className="content admin-users-page">
			<section className="section-title">
				<div>
					<div className="eyebrow">АДМИНИСТРИРОВАНИЕ</div>
					<h2>Пользователи</h2>
					<p>Создание учётных записей и назначение ролей. Пароли хранит Supabase Auth.</p>
				</div>
				<button className="secondary" type="button" onClick={() => void loadUsers()} disabled={loading || saving}>
					<RefreshCw size={15} /> Обновить
				</button>
			</section>

			<section className="admin-create-card">
				<div className="admin-card-heading">
					<div className="admin-heading-icon"><UserRoundPlus size={19} /></div>
					<div>
						<h3>Создать пользователя</h3>
						<p>Новый пользователь получит доступ после входа с выданным временным паролем.</p>
					</div>
				</div>
				<form className="admin-user-form" onSubmit={(event) => void createUser(event)}>
					<label>
						<span>ФИО</span>
						<input value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={120} placeholder="Иван Петров" />
					</label>
					<label>
						<span>Email</span>
						<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="user@company.ru" />
					</label>
					<label>
						<span>Временный пароль</span>
						<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" placeholder="Не менее 12 символов" />
					</label>
					<label>
						<span>Роль</span>
						<select value={role} onChange={(event) => setRole(event.target.value as ManagedUser['role'])}>
							{MANAGEABLE_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
						</select>
					</label>
					<div className="admin-form-actions">
						<button className="primary" type="submit" disabled={saving || !fullName.trim() || password.length < 12}>
							<Plus size={15} /> {saving ? 'Сохранение…' : 'Создать пользователя'}
						</button>
					</div>
				</form>
				<p className="admin-security-note"><ShieldCheck size={15} /> Создание выполняется на сервере. Секретный ключ Supabase не передаётся в браузер.</p>
			</section>

			<section className="admin-list-section">
				<div className="admin-list-heading">
					<div>
						<h3>Учётные записи <span className="sub-count">{users.length}</span></h3>
						<p>Суперадминистраторы защищены от изменения роли из этого интерфейса.</p>
					</div>
					<div className="search-box admin-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, email или роль" /></div>
				</div>
				<div className="table-wrap">
					<table className="admin-users-table">
						<thead><tr><th>ПОЛЬЗОВАТЕЛЬ</th><th>РОЛЬ</th><th>СОЗДАН</th><th>ДЕЙСТВИЕ</th></tr></thead>
						<tbody>
							{loading ? <tr><td colSpan={4}>Загружаем пользователей…</td></tr> : filteredUsers.length === 0 ? <tr><td colSpan={4}>Пользователи не найдены.</td></tr> : filteredUsers.map((user) => (
								<tr key={user.id}>
									<td><strong className="admin-user-name">{user.full_name}{user.id === currentUserId ? ' (вы)' : ''}</strong><small>{user.email}</small></td>
									<td>{user.role === 'superadmin' ? <span className="admin-role-super">{ROLE_LABELS[user.role]}</span> : ROLE_LABELS[user.role]}</td>
									<td>{new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
									<td>{user.role === 'superadmin' || user.id === currentUserId ? <span className="admin-protected">Защищено</span> : <div className="admin-role-action"><select aria-label={`Роль пользователя ${user.full_name}`} value={roleDrafts[user.id] ?? user.role} onChange={(event) => setRoleDrafts((current) => ({ ...current, [user.id]: event.target.value as ManagedUser['role'] }))}>{MANAGEABLE_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select><button className="secondary" type="button" disabled={saving || roleDrafts[user.id] === user.role} onClick={() => void updateRole(user)}>Сохранить</button></div>}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
