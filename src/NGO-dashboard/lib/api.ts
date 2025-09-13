import { 
  AuthToken, 
  LoginRequest, 
  NGO, 
  Recipient, 
  DashboardStats, 
  ExpenseBreakdown, 
  MonthlyTrends,
  RecipientCreate,
  BalanceOperation
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
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth methods
  async login(credentials: LoginRequest): Promise<AuthToken> {
    const token = await this.request<AuthToken>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    this.setToken(token.access_token);
    return token;
  }

  async getCurrentUser(): Promise<NGO> {
    return this.request<NGO>('/auth/me');
  }

  // Dashboard methods
  async getDashboardStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/ngo/dashboard/stats');
  }

  async getExpenseBreakdown(): Promise<ExpenseBreakdown> {
    return this.request<ExpenseBreakdown>('/ngo/dashboard/expense-breakdown');
  }

  async getMonthlyTrends(): Promise<MonthlyTrends> {
    return this.request<MonthlyTrends>('/ngo/dashboard/monthly-trends');
  }

  // Recipients methods
  async getRecipients(search?: string): Promise<{ recipients: Recipient[]; count: number }> {
    const params = new URLSearchParams();
    if (search) {
      params.append('search', search);
    }
    
    const endpoint = `/ngo/recipients${params.toString() ? `?${params.toString()}` : ''}`;
    return this.request<{ recipients: Recipient[]; count: number }>(endpoint);
  }

  async createRecipient(recipient: RecipientCreate): Promise<{ recipient_id: string; status: string }> {
    return this.request<{ recipient_id: string; status: string }>('/ngo/recipients', {
      method: 'POST',
      body: JSON.stringify(recipient),
    });
  }

  async updateRecipientBalance(
    recipientId: string, 
    operation: BalanceOperation
  ): Promise<{
    previous_balance: number;
    new_balance: number;
    operation: string;
    amount: number;
  }> {
    return this.request(`/ngo/recipients/${recipientId}/balance`, {
      method: 'POST',
      body: JSON.stringify(operation),
    });
  }

  async getRecipient(recipientId: string): Promise<Recipient> {
    return this.request<Recipient>(`/ngo/recipients/${recipientId}`);
  }

  // Health check
  async healthCheck(): Promise<{ ok: boolean; xrpl: boolean; network: string }> {
    return this.request<{ ok: boolean; xrpl: boolean; network: string }>('/healthz');
  }
}

export const apiClient = new APIClient();
export default apiClient;
