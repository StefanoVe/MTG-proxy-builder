import type { ComponentProps } from 'react';

export function Dropdown({ className = '', ...props }: ComponentProps<'div'>) {
  return <div className={`dropdown ${className}`} {...props} />;
}
