import React, { useState, useRef } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { exportLibrary, downloadFile, getImportPreview, executeImport, ExportData, ImportResolution } from '../lib/data-persistence';
import { PaperMetadata } from '../lib/db';
import { createLogger } from '../lib/logger';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

const DataManagementModal: React.FC<DataManagementModalProps> = ({ isOpen, onClose, onDataChanged }) => {
  const log = createLogger("DataManagementModal");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    data: ExportData;
    conflicts: { paperId: string; existingPaper: PaperMetadata; newPaper: PaperMetadata; }[];
  } | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({});
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'idle' | 'preview' | 'success'>('idle');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      log.info("export:start");
      const json = await log.timeAsync("export-library", exportLibrary);
      const date = new Date().toISOString().split('T')[0];
      downloadFile(json, `esat-library-export-${date}.json`, 'application/json');
      log.info("export:done", {
        bytes: json.length,
        file_name: `esat-library-export-${date}.json`,
      });
    } catch (err) {
      log.error("export:failed", err instanceof Error ? err : undefined);
      setError('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    try {
      log.info("import-preview:start", {
        file_name: file.name,
        file_size_bytes: file.size,
        file_type: file.type,
      });
      const text = await file.text();
      const preview = await log.timeAsync("import-preview:parse", async () =>
        getImportPreview(text),
      );
      setImportPreview(preview);
      
      const initialResolutions: Record<string, ImportResolution> = {};
      preview.data.papers.forEach(p => {
        const isConflict = preview.conflicts.some(c => c.paperId === p.id);
        if (isConflict) {
          initialResolutions[p.id] = 'overwrite'; // Default to overwrite for conflicts
        } else {
          initialResolutions[p.id] = 'overwrite'; // Not really a conflict, but we still need to decide
        }
      });
      setResolutions(initialResolutions);
      setStep('preview');
      log.info("import-preview:done", {
        papers: preview.data.papers.length,
        questions: preview.data.questions.length,
        conflicts: preview.conflicts.length,
      });
    } catch (err) {
      log.error("import-preview:failed", err instanceof Error ? err : undefined);
      setError('Invalid export file');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportExecute = async () => {
    if (!importPreview) return;
    setIsImporting(true);
    try {
      const overwriteCount = Object.values(resolutions).filter(r => r === "overwrite").length;
      const skipCount = Object.values(resolutions).filter(r => r === "skip").length;
      log.info("import-execute:start", {
        papers: importPreview.data.papers.length,
        questions: importPreview.data.questions.length,
        overwrite_count: overwriteCount,
        skip_count: skipCount,
      });
      await log.timeAsync("import-execute:run", async () =>
        executeImport(importPreview.data, resolutions),
      );
      setStep('success');
      onDataChanged?.();
      log.info("import-execute:done");
    } catch (err) {
      log.error("import-execute:failed", err instanceof Error ? err : undefined);
      setError('Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    log.debug("import-reset");
    setImportPreview(null);
    setResolutions({});
    setStep('idle');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 110,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="glass" style={{
        width: '100%', maxWidth: '600px', padding: '2rem',
        borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)',
        position: 'relative', boxShadow: 'var(--shadow-md)',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column'
      }}>
        <button 
          onClick={onClose}
          className="btn btn-ghost" 
          style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.25rem' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Library Data Management</h2>

        {step === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              Export your entire library of classified papers and questions, or import a library from a previous export.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="btn btn-secondary"
                style={{ height: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}
              >
                {isExporting ? <Loader2 className="animate-spin" size={32} /> : <Download size={32} />}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600 }}>Export Library</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Save all data as a .json file</div>
                </div>
              </button>

              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="btn btn-accent"
                style={{ height: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}
              >
                {isImporting ? <Loader2 className="animate-spin" size={32} /> : <Upload size={32} />}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600 }}>Import Library</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Restore from a .json file</div>
                </div>
              </button>
            </div>
            
            {error && (
              <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: 'var(--radius-md)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertTriangle size={18} />
                <span style={{ fontSize: '0.875rem' }}>{error}</span>
              </div>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".json"
              style={{ display: 'none' }}
            />
          </div>
        )}

        {step === 'preview' && importPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 600, fontSize: '1.1rem' }}>Import Preview</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Found {importPreview.data.papers.length} papers and {importPreview.data.questions.length} questions.
              </p>
            </div>

            <div style={{ 
              flex: 1, overflowY: 'auto', 
              paddingRight: '0.5rem',
              display: 'flex', flexDirection: 'column', gap: '0.75rem'
            }}>
              {importPreview.data.papers.map(paper => {
                const conflict = importPreview.conflicts.find(c => c.paperId === paper.id);
                return (
                  <div key={paper.id} style={{
                    padding: '1rem', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: conflict ? 'rgba(255, 160, 0, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxWidth: '60%' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {paper.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {paper.year || 'Unknown year'} • {paper.questionCount} questions
                      </div>
                      {conflict && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ff9800', fontSize: '0.7rem' }}>
                          <AlertTriangle size={12} />
                          <span>Conflicts with existing paper</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <label style={{ 
                        fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        backgroundColor: resolutions[paper.id] === 'overwrite' ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                        color: resolutions[paper.id] === 'overwrite' ? '#22c55e' : 'var(--text-secondary)',
                        border: `1px solid ${resolutions[paper.id] === 'overwrite' ? '#22c55e' : 'var(--border-color)'}`
                      }}>
                        <input 
                          type="radio" 
                          name={`res-${paper.id}`} 
                          checked={resolutions[paper.id] === 'overwrite'}
                          onChange={() => setResolutions(prev => ({ ...prev, [paper.id]: 'overwrite' }))}
                          style={{ display: 'none' }}
                        />
                        Overwrite
                      </label>
                      <label style={{ 
                        fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        backgroundColor: resolutions[paper.id] === 'skip' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                        color: resolutions[paper.id] === 'skip' ? '#ef4444' : 'var(--text-secondary)',
                        border: `1px solid ${resolutions[paper.id] === 'skip' ? '#ef4444' : 'var(--border-color)'}`
                      }}>
                        <input 
                          type="radio" 
                          name={`res-${paper.id}`} 
                          checked={resolutions[paper.id] === 'skip'}
                          onChange={() => setResolutions(prev => ({ ...prev, [paper.id]: 'skip' }))}
                          style={{ display: 'none' }}
                        />
                        Skip
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
              <button 
                onClick={resetImport}
                className="btn btn-ghost"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                onClick={handleImportExecute}
                disabled={isImporting}
                className="btn btn-primary"
                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                {isImporting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                Import Selected Data
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', textAlign: 'center', padding: '1rem' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', 
              backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle2 size={40} />
            </div>
            
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Import Successful!</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                Selected papers and questions have been added to your library.
              </p>
            </div>
            
            <button 
              onClick={onClose}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Back to Library
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataManagementModal;
