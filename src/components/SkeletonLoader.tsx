import React from 'react';
import { cn } from "@/lib/utils";

interface OrderCardSkeletonProps {
  viewMode: 'grid' | 'list';
  key?: React.Key;
}

export function OrderCardSkeleton({ viewMode }: OrderCardSkeletonProps) {
  if (viewMode === 'list') {
    return (
      <div className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-3 animate-pulse">
        <div className="h-24 w-24 shrink-0 rounded-xl bg-zinc-100 sm:h-32 sm:w-32" />
        <div className="flex flex-1 flex-col justify-between py-1">
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-zinc-100" />
            <div className="h-6 w-3/4 rounded bg-zinc-100" />
            <div className="h-4 w-1/2 rounded bg-zinc-100" />
          </div>
          <div className="flex justify-end gap-2">
            <div className="h-8 w-24 rounded-xl bg-zinc-100" />
            <div className="h-8 w-24 rounded-xl bg-zinc-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-0 animate-pulse overflow-hidden">
      <div className="aspect-[4/3] w-full bg-zinc-100" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-16 rounded bg-zinc-100" />
        <div className="h-6 w-3/4 rounded bg-zinc-100" />
        <div className="h-4 w-1/2 rounded bg-zinc-100" />
        <div className="flex justify-between pt-2">
          <div className="h-8 w-24 rounded-xl bg-zinc-100" />
          <div className="h-8 w-24 rounded-xl bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}

export function GridSkeleton({ viewMode, count = 8 }: { viewMode: 'grid' | 'list', count?: number }) {
  return (
    <div className={cn(
      viewMode === 'grid' 
        ? "grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
        : "flex flex-col gap-3 sm:gap-4"
    )}>
      {[...Array(count)].map((_, i) => (
        <OrderCardSkeleton key={i} viewMode={viewMode} />
      ))}
    </div>
  );
}
