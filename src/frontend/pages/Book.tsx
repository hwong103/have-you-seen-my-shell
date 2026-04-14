import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LiveIndicator } from '../components/LiveIndicator';
import { PageTurner } from '../components/PageTurner';
import { WordPicker } from '../components/WordPicker';
import { StoryPage } from './Page';
import type { LiveMessage, PageApiRecord, PageState } from '../types';

interface LatestPageResponse {
  page_number: number;
  has_pending_word: boolean;
}

interface TurnResponse {
  success: boolean;
  reason?: string;
  next_page?: number;
}

function getSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/live`;
}

export function Book() {
  const { pageNumber } = useParams();
  const navigate = useNavigate();

  const currentPageNumber = useMemo(() => {
    const parsed = Number.parseInt(pageNumber ?? '1', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [pageNumber]);

  const [page, setPage] = useState<PageApiRecord | null>(null);
  const [latestPage, setLatestPage] = useState<number>(1);
  const [state, setState] = useState<PageState>('loading');
  const [pendingNextPage, setPendingNextPage] = useState<number | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [turnLoading, setTurnLoading] = useState(false);

  const pageRef = useRef<PageApiRecord | null>(null);
  const currentPageRef = useRef<number>(currentPageNumber);
  const pendingNextPageRef = useRef<number | null>(pendingNextPage);

  pageRef.current = page;
  currentPageRef.current = currentPageNumber;
  pendingNextPageRef.current = pendingNextPage;

  const refreshLatest = useCallback(async () => {
    const response = await fetch('/api/pages/latest');
    if (!response.ok) {
      return;
    }

    const latest = (await response.json()) as LatestPageResponse;
    setLatestPage(latest.page_number);
  }, []);

  const setStateFromPage = useCallback(
    (nextPage: PageApiRecord, latest: number) => {
      const isLastPage = nextPage.page_number === latest;

      if (pendingNextPageRef.current && pendingNextPageRef.current > nextPage.page_number) {
        setState('generating');
        return;
      }

      if (isLastPage && nextPage.chosen_word === null) {
        if (nextPage.image_status === 'done' || nextPage.image_status === 'failed') {
          setState('awaiting_word');
        } else {
          setState('image_pending');
        }
        return;
      }

      if (nextPage.image_status === 'generating') {
        setState('image_pending');
      } else {
        setState('reading');
      }
    },
    [],
  );

  const refreshCurrentPage = useCallback(
    async (pageToLoad = currentPageNumber) => {
      setState((prev) => (prev === 'generating' ? prev : 'loading'));

      const [pageResponse, latestResponse] = await Promise.all([
        fetch(`/api/pages/${pageToLoad}`),
        fetch('/api/pages/latest'),
      ]);

      if (!latestResponse.ok) {
        setFlashMessage('The story is still warming up.');
        return;
      }

      const latest = (await latestResponse.json()) as LatestPageResponse;
      setLatestPage(latest.page_number);

      if (!pageResponse.ok) {
        if (pageToLoad > latest.page_number) {
          setState('generating');
          return;
        }

        setFlashMessage('That page is missing.');
        setState('reading');
        return;
      }

      const record = (await pageResponse.json()) as PageApiRecord;
      setPage(record);
      setStateFromPage(record, latest.page_number);
    },
    [currentPageNumber, setStateFromPage],
  );

  useEffect(() => {
    void refreshCurrentPage(currentPageNumber);
  }, [currentPageNumber, refreshCurrentPage]);

  useEffect(() => {
    if (!flashMessage) return;
    const timeout = window.setTimeout(() => setFlashMessage(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [flashMessage]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimeout: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(getSocketUrl());

      socket.addEventListener('open', () => {
        if (!cancelled) {
          setIsLiveConnected(true);
        }
      });

      socket.addEventListener('close', () => {
        setIsLiveConnected(false);
        if (!cancelled) {
          reconnectTimeout = window.setTimeout(connect, 1200);
        }
      });

      socket.addEventListener('message', (event) => {
        let message: LiveMessage | null = null;
        try {
          message = JSON.parse(event.data) as LiveMessage;
        } catch {
          return;
        }

        if (!message) return;

        if (message.type === 'page_turned') {
          setLatestPage((prev) => Math.max(prev, message.next_page));

          const activePage = pageRef.current;
          if (
            activePage &&
            activePage.page_number === message.page_number &&
            activePage.chosen_word === null &&
            pendingNextPageRef.current === null
          ) {
            setFlashMessage('Someone else just turned the page — catch up!');
            navigate(`/${message.next_page}`);
          }

          return;
        }

        if (message.type === 'page_ready') {
          setLatestPage((prev) => Math.max(prev, message.page_number));

          if (pendingNextPageRef.current === message.page_number) {
            setPendingNextPage(null);
            setTurnLoading(false);
            navigate(`/${message.page_number}`);
            return;
          }

          if (currentPageRef.current === message.page_number) {
            void refreshCurrentPage(message.page_number);
          }

          return;
        }

        if (message.type === 'page_image_ready' && currentPageRef.current === message.page_number) {
          void refreshCurrentPage(message.page_number);
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
      }
      socket?.close();
    };
  }, [navigate, refreshCurrentPage]);

  useEffect(() => {
    if (!pendingNextPage) return;

    const interval = window.setInterval(() => {
      void refreshLatest().then(() => {
        setLatestPage((prev) => {
          if (pendingNextPageRef.current && prev >= pendingNextPageRef.current) {
            setPendingNextPage(null);
            setTurnLoading(false);
            navigate(`/${pendingNextPageRef.current}`);
          }
          return prev;
        });
      });
    }, 1500);

    return () => window.clearInterval(interval);
  }, [navigate, pendingNextPage, refreshLatest]);

  const chooseWord = useCallback(
    async (key: 'a' | 'b' | 'c') => {
      if (!page || turnLoading) return;

      setTurnLoading(true);
      setState('generating');

      const response = await fetch('/api/turn', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          page_number: page.page_number,
          chosen_word: key,
        }),
      });

      const result = (await response.json()) as TurnResponse;

      if (result.success && result.next_page) {
        setPendingNextPage(result.next_page);
        setFlashMessage('The story is thinking...');
        return;
      }

      if (result.reason === 'already_turned' && result.next_page) {
        setTurnLoading(false);
        setPendingNextPage(null);
        setFlashMessage('Another reader turned this page first.');
        navigate(`/${result.next_page}`);
        return;
      }

      setTurnLoading(false);
      setPendingNextPage(null);
      setFlashMessage('That turn did not land. Try again.');
      setState('awaiting_word');
    },
    [navigate, page, turnLoading],
  );

  const canGoNext = currentPageNumber < latestPage;

  return (
    <main className="book-shell">
      <header className="book-header">
        <h1>Have You Seen My Shell?</h1>
        <LiveIndicator connected={isLiveConnected} />
      </header>

      {flashMessage ? <p className="flash">{flashMessage}</p> : null}

      <StoryPage page={page} state={state} />

      {page && state === 'awaiting_word' ? (
        <WordPicker
          disabled={turnLoading}
          words={{
            a: page.word_a,
            b: page.word_b,
            c: page.word_c,
          }}
          onPick={chooseWord}
        />
      ) : null}

      {state === 'generating' ? (
        <div className="generating-banner" role="status" aria-live="polite">
          The story is thinking...
        </div>
      ) : null}

      <PageTurner
        pageNumber={currentPageNumber}
        canGoNext={canGoNext}
        onPrev={() => navigate(`/${Math.max(1, currentPageNumber - 1)}`)}
        onNext={() => {
          if (canGoNext) {
            navigate(`/${currentPageNumber + 1}`);
          }
        }}
      />
    </main>
  );
}
