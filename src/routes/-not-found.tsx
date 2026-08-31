import { Link } from '@tanstack/react-router';

export function NotFound() {
  return (
    <div className='flex h-screen w-full items-center justify-center bg-background'>
      <div className='text-center'>
        <h1 className='text-6xl font-bold text-foreground'>404</h1>
        <p className='mt-4 text-lg text-secondary'>页面不存在</p>
        <Link
          to='/app'
          className='mt-6 inline-block rounded-lg bg-primary px-6 py-2 text-background transition-opacity hover:opacity-90'
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
