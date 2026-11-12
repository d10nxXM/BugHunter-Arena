import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { createUser } from '../api/client.js';
import DashboardHeader from '../components/dashboard/DashboardHeader.jsx';
import ProgressNameForm from '../components/ProgressNameForm.jsx';
import ProgressRemoveConfirm from '../components/ProgressRemoveConfirm.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import UserProgress from '../components/UserProgress.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useUser } from '../hooks/useUser.js';
import { isAuthEnabled } from '../lib/authConfig.js';
import { initials } from '../lib/profileFormat.js';
import { paths } from '../paths.js';

const H2 = 'font-display text-[19px] font-semibold text-heading focus:outline-none';
const LINK =
  'rounded font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function Avatar({ name, account }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-12 shrink-0 items-center justify-center rounded-[12px] border font-display text-base font-bold ${
        account
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border-strong bg-surface-3 text-muted'
      }`}
    >
      {initials(name)}
    </span>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { user, persisted, setUser, clearUser, ensureUser } = useUser();
  const { account } = useAuth();
  const authOn = isAuthEnabled();
  const isAccount = Boolean(account && authOn && user?.userId === account.id);
  // 'view' | 'edit' | 'confirmRemove'
  const [mode, setMode] = useState('view');
  const [focusRequest, setFocusRequest] = useState(0);
  const sectionHeadingRef = useRef(null);

  // Focus the section heading after the user section changes, so focus never drops to the body.
  useEffect(() => {
    if (focusRequest > 0) sectionHeadingRef.current?.focus();
  }, [focusRequest]);

  function showView() {
    setMode('view');
    setFocusRequest((n) => n + 1);
  }

  async function createFirstUser(displayName, { signal }) {
    await ensureUser(displayName, { signal });
    showView();
  }

  async function changeName(displayName, { signal }) {
    if (displayName === user.displayName) {
      showView();
      return;
    }
    // A new name is a new user; the old one stays until this succeeds.
    const created = await createUser(displayName, { signal });
    if (signal.aborted) return;
    setUser({ userId: created.id, displayName: created.displayName });
    showView();
  }

  function removeName() {
    clearUser();
    showView();
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-7">
        <DashboardHeader title="Your dashboard" />
        <div className="flex flex-wrap items-start gap-5">
          <Card
            as="section"
            aria-labelledby="progress-name"
            className="flex min-w-0 flex-[999_1_480px] flex-col gap-4 p-6 sm:p-8"
          >
            <h2 id="progress-name" ref={sectionHeadingRef} tabIndex={-1} className={H2}>
              Your name
            </h2>
            <p className="max-w-prose text-muted">
              Enter a name so your attempts are saved and shown here. You can play right away as a
              guest.
            </p>
            <ProgressNameForm
              onSubmit={createFirstUser}
              submitLabel="Save name"
              persisted={persisted}
            />
          </Card>
          {authOn && (
            <Card
              as="section"
              aria-labelledby="account-cta"
              className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 border-accent/30 bg-accent-soft/40 p-6"
            >
              <h2 id="account-cta" className={H2}>
                Hunt with an account
              </h2>
              <p className="text-sm text-muted">
                An account keeps your XP and rank on every device and gives you a public hunter
                profile.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button to={paths.signup} variant="secondary" size="sm">
                  Create account
                </Button>
                <Link to={paths.login} className={LINK}>
                  Log in
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  let actions;
  if (isAccount) {
    actions = (
      <Link to={paths.profile(account.handle)} className={`self-start ${LINK}`}>
        View your public profile <span aria-hidden="true">→</span>
      </Link>
    );
  } else if (mode === 'confirmRemove') {
    actions = <ProgressRemoveConfirm onConfirm={removeName} onCancel={showView} />;
  } else {
    actions = (
      <>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => setMode('edit')}>
            Change name
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode('confirmRemove')}>
            Remove name
          </Button>
        </div>
        {authOn && (
          <p className="border-t border-border pt-4 text-sm text-muted">
            <Link to={paths.signup} className={LINK}>
              Create an account
            </Link>{' '}
            to keep this progress on every device.
          </p>
        )}
      </>
    );
  }

  const hunterCard = (
    <Card as="section" aria-labelledby="progress-user" className="flex flex-col gap-4 p-6">
      <h2 id="progress-user" ref={sectionHeadingRef} tabIndex={-1} className={H2}>
        Hunter
      </h2>
      {mode === 'edit' && !isAccount ? (
        <>
          <p className="text-sm text-muted">
            A new name makes a new profile. Your progress so far stays with the name{' '}
            {user.displayName}.
          </p>
          <ProgressNameForm
            onSubmit={changeName}
            submitLabel="Save new name"
            initialName={user.displayName}
            onCancel={showView}
            persisted={persisted}
            focusOnMount
          />
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar name={user.displayName} account={isAccount} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-heading">
                <span className="sr-only">Name: </span>
                {isAccount ? `@${account.handle}` : user.displayName}
              </p>
              <p className="text-[13px] text-subtle">{isAccount ? 'Account' : 'Guest'}</p>
            </div>
          </div>
          {actions}
        </>
      )}
    </Card>
  );

  return (
    <UserProgress
      key={user.userId}
      userId={user.userId}
      name={isAccount ? account.handle : user.displayName}
      hunterCard={hunterCard}
      rankedHandle={isAccount ? account.handle : null}
    />
  );
}
