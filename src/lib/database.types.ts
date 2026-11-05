export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	public: {
		Tables: {
			profiles: {
				Row: {
					id: string;
					full_name: string;
					email: string;
					role: Database['public']['Enums']['app_role'];
					created_at: string;
				};
				Insert: {
					id: string;
					full_name: string;
					email: string;
					role: Database['public']['Enums']['app_role'];
					created_at?: string;
				};
				Update: {
					id?: string;
					full_name?: string;
					email?: string;
					role?: Database['public']['Enums']['app_role'];
					created_at?: string;
				};
				Relationships: [];
			};

			projects: {
				Row: {
					id: string;
					name: string;
					address: string;
					created_at: string;
					archived_at: string | null;
				};
				Insert: {
					id?: string;
					name: string;
					address: string;
					created_at?: string;
					archived_at?: string | null;
				};
				Update: {
					id?: string;
					name?: string;
					address?: string;
					created_at?: string;
					archived_at?: string | null;
				};
				Relationships: [];
			};

			tasks: {
				Row: {
					id: string;
					title: string;
					description: string;
					project_id: string;
					assignee_id: string;
					author_id: string;
					status: Database['public']['Enums']['task_status'];
					created_at: string;
					updated_at: string;
					archived_at: string | null;
				};
				Insert: {
					id?: string;
					title: string;
					description?: string;
					project_id: string;
					assignee_id: string;
					author_id: string;
					status?: Database['public']['Enums']['task_status'];
					created_at?: string;
					updated_at?: string;
					archived_at?: string | null;
				};
				Update: {
					id?: string;
					title?: string;
					description?: string;
					project_id?: string;
					assignee_id?: string;
					author_id?: string;
					status?: Database['public']['Enums']['task_status'];
					created_at?: string;
					updated_at?: string;
					archived_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'tasks_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_assignee_id_fkey';
						columns: ['assignee_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_author_id_fkey';
						columns: ['author_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
				];
			};

			task_status_history: {
				Row: {
					id: string;
					task_id: string;
					actor_id: string;
					from_status: Database['public']['Enums']['task_status'] | null;
					to_status: Database['public']['Enums']['task_status'];
					comment: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					task_id: string;
					actor_id: string;
					from_status?: Database['public']['Enums']['task_status'] | null;
					to_status: Database['public']['Enums']['task_status'];
					comment?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					task_id?: string;
					actor_id?: string;
					from_status?: Database['public']['Enums']['task_status'];
					to_status?: Database['public']['Enums']['task_status'];
					comment?: string | null;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'task_status_history_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'task_status_history_actor_id_fkey';
						columns: ['actor_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
				];
			};
		};

		Views: Record<string, never>;

		Functions: {
			current_app_role: {
				Args: Record<PropertyKey, never>;
				Returns: Database['public']['Enums']['app_role'];
			};
			transition_task: {
				Args: {
					p_task_id: string;
					p_to_status: Database['public']['Enums']['task_status'];
					p_comment?: string | null;
				};
				Returns: undefined;
			};
		};

		Enums: {
			app_role: 'superadmin' | 'requester' | 'executor';
			task_status: 'new' | 'in_progress' | 'review' | 'accepted' | 'rework';
		};

		CompositeTypes: Record<string, never>;
	};
};
