export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
          created_at: string | null
          email: string
          id: number
          role: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: number
          role?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: number
          role?: string
        }
        Relationships: []
      }
      employers: {
        Row: {
          careers_url: string
          discovered_jobs_url: string | null
          id: number
          last_scraped_at: string | null
          name: string
          priority: number
          sector: string
          status: string | null
          vacancies_found: number | null
        }
        Insert: {
          careers_url: string
          discovered_jobs_url?: string | null
          id?: number
          last_scraped_at?: string | null
          name: string
          priority?: number
          sector: string
          status?: string | null
          vacancies_found?: number | null
        }
        Update: {
          careers_url?: string
          discovered_jobs_url?: string | null
          id?: number
          last_scraped_at?: string | null
          name?: string
          priority?: number
          sector?: string
          status?: string | null
          vacancies_found?: number | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          ai_analysis: Json | null
          company: string
          dedupe_key: string
          description: string
          employment_type: string
          first_seen_at: string | null
          fit_tier: string | null
          id: number
          last_seen_at: string | null
          location: string
          matched_skills: Json
          relevance: number
          role_domain: string | null
          salary_text: string | null
          seniority_level: string | null
          source: string
          status: string
          title: string
          url: string
        }
        Insert: {
          ai_analysis?: Json | null
          company: string
          dedupe_key: string
          description: string
          employment_type?: string
          first_seen_at?: string | null
          fit_tier?: string | null
          id?: number
          last_seen_at?: string | null
          location?: string
          matched_skills?: Json
          relevance?: number
          role_domain?: string | null
          salary_text?: string | null
          seniority_level?: string | null
          source: string
          status?: string
          title: string
          url: string
        }
        Update: {
          ai_analysis?: Json | null
          company?: string
          dedupe_key?: string
          description?: string
          employment_type?: string
          first_seen_at?: string | null
          fit_tier?: string | null
          id?: number
          last_seen_at?: string | null
          location?: string
          matched_skills?: Json
          relevance?: number
          role_domain?: string | null
          salary_text?: string | null
          seniority_level?: string | null
          source?: string
          status?: string
          title?: string
          url?: string
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
          url: string
          vacancies_found: number | null
        }
        Insert: {
          detail?: string | null
          id?: number
          last_status?: string
          last_synced_at?: string | null
          mode?: string
          name: string
          url: string
          vacancies_found?: number | null
        }
        Update: {
          detail?: string | null
          id?: number
          last_status?: string
          last_synced_at?: string | null
          mode?: string
          name?: string
          url?: string
          vacancies_found?: number | null
        }
        Relationships: []
      }
      user_cvs: {
        Row: {
          file_data: string
          file_name: string
          file_size: number
          id: number
          mime_type: string
          uploaded_at: string | null
          user_email: string
        }
        Insert: {
          file_data: string
          file_name: string
          file_size?: number
          id?: number
          mime_type?: string
          uploaded_at?: string | null
          user_email: string
        }
        Update: {
          file_data?: string
          file_name?: string
          file_size?: number
          id?: number
          mime_type?: string
          uploaded_at?: string | null
          user_email?: string
        }
        Relationships: []
      }
      user_job_statuses: {
        Row: {
          id: number
          job_id: number
          status: string
          updated_at: string | null
          user_email: string
        }
        Insert: {
          id?: number
          job_id: number
          status?: string
          updated_at?: string | null
          user_email: string
        }
        Update: {
          id?: number
          job_id?: number
          status?: string
          updated_at?: string | null
          user_email?: string
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
          certifications: string | null
          created_at: string | null
          current_company: string | null
          current_role: string
          education: string
          education_details: string | null
          employment: string
          experience_level: string | null
          first_name: string | null
          gender: string | null
          headline: string
          highest_education: string | null
          id: number
          keywords: string[] | null
          languages: string[] | null
          last_name: string | null
          linkedin_url: string | null
          location: string
          minimum_salary: number
          name: string
          phone: string | null
          salary_max: number | null
          salary_min: number | null
          summary: string
          target_locations: string[] | null
          target_roles: string[] | null
          tools_software: string[] | null
          updated_at: string | null
          user_email: string
          work_authorization: string | null
          work_mode: string | null
          years_of_experience: string | null
        }
        Insert: {
          certifications?: string | null
          created_at?: string | null
          current_company?: string | null
          current_role?: string
          education?: string
          education_details?: string | null
          employment?: string
          experience_level?: string | null
          first_name?: string | null
          gender?: string | null
          headline?: string
          highest_education?: string | null
          id?: number
          keywords?: string[] | null
          languages?: string[] | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string
          minimum_salary?: number
          name?: string
          phone?: string | null
          salary_max?: number | null
          salary_min?: number | null
          summary?: string
          target_locations?: string[] | null
          target_roles?: string[] | null
          tools_software?: string[] | null
          updated_at?: string | null
          user_email: string
          work_authorization?: string | null
          work_mode?: string | null
          years_of_experience?: string | null
        }
        Update: {
          certifications?: string | null
          created_at?: string | null
          current_company?: string | null
          current_role?: string
          education?: string
          education_details?: string | null
          employment?: string
          experience_level?: string | null
          first_name?: string | null
          gender?: string | null
          headline?: string
          highest_education?: string | null
          id?: number
          keywords?: string[] | null
          languages?: string[] | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string
          minimum_salary?: number
          name?: string
          phone?: string | null
          salary_max?: number | null
          salary_min?: number | null
          summary?: string
          target_locations?: string[] | null
          target_roles?: string[] | null
          tools_software?: string[] | null
          updated_at?: string | null
          user_email?: string
          work_authorization?: string | null
          work_mode?: string | null
          years_of_experience?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_authorized_user: { Args: never; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
