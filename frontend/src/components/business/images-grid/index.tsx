import React, { useEffect, useMemo, useState } from 'react';
import { Card, Input, Tabs, Button, Popconfirm, message, Pagination, Empty } from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useImageStore } from '@/store/image-store';
import PreviewModal from '../preview-modal';
import { SkeletonImage } from '@/components/ui/skeleton';

const PAGE_SIZE = 50;

const ImagesGrid: React.FC = () => {
  const { groups, files, loading, activeGroup, filter, fetchImages, setActiveGroup, setFilter, deleteImage } = useImageStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const currentFiles = useMemo(() => {
    let list: string[] = [];
    if (groups.length > 0) {
      const group = groups.find((g) => g.dir === activeGroup);
      list = group ? group.files : [];
    } else {
      list = files;
    }

    if (filter) {
      const lower = filter.toLowerCase();
      list = list.filter((f) => f.toLowerCase().includes(lower));
    }

    return list;
  }, [groups, files, activeGroup, filter]);

  const paginatedFiles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return currentFiles.slice(start, start + PAGE_SIZE);
  }, [currentFiles, currentPage]);

  const handleTabChange = (key: string) => {
    setActiveGroup(key);
    setCurrentPage(1);
  };

  const handleDelete = async (filename: string) => {
    try {
      await deleteImage(filename);
      message.success('删除成功');
    } catch {
      message.error('删除失败');
    }
  };

  const handlePreview = (image: string) => {
    setPreviewImage(image);
  };

  const handlePrev = () => {
    if (!previewImage) return;
    const idx = currentFiles.indexOf(previewImage);
    if (idx > 0) setPreviewImage(currentFiles[idx - 1]);
  };

  const handleNext = () => {
    if (!previewImage) return;
    const idx = currentFiles.indexOf(previewImage);
    if (idx < currentFiles.length - 1) setPreviewImage(currentFiles[idx + 1]);
  };

  return (
    <Card
      title="已下载图片"
      extra={
        <div className="flex items-center gap-2">
          <Input.Search
            placeholder="按文件名筛选..."
            allowClear
            onSearch={setFilter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 200 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchImages} loading={loading} />
        </div>
      }
    >
      {groups.length > 0 && (
        <Tabs
          activeKey={activeGroup}
          onChange={handleTabChange}
          items={groups.map((g) => ({
            key: g.dir,
            label: g.dir === 'root' ? '根目录' : g.dir,
          }))}
          className="mb-4"
        />
      )}

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonImage key={i} />
          ))}
        </div>
      )}

      {!loading && currentFiles.length === 0 && <Empty description="暂无图片" />}

      {!loading && currentFiles.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
            {paginatedFiles.map((file) => (
              <div
                key={file}
                className="relative group border rounded p-2 hover:shadow-md transition-shadow"
              >
                <div
                  className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => handlePreview(file)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handlePreview(file);
                    }
                  }}
                >
                  <img
                    src={`/storage/${file}`}
                    alt={file}
                    loading="lazy"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-xs truncate flex-1" title={file}>
                    {file}
                  </span>
                  <Popconfirm title="确认删除这张图片吗？" onConfirm={() => handleDelete(file)}>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            current={currentPage}
            pageSize={PAGE_SIZE}
            total={currentFiles.length}
            onChange={setCurrentPage}
            showSizeChanger={false}
            align="end"
          />
        </>
      )}

      <PreviewModal
        visible={!!previewImage}
        image={previewImage || ''}
        onClose={() => setPreviewImage(null)}
        onPrev={handlePrev}
        onNext={handleNext}
        hasPrev={!!previewImage && currentFiles.indexOf(previewImage) > 0}
        hasNext={!!previewImage && currentFiles.indexOf(previewImage) < currentFiles.length - 1}
      />
    </Card>
  );
};

export default ImagesGrid;
