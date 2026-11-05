import { Building2, ClipboardList, LogOut, UserRound } from 'lucide-react';
import { BrandMark } from '../common/BrandMark';
import { ROLE_LABELS, type AppView, type Profile } from '../../types';

interface SidebarProps {
	profile: Profile;
	view: AppView;
	activeTaskCount: number;
	onChangeView: (view: AppView) => void;
	onSignOut: () => void;
}

export function Sidebar({
	profile,
	view,
	activeTaskCount,
	onChangeView,
	onSignOut,
}: SidebarProps) {
	const isRequester = profile.role === 'requester';

	return (
		<aside className="sidebar">
			<div className="brand">
				<BrandMark className="small" />
				<div>
					<strong>СтройКонтроль</strong>
					<small>Управление объектами</small>
				</div>
			</div>

			<div className="nav-label">Рабочее пространство</div>
			<button
				type="button"
				className={`nav-item ${view === 'projects' ? 'active' : ''}`}
				onClick={() => onChangeView('projects')}
			>
				<Building2 size={18} />
				<span>Объекты</span>
			</button>

			{!isRequester && (
				<button
					type="button"
					className={`nav-item ${view === 'my-tasks' ? 'active' : ''}`}
					onClick={() => onChangeView('my-tasks')}
				>
					<ClipboardList size={18} />
					<span>Мои задачи</span>
					<span className="nav-count">{activeTaskCount}</span>
				</button>
			)}

			<div className="sidebar-bottom">
				<div className="profile-mini">
					<div className="avatar"><UserRound size={17} /></div>
					<div className="profile-info">
						<strong>{profile.full_name}</strong>
						<small>{ROLE_LABELS[profile.role]}</small>
					</div>
				</div>
				<button type="button" className="nav-item logout" onClick={onSignOut}>
					<LogOut size={17} />
					<span>Выйти</span>
				</button>
			</div>
		</aside>
	);
}
