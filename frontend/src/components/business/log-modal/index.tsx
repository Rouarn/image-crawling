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
  plan: <InfoCircleOutlined className="text-blue-500 dark:text-blue-400" />,
  page: <FileOutlined className="text-gray-500 dark:text-gray-400" />,
  fallback: <InfoCircleOutlined className="text-orange-500 dark:text-orange-400" />,
  page_done: <CheckCircleOutlined className="text-green-500 dark:text-green-400" />,
  discover: <SearchOutlined className="text-purple-500 dark:text-purple-400" />,
  complete: <CheckCircleOutlined className="text-green-600 font-bold dark:text-green-500" />,
  error: <CloseCircleOutlined className="text-red-500 dark:text-red-400" />,
};

const formatLogMessage = (msg: string) => {
  try {
    const parsed = JSON.parse(msg);
    if (parsed && typeof parsed === 'object' && parsed.message) {
      return parsed.message;
    }
  } catch {
    // ignore
  }
  return msg;
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
      <div className="h-96 overflow-y-auto dark:bg-[#1f1f1f] text-white p-4 rounded border dark:border-[#303030] font-mono text-sm ">
        {logs.map((log, index) => (
          <div key={index} className="mb-2 flex items-start gap-2">
            <span className="mt-0.5">{icons[log.type] || <InfoCircleOutlined />}</span>
            <span className="flex-1 text-gray-700 dark:text-gray-300 wrap-break-word">{formatLogMessage(log.message)}</span>
            <span className="text-gray-400 text-xs whitespace-nowrap">{log.time}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </Modal>
  );
};

export default LogModal;
