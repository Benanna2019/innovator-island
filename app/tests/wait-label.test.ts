import { describe, expect, it } from 'vitest'
import { WaitLabel } from '#/domain/wait-label'
import { I18n } from '#/i18n'

const en = I18n.translator('en')

describe('WaitLabel', () => {
  it('levels waits and treats closed first', () => {
    expect(WaitLabel.level(5, false)).toBe('short')
    expect(WaitLabel.level(30, false)).toBe('moderate')
    expect(WaitLabel.level(80, false)).toBe('long')
    expect(WaitLabel.level(80, true)).toBe('closed')
  })

  it('writes text and spoken forms', () => {
    expect(WaitLabel.text(0, false, en)).toBe('No wait')
    expect(WaitLabel.text(25, false, en)).toBe('25 min')
    expect(WaitLabel.text(25, true, en)).toBe('Closed')
    expect(WaitLabel.spoken('Queue Runner', 25, false, en)).toBe('Queue Runner, 25 minute wait')
    expect(WaitLabel.spoken('Queue Runner', 0, true, en)).toBe('Queue Runner, closed')
  })

  it('translates', () => {
    expect(WaitLabel.text(25, true, I18n.translator('fr'))).toBe('Fermée')
    expect(WaitLabel.spoken('Queue Runner', 25, false, I18n.translator('es'))).toBe('Queue Runner, 25 minutos de espera')
  })
})
