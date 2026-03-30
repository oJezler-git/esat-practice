import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface ClassificationStatusProps {
  current: number;
  total: number;
  isIdle: boolean;
  isError: string | null;
  startTime?: number | null;
  statusText?: string;
}

const ClassificationStatus: React.FC<ClassificationStatusProps> = ({ 
  current, 
  total, 
  isIdle, 
  isError, 
  startTime,
  statusText
}) => {
  const [displayCurrent, setDisplayCurrent] = React.useState(0);

  React.useEffect(() => {
    if (isIdle && total > 0) {
      setDisplayCurrent(total);
      return;
    }

    if (isIdle && total === 0) {
      setDisplayCurrent(0);
      return;
    }
    
    // Smoothly increment displayCurrent to catch up with current
    if (displayCurrent < current) {
      const timer = setTimeout(() => {
        setDisplayCurrent(prev => prev + 1);
      }, 150 + Math.random() * 100); // Varied delay for organic feel
      return () => clearTimeout(timer);
    }

    if (displayCurrent > current) {
      setDisplayCurrent(current);
    }
  }, [current, displayCurrent, isIdle, total]);

  if (isIdle && total === 0 && current === 0) return null;

  const percentage = total > 0 ? Math.round((displayCurrent / total) * 100) : 0;
  const isComplete = current === total && displayCurrent === total && total > 0;
  const isClassifying = !isIdle && !isError && !isComplete;

  const calculateETA = () => {
    if (!startTime || displayCurrent === 0 || isComplete) return null;
    const timeElapsed = Date.now() - startTime;
    const timePerItem = timeElapsed / displayCurrent;
    const remainingItems = total - displayCurrent;
    const etaMs = timePerItem * remainingItems;
    
    if (etaMs < 1000) return 'less than 1s remaining';
    const seconds = Math.ceil(etaMs / 1000);
    if (seconds < 60) return `about ${seconds}s remaining`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `about ${minutes}m ${remainingSeconds}s remaining`;
  };

  const eta = calculateETA();

  return (
    <div className="glass" style={{
      padding: '1.5rem',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-color)',
      marginBottom: '2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isComplete ? (
            <CheckCircle2 size={20} style={{ color: '#22c55e' }} />
          ) : isError ? (
            <div style={{ color: '#ef4444' }}>Error</div>
          ) : (
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
          )}
          <span style={{ fontWeight: 600 }}>
            {isComplete ? 'Classification Complete' : isError ? 'Classification Failed' : 'Classifying Questions...'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {statusText && (
            <span style={{ 
              fontSize: '0.75rem', 
              color: statusText.includes('Rate limited') ? '#d97706' : 'var(--accent-primary)', 
              fontWeight: 700, 
              backgroundColor: statusText.includes('Rate limited') ? '#fef3c7' : 'var(--bg-tertiary)', 
              padding: '0.2rem 0.5rem', 
              borderRadius: '4px',
              border: statusText.includes('Rate limited') ? '1px solid #fbbf24' : 'none',
              animation: 'pulse 2s infinite'
            }}>
              {statusText}
            </span>
          )}
          {isClassifying && eta && !statusText && (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600, backgroundColor: 'var(--bg-tertiary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              {eta}
            </span>
          )}
          <span style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>
            {displayCurrent} of {total} processed
          </span>
        </div>
      </div>

      {!isError && (
        <div style={{ 
          width: '100%', 
          height: '10px', 
          backgroundColor: 'var(--bg-tertiary)', 
          borderRadius: '5px',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
        }}>
          <div style={{ 
            width: `${percentage}%`, 
            height: '100%', 
            backgroundColor: isComplete ? '#22c55e' : 'var(--accent-primary)',
            transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
            boxShadow: isComplete ? 'none' : '0 0 10px rgba(var(--accent-primary-rgb), 0.3)'
          }} />
        </div>
      )}

      {isError && (
        <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{isError}</p>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ClassificationStatus;
