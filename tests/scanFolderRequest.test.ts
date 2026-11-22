import { describe, it, expect } from 'vitest';
import { folderPathFromBody } from '../electron/scanFolderRequest.ts';

describe('folderPathFromBody（瀏覽器模式的掃描資料夾要求）', () => {
  it('取出 folderPath，原樣回傳', () => {
    expect(folderPathFromBody({ folderPath: 'D:\\圖片\\獎勵' })).toBe('D:\\圖片\\獎勵');
  });

  it('要求沒有內容（Express 給 undefined）、不是物件時回傳 null，不會出錯', () => {
    expect(folderPathFromBody(undefined)).toBeNull();
    expect(folderPathFromBody(null)).toBeNull();
    expect(folderPathFromBody('D:\\x')).toBeNull();
  });

  it('沒有 folderPath、不是文字或只有空白時回傳 null', () => {
    expect(folderPathFromBody({})).toBeNull();
    expect(folderPathFromBody({ folderPath: 123 })).toBeNull();
    expect(folderPathFromBody({ folderPath: '' })).toBeNull();
    expect(folderPathFromBody({ folderPath: '   ' })).toBeNull();
  });
});
