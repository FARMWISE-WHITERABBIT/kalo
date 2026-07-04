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
      bot_config: {
        Row: {
          aggression: number
          burst_markets: number
          enabled: boolean
          id: number
          updated_at: string
        }
        Insert: {
          aggression?: number
          burst_markets?: number
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Update: {
          aggression?: number
          burst_markets?: number
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot_market_state: {
        Row: {
          heat: number
          market_id: string
          momentum: number
          shock_until: string | null
          target: number
          updated_at: string
        }
        Insert: {
          heat?: number
          market_id: string
          momentum?: number
          shock_until?: string | null
          target: number
          updated_at?: string
        }
        Update: {
          heat?: number
          market_id?: string
          momentum?: number
          shock_until?: string | null
          target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_market_state_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: true
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_traders: {
        Row: {
          created_at: string
          persona: string
          user_id: string
        }
        Insert: {
          created_at?: string
          persona?: string
          user_id: string
        }
        Update: {
          created_at?: string
          persona?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_traders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          category: string | null
          close_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          min_order_size: number
          question: string
          resolved_outcome: string | null
          status: string
          tick_size: number
        }
        Insert: {
          category?: string | null
          close_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          min_order_size?: number
          question: string
          resolved_outcome?: string | null
          status?: string
          tick_size?: number
        }
        Update: {
          category?: string | null
          close_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          min_order_size?: number
          question?: string
          resolved_outcome?: string | null
          status?: string
          tick_size?: number
        }
        Relationships: [
          {
            foreignKeyName: "markets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          filled_size: number
          id: string
          market_id: string
          outcome: string
          price: number
          side: string
          size: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filled_size?: number
          id?: string
          market_id: string
          outcome: string
          price: number
          side: string
          size: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filled_size?: number
          id?: string
          market_id?: string
          outcome?: string
          price?: number
          side?: string
          size?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          id: string
          market_id: string
          outcome: string
          shares: number
          user_id: string
        }
        Insert: {
          id?: string
          market_id: string
          outcome: string
          shares?: number
          user_id: string
        }
        Update: {
          id?: string
          market_id?: string
          outcome?: string
          shares?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          balance: number
          created_at: string
          display_name: string
          id: string
          is_admin: boolean
        }
        Insert: {
          balance?: number
          created_at?: string
          display_name: string
          id: string
          is_admin?: boolean
        }
        Update: {
          balance?: number
          created_at?: string
          display_name?: string
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string
          id: string
          is_seed: boolean
          kind: string | null
          maker_order_id: string | null
          market_id: string
          outcome: string
          price: number
          size: number
          taker_order_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_seed?: boolean
          kind?: string | null
          maker_order_id?: string | null
          market_id: string
          outcome: string
          price: number
          size: number
          taker_order_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_seed?: boolean
          kind?: string | null
          maker_order_id?: string | null
          market_id?: string
          outcome?: string
          price?: number
          size?: number
          taker_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_maker_order_id_fkey"
            columns: ["maker_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_taker_order_id_fkey"
            columns: ["taker_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bot_backfill: {
        Args: { p_days: number; p_market_id: string; p_trades: number }
        Returns: undefined
      }
      bot_burst: { Args: { p_rounds: number }; Returns: number }
      bot_command: {
        Args: { p_action: string; p_value?: number }
        Returns: Json
      }
      bot_impersonate: { Args: { p_user: string }; Returns: undefined }
      bot_provision: { Args: never; Returns: number }
      bot_status: { Args: never; Returns: Json }
      bot_tick: { Args: never; Returns: undefined }
      cancel_order: { Args: { p_order_id: string }; Returns: undefined }
      create_market: {
        Args: {
          p_category: string
          p_close_at: string
          p_description: string
          p_question: string
        }
        Returns: string
      }
      get_order_book: {
        Args: { p_market_id: string }
        Returns: {
          outcome: string
          price: number
          side: string
          size: number
        }[]
      }
      merge_shares: {
        Args: { p_market_id: string; p_shares: number }
        Returns: undefined
      }
      place_order: {
        Args: {
          p_ioc?: boolean
          p_market_id: string
          p_outcome: string
          p_price: number
          p_side: string
          p_size: number
        }
        Returns: string
      }
      redeem_market: { Args: { p_market_id: string }; Returns: undefined }
      resolve_market: {
        Args: { p_market_id: string; p_outcome: string }
        Returns: undefined
      }
      split_shares: {
        Args: { p_amount: number; p_market_id: string }
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
  public: {
    Enums: {},
  },
} as const
