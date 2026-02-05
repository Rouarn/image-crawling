import React from 'react';
import { Row, Col } from 'antd';
import CrawlForm from '@/components/business/crawl-form';
import ImagesGrid from '@/components/business/images-grid';

const Home: React.FC = () => (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={8} xl={6}>
        <div className="flex flex-col gap-6">
          <CrawlForm />
          <div className="bg-white dark:bg-[#141414] p-4 rounded-lg border dark:border-[#303030]">
            <h3 className="font-bold text-lg mb-2">使用说明</h3>
            <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>直接填写目标页面 URL 可自动识别常见“下一页”。</li>
              <li>若站点不规范或跨域分页，请使用“分页模式”示例：https://site.com/list?page={'{page}'}。</li>
              <li>起始页与结束页仅在填写“分页模式”时生效。</li>
            </ul>
          </div>
        </div>
      </Col>
      <Col xs={24} lg={16} xl={18}>
        <ImagesGrid />
      </Col>
    </Row>
  );

export default Home;
