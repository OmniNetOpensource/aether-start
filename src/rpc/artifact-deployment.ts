import { createServerFn } from '@tanstack/solid-start';
import { deployToNetlifySchema } from '@/schema/artifact-deployment';

export const deployToNetlifyFn = createServerFn({ method: 'POST' })
  .validator(deployToNetlifySchema)
  .handler(async ({ data }) => {
    const [{ requireSession }, { deployArtifactToNetlify }] = await Promise.all([
      import('@/backend/auth/request'),
      import('@/backend/chat/artifact/netlify-deploy'),
    ]);
    const session = await requireSession();
    return deployArtifactToNetlify({ ...data, userId: session.user.id });
  });
