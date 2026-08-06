import { createServerFn } from '@tanstack/solid-start';
import { z } from 'zod';

export const deployToNetlifyFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      artifactId: z.string().min(1),
      html: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const [{ requireSession }, { deployArtifactToNetlify }] = await Promise.all([
      import('@/backend/auth/request'),
      import('@/backend/chat/artifact/netlify-deploy'),
    ]);
    const session = await requireSession();
    return deployArtifactToNetlify({ ...data, userId: session.user.id });
  });
