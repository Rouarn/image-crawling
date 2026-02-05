import React, { Suspense } from 'react';
import { Layout, Button, theme, Spin } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Outlet } from 'react-router-dom';
import { useThemeStore } from '@/store/theme-store';

const { Header, Content } = Layout;

const Loading = () => (
  <div className="flex justify-center items-center h-64">
    <Spin size="large" />
  </div>
);

const MainLayout: React.FC = () => {
  const { isDark, toggleTheme } = useThemeStore();
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  return (
    <Layout className="min-h-screen">
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: colorBgContainer,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          zIndex: 10,
        }}
      >
        <div className="text-xl font-bold flex items-center gap-2">
          <span className="text-2xl">📸</span>
          <span>图片抓取器</span>
        </div>
        <Button
          type="text"
          icon={isDark ? <SunOutlined /> : <MoonOutlined />}
          onClick={toggleTheme}
          aria-label="Toggle theme"
        />
      </Header>
      <Content className="p-6">
        <div className="max-w-[1600px] mx-auto">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </div>
      </Content>
    </Layout>
  );
};

export default MainLayout;
