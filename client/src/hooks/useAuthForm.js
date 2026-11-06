import { useEffect, useRef, useState } from 'react';
import { authErrorDisplay } from '../lib/authValidation.js';

/**
 * State for the login and signup forms.
 * - validate(values) returns field errors ({ name: message }), in form order.
 * - submit(values, { signal }) calls the API; onSuccess(result) runs when it resolves.
 * Client errors focus the first invalid field. Server errors become a field error (409) or a
 * form-level message (formError). Leaving the page aborts the request.
 *
 * Returns { field(name), formError, pending, onSubmit }. field(name) gives the props for
 * AuthField: value, onChange, error and ref.
 */
export function useAuthForm({ initial, validate, submit, onSuccess }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const inputs = useRef({});
  const controllerRef = useRef(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function field(name) {
    return {
      value: values[name],
      onChange: (event) => {
        const { value } = event.target;
        setValues((prev) => ({ ...prev, [name]: value }));
      },
      error: errors[name],
      ref: (element) => {
        inputs.current[name] = element;
      },
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const found = validate(values);
    const invalid = Object.keys(found);
    if (invalid.length > 0) {
      setErrors(found);
      inputs.current[invalid[0]]?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const result = await submit(values, { signal: controller.signal });
      if (!controller.signal.aborted) onSuccess(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      const display = authErrorDisplay(error);
      if (display.field) {
        setErrors({ [display.field]: display.message });
        inputs.current[display.field]?.focus();
      } else {
        setFormError(display.message);
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return { field, formError, pending, onSubmit };
}
