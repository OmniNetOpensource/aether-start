export type RoleInfo = {
  id: string;
  name: string;
};

export const ROLES: RoleInfo[] = [
  { id: "patient-teacher", name: "耐心导师" },
  { id: "english-teacher", name: "英语教学专家" },
  { id: "gemini-teacher", name: "Gemini 耐心导师" },
];

export const DEFAULT_ROLE_ID = "patient-teacher";
