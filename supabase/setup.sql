-- ПОЛНЫЙ СБРОС И УСТАНОВКА схемы мини-CRM «СтройКонтроль».
-- Выполнять целиком в Supabase Dashboard -> SQL Editor от имени postgres.
-- ВНИМАНИЕ: скрипт УДАЛЯЕТ все таблицы и данные CRM в public:
-- profiles, projects, tasks, task_status_history, связанные функции и типы.
-- Также удаляет из supabase_migrations.schema_migrations записи двух старых
-- миграций этого проекта (202611050001 и 202611050002).
-- Supabase Auth users, системные схемы Supabase и расширения НЕ удаляются.
-- Запускать только в тестовом проекте. Повторный запуск снова сотрёт данные CRM.

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Удаляем прежнюю схему CRM и её локальную историю миграций
-- ----------------------------------------------------------------------------

-- Сначала функции: они используют типы и таблицы CRM.
DROP FUNCTION IF EXISTS public.current_app_role() CASCADE;
DROP FUNCTION IF EXISTS public.write_task_status_history() CASCADE;
DROP FUNCTION IF EXISTS public.guard_task_mutation() CASCADE;
DROP FUNCTION IF EXISTS public.guard_project_archive() CASCADE;
DROP FUNCTION IF EXISTS public.archive_project_tasks() CASCADE;

-- У transition_task есть аргумент типа task_status; проверяем существование типа,
-- чтобы чистая база проходила этот блок без ошибки.
DO $reset_transition_function$
BEGIN
    IF to_regtype('public.task_status') IS NOT NULL THEN
        EXECUTE 'DROP FUNCTION IF EXISTS public.transition_task(uuid, public.task_status, text) CASCADE';
    END IF;
END;
$reset_transition_function$;

-- Порядок учитывает внешние ключи между таблицами.
DROP TABLE IF EXISTS public.task_status_history CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TYPE IF EXISTS public.task_status CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- Удаляем только записи двух прежних миграций CRM.
-- Не трогаем таблицу Supabase CLI и возможные записи других приложений.
DO $reset_migration_history$
BEGIN
    IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
        EXECUTE $sql$
            DELETE FROM supabase_migrations.schema_migrations
            WHERE version IN ('202611050001', '202611050002')
        $sql$;
    END IF;
END;
$reset_migration_history$;


CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Типы
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    CREATE TYPE public.app_role AS ENUM ('requester', 'executor');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
    CREATE TYPE public.task_status AS ENUM (
        'new',
        'in_progress',
        'review',
        'accepted',
        'rework'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- Таблицы и поля конечной схемы
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role public.app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    address TEXT NOT NULL CHECK (LENGTH(TRIM(address)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (LENGTH(TRIM(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    assignee_id UUID NOT NULL REFERENCES public.profiles(id),
    author_id UUID NOT NULL REFERENCES public.profiles(id),
    status public.task_status NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.task_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id),
    actor_id UUID NOT NULL REFERENCES public.profiles(id),
    from_status public.task_status,
    to_status public.task_status NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Дополнительные поля описаны явно, поскольку установка начинается с чистой схемы.
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- Индексы
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS tasks_assignee_idx
    ON public.tasks (assignee_id);

CREATE INDEX IF NOT EXISTS tasks_project_idx
    ON public.tasks (project_id);

CREATE INDEX IF NOT EXISTS tasks_status_idx
    ON public.tasks (status);

CREATE INDEX IF NOT EXISTS task_history_task_created_idx
    ON public.task_status_history (task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS projects_active_created_idx
    ON public.projects (created_at DESC)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_active_assignee_idx
    ON public.tasks (assignee_id, created_at DESC)
    WHERE archived_at IS NULL;

-- -----------------------------------------------------------------------------
-- Функции безопасности и бизнес-правил
-- -----------------------------------------------------------------------------

-- Роль берётся только из защищённого профиля текущего Auth-пользователя.
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT profile.role
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid();
$$;

-- Автоматическая запись истории при создании задачи и смене статуса.
CREATE OR REPLACE FUNCTION public.write_task_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.task_status_history (
            task_id,
            actor_id,
            from_status,
            to_status,
            comment
        )
        VALUES (
            NEW.id,
            COALESCE(auth.uid(), NEW.author_id),
            NULL,
            NEW.status,
            NULL
        );
    ELSE
        INSERT INTO public.task_status_history (
            task_id,
            actor_id,
            from_status,
            to_status,
            comment
        )
        VALUES (
            NEW.id,
            auth.uid(),
            OLD.status,
            NEW.status,
            NULLIF(current_setting('app.task_transition_comment', TRUE), '')
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Задачу создаёт только постановщик. Исполнитель меняет только статус,
-- причём только у назначенной ему задачи и только по разрешённому маршруту.
CREATE OR REPLACE FUNCTION public.guard_task_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role public.app_role;
BEGIN
    v_role := public.current_app_role();

    IF TG_OP = 'INSERT' THEN
        IF v_role IS DISTINCT FROM 'requester'
            OR NEW.author_id IS DISTINCT FROM auth.uid()
            OR NEW.status IS DISTINCT FROM 'new'::public.task_status
        THEN
            RAISE EXCEPTION 'Only a requester can create a task in New status';
        END IF;

        IF NEW.archived_at IS NOT NULL THEN
            RAISE EXCEPTION 'New tasks cannot be created in archived state';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.projects AS project
            WHERE project.id = NEW.project_id
                AND project.archived_at IS NULL
        ) THEN
            RAISE EXCEPTION 'Tasks can only belong to active projects';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.profiles AS profile
            WHERE profile.id = NEW.assignee_id
                AND profile.role = 'executor'
        ) THEN
            RAISE EXCEPTION 'Assignee must be an executor';
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
            OR NEW.author_id IS DISTINCT FROM OLD.author_id
        THEN
            RAISE EXCEPTION 'Task identity and author are immutable';
        END IF;

        IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
            AND (
                v_role IS DISTINCT FROM 'requester'
                OR OLD.archived_at IS NOT NULL
                OR NEW.archived_at IS NULL
            )
        THEN
            RAISE EXCEPTION 'Only a requester can archive an active task';
        END IF;

        IF OLD.archived_at IS NOT NULL THEN
            RAISE EXCEPTION 'Archived tasks are immutable';
        END IF;

        IF NEW.project_id IS DISTINCT FROM OLD.project_id
            AND NOT EXISTS (
                SELECT 1
                FROM public.projects AS project
                WHERE project.id = NEW.project_id
                    AND project.archived_at IS NULL
            )
        THEN
            RAISE EXCEPTION 'Tasks can only belong to active projects';
        END IF;

        IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
            AND NOT EXISTS (
                SELECT 1
                FROM public.profiles AS profile
                WHERE profile.id = NEW.assignee_id
                    AND profile.role = 'executor'
            )
        THEN
            RAISE EXCEPTION 'Assignee must be an executor';
        END IF;

        IF v_role = 'executor' THEN
            IF OLD.assignee_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'You can only update your own assigned tasks';
            END IF;

            IF NEW.title IS DISTINCT FROM OLD.title
                OR NEW.description IS DISTINCT FROM OLD.description
                OR NEW.project_id IS DISTINCT FROM OLD.project_id
                OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
            THEN
                RAISE EXCEPTION 'Executors cannot edit task details';
            END IF;

            IF NOT (
                (OLD.status = 'new' AND NEW.status = 'in_progress')
                OR (OLD.status = 'in_progress' AND NEW.status = 'review')
                OR (OLD.status = 'rework' AND NEW.status = 'in_progress')
            ) THEN
                RAISE EXCEPTION 'Forbidden status transition for executor';
            END IF;

        ELSIF v_role = 'requester' THEN
            IF NEW.status IS DISTINCT FROM OLD.status
                AND NOT (OLD.status = 'review' AND NEW.status IN ('accepted', 'rework'))
            THEN
                RAISE EXCEPTION 'Forbidden status transition for requester';
            END IF;

            IF OLD.status = 'review'
                AND NEW.status = 'rework'
                AND LENGTH(TRIM(COALESCE(current_setting('app.task_transition_comment', TRUE), ''))) = 0
            THEN
                RAISE EXCEPTION 'A comment is required when returning a task for rework';
            END IF;
        ELSE
            RAISE EXCEPTION 'No permission to update task';
        END IF;

        NEW.updated_at := NOW();
        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$;

-- Единственная точка смены статуса из клиентского приложения.
CREATE OR REPLACE FUNCTION public.transition_task(
    p_task_id UUID,
    p_to_status public.task_status,
    p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE;
    v_role public.app_role;
BEGIN
    v_role := public.current_app_role();

    IF v_role IS DISTINCT FROM 'requester'
        AND v_role IS DISTINCT FROM 'executor'
    THEN
        RAISE EXCEPTION 'No permission';
    END IF;

    IF p_to_status IS NULL THEN
        RAISE EXCEPTION 'Target status is required';
    END IF;

    SELECT task.*
    INTO v_task
    FROM public.tasks AS task
    WHERE task.id = p_task_id
    FOR UPDATE;

    IF NOT FOUND OR v_task.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_role = 'executor' AND v_task.assignee_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Task is not assigned to you';
    END IF;

    IF v_role = 'requester'
        AND NOT (v_task.status = 'review' AND p_to_status IN ('accepted', 'rework'))
    THEN
        RAISE EXCEPTION 'Forbidden status transition';
    END IF;

    IF v_role = 'executor'
        AND NOT (
            (v_task.status = 'new' AND p_to_status = 'in_progress')
            OR (v_task.status = 'in_progress' AND p_to_status = 'review')
            OR (v_task.status = 'rework' AND p_to_status = 'in_progress')
        )
    THEN
        RAISE EXCEPTION 'Forbidden status transition';
    END IF;

    IF p_to_status = 'rework' AND LENGTH(TRIM(COALESCE(p_comment, ''))) = 0 THEN
        RAISE EXCEPTION 'A comment is required when returning a task for rework';
    END IF;

    PERFORM set_config('app.task_transition_comment', COALESCE(p_comment, ''), TRUE);

    UPDATE public.tasks
    SET status = p_to_status
    WHERE id = p_task_id;

    PERFORM set_config('app.task_transition_comment', '', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_project_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Archived projects are immutable';
    END IF;

    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
        AND public.current_app_role() IS DISTINCT FROM 'requester'
    THEN
        RAISE EXCEPTION 'Only a requester can archive a project';
    END IF;

    RETURN NEW;
END;
$$;

-- Архивирование объекта архивирует связанные активные задачи в той же транзакции.
CREATE OR REPLACE FUNCTION public.archive_project_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
        UPDATE public.tasks
        SET archived_at = NEW.archived_at
        WHERE project_id = NEW.id
            AND archived_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Триггеры
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS tasks_guard_mutation ON public.tasks;
CREATE TRIGGER tasks_guard_mutation
    BEFORE INSERT OR UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_task_mutation();

DROP TRIGGER IF EXISTS tasks_status_history_insert ON public.tasks;
CREATE TRIGGER tasks_status_history_insert
    AFTER INSERT ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.write_task_status_history();

DROP TRIGGER IF EXISTS tasks_status_history_update ON public.tasks;
CREATE TRIGGER tasks_status_history_update
    AFTER UPDATE OF status ON public.tasks
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.write_task_status_history();

DROP TRIGGER IF EXISTS projects_guard_archive ON public.projects;
CREATE TRIGGER projects_guard_archive
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_project_archive();

DROP TRIGGER IF EXISTS projects_archive_tasks ON public.projects;
CREATE TRIGGER projects_archive_tasks
    AFTER UPDATE OF archived_at ON public.projects
    FOR EACH ROW
    WHEN (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)
    EXECUTE FUNCTION public.archive_project_tasks();

-- -----------------------------------------------------------------------------
-- RLS и политики
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_status_history ENABLE ROW LEVEL SECURITY;

-- Удаляем DELETE-политики из первоначальной миграции: удаление заменено архивированием.
DROP POLICY IF EXISTS projects_requester_delete ON public.projects;
DROP POLICY IF EXISTS tasks_requester_delete ON public.tasks;

DROP POLICY IF EXISTS profiles_read_authenticated ON public.profiles;
CREATE POLICY profiles_read_authenticated
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR public.current_app_role() = 'requester'
        OR EXISTS (
            SELECT 1
            FROM public.tasks AS task
            WHERE task.assignee_id = auth.uid()
                AND task.archived_at IS NULL
                AND (
                    task.author_id = profiles.id
                    OR EXISTS (
                        SELECT 1
                        FROM public.task_status_history AS history
                        WHERE history.task_id = task.id
                            AND history.actor_id = profiles.id
                    )
                )
        )
    );

DROP POLICY IF EXISTS projects_read_visible ON public.projects;
CREATE POLICY projects_read_visible
    ON public.projects
    FOR SELECT
    TO authenticated
    USING (
        archived_at IS NULL
        AND (
            public.current_app_role() = 'requester'
            OR EXISTS (
                SELECT 1
                FROM public.tasks AS task
                WHERE task.project_id = projects.id
                    AND task.assignee_id = auth.uid()
                    AND task.archived_at IS NULL
            )
        )
    );

DROP POLICY IF EXISTS projects_requester_insert ON public.projects;
CREATE POLICY projects_requester_insert
    ON public.projects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_app_role() = 'requester'
        AND archived_at IS NULL
    );

DROP POLICY IF EXISTS projects_requester_update ON public.projects;
CREATE POLICY projects_requester_update
    ON public.projects
    FOR UPDATE
    TO authenticated
    USING (
        archived_at IS NULL
        AND public.current_app_role() = 'requester'
    )
    WITH CHECK (public.current_app_role() = 'requester');

DROP POLICY IF EXISTS tasks_read_visible ON public.tasks;
CREATE POLICY tasks_read_visible
    ON public.tasks
    FOR SELECT
    TO authenticated
    USING (
        archived_at IS NULL
        AND (
            public.current_app_role() = 'requester'
            OR assignee_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS tasks_requester_insert ON public.tasks;
CREATE POLICY tasks_requester_insert
    ON public.tasks
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_app_role() = 'requester'
        AND author_id = auth.uid()
        AND archived_at IS NULL
    );

DROP POLICY IF EXISTS tasks_update_visible ON public.tasks;
CREATE POLICY tasks_update_visible
    ON public.tasks
    FOR UPDATE
    TO authenticated
    USING (
        archived_at IS NULL
        AND (
            public.current_app_role() = 'requester'
            OR assignee_id = auth.uid()
        )
    )
    WITH CHECK (
        public.current_app_role() = 'requester'
        OR assignee_id = auth.uid()
    );

DROP POLICY IF EXISTS history_read_visible ON public.task_status_history;
CREATE POLICY history_read_visible
    ON public.task_status_history
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.tasks AS task
            WHERE task.id = task_id
                AND task.archived_at IS NULL
                AND (
                    public.current_app_role() = 'requester'
                    OR task.assignee_id = auth.uid()
                )
        )
    );

-- -----------------------------------------------------------------------------
-- Привилегии
-- -----------------------------------------------------------------------------

REVOKE ALL ON public.profiles, public.projects, public.tasks, public.task_status_history
    FROM PUBLIC, anon, authenticated;

-- Email и изменение профиля недоступны клиентскому приложению.
GRANT SELECT (id, full_name, role) ON public.profiles TO authenticated;
GRANT SELECT ON public.projects, public.tasks, public.task_status_history TO authenticated;
GRANT INSERT, UPDATE ON public.projects, public.tasks TO authenticated;

-- Вызывается политиками RLS и RPC соответственно.
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;

REVOKE ALL ON FUNCTION public.transition_task(UUID, public.task_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_task(UUID, public.task_status, TEXT) TO authenticated;

-- Триггерные функции не являются RPC-интерфейсом для клиента.
REVOKE ALL ON FUNCTION public.write_task_status_history() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_task_mutation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_project_archive() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_project_tasks() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.write_task_status_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_task_mutation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_project_archive() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_project_tasks() TO authenticated;

COMMIT;

-- Контрольная выборка: схема создана, RLS включён на всех четырёх таблицах.
SELECT
    table_name,
    row_level_security
FROM (
    SELECT
        cls.relname AS table_name,
        cls.relrowsecurity AS row_level_security
    FROM pg_class AS cls
    JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
        AND cls.relname IN ('profiles', 'projects', 'tasks', 'task_status_history')
) AS schema_state
ORDER BY table_name;
