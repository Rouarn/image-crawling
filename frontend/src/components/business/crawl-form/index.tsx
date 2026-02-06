import React, { useState, useRef } from 'react';
import { Form, Input, InputNumber, Checkbox, Button, App, Card, Row, Col } from 'antd';
import type { CrawlOptions } from '@/api/crawl';
import { deriveOutDir } from './helper';
import LogModal from '../log-modal';
import type { LogItem } from '../log-modal';
import { useImageStore } from '@/store/image-store';

const CrawlForm: React.FC = () => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [showLog, setShowLog] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { fetchImages } = useImageStore();

  const onFinish = async (values: CrawlOptions) => {
    setLoading(true);
    setLogs([]);
    setShowLog(true);

    const qs = new URLSearchParams();
    Object.entries(values).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (k === 'headers') {
         // 表单可能会返回字符串（来自 TextArea）或对象（如果已解析，但此处来自输入框的是字符串）
         // 实际上，如果是字符串，我们应该在发送前验证它是否为 JSON，还是直接按原样发送？
         // 原始代码是：qs.set("headers", JSON.stringify(v))，其中 v 是解析后的对象。
         // 但这里 values.headers 很可能是来自 TextArea 的字符串。
         // 让我们验证一下 JSON。
         try {
            const parsed = typeof v === 'string' ? JSON.parse(v) : v;
            qs.set(k, JSON.stringify(parsed));
         } catch {
             // 如果 JSON 无效，可能直接作为字符串发送或忽略？
             // 原始代码在发送前进行了验证。
             // AntD 表单规则可以处理验证。
         }
      } else {
        qs.set(k, String(v));
      }
    });

    // 关闭之前的连接（如果有）
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/crawl/stream?${qs.toString()}`);
    eventSourceRef.current = es;

    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        const time = new Date().toLocaleTimeString();

        if (payload.type === 'error') {
           setLogs((prev) => [...prev, { type: 'error', message: payload.error || '未知错误', time }]);
           es.close();
           setLoading(false);
        } else if (payload.type === 'complete') {
           setLogs((prev) => [...prev, { type: 'complete', message: `完成: 已保存 ${payload.saved} 张图片到 ${payload.outDir}`, time }]);
           es.close();
           setLoading(false);
           fetchImages();
           message.success('抓取完成！');
        } else {
           let msg = '';
           // 根据消息类型生成可读的日志消息
           switch (payload.type) {
             case 'plan': msg = `计划抓取 ${payload.pages} 页`; break;
             case 'page': msg = `正在抓取第 ${payload.index}/${payload.total} 页: ${payload.url}`; break;
             case 'fallback': msg = `回退到浏览器渲染: ${payload.reason}`; break;
             case 'page_done': msg = `页面完成，添加了 ${payload.added} 张图片`; break;
             case 'discover': msg = `发现了 ${payload.count} 张图片`; break;
             default: msg = JSON.stringify(payload);
           }
           setLogs((prev) => [...prev, { type: payload.type, message: msg, time }]);
        }
      } catch (e) {
        console.error(e);
      }
    };

    es.onerror = () => {
      setLogs((prev) => [...prev, { type: 'error', message: '连接错误', time: new Date().toLocaleTimeString() }]);
      es.close();
      setLoading(false);
    };
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    const currentOutDir = form.getFieldValue('outDir');
    if (!currentOutDir || autoFilled) {
      const derived = deriveOutDir(url);
      if (derived) {
        form.setFieldsValue({ outDir: derived });
        setAutoFilled(true);
      }
    }
  };

  const handleOutDirChange = () => {
    setAutoFilled(false);
  };

  const handleMaxPagesChange = (value: number | null) => {
    if (value && value > 0) {
      form.setFieldsValue({
        startPage: 1,
        endPage: value,
      });
    }
  };

  const insertPagePlaceholder = () => {
    const current = form.getFieldValue('pagePattern') || '';
    if (!current.includes('{page}')) {
      form.setFieldsValue({ pagePattern: `${current  }{page}` });
    }
  };

  return (
    <Card title="抓取配置" extra={<span className="text-gray-500 text-xs">支持分页模式与自动“下一页”</span>}>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          maxPages: 5,
          concurrency: 6,
          pageDelayMs: 500,
          useHeadless: false,
        }}
      >
        <Row gutter={16}>
          <Col span={12} xs={24}>
            <Form.Item
              name="url"
              label="目标页面 URL"
              rules={[{ required: true, message: '请输入目标页面 URL' }, { type: 'url', message: '请输入有效的 URL' }]}
              extra="示例：https://example.com/gallery"
            >
              <Input placeholder="https://example.com" onChange={handleUrlChange} />
            </Form.Item>
          </Col>
          <Col span={12} xs={24}>
            <Form.Item
              name="outDir"
              label="输出目录"
              extra="默认保存到 storage/images 目录"
            >
              <Input placeholder="images" onChange={handleOutDirChange} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8} xs={24}>
            <Form.Item
              name="maxPages"
              label="最大页数"
              extra="自动“下一页”最多抓取的页数"
            >
              <InputNumber min={1} className="w-full" onChange={handleMaxPagesChange} />
            </Form.Item>
          </Col>
          <Col span={8} xs={24}>
            <Form.Item
              name="concurrency"
              label="并发下载数"
              extra="同时下载的任务数"
            >
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={8} xs={24}>
            <Form.Item
              name="pageDelayMs"
              label="页面延迟 (ms)"
              extra="每页抓取之间的等待时间"
            >
              <InputNumber min={0} className="w-full" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              label={
                <div className="flex items-center gap-2">
                  <span>分页模式 (可选)</span>
                  <Button type="link" size="small" onClick={insertPagePlaceholder} className="p-0">
                    插入{'{page}'}
                  </Button>
                </div>
              }
              name="pagePattern"
              extra="在 URL 中使用 {page} 作为页码占位符"
            >
              <Input placeholder="https://site.com/list?page={page}" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12} xs={24}>
            <Form.Item name="startPage" label="起始页 (可选)" extra="与分页模式配合使用">
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={12} xs={24}>
            <Form.Item name="endPage" label="结束页 (可选)" extra="与分页模式配合使用">
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="useHeadless" valuePropName="checked">
          <Checkbox>Headless 模式 (使用 Puppeteer 渲染)</Checkbox>
        </Form.Item>

        <Form.Item
          name="headers"
          label="自定义请求头 (JSON 可选)"
          extra='例如：{"user-agent":"Mozilla/5.0 ...","cookie":"a=b; c=d"}'
          rules={[
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                try {
                  JSON.parse(value);
                  return Promise.resolve();
                } catch {
                  return Promise.reject(new Error('请输入有效的 JSON 格式'));
                }
              },
            },
          ]}
        >
          <Input.TextArea rows={4} placeholder='{"user-agent": "..."}' />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            开始抓取
          </Button>
        </Form.Item>
      </Form>
      <LogModal visible={showLog} logs={logs} onClose={() => setShowLog(false)} />
    </Card>
  );
};

export default CrawlForm;
