import { create } from "zustand";

type SidebarState = {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  toggle: () => void;
};

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  setIsOpen: (value) => set({ isOpen: value }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
