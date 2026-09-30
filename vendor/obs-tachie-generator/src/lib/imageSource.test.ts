import { describe, expect, it } from 'vitest'
import {
  isDataUri,
  isExpiringImageUrl,
  isStreamkitAllowedImageUrl,
  resolveImageSource,
} from './imageSource'

describe('isDataUri', () => {
  it('判定 data URI', () => {
    expect(isDataUri('data:image/png;base64,AAAA')).toBe(true)
    expect(isDataUri('  data:image/png;base64,AAAA')).toBe(true)
    expect(isDataUri('https://ex.com/a.png')).toBe(false)
  })
})

describe('isExpiringImageUrl', () => {
  it('Discord 帶簽章的附件/媒體 URL 視為會失效', () => {
    expect(
      isExpiringImageUrl(
        'https://cdn.discordapp.com/attachments/1/2/a.png?ex=abc&is=def&hm=deadbeef',
      ),
    ).toBe(true)
    expect(
      isExpiringImageUrl('https://media.discordapp.net/attachments/1/2/a.png'),
    ).toBe(true)
  })

  it('沒有簽章的 Discord CDN（表情符號・頭像）不視為會失效', () => {
    expect(isExpiringImageUrl('https://cdn.discordapp.com/emojis/12345.png')).toBe(false)
    expect(isExpiringImageUrl('https://cdn.discordapp.com/avatars/1/abc.png')).toBe(false)
  })

  it('imgur・其他主機・不正確的 URL 不視為會失效', () => {
    expect(isExpiringImageUrl('https://i.imgur.com/x.png')).toBe(false)
    expect(isExpiringImageUrl('https://example.pages.dev/x.png')).toBe(false)
    expect(isExpiringImageUrl('not a url')).toBe(false)
  })
})

describe('isStreamkitAllowedImageUrl', () => {
  it('允許 data:/blob:', () => {
    expect(isStreamkitAllowedImageUrl('data:image/png;base64,AAAA')).toBe(true)
    expect(isStreamkitAllowedImageUrl('blob:https://x/y')).toBe(true)
  })

  it('允許 Discord 系列的主機', () => {
    expect(isStreamkitAllowedImageUrl('https://cdn.discordapp.com/x.png')).toBe(true)
    expect(isStreamkitAllowedImageUrl('https://media.discordapp.net/x.png')).toBe(true)
    expect(isStreamkitAllowedImageUrl('https://images.discord.com/x.png')).toBe(true)
  })

  it('允許 imgur', () => {
    expect(isStreamkitAllowedImageUrl('https://i.imgur.com/x.png')).toBe(true)
    expect(isStreamkitAllowedImageUrl('https://imgur.com/x.png')).toBe(true)
  })

  it('擋掉偽裝的後綴', () => {
    expect(isStreamkitAllowedImageUrl('https://discordapp.com.evil.example/x.png')).toBe(
      false,
    )
    expect(isStreamkitAllowedImageUrl('https://notimgur.com/x.png')).toBe(false)
  })

  it('任意主機（Cloudflare Pages 等）不允許', () => {
    expect(isStreamkitAllowedImageUrl('https://example.pages.dev/x.png')).toBe(false)
    expect(isStreamkitAllowedImageUrl('https://ytama-asset.example/x.png')).toBe(false)
  })

  it('不正確的 URL 不允許', () => {
    expect(isStreamkitAllowedImageUrl('not a url')).toBe(false)
    expect(isStreamkitAllowedImageUrl('')).toBe(false)
  })
})

describe('resolveImageSource（maxWidth 對「直接使用 URL」無效）', () => {
  it('url 模式不縮放・原樣回傳 URL', async () => {
    const r = await resolveImageSource('https://cdn.discordapp.com/x.png', 'url', 100)
    expect(r.applied).toBe('url')
    expect(r.imageUrl).toBe('https://cdn.discordapp.com/x.png')
  })

  it('auto + 允許的主機維持 URL（不轉換＝不縮放）', async () => {
    const r = await resolveImageSource('https://i.imgur.com/x.png', 'auto', 100)
    expect(r.applied).toBe('url')
    expect(r.imageUrl).toBe('https://i.imgur.com/x.png')
  })

  it('輸入是 data URI 時原樣使用（不轉換）', async () => {
    const r = await resolveImageSource('data:image/png;base64,AAAA', 'auto', 100)
    expect(r.applied).toBe('dataUri')
    expect(r.imageUrl).toBe('data:image/png;base64,AAAA')
  })
})
