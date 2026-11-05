import type { ReactNode } from 'react';

interface EmptyStateProps {
	children: ReactNode;
	compact?: boolean;
}

export function EmptyState({ children, compact = false }: EmptyStateProps) {
	return <div className={`empty${compact ? ' compact' : ''}`}>{children}</div>;
}
