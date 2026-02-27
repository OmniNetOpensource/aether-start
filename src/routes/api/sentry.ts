import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/sentry')({
  POST: async ({ request }) => {
    try {
      const envelope = await request.text()
      const piece = envelope.split('\n')[0]
      const header = JSON.parse(piece)
      const dsn = new URL(header.dsn)
      const project_id = dsn.pathname?.replace('/', '')

      if (dsn.hostname !== 'o4510957414645760.ingest.us.sentry.io') {
        throw new Error(`Invalid sentry hostname: ${dsn.hostname}`)
      }

      const projectId = project_id || '4510957423755264'
      const sentryUrl = `https://o4510957414645760.ingest.us.sentry.io/api/${projectId}/envelope/`

      const response = await fetch(sentryUrl, {
        method: 'POST',
        body: envelope,
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
        },
      })

      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (e) {
      console.error('Sentry tunnel error:', e)
      return new Response(JSON.stringify({ error: 'Tunnel error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  },
})
