import { describe, expect, it } from 'vitest'
import { getAllPosts, getPost, posts } from './posts'

describe('getAllPosts', () => {
  it('sorts posts by date descending', () => {
    const sorted = getAllPosts()
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].date >= sorted[i].date).toBe(true)
    }
  })

  it('does not mutate the underlying posts array', () => {
    const before = posts.map(p => p.slug)
    getAllPosts()
    expect(posts.map(p => p.slug)).toEqual(before)
  })
})

describe('getPost', () => {
  it('returns the matching post for a known slug', () => {
    const known = posts[0]
    expect(getPost(known.slug)?.title).toBe(known.title)
  })

  it('returns undefined for an unknown slug', () => {
    expect(getPost('does-not-exist')).toBeUndefined()
  })
})

describe('post slugs', () => {
  it('are all unique (duplicates would collide in routing/sitemap)', () => {
    const slugs = posts.map(p => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
