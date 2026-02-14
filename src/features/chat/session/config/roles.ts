export type RoleInfo = {
  id: string;
  name: string;
};

export const ROLES: RoleInfo[] = [
  { id: "aether", name: "aether" },
  { id: "test1", name: "claude-opus-4-6+dmx" },
  { id: "test2", name: "kimi-k2.5+dmx" },
  { id: "test3", name: "MiniMax-M2.5+dmx" },
  { id: "test4", name: "glm-5+dmx" },
  { id: "test5", name: "doubao-seed-2-0-pro-260215+dmx" },
  { id: "英语教学专家", name: "英语教学专家" },
];

export const DEFAULT_ROLE_ID = "aether";
