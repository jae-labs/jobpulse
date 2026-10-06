export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      authorized_users: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          id: number
          invite_code: string | null
          invited_by: string | null
          role: string
          status: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          id?: number
          invite_code?: string | null
          invited_by?: string | null
          role?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          id?: number
          invite_code?: string | null
          invited_by?: string | null
          role?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      boards: {
        Row: {
          board: string
          careers_url: string
          company: string
          consecutive_failures: number
          cooldown_until: string | null
          created_at: string
          discovery_source: string
          employer_id: number | null
          enabled: boolean
          id: number
          last_crawled_at: string | null
          last_error: string | null
          last_ingested_count: number
          last_verified_at: string | null
          metadata: Json
          priority: number
          provider: string
          region: string
          sector: string
          status: string
          updated_at: string
        }
        Insert: {
          board: string
          careers_url: string
          company: string
          consecutive_failures?: number
          cooldown_until?: string | null
          created_at?: string
          discovery_source?: string
          employer_id?: number | null
          enabled?: boolean
          id?: number
          last_crawled_at?: string | null
          last_error?: string | null
          last_ingested_count?: number
          last_verified_at?: string | null
          metadata?: Json
          priority?: number
          provider: string
          region?: string
          sector?: string
          status?: string
          updated_at?: string
        }
        Update: {
          board?: string
          careers_url?: string
          company?: string
          consecutive_failures?: number
          cooldown_until?: string | null
          created_at?: string
          discovery_source?: string
          employer_id?: number | null
          enabled?: boolean
          id?: number
          last_crawled_at?: string | null
          last_error?: string | null
          last_ingested_count?: number
          last_verified_at?: string | null
          metadata?: Json
          priority?: number
          provider?: string
          region?: string
          sector?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_scoring_work: {
        Row: {
          attempts: number
          catalog_generation: number
          completed_catalog_generation: number
          completed_fingerprint: string
          completed_revision: number
          cursor: number
          desired_revision: number
          fingerprint: string
          job_ids: number[] | null
          last_error_code: string | null
          needs_embedding: boolean
          retry_at: string
          shortlist_ids: number[] | null
          state: string
          top_k: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          catalog_generation?: number
          completed_catalog_generation?: number
          completed_fingerprint?: string
          completed_revision?: number
          cursor?: number
          desired_revision?: number
          fingerprint: string
          job_ids?: number[] | null
          last_error_code?: string | null
          needs_embedding?: boolean
          retry_at?: string
          shortlist_ids?: number[] | null
          state?: string
          top_k?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          catalog_generation?: number
          completed_catalog_generation?: number
          completed_fingerprint?: string
          completed_revision?: number
          cursor?: number
          desired_revision?: number
          fingerprint?: string
          job_ids?: number[] | null
          last_error_code?: string | null
          needs_embedding?: boolean
          retry_at?: string
          shortlist_ids?: number[] | null
          state?: string
          top_k?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalog_stats: {
        Row: {
          computed_at: string
          id: boolean
          is_valid: boolean
          job_count: number
          locations: Json
          sectors: Json
        }
        Insert: {
          computed_at?: string
          id?: boolean
          is_valid?: boolean
          job_count?: number
          locations?: Json
          sectors?: Json
        }
        Update: {
          computed_at?: string
          id?: boolean
          is_valid?: boolean
          job_count?: number
          locations?: Json
          sectors?: Json
        }
        Relationships: []
      }
      employer_office_lookups: {
        Row: {
          checked_at: string
          employer_id: number
          employer_name: string
          location: string
          office_place_ids: Json
          retry_after: string
          status: string
        }
        Insert: {
          checked_at?: string
          employer_id: number
          employer_name: string
          location: string
          office_place_ids?: Json
          retry_after: string
          status: string
        }
        Update: {
          checked_at?: string
          employer_id?: number
          employer_name?: string
          location?: string
          office_place_ids?: Json
          retry_after?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employer_office_lookups_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      employer_offices: {
        Row: {
          address: string
          categories: Json
          checked_at: string
          city: string | null
          country_code: string | null
          employer_id: number
          latitude: number
          longitude: number
          name: string
          place_id: string
          source: string
          website: string | null
          website_domain: string | null
        }
        Insert: {
          address: string
          categories?: Json
          checked_at?: string
          city?: string | null
          country_code?: string | null
          employer_id: number
          latitude: number
          longitude: number
          name: string
          place_id: string
          source?: string
          website?: string | null
          website_domain?: string | null
        }
        Update: {
          address?: string
          categories?: Json
          checked_at?: string
          city?: string | null
          country_code?: string | null
          employer_id?: number
          latitude?: number
          longitude?: number
          name?: string
          place_id?: string
          source?: string
          website?: string | null
          website_domain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employer_offices_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      employers: {
        Row: {
          careers_url: string
          description: string | null
          discovered_jobs_url: string | null
          enriched_at: string | null
          id: number
          last_scraped_at: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          metadata_source: string
          name: string
          opportunities_found: number | null
          priority: number
          sector: string
          size: string | null
          status: string | null
          website: string | null
        }
        Insert: {
          careers_url: string
          description?: string | null
          discovered_jobs_url?: string | null
          enriched_at?: string | null
          id?: number
          last_scraped_at?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          metadata_source?: string
          name: string
          opportunities_found?: number | null
          priority?: number
          sector: string
          size?: string | null
          status?: string | null
          website?: string | null
        }
        Update: {
          careers_url?: string
          description?: string | null
          discovered_jobs_url?: string | null
          enriched_at?: string | null
          id?: number
          last_scraped_at?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          metadata_source?: string
          name?: string
          opportunities_found?: number | null
          priority?: number
          sector?: string
          size?: string | null
          status?: string | null
          website?: string | null
        }
        Relationships: []
      }
      job_scoring_embeddings: {
        Row: {
          content_hash: string
          embedding: string
          job_id: number
          model_version: string
        }
        Insert: {
          content_hash: string
          embedding: string
          job_id: number
          model_version: string
        }
        Update: {
          content_hash?: string
          embedding?: string
          job_id?: number
          model_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_scoring_embeddings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          closed_at: string | null
          closed_reason: string | null
          company: string
          coordinate_source: string | null
          dedupe_key: string
          description: string
          employer_id: number | null
          employment_type: string
          first_seen_at: string | null
          id: number
          last_seen_at: string | null
          latitude: number | null
          location: string
          location_verification: Json | null
          longitude: number | null
          salary_currency: string | null
          salary_max_amount: number | null
          salary_min_amount: number | null
          salary_period: string | null
          salary_text: string | null
          source: string
          title: string
          url: string
        }
        Insert: {
          closed_at?: string | null
          closed_reason?: string | null
          company: string
          coordinate_source?: string | null
          dedupe_key: string
          description: string
          employer_id?: number | null
          employment_type?: string
          first_seen_at?: string | null
          id?: number
          last_seen_at?: string | null
          latitude?: number | null
          location?: string
          location_verification?: Json | null
          longitude?: number | null
          salary_currency?: string | null
          salary_max_amount?: number | null
          salary_min_amount?: number | null
          salary_period?: string | null
          salary_text?: string | null
          source: string
          title: string
          url: string
        }
        Update: {
          closed_at?: string | null
          closed_reason?: string | null
          company?: string
          coordinate_source?: string | null
          dedupe_key?: string
          description?: string
          employer_id?: number | null
          employment_type?: string
          first_seen_at?: string | null
          id?: number
          last_seen_at?: string | null
          latitude?: number | null
          location?: string
          location_verification?: Json | null
          longitude?: number | null
          salary_currency?: string | null
          salary_max_amount?: number | null
          salary_min_amount?: number | null
          salary_period?: string | null
          salary_text?: string | null
          source?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_scoring_embeddings: {
        Row: {
          content_hash: string
          embedding: string
          model_version: string
          user_id: string
        }
        Insert: {
          content_hash: string
          embedding: string
          model_version: string
          user_id: string
        }
        Update: {
          content_hash?: string
          embedding?: string
          model_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_scoring_embeddings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      scoring_catalog_generation: {
        Row: {
          generation: number
          id: boolean
        }
        Insert: {
          generation?: number
          id?: boolean
        }
        Update: {
          generation?: number
          id?: boolean
        }
        Relationships: []
      }
      sources: {
        Row: {
          detail: string | null
          id: number
          last_status: string
          last_synced_at: string | null
          mode: string
          name: string
          opportunities_found: number | null
          url: string
        }
        Insert: {
          detail?: string | null
          id?: number
          last_status?: string
          last_synced_at?: string | null
          mode?: string
          name: string
          opportunities_found?: number | null
          url: string
        }
        Update: {
          detail?: string | null
          id?: number
          last_status?: string
          last_synced_at?: string | null
          mode?: string
          name?: string
          opportunities_found?: number | null
          url?: string
        }
        Relationships: []
      }
      user_cover_letters: {
        Row: {
          description: string | null
          file_name: string
          file_size: number
          id: number
          mime_type: string
          storage_path: string | null
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          description?: string | null
          file_name: string
          file_size?: number
          id?: number
          mime_type?: string
          storage_path?: string | null
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          description?: string | null
          file_name?: string
          file_size?: number
          id?: number
          mime_type?: string
          storage_path?: string | null
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_cvs: {
        Row: {
          description: string | null
          file_name: string
          file_size: number
          id: number
          mime_type: string
          storage_path: string | null
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          description?: string | null
          file_name: string
          file_size?: number
          id?: number
          mime_type?: string
          storage_path?: string | null
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          description?: string | null
          file_name?: string
          file_size?: number
          id?: number
          mime_type?: string
          storage_path?: string | null
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_job_evaluations: {
        Row: {
          ai_analysis: Json | null
          calculated_at: string | null
          fit_tier: string
          id: number
          job_id: number
          matched_skills: Json
          relevance: number
          scoring_job_hash: string | null
          scoring_profile_hash: string | null
          scoring_version: string | null
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          calculated_at?: string | null
          fit_tier?: string
          id?: number
          job_id: number
          matched_skills?: Json
          relevance?: number
          scoring_job_hash?: string | null
          scoring_profile_hash?: string | null
          scoring_version?: string | null
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          calculated_at?: string | null
          fit_tier?: string
          id?: number
          job_id?: number
          matched_skills?: Json
          relevance?: number
          scoring_job_hash?: string | null
          scoring_profile_hash?: string | null
          scoring_version?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_job_evaluations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_job_statuses: {
        Row: {
          id: number
          is_saved: boolean
          job_id: number
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: number
          is_saved?: boolean
          job_id: number
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: number
          is_saved?: boolean
          job_id?: number
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_job_statuses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          certifications: string | null
          created_at: string | null
          current_company: string | null
          current_role: string
          education: string
          employment: string
          experience_level: string | null
          first_name: string | null
          gender: string | null
          headline: string
          id: number
          keywords: string[] | null
          languages: string[] | null
          last_name: string | null
          linkedin_url: string | null
          location: string
          name: string
          phone: string | null
          salary_min: number
          scoring_rules: Json | null
          summary: string
          target_locations: string[] | null
          target_roles: string[] | null
          tools_software: string[] | null
          updated_at: string | null
          user_id: string
          work_authorization: string | null
          work_mode: string | null
        }
        Insert: {
          avatar_url?: string | null
          certifications?: string | null
          created_at?: string | null
          current_company?: string | null
          current_role?: string
          education?: string
          employment?: string
          experience_level?: string | null
          first_name?: string | null
          gender?: string | null
          headline?: string
          id?: number
          keywords?: string[] | null
          languages?: string[] | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string
          name?: string
          phone?: string | null
          salary_min?: number
          scoring_rules?: Json | null
          summary?: string
          target_locations?: string[] | null
          target_roles?: string[] | null
          tools_software?: string[] | null
          updated_at?: string | null
          user_id: string
          work_authorization?: string | null
          work_mode?: string | null
        }
        Update: {
          avatar_url?: string | null
          certifications?: string | null
          created_at?: string | null
          current_company?: string | null
          current_role?: string
          education?: string
          employment?: string
          experience_level?: string | null
          first_name?: string | null
          gender?: string | null
          headline?: string
          id?: number
          keywords?: string[] | null
          languages?: string[] | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string
          name?: string
          phone?: string | null
          salary_min?: number
          scoring_rules?: Json | null
          summary?: string
          target_locations?: string[] | null
          target_roles?: string[] | null
          tools_software?: string[] | null
          updated_at?: string | null
          user_id?: string
          work_authorization?: string | null
          work_mode?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_job_location_verifications: {
        Args: { p_records: Json }
        Returns: Json
      }
      close_stale_jobs: {
        Args: { p_grace_days?: number; p_limit?: number }
        Returns: number
      }
      create_invitation: { Args: { target_email: string }; Returns: Json }
      delete_invitation: { Args: { invitation_id: number }; Returns: Json }
      enqueue_candidate_scoring: {
        Args: { p_top_k?: number; p_user_id: string }
        Returns: undefined
      }
      fit_tier_for_score: { Args: { p_score: number }; Returns: string }
      get_job_map: {
        Args: {
          p_bounds?: number[]
          p_location?: string
          p_min_match?: number
          p_salary?: string
          p_search?: string
          p_sector?: string
          p_status?: string
          p_zoom?: number
        }
        Returns: Json
      }
      get_jobs_page: {
        Args: {
          p_limit?: number
          p_location?: string
          p_min_match?: number
          p_offset?: number
          p_salary?: string
          p_search?: string
          p_sector?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: Json
      }
      get_overview_metrics: { Args: never; Returns: Json }
      get_profile_embedding_state: { Args: never; Returns: Json }
      is_authorized_user: { Args: never; Returns: boolean }
      jobpulse_catalog_sectors: {
        Args: never
        Returns: {
          employer_id: number
          sector: string
        }[]
      }
      jobpulse_has_literal_skill: {
        Args: { p_skill: string; p_text: string }
        Returns: boolean
      }
      jobpulse_literal_search_pattern: {
        Args: { input: string }
        Returns: string
      }
      jobpulse_sector_group: { Args: { p_sector: string }; Returns: string }
      merge_duplicate_catalog_jobs: {
        Args: {
          p_dedupe_key: string
          p_duplicate_ids: number[]
          p_keeper_id: number
        }
        Returns: number
      }
      owns_document_object: { Args: { object_name: string }; Returns: boolean }
      pending_employer_office_lookups: {
        Args: { p_limit?: number }
        Returns: Json
      }
      process_candidate_scoring: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      process_candidate_scoring_queue: {
        Args: { p_max_slices?: number }
        Returns: number
      }
      prune_stale_catalog_jobs: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      record_board_outcome: {
        Args: {
          p_board_id: number
          p_error?: string
          p_found?: number
          p_ingested?: number
          p_success: boolean
        }
        Returns: undefined
      }
      refresh_catalog_stats: { Args: never; Returns: undefined }
      rescore_user: {
        Args: { p_top_k?: number; p_user_id: string }
        Returns: number
      }
      save_employer_office_lookup: {
        Args: { p_record: Json }
        Returns: boolean
      }
      save_profile_embedding: {
        Args: {
          p_content_hash: string
          p_embedding: string
          p_model_version: string
        }
        Returns: undefined
      }
      save_profile_embedding_guarded: {
        Args: {
          p_content_hash: string
          p_embedding: string
          p_expected_user_id: string
          p_model_version: string
          p_profile_snapshot: Json
        }
        Returns: undefined
      }
      score_from_subscores: { Args: { s: Json; w: Json }; Returns: number }
      score_job_for_user: {
        Args: { p_job_id: number; p_similarity: number; p_user_id: string }
        Returns: undefined
      }
      set_job_saved: {
        Args: { p_job_id: number; p_saved: boolean }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

