import type { FormEvent } from 'react';
import { BrandMark } from '../../components/common/BrandMark';

interface LoginPageProps {
	busy: boolean;
	error: string;
	email: string;
	password: string;
	onEmailChange: (value: string) => void;
	onPasswordChange: (value: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function LoginPage({
	busy,
	error,
	email,
	password,
	onEmailChange,
	onPasswordChange,
	onSubmit,
}: LoginPageProps) {
	return (
		<main className="login-wrap">
			<form className="login-card" onSubmit={onSubmit}>
				<BrandMark />
				<span className="eyebrow">Мини-CRM строительной компании</span>
				<h1>СтройКонтроль</h1>
				<p className="muted">Войдите, чтобы продолжить работу</p>

				<label>
					Email
					<input
						type="email"
						value={email}
						onChange={(event) => onEmailChange(event.target.value)}
						autoComplete="username"
						required
						placeholder="name@company.ru"
					/>
				</label>
				<label>
					Пароль
					<input
						type="password"
						value={password}
						onChange={(event) => onPasswordChange(event.target.value)}
						autoComplete="current-password"
						required
						placeholder="Введите пароль"
					/>
				</label>

				{error && <div className="alert error" role="alert">{error}</div>}

				<button className="primary full" type="submit" disabled={busy}>
					{busy ? 'Входим…' : 'Войти'}
				</button>
				<small>Регистрация отключена. Учётные записи создаёт администратор.</small>
			</form>
		</main>
	);
}
