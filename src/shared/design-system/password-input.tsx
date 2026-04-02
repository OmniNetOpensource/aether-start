import { useState, type ComponentPropsWithRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/shared/core/utils';
import { Input } from './input';

function PasswordInput({ className, ref, ...props }: ComponentPropsWithRef<'input'>) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className='relative'>
      <Input
        type={showPassword ? 'text' : 'password'}
        className={cn('pr-10', className)}
        ref={ref}
        {...props}
      />
      <button
        type='button'
        onClick={() => setShowPassword((prev) => !prev)}
        className='absolute right-0 top-0 h-full flex items-center justify-center px-3 text-muted-foreground hover:text-foreground focus:outline-none transition-colors'
        tabIndex={-1}
      >
        {showPassword ? (
          <EyeOff className='h-4 w-4' aria-hidden='true' />
        ) : (
          <Eye className='h-4 w-4' aria-hidden='true' />
        )}
        <span className='sr-only'>{showPassword ? 'Hide password' : 'Show password'}</span>
      </button>
    </div>
  );
}

export { PasswordInput };
