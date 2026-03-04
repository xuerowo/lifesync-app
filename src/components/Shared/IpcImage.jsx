import React, { useState, useEffect } from 'react';

/**
 * A component that loads images directly via Electron IPC as Base64.
 * Falls back to API endpoint in web environment.
 */
const IpcImage = ({ src, className, alt = "", ...props }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setImageSrc(null);
      setLoading(false);
      return;
    }

    if (!window.electronAPI) {
      // Web environment fallback
      setImageSrc(`/api/rewards/image?imagePath=${encodeURIComponent(src)}`);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const loadImage = async () => {
      setLoading(true);
      setError(false);
      try {
        const base64 = await window.electronAPI.readImageBase64(src);
        if (isMounted) {
          if (base64) {
            setImageSrc(base64);
          } else {
            setError(true);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('[IpcImage] Error loading image:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadImage();
    return () => { isMounted = false; };
  }, [src]);

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