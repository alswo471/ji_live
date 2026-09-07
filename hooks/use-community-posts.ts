'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityPostSummary, PostPage } from '@/lib/community/types';

type CommunityFeedState = 'loading' | 'ready' | 'empty' | 'error';

export interface CommunityPostsState {
  state: CommunityFeedState;
  items: CommunityPostSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

async function loadPage(cursor: string | null): Promise<PostPage> {
  const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const response = await fetch(`/api/community/posts${search}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('community feed unavailable');
  return response.json() as Promise<PostPage>;
}

export function useCommunityPosts(): CommunityPostsState {
  const [state, setState] = useState<CommunityFeedState>('loading');
  const [items, setItems] = useState<CommunityPostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    setState('loading');
    try {
      const page = await loadPage(null);
      if (requestId !== requestRef.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setState(page.items.length ? 'ready' : 'empty');
    } catch {
      if (requestId === requestRef.current) setState('error');
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadPage(cursor);
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  useEffect(() => {
    queueMicrotask(() => void reload());
    return () => {
      requestRef.current += 1;
    };
  }, [reload]);

  return {
    state,
    items,
    hasMore: cursor !== null,
    loadingMore,
    reload,
    loadMore,
  };
}
