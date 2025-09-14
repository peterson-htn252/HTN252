// API Response Types
export interface NGO {
  ngo_id: string;
  email: string;
  organization_name: string;
  contact_name: string;
  phone?: string;
  address?: string;
  description?: string;
  status: string;
  default_program_id: string;
  created_at: string;
}

export interface Recipient {
  recipient_id: string;
  ngo_id: string;
  name: string;
  location: string;
  category: string;
  phone?: string;
  email?: string;
  program_id: string;
  status: "active" | "pending" | "inactive";
  created_at: string;
  updated_at: string;
  wallet_balance: number;
}

export interface DashboardStats {
  active_recipients: number;
  total_donations_30d: number;
  total_expenses_30d: number;
  available_funds: number;
  utilization_rate: number;
  last_updated: string;
}

export interface ExpenseBreakdown {
  expense_breakdown: Array<{
    name: string;
    value: number;
  }>;
}

export interface MonthlyTrends {
  monthly_trends: Array<{
    month: string;
    donations: number;
    expenses: number;
  }>;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  ngo_id: string;
  organization_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  organization_name: string;
  contact_name: string;
  phone?: string;
  address?: string;
  description?: string;
}

export interface RecipientCreate {
  name: string;
  location: string;
  category: string;
  phone?: string;
  email?: string;
  program_id: string;
}

export interface BalanceOperation {
  amount_minor: number;
  operation_type: "deposit" | "withdraw";
  description?: string;
  program_id: string;
}
