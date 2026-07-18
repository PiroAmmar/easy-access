import { create } from 'zustand';

export type FeedbackType = 'success' | 'error' | 'info' | 'progress';

interface FeedbackMessage {
  id: string;
  type: FeedbackType;
  title: string;
  message?: string;
  progress?: number; // 0-100
  duration?: number; // Auto dismiss time (ms), ignored if type='progress' unless specified
}

interface FeedbackState {
  feedbacks: FeedbackMessage[];
  add: (feedback: Omit<FeedbackMessage, 'id'>) => string;
  update: (id: string, updates: Partial<Omit<FeedbackMessage, 'id'>>) => void;
  remove: (id: string) => void;
}

const DEFAULT_DURATION = 4000;

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  feedbacks: [],

  add: (feedback) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newFeedback = { ...feedback, id };

    set((state) => ({
      feedbacks: [...state.feedbacks, newFeedback],
    }));

    if (feedback.type !== 'progress') {
      const duration = feedback.duration || DEFAULT_DURATION;
      setTimeout(() => {
        get().remove(id);
      }, duration);
    }

    return id;
  },

  update: (id, updates) => {
    set((state) => {
      const updated = state.feedbacks.map((f) => {
        if (f.id === id) {
          const newF = { ...f, ...updates };
          // If transitioning from progress to another state, auto-dismiss
          if (f.type === 'progress' && newF.type && newF.type !== 'progress') {
            const duration = newF.duration || DEFAULT_DURATION;
            setTimeout(() => {
              get().remove(id);
            }, duration);
          }
          return newF;
        }
        return f;
      });
      return { feedbacks: updated };
    });
  },

  remove: (id) => {
    set((state) => ({
      feedbacks: state.feedbacks.filter((f) => f.id !== id),
    }));
  },
}));
