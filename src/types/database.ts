export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MachineStatus = "pending" | "in_production" | "finished" | "shipped";

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          name: string;
          magic_link_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          magic_link_token?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          magic_link_token?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      colors: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      equipment_catalog: {
        Row: {
          id: string;
          code: string;
          name: string;
          line: string | null;
          default_price_cop: number | null;
          is_custom: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          line?: string | null;
          default_price_cop?: number | null;
          is_custom?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          line?: string | null;
          default_price_cop?: number | null;
          is_custom?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      equipment_previos: {
        Row: {
          id: string;
          equipment_id: string;
          previo_catalog_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          previo_catalog_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          previo_catalog_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      holidays: {
        Row: {
          date: string;
          name: string;
          is_custom: boolean;
        };
        Insert: {
          date: string;
          name: string;
          is_custom?: boolean;
        };
        Update: {
          date?: string;
          name?: string;
          is_custom?: boolean;
        };
        Relationships: [];
      };
      machine_stages: {
        Row: {
          id: string;
          machine_id: string;
          stage_id: number;
          completion: number;
          last_worker_id: string | null;
          last_updated_at: string | null;
        };
        Insert: {
          id?: string;
          machine_id: string;
          stage_id: number;
          completion?: number;
          last_worker_id?: string | null;
          last_updated_at?: string | null;
        };
        Update: {
          id?: string;
          machine_id?: string;
          stage_id?: number;
          completion?: number;
          last_worker_id?: string | null;
          last_updated_at?: string | null;
        };
        Relationships: [];
      };
      machine_previo_events: {
        Row: {
          id: string;
          machine_previo_id: string | null;
          machine_id: string;
          previo_catalog_id: string;
          event_type: "ordered_checked" | "ordered_unchecked" | "received_checked" | "received_unchecked";
          actor_profile_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          machine_previo_id?: string | null;
          machine_id: string;
          previo_catalog_id: string;
          event_type: "ordered_checked" | "ordered_unchecked" | "received_checked" | "received_unchecked";
          actor_profile_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          machine_previo_id?: string | null;
          machine_id?: string;
          previo_catalog_id?: string;
          event_type?: "ordered_checked" | "ordered_unchecked" | "received_checked" | "received_unchecked";
          actor_profile_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      machine_previos: {
        Row: {
          id: string;
          machine_id: string;
          previo_catalog_id: string;
          ordered: boolean;
          ordered_at: string | null;
          ordered_by: string | null;
          received: boolean;
          received_at: string | null;
          received_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          machine_id: string;
          previo_catalog_id: string;
          ordered?: boolean;
          ordered_at?: string | null;
          ordered_by?: string | null;
          received?: boolean;
          received_at?: string | null;
          received_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          machine_id?: string;
          previo_catalog_id?: string;
          ordered?: boolean;
          ordered_at?: string | null;
          ordered_by?: string | null;
          received?: boolean;
          received_at?: string | null;
          received_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      machines: {
        Row: {
          id: string;
          coti_number: number;
          client_id: string;
          equipment_id: string | null;
          custom_equipment_name: string | null;
          color_id: string | null;
          city: string | null;
          line_override: string | null;
          sale_price_cop: number;
          assigned_to: string | null;
          promised_date: string;
          order_position: number;
          status: MachineStatus;
          shipped_at: string | null;
          production_started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          coti_number: number;
          client_id: string;
          equipment_id?: string | null;
          custom_equipment_name?: string | null;
          color_id?: string | null;
          city?: string | null;
          line_override?: string | null;
          sale_price_cop: number;
          assigned_to?: string | null;
          promised_date: string;
          order_position: number;
          status?: MachineStatus;
          shipped_at?: string | null;
          production_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          coti_number?: number;
          client_id?: string;
          equipment_id?: string | null;
          custom_equipment_name?: string | null;
          color_id?: string | null;
          city?: string | null;
          line_override?: string | null;
          sale_price_cop?: number;
          assigned_to?: string | null;
          promised_date?: string;
          order_position?: number;
          status?: MachineStatus;
          shipped_at?: string | null;
          production_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      machine_warranty_events: {
        Row: {
          id: string;
          machine_id: string;
          coti_number: number;
          message: string;
          actor_profile_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          machine_id: string;
          coti_number: number;
          message: string;
          actor_profile_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          machine_id?: string;
          coti_number?: number;
          message?: string;
          actor_profile_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      previo_catalog: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: number;
          factory_password_hash: string;
          hourly_cost_per_worker_cop: number;
          labor_factor: number;
          daily_hours_mon_fri: number;
          daily_hours_sat: number;
          daily_hours_sun: number;
          active_workers_count: number;
          client_buffer_days: number;
          shipped_retention_days: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          factory_password_hash: string;
          hourly_cost_per_worker_cop?: number;
          labor_factor?: number;
          daily_hours_mon_fri?: number;
          daily_hours_sat?: number;
          daily_hours_sun?: number;
          active_workers_count?: number;
          client_buffer_days?: number;
          shipped_retention_days?: number;
          updated_at?: string;
        };
        Update: {
          id?: number;
          factory_password_hash?: string;
          hourly_cost_per_worker_cop?: number;
          labor_factor?: number;
          daily_hours_mon_fri?: number;
          daily_hours_sat?: number;
          daily_hours_sun?: number;
          active_workers_count?: number;
          client_buffer_days?: number;
          shipped_retention_days?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      stage_logs: {
        Row: {
          id: string;
          machine_id: string;
          stage_id: number;
          worker_id: string;
          previous_completion: number;
          new_completion: number;
          is_reprocess: boolean;
          is_undone: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          machine_id: string;
          stage_id: number;
          worker_id: string;
          previous_completion: number;
          new_completion: number;
          is_reprocess?: boolean;
          is_undone?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          machine_id?: string;
          stage_id?: number;
          worker_id?: string;
          previous_completion?: number;
          new_completion?: number;
          is_reprocess?: boolean;
          is_undone?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      stages: {
        Row: {
          id: number;
          name: string;
          completion_percentage: number;
          display_order: number;
        };
        Insert: {
          id: number;
          name: string;
          completion_percentage: number;
          display_order: number;
        };
        Update: {
          id?: number;
          name?: string;
          completion_percentage?: number;
          display_order?: number;
        };
        Relationships: [];
      };
      workers: {
        Row: {
          id: string;
          full_name: string;
          role: string;
          hourly_cost_cop: number | null;
          is_active: boolean;
          display_color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          role: string;
          hourly_cost_cop?: number | null;
          is_active?: boolean;
          display_color?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: string;
          hourly_cost_cop?: number | null;
          is_active?: boolean;
          display_color?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      reorder_in_production_machines: {
        Args: {
          ordered_machine_ids: string[];
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
