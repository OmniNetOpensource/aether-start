import { createServerFn } from '@tanstack/react-start'
import { getAvailableRoles } from '@/server/agents/services/chat-config'

export const getAvailableRolesFn = createServerFn({ method: 'GET' })
  .handler(() => getAvailableRoles())
