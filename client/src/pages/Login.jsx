import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import AuthField from '../components/auth/AuthField.jsx';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import FormAlert from '../components/auth/FormAlert.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthForm } from '../hooks/useAuthForm.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useReturnPath } from '../hooks/useReturnPath.js';
import { isAuthEnabled } from '../lib/authConfig.js';
import { normalizeEmail, validateLogin } from '../lib/authValidation.js';
import { paths } from '../paths.js';
import AccountPlaceholder from './AccountPlaceholder.jsx';

const LINK =
  'rounded font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function BrandPanel() {
  return (
    <>
      <p className="font-display text-[44px] leading-[1.05] font-bold tracking-tight text-heading">
        Welcome back,
        <br />
        <span className="text-accent">hunter.</span>
      </p>
      <div
        aria-hidden="true"
        className="rounded-xl border border-border-strong bg-surface py-4 font-mono text-sm leading-[1.9]"
      >
        <div className="px-4.5 text-subtle">$ bughunter status</div>
        <div className="px-4.5 text-muted">
          › new challenges waiting <span className="text-accent">✓</span>
        </div>
        <div className="px-4.5 text-muted">
          › your XP and rank are <span className="text-amber">saved</span>
        </div>
        <div className="px-4.5 text-muted">› your profile is public</div>
      </div>
    </>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const returnPath = useReturnPath();
  const { field, formError, pending, onSubmit } = useAuthForm({
    initial: { email: '', password: '' },
    validate: validateLogin,
    submit: ({ email, password }, options) =>
      login({ email: normalizeEmail(email), password }, options),
    onSuccess: () => navigate(returnPath, { replace: true }),
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full max-w-[400px] flex-col gap-5.5">
      <div className="flex flex-col gap-2">
        <h1
          tabIndex={-1}
          className="font-display text-[32px] font-bold tracking-tight text-heading focus:outline-none"
        >
          Log in
        </h1>
        <p className="text-[15px] text-muted">
          New here?{' '}
          <Link to={paths.signup} className={LINK}>
            Create an account
          </Link>
        </p>
      </div>
      {formError && <FormAlert>{formError}</FormAlert>}
      <AuthField
        id="login-email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        {...field('email')}
      />
      <AuthField
        id="login-password"
        label="Password"
        type="password"
        autoComplete="current-password"
        {...field('password')}
      />
      <Button type="submit" disabled={pending} className="min-h-[50px] rounded-[10px] text-base">
        {pending ? 'Logging in…' : 'Log in'}
      </Button>
      {pending && (
        <p role="status" className="sr-only">
          Logging in…
        </p>
      )}
    </form>
  );
}

export default function Login() {
  usePageTitle('Log in');
  const { account } = useAuth();
  // Only a visitor who arrives logged in is sent away; a fresh login navigates itself.
  const [arrivedLoggedIn] = useState(() => account !== null);

  if (!isAuthEnabled()) return <AccountPlaceholder title="Log in" />;
  if (arrivedLoggedIn && account) return <Navigate to={paths.profile(account.handle)} replace />;

  return (
    <AuthLayout asideFirst aside={<BrandPanel />}>
      <LoginForm />
    </AuthLayout>
  );
}
