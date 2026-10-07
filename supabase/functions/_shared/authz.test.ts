// Rodar: node --test supabase/functions/_shared/authz.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canChangePassword,
  canCreateUserWithPapel,
  canManageAuthUsers,
  canRollbackTarget,
  isPapel,
  isRecent,
  isUuid,
} from './authz.ts'

test('isUuid aceita só UUID puro (bloqueia injeção em filtro PostgREST)', () => {
  assert.equal(isUuid('d649c65e-16ab-4b77-a84b-df937aa41cc3'), true)
  assert.equal(isUuid('d649c65e-16ab-4b77-a84b-df937aa41cc3,id.neq.x'), false)
  assert.equal(isUuid('x) or (papel.eq.super_admin'), false)
  assert.equal(isUuid(''), false)
  assert.equal(isUuid(null), false)
  assert.equal(isUuid(123), false)
})

test('isPapel rejeita valores fora da lista (inclui injeção de papel arbitrário)', () => {
  assert.equal(isPapel('controller'), true)
  assert.equal(isPapel('super_admin'), true)
  assert.equal(isPapel('root'), false)
  assert.equal(isPapel(undefined), false)
  assert.equal(isPapel({ papel: 'admin' }), false)
})

test('canManageAuthUsers: só admin e super_admin', () => {
  assert.equal(canManageAuthUsers('controller'), false)
  assert.equal(canManageAuthUsers('admin'), true)
  assert.equal(canManageAuthUsers('super_admin'), true)
})

test('canCreateUserWithPapel: controller nunca cria; admin só controller; super_admin qualquer papel válido', () => {
  for (const p of ['controller', 'admin', 'super_admin']) assert.equal(canCreateUserWithPapel('controller', p), false)
  assert.equal(canCreateUserWithPapel('admin', 'controller'), true)
  assert.equal(canCreateUserWithPapel('admin', 'admin'), false)
  assert.equal(canCreateUserWithPapel('admin', 'super_admin'), false)
  assert.equal(canCreateUserWithPapel('super_admin', 'super_admin'), true)
  assert.equal(canCreateUserWithPapel('super_admin', 'admin'), true)
  assert.equal(canCreateUserWithPapel('super_admin', 'root'), false)
  assert.equal(canCreateUserWithPapel('super_admin', undefined), false)
})

test('canChangePassword: controller nunca; admin só a própria ou de não-admin; super_admin qualquer', () => {
  assert.equal(canChangePassword('controller', 'u1', 'u1', 'controller'), false)
  assert.equal(canChangePassword('admin', 'a1', 'c1', 'controller'), true)
  assert.equal(canChangePassword('admin', 'a1', 'c2', null), true)
  assert.equal(canChangePassword('admin', 'a1', 'a1', 'admin'), true)
  assert.equal(canChangePassword('admin', 'a1', 'a2', 'admin'), false)
  assert.equal(canChangePassword('admin', 'a1', 's1', 'super_admin'), false)
  assert.equal(canChangePassword('super_admin', 's1', 'a2', 'admin'), true)
})

test('canRollbackTarget: nunca remove admin/super_admin; só admin/super_admin executam', () => {
  assert.equal(canRollbackTarget('controller', 'controller'), false)
  assert.equal(canRollbackTarget('admin', 'controller'), true)
  assert.equal(canRollbackTarget('admin', null), true)
  assert.equal(canRollbackTarget('admin', 'admin'), false)
  assert.equal(canRollbackTarget('super_admin', 'super_admin'), false)
})

test('isRecent: dentro e fora da janela, datas inválidas e futuras', () => {
  const now = Date.parse('2026-10-07T12:00:00Z')
  assert.equal(isRecent('2026-10-07T11:45:00Z', now), true)
  assert.equal(isRecent('2026-10-07T11:29:00Z', now), false)
  assert.equal(isRecent('2026-10-07T12:05:00Z', now), false)
  assert.equal(isRecent('lixo', now), false)
  assert.equal(isRecent(null, now), false)
})
