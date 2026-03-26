import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth')({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className='relative min-h-screen overflow-y-auto bg-background'>
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#e8e4dc] via-background to-background' />
      <div className='absolute inset-x-0 top-0 h-px bg-(--interactive-primary)' />
      <div className='relative flex min-h-screen w-full items-center justify-center p-6'>
        <Outlet />
      </div>
    </main>
  );
}
