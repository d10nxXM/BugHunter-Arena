/** Form-level error of the auth forms: announced (role="alert"), icon plus text. */
export default function FormAlert({ children }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-[10px] border border-hard/40 bg-hard-soft px-3.5 py-3 text-sm text-hard"
    >
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </p>
  );
}
