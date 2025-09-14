// API Response Types
export interface NGO {
  ngo_id: string;
  email: string;
  organization_name: string;
  contact_name: string;
  goal: number;
  description: string;
  status: string;
  default_program_id: string;
  created_at: string;
  public_key: string;
}

export interface Recipient {
  recipient_id: string;
  ngo_id: string;
  name: string;
  location: string;
  balance: number;
  public_key: string;
  private_key: string;
  created_at: string;
}

export interface DashboardStats {
  active_recipients: number;
  total_donations_30d: number;
  total_expenses_30d: number;
  total_ngo_expenses: number;
  available_funds: number;
  utilization_rate: number;
  lifetime_donations: number; // In minor units (cents)
  goal: number; // In major units (dollars)
  last_updated: string;
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
  goal: number;
  description: string;
}

export interface RecipientCreate {
  name: string;
  location: string;
}

export interface BalanceOperation {
  amount: number;
  operation_type: "deposit" | "withdraw";
  description?: string;
}

export interface WalletBalanceUSDResponse {
  address: string | null;
  balance_drops: number;
  balance_usd: number;
}

export interface BalanceOperationResponse {
  previous_balance: number;
  new_balance: number;
  operation: "deposit" | "withdraw";
  amount: number;
  tx_hash: string | null;
}
