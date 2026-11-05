import { Building2, ChevronRight, ClipboardList } from 'lucide-react';
import type { Project } from '../../types';

interface ProjectCardProps {
	project: Project;
	taskCount: number;
	onOpen: (project: Project) => void;
}

export function ProjectCard({ project, taskCount, onOpen }: ProjectCardProps) {
	return (
		<button type="button" className="project-card" onClick={() => onOpen(project)}>
			<div className="project-card-top">
				<div className="project-icon"><Building2 size={21} /></div>
				<ChevronRight size={18} className="muted-icon" />
			</div>
			<h3>{project.name}</h3>
			<p>{project.address}</p>
			<div className="project-card-footer">
				<span><ClipboardList size={15} />{taskCount} задач</span>
				<span className="card-link">Открыть <ChevronRight size={14} /></span>
			</div>
		</button>
	);
}
