interface MetaItemProps {
	label: string;
	value: string;
}

export function MetaItem({ label, value }: MetaItemProps) {
	return (
		<div className="meta-item">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}
