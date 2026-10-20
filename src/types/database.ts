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
          pin_hash: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at?: string;
          pin_hash?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          created_at?: string;
          pin_hash?: string | null;
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
      study_boards: {
        Row: {
          id: string;
          room_id: string;
          name: string;
          position: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          name: string;
          position?: number;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          name?: string;
          position?: number;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      study_board_items: {
        Row: {
          id: string;
          room_id: string;
          board_id: string;
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
          board_id: string;
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
          board_id?: string;
          type?: string;
          data?: Json;
          created_by?: string;
          updated_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      study_chat_messages: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          display_name: string;
          color: string;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          display_name: string;
          color: string;
          text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          display_name?: string;
          color?: string;
          text?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      study_board_snapshots: {
        Row: {
          id: string;
          room_id: string;
          board_id: string;
          label: string;
          items_json: Json;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          board_id: string;
          label: string;
          items_json: Json;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          board_id?: string;
          label?: string;
          items_json?: Json;
          created_by?: string;
          created_at?: string;
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
          pin_hash: string | null;
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
          p_pin_hash?: string | null;
        };
        Returns: Json;
      };
      join_room: {
        Args: {
          p_room_id: string;
          p_user_id: string;
          p_display_name: string;
          p_color: string;
          p_pin?: string | null;
        };
        Returns: Json;
      };
      create_board: {
        Args: { p_room_id: string; p_name: string; p_user_id: string };
        Returns: Json;
      };
      restore_snapshot: {
        Args: { p_snapshot_id: string; p_user_id: string };
        Returns: Json;
      };
      set_room_pin: {
        Args: { p_room_id: string; p_user_id: string; p_pin_hash: string | null };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
