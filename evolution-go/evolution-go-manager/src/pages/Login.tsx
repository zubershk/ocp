import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Label,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@evoapi/design-system';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';

import useAuth from '@/hooks/useAuth';
import { initRegister } from '@/services/api/license';

export const Login: React.FC = () => {
  const { login, checkLicense, setApiUrl, setApiKey: setStoreApiKey, isAuthenticated, licenseState, apiUrl: defaultApiUrl, apiKey: storedApiKey } = useAuth();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // If user is already authenticated and licensed, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated && licenseState === 'licensed') {
      navigate('/manager', { replace: true });
    }
  }, [isAuthenticated, licenseState, navigate]);
  
  // Use current browser URL as placeholder
  const currentUrl = window.location.origin;

  // Validation schema for login
  const loginSchema = z.object({
    apiUrl: z
      .string()
        .min(1, { message: 'API URL is required' })
        .url({ message: `Invalid URL. Use format: ${currentUrl}` })
      .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
        message: 'URL must start with http:// or https://',
      }),
    apiKey: z
      .string()
        .min(1, { message: 'API Key is required' })
        .min(10, { message: 'API Key must be at least 10 characters' }),
  });

  type LoginFormData = z.infer<typeof loginSchema>;

  // Login form
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      apiUrl: defaultApiUrl,
      apiKey: storedApiKey || '',
    },
  });

  const onLoginSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginError('');

    try {
      // 1. Check license FIRST (before connecting to backend)
      const cleanUrl = data.apiUrl.replace(/\/$/, '');
      toast.info('Checking license...');
      const licResult = await checkLicense(cleanUrl, data.apiKey);

      if (licResult !== 'licensed') {
        // License not found - initiate registration (no need to connect to backend)
        toast.info('License required', {
          description: 'Redirecting to license registration...',
        });

        const callbackUrl = `${window.location.origin}/manager/license/callback`;
        const registerData = await initRegister(callbackUrl, cleanUrl, data.apiKey);

        if (!registerData.register_url) {
          toast.error('Error', {
            description: registerData.message || 'Failed to start license registration.',
          });
          setLoginError(registerData.message || 'Failed to start registration.');
          return;
        }

        // Save credentials so callback page knows where to call activate
        setApiUrl(cleanUrl);
        setStoreApiKey(data.apiKey);

        // Redirect to licensing registration page
        window.location.href = registerData.register_url;
        return;
      }

      // 2. License OK - now connect to backend
      await login(data.apiUrl, data.apiKey);

      toast.success('Connected successfully!', {
        description: 'Valid license. Welcome!',
      });

      navigate('/manager', { replace: true });
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Connection error. Check URL and API Key.';

      toast.error('Error', {
        description: errorMessage,
      });

      setLoginError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-t from-primary/20 via-background/95 to-background relative">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">
            Evolution GO
          </h1>
        </div>

        {/* Form */}
        <div className="bg-background/80 backdrop-blur-sm border rounded-lg p-6 shadow-lg">
          <div className="space-y-2 mb-6">
            <h2 className="text-2xl font-bold">Sign in to your account</h2>
            <p className="text-muted-foreground">Enter your credentials to access the system</p>
          </div>

          {/* Show login error message */}
          {loginError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{loginError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-apiUrl">Evolution GO API URL</Label>
              <Input
                id="login-apiUrl"
                type="text"
                placeholder={currentUrl}
                disabled={isLoading}
                {...loginForm.register('apiUrl')}
              />
              {loginForm.formState.errors.apiUrl && (
                <p className="text-destructive text-sm">
                  {loginForm.formState.errors.apiUrl.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-apiKey">API Key (GLOBAL_API_KEY)</Label>
              <Input
                id="login-apiKey"
                type="password"
                placeholder="Your API key"
                disabled={isLoading}
                {...loginForm.register('apiKey')}
              />
              {loginForm.formState.errors.apiKey && (
                <p className="text-destructive text-sm">
                  {loginForm.formState.errors.apiKey.message}
                </p>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              <p>
                <strong>Tip:</strong> The API Key is the value of the variable{' '}
                <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs">
                  GLOBAL_API_KEY
                </code>{' '}
                configured in the Evolution GO .env file.
              </p>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? 'Connecting...' : 'Sign in'}
            </Button>
          </form>
        </div>

        {/* Terms of service message */}
        <div className="text-center text-xs text-muted-foreground">
          <p>
            By continuing, you agree to our{' '}
            <a href="#" className="underline hover:text-primary">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="underline hover:text-primary">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
