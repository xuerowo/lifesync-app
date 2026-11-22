import React, { useState, useEffect } from 'react';
import type { ImgHTMLAttributes } from 'react';

type IpcImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** 圖片路徑（圖庫圖片是相對於資料資料夾的 'gallery\檔名'）；沒有時顯示「載入失敗」 */
  src?: string | null;
};

/** 哪一個 src 載入的結果 */
interface LoadedImage {
  src: string | null;
  imageSrc: string | null;
  error: boolean;
}

/**
 * A component that loads images directly via Electron IPC as Base64.
 * Falls back to API endpoint in web environment.
 */
const IpcImage = ({ src, className, alt = "", ...props }: IpcImageProps) => {
  // 只記住「哪一個 src 載入的結果」；其他狀態都在畫面重繪時直接算出來，
  // 不在 effect 裡同步改狀態（React 規則不建議這樣做，會多重畫一次）
  const [loaded, setLoaded] = useState<LoadedImage>({ src: null, imageSrc: null, error: false });
  const useIpc = !!src && !!window.electronAPI;

  useEffect(() => {
    // 先記下來：下面的函式裡，型別檢查不會沿用這裡「已確認有 electronAPI」的判斷。
    // loadImage() 緊接著就呼叫、而且第一個 await 之前就會讀它，所以和原本直接讀 window.electronAPI 是同一個值
    const api = window.electronAPI;
    if (!src || !api) return;

    let isMounted = true;
    const loadImage = async () => {
      try {
        const base64 = await api.readImageBase64(src);
        if (isMounted) {
          setLoaded({ src, imageSrc: base64 || null, error: !base64 });
        }
      } catch (err) {
        console.error('[IpcImage] Error loading image:', err);
        if (isMounted) {
          setLoaded({ src, imageSrc: null, error: true });
        }
      }
    };

    loadImage();
    return () => { isMounted = false; };
  }, [src]);

  let imageSrc: string | null = null;
  let loading = false;
  let error = false;
  if (!src) {
    // 沒有圖片路徑：顯示「載入失敗」
  } else if (!useIpc) {
    // 瀏覽器模式：改向開發伺服器要圖片
    imageSrc = `/api/rewards/image?imagePath=${encodeURIComponent(src)}`;
  } else if (loaded.src !== src) {
    // 這個 src 還沒載入完成
    loading = true;
  } else {
    imageSrc = loaded.imageSrc;
    error = loaded.error;
  }

  if (loading) {
    return (
      <div className={`animate-pulse bg-sky-50 flex items-center justify-center ${className}`}>
        <div className="w-4 h-4 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className={`bg-slate-100 flex items-center justify-center text-slate-400 text-[10px] font-bold ${className}`}>
        載入失敗
      </div>
    );
  }

  return (
    <img 
      src={imageSrc} 
      className={className} 
      alt={alt} 
      {...props} 
    />
  );
};

export default IpcImage;