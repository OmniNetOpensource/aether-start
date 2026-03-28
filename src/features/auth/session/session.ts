export const getSessionFromRequest = async (request: Request) => {
  const { getSessionFromRequest } = await import('./request.server');
  return getSessionFromRequest(request);
};

export const requireSessionFromRequest = async (request: Request) => {
  const { requireSessionFromRequest } = await import('./request.server');
  return requireSessionFromRequest(request);
};

export const getSession = async () => {
  const { getSession } = await import('./request.server');
  return getSession();
};

export const requireSession = async () => {
  const { requireSession } = await import('./request.server');
  return requireSession();
};
