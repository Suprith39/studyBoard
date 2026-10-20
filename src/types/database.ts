// Supabase schema types — keep in sync with migrations.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      study_rooms: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      study_room_members: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          display_name: string;
          color: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          display_name: string;
          color: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          display_name?: string;
          color?: string;
          joined_at?: string;
        };
        Relationships: [];
      };
      study_board_items: {
        Row: {
          id: string;
          room_id: string;
          type: string;
          data: Json;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          type: string;
          data: Json;
          created_by: string;
          updated_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          type?: string;
          data?: Json;
          created_by?: string;
          updated_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_room_by_invite: {
        Args: { p_invite_code: string };
        Returns: Array<{
          id: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at: string;
        }>;
      };
      is_room_member: {
        Args: { p_room_id: string };
        Returns: boolean;
      };
      create_room: {
        Args: {
          p_name: string;
          p_invite_code: string;
          p_user_id: string;
          p_display_name: string;
          p_color: string;
        };
        Returns: Json;
      };
      join_room: {
        Args: {
          p_room_id: string;
          p_user_id: string;
          p_display_name: string;
          p_color: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
