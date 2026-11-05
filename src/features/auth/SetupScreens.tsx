import { ShieldCheck } from 'lucide-react';
import { BrandMark } from '../../components/common/BrandMark';

interface SetupScreenProps {
	onSignOut?: () => void;
	onRetry?: () => void;
	message?: string;
}

export function SupabaseSetupScreen() {
	return (
		<main className="setup">
			<div className="setup-card">
				<BrandMark />
				<h1>СтройКонтроль</h1>
				<p>Для запуска укажите публичные параметры Supabase.</p>
				<code>cp .env.example .env.local</code>
				<p>
					Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY,
					затем перезапустите dev-сервер.
				</p>
				<small>Секретный service_role key во фронтенде не используется.</small>
			</div>
		</main>
	);
}

export function ProfileSetupScreen({ onSignOut, onRetry, message }: SetupScreenProps) {
	return (
		<main className="setup">
			<div className="setup-card">
				<ShieldCheck size={30} />
				<h2>Настройка профиля</h2>
				<p>{message || 'Загружаем профиль…'}</p>
				{onRetry && <button type="button" className="secondary" onClick={onRetry}>Повторить</button>}
				{onSignOut && <button type="button" className="link-btn" onClick={onSignOut}>Выйти</button>}
			</div>
		</main>
	);
}
