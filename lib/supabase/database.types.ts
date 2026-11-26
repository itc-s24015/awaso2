type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      user_profiles: Table<
        {
          id: string;
          nickname: string;
          account_status: "active" | "deletion_pending";
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          nickname: string;
          account_status?: "active" | "deletion_pending";
          created_at?: string;
          updated_at?: string;
        }
      >;
      groups: Table<
        { id: string; name: string; created_at: string; updated_at: string },
        { id?: string; name: string; created_at?: string; updated_at?: string }
      >;
      group_members: Table<
        {
          group_id: string;
          user_id: string;
          role: "admin" | "member";
          joined_at: string;
          preference_learning_consented_at: string | null;
        },
        {
          group_id: string;
          user_id: string;
          role: "admin" | "member";
          joined_at?: string;
          preference_learning_consented_at?: string | null;
        }
      >;
      group_join_requests: Table<
        {
          id: string;
          group_id: string;
          invitation_id: string;
          user_id: string;
          status: "pending" | "approved" | "rejected";
          requested_at: string;
          decided_by: string | null;
          decided_at: string | null;
        },
        {
          id?: string;
          group_id: string;
          invitation_id: string;
          user_id: string;
          status?: "pending" | "approved" | "rejected";
          requested_at?: string;
          decided_by?: string | null;
          decided_at?: string | null;
        }
      >;
      plans: Table<
        {
          id: string;
          group_id: string;
          created_by: string;
          title: string;
          description: string | null;
          status: "planning" | "confirmed";
          response_deadline: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          group_id: string;
          created_by?: string;
          title: string;
          description?: string | null;
          status?: "planning" | "confirmed";
          response_deadline?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      plan_date_candidates: Table<
        {
          id: string;
          plan_id: string;
          created_by: string | null;
          starts_at: string;
          ends_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          plan_id: string;
          created_by?: string | null;
          starts_at: string;
          ends_at: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      plan_date_responses: Table<
        {
          candidate_id: string;
          user_id: string;
          response: "available" | "conditional" | "unavailable";
          updated_at: string;
        },
        {
          candidate_id: string;
          user_id: string;
          response: "available" | "conditional" | "unavailable";
          updated_at?: string;
        }
      >;
      places: Table<
        {
          id: string;
          provider: string;
          provider_place_id: string;
          created_at: string;
        },
        {
          id?: string;
          provider: string;
          provider_place_id: string;
          created_at?: string;
        }
      >;
      group_favorites: Table<
        {
          group_id: string;
          place_id: string;
          added_by: string | null;
          created_at: string;
        },
        {
          group_id: string;
          place_id: string;
          added_by?: string | null;
          created_at?: string;
        }
      >;
      notification_deliveries: Table<
        {
          id: string;
          user_id: string;
          plan_id: string | null;
          group_join_request_id: string | null;
          event_type: string;
          title: string;
          body: string;
          channel: "in_app" | "web_push";
          deduplication_key: string;
          status: "scheduled" | "sent" | "failed" | "cancelled";
          scheduled_at: string;
          sent_at: string | null;
          read_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          plan_id?: string | null;
          group_join_request_id?: string | null;
          event_type: string;
          title: string;
          body: string;
          channel: "in_app" | "web_push";
          deduplication_key: string;
          status: "scheduled" | "sent" | "failed" | "cancelled";
          scheduled_at?: string;
          sent_at?: string | null;
          read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_group: { Args: { p_name: string }; Returns: string };
      create_group_invitation: {
        Args: { p_group_id: string };
        Returns: { invitation_id: string; token: string; expires_at: string }[];
      };
      get_group_invitation_preview: {
        Args: { p_token: string };
        Returns: {
          group_id: string;
          group_name: string;
          expires_at: string;
          already_member: boolean;
        }[];
      };
      submit_group_join_request: { Args: { p_token: string }; Returns: string };
      decide_group_join_request: {
        Args: { p_request_id: string; p_approve: boolean };
        Returns: undefined;
      };
      get_or_create_place: {
        Args: { p_provider: string; p_provider_place_id: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
