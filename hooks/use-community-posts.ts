'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityPostSummary, PostPage } from '@/lib/community/types';
import type { CommunityFeedKind } from '@/lib/community/feed';

type CommunityFeedState = 'loading' | 'ready' | 'empty' | 'error';

export interface CommunityPostsState {
  state: CommunityFeedState;
  items: CommunityPostSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

async function loadPage(
  cursor: string | null,
  feed: CommunityFeedKind,
): Promise<PostPage> {
  const search = new URLSearchParams({ feed });
  if (cursor) search.set('cursor', cursor);
  const response = await fetch(`/api/community/posts?${search}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('community feed unavailable');
  return response.json() as Promise<PostPage>;
}

export function useCommunityPosts(
  feed: CommunityFeedKind = 'all',
): CommunityPostsState {
  const [state, setState] = useState<CommunityFeedState>('loading');
  const [items, setItems] = useState<CommunityPostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const moreRef = useRef(false);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    setState('loading');
    setItems([]);
    setCursor(null);
    setLoadingMore(false);
    setLoadMoreError(false);
    moreRef.current = false;
    try {
      const page = await loadPage(null, feed);
      if (requestId !== requestRef.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setState(page.items.length ? 'ready' : 'empty');
    } catch {
      if (requestId === requestRef.current) setState('error');
    }
  }, [feed]);

  const loadMore = useCallback(async () => {
    if (!cursor || moreRef.current || state !== 'ready') return;
    const requestId = requestRef.current;
    moreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await loadPage(cursor, feed);
      if (requestId !== requestRef.current) return;
      // Recommendations can change between page requests; never repeat a row.
      setItems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((existing) => existing.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch {
      if (requestId === requestRef.current) setLoadMoreError(true);
    } finally {
      if (requestId === requestRef.current) {
        moreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [cursor, feed, state]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void reload();
    });
    return () => {
      active = false;
      requestRef.current += 1;
    };
  }, [reload]);

  return {
    state,
    items,
    hasMore: cursor !== null,
    loadingMore,
    loadMoreError,
    reload,
    loadMore,
  };
}
