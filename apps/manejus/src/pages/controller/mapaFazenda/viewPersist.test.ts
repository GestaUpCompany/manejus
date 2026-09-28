import { describe, it, expect, beforeEach } from 'vitest'
import { loadSavedView, saveView } from './viewPersist'

describe('viewPersist', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('loadSavedView', () => {
    it('retorna default quando localStorage vazio', () => {
      const view = loadSavedView()
      expect(view).toEqual({ longitude: -55.0, latitude: -13.0, zoom: 8 })
    })

    it('retorna view salva corretamente', () => {
      localStorage.setItem('mapaFazendaView', JSON.stringify({ longitude: -54.5, latitude: -12.8, zoom: 12 }))
      const view = loadSavedView()
      expect(view).toEqual({ longitude: -54.5, latitude: -12.8, zoom: 12 })
    })

    it('retorna default quando JSON invalido', () => {
      localStorage.setItem('mapaFazendaView', 'nao-e-json')
      const view = loadSavedView()
      expect(view).toEqual({ longitude: -55.0, latitude: -13.0, zoom: 8 })
    })

    it('retorna default quando faltam campos', () => {
      localStorage.setItem('mapaFazendaView', JSON.stringify({ longitude: -54 }))
      const view = loadSavedView()
      expect(view).toEqual({ longitude: -55.0, latitude: -13.0, zoom: 8 })
    })

    it('retorna default quando tipos estao errados (string em vez de number)', () => {
      localStorage.setItem('mapaFazendaView', JSON.stringify({ longitude: 'abc', latitude: -13, zoom: 8 }))
      const view = loadSavedView()
      expect(view).toEqual({ longitude: -55.0, latitude: -13.0, zoom: 8 })
    })
  })

  describe('saveView', () => {
    it('salva view no localStorage', () => {
      saveView(-54.5, -12.8, 12)
      const raw = localStorage.getItem('mapaFazendaView')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed).toEqual({ longitude: -54.5, latitude: -12.8, zoom: 12 })
    })

    it('sobrescreve view anterior', () => {
      saveView(-54, -12, 10)
      saveView(-53, -11, 14)
      const raw = localStorage.getItem('mapaFazendaView')
      const parsed = JSON.parse(raw!)
      expect(parsed).toEqual({ longitude: -53, latitude: -11, zoom: 14 })
    })
  })

  describe('round-trip', () => {
    it('saveView seguido de loadSavedView retorna os mesmos valores', () => {
      saveView(-54.123, -13.456, 15)
      const view = loadSavedView()
      expect(view.longitude).toBeCloseTo(-54.123, 10)
      expect(view.latitude).toBeCloseTo(-13.456, 10)
      expect(view.zoom).toBe(15)
    })
  })
})
