import { create } from "zustand";
import { devtools } from "zustand/middleware";

type SidebarState = {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  toggle: () => void;
};

export const useSidebarStore = create<SidebarState>()(
  devtools(
    (set) => ({
      isOpen: false,
      setIsOpen: (value) => set({ isOpen: value }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
    }),
    { name: "SidebarStore" }
  )
);
