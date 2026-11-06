import { Link } from 'react-router';
import { buttonClass } from './buttonClass.js';

/**
 * Button with the mockups' styles. Renders a router <Link> when `to` is given, a plain <a> when
 * `href` is given, otherwise a <button> (type="button" unless set).
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  to,
  href,
  type,
  children,
  ...rest
}) {
  const cls = buttonClass({ variant, size, className });
  if (to !== undefined) {
    return (
      <Link to={to} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  if (href !== undefined) {
    return (
      <a href={href} className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button type={type ?? 'button'} className={cls} {...rest}>
      {children}
    </button>
  );
}
