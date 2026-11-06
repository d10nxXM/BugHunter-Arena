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
import {
  MESSAGES,
  PASSWORD_MIN,
  normalizeEmail,
  normalizeHandle,
  validateSignup,
} from '../lib/authValidation.js';
import { paths } from '../paths.js';
import AccountPlaceholder from './AccountPlaceholder.jsx';

const LINK =
  'rounded font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const PERKS = [
  {
    title: 'Free challenges',
    text: 'Easy to hard Python snippets, each with one real bug to hunt.',
    icon: (
      <>
        <path d="M16 18l6-6-6-6" />
        <path d="M8 6l-6 6 6 6" />
      </>
    ),
  },
  {
    title: 'A mentor, not a cheat sheet',
    text: 'Graded hints and feedback on your explanation. You write the fix.',
    icon: (
      <>
        <path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3z" />
        <path d="M9.5 21h5" />
      </>
    ),
  },
  {
    title: 'Public hunter profile',
    text: 'Show your rank, XP and solved bugs at your own address.',
    icon: (
      <>
        <circle cx="12" cy="8" r="5" />
        <path d="M8.5 12.5L7 22l5-3 5 3-1.5-9.5" />
      </>
    ),
  },
];

function PerksPanel() {
  return (
    <>
      <p className="font-mono text-sm text-accent">{'// what_you_get'}</p>
      <p className="max-w-[420px] font-display text-4xl leading-[1.1] font-bold tracking-tight text-heading">
        Free to start. Hard to master.
      </p>
      <ul className="flex max-w-[440px] flex-col gap-3.5">
        {PERKS.map((perk) => (
          <li
            key={perk.title}
            className="flex gap-3.5 rounded-xl border border-border bg-surface p-4.5"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-accent"
            >
              {perk.icon}
            </svg>
            <div>
              <p className="font-semibold text-heading">{perk.title}</p>
              <p className="mt-1 text-sm leading-normal text-muted">{perk.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function SignupForm() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const returnPath = useReturnPath();
  const { field, formError, pending, onSubmit } = useAuthForm({
    initial: { handle: '', email: '', password: '' },
    validate: validateSignup,
    submit: ({ handle, email, password }, options) =>
      signup({ handle: normalizeHandle(handle), email: normalizeEmail(email), password }, options),
    onSuccess: () => navigate(returnPath, { replace: true }),
  });
  const email = field('email');

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full max-w-[440px] flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1
          tabIndex={-1}
          className="font-display text-[32px] font-bold tracking-tight text-heading focus:outline-none"
        >
          Create your hunter account
        </h1>
        <p className="text-[15px] text-muted">
          Already hunting?{' '}
          <Link to={paths.login} className={LINK}>
            Log in
          </Link>
        </p>
      </div>
      {formError && <FormAlert>{formError}</FormAlert>}
      <AuthField
        id="signup-handle"
        label="Hunter handle"
        prefix="@"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="null_pointer"
        hint="Shown on your public profile. 3 to 20 letters, numbers and underscores."
        {...field('handle')}
      />
      <div className="flex flex-col gap-2">
        <AuthField
          id="signup-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          hint="Never shown to anyone. No emails are sent."
          {...email}
        />
        {email.error === MESSAGES.emailTaken && (
          <p className="text-sm text-muted">
            <Link to={paths.login} className={LINK}>
              Log in instead
            </Link>
          </p>
        )}
      </div>
      <AuthField
        id="signup-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        placeholder={`At least ${PASSWORD_MIN} characters`}
        {...field('password')}
      />
      <Button type="submit" disabled={pending} className="min-h-[50px] rounded-[10px] text-base">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      {pending && (
        <p role="status" className="sr-only">
          Creating account…
        </p>
      )}
    </form>
  );
}

export default function Signup() {
  usePageTitle('Create account');
  const { account } = useAuth();
  // Only a visitor who arrives logged in is sent away; a fresh signup navigates itself.
  const [arrivedLoggedIn] = useState(() => account !== null);

  if (!isAuthEnabled()) return <AccountPlaceholder title="Create account" />;
  if (arrivedLoggedIn && account) return <Navigate to={paths.profile(account.handle)} replace />;

  return (
    <AuthLayout aside={<PerksPanel />}>
      <SignupForm />
    </AuthLayout>
  );
}
