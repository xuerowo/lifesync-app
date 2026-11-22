import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import { createStorage, DATA_FILE_NAME, compareBackupNames, isBackupFileName } from '../electron/storage.js'
import { createDefaultData } from '../src/shared/defaultData.js'

// 假的加密：加上前綴；解密時沒有前綴就當成解不開
const fakeEncrypt = (s) => `enc:${s}`
const fakeDecrypt = (s) => {
  if (!s.startsWith('enc:')) throw new Error('cannot decrypt')
  return s.slice(4)
}

let dir
let dataFile
let backupDir
let clock

const makeStorage = (opts = {}) =>
  createStorage({
    dataDir: dir,
    encrypt: fakeEncrypt,
    decrypt: fakeDecrypt,
    now: () => clock,
    retryDelayMs: 1,
    ...opts,
  })

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'))
const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8')
const listDir = (p) => (fs.existsSync(p) ? fs.readdirSync(p).sort() : [])

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lifesync-storage-test-'))
  dataFile = path.join(dir, DATA_FILE_NAME)
  backupDir = path.join(dir, 'backups')
  clock = new Date(2026, 10, 20, 9, 30, 0)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fsp.rm(dir, { recursive: true, force: true })
})

describe('load', () => {
  it('沒有資料檔也沒有備份 → 新安裝', async () => {
    const storage = makeStorage()
    const res = await storage.load()
    expect(res.status).toBe('new')
    expect(res.data).toEqual(createDefaultData())
    expect(res.secretsUnavailable).toEqual([])
    // 新安裝允許存檔
    await storage.save({ ...res.data, majorTasks: [{ id: 'm1' }] })
    expect(readJson(dataFile).majorTasks).toEqual([{ id: 'm1' }])
  })

  it('讀到的資料會補齊欄位', async () => {
    writeJson(dataFile, { majorTasks: [{ id: 'x' }], extra: 1 })
    const res = await makeStorage().load()
    expect(res.status).toBe('ok')
    expect(res.data.majorTasks).toEqual([{ id: 'x', sortOrder: 0 }])
    expect(res.data.lotteryPrizes.UR).toEqual([])
    expect(res.data.extra).toBe(1)
  })

  it('可以讀取有 BOM 的檔案', async () => {
    fs.writeFileSync(dataFile, String.fromCharCode(0xfeff) + JSON.stringify({ notes: [{ id: 'n' }] }), 'utf-8')
    const res = await makeStorage().load()
    expect(res.status).toBe('ok')
    expect(res.data.notes).toEqual([{ id: 'n' }])
  })
})

describe('save', () => {
  it('正常讀寫往返，格式為縮排 2 的 JSON', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    const next = { ...data, subTasks: [{ id: 's1', title: '任務' }] }
    await storage.save(next)
    const text = fs.readFileSync(dataFile, 'utf-8')
    expect(text).toBe(JSON.stringify({ ...next, cloudConfig: { ...next.cloudConfig } }, null, 2))

    const again = await makeStorage().load()
    expect(again.status).toBe('ok')
    expect(again.data.subTasks).toEqual([{ id: 's1', title: '任務', sortOrder: 0 }])
  })

  it('寫入後資料夾內沒有殘留的 .tmp 檔', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    await storage.save(data)
    await storage.save({ ...data, rules: [1] })
    storage.saveSync({ ...data, rules: [2] })
    const leftovers = [...listDir(dir), ...listDir(backupDir)].filter((f) => f.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('不修改傳入的物件', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    const input = { ...data, cloudConfig: { ...data.cloudConfig, password: 'pw' } }
    const before = JSON.stringify(input)
    await storage.save(input)
    storage.saveSync(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('從未 load 就存檔會被擋下', async () => {
    const storage = makeStorage()
    await expect(storage.save(createDefaultData())).rejects.toMatchObject({ code: 'SAVE_BLOCKED' })
    expect(() => storage.saveSync(createDefaultData())).toThrow(expect.objectContaining({ code: 'SAVE_BLOCKED' }))
    expect(fs.existsSync(dataFile)).toBe(false)
  })

  it('並發多次 save，最後的內容是最後一次', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    const saves = []
    for (let i = 0; i < 10; i++) {
      saves.push(storage.save({ ...data, lotteryTickets: i }))
    }
    await Promise.all(saves)
    expect(readJson(dataFile).lotteryTickets).toBe(9)
  })

  it('saveSync 之後，較舊的非同步 save 不會蓋掉它', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    const older = storage.save({ ...data, lotteryTickets: 1 })
    storage.saveSync({ ...data, lotteryTickets: 2 })
    const result = await older
    expect(result.superseded).toBe(true)
    expect(readJson(dataFile).lotteryTickets).toBe(2)
    // 之後的新存檔照常生效
    await storage.save({ ...data, lotteryTickets: 3 })
    expect(readJson(dataFile).lotteryTickets).toBe(3)
  })

  it('非同步改名進行中發生 saveSync，最後仍是較新的內容', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    await storage.save(data)
    const realRename = fsp.rename
    let syncDone = false
    vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
      // 模擬：改名已送出、尚未完成時，關窗前的同步存檔先完成
      if (!syncDone && to.endsWith(DATA_FILE_NAME)) {
        syncDone = true
        storage.saveSync({ ...data, lotteryTickets: 20 })
      }
      return realRename(from, to)
    })
    await storage.save({ ...data, lotteryTickets: 10 })
    expect(readJson(dataFile).lotteryTickets).toBe(20)
  })

  it('改名暫時失敗（EPERM/EBUSY）會重試', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    const realRename = fsp.rename
    let calls = 0
    vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
      calls++
      if (calls <= 2) throw Object.assign(new Error('locked'), { code: calls === 1 ? 'EPERM' : 'EBUSY' })
      return realRename(from, to)
    })
    await storage.save({ ...data, lotteryTickets: 5 })
    expect(calls).toBe(3)
    expect(readJson(dataFile).lotteryTickets).toBe(5)
  })

  it('saveSync 的改名暫時失敗也會重試', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    const realRenameSync = fs.renameSync
    let calls = 0
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      calls++
      if (calls === 1) throw Object.assign(new Error('locked'), { code: 'EACCES' })
      return realRenameSync(from, to)
    })
    storage.saveSync({ ...data, lotteryTickets: 6 })
    expect(calls).toBe(2)
    expect(readJson(dataFile).lotteryTickets).toBe(6)
  })

  it('改名一直失敗 → 丟錯、刪掉暫存檔、原檔不變', async () => {
    writeJson(dataFile, { lotteryTickets: 1 })
    const storage = makeStorage()
    const { data } = await storage.load()
    vi.spyOn(fsp, 'rename').mockRejectedValue(Object.assign(new Error('locked'), { code: 'EBUSY' }))
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('locked'), { code: 'EBUSY' })
    })
    await expect(storage.save({ ...data, lotteryTickets: 99 })).rejects.toMatchObject({ code: 'EBUSY' })
    expect(() => storage.saveSync({ ...data, lotteryTickets: 98 })).toThrow()
    expect(fsp.rename).toHaveBeenCalledTimes(6)
    expect(listDir(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(readJson(dataFile).lotteryTickets).toBe(1)
  })

  it('不可重試的錯誤不會重試', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    vi.spyOn(fsp, 'rename').mockRejectedValue(Object.assign(new Error('nope'), { code: 'EXDEV' }))
    await expect(storage.save(data)).rejects.toMatchObject({ code: 'EXDEV' })
    expect(fsp.rename).toHaveBeenCalledTimes(1)
  })

  it('一次失敗不會卡住後面的存檔', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    const spy = vi.spyOn(fsp, 'rename').mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'EXDEV' }))
    await expect(storage.save({ ...data, lotteryTickets: 1 })).rejects.toBeTruthy()
    spy.mockRestore()
    await storage.save({ ...data, lotteryTickets: 2 })
    expect(readJson(dataFile).lotteryTickets).toBe(2)
  })
})

describe('讀檔失敗時禁止存檔', () => {
  it('JSON 損壞 → error，save/saveSync 都被擋下，原檔不變', async () => {
    const broken = '{"majorTasks": [ {"id": 1'
    fs.writeFileSync(dataFile, broken, 'utf-8')
    const storage = makeStorage()
    const res = await storage.load()
    expect(res.status).toBe('error')
    expect(res.code).toBe('PARSE_ERROR')
    await expect(storage.save(createDefaultData())).rejects.toMatchObject({ code: 'SAVE_BLOCKED' })
    expect(() => storage.saveSync(createDefaultData())).toThrow(expect.objectContaining({ code: 'SAVE_BLOCKED' }))
    expect(fs.readFileSync(dataFile, 'utf-8')).toBe(broken)
    expect(listDir(dir)).toEqual([DATA_FILE_NAME])
  })

  it('空檔案（寫到一半斷電）→ error', async () => {
    fs.writeFileSync(dataFile, '', 'utf-8')
    const res = await makeStorage().load()
    expect(res).toMatchObject({ status: 'error', code: 'PARSE_ERROR' })
  })

  it('內容不是物件（例如 null 或陣列）→ error', async () => {
    fs.writeFileSync(dataFile, 'null', 'utf-8')
    expect((await makeStorage().load()).status).toBe('error')
    fs.writeFileSync(dataFile, '[]', 'utf-8')
    expect((await makeStorage().load()).status).toBe('error')
  })

  it('資料檔不見、backups 裡只有不是程式建立的 .json → 當作新安裝', async () => {
    fs.mkdirSync(backupDir)
    writeJson(path.join(backupDir, 'my-notes.json'), { a: 1 })
    const res = await makeStorage().load()
    expect(res.status).toBe('new')
  })

  it('資料檔不見但有備份 → MISSING_WITH_BACKUPS，且被擋下', async () => {
    fs.mkdirSync(backupDir)
    writeJson(path.join(backupDir, 'lifesync-data-2026-11-19.json'), { lotteryTickets: 3 })
    const storage = makeStorage()
    const res = await storage.load()
    expect(res).toMatchObject({ status: 'error', code: 'MISSING_WITH_BACKUPS' })
    await expect(storage.save(createDefaultData())).rejects.toMatchObject({ code: 'SAVE_BLOCKED' })
    expect(() => storage.saveSync(createDefaultData())).toThrow()
    expect(fs.existsSync(dataFile)).toBe(false)
  })

  it('其他讀檔錯誤（例如路徑是資料夾）→ error', async () => {
    fs.mkdirSync(dataFile)
    const res = await makeStorage().load()
    expect(res.status).toBe('error')
    expect(typeof res.code).toBe('string')
  })
})

describe('每日備份', () => {
  it('每天第一次存檔前備份原檔；同一天不重複備份', async () => {
    writeJson(dataFile, { lotteryTickets: 1 })
    const storage = makeStorage()
    const { data } = await storage.load()
    await storage.save({ ...data, lotteryTickets: 2 })
    await storage.save({ ...data, lotteryTickets: 3 })
    const backup = path.join(backupDir, 'lifesync-data-2026-11-20.json')
    expect(listDir(backupDir)).toEqual(['lifesync-data-2026-11-20.json'])
    expect(readJson(backup).lotteryTickets).toBe(1)

    // 隔天：備份的是前一天最後的內容
    clock = new Date(2026, 10, 21, 0, 5, 0)
    storage.saveSync({ ...data, lotteryTickets: 4 })
    expect(readJson(path.join(backupDir, 'lifesync-data-2026-11-21.json')).lotteryTickets).toBe(3)
    expect(readJson(dataFile).lotteryTickets).toBe(4)
  })

  it('新安裝第一次存檔時沒有原檔，不建立備份', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    await storage.save(data)
    expect(listDir(backupDir)).toEqual([])
  })

  it('只保留最新 N 份', async () => {
    writeJson(dataFile, { lotteryTickets: 0 })
    const storage = makeStorage({ maxDailyBackups: 3 })
    const { data } = await storage.load()
    for (let day = 1; day <= 6; day++) {
      clock = new Date(2026, 0, day, 12, 0, 0)
      await storage.save({ ...data, lotteryTickets: day })
    }
    expect(listDir(backupDir)).toEqual([
      'lifesync-data-2026-01-04.json',
      'lifesync-data-2026-01-05.json',
      'lifesync-data-2026-01-06.json',
    ])
    expect(readJson(path.join(backupDir, 'lifesync-data-2026-01-06.json')).lotteryTickets).toBe(5)
  })
})

describe('快照', () => {
  it('建立快照並獨立計數，不會擠掉每日備份', async () => {
    writeJson(dataFile, { lotteryTickets: 1 })
    const storage = makeStorage({ maxDailyBackups: 2, maxSnapshots: 2 })
    const { data } = await storage.load()
    await storage.save({ ...data, lotteryTickets: 2 })

    const paths = []
    for (let i = 0; i < 4; i++) {
      clock = new Date(2026, 10, 20, 10, 0, i)
      paths.push(await storage.snapshot('cloud-download'))
    }
    expect(path.basename(paths[0])).toBe('snapshot-20261120-100000-cloud-download.json')
    expect(readJson(paths[3]).lotteryTickets).toBe(2)

    const files = listDir(backupDir)
    expect(files.filter((f) => f.startsWith('snapshot-'))).toEqual([
      'snapshot-20261120-100002-cloud-download.json',
      'snapshot-20261120-100003-cloud-download.json',
    ])
    expect(files).toContain('lifesync-data-2026-11-20.json')
  })

  it('同一秒內的快照不會互相覆蓋；原因中的特殊字元會被替換', async () => {
    writeJson(dataFile, { lotteryTickets: 1 })
    const storage = makeStorage()
    await storage.load()
    const a = await storage.snapshot('a/b')
    const b = await storage.snapshot('a/b')
    expect(a).not.toBe(b)
    expect(path.dirname(a)).toBe(backupDir)
    expect(path.basename(a)).toBe('snapshot-20261120-093000-a_b.json')
  })

  it('沒有原檔時回傳 null', async () => {
    const storage = makeStorage()
    expect(await storage.snapshot('x')).toBeNull()
  })

  it('同一秒內 3 份快照、只留 2 份時，刪掉的是第 1 份（不是依字串排序刪掉 -2）', async () => {
    writeJson(dataFile, { lotteryTickets: 1 })
    const storage = makeStorage({ maxSnapshots: 2 })
    await storage.load()
    const first = await storage.snapshot('import')
    const second = await storage.snapshot('import')
    const third = await storage.snapshot('import')
    expect(path.basename(second)).toBe('snapshot-20261120-093000-import-2.json')
    expect(path.basename(third)).toBe('snapshot-20261120-093000-import-3.json')
    expect(fs.existsSync(first)).toBe(false)
    expect(fs.existsSync(second)).toBe(true)
    expect(fs.existsSync(third)).toBe(true)
  })

  it('原因結尾是「-數字」時改成「_數字」，不會和同一秒內的序號混淆', async () => {
    writeJson(dataFile, { lotteryTickets: 1 })
    const storage = makeStorage()
    await storage.load()
    expect(path.basename(await storage.snapshot('x-2'))).toBe('snapshot-20261120-093000-x_2.json')
  })

  it('上次讀檔失敗而且資料檔還是壞的 → SNAPSHOT_BLOCKED，不拍快照，舊快照不會被擠掉', async () => {
    fs.mkdirSync(backupDir)
    const good = path.join(backupDir, 'snapshot-20261119-120000-import.json')
    writeJson(good, { lotteryTickets: 7 })
    fs.writeFileSync(dataFile, '{ broken', 'utf-8')
    const storage = makeStorage({ maxSnapshots: 1 })
    expect((await storage.load()).status).toBe('error')
    await expect(storage.snapshot('x')).rejects.toMatchObject({ code: 'SNAPSHOT_BLOCKED' })
    await expect(storage.snapshotCurrent('x')).rejects.toMatchObject({ code: 'SNAPSHOT_BLOCKED' })
    expect(listDir(backupDir)).toEqual(['snapshot-20261119-120000-import.json'])
  })

  it('上次讀檔失敗、但資料檔現在已經讀得出來 → 照常拍快照', async () => {
    fs.writeFileSync(dataFile, '{ broken', 'utf-8')
    const storage = makeStorage()
    await storage.load()
    writeJson(dataFile, { lotteryTickets: 3 })
    expect(readJson(await storage.snapshot('x')).lotteryTickets).toBe(3)
  })
})

describe('備份檔名', () => {
  it('compareBackupNames：先比時間，同一秒再比序號', () => {
    const names = [
      'snapshot-20261120-093000-a-2.json',
      'snapshot-20261120-093001-a.json',
      'snapshot-20261120-093000-a.json',
      'snapshot-20261120-093000-a-10.json',
      'snapshot-20261119-235959-before-cloud-restore.json',
    ]
    expect([...names].sort(compareBackupNames)).toEqual([
      'snapshot-20261119-235959-before-cloud-restore.json',
      'snapshot-20261120-093000-a.json',
      'snapshot-20261120-093000-a-2.json',
      'snapshot-20261120-093000-a-10.json',
      'snapshot-20261120-093001-a.json',
    ])
    expect(['lifesync-data-2026-11-20.json', 'lifesync-data-2026-01-05.json'].sort(compareBackupNames)).toEqual([
      'lifesync-data-2026-01-05.json',
      'lifesync-data-2026-11-20.json',
    ])
  })

  it('isBackupFileName：只認每日備份與快照', () => {
    expect(isBackupFileName('lifesync-data-2026-11-20.json')).toBe(true)
    expect(isBackupFileName('snapshot-20261120-093000-import.json')).toBe(true)
    expect(isBackupFileName('snapshot-20261120-093000.json')).toBe(true)
    expect(isBackupFileName('my-notes.json')).toBe(false)
    expect(isBackupFileName('lifesync-data.json')).toBe(false)
  })
})

describe('snapshotCurrent：覆蓋前先存好畫面上的資料再拍快照', () => {
  it('快照包含傳入的最新資料（還沒被存檔排程寫入的修改）', async () => {
    writeJson(dataFile, { lotteryTickets: 1 })
    const storage = makeStorage()
    const { data } = await storage.load()
    const snap = await storage.snapshotCurrent('before-cloud-restore', { ...data, lotteryTickets: 7 })
    expect(path.basename(snap)).toBe('snapshot-20261120-093000-before-cloud-restore.json')
    expect(readJson(snap).lotteryTickets).toBe(7)
    expect(readJson(dataFile).lotteryTickets).toBe(7)
  })

  it('密碼在快照裡和資料檔一樣是加密的', async () => {
    writeJson(dataFile, { lotteryTickets: 1 })
    const storage = makeStorage()
    const { data } = await storage.load()
    const snap = await storage.snapshotCurrent('x', { ...data, cloudConfig: { ...data.cloudConfig, password: 'pw' } })
    expect(readJson(snap).cloudConfig.password).toBe('enc:pw')
  })

  it('沒傳資料時只拍現有檔案', async () => {
    writeJson(dataFile, { lotteryTickets: 4 })
    const storage = makeStorage()
    await storage.load()
    expect(readJson(await storage.snapshotCurrent('x')).lotteryTickets).toBe(4)
  })

  it('資料沒成功載入時存檔被擋下，丟錯而且不拍快照', async () => {
    fs.writeFileSync(dataFile, '{ broken', 'utf-8')
    const storage = makeStorage()
    await storage.load()
    await expect(storage.snapshotCurrent('x', { lotteryTickets: 9 })).rejects.toMatchObject({ code: 'SAVE_BLOCKED' })
    expect(listDir(backupDir)).toEqual([])
  })
})

describe('restoreLatestBackup', () => {
  it('保留壞檔並用最新可用的備份還原', async () => {
    fs.mkdirSync(backupDir)
    const older = path.join(backupDir, 'lifesync-data-2026-11-18.json')
    const newer = path.join(backupDir, 'lifesync-data-2026-11-19.json')
    const newestBroken = path.join(backupDir, 'snapshot-20261120-080000-x.json')
    writeJson(older, { lotteryTickets: 18 })
    writeJson(newer, { lotteryTickets: 19 })
    fs.writeFileSync(newestBroken, '{ broken', 'utf-8')
    fs.utimesSync(older, new Date(2026, 10, 18), new Date(2026, 10, 18))
    fs.utimesSync(newer, new Date(2026, 10, 19), new Date(2026, 10, 19))
    fs.utimesSync(newestBroken, new Date(2026, 10, 20), new Date(2026, 10, 20))

    fs.writeFileSync(dataFile, 'garbage', 'utf-8')
    const storage = makeStorage()
    expect((await storage.load()).status).toBe('error')

    const res = await storage.restoreLatestBackup()
    expect(res.status).toBe('ok')
    expect(res.data.lotteryTickets).toBe(19)
    expect(res.restoredFrom).toBe(newer)
    expect(res.restoredFromTime).toBe(new Date(2026, 10, 19).toISOString())
    expect(res.preservedAs).toBe(path.join(dir, 'lifesync-data.corrupt-20261120-093000.json'))
    expect(fs.readFileSync(path.join(dir, 'lifesync-data.corrupt-20261120-093000.json'), 'utf-8')).toBe('garbage')
    expect(readJson(dataFile).lotteryTickets).toBe(19)
    // 備份本身保持不變
    expect(readJson(newer).lotteryTickets).toBe(19)
    // 還原後可以正常存檔
    await storage.save({ ...res.data, lotteryTickets: 20 })
    expect(readJson(dataFile).lotteryTickets).toBe(20)
  })

  it('資料檔不見時也能還原', async () => {
    fs.mkdirSync(backupDir)
    writeJson(path.join(backupDir, 'snapshot-20261119-120000-import.json'), { lotteryTickets: 7 })
    const storage = makeStorage()
    expect((await storage.load()).code).toBe('MISSING_WITH_BACKUPS')
    const res = await storage.restoreLatestBackup()
    expect(res.status).toBe('ok')
    expect(res.data.lotteryTickets).toBe(7)
    // 沒有壞檔可以保留
    expect(res.preservedAs).toBeNull()
  })

  it('同一秒內還原兩次，兩份壞檔都保留，不會互相蓋掉', async () => {
    fs.mkdirSync(backupDir)
    writeJson(path.join(backupDir, 'lifesync-data-2026-11-19.json'), { lotteryTickets: 3 })
    const first = path.join(dir, 'lifesync-data.corrupt-20261120-093000.json')
    fs.writeFileSync(first, 'old garbage', 'utf-8')
    fs.writeFileSync(dataFile, 'new garbage', 'utf-8')
    const storage = makeStorage()
    await storage.load()
    const res = await storage.restoreLatestBackup()
    expect(res.preservedAs).toBe(path.join(dir, 'lifesync-data.corrupt-20261120-093000-2.json'))
    expect(fs.readFileSync(first, 'utf-8')).toBe('old garbage')
    expect(fs.readFileSync(res.preservedAs, 'utf-8')).toBe('new garbage')
  })

  it('資料讀得好好的時候不允許還原（RESTORE_NOT_ALLOWED），資料檔不會被改名', async () => {
    fs.mkdirSync(backupDir)
    writeJson(path.join(backupDir, 'lifesync-data-2026-11-19.json'), { lotteryTickets: 3 })
    writeJson(dataFile, { lotteryTickets: 9 })
    const storage = makeStorage()
    expect((await storage.load()).status).toBe('ok')
    const res = await storage.restoreLatestBackup()
    expect(res).toMatchObject({ status: 'error', code: 'RESTORE_NOT_ALLOWED' })
    expect(readJson(dataFile).lotteryTickets).toBe(9)
    expect(listDir(dir).filter((f) => f.includes('.corrupt-'))).toEqual([])
    // 從沒讀過檔也一樣不允許
    expect(await makeStorage().restoreLatestBackup()).toMatchObject({ code: 'RESTORE_NOT_ALLOWED' })
  })

  it('沒有可用備份 → NO_BACKUP，不動原檔', async () => {
    fs.writeFileSync(dataFile, 'garbage', 'utf-8')
    const storage = makeStorage()
    await storage.load()
    const res = await storage.restoreLatestBackup()
    expect(res).toMatchObject({ status: 'error', code: 'NO_BACKUP' })
    expect(fs.readFileSync(dataFile, 'utf-8')).toBe('garbage')
    await expect(storage.save(createDefaultData())).rejects.toMatchObject({ code: 'SAVE_BLOCKED' })
  })
})

describe('密碼加密', () => {
  it('存檔時加密、讀檔時解密', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    await storage.save({ ...data, cloudConfig: { ...data.cloudConfig, password: 'pw', masterPassword: 'mk' } })
    const onDisk = readJson(dataFile).cloudConfig
    expect(onDisk.password).toBe('enc:pw')
    expect(onDisk.masterPassword).toBe('enc:mk')

    const res = await makeStorage().load()
    expect(res.data.cloudConfig.password).toBe('pw')
    expect(res.data.cloudConfig.masterPassword).toBe('mk')
    expect(res.secretsUnavailable).toEqual([])
  })

  it('空密碼不加密', async () => {
    const storage = makeStorage()
    const { data } = await storage.load()
    await storage.save(data)
    expect(readJson(dataFile).cloudConfig.password).toBe('')
  })

  it('解不開 → 畫面拿到空白；沒重新輸入就寫回原本的加密字串；輸入新密碼後改寫', async () => {
    writeJson(dataFile, {
      cloudConfig: { type: 'webdav', url: 'u', username: 'n', password: 'OTHER-MACHINE', masterPassword: 'enc:mk', enabled: true },
    })
    const storage = makeStorage()
    const res = await storage.load()
    expect(res.status).toBe('ok')
    expect(res.data.cloudConfig.password).toBe('')
    expect(res.data.cloudConfig.masterPassword).toBe('mk')
    expect(res.secretsUnavailable).toEqual(['password'])

    await storage.save(res.data)
    expect(readJson(dataFile).cloudConfig.password).toBe('OTHER-MACHINE')
    expect(readJson(dataFile).cloudConfig.masterPassword).toBe('enc:mk')
    storage.saveSync(res.data)
    expect(readJson(dataFile).cloudConfig.password).toBe('OTHER-MACHINE')

    await storage.save({ ...res.data, cloudConfig: { ...res.data.cloudConfig, password: 'new' } })
    expect(readJson(dataFile).cloudConfig.password).toBe('enc:new')
    // 之後即使畫面又是空白，也不會再寫回舊的加密字串
    await storage.save({ ...res.data, cloudConfig: { ...res.data.cloudConfig, password: '' } })
    expect(readJson(dataFile).cloudConfig.password).toBe('')
  })

  it('預設的加解密函式原樣存取（瀏覽器模式）', async () => {
    const storage = createStorage({ dataDir: dir })
    const { data } = await storage.load()
    await storage.save({ ...data, cloudConfig: { ...data.cloudConfig, password: 'plain' } })
    expect(readJson(dataFile).cloudConfig.password).toBe('plain')
    expect((await createStorage({ dataDir: dir }).load()).data.cloudConfig.password).toBe('plain')
  })
})
