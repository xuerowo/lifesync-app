import React, { useState } from 'react';
import { Settings2, Download, Upload, Cloud, ShieldCheck, RefreshCw, Image as ImageIcon, FolderOpen, HelpCircle, ChevronUp, ExternalLink, Lock, User, Link2, Info, AlertTriangle, Zap, Server, Shield, Eye, EyeOff } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { encryptData, decryptData } from '../../utils/crypto';
import { mergeIncomingData, stripCloudSecrets, isImportableData } from '../../shared/cloudSecrets';
import {
  SNAPSHOT_REASONS, CONFIRM_BACKUP_RESTORE, CONFIRM_CLOUD_RESTORE, confirmJsonImportMessage,
  snapshotBeforeOverwrite, snapshotFailedMessage, snapshotSavedNote, canSnapshot
} from '../../domain/overwriteGuard';
import {
  cloudUploadSuccessMessage, cloudRestoreFailureMessage, galleryResultMessage, CONFIRM_CLOUD_UPLOAD
} from '../../domain/cloudUpload';
import {
  evaluateMasterPassword, masterPasswordBlockMessage, isInsecureWebdavUrl, INSECURE_URL_WARNING,
  MASTER_PASSWORD_SAVED_MESSAGE
} from '../../domain/masterPassword';

const SettingsView = () => {
  const { data, setData, updateData, isSyncing, setIsSyncing, setSyncProgress, markSecretReentered } = useAppData();
  const [testResult, setTestResult] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  
  // 密碼顯示開關狀態
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [showMasterPassword, setShowMasterPassword] = useState(false);

  // 主密碼（H11）：修改時要輸入兩次，兩次一樣、而且按了「確認主密碼」才存進資料（打字途中不會自動存）。
  // masterDraft 是主密碼欄正在改的內容（null＝沒有在改，顯示已存的主密碼）；masterConfirm 是「再輸入一次」欄。
  // 沒確認就離開設定頁，修改會被放棄，保留原本的主密碼。
  const [masterDraft, setMasterDraft] = useState(null);
  const [masterConfirm, setMasterConfirm] = useState('');
  const [masterJustSaved, setMasterJustSaved] = useState(false);
  const masterState = evaluateMasterPassword({
    saved: data.cloudConfig.masterPassword, draft: masterDraft, confirm: masterConfirm
  });
  const masterMessage = masterState.status === 'verified' && masterJustSaved
    ? MASTER_PASSWORD_SAVED_MESSAGE
    : masterState.message;

  // 打字時只更新畫面上的兩欄，不儲存
  const applyMasterInput = (nextDraft, nextConfirm) => {
    const next = evaluateMasterPassword({
      saved: data.cloudConfig.masterPassword, draft: nextDraft, confirm: nextConfirm
    });
    setMasterDraft(next.changed ? nextDraft : null);
    setMasterJustSaved(false);
    setMasterConfirm(nextConfirm);
  };
  // 「確認主密碼」按鈕（或在兩欄按 Enter）：兩次一樣才儲存
  const commitMasterPassword = () => {
    if (!masterState.canCommit) return;
    const value = masterState.value;
    updateData(prev => ({ ...prev, cloudConfig: { ...prev.cloudConfig, masterPassword: value } }));
    markSecretReentered('masterPassword');
    setMasterDraft(null);
    setMasterJustSaved(true);
  };
  const commitMasterOnEnter = (e) => {
    if (e.key === 'Enter') commitMasterPassword();
  };
  const cancelMasterEdit = () => {
    setMasterDraft(null);
    setMasterConfirm('');
    setMasterJustSaved(false);
  };

  // 主密碼還沒確認好時，雲端按鈕一律先擋下（以免用打錯、或不是畫面上那一個的主密碼加密或解密）
  const blockedByMasterPassword = (actionLabel) => {
    const message = masterPasswordBlockMessage(masterState, actionLabel);
    if (message) alert(message);
    return Boolean(message);
  };

  // --- 本機備份處理 ---

  const handleFullExport = async () => {
    if (!window.electronAPI) return;
    const targetDir = await window.electronAPI.selectDirectory();
    if (!targetDir) return;

    setIsSyncing(true);
    setSyncProgress({ message: '準備匯出……' });
    try {
        const result = await window.electronAPI.exportFullBackup({ targetDir, data });
        if (result.success) {
            if (result.aborted) {
                alert(`匯出已中斷，這份備份不完整，可以刪掉。\n路徑：${result.path}`);
            } else {
                alert(`完整備份匯出成功！\n路徑：${result.path}\n\n備份裡不含雲端密碼和主密碼；在別台電腦還原後，需要重新輸入雲端設定。`);
            }
        } else {
            alert(`匯出失敗：${result.error}`);
        }
    } catch (err) {
        alert(`匯出時發生錯誤：${err.message}`);
    } finally {
        setIsSyncing(false);
        setSyncProgress(null);
    }
  };

  const handleFullImport = async () => {
    if (!window.electronAPI) return;
    const backupDir = await window.electronAPI.selectDirectory();
    if (!backupDir) return;

    if (!confirm(CONFIRM_BACKUP_RESTORE)) return;

    setIsSyncing(true);
    setSyncProgress({ message: '正在備份目前的資料……' });
    try {
        // 覆蓋前先拍快照；失敗就整個取消，連圖庫也不動
        const snapshot = await snapshotBeforeOverwrite(window.electronAPI, { reason: SNAPSHOT_REASONS.backupRestore, data });
        if (!snapshot.ok) {
            alert(snapshotFailedMessage(snapshot));
            return;
        }
        setSyncProgress({ message: '準備還原……' });
        const result = await window.electronAPI.importFullBackup(backupDir);
        if (result.success) {
            if (result.aborted) {
                alert('還原已中斷。目前的資料沒有變動，但已經複製過來的圖庫圖片會留著（同名的圖片已被蓋掉）。');
            } else {
                // 雲端設定保留這台電腦目前的，不用備份裡的
                setData(prev => mergeIncomingData(prev, result.data));
                alert(`完整備份還原成功！資料已換成備份裡的內容，備份裡的圖片也已複製回圖庫（同名的會被蓋掉）。${snapshotSavedNote(snapshot)}`);
            }
        } else {
            alert(`還原失敗：${result.error}\n\n目前的資料沒有變動。`);
        }
    } catch (err) {
        alert(`還原時發生錯誤：${err.message}`);
    } finally {
        setIsSyncing(false);
        setSyncProgress(null);
    }
  };

  const handleJsonImportOnly = (e) => {
    const file = e.target.files[0];
    // 清空選取，取消後再選同一個檔案時才會再觸發
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let imported;
      try {
        imported = JSON.parse(ev.target.result);
      } catch {
        alert('匯入失敗：這個檔案打不開或已損壞，不是 LifeSync 匯出的資料檔。目前的資料沒有變動。');
        return;
      }
      if (!isImportableData(imported)) {
        alert('匯入失敗：這個檔案不是 LifeSync 匯出的資料檔。目前的資料沒有變動。');
        return;
      }
      // 瀏覽器模式不能拍快照，確認文字不能承諾會自動備份
      if (!confirm(confirmJsonImportMessage(file.name, { canSnapshot: canSnapshot(window.electronAPI) }))) return;
      // 覆蓋前先拍快照；失敗就不匯入
      const snapshot = await snapshotBeforeOverwrite(window.electronAPI, { reason: SNAPSHOT_REASONS.jsonImport, data });
      if (!snapshot.ok) {
        alert(snapshotFailedMessage(snapshot));
        return;
      }
      // 雲端設定保留這台電腦目前的，不用檔案裡的（檔案裡的密碼可能是加密過、這台解不開的字串）
      setData(prev => mergeIncomingData(prev, imported));
      alert(`資料匯入成功！${snapshotSavedNote(snapshot)}`);
    };
    reader.readAsText(file);
  };

  // --- 雲端備份處理 ---

  const handleCloudConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    // 重新輸入了這台電腦解不開的密碼：上方「解不開」的提示就不再適用
    if (name === 'password' && value !== '') markSecretReentered('password');
    updateData(prev => ({
      ...prev,
      cloudConfig: {
        ...prev.cloudConfig,
        [name]: type === 'checkbox' ? checked : value
      }
    }));
  };

  const testCloudConnection = async () => {
    if (!window.electronAPI) return;
    setTestResult('測試中……');
    const result = await window.electronAPI.cloudTestConnection(data.cloudConfig);
    setTestResult(result.success ? '連線成功！' : `連線失敗：${result.error}`);
  };

  const handleCloudUpload = async () => {
    if (blockedByMasterPassword('上傳到雲端')) return;
    if (!data.cloudConfig.masterPassword) {
      alert('請先在上方「資料加密主密碼」欄位設定主密碼，才能上傳。');
      return;
    }
    if (!window.electronAPI) return;
    // 上傳會整份取代雲端上的備份（原本那份另存為舊版），先確認
    if (!confirm(CONFIRM_CLOUD_UPLOAD)) return;
    setIsSyncing(true);
    setSyncProgress({ message: '正在加密並上傳……' });
    try {
      // 上傳的內容不放密碼：下載時一律保留本機的雲端設定，用不到；也少一份可能外流的密碼
      const encrypted = await encryptData(JSON.stringify(stripCloudSecrets(data)), data.cloudConfig.masterPassword);
      const result = await window.electronAPI.cloudUpload({
        config: data.cloudConfig,
        fileName: 'lifesync_backup_e2ee.dat',
        encryptedData: encrypted
      });
      if (result.success) {
        alert(cloudUploadSuccessMessage(result));
      } else {
        alert(`上傳失敗：${result.error}`);
      }
    } catch (err) {
      alert(`上傳失敗：${err.message}`);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleCloudDownload = async () => {
    if (blockedByMasterPassword('從雲端還原')) return;
    if (!data.cloudConfig.masterPassword) {
      alert('請先在上方「資料加密主密碼」欄位設定主密碼（要和上傳時用的一樣），才能從雲端還原。');
      return;
    }
    if (!window.electronAPI) return;
    if (!confirm(CONFIRM_CLOUD_RESTORE)) return;
    setIsSyncing(true);
    setSyncProgress({ message: '正在從雲端下載資料……' });
    try {
      const result = await window.electronAPI.cloudDownload({
        config: data.cloudConfig,
        fileName: 'lifesync_backup_e2ee.dat'
      });
      if (result.success) {
        const decryptedJson = await decryptData(result.data, data.cloudConfig.masterPassword);
        const imported = JSON.parse(decryptedJson);
        if (!isImportableData(imported)) throw new Error('雲端上的檔案不是 LifeSync 的資料格式');
        // 下載、解密都成功了，覆蓋前先拍快照；失敗就不覆蓋
        setSyncProgress({ message: '正在備份目前的資料……' });
        const snapshot = await snapshotBeforeOverwrite(window.electronAPI, { reason: SNAPSHOT_REASONS.cloudRestore, data });
        if (!snapshot.ok) {
          alert(snapshotFailedMessage(snapshot));
          return;
        }
        // 雲端設定保留這台電腦目前的，不用雲端那份的
        setData(prev => mergeIncomingData(prev, imported));
        alert(`已從雲端還原資料！${snapshotSavedNote(snapshot)}`);
      } else {
        alert(`下載失敗：${result.error}\n\n這台電腦上的資料沒有變動。`);
      }
    } catch (err) {
      alert(cloudRestoreFailureMessage(err));
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleSyncGallery = async () => {
    if (blockedByMasterPassword('上傳圖庫')) return;
    if (!data.cloudConfig.masterPassword) {
        alert('請先在上方「資料加密主密碼」欄位設定主密碼，才能上傳圖庫。');
        return;
    }
    setIsSyncing(true);
    setSyncProgress({ message: '準備上傳圖庫……', current: 0, total: 100 });
    try {
        const result = await window.electronAPI.cloudSyncGallery({
            config: data.cloudConfig,
            masterPassword: data.cloudConfig.masterPassword
        });
        if (result.success) {
            alert(galleryResultMessage('upload', result.results, { aborted: result.aborted }));
        } else {
            alert(`圖庫上傳失敗：${result.error}`);
        }
    } catch (err) {
        alert(`圖庫上傳時發生錯誤：${err.message}`);
    } finally {
        setIsSyncing(false);
        setSyncProgress(null);
    }
  };

  const handleRestoreGallery = async () => {
    if (blockedByMasterPassword('下載圖庫')) return;
    if (!data.cloudConfig.masterPassword) {
        alert('請先在上方「資料加密主密碼」欄位設定主密碼（要和上傳時用的一樣），才能下載圖庫。');
        return;
    }
    setIsSyncing(true);
    setSyncProgress({ message: '準備下載圖庫……', current: 0, total: 100 });
    try {
        const result = await window.electronAPI.cloudRestoreGallery({
            config: data.cloudConfig,
            masterPassword: data.cloudConfig.masterPassword
        });
        if (result.success) {
            alert(galleryResultMessage('download', result.results, { aborted: result.aborted }));
        } else {
            alert(`圖庫下載失敗：${result.error}`);
        }
    } catch (err) {
        alert(`圖庫下載時發生錯誤：${err.message}`);
    } finally {
        setIsSyncing(false);
        setSyncProgress(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 animate-in slide-up pb-20 text-sky-950">
      
      {/* 本機完整備份 */}
      <div className="bg-white/40 backdrop-blur-xl rounded-3xl md:rounded-[48px] p-6 md:p-12 border border-white/60 shadow-xl text-center text-sky-950">
        <h2 className="text-2xl md:text-3xl font-black mb-8 md:mb-12 text-sky-900 flex items-center justify-center gap-3 md:gap-4 text-sky-950">
          <Settings2 className="w-8 h-8 md:w-10 md:h-10 text-sky-500" /> 本機完整備份
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 text-sky-950">
          <button
            disabled={isSyncing}
            onClick={handleFullExport}
            className="p-6 md:p-8 rounded-3xl md:rounded-[40px] bg-white/60 border-2 border-white hover:border-sky-400 transition-all group shadow-sm disabled:opacity-50 text-sky-950"
          >
            <FolderOpen className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-4 text-sky-500 group-hover:scale-110 transition-transform" />
            <h3 className="text-base md:text-lg font-black text-sky-900 mb-2">匯出完整備份</h3>
            <p className="text-[8px] md:text-[10px] font-bold text-sky-300 uppercase tracking-widest text-sky-950">包含所有資料與圖庫圖片</p>
          </button>
          <button
            disabled={isSyncing}
            onClick={handleFullImport}
            className="p-6 md:p-8 rounded-3xl md:rounded-[40px] bg-white/60 border-2 border-white hover:border-emerald-400 transition-all group shadow-sm disabled:opacity-50 text-sky-950"
          >
            <Upload className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <h3 className="text-base md:text-lg font-black text-sky-900 mb-2 text-sky-950">還原完整備份</h3>
            <p className="text-[8px] md:text-[10px] font-bold text-sky-300 uppercase tracking-widest text-sky-950 text-sky-950">選擇之前匯出的備份資料夾來還原</p>
          </button>
        </div>
        <div className="mt-6 md:mt-8 text-sky-950">
            <label className="text-[9px] md:text-[10px] font-black text-sky-300 hover:text-sky-500 cursor-pointer transition-colors text-sky-950">
                進階：只匯入資料檔（.json，不含圖片）
                <input type="file" accept=".json,application/json" className="hidden" onChange={handleJsonImportOnly} />
            </label>
        </div>
      </div>

      {/* 雲端加密備份 */}
      <div className="bg-gradient-to-br from-sky-50/50 to-white/50 backdrop-blur-xl rounded-3xl md:rounded-[48px] p-6 md:p-12 border border-sky-100 shadow-xl text-sky-950">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 md:mb-8 gap-4 text-sky-950">
          <h2 className="text-xl md:text-2xl font-black text-sky-900 flex items-center gap-3 md:gap-4 text-sky-950">
            <Cloud className="w-6 h-6 md:w-8 md:h-8 text-sky-500" /> 雲端加密備份
          </h2>
          <div className="flex flex-wrap items-center gap-2 md:gap-4 text-sky-950">
            <button 
                onClick={() => setShowHelp(!showHelp)}
                className={`flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all font-bold text-[10px] md:text-xs ${showHelp ? 'bg-sky-500 text-white shadow-lg' : 'bg-sky-100 text-sky-500 hover:bg-sky-200'}`}
            >
                <HelpCircle className="w-3.5 h-3.5 md:w-4 md:h-4" /> 
                {showHelp ? '關閉教學' : '設定教學'}
            </button>
          </div>
        </div>

        {/* 教學區塊 */}
        {showHelp && (
            <div className="mb-8 md:mb-10 bg-white/90 rounded-3xl md:rounded-[40px] border-2 border-sky-200 overflow-hidden shadow-2xl animate-in slide-down text-sky-950">
                <div className="p-6 md:p-10 space-y-8 md:space-y-10">
                    <div className="flex items-center gap-3 md:gap-4 text-sky-900 font-black text-lg md:text-xl border-b-2 border-sky-50 pb-5 md:pb-6 text-sky-950">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-sky-500 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
                            <Info className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <div>
                            雲端加密備份設定教學
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 text-sky-950">
                        <div className="group space-y-3 md:space-y-4 p-5 md:p-6 bg-sky-50/50 rounded-2xl md:rounded-[32px] border border-sky-100/50 relative overflow-hidden text-sky-950">
                            <div className="absolute top-0 right-0 text-sky-100 font-black text-6xl md:text-8xl opacity-40 group-hover:scale-110 transition-transform pointer-events-none select-none leading-none -translate-y-2 translate-x-2">1</div>
                            <h4 className="font-black text-sky-600 flex items-center gap-2 relative z-10 text-sky-950 text-sm md:text-base">
                                <Link2 className="w-4 h-4 md:w-5 md:h-5" /> WebDAV 服務
                            </h4>
                            <p className="text-[11px] md:text-xs font-bold text-sky-800 leading-relaxed relative z-10 text-sky-950">
                                WebDAV 是很多雲端硬碟都支援的連線方式。LifeSync 會先在這台電腦把資料加密，再存到你的雲端硬碟。
                            </p>
                            <div className="space-y-2 mt-3 md:mt-4 text-sky-950 relative z-10">
                                <div className="text-[9px] md:text-[10px] font-black text-sky-400 uppercase tracking-tighter">推薦服務商：</div>
                                <a href="https://koofr.eu" target="_blank" className="flex items-center justify-between p-2.5 md:p-3 bg-white rounded-xl md:rounded-2xl border border-sky-100 hover:border-sky-400 transition-colors group/link shadow-sm text-sky-950">
                                    <span className="text-[11px] md:text-xs font-bold text-sky-900">Koofr（最推薦）</span>
                                    <ExternalLink className="w-3 h-3 text-sky-300 group-hover/link:text-sky-500" />
                                </a>
                                <a href="https://www.infomaniak.com/en/kdrive" target="_blank" className="flex items-center justify-between p-2.5 md:p-3 bg-white rounded-xl md:rounded-2xl border border-sky-100 hover:border-sky-400 transition-colors group/link shadow-sm text-sky-950">
                                    <span className="text-[11px] md:text-xs font-bold text-sky-900 font-mono">Infomaniak</span>
                                    <ExternalLink className="w-3 h-3 text-sky-300 group-hover/link:text-sky-500" />
                                </a>
                            </div>
                        </div>

                        <div className="group space-y-3 md:space-y-4 p-5 md:p-6 bg-sky-50/50 rounded-2xl md:rounded-[32px] border border-sky-100/50 relative overflow-hidden text-sky-950">
                            <div className="absolute top-0 right-0 text-sky-100 font-black text-6xl md:text-8xl opacity-40 group-hover:scale-110 transition-transform pointer-events-none select-none leading-none -translate-y-2 translate-x-2 text-sky-950">2</div>
                            <h4 className="font-black text-sky-600 flex items-center gap-2 relative z-10 text-sky-950 text-sm md:text-base">
                                <User className="w-4 h-4 md:w-5 md:h-5 text-sky-950" /> 帳號與密碼
                            </h4>
                            <div className="space-y-2 md:space-y-3 relative z-10 text-sky-950">
                                <div className="p-2.5 md:p-3 bg-white rounded-xl border border-sky-100 shadow-sm text-sky-950">
                                    <p className="text-[9px] md:text-[10px] font-black text-sky-400 mb-0.5 md:mb-1 tracking-widest text-sky-950 uppercase">使用者名稱</p>
                                    <p className="text-[11px] md:text-xs font-bold text-sky-800 leading-relaxed text-sky-950">
                                        註冊雲端服務時使用的 Email 帳號。
                                    </p>
                                </div>
                                <div className="p-2.5 md:p-3 bg-white rounded-xl border border-sky-100 shadow-sm text-sky-950">
                                    <p className="text-[9px] md:text-[10px] font-black text-sky-400 mb-0.5 md:mb-1 tracking-widest text-sky-950 uppercase">應用程式密碼</p>
                                    <p className="text-[11px] md:text-xs font-bold text-sky-800 leading-relaxed text-sky-950">
                                        到雲端服務網站的設定裡，建立一組給 LifeSync 用的「應用程式密碼」（不是你的登入密碼）。
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="group space-y-3 md:space-y-4 p-5 md:p-6 bg-sky-50/50 rounded-2xl md:rounded-[32px] border border-sky-100/50 relative overflow-hidden text-sky-950">
                            <div className="absolute top-0 right-0 text-sky-100 font-black text-6xl md:text-8xl opacity-40 group-hover:scale-110 transition-transform pointer-events-none select-none leading-none -translate-y-2 translate-x-2 text-sky-950">3</div>
                            <h4 className="font-black text-sky-600 flex items-center gap-2 relative z-10 text-sky-950 text-sm md:text-base">
                                <Lock className="w-4 h-4 md:w-5 md:h-5 text-sky-950" /> 資料加密主密碼
                            </h4>
                            <p className="text-[11px] md:text-xs font-bold text-sky-800 leading-relaxed relative z-10 text-sky-950">
                                另外設定的一組密碼，上傳前用它把資料加密；和雲端帳號密碼不同。
                            </p>
                            <div className="p-3 md:p-4 bg-amber-50 rounded-xl md:rounded-2xl border border-amber-100 space-y-2 relative z-10 shadow-sm text-sky-950">
                                <p className="text-[9px] md:text-[10px] font-bold text-amber-700 leading-tight flex items-start gap-1.5 md:gap-2 text-sky-950">
                                    <AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 text-sky-950" />
                                    這組密碼只存在這台電腦，忘記的話雲端上的備份就永遠打不開，請另外記下來。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 服務商對比表格 */}
                    <div className="space-y-6 text-sky-950">
                        <div className="flex items-center gap-2 text-sky-900 font-black text-lg text-sky-950">
                            <Server className="w-5 h-5 text-sky-500 text-sky-950" /> 不同服務商的差別
                        </div>
                        <div className="overflow-hidden rounded-[32px] border-2 border-sky-100 bg-white text-sky-950 shadow-sm">
                            <table className="w-full text-left border-collapse text-sky-950">
                                <thead className="bg-sky-50 text-sky-950">
                                    <tr className="text-sky-950">
                                        <th className="p-5 text-xs font-black text-sky-600 uppercase tracking-widest border-b border-sky-100 text-sky-950">服務商</th>
                                        <th className="p-5 text-xs font-black text-sky-600 uppercase tracking-widest border-b border-sky-100 text-sky-950">免費空間</th>
                                        <th className="p-5 text-xs font-black text-sky-600 uppercase tracking-widest border-b border-sky-100 text-sky-950">特點</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sky-950">
                                    <tr className="hover:bg-sky-50/30 transition-colors text-sky-950">
                                        <td className="p-5 border-b border-sky-50 font-black text-sky-900 text-sky-950">Koofr</td>
                                        <td className="p-5 border-b border-sky-50 font-bold text-sky-700 text-sky-950">2 GB</td>
                                        <td className="p-5 border-b border-sky-50 text-xs font-medium text-sky-800 text-sky-950">
                                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full text-[10px] mb-1">最推薦</span><br/>
                                            設定很簡單，連線穩定，受歐洲隱私法保護。
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-sky-50/30 transition-colors text-sky-950">
                                        <td className="p-5 border-b border-sky-50 font-black text-sky-900 font-mono text-sky-950 text-sky-950">Infomaniak</td>
                                        <td className="p-5 border-b border-sky-50 font-bold text-sky-700 text-sky-950 text-sky-950">15 GB</td>
                                        <td className="p-5 border-b border-sky-50 text-xs font-medium text-sky-800 text-sky-950 text-sky-950">
                                            瑞士主機，空間大。WebDAV 設定稍微麻煩（要另外建立 kDrive 的連線）。
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-sky-50/30 transition-colors text-sky-950">
                                        <td className="p-5 border-b border-sky-50 font-black text-sky-900 text-sky-950">Nextcloud</td>
                                        <td className="p-5 border-b border-sky-50 font-bold text-sky-700 text-sky-950">自選</td>
                                        <td className="p-5 border-b border-sky-50 text-xs font-medium text-sky-800 text-sky-950">
                                            如果你有自己的 NAS（家用網路硬碟）或伺服器，這是最能自己掌控的選擇。
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* URL Examples */}
                    <div className="bg-sky-50/80 p-6 md:p-8 rounded-[24px] md:rounded-[32px] border-2 border-sky-100 space-y-4 shadow-inner text-sky-950">
                        <p className="text-[10px] md:text-xs font-black text-sky-600 flex items-center gap-2">
                            <Link2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> 伺服器網址參考：
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                            <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl border border-sky-200 shadow-sm transition-transform hover:scale-[1.02]">
                                <div className="text-[8px] md:text-[9px] font-black text-sky-400 uppercase mb-1">Koofr</div>
                                <code className="text-[10px] md:text-xs text-sky-900 break-all font-mono font-bold select-all cursor-copy">https://app.koofr.net/dav/Koofr</code>
                            </div>
                            <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl border border-sky-200 shadow-sm transition-transform hover:scale-[1.02]">
                                <div className="text-[8px] md:text-[9px] font-black text-sky-400 uppercase mb-1 font-mono text-sky-950">Infomaniak</div>
                                <code className="text-[10px] md:text-xs text-sky-900 break-all font-bold select-all cursor-copy">https://connect.kdrive.infomaniak.com</code>
                            </div>
                        </div>
                    </div>
                </div>
                <button 
                    onClick={() => setShowHelp(false)}
                    className="w-full py-4 bg-sky-100 text-sky-600 font-black text-xs md:text-sm hover:bg-sky-200 transition-colors flex items-center justify-center gap-2"
                >
                    <ChevronUp className="w-4 h-4 md:w-5 h-5" /> 我明白了，收起教學
                </button>
            </div>
        )}

        <div className="space-y-4 md:space-y-6 text-left text-sky-950">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 text-sky-950">
            <div className="space-y-2">
              <label className="text-xs md:text-sm font-bold text-sky-700 ml-3 md:ml-4">WebDAV 伺服器網址</label>
              <input
                type="text"
                name="url"
                value={data.cloudConfig.url}
                onChange={handleCloudConfigChange}
                placeholder="https://app.koofr.net/dav/Koofr"
                className="w-full px-5 md:px-6 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-100 focus:border-sky-400 outline-none transition-all font-medium text-sky-900 text-sm shadow-sm"
              />
              {isInsecureWebdavUrl(data.cloudConfig.url) && (
                <p role="alert" className="flex items-start gap-2 mx-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] md:text-xs font-bold text-amber-800 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                  {INSECURE_URL_WARNING}
                </p>
              )}
            </div>
            <div className="space-y-2 text-sky-950">
              <label className="text-xs md:text-sm font-bold text-sky-700 ml-3 md:ml-4">使用者名稱</label>
              <input
                type="text"
                name="username"
                value={data.cloudConfig.username}
                onChange={handleCloudConfigChange}
                placeholder="example@email.com"
                className="w-full px-5 md:px-6 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-100 focus:border-sky-400 outline-none transition-all font-medium text-sky-900 text-sm shadow-sm"
              />
            </div>
            <div className="space-y-2 text-sky-950 relative">
              <label className="text-xs md:text-sm font-bold text-sky-700 ml-3 md:ml-4">應用程式密碼</label>
              <div className="relative">
                <input
                    type={showAppPassword ? "text" : "password"}
                    name="password"
                    value={data.cloudConfig.password}
                    onChange={handleCloudConfigChange}
                    placeholder="應用程式專用密碼"
                    className="w-full px-5 md:px-6 py-3 md:py-4 pr-12 md:pr-14 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-100 focus:border-sky-400 outline-none transition-all font-medium text-sky-900 text-sm shadow-sm"
                />
                <button 
                    type="button"
                    onClick={() => setShowAppPassword(!showAppPassword)}
                    title={showAppPassword ? '隱藏密碼' : '顯示密碼'}
                    aria-label={showAppPassword ? '隱藏密碼' : '顯示密碼'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sky-300 hover:text-sky-500 transition-colors p-1"
                >
                    {showAppPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2 text-sky-950 relative">
              <label className="text-xs md:text-sm font-bold text-sky-700 ml-3 md:ml-4 text-sky-950">資料加密主密碼</label>
              <div className="relative text-sky-950">
                <input
                    type={showMasterPassword ? "text" : "password"}
                    name="masterPassword"
                    value={masterState.value}
                    onChange={(e) => applyMasterInput(e.target.value, masterConfirm)}
                    onKeyDown={commitMasterOnEnter}
                    placeholder="忘記這組密碼，雲端備份就打不開"
                    className="w-full px-5 md:px-6 py-3 md:py-4 pr-12 md:pr-14 rounded-2xl md:rounded-3xl bg-sky-900 text-white placeholder:text-sky-400 border-2 border-sky-900 focus:border-sky-400 outline-none transition-all font-medium text-sm shadow-lg"
                />
                <button 
                    type="button"
                    onClick={() => setShowMasterPassword(!showMasterPassword)}
                    title={showMasterPassword ? '隱藏主密碼' : '顯示主密碼'}
                    aria-label={showMasterPassword ? '隱藏主密碼' : '顯示主密碼'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sky-400 hover:text-white transition-colors p-1"
                >
                    {showMasterPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2 text-sky-950 md:col-start-2">
              <label className="text-xs md:text-sm font-bold text-sky-700 ml-3 md:ml-4 text-sky-950">再輸入一次主密碼</label>
              <input
                  type={showMasterPassword ? "text" : "password"}
                  name="masterPasswordConfirm"
                  value={masterConfirm}
                  onChange={(e) => applyMasterInput(masterDraft, e.target.value)}
                  onKeyDown={commitMasterOnEnter}
                  placeholder={masterState.changed ? "修改主密碼時必填，兩次要一樣" : "修改主密碼時才需要填"}
                  autoComplete="off"
                  className="w-full px-5 md:px-6 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-sky-900 text-white placeholder:text-sky-400 border-2 border-sky-900 focus:border-sky-400 outline-none transition-all font-medium text-sm shadow-lg"
              />
              {masterMessage && (
                <p
                  role={masterState.tone === 'error' ? 'alert' : 'status'}
                  className={`mx-2 p-3 rounded-2xl text-[11px] md:text-xs font-bold leading-relaxed border ${
                    masterState.tone === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : masterState.tone === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}
                >
                  {masterMessage}
                </p>
              )}
              {masterState.changed && (
                <div className="flex flex-wrap items-center gap-3 mx-2">
                  <button
                    type="button"
                    onClick={commitMasterPassword}
                    disabled={!masterState.canCommit}
                    className="px-4 py-2 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-[11px] md:text-xs font-black shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    確認主密碼
                  </button>
                  <button
                    type="button"
                    onClick={cancelMasterEdit}
                    className="text-[11px] md:text-xs font-black text-sky-500 hover:text-sky-700 underline"
                  >
                    取消修改（改回原本的主密碼）
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 雲端備份按鈕 */}
          <div className="pt-2 md:pt-4 space-y-4">
            <div className="flex flex-wrap gap-3 md:gap-4 text-sky-950">
              <button
                onClick={testCloudConnection}
                className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-200 text-sky-700 font-bold hover:bg-sky-50 transition-all flex items-center justify-center gap-2 shadow-sm text-sm text-sky-950"
              >
                測試連線
              </button>
              <button
                disabled={isSyncing}
                onClick={handleCloudUpload}
                className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-400 text-sky-700 font-bold hover:bg-sky-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm text-sky-950"
              >
                {isSyncing ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Cloud className="w-4 h-4 md:w-5 md:h-5 text-sky-500" />}
                上傳到雲端
              </button>
              <button
                disabled={isSyncing}
                onClick={handleCloudDownload}
                className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-400 text-sky-600 font-bold hover:bg-sky-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm text-sm text-sky-950"
              >
                {isSyncing ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <RefreshCw className="w-4 h-4 md:w-5 md:h-5" />}
                從雲端還原
              </button>
            </div>

            {/* 雲端圖庫 */}
            <div className="p-6 md:p-8 rounded-3xl md:rounded-[40px] bg-sky-900/5 border-2 border-dashed border-sky-200 text-sky-950">
                <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
                    <ImageIcon className="w-5 h-5 md:w-6 md:h-6 text-sky-500" />
                    <h3 className="text-base md:text-lg font-black text-sky-900 text-sky-950">雲端圖庫備份</h3>
                </div>
                <div className="flex flex-wrap gap-3 md:gap-4 text-sky-950">
                    <button
                        disabled={isSyncing}
                        onClick={handleSyncGallery}
                        className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-400 text-sky-700 font-bold hover:bg-sky-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm text-sm text-sky-950"
                    >
                        {isSyncing ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Upload className="w-4 h-4 md:w-5 md:h-5" />}
                        上傳圖庫
                    </button>
                    <button
                        disabled={isSyncing}
                        onClick={handleRestoreGallery}
                        className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-emerald-400 text-emerald-600 font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm text-sm text-sky-950"
                    >
                        {isSyncing ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Download className="w-4 h-4 md:w-5 md:h-5" />}
                        下載圖庫
                    </button>
                </div>
                <p className="mt-3 md:mt-4 text-[8px] md:text-[10px] text-sky-400 font-bold uppercase tracking-widest text-sky-950">
                    上傳只補傳雲端還沒有的圖片，下載只補這台電腦還沒有的圖片，都不會刪除或蓋掉已有的圖片。圖片會一張一張加密後傳輸，圖片很多時會花比較久。
                </p>
            </div>
          </div>

          {testResult && (
            <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl text-xs md:sm font-bold whitespace-pre-line break-words ${testResult.includes('成功') ? 'bg-emerald-100 text-emerald-600 shadow-sm' : 'bg-red-100 text-red-600 shadow-sm'}`}>
              {testResult}
            </div>
          )}

          <p className="text-[10px] md:text-xs text-sky-400 font-medium px-2 md:px-4 text-sky-950">
            * 提醒：上傳到雲端的資料和圖片，都會先在這台電腦加密，雲端服務商看不到內容（圖片的檔名不會加密）。
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
