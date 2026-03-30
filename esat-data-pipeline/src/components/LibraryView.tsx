import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, StudyStatus, StoredQuestion, updateQuestionStatus } from '../lib/db';
import { ESAT_TAXONOMY } from '../lib/taxonomy';
import QuestionCard from './QuestionCard';
import { Search, BookOpen, Trash2 } from 'lucide-react';

const LibraryView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<StudyStatus | 'all'>('all');
  
  const allQuestions = useLiveQuery(() => db.questions.toArray());

  const filteredQuestions = useMemo(() => {
    if (!allQuestions) return [];
    
    return allQuestions.filter((q: StoredQuestion) => {
      const matchesSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = selectedStatus === 'all' || q.status === selectedStatus;
      
      let matchesModule = true;
      if (selectedModule !== 'All') {
        const moduleTaxonomy = ESAT_TAXONOMY[selectedModule as keyof typeof ESAT_TAXONOMY];
        const moduleTopics = moduleTaxonomy ? Object.keys(moduleTaxonomy) : [];
        const questionTopics = [
          q.primary_topic,
          ...(Array.isArray(q.secondary_topics) ? q.secondary_topics : [])
        ].filter(Boolean);
        matchesModule = questionTopics.some(topic => moduleTopics.includes(topic));
      }
      
      return matchesSearch && matchesStatus && matchesModule;
    });
  }, [allQuestions, searchTerm, selectedModule, selectedStatus]);

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to clear ALL questions and papers? Data is only stored in this browser.')) {
      await db.transaction('rw', db.papers, db.questions, async () => {
        await db.papers.clear();
        await db.questions.clear();
      });
    }
  };

  if (!allQuestions) return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading Library...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              type="text" 
              placeholder="Search library..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '0.75rem 1rem 0.75rem 3rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', width: '100%' }}
            />
          </div>
          
          <select 
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', minWidth: '160px' }}
          >
            <option value="All">All Modules</option>
            {Object.keys(ESAT_TAXONOMY).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select 
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as StudyStatus | 'all')}
            style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', minWidth: '140px' }}
          >
            <option value="all">All States</option>
            <option value="unseen">Unseen</option>
            <option value="correct">Correct</option>
            <option value="incorrect">Incorrect</option>
            <option value="flagged">Flagged</option>
          </select>
        </div>

        <button 
          onClick={handleClearAll}
          className="btn btn-ghost" 
          style={{ color: '#ef4444', border: '1px solid transparent' }}
        >
          <Trash2 size={18} style={{ marginRight: '0.5rem' }} />
          Wipe Database
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100%, 1fr))', gap: '1.5rem' }}>
        {filteredQuestions && filteredQuestions.length > 0 ? (
          filteredQuestions.map(q => (
            <QuestionCard 
              key={q.id} 
              question={q} 
              onStatusChange={(id: string, status: StudyStatus) => updateQuestionStatus(id, status)} 
            />
          ))
        ) : (
          <div style={{ padding: '6rem 2rem', textAlign: 'center', gridColumn: '1 / -1' }}>
            <div style={{ display: 'inline-flex', padding: '1.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '50%', marginBottom: '1.5rem', color: 'var(--text-tertiary)' }}>
              <BookOpen size={48} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>No questions found</h3>
            <p style={{ color: 'var(--text-tertiary)', maxWidth: '400px', margin: '0 auto' }}>
              {allQuestions.length === 0 
                ? 'Your library is empty. Upload your first PDF to get started!' 
                : 'No questions match your current filters. Try refining your search.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryView;
