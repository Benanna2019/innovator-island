import { describe, expect, it } from 'vitest'
import en from '#/i18n/en.json'
import es from '#/i18n/es.json'
import fr from '#/i18n/fr.json'
import ja from '#/i18n/ja.json'
import { I18n, LOCALES } from '#/i18n'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('I18n', () => {
  it('has every key, with the same placeholders, in every language', () => {
    for (const catalog of [fr, es, ja]) {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort())
      for (const [key, text] of Object.entries(en)) {
        expect(placeholders((catalog as Record<string, string>)[key])).toEqual(placeholders(text))
      }
    }
  })

  it('lists en, fr, es and ja', () => {
    expect(LOCALES.map((l) => l.code)).toEqual(['en', 'fr', 'es', 'ja'])
  })

  it('fills placeholders and leaves unknown ones alone', () => {
    const t = I18n.translator('en')
    expect(t('wait.minutes', { n: 5 })).toBe('5 min')
    expect(t('wait.minutes')).toBe('{n} min')
  })

  it('resolves cookie, then Accept-Language, then English', () => {
    expect(I18n.resolve('ja', 'fr')).toBe('ja')
    expect(I18n.resolve('xx', 'de, es-MX;q=0.8')).toBe('es')
    expect(I18n.resolve(undefined, undefined)).toBe('en')
    expect(I18n.resolve('klingon', 'de')).toBe('en')
  })
})
