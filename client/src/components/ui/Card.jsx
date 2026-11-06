/**
 * Surface panel from the mockups: 1px border, 14px radius, surface background.
 * `as` picks the element (section, article, div...); `className` adds layout classes.
 */
export default function Card({ as: Element = 'div', className = '', children, ...rest }) {
  return (
    <Element
      className={`rounded-[14px] border border-border bg-surface p-5 ${className}`}
      {...rest}
    >
      {children}
    </Element>
  );
}
