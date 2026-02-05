import { create } from 'zustand';
import { getImages } from '@/api/crawl';
import request from '@/api/request';

interface ImageGroup {
  dir: string;
  files: string[];
}

interface ImageState {
  groups: ImageGroup[];
  files: string[];
  loading: boolean;
  activeGroup: string;
  filter: string;
  fetchImages: () => Promise<void>;
  setActiveGroup: (group: string) => void;
  setFilter: (filter: string) => void;
  deleteImage: (filename: string) => Promise<void>;
}

export const useImageStore = create<ImageState>((set, get) => ({
  groups: [],
  files: [],
  loading: false,
  activeGroup: '',
  filter: '',
  fetchImages: async () => {
    set({ loading: true });
    try {
      const data = await getImages();
      if (data.groups && Array.isArray(data.groups) && data.groups.length > 0) {
        set({
          groups: data.groups,
          activeGroup: get().activeGroup || data.groups[0].dir,
          files: [],
        });
      } else {
        set({
          files: data.files || [],
          groups: [],
          activeGroup: '',
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      set({ loading: false });
    }
  },
  setActiveGroup: (group) => set({ activeGroup: group }),
  setFilter: (filter) => set({ filter }),
  deleteImage: async (filename) => {
    try {
      await request.delete('/images', { data: { name: filename } });
      const { groups, files, activeGroup } = get();
      if (groups.length > 0) {
        const newGroups = groups.map((g) => {
          if (g.dir === activeGroup) {
            return { ...g, files: g.files.filter((f) => f !== filename) };
          }
          return g;
        });
        set({ groups: newGroups });
      } else {
        set({ files: files.filter((f) => f !== filename) });
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  },
}));
