import { 
  AuthToken, 
  LoginRequest, 
  RegisterRequest,
  NGO
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
      ngo_id: null // Will be set by server
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
      status: string;
      created_at: string;
    }>('/accounts/me');
    
    // Transform account data to match NGO interface
    const ngo: NGO = {
      ngo_id: account.account_id,
      email: account.email,
      organization_name: account.name,
      contact_name: account.name, // Use name as contact_name for now
      phone: '', // Not available in account data
      address: '', // Not available in account data
      description: '', // Not available in account data
      status: account.status as 'active' | 'inactive',
      created_at: account.created_at,
      default_program_id: account.ngo_id || ''
    };
    
    return ngo;
  }

  // Note: Dashboard and recipient methods removed as endpoints were deleted
  // If you need these features, the corresponding backend endpoints need to be recreated

  // Health check
  async healthCheck(): Promise<{ ok: boolean; xrpl: boolean; network: string }> {
    return this.request<{ ok: boolean; xrpl: boolean; network: string }>('/healthz');
  }
}

export const apiClient = new APIClient();
export default apiClient;
