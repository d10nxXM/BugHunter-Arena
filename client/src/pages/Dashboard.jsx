import { useEffect, useRef, useState } from 'react';
import { createUser } from '../api/client.js';
import ProgressNameForm from '../components/ProgressNameForm.jsx';
import ProgressRemoveConfirm from '../components/ProgressRemoveConfirm.jsx';
import UserProgress from '../components/UserProgress.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useUser } from '../hooks/useUser.js';

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';
const BUTTON = `rounded border border-slate-500 px-3 py-1.5 hover:bg-slate-100 ${FOCUS_RING}`;
const H2 = 'mb-2 text-xl font-semibold focus:outline-none';

export default function Dashboard() {
  usePageTitle('Moj napredak');
  const { user, persisted, setUser, clearUser, ensureUser } = useUser();
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

  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        Moj napredak
      </h1>

      {!user ? (
        <section aria-labelledby="progress-name" className="mt-6">
          <h2 id="progress-name" ref={sectionHeadingRef} tabIndex={-1} className={H2}>
            Tvoje ime
          </h2>
          <p className="mb-4 text-slate-800">
            Unesi ime da bi se tvoji pokušaji čuvali i prikazali ovdje.
          </p>
          <ProgressNameForm
            onSubmit={createFirstUser}
            submitLabel="Sačuvaj ime"
            persisted={persisted}
          />
        </section>
      ) : (
        <>
          <section aria-labelledby="progress-user" className="mt-6">
            <h2 id="progress-user" ref={sectionHeadingRef} tabIndex={-1} className={H2}>
              Korisnik
            </h2>
            {mode === 'edit' ? (
              <>
                <p className="mb-4 text-slate-800">
                  Novo ime pravi novi profil. Dosadašnji napredak ostaje uz ime {user.displayName}.
                </p>
                <ProgressNameForm
                  onSubmit={changeName}
                  submitLabel="Sačuvaj novo ime"
                  initialName={user.displayName}
                  onCancel={showView}
                  persisted={persisted}
                  focusOnMount
                />
              </>
            ) : (
              <>
                <p className="text-slate-800">
                  Ime: <span className="font-semibold">{user.displayName}</span>
                </p>
                {mode === 'confirmRemove' ? (
                  <div className="mt-3">
                    <ProgressRemoveConfirm onConfirm={removeName} onCancel={showView} />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" onClick={() => setMode('edit')} className={BUTTON}>
                      Promijeni ime
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('confirmRemove')}
                      className={BUTTON}
                    >
                      Ukloni ime
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
          <UserProgress key={user.userId} userId={user.userId} />
        </>
      )}
    </>
  );
}
