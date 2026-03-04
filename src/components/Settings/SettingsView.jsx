import React, { useState } from 'react';
import { Settings2, Download, Upload, Cloud, ShieldCheck, RefreshCw, Image as ImageIcon, FolderOpen, HelpCircle, ChevronUp, ExternalLink, Lock, User, Link2, Info, AlertTriangle, Zap, Server, Shield, Eye, EyeOff } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { encryptData, decryptData } from '../../utils/crypto';

const SettingsView = () => {
  const { data, setData, updateData, isSyncing, setIsSyncing, setSyncProgress } = useAppData();
  const [testResult, setTestResult] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  
  // 密碼顯示開關狀態
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [showMasterPassword, setShowMasterPassword] = useState(false);

  // --- 本地備份處理 ---

  const handleFullExport = async () => {
    if (!window.electronAPI) return;
    const targetDir = await window.electronAPI.selectDirectory();
    if (!targetDir) return;

    setIsSyncing(true);
    setSyncProgress({ message: '準備匯出...' });
    try {
        const result = await window.electronAPI.exportFullBackup({ targetDir, data });
        if (result.success) {
            if (result.aborted) {
                alert('匯出已中斷');
            } else {
                alert(`完整備份匯出成功！\n路徑：${result.path}`);
            }
        } else {
            alert(`匯出失敗: ${result.error}`);
        }
    } catch (err) {
        alert(`發生錯誤: ${err.message}`);
    } finally {
        setIsSyncing(false);
        setSyncProgress(null);
    }
  };

  const handleFullImport = async () => {
    if (!window.electronAPI) return;
    const backupDir = await window.electronAPI.selectDirectory();
    if (!backupDir) return;

    if (!confirm('導入備份將覆蓋目前所有數據與圖庫，確定要繼續嗎？')) return;

    setIsSyncing(true);
    setSyncProgress({ message: '準備還原...' });
    try {
        const result = await window.electronAPI.importFullBackup(backupDir);
        if (result.success) {
            if (result.aborted) {
                alert('還原已中斷');
            } else {
                setData(prev => ({
                    ...prev,
                    ...result.data,
                    lotteryPrizes: { ...{ N: [], R: [], SR: [], SSR: [], UR: [] }, ...result.data.lotteryPrizes },
                    lotteryProbability: { ...{ N: 50, R: 25, SR: 15, SSR: 8, UR: 2 }, ...result.data.lotteryProbability }
                }));
                alert('完整數據與圖庫還原成功！');
            }
        } else {
            alert(`還原失敗: ${result.error}`);
        }
    } catch (err) {
        alert(`還原過程發生錯誤: ${err.message}`);
    } finally {
        setIsSyncing(false);
        setSyncProgress(null);
    }
  };

  const handleJsonImportOnly = (e) => {
    if (!e.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        setData(prev => ({
          ...prev,
          ...imported,
          lotteryPrizes: { ...{ N: [], R: [], SR: [], SSR: [], UR: [] }, ...imported.lotteryPrizes },
          lotteryProbability: { ...{ N: 50, R: 25, SR: 15, SSR: 8, UR: 2 }, ...imported.lotteryProbability }
        }));
        alert('JSON 數據導入成功！');
      } catch (err) {
        alert('導入失敗');
      }
    };
    reader.readAsText(e.target.files[0]);
  };

  // --- 雲端備份處理 ---

  const handleCloudConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
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
    setTestResult('測試中...');
    const result = await window.electronAPI.cloudTestConnection(data.cloudConfig);
    setTestResult(result.success ? '連線成功！' : `連線失敗: ${result.error}`);
  };

  const handleCloudUpload = async () => {
    if (!data.cloudConfig.masterPassword) {
      alert('請先設定主密碼以進行加密備份');
      return;
    }
    if (!window.electronAPI) return;
    setIsSyncing(true);
    setSyncProgress({ message: '正在加密並同步 JSON 數據...' });
    try {
      const encrypted = await encryptData(JSON.stringify(data), data.cloudConfig.masterPassword);
      const result = await window.electronAPI.cloudUpload({
        config: data.cloudConfig,
        fileName: 'lifesync_backup_e2ee.dat',
        encryptedData: encrypted
      });
      if (result.success) {
        alert('加密數據上傳成功！');
      } else {
        alert(`上傳失敗: ${result.error}`);
      }
    } catch (err) {
      alert(`加密失敗: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleCloudDownload = async () => {
    if (!data.cloudConfig.masterPassword) {
      alert('請輸入主密碼以進行解密');
      return;
    }
    if (!window.electronAPI) return;
    setIsSyncing(true);
    setSyncProgress({ message: '正在從雲端獲取數據...' });
    try {
      const result = await window.electronAPI.cloudDownload({
        config: data.cloudConfig,
        fileName: 'lifesync_backup_e2ee.dat'
      });
      if (result.success) {
        const decryptedJson = await decryptData(result.data, data.cloudConfig.masterPassword);
        const imported = JSON.parse(decryptedJson);
        setData(prev => ({ ...prev, ...imported }));
        alert('加密數據還原成功！');
      } else {
        alert(`下載失敗: ${result.error}`);
      }
    } catch (err) {
      alert(`解密失敗: ${err.message} (請檢查密碼是否正確)`);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleSyncGallery = async () => {
    if (!data.cloudConfig.masterPassword) {
        alert('請先設定主密碼以進行加密備份');
        return;
    }
    setIsSyncing(true);
    setSyncProgress({ message: '初始化圖庫同步...', current: 0, total: 100 });
    try {
        const result = await window.electronAPI.cloudSyncGallery({
            config: data.cloudConfig,
            masterPassword: data.cloudConfig.masterPassword
        });
        if (result.success) {
            if (result.aborted) {
                alert('圖庫同步已中斷');
            } else {
                const { uploaded, skipped, failed } = result.results;
                alert(`圖庫同步完成！\n新增上傳：${uploaded}\n已存在：${skipped}\n失敗：${failed}`);
            }
        } else {
            alert(`圖庫同步失敗: ${result.error}`);
        }
    } catch (err) {
        alert(`發生錯誤: ${err.message}`);
    } finally {
        setIsSyncing(false);
        setSyncProgress(null);
    }
  };

  const handleRestoreGallery = async () => {
    if (!data.cloudConfig.masterPassword) {
        alert('請輸入主密碼以進行解密');
        return;
    }
    setIsSyncing(true);
    setSyncProgress({ message: '初始化還原程序...', current: 0, total: 100 });
    try {
        const result = await window.electronAPI.cloudRestoreGallery({
            config: data.cloudConfig,
            masterPassword: data.cloudConfig.masterPassword
        });
        if (result.success) {
            if (result.aborted) {
                alert('還原已中斷');
            } else {
                const { downloaded, skipped, failed } = result.results;
                alert(`圖庫還原完成！\n新下載：${downloaded}\n本地已存在：${skipped}\n失敗：${failed}`);
            }
        } else {
            alert(`圖庫還原失敗: ${result.error}`);
        }
    } catch (err) {
        alert(`發生錯誤: ${err.message}`);
    } finally {
        setIsSyncing(false);
        setSyncProgress(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 animate-in slide-up pb-20 text-sky-950">
      
      {/* 本地完整備份 */}
      <div className="bg-white/40 backdrop-blur-xl rounded-3xl md:rounded-[48px] p-6 md:p-12 border border-white/60 shadow-xl text-center text-sky-950">
        <h2 className="text-2xl md:text-3xl font-black mb-8 md:mb-12 text-sky-900 flex items-center justify-center gap-3 md:gap-4 text-sky-950">
          <Settings2 className="w-8 h-8 md:w-10 md:h-10 text-sky-500" /> 本地完整備份
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 text-sky-950">
          <button
            disabled={isSyncing}
            onClick={handleFullExport}
            className="p-6 md:p-8 rounded-3xl md:rounded-[40px] bg-white/60 border-2 border-white hover:border-sky-400 transition-all group shadow-sm disabled:opacity-50 text-sky-950"
          >
            <FolderOpen className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-4 text-sky-500 group-hover:scale-110 transition-transform" />
            <h3 className="text-base md:text-lg font-black text-sky-900 mb-2">匯出完整備份</h3>
            <p className="text-[8px] md:text-[10px] font-bold text-sky-300 uppercase tracking-widest text-sky-950">包含所有數據與圖庫圖片</p>
          </button>
          <button
            disabled={isSyncing}
            onClick={handleFullImport}
            className="p-6 md:p-8 rounded-3xl md:rounded-[40px] bg-white/60 border-2 border-white hover:border-emerald-400 transition-all group shadow-sm disabled:opacity-50 text-sky-950"
          >
            <Upload className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <h3 className="text-base md:text-lg font-black text-sky-900 mb-2 text-sky-950">還原完整備份</h3>
            <p className="text-[8px] md:text-[10px] font-bold text-sky-300 uppercase tracking-widest text-sky-950 text-sky-950">從目錄還原數據與圖片</p>
          </button>
        </div>
        <div className="mt-6 md:mt-8 text-sky-950">
            <label className="text-[9px] md:text-[10px] font-black text-sky-300 hover:text-sky-500 cursor-pointer transition-colors text-sky-950">
                [進階] 僅匯入單一 JSON 檔案
                <input type="file" className="hidden" onChange={handleJsonImportOnly} />
            </label>
        </div>
      </div>

      {/* 雲端抗審查同步 (E2EE) */}
      <div className="bg-gradient-to-br from-sky-50/50 to-white/50 backdrop-blur-xl rounded-3xl md:rounded-[48px] p-6 md:p-12 border border-sky-100 shadow-xl text-sky-950">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 md:mb-8 gap-4 text-sky-950">
          <h2 className="text-xl md:text-2xl font-black text-sky-900 flex items-center gap-3 md:gap-4 text-sky-950">
            <Cloud className="w-6 h-6 md:w-8 md:h-8 text-sky-500" /> 雲端抗審查同步 (E2EE)
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
                            雲端同步詳細設定指南
                            <p className="text-[10px] font-bold text-sky-400 mt-0.5 md:mt-1 uppercase tracking-widest text-sky-950">Cloud Setup Guide</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 text-sky-950">
                        <div className="group space-y-3 md:space-y-4 p-5 md:p-6 bg-sky-50/50 rounded-2xl md:rounded-[32px] border border-sky-100/50 relative overflow-hidden text-sky-950">
                            <div className="absolute top-0 right-0 text-sky-100 font-black text-6xl md:text-8xl opacity-40 group-hover:scale-110 transition-transform pointer-events-none select-none leading-none -translate-y-2 translate-x-2">1</div>
                            <h4 className="font-black text-sky-600 flex items-center gap-2 relative z-10 text-sky-950 text-sm md:text-base">
                                <Link2 className="w-4 h-4 md:w-5 md:h-5" /> WebDAV 服務
                            </h4>
                            <p className="text-[11px] md:text-xs font-bold text-sky-800 leading-relaxed relative z-10 text-sky-950">
                                使用 WebDAV 協議確保數據不被審查。
                            </p>
                            <div className="space-y-2 mt-3 md:mt-4 text-sky-950 relative z-10">
                                <div className="text-[9px] md:text-[10px] font-black text-sky-400 uppercase tracking-tighter">推薦服務商：</div>
                                <a href="https://koofr.eu" target="_blank" className="flex items-center justify-between p-2.5 md:p-3 bg-white rounded-xl md:rounded-2xl border border-sky-100 hover:border-sky-400 transition-colors group/link shadow-sm text-sky-950">
                                    <span className="text-[11px] md:text-xs font-bold text-sky-900">Koofr (最推)</span>
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
                                        請在服務設定中生成專用密碼。
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="group space-y-3 md:space-y-4 p-5 md:p-6 bg-sky-50/50 rounded-2xl md:rounded-[32px] border border-sky-100/50 relative overflow-hidden text-sky-950">
                            <div className="absolute top-0 right-0 text-sky-100 font-black text-6xl md:text-8xl opacity-40 group-hover:scale-110 transition-transform pointer-events-none select-none leading-none -translate-y-2 translate-x-2 text-sky-950">3</div>
                            <h4 className="font-black text-sky-600 flex items-center gap-2 relative z-10 text-sky-950 text-sm md:text-base">
                                <Lock className="w-4 h-4 md:w-5 md:h-5 text-sky-950" /> 數據加密主密碼
                            </h4>
                            <p className="text-[11px] md:text-xs font-bold text-sky-800 leading-relaxed relative z-10 text-sky-950">
                                LifeSync 專用的二次加密金鑰。
                            </p>
                            <div className="p-3 md:p-4 bg-amber-50 rounded-xl md:rounded-2xl border border-amber-100 space-y-2 relative z-10 shadow-sm text-sky-950">
                                <p className="text-[9px] md:text-[10px] font-bold text-amber-700 leading-tight flex items-start gap-1.5 md:gap-2 text-sky-950">
                                    <AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 text-sky-950" />
                                    此密碼僅存於電腦，遺失將無法還原數據。
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
                                            設定極其簡單，連線非常穩定，歐洲隱私法律保護。
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-sky-50/30 transition-colors text-sky-950">
                                        <td className="p-5 border-b border-sky-50 font-black text-sky-900 font-mono text-sky-950 text-sky-950">Infomaniak</td>
                                        <td className="p-5 border-b border-sky-50 font-bold text-sky-700 text-sky-950 text-sky-950">15 GB</td>
                                        <td className="p-5 border-b border-sky-50 text-xs font-medium text-sky-800 text-sky-950 text-sky-950">
                                            瑞士主機，空間大。WebDAV 設定稍繁瑣（需建立專屬 K-Drive 連線）。
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-sky-50/30 transition-colors text-sky-950">
                                        <td className="p-5 border-b border-sky-50 font-black text-sky-900 text-sky-950">Nextcloud</td>
                                        <td className="p-5 border-b border-sky-50 font-bold text-sky-700 text-sky-950">自選</td>
                                        <td className="p-5 border-b border-sky-50 text-xs font-medium text-sky-800 text-sky-950">
                                            如果你有自己的 NAS 或伺服器，這是最具備掌控權的選擇。
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
                placeholder="https://koofr.eu/dav"
                className="w-full px-5 md:px-6 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-100 focus:border-sky-400 outline-none transition-all font-medium text-sky-900 text-sm shadow-sm"
              />
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
                    placeholder="16 位專用密碼"
                    className="w-full px-5 md:px-6 py-3 md:py-4 pr-12 md:pr-14 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-100 focus:border-sky-400 outline-none transition-all font-medium text-sky-900 text-sm shadow-sm"
                />
                <button 
                    onClick={() => setShowAppPassword(!showAppPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sky-300 hover:text-sky-500 transition-colors p-1"
                >
                    {showAppPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2 text-sky-950 relative">
              <label className="text-xs md:text-sm font-bold text-sky-700 ml-3 md:ml-4 text-sky-950">數據加密主密碼</label>
              <div className="relative text-sky-950">
                <input
                    type={showMasterPassword ? "text" : "password"}
                    name="masterPassword"
                    value={data.cloudConfig.masterPassword}
                    onChange={handleCloudConfigChange}
                    placeholder="遺失此密碼將無法救回數據"
                    className="w-full px-5 md:px-6 py-3 md:py-4 pr-12 md:pr-14 rounded-2xl md:rounded-3xl bg-sky-900 text-white placeholder:text-sky-400 border-2 border-sky-900 focus:border-sky-400 outline-none transition-all font-medium text-sm shadow-lg"
                />
                <button 
                    onClick={() => setShowMasterPassword(!showMasterPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sky-400 hover:text-white transition-colors p-1"
                >
                    {showMasterPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* 數據同步按鈕 */}
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
                同步數據
              </button>
              <button
                disabled={isSyncing}
                onClick={handleCloudDownload}
                className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-400 text-sky-600 font-bold hover:bg-sky-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm text-sm text-sky-950"
              >
                {isSyncing ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <RefreshCw className="w-4 h-4 md:w-5 md:h-5" />}
                還原數據
              </button>
            </div>

            {/* 圖庫同步區域 */}
            <div className="p-6 md:p-8 rounded-3xl md:rounded-[40px] bg-sky-900/5 border-2 border-dashed border-sky-200 text-sky-950">
                <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
                    <ImageIcon className="w-5 h-5 md:w-6 md:h-6 text-sky-500" />
                    <h3 className="text-base md:text-lg font-black text-sky-900 text-sky-950">雲端圖庫同步</h3>
                </div>
                <div className="flex flex-wrap gap-3 md:gap-4 text-sky-950">
                    <button
                        disabled={isSyncing}
                        onClick={handleSyncGallery}
                        className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-sky-400 text-sky-700 font-bold hover:bg-sky-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm text-sm text-sky-950"
                    >
                        {isSyncing ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Upload className="w-4 h-4 md:w-5 md:h-5" />}
                        同步圖庫
                    </button>
                    <button
                        disabled={isSyncing}
                        onClick={handleRestoreGallery}
                        className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl bg-white border-2 border-emerald-400 text-emerald-600 font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm text-sm text-sky-950"
                    >
                        {isSyncing ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Download className="w-4 h-4 md:w-5 md:h-5" />}
                        還原圖庫
                    </button>
                </div>
                <p className="mt-3 md:mt-4 text-[8px] md:text-[10px] text-sky-400 font-bold uppercase tracking-widest text-sky-950">
                    圖片逐一加密傳輸，大型圖庫需時較久。
                </p>
            </div>
          </div>

          {testResult && (
            <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl text-xs md:sm font-bold ${testResult.includes('成功') ? 'bg-emerald-100 text-emerald-600 shadow-sm' : 'bg-red-100 text-red-600 shadow-sm'}`}>
              {testResult}
            </div>
          )}

          <p className="text-[10px] md:text-xs text-sky-400 font-medium px-2 md:px-4 text-sky-950">
            * 提醒：所有雲端數據皆經過本地加密，雲端商無法讀取內容。
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
