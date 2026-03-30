import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { extractTextFromPDF, PageData } from '../lib/pdf-processor';

interface FilePickerProps {
  onProcessed: (pages: PageData[], fileName: string) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
}

const FilePicker: React.FC<FilePickerProps> = ({ onProcessed, isProcessing, setIsProcessing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const [logs, setLogs] = useState<{ id: string, msg: string, status: 'complete' | 'active' }[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
       setError('Only PDF files are supported.');
       return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setLogs([{ id: 'init', msg: 'Initializing Engine', status: 'active' }]);
      setProgress({ current: 0, total: 0 });
      
      const pages = await extractTextFromPDF(file, (current, total, detail) => {
        setProgress({ current, total });
        setLogs(prev => {
          const newLogs = [...prev];
          const lastIndex = newLogs.length - 1;
          if (newLogs[lastIndex] && newLogs[lastIndex].msg !== detail) {
             newLogs[lastIndex].status = 'complete';
             newLogs.push({ id: Math.random().toString(), msg: detail, status: 'active' });
          } else if (!newLogs[lastIndex]) {
             newLogs.push({ id: Math.random().toString(), msg: detail, status: 'active' });
          }
          return newLogs.slice(-4);
        });
      });
      
      onProcessed(pages, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
      setLogs([]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div 
      className="glass"
      style={{ 
        padding: '3rem', 
        border: '1px solid var(--border-color)', 
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        cursor: isProcessing ? 'wait' : 'default',
        width: '100%',
        maxWidth: '800px',
        margin: '0 auto',
        boxShadow: 'var(--shadow-lg)'
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type === 'application/pdf') {
          const event = { target: { files: [file] } } as any;
          handleFileChange(event);
        }
      }}
    >
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf" style={{ display: 'none' }} />
      
      {!isProcessing ? (
        <>
          <div style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
            <Upload size={48} />
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Import Exam Paper</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.125rem', maxWidth: '400px' }}>Drag and drop your PDF papers to automatically segment and index questions.</p>
          </div>
          
          <button className="btn btn-primary" style={{ padding: '0.875rem 2.5rem', fontSize: '1.125rem', fontWeight: 600, borderRadius: 'var(--radius-md)' }} onClick={handleClick}>
            Select PDF File
          </button>
        </>
      ) : (
        <div style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
               <div style={{ position: 'absolute', width: '100%', height: '100%', border: '4px solid var(--bg-tertiary)', borderRadius: '50%' }} />
               <div style={{ 
                  position: 'absolute', 
                  width: '100%', 
                  height: '100%', 
                  border: '4px solid var(--accent-primary)', 
                  borderRadius: '50%',
                  clipPath: `inset(0px 0px 0px 0px)`,
                  borderBottomColor: 'transparent',
                  borderLeftColor: 'transparent',
                  animation: 'spin 1.5s linear infinite'
                }} />
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round((progress.current / progress.total) * 100 || 0)}%</span>
            </div>
            <div style={{ textAlign: 'center' }}>
               <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Analyzing Document</h3>
               <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>Processing page {progress.current} of {progress.total}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', padding: '1.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            {logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
                <div style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  backgroundColor: log.status === 'complete' ? '#22c55e' : 'var(--accent-primary)',
                  boxShadow: log.status === 'active' ? '0 0 8px var(--accent-primary)' : 'none',
                  animation: log.status === 'active' ? 'pulse 1.5s infinite' : 'none'
                }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: log.status === 'complete' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                  {log.msg}
                </span>
                {log.status === 'complete' && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>Done</span>}
              </div>
            ))}
          </div>

          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${(progress.current / progress.total) * 100 || 0}%`, height: '100%', backgroundColor: 'var(--accent-primary)', transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }} />
          </div>

        </div>
      )}

      {error && (
        <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '1.5rem', textAlign: 'center' }}>{error}</p>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default FilePicker;
