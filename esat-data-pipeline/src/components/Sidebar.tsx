import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { BookOpen, Library, BarChart3, Upload, Trash2, Calendar, FileText, Download } from 'lucide-react';

interface SidebarProps {
  activeTab: 'upload' | 'library' | 'stats';
  setActiveTab: (tab: 'upload' | 'library' | 'stats') => void;
  onOpenSettings: () => void;
  onOpenDataManagement: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onOpenSettings, onOpenDataManagement }) => {
  const papers = useLiveQuery(() => db.papers.orderBy('dateAdded').reverse().limit(10).toArray());
  const stats = useLiveQuery(async () => {
    const total = await db.questions.count();
    const correct = await db.questions.where('status').equals('correct').count();
    const incorrect = await db.questions.where('status').equals('incorrect').count();
    return { total, correct, incorrect };
  });

  const handleDeletePaper = async (id: string) => {
    if (confirm('Are you sure you want to delete this paper and all its questions?')) {
      await db.transaction('rw', db.papers, db.questions, async () => {
        await db.papers.delete(id);
        await db.questions.where('paperId').equals(id).delete();
      });
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ padding: '0.5rem', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 'var(--radius-md)' }}>
            <BookOpen size={24} style={{ color: 'var(--accent-primary)' }} />
          </div>
          ESAT Topic
        </h1>
      </div>
      
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
        <button 
          className={`btn ${activeTab === 'upload' ? 'btn-primary' : 'btn-ghost'}`} 
          onClick={() => setActiveTab('upload')}
          style={{ justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}
        >
          <Upload size={18} />
          Upload Papers
        </button>
        <button 
          className={`btn ${activeTab === 'library' ? 'btn-primary' : 'btn-ghost'}`} 
          onClick={() => setActiveTab('library')}
          style={{ justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}
        >
          <Library size={18} />
          Question Library
        </button>
        <button 
          className={`btn ${activeTab === 'stats' ? 'btn-primary' : 'btn-ghost'}`} 
          onClick={() => setActiveTab('stats')}
          style={{ justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}
        >
          <BarChart3 size={18} />
          Statistics
        </button>
      </nav>
      
      {papers && papers.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em', marginBottom: '1rem', paddingLeft: '0.75rem' }}>
            Recent Papers
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {papers.map(paper => (
              <div key={paper.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', transition: 'background-color 0.2s', cursor: 'default' }} className="hover-bg">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                  <FileText size={16} style={{ color: paper.isClassified ? '#8b5cf6' : 'var(--text-tertiary)', flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{paper.name}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>{paper.questionCount} questions</div>
                  </div>
                </div>
                <button 
                  onClick={() => handleDeletePaper(paper.id)}
                  className="btn btn-ghost" 
                  style={{ padding: '0.25rem', color: 'var(--text-tertiary)' }}
                  title="Delete paper"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats && stats.total > 0 && (
        <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>PROGESS</div>
          <div style={{ display: 'flex', gap: '4px', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.75rem' }}>
            <div style={{ width: `${(stats.correct/stats.total)*100}%`, backgroundColor: '#22c55e' }} />
            <div style={{ width: `${(stats.incorrect/stats.total)*100}%`, backgroundColor: '#ef4444' }} />
            <div style={{ flex: 1, backgroundColor: 'var(--bg-tertiary)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>{stats.correct} Correct</span>
            <span style={{ color: 'var(--text-secondary)' }}>{Math.round((stats.correct/stats.total)*100)}%</span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <button 
          className="btn btn-ghost" 
          onClick={onOpenDataManagement}
          style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          <Download size={18} />
          Export / Import
        </button>
        <button 
          className="btn btn-ghost" 
          onClick={onOpenSettings}
          style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          <Calendar size={18} />
          Settings
        </button>
      </div>
      
      <style>{`
        .sidebar { overflow-y: auto; }
        .hover-bg:hover { background-color: var(--bg-tertiary); }
      `}</style>
    </aside>
  );
};

export default Sidebar;
