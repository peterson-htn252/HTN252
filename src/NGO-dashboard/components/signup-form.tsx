"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

export function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    organization_name: '',
    contact_name: '',
    phone: '',
    address: '',
    description: '',
  });
  
  const { register, isLoading, error } = useAuth();
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error when user types
    if (validationError) {
      setValidationError(null);
    }
  };

  const validateForm = () => {
    if (!formData.email || !formData.password || !formData.organization_name || !formData.contact_name) {
      setValidationError('Please fill in all required fields');
      return false;
    }
    
    if (formData.password.length < 8) {
      setValidationError('Password must be at least 8 characters long');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setValidationError('Passwords do not match');
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setValidationError('Please enter a valid email address');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await register({
        email: formData.email,
        password: formData.password,
        organization_name: formData.organization_name,
        contact_name: formData.contact_name,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        description: formData.description || undefined,
      });
      
      // Registration successful - redirect to login
      onSwitchToLogin();
    } catch (err) {
      // Error is handled by the auth context
    }
  };

  const currentError = validationError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center w-16 h-16 bg-primary rounded-full mx-auto mb-4">
            <Heart className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Create NGO Account</CardTitle>
          <p className="text-muted-foreground">Register your organization to get started</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {currentError && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-4 h-4" />
                {currentError}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="organization_name" className="text-foreground">
                  Organization Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="organization_name"
                  name="organization_name"
                  type="text"
                  placeholder="Hope Foundation"
                  value={formData.organization_name}
                  onChange={handleChange}
                  className="bg-input border-border"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contact_name" className="text-foreground">
                  Contact Person <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="contact_name"
                  name="contact_name"
                  type="text"
                  placeholder="John Doe"
                  value={formData.contact_name}
                  onChange={handleChange}
                  className="bg-input border-border"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="contact@organization.org"
                value={formData.email}
                onChange={handleChange}
                className="bg-input border-border"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">
                  Password <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter password (min 8 characters)"
                  value={formData.password}
                  onChange={handleChange}
                  className="bg-input border-border"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">
                  Confirm Password <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="bg-input border-border"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={formData.phone}
                onChange={handleChange}
                className="bg-input border-border"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address" className="text-foreground">Address</Label>
              <Input
                id="address"
                name="address"
                type="text"
                placeholder="123 Main St, City, State, ZIP"
                value={formData.address}
                onChange={handleChange}
                className="bg-input border-border"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description" className="text-foreground">Organization Description</Label>
              <Input
                id="description"
                name="description"
                type="text"
                placeholder="Brief description of your organization's mission"
                value={formData.description}
                onChange={handleChange}
                className="bg-input border-border"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create NGO Account'}
            </Button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-primary hover:underline font-medium"
              >
                Sign in here
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
