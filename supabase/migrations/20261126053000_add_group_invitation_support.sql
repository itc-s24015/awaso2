BEGIN;

CREATE TABLE public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles (id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans (id) ON DELETE CASCADE,
  group_join_request_id uuid REFERENCES public.group_join_requests (id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (length(trim(event_type)) > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  channel text NOT NULL CHECK (channel IN ('in_app', 'web_push')),
  deduplication_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deduplication_key, channel),
  CHECK ((status = 'sent' AND sent_at IS NOT NULL) OR status <> 'sent'),
  CHECK (channel = 'in_app' OR read_at IS NULL)
);

CREATE INDEX notification_deliveries_by_user
  ON public.notification_deliveries (user_id, created_at DESC);
CREATE INDEX notification_deliveries_by_join_request
  ON public.notification_deliveries (group_join_request_id);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select_pending_applicant_for_admin
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    account_status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.group_join_requests AS request
      WHERE request.user_id = user_profiles.id
        AND request.status = 'pending'
        AND public.is_group_admin(request.group_id)
    )
  );

CREATE POLICY notification_deliveries_select
  ON public.notification_deliveries FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user());
CREATE POLICY notification_deliveries_update
  ON public.notification_deliveries FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND channel = 'in_app'
    AND public.is_active_user()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND channel = 'in_app'
    AND public.is_active_user()
  );

CREATE TRIGGER notification_deliveries_touch_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE FUNCTION public.get_group_invitation_preview(p_token text)
RETURNS TABLE (
  group_id uuid,
  group_name text,
  expires_at timestamptz,
  already_member boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, extensions, pg_temp
AS $$
  SELECT
    invitation.group_id,
    group_record.name,
    invitation.expires_at,
    public.is_group_member(invitation.group_id)
  FROM public.group_invitations AS invitation
  JOIN public.groups AS group_record ON group_record.id = invitation.group_id
  WHERE p_token ~ '^[0-9a-f]{64}$'
    AND invitation.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

CREATE FUNCTION public.create_group_join_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_group_name text;
  v_applicant_nickname text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT membership.user_id, group_record.name, profile.nickname
    INTO v_admin_id, v_group_name, v_applicant_nickname
    FROM public.group_members AS membership
    JOIN public.groups AS group_record ON group_record.id = membership.group_id
    JOIN public.user_profiles AS profile ON profile.id = NEW.user_id
    WHERE membership.group_id = NEW.group_id
      AND membership.role = 'admin';

    IF v_admin_id IS NOT NULL THEN
      INSERT INTO public.notification_deliveries (
        user_id,
        group_join_request_id,
        event_type,
        title,
        body,
        channel,
        deduplication_key,
        status,
        scheduled_at,
        sent_at
      )
      VALUES (
        v_admin_id,
        NEW.id,
        'join_request_received',
        'グループ参加申請',
        format('%sさんが「%s」への参加を申請しました。', v_applicant_nickname, v_group_name),
        'in_app',
        v_admin_id::text || ':join_request_received:' || NEW.id::text,
        'sent',
        now(),
        now()
      )
      ON CONFLICT (deduplication_key, channel) DO NOTHING;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending'
      AND NEW.status IN ('approved', 'rejected') THEN
    SELECT group_record.name
    INTO v_group_name
    FROM public.groups AS group_record
    WHERE group_record.id = NEW.group_id;

    INSERT INTO public.notification_deliveries (
      user_id,
      group_join_request_id,
      event_type,
      title,
      body,
      channel,
      deduplication_key,
      status,
      scheduled_at,
      sent_at
    )
    VALUES (
      NEW.user_id,
      NEW.id,
      'join_request_decided',
      CASE
        WHEN NEW.status = 'approved' THEN 'グループ参加申請が承認されました'
        ELSE 'グループ参加申請が拒否されました'
      END,
      format(
        '「%s」への参加申請が%sされました。',
        v_group_name,
        CASE WHEN NEW.status = 'approved' THEN '承認' ELSE '拒否' END
      ),
      'in_app',
      NEW.user_id::text || ':join_request_decided:' || NEW.id::text,
      'sent',
      now(),
      now()
    )
    ON CONFLICT (deduplication_key, channel) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER group_join_requests_notify_admin
  AFTER INSERT ON public.group_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.create_group_join_request_notification();
CREATE TRIGGER group_join_requests_notify_applicant
  AFTER UPDATE OF status ON public.group_join_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.create_group_join_request_notification();

REVOKE ALL ON TABLE public.notification_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notification_deliveries TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.notification_deliveries TO authenticated;

REVOKE ALL ON FUNCTION public.get_group_invitation_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_invitation_preview(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.create_group_join_request_notification()
  FROM PUBLIC, anon, authenticated;

COMMIT;
