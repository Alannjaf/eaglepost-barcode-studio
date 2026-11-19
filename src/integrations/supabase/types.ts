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
  public: {
    Tables: {
      folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          parent_folder_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          parent_folder_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_folder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_barcodes: {
        Row: {
          batch_name: string | null
          code: string
          created_at: string
          id: string
          ondi_batch_id: string | null
          project_id: string | null
          used: boolean
          used_synced_at: string | null
        }
        Insert: {
          batch_name?: string | null
          code: string
          created_at?: string
          id?: string
          ondi_batch_id?: string | null
          project_id?: string | null
          used?: boolean
          used_synced_at?: string | null
        }
        Update: {
          batch_name?: string | null
          code?: string
          created_at?: string
          id?: string
          ondi_batch_id?: string | null
          project_id?: string | null
          used?: boolean
          used_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_barcodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      history_items: {
        Row: {
          applied_pages: number[] | null
          apply_to_all_pages: boolean | null
          barcode_type: string | null
          barcode_value: string | null
          created_at: string
          design_file_id: string | null
          design_file_name: string | null
          export_file_id: string | null
          fit_to_page: boolean | null
          font_family: string | null
          font_size: number | null
          height_mm: number | null
          id: string
          page_height_mm: number | null
          page_size_preset: string | null
          page_width_mm: number | null
          pages: number | null
          pos_x_mm: number | null
          pos_y_mm: number | null
          project_id: string
          quiet_zone_mm: number | null
          rotation: number | null
          sequence_start: string | null
          show_text: boolean | null
          snapshot: Json | null
          timestamp: number
          width_mm: number | null
        }
        Insert: {
          applied_pages?: number[] | null
          apply_to_all_pages?: boolean | null
          barcode_type?: string | null
          barcode_value?: string | null
          created_at?: string
          design_file_id?: string | null
          design_file_name?: string | null
          export_file_id?: string | null
          fit_to_page?: boolean | null
          font_family?: string | null
          font_size?: number | null
          height_mm?: number | null
          id?: string
          page_height_mm?: number | null
          page_size_preset?: string | null
          page_width_mm?: number | null
          pages?: number | null
          pos_x_mm?: number | null
          pos_y_mm?: number | null
          project_id: string
          quiet_zone_mm?: number | null
          rotation?: number | null
          sequence_start?: string | null
          show_text?: boolean | null
          snapshot?: Json | null
          timestamp: number
          width_mm?: number | null
        }
        Update: {
          applied_pages?: number[] | null
          apply_to_all_pages?: boolean | null
          barcode_type?: string | null
          barcode_value?: string | null
          created_at?: string
          design_file_id?: string | null
          design_file_name?: string | null
          export_file_id?: string | null
          fit_to_page?: boolean | null
          font_family?: string | null
          font_size?: number | null
          height_mm?: number | null
          id?: string
          page_height_mm?: number | null
          page_size_preset?: string | null
          page_width_mm?: number | null
          pages?: number | null
          pos_x_mm?: number | null
          pos_y_mm?: number | null
          project_id?: string
          quiet_zone_mm?: number | null
          rotation?: number | null
          sequence_start?: string | null
          show_text?: boolean | null
          snapshot?: Json | null
          timestamp?: number
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "history_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          created_at: string
          file_id: string
          file_name: string
          id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          file_name: string
          id?: string
          project_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          file_name?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          branch_name: string | null
          created_at: string
          current_design_file_id: string | null
          folder_id: string | null
          id: string
          institution_name: string | null
          is_template: boolean
          name: string
          next_code: string
          notes: string | null
          ondi_batch_id: string | null
          printed_at: string | null
          settings: Json | null
          sort_order: number | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          branch_name?: string | null
          created_at?: string
          current_design_file_id?: string | null
          folder_id?: string | null
          id?: string
          institution_name?: string | null
          is_template?: boolean
          name: string
          next_code?: string
          notes?: string | null
          ondi_batch_id?: string | null
          printed_at?: string | null
          settings?: Json | null
          sort_order?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          branch_name?: string | null
          created_at?: string
          current_design_file_id?: string | null
          folder_id?: string | null
          id?: string
          institution_name?: string | null
          is_template?: boolean
          name?: string
          next_code?: string
          notes?: string | null
          ondi_batch_id?: string | null
          printed_at?: string | null
          settings?: Json | null
          sort_order?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_barcode_search_data: {
        Args: never
        Returns: {
          barcode_type: string
          imported_count: number
          next_code: string
          project_id: string
          project_name: string
        }[]
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
  public: {
    Enums: {},
  },
} as const
