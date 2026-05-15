'use client';
import { cn } from '@/lib/utils'; // Assuming cn utility exists, if not I'll just use template literals

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
}

export function Skeleton({ className, variant = 'rectangular' }: SkeletonProps) {
  const baseStyles = 'skeleton'; // The .skeleton class is defined in globals.css
  const variantStyles = {
    text: 'h-4 w-full rounded',
    rectangular: 'h-24 w-full rounded-md',
    circular: 'h-12 w-12 rounded-full',
  };

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${className || ''}`}
    />
  );
}

export function ChatMessageSkeleton() {
  return (
    <div className="flex flex-col gap-3 max-w-[80%]">
      <Skeleton variant="text" className="w-1/3 mb-1" />
      <Skeleton variant="rectangular" className="h-20" />
      <div className="flex gap-2">
        <Skeleton variant="text" className="w-12 h-5 rounded-full" />
        <Skeleton variant="text" className="w-12 h-5 rounded-full" />
      </div>
    </div>
  );
}
