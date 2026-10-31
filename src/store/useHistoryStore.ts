import { useStore } from 'zustand';
import { useProjectStore } from '@/store/useProjectStore';

export const useHistoryStore = () => {
  return useStore(useProjectStore.temporal, (state) => state);
};