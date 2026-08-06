import { Link } from '@tanstack/solid-router';

export function NotFound() {
  return (
    <div class='flex h-screen w-full items-center justify-center bg-background'>
      <div class='text-center'>
        <h1 class='text-6xl font-bold text-foreground'>404</h1>
        <p class='mt-4 text-lg text-secondary'>页面不存在</p>
        <Link
          to='/app'
          class='mt-6 inline-block rounded-lg bg-primary px-6 py-2 text-background transition-opacity hover:opacity-90'
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
