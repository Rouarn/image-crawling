import React, { useEffect, useRef } from 'react';
import { Modal } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined, FileOutlined, SearchOutlined } from '@ant-design/icons';

export interface LogItem {
  type: 'plan' | 'page' | 'fallback' | 'page_done' | 'discover' | 'complete' | 'error';
  message: string;
  time: string;
}

interface LogModalProps {
  visible: boolean;
  logs: LogItem[];
  onClose: () => void;
}

const icons = {
  plan: <InfoCircleOutlined className="text-blue-500" />,
  page: <FileOutlined className="text-gray-500" />,
  fallback: <InfoCircleOutlined className="text-orange-500" />,
  page_done: <CheckCircleOutlined className="text-green-500" />,
  discover: <SearchOutlined className="text-purple-500" />,
  complete: <CheckCircleOutlined className="text-green-600 font-bold" />,
  error: <CloseCircleOutlined className="text-red-500" />,
};

const LogModal: React.FC<LogModalProps> = ({ visible, logs, onClose }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, visible]);

  return (
    <Modal
      title="抓取进度"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      maskClosable={false}
    >
      <div className="h-96 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4 rounded border dark:border-gray-700 font-mono text-sm">
        {logs.map((log, index) => (
          <div key={index} className="mb-2 flex items-start gap-2">
            <span className="mt-0.5">{icons[log.type] || <InfoCircleOutlined />}</span>
            <span className="flex-1 text-gray-700 dark:text-gray-300 break-words">{log.message}</span>
            <span className="text-gray-400 text-xs whitespace-nowrap">{log.time}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </Modal>
  );
};

export default LogModal;
