import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '@/server/functions/auth/session'
import { getServerEnv } from '@/server/env'

const ttsInputSchema = z.object({
  text: z.string().min(1).max(5000),
})

export const ttsSynthesizeFn = createServerFn({ method: 'POST' })
  .inputValidator(ttsInputSchema)
  .handler(async ({ data }) => {
    await requireSession()

    const env = getServerEnv()
    if (!env.MINIMAX_API_KEY) {
      throw new Error('TTS 服务未配置')
    }

    const response = await fetch('https://api.minimaxi.com/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'speech-2.8-hd',
        text: data.text,
        stream: false,
        voice_setting: {
          voice_id: 'male-qn-qingse',
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      throw new Error(`TTS API 请求失败: ${response.status}`)
    }

    const result = (await response.json()) as {
      data?: { audio?: string; status?: number }
      base_resp?: { status_code?: number; status_msg?: string }
    }

    if (result.base_resp?.status_code !== 0) {
      throw new Error(
        `TTS 合成失败: ${result.base_resp?.status_msg ?? '未知错误'}`
      )
    }

    const hexAudio = result.data?.audio
    if (!hexAudio) {
      throw new Error('TTS 返回数据为空')
    }

    return { audio: hexAudio }
  })
