import { useState, useEffect } from 'react';

/**
 * Hook to load image data via Electron IPC
 * @param {string} filePath - Absolute path to the image
 * @returns {string|null} - Base64 image data or original path if not in Electron
 */
export const useImageIpc = (filePath) => {
  const [imageSrc, setImageSrc] = useState(null);

  useEffect(() => {
    if (!filePath) {
      setImageSrc(null);
      return;
    }

    if (!window.electronAPI) {
      // Web environment fallback
      setImageSrc(`/api/rewards/image?imagePath=${encodeURIComponent(filePath)}`);
      return;
    }

    let isMounted = true;
    const loadImage = async () => {
      try {
        const base64 = await window.electronAPI.readImageBase64(filePath);
        if (isMounted) {
          setImageSrc(base64 || null);
        }
      } catch (error) {
        console.error('[useImageIpc] Failed to load image:', error);
        if (isMounted) setImageSrc(null);
      }
    };

    loadImage();
    return () => { isMounted = false; };
  }, [filePath]);

  return imageSrc;
};