'use client';

import { useFeedbackStore, FeedbackType } from '@/lib/stores/feedback-store';
import { useEffect, useState } from 'react';

function Icon({ type }: { type: FeedbackType }) {
  if (type === 'success') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--color-success)' }}>
        <path d="M5 10L8 13L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--color-danger)' }}>
        <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === 'progress') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--interactive-brand)', animation: 'spin 1s linear infinite' }}>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--interactive-brand)' }}>
      <path d="M10 9V14M10 6H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function GlobalFeedback() {
  const { feedbacks, remove } = useFeedbackStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="feedback-container">
      {feedbacks.map((fb) => (
        <div key={fb.id} className="feedback-toast">
          <div className="feedback-toast-icon">
            <Icon type={fb.type} />
          </div>
          <div className="feedback-toast-content">
            <div className="feedback-toast-title">{fb.title}</div>
            {fb.message && <div className="feedback-toast-message">{fb.message}</div>}
            {fb.type === 'progress' && fb.progress !== undefined && (
              <div className="feedback-toast-progress-bar">
                <div 
                  className="feedback-toast-progress-fill" 
                  style={{ width: `\${fb.progress}%` }}
                />
              </div>
            )}
          </div>
          <button className="feedback-toast-close" onClick={() => remove(fb.id)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
