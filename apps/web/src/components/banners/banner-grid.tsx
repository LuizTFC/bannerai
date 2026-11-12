"use client";

import { Images, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBanners } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";
import { BannerCard } from "./banner-card";

export function BannerGrid() {
  const [page, setPage] = useState(1);
  const { d, f } = useT();
  const query = useBanners(page);
  const data = query.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        title={d.banners.title}
        description={data ? f(d.banners.count, { n: data.total }) : undefined}
        actions={
          <Button asChild>
            <Link href="/create">
              <Plus className="size-4" /> {d.banners.newBanner}
            </Link>
          </Button>
        }
      />
      <div className="mt-8">
        {query.isPending ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="space-y-2 p-3.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={Images}
            title={d.banners.loadFailed}
            description={query.error.message}
            action={
              <Button variant="outline" onClick={() => void query.refetch()}>
                {d.common.tryAgain}
              </Button>
            }
          />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            icon={Images}
            title={d.banners.emptyTitle}
            description={d.banners.emptyDesc}
            action={
              <Button asChild>
                <Link href="/create">
                  <Plus className="size-4" /> {d.banners.createFirst}
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{data!.items.map((b) => <BannerCard key={b.id} banner={b} />)}</div>
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2 text-sm">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {d.common.previous}
                </Button>
                <span className="px-2 text-muted-foreground">{f(d.common.pageOf, { page, total: totalPages })}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  {d.common.next}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
