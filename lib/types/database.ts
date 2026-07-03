export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      markets: {
        Row: {
          category: string | null
          close_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          question: string
          resolved_outcome: string | null
          status: string
        }
        Insert: {
          category?: string | null
          close_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          question: string
          resolved_outcome?: string | null
          status?: string
        }
        Update: {
          category?: string | null
          close_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          question?: string
          resolved_outcome?: string | null
          status?: string
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
