import React from 'react';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import { RouterProvider } from 'react-router-dom';
import { StyleProvider } from '@ant-design/cssinjs';
import zhCN from 'antd/locale/zh_CN';
import router from '@/router';
import { useThemeStore } from '@/store/theme-store';
import AntdGlobalHolder from '@/utils/antd-global';

const App: React.FC = () => {
  const { isDark } = useThemeStore();

  React.useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <StyleProvider hashPriority="high">
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
          },
        }}
      >
        <AntdApp>
          <AntdGlobalHolder />
          <RouterProvider router={router} />
        </AntdApp>
      </ConfigProvider>
    </StyleProvider>
  );
};

export default App;
