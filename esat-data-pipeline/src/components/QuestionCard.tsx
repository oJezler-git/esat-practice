import React from 'react';
import { AlertCircle, CheckCircle2, Flag, Sparkles, XCircle } from 'lucide-react';
import { StudyStatus, updateQuestionStatus } from '../lib/db';
import { Question } from '../lib/question-segmenter';
import { ClassificationResult } from '../lib/pipeline/types';

type DisplayQuestion = Question & Partial<ClassificationResult> & { status?: StudyStatus };

interface QuestionCardProps {
  question: DisplayQuestion;
  onStatusChange: (id: string, status: StudyStatus) => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, onStatusChange }) => {
  const [showImage, setShowImage] = React.useState(false);
  const status = question.status || 'unseen';
  const primaryTopic = question.primary_topic;
  const secondaryTopics = Array.isArray(question.secondary_topics)
    ? question.secondary_topics
    : [];
  const hasClassification = Boolean(primaryTopic && primaryTopic !== 'Unclassified');

  const handleStatusChange = async (nextStatus: StudyStatus) => {
    onStatusChange(question.id, nextStatus);
    await updateQuestionStatus(question.id, nextStatus);
  };

  return (
    <div
      className="glass"
      style={{
        padding: '1.5rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        position: 'relative',
        borderLeft:
          status === 'correct'
            ? '4px solid #22c55e'
            : status === 'incorrect'
            ? '4px solid #ef4444'
            : status === 'flagged'
            ? '4px solid #f59e0b'
            : '1px solid var(--border-color)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.25rem'
        }}
      >
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '0.25rem 0.6rem',
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            Q{question.number}
          </span>
          {question.correctAnswer && (
            <span
              style={{
                padding: '0.25rem 0.6rem',
                backgroundColor: '#10b981',
                color: 'white',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 800
              }}
            >
              Ans: {question.correctAnswer}
            </span>
          )}
          {hasClassification && (
            <span
              style={{
                padding: '0.25rem 0.6rem',
                backgroundColor: '#f5f3ff',
                color: '#7c3aed',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <Sparkles size={12} />
              {primaryTopic}
            </span>
          )}
          {secondaryTopics.map(topic => (
            <span
              key={topic}
              style={{
                padding: '0.25rem 0.6rem',
                backgroundColor: '#eef2ff',
                color: '#4f46e5',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 600
              }}
            >
              {topic}
            </span>
          ))}
          {!hasClassification && question.section && (
            <span
              style={{
                padding: '0.25rem 0.6rem',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              {question.section}
            </span>
          )}
          <span
            style={{
              padding: '0.25rem 0.6rem',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600
            }}
          >
            Page {question.page}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {question.image && (
            <button
              onClick={() => setShowImage(!showImage)}
              className={`btn ${showImage ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '0.25rem 0.6rem', height: '28px', fontSize: '0.7rem' }}
            >
              {showImage ? 'Hide PDF' : 'Show PDF'}
            </button>
          )}
          <button
            onClick={() => handleStatusChange(status === 'correct' ? 'unseen' : 'correct')}
            className={`btn btn-ghost ${status === 'correct' ? 'active' : ''}`}
            style={{ padding: '0.25rem', color: status === 'correct' ? '#22c55e' : 'var(--text-tertiary)' }}
            title="Mark as correct"
          >
            <CheckCircle2 size={18} />
          </button>
          <button
            onClick={() => handleStatusChange(status === 'incorrect' ? 'unseen' : 'incorrect')}
            className={`btn btn-ghost ${status === 'incorrect' ? 'active' : ''}`}
            style={{
              padding: '0.25rem',
              color: status === 'incorrect' ? '#ef4444' : 'var(--text-tertiary)'
            }}
            title="Mark as incorrect"
          >
            <XCircle size={18} />
          </button>
          <button
            onClick={() => handleStatusChange(status === 'flagged' ? 'unseen' : 'flagged')}
            className={`btn btn-ghost ${status === 'flagged' ? 'active' : ''}`}
            style={{ padding: '0.25rem', color: status === 'flagged' ? '#f59e0b' : 'var(--text-tertiary)' }}
            title="Flag for later"
          >
            <Flag size={18} />
          </button>
        </div>
      </div>

      {showImage && question.image && (
        <div
          style={{
            marginBottom: '1.5rem',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            maxHeight: '400px',
            overflowY: 'auto'
          }}
        >
          <img src={question.image} alt="Original page" style={{ width: '100%', display: 'block' }} />
        </div>
      )}

      <p
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: '0.875rem',
          lineHeight: '1.6',
          color: 'var(--text-secondary)',
          marginBottom: hasClassification ? '1.25rem' : '0'
        }}
      >
        {question.text}
      </p>

      {hasClassification && (
        <div
          style={{
            padding: '0.9rem 1rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            gap: '0.7rem',
            alignItems: 'flex-start',
            borderLeft: '4px solid #8b5cf6'
          }}
        >
          <AlertCircle size={15} style={{ color: '#8b5cf6', marginTop: '0.1rem', flexShrink: 0 }} />
          <div>
            <strong
              style={{
                display: 'block',
                marginBottom: '0.3rem',
                color: 'var(--text-primary)',
                textTransform: 'uppercase',
                fontSize: '0.65rem'
              }}
            >
              Classification Metadata
            </strong>
            Confidence: {Math.round((question.confidence ?? 0) * 100)}% | Ambiguous:{' '}
            {question.ambiguous ? 'Yes' : 'No'} | Verified: {question.verified ? 'Yes' : 'No'} | Model:{' '}
            {(question.model_used || 'sonnet').toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionCard;
