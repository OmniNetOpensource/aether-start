export type RoleInfo = {
  id: string;
  name: string;
};

export const ROLES: RoleInfo[] = [
  { id: "aether", name: "aether" },
  { id: "心灵导师", name: "心灵导师" },
  { id: "英语教学专家", name: "英语教学专家" },
];

export const DEFAULT_ROLE_ID = "aether";
