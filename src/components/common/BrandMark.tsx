import { Building2 } from 'lucide-react';

interface BrandMarkProps {
	className?: string;
}

export function BrandMark({ className = '' }: BrandMarkProps) {
	return (
		<div className={`brand-mark ${className}`.trim()} aria-hidden="true">
			<Building2 />
		</div>
	);
}
