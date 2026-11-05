import { ChevronRight, RefreshCw } from 'lucide-react';
import { ROLE_LABELS, type AppView, type Profile } from '../../types';

interface TopbarProps {
	profile: Profile;
	view: AppView;
	title: string;
	onRefresh: () => void;
}

export function Topbar({ profile, view, title, onRefresh }: TopbarProps) {
	return (
		<header className="topbar">
			<div>
				<div className="breadcrumbs">
					Рабочее пространство <ChevronRight size={14} />
					{view === 'projects' ? 'Объекты' : 'Мои задачи'}
				</div>
				<h1>{title}</h1>
			</div>
			<div className="top-actions">
				<span className="role-chip">
					<span /> {ROLE_LABELS[profile.role]}
				</span>
				<button type="button" className="icon-btn" onClick={onRefresh} title="Обновить" aria-label="Обновить данные">
					<RefreshCw size={17} />
				</button>
			</div>
		</header>
	);
}
