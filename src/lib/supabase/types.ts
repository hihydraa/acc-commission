/**
 * Hand-written types mirroring supabase/migrations/0001_init.sql.
 * Once a real Supabase project exists, prefer regenerating this with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 *
 * `Relationships: []` on every table is required by @supabase/supabase-js's
 * GenericTable constraint even though we don't use FK-embedding query
 * syntax anywhere except the one adjustments->transactions join in the
 * export route (handled there with an explicit cast) — omitting it makes
 * the whole generic silently resolve to `never` instead of erroring loudly.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PeriodStatus = "draft" | "review" | "closed";
export type SourceFileKind = "sales" | "ar" | "master";
export type SaleType = "cash" | "credit" | "overdue";
export type UserRole = "branch_accountant" | "manager";

export interface Database {
  public: {
    Tables: {
      departments: {
        Row: {
          code: string;
          label: string;
          min_liters: number;
          fixed_freight: number | null;
          require_round_thousand: boolean;
          doc_prefixes: string[];
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["departments"]["Row"]> & { code: string; label: string; min_liters: number };
        Update: Partial<Database["public"]["Tables"]["departments"]["Row"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          code: string;
          name: string | null;
          area: string | null;
          distance_km: number | null;
          salesperson: string | null;
          is_excluded: boolean;
          branch: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]> & { code: string };
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [];
      };
      freight_tiers: {
        Row: { id: string; min_km: number; max_km: number; rate: number };
        Insert: Partial<Database["public"]["Tables"]["freight_tiers"]["Row"]> & { min_km: number; max_km: number; rate: number };
        Update: Partial<Database["public"]["Tables"]["freight_tiers"]["Row"]>;
        Relationships: [];
      };
      products: {
        Row: { code: string; name: string | null; is_fuel: boolean };
        Insert: Partial<Database["public"]["Tables"]["products"]["Row"]> & { code: string };
        Update: Partial<Database["public"]["Tables"]["products"]["Row"]>;
        Relationships: [];
      };
      commission_config: {
        Row: { key: string; value: Json };
        Insert: { key: string; value: Json };
        Update: Partial<Database["public"]["Tables"]["commission_config"]["Row"]>;
        Relationships: [];
      };
      periods: {
        Row: {
          id: string;
          year: number;
          month: number;
          branch: string;
          status: PeriodStatus;
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["periods"]["Row"]> & { year: number; month: number };
        Update: Partial<Database["public"]["Tables"]["periods"]["Row"]>;
        Relationships: [];
      };
      source_files: {
        Row: {
          id: string;
          period_id: string;
          kind: SourceFileKind;
          department_code: string | null;
          filename: string;
          storage_path: string;
          checksum_liters: number | null;
          checksum_value: number | null;
          checksum_ok: boolean | null;
          uploaded_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["source_files"]["Row"]> & {
          period_id: string;
          kind: SourceFileKind;
          filename: string;
          storage_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["source_files"]["Row"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          period_id: string;
          department_code: string;
          doc_no: string;
          base_doc_no: string;
          doc_date: string | null;
          customer_code: string | null;
          product_code: string;
          qty: number;
          sale_value: number;
          cost: number;
          distance_km: number | null;
          is_one_way: boolean;
          sale_type: SaleType | null;
          gross_profit: number | null;
          freight_rate: number | null;
          freight_total: number | null;
          total_cost: number | null;
          profit_after_freight: number | null;
          profit_per_liter: number | null;
          commission: number | null;
          is_eligible: boolean;
          blocked_reason: string | null;
          flags: string[];
          outstanding_amount: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["transactions"]["Row"]> & {
          period_id: string;
          department_code: string;
          doc_no: string;
          base_doc_no: string;
          product_code: string;
          qty: number;
          sale_value: number;
          cost: number;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Row"]>;
        Relationships: [];
      };
      adjustments: {
        Row: {
          id: string;
          transaction_id: string;
          field: string;
          old_value: string | null;
          new_value: string | null;
          reason: string | null;
          actor: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["adjustments"]["Row"]> & {
          transaction_id: string;
          field: string;
          actor: string;
        };
        Update: Partial<Database["public"]["Tables"]["adjustments"]["Row"]>;
        Relationships: [];
      };
      ar_outstanding: {
        Row: {
          id: string;
          period_id: string;
          base_doc_no: string;
          customer_code: string | null;
          customer_name: string | null;
          bill_amount: number;
          paid_amount: number;
          outstanding: number;
          bill_date: string | null;
          as_of_date: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["ar_outstanding"]["Row"]> & {
          period_id: string;
          base_doc_no: string;
        };
        Update: Partial<Database["public"]["Tables"]["ar_outstanding"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: { id: string; branch: string | null; role: UserRole; full_name: string | null; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
