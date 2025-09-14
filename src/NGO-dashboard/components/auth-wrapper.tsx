"use client";

import { useState } from 'react';
import { LoginForm } from './login-form';
import { SignupForm } from './signup-form';

export function AuthWrapper() {
  const [isSignup, setIsSignup] = useState(false);

  const switchToSignup = () => setIsSignup(true);
  const switchToLogin = () => setIsSignup(false);

  if (isSignup) {
    return <SignupForm onSwitchToLogin={switchToLogin} />;
  }

  return <LoginForm onSwitchToSignup={switchToSignup} />;
}
