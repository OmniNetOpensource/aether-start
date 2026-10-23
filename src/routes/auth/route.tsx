import { Outlet, createFileRoute } from '@tanstack/react-router';
import '@/frontend/auth/auth.css';

export const Route = createFileRoute('/auth')({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className='auth-page'>
      <header className='auth-topline'>
        <strong>AETHER / YOUR LEARNING SPACE</strong>
        <span>DEEP RESEARCH & HTML VISUALIZATION</span>
      </header>
      <Outlet />
    </main>
  );
}
