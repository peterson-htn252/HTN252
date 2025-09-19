import { 
  AuthToken, 
  LoginRequest, 
  RegisterRequest,
  NGO,
  DashboardStats,
  Recipient,
  RecipientCreate,
  BalanceOperation,
  WalletBalanceUSDResponse,
  BalanceOperationResponse
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class APIClient {
  private token: string | null = null;

  constructor() {
    // Initialize token from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error:', errorData, response);
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth methods
  async login(credentials: LoginRequest): Promise<AuthToken> {
    const response = await this.request<{
      access_token: string;
      token_type: string;
      account_id: string;
      account_type: string;
      name: string;
      email: string;
      ngo_id?: string;
    }>('/accounts/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    // Transform to match AuthToken interface
    const token: AuthToken = {
      access_token: response.access_token,
      token_type: response.token_type,
      ngo_id: response.account_id, // Use account_id as ngo_id for compatibility
      organization_name: response.name
    };
    
    this.setToken(token.access_token);
    return token;
  }

  async register(registrationData: RegisterRequest): Promise<{ account_id: string }> {
    const accountData = {
      account_type: "NGO" as const,
      status: "active" as const,
      name: registrationData.organization_name,
      email: registrationData.email,
      password: registrationData.password,
      ngo_id: null, // Will be set by server
      goal: registrationData.goal,
      description: registrationData.description
    };
    
    return this.request<{ account_id: string }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(accountData),
    });
  }

  async getCurrentUser(): Promise<NGO> {
    const account = await this.request<{
      account_id: string;
      account_type: string;
      name: string;
      email: string;
      ngo_id?: string;
      goal?: number | string;
      description?: string;
      status: string;
      created_at: string;
      public_key: string;
    }>('/accounts/me');
    
    // Transform account data to match NGO interface
    const ngo: NGO = {
      ngo_id: account.account_id,
      email: account.email,
      organization_name: account.name,
      contact_name: account.name, // Use name as contact_name for now
      goal: typeof account.goal === 'number' ? account.goal : Number(account.goal ?? 0),
      description: account.description || '',
      status: account.status as 'active' | 'inactive',
      created_at: account.created_at,
      default_program_id: account.ngo_id || '',
      public_key: account.public_key,
    };
    
    return ngo;
  }

  // Dashboard methods
  async getDashboardStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/accounts/dashboard/stats');
  }

  async getWalletBalanceUSD(publicKey: string): Promise<WalletBalanceUSDResponse> {
    return this.request<WalletBalanceUSDResponse>('/wallets/balance-usd', {
      method: 'POST',
      body: JSON.stringify({ public_key: publicKey })
    });
  }


  // Recipients methods
  async getRecipients(search?: string): Promise<{ recipients: Recipient[]; count: number }> {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request<{ recipients: Recipient[]; count: number }>(`/accounts/recipients${params}`);
  }

  async createRecipient(recipientData: RecipientCreate): Promise<{ recipient_id: string; status: string }> {
    return this.request<{ recipient_id: string; status: string }>('/accounts/recipients', {
      method: 'POST',
      body: JSON.stringify(recipientData),
    });
  }

  async updateRecipientBalance(recipientId: string, operation: BalanceOperation): Promise<BalanceOperationResponse> {
    return this.request<BalanceOperationResponse>(`/accounts/recipients/${recipientId}/balance`, {
      method: 'POST',
      body: JSON.stringify(operation),
    });
  }

  // Health check
  async healthCheck(): Promise<{ ok: boolean; xrpl: boolean; network: string }> {
    return this.request<{ ok: boolean; xrpl: boolean; network: string }>('/healthz');
  }
}

export const apiClient = new APIClient();
export default apiClient;
