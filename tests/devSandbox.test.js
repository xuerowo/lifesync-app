import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import { createSandbox, isSandboxDir } from '../scripts/dev-sandbox.js'

let root

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'lifesync-sandbox-test-'))
})

afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true })
})

describe('dev-sandbox createSandbox', () => {
  it('沒有來源時建立空的沙盒資料夾', () => {
    const dir = createSandbox(null, root)
    expect(path.dirname(dir)).toBe(root)
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('複製來源資料、清掉雲端設定，且不改動來源', () => {
    const source = path.join(root, 'source.json')
    const original = JSON.stringify({
      majorTasks: [{ id: 'm' }],
      cloudConfig: { type: 'webdav', url: 'https://dav', username: 'me', password: 'enc', masterPassword: 'enc2', enabled: true },
    }, null, 2)
    fs.writeFileSync(source, original, 'utf-8')

    const dir = createSandbox(source, root)
    const copied = JSON.parse(fs.readFileSync(path.join(dir, 'lifesync-data.json'), 'utf-8'))
    expect(copied.majorTasks).toEqual([{ id: 'm' }])
    expect(copied.cloudConfig).toEqual({
      type: 'webdav', url: '', username: '', password: '', masterPassword: '', enabled: false,
    })
    expect(fs.readFileSync(source, 'utf-8')).toBe(original)
  })

  it('來源無效時丟錯，不留下沙盒資料夾', () => {
    const source = path.join(root, 'bad.json')
    fs.writeFileSync(source, '{ broken', 'utf-8')
    expect(() => createSandbox(source, root)).toThrow(/JSON/)
    expect(() => createSandbox(path.join(root, 'missing.json'), root)).toThrow()
    expect(fs.readdirSync(root)).toEqual(['bad.json'])
  })
})

describe('dev-sandbox isSandboxDir', () => {
  it('只接受暫存資料夾底下、名稱正確的沙盒', () => {
    const dir = createSandbox(null, root)
    expect(isSandboxDir(dir, root)).toBe(true)
    expect(isSandboxDir(root, root)).toBe(false)
    expect(isSandboxDir(path.join(root, 'lifesync-sandbox-missing'), root)).toBe(false)
    const other = path.join(root, 'data')
    fs.mkdirSync(other)
    expect(isSandboxDir(other, root)).toBe(false)
    expect(isSandboxDir(dir, os.tmpdir())).toBe(false)
  })
})
