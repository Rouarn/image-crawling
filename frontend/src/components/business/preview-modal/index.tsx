import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Button } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

interface PreviewModalProps {
  visible: boolean;
  image: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  visible,
  image,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}) => {
  const [size, setSize] = useState<string>('');

  useEffect(() => {
    if (visible && image) {
      const img = new Image();
      img.src = `/storage/${image}`;
      img.onload = () => {
        // 如果需要，可以估算大小或从请求头获取，目前仅使用尺寸
        setSize(`${img.width}x${img.height}`);
      };
    }
  }, [visible, image]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible) return;
    if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    if (e.key === 'ArrowRight' && hasNext) onNext();
  }, [visible, hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width="90vw"
      style={{ top: 20 }}
      styles={{ body: { padding: 0, height: '85vh', display: 'flex', flexDirection: 'column' } }}
      destroyOnHidden
    >
      <div className="flex justify-between items-center p-4 border-b">
        <div className="flex flex-col">
          <span className="font-medium text-lg truncate max-w-md" title={image}>{image}</span>
          <span className="text-gray-500 text-sm">{size}</span>
        </div>
        <Button type="text" onClick={onClose}>×</Button>
      </div>
      
      <div className="flex-1 flex items-center justify-center bg-gray-900 relative overflow-hidden">
        {hasPrev && (
          <Button
            type="text"
            icon={<LeftOutlined style={{ fontSize: 24, color: 'white' }} />}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10"
            onClick={onPrev}
          />
        )}
        
        <img
          src={`/storage/${image}`}
          alt={image}
          className="max-w-full max-h-full object-contain"
        />
        
        {hasNext && (
          <Button
            type="text"
            icon={<RightOutlined style={{ fontSize: 24, color: 'white' }} />}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10"
            onClick={onNext}
          />
        )}
      </div>
    </Modal>
  );
};

export default PreviewModal;
