-- AI consent and notification tables are deferred until their requirements are settled.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nickname text NOT NULL CHECK (length(trim(nickname)) > 0),
  account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'deletion_pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.account_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.user_profiles (id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('storage_cleanup', 'database_cleanup', 'auth_delete')),
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'retryable_failure')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_expires_at timestamptz,
  last_error_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.account_deletion_job_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.account_deletion_jobs (id) ON DELETE CASCADE,
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'deleted', 'retryable_failure')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, bucket_id, object_path)
);

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  preference_learning_consented_at timestamptz,
  PRIMARY KEY (group_id, user_id)
);

CREATE UNIQUE INDEX group_members_one_admin_per_group
  ON public.group_members (group_id)
  WHERE role = 'admin';
CREATE INDEX group_members_by_user ON public.group_members (user_id, group_id);

CREATE TABLE public.group_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  issued_by uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE (group_id, id),
  CHECK (expires_at = created_at + interval '7 days')
);
CREATE INDEX group_invitations_by_group ON public.group_invitations (group_id);

CREATE TABLE public.group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  invitation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  decided_at timestamptz,
  UNIQUE (invitation_id, user_id),
  FOREIGN KEY (group_id, invitation_id)
    REFERENCES public.group_invitations (group_id, id) ON DELETE CASCADE,
  CHECK (
    (status = 'pending' AND decided_at IS NULL)
    OR (status IN ('approved', 'rejected') AND decided_at IS NOT NULL)
  )
);
CREATE INDEX group_join_requests_by_group_status
  ON public.group_join_requests (group_id, status, requested_at);
CREATE INDEX group_join_requests_by_user
  ON public.group_join_requests (user_id, requested_at);

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.user_profiles (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  description text,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'confirmed')),
  response_deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, id)
);
CREATE INDEX plans_by_group ON public.plans (group_id, created_at DESC);
CREATE INDEX plans_by_creator ON public.plans (created_by);

CREATE TABLE public.plan_date_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans (id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.user_profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, id),
  CHECK (ends_at > starts_at)
);
CREATE INDEX plan_date_candidates_by_plan
  ON public.plan_date_candidates (plan_id, starts_at);

CREATE TABLE public.plan_date_responses (
  candidate_id uuid NOT NULL REFERENCES public.plan_date_candidates (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('available', 'conditional', 'unavailable')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, user_id)
);
CREATE INDEX plan_date_responses_by_user
  ON public.plan_date_responses (user_id, candidate_id);

CREATE TABLE public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_place_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_place_id)
);

CREATE TABLE public.group_favorites (
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES public.places (id) ON DELETE RESTRICT,
  added_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, place_id)
);
CREATE INDEX group_favorites_by_place ON public.group_favorites (place_id);

CREATE TABLE public.plan_places (
  plan_id uuid NOT NULL REFERENCES public.plans (id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES public.places (id) ON DELETE RESTRICT,
  added_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, place_id)
);
CREATE INDEX plan_places_by_place ON public.plan_places (place_id);

CREATE TABLE public.plan_confirmations (
  plan_id uuid PRIMARY KEY REFERENCES public.plans (id) ON DELETE CASCADE,
  date_candidate_id uuid NOT NULL,
  place_id uuid NOT NULL,
  confirmed_by uuid DEFAULT auth.uid()
    REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_id, date_candidate_id)
    REFERENCES public.plan_date_candidates (plan_id, id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id, place_id)
    REFERENCES public.plan_places (plan_id, place_id) ON DELETE CASCADE
);
CREATE INDEX plan_confirmations_by_place ON public.plan_confirmations (place_id);

CREATE TABLE public.plan_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans (id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles (id) ON DELETE SET NULL,
  content text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (content IS NOT NULL OR storage_path IS NOT NULL)
);
CREATE INDEX plan_memories_by_plan ON public.plan_memories (plan_id, created_at);
CREATE INDEX plan_memories_by_creator ON public.plan_memories (created_by);

CREATE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_touch_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER account_deletion_jobs_touch_updated_at
  BEFORE UPDATE ON public.account_deletion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER account_deletion_job_objects_touch_updated_at
  BEFORE UPDATE ON public.account_deletion_job_objects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER groups_touch_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER plans_touch_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER plan_date_candidates_touch_updated_at
  BEFORE UPDATE ON public.plan_date_candidates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER plan_date_responses_touch_updated_at
  BEFORE UPDATE ON public.plan_date_responses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER plan_confirmations_touch_updated_at
  BEFORE UPDATE ON public.plan_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER plan_memories_touch_updated_at
  BEFORE UPDATE ON public.plan_memories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.account_status = 'active'
  );
$$;

CREATE FUNCTION public.is_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT public.is_active_user()
    AND EXISTS (
      SELECT 1
      FROM public.group_members AS membership
      WHERE membership.group_id = p_group_id
        AND membership.user_id = auth.uid()
    );
$$;

CREATE FUNCTION public.is_group_admin(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT public.is_active_user()
    AND EXISTS (
      SELECT 1
      FROM public.group_members AS membership
      WHERE membership.group_id = p_group_id
        AND membership.user_id = auth.uid()
        AND membership.role = 'admin'
    );
$$;

CREATE FUNCTION public.is_group_peer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT public.is_active_user()
    AND EXISTS (
      SELECT 1
      FROM public.group_members AS viewer
      JOIN public.group_members AS target
        ON target.group_id = viewer.group_id
      JOIN public.user_profiles AS target_profile
        ON target_profile.id = target.user_id
      WHERE viewer.user_id = auth.uid()
        AND target.user_id = p_user_id
        AND target_profile.account_status = 'active'
    );
$$;

CREATE FUNCTION public.is_plan_member(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT public.is_active_user()
    AND EXISTS (
      SELECT 1
      FROM public.plans AS plan
      JOIN public.group_members AS membership
        ON membership.group_id = plan.group_id
      WHERE plan.id = p_plan_id
        AND membership.user_id = auth.uid()
    );
$$;

CREATE FUNCTION public.is_plan_creator(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT public.is_active_user()
    AND EXISTS (
      SELECT 1
      FROM public.plans AS plan
      WHERE plan.id = p_plan_id
        AND plan.created_by = auth.uid()
    );
$$;

CREATE FUNCTION public.can_edit_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT public.is_plan_member(p_plan_id)
    AND EXISTS (
      SELECT 1
      FROM public.plans AS plan
      WHERE plan.id = p_plan_id
        AND (plan.status = 'planning' OR plan.created_by = auth.uid())
    );
$$;

CREATE FUNCTION public.can_respond_to_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT public.is_plan_member(p_plan_id)
    AND EXISTS (
      SELECT 1
      FROM public.plans AS plan
      WHERE plan.id = p_plan_id
        AND plan.status = 'planning'
        AND (plan.response_deadline IS NULL OR plan.response_deadline > now())
    );
$$;

CREATE FUNCTION public.create_group(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'active profile required';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'group name must not be empty';
  END IF;

  INSERT INTO public.groups (name)
  VALUES (trim(p_name))
  RETURNING id INTO v_group_id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'admin');

  RETURN v_group_id;
END;
$$;

CREATE FUNCTION public.create_group_invitation(p_group_id uuid)
RETURNS TABLE (invitation_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, extensions, pg_temp
AS $$
DECLARE
  v_invitation_id uuid;
  v_token text;
  v_expires_at timestamptz;
BEGIN
  IF NOT public.is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'group administrator required';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.group_invitations AS new_invitation (group_id, issued_by, token_hash)
  VALUES (
    p_group_id,
    auth.uid(),
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  RETURNING new_invitation.id, new_invitation.expires_at
  INTO v_invitation_id, v_expires_at;

  RETURN QUERY SELECT v_invitation_id, v_token, v_expires_at;
END;
$$;

CREATE FUNCTION public.submit_group_join_request(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, extensions, pg_temp
AS $$
DECLARE
  v_invitation_id uuid;
  v_group_id uuid;
  v_request_id uuid;
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'active profile required';
  END IF;
  IF p_token IS NULL OR length(p_token) <> 64 THEN
    RAISE EXCEPTION 'invalid invitation';
  END IF;

  SELECT invitation.id, invitation.group_id
  INTO v_invitation_id, v_group_id
  FROM public.group_invitations AS invitation
  WHERE invitation.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND invitation.expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired invitation';
  END IF;
  IF public.is_group_member(v_group_id) THEN
    RAISE EXCEPTION 'already a group member';
  END IF;

  INSERT INTO public.group_join_requests (group_id, invitation_id, user_id)
  VALUES (v_group_id, v_invitation_id, auth.uid())
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

CREATE FUNCTION public.decide_group_join_request(p_request_id uuid, p_approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_group_id uuid;
  v_user_id uuid;
  v_status text;
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'active profile required';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'decision is required';
  END IF;

  SELECT request.group_id
  INTO v_group_id
  FROM public.group_join_requests AS request
  WHERE request.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'join request not found';
  END IF;

  PERFORM 1 FROM public.groups WHERE id = v_group_id FOR UPDATE;
  IF NOT public.is_group_admin(v_group_id) THEN
    RAISE EXCEPTION 'group administrator required';
  END IF;

  SELECT request.user_id, request.status
  INTO v_user_id, v_status
  FROM public.group_join_requests AS request
  WHERE request.id = p_request_id;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'join request already decided';
  END IF;

  IF p_approve THEN
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_group_id, v_user_id, 'member')
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END IF;

  UPDATE public.group_join_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_request_id;
END;
$$;

CREATE FUNCTION public.set_group_preference_learning_consent(
  p_group_id uuid,
  p_consented boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
  IF p_consented IS NULL THEN
    RAISE EXCEPTION 'consent choice is required';
  END IF;
  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'group membership required';
  END IF;

  UPDATE public.group_members
  SET preference_learning_consented_at =
    CASE
      WHEN p_consented THEN COALESCE(preference_learning_consented_at, now())
      ELSE NULL
    END
  WHERE group_id = p_group_id
    AND user_id = auth.uid();
END;
$$;

CREATE FUNCTION public.get_or_create_place(
  p_provider text,
  p_provider_place_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_place_id uuid;
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'active profile required';
  END IF;
  IF p_provider IS DISTINCT FROM 'google_maps'
    OR p_provider_place_id IS NULL
    OR length(trim(p_provider_place_id)) = 0
  THEN
    RAISE EXCEPTION 'invalid place identifier';
  END IF;

  INSERT INTO public.places (provider, provider_place_id)
  VALUES (p_provider, trim(p_provider_place_id))
  ON CONFLICT (provider, provider_place_id)
  DO UPDATE SET provider_place_id = EXCLUDED.provider_place_id
  RETURNING id INTO v_place_id;

  RETURN v_place_id;
END;
$$;

CREATE FUNCTION public.sync_plan_confirmation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.plans
    SET status = 'planning'
    WHERE id = OLD.plan_id;
    RETURN OLD;
  END IF;

  UPDATE public.plans
  SET status = 'confirmed'
  WHERE id = NEW.plan_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER plan_confirmations_sync_plan_status
  AFTER INSERT OR DELETE ON public.plan_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.sync_plan_confirmation_status();

CREATE FUNCTION public.set_group_invitation_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.created_at := now();
  NEW.expires_at := NEW.created_at + interval '7 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_invitations_set_expiry
  BEFORE INSERT ON public.group_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_group_invitation_expiry();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_job_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_date_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_date_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    (id = auth.uid() AND account_status = 'active')
    OR (account_status = 'active' AND public.is_group_peer(id))
  );
CREATE POLICY user_profiles_insert
  ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND account_status = 'active');
CREATE POLICY user_profiles_update
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND account_status = 'active')
  WITH CHECK (id = auth.uid() AND account_status = 'active');

CREATE POLICY groups_select
  ON public.groups FOR SELECT TO authenticated
  USING (public.is_group_member(id));
CREATE POLICY groups_update
  ON public.groups FOR UPDATE TO authenticated
  USING (public.is_group_admin(id))
  WITH CHECK (public.is_group_admin(id));

CREATE POLICY group_members_select
  ON public.group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY group_join_requests_select
  ON public.group_join_requests FOR SELECT TO authenticated
  USING (
    public.is_active_user()
    AND (user_id = auth.uid() OR public.is_group_admin(group_id))
  );

CREATE POLICY plans_select
  ON public.plans FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));
CREATE POLICY plans_insert
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND status = 'planning'
    AND public.is_group_member(group_id)
  );
CREATE POLICY plans_update
  ON public.plans FOR UPDATE TO authenticated
  USING (public.is_plan_creator(id) AND public.is_group_member(group_id))
  WITH CHECK (public.is_plan_creator(id) AND public.is_group_member(group_id));

CREATE POLICY plan_date_candidates_select
  ON public.plan_date_candidates FOR SELECT TO authenticated
  USING (public.is_plan_member(plan_id));
CREATE POLICY plan_date_candidates_insert
  ON public.plan_date_candidates FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_plan_member(plan_id)
    AND public.can_edit_plan(plan_id)
  );
CREATE POLICY plan_date_candidates_update
  ON public.plan_date_candidates FOR UPDATE TO authenticated
  USING (public.is_plan_member(plan_id) AND public.can_edit_plan(plan_id))
  WITH CHECK (public.is_plan_member(plan_id) AND public.can_edit_plan(plan_id));

CREATE POLICY plan_date_responses_select
  ON public.plan_date_responses FOR SELECT TO authenticated
  USING (public.is_plan_member(
    (SELECT candidate.plan_id
     FROM public.plan_date_candidates AS candidate
     WHERE candidate.id = candidate_id)
  ));
CREATE POLICY plan_date_responses_insert
  ON public.plan_date_responses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_respond_to_plan(
      (SELECT candidate.plan_id
       FROM public.plan_date_candidates AS candidate
       WHERE candidate.id = candidate_id)
    )
  );
CREATE POLICY plan_date_responses_update
  ON public.plan_date_responses FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.can_respond_to_plan(
      (SELECT candidate.plan_id
       FROM public.plan_date_candidates AS candidate
       WHERE candidate.id = candidate_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_respond_to_plan(
      (SELECT candidate.plan_id
       FROM public.plan_date_candidates AS candidate
       WHERE candidate.id = candidate_id)
    )
  );

CREATE POLICY places_select
  ON public.places FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_favorites AS favorite
      WHERE favorite.place_id = id
        AND public.is_group_member(favorite.group_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.plan_places AS plan_place
      WHERE plan_place.place_id = id
        AND public.is_plan_member(plan_place.plan_id)
    )
  );

CREATE POLICY group_favorites_select
  ON public.group_favorites FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));
CREATE POLICY group_favorites_insert
  ON public.group_favorites FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND public.is_group_member(group_id));
CREATE POLICY group_favorites_delete
  ON public.group_favorites FOR DELETE TO authenticated
  USING (
    public.is_group_member(group_id)
    AND (added_by = auth.uid() OR public.is_group_admin(group_id))
  );

CREATE POLICY plan_places_select
  ON public.plan_places FOR SELECT TO authenticated
  USING (public.is_plan_member(plan_id));
CREATE POLICY plan_places_insert
  ON public.plan_places FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND public.is_plan_member(plan_id)
    AND public.can_edit_plan(plan_id)
  );
CREATE POLICY plan_places_delete
  ON public.plan_places FOR DELETE TO authenticated
  USING (
    public.is_plan_member(plan_id)
    AND public.can_edit_plan(plan_id)
    AND (added_by = auth.uid() OR public.is_plan_creator(plan_id))
  );

CREATE POLICY plan_confirmations_select
  ON public.plan_confirmations FOR SELECT TO authenticated
  USING (public.is_plan_member(plan_id));
CREATE POLICY plan_confirmations_insert
  ON public.plan_confirmations FOR INSERT TO authenticated
  WITH CHECK (
    confirmed_by = auth.uid()
    AND public.is_plan_member(plan_id)
    AND EXISTS (
      SELECT 1 FROM public.plans AS plan
      WHERE plan.id = plan_id AND plan.status = 'planning'
    )
  );
CREATE POLICY plan_confirmations_update
  ON public.plan_confirmations FOR UPDATE TO authenticated
  USING (public.is_plan_creator(plan_id) AND public.is_plan_member(plan_id))
  WITH CHECK (public.is_plan_creator(plan_id) AND public.is_plan_member(plan_id));

CREATE POLICY plan_memories_select
  ON public.plan_memories FOR SELECT TO authenticated
  USING (public.is_plan_member(plan_id));
CREATE POLICY plan_memories_insert
  ON public.plan_memories FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_plan_member(plan_id));
CREATE POLICY plan_memories_update
  ON public.plan_memories FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND public.is_plan_member(plan_id))
  WITH CHECK (created_by = auth.uid() AND public.is_plan_member(plan_id));
CREATE POLICY plan_memories_delete
  ON public.plan_memories FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND public.is_plan_member(plan_id));

REVOKE ALL ON TABLE
  public.user_profiles,
  public.account_deletion_jobs,
  public.account_deletion_job_objects,
  public.groups,
  public.group_members,
  public.group_invitations,
  public.group_join_requests,
  public.plans,
  public.plan_date_candidates,
  public.plan_date_responses,
  public.places,
  public.group_favorites,
  public.plan_places,
  public.plan_confirmations,
  public.plan_memories
FROM anon, authenticated;

GRANT SELECT ON public.user_profiles TO authenticated;
GRANT INSERT (id, nickname) ON public.user_profiles TO authenticated;
GRANT UPDATE (nickname) ON public.user_profiles TO authenticated;
GRANT SELECT ON public.groups, public.group_members, public.group_join_requests TO authenticated;
GRANT UPDATE (name) ON public.groups TO authenticated;
GRANT SELECT ON public.plans TO authenticated;
GRANT INSERT (group_id, title, description, response_deadline)
  ON public.plans TO authenticated;
GRANT UPDATE (title, description, response_deadline) ON public.plans TO authenticated;
GRANT SELECT ON public.plan_date_candidates TO authenticated;
GRANT INSERT (plan_id, starts_at, ends_at) ON public.plan_date_candidates TO authenticated;
GRANT UPDATE (starts_at, ends_at) ON public.plan_date_candidates TO authenticated;
GRANT SELECT ON public.plan_date_responses TO authenticated;
GRANT INSERT (candidate_id, user_id, response) ON public.plan_date_responses TO authenticated;
GRANT UPDATE (response) ON public.plan_date_responses TO authenticated;
GRANT SELECT ON public.places TO authenticated;
GRANT SELECT, DELETE ON public.group_favorites TO authenticated;
GRANT INSERT (group_id, place_id) ON public.group_favorites TO authenticated;
GRANT SELECT, DELETE ON public.plan_places TO authenticated;
GRANT INSERT (plan_id, place_id) ON public.plan_places TO authenticated;
GRANT SELECT ON public.plan_confirmations TO authenticated;
GRANT INSERT (plan_id, date_candidate_id, place_id)
  ON public.plan_confirmations TO authenticated;
GRANT UPDATE (date_candidate_id, place_id) ON public.plan_confirmations TO authenticated;
GRANT SELECT, DELETE ON public.plan_memories TO authenticated;
GRANT INSERT (plan_id, content, storage_path) ON public.plan_memories TO authenticated;
GRANT UPDATE (content, storage_path) ON public.plan_memories TO authenticated;

GRANT ALL ON TABLE
  public.user_profiles,
  public.account_deletion_jobs,
  public.account_deletion_job_objects,
  public.groups,
  public.group_members,
  public.group_invitations,
  public.group_join_requests,
  public.plans,
  public.plan_date_candidates,
  public.plan_date_responses,
  public.places,
  public.group_favorites,
  public.plan_places,
  public.plan_confirmations,
  public.plan_memories
TO service_role;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_group_invitation_expiry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_plan_confirmation_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_peer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_plan_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_plan_creator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_respond_to_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_group_join_request(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_group_join_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_group_preference_learning_consent(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_or_create_place(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_peer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_plan_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_plan_creator(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_respond_to_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_group_join_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_group_join_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_preference_learning_consent(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_place(text, text) TO authenticated;
