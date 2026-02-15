import { createServerFn } from '@tanstack/react-start'
import { getAvailableRoles } from '@/features/chat/api/server/services/chat-config'

export const getAvailableRolesFn = createServerFn({ method: 'GET' })
  .handler(() => getAvailableRoles())
