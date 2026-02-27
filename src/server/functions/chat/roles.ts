import { createServerFn } from '@tanstack/react-start'
import {
  getAvailableRoles,
  getDefaultRoleId,
} from '@/server/agents/services/chat-config'

export const getAvailableRolesFn = createServerFn({ method: 'GET' })
  .handler(() => getAvailableRoles())

export const getDefaultRoleIdFn = createServerFn({ method: 'GET' })
  .handler(() => getDefaultRoleId())
