import { App } from 'antd';
import { antdUtils } from './antd-instance';

const AntdGlobalRegistry = () => {
  const staticFunction = App.useApp();
  antdUtils.setInstances(staticFunction);
  return null;
};

export default AntdGlobalRegistry;
