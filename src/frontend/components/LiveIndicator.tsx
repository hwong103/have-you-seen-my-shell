interface LiveIndicatorProps {
  connected: boolean;
}

export function LiveIndicator({ connected }: LiveIndicatorProps) {
  return (
    <div className="live-indicator" role="status" aria-live="polite">
      <span className={connected ? 'dot online' : 'dot offline'} />
      <span>{connected ? 'Live with other readers' : 'Reconnecting readers'}</span>
    </div>
  );
}
