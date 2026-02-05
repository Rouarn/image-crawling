import React from 'react';
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, style }) => (
    <div
      className={clsx('animate-pulse bg-gray-200 rounded', className)}
      style={style}
      data-testid="skeleton"
    />
  );

export const SkeletonImage: React.FC<SkeletonProps> = ({ className, style }) => (
    <div className={clsx('flex flex-col gap-2', className)} style={style}>
      <div className="w-full aspect-square bg-gray-200 rounded animate-pulse" />
      <div className="h-3 w-3/4 bg-gray-200 rounded animate-pulse" />
    </div>
  );
