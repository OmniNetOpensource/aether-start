import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth')({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className='relative h-screen min-h-0 overflow-y-auto bg-background'>
      <div className='relative flex min-h-screen w-full items-center justify-center p-6'>
        <Outlet />
      </div>
    </main>
  );
}
