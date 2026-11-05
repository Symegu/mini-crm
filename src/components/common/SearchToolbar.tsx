import { Search } from 'lucide-react';

interface SearchToolbarProps {
	value: string;
	placeholder: string;
	onChange: (value: string) => void;
}

export function SearchToolbar({ value, placeholder, onChange }: SearchToolbarProps) {
	return (
		<div className="toolbar">
			<label className="search-box">
				<Search size={17} />
				<input
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					aria-label={placeholder}
				/>
			</label>
		</div>
	);
}
