import { lazy } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import MainLayout from '@/layouts/main-layout';

const Home = lazy(() => import('@/pages/home'));

const NotFound = () => <div>404 Not Found</div>;

const routes: RouteObject[] = [
  {
    path: '/',
    Component: MainLayout,
    children: [
      {
        index: true,
        Component: Home,
      },
      {
        path: '*',
        Component: NotFound,
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export default router;
