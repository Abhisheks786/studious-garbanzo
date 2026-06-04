// ═══════════════════════════════════════════════════════════════
//  ASSET MANAGER — Resource loading, caching, preloading
// ═══════════════════════════════════════════════════════════════
// Handles: Audio preload, sprite sheets, data files, cleanup

import { EventBus, GameEvents } from './EventBus.js';

export class AssetManager {
  constructor(options = {}) {
    this.basePath = options.basePath || '';
    this.audioContext = options.audioContext || null;
    
    // Resource caches
    this._audioCache = new Map();      // audioId -> AudioBuffer
    this._imageCache = new Map();      // imageId -> Image
    this._dataCache = new Map();       // dataId -> parsed JSON
    
    // Loading states
    this._loading = new Map();         // assetId -> Promise
    this._loaded = new Set();          // Successfully loaded
    this._failed = new Set();          // Failed to load
    
    // Statistics
    this._totalLoadTime = 0;
    this._loadStats = {
      audio: { count: 0, duration: 0 },
      images: { count: 0, duration: 0 },
      data: { count: 0, duration: 0 },
    };
  }

  /**
   * Load audio file
   * Returns cached version if already loaded
   */
  async loadAudio(audioId, url) {
    if (this._audioCache.has(audioId)) {
      return this._audioCache.get(audioId);
    }

    if (this._loading.has(audioId)) {
      return this._loading.get(audioId);
    }

    const loadPromise = this._loadAudioFile(audioId, url);
    this._loading.set(audioId, loadPromise);

    try {
      const buffer = await loadPromise;
      this._loaded.add(audioId);
      this._loading.delete(audioId);
      return buffer;
    } catch (error) {
      this._failed.add(audioId);
      this._loading.delete(audioId);
      throw error;
    }
  }

  async _loadAudioFile(audioId, url) {
    const startTime = performance.now();
    const fullUrl = this.basePath + url;

    try {
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this._audioCache.set(audioId, buffer);
      this._loadStats.audio.duration += performance.now() - startTime;
      this._loadStats.audio.count++;
      
      console.log(`✓ Audio loaded: ${audioId} (${(buffer.duration).toFixed(1)}s)`);
      return buffer;

    } catch (error) {
      console.error(`✗ Audio load failed: ${audioId}`, error);
      throw error;
    }
  }

  /**
   * Load image
   */
  async loadImage(imageId, url) {
    if (this._imageCache.has(imageId)) {
      return this._imageCache.get(imageId);
    }

    if (this._loading.has(imageId)) {
      return this._loading.get(imageId);
    }

    const loadPromise = new Promise((resolve, reject) => {
      const img = new Image();
      const startTime = performance.now();
      
      img.onload = () => {
        this._imageCache.set(imageId, img);
        this._loaded.add(imageId);
        this._loading.delete(imageId);
        this._loadStats.images.duration += performance.now() - startTime;
        this._loadStats.images.count++;
        console.log(`✓ Image loaded: ${imageId}`);
        resolve(img);
      };

      img.onerror = () => {
        this._failed.add(imageId);
        this._loading.delete(imageId);
        reject(new Error(`Failed to load image: ${imageId}`));
      };

      img.src = this.basePath + url;
    });

    this._loading.set(imageId, loadPromise);
    return loadPromise;
  }

  /**
   * Load JSON data
   */
  async loadData(dataId, url) {
    if (this._dataCache.has(dataId)) {
      return this._dataCache.get(dataId);
    }

    if (this._loading.has(dataId)) {
      return this._loading.get(dataId);
    }

    const loadPromise = this._loadDataFile(dataId, url);
    this._loading.set(dataId, loadPromise);

    try {
      const data = await loadPromise;
      this._loaded.add(dataId);
      this._loading.delete(dataId);
      return data;
    } catch (error) {
      this._failed.add(dataId);
      this._loading.delete(dataId);
      throw error;
    }
  }

  async _loadDataFile(dataId, url) {
    const startTime = performance.now();
    try {
      const response = await fetch(this.basePath + url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._dataCache.set(dataId, data);
      this._loadStats.data.duration += performance.now() - startTime;
      this._loadStats.data.count++;
      console.log(`✓ Data loaded: ${dataId}`);
      return data;
    } catch (error) {
      console.error(`✗ Data load failed: ${dataId}`, error);
      throw error;
    }
  }

  /**
   * Preload multiple assets
   */
  async preloadBatch(batch) {
    const promises = [];
    
    for (const asset of batch) {
      if (asset.type === 'audio') {
        promises.push(this.loadAudio(asset.id, asset.url));
      } else if (asset.type === 'image') {
        promises.push(this.loadImage(asset.id, asset.url));
      } else if (asset.type === 'data') {
        promises.push(this.loadData(asset.id, asset.url));
      }
    }

    return Promise.all(promises);
  }

  /**
   * Get cached asset
   */
  get(assetId) {
    return this._audioCache.get(assetId) 
        || this._imageCache.get(assetId) 
        || this._dataCache.get(assetId) 
        || null;
  }

  /**
   * Check if asset is loaded
   */
  isLoaded(assetId) {
    return this._loaded.has(assetId);
  }

  /**
   * Check if asset failed to load
   */
  hasFailed(assetId) {
    return this._failed.has(assetId);
  }

  /**
   * Clear specific cache
   */
  clear(assetId = null) {
    if (assetId) {
      this._audioCache.delete(assetId);
      this._imageCache.delete(assetId);
      this._dataCache.delete(assetId);
      this._loaded.delete(assetId);
      this._failed.delete(assetId);
    } else {
      // Clear all
      this._audioCache.clear();
      this._imageCache.clear();
      this._dataCache.clear();
      this._loading.clear();
      this._loaded.clear();
      this._failed.clear();
    }
  }

  /**
   * Get loading statistics
   */
  getStats() {
    return {
      ...this._loadStats,
      totalLoaded: this._loaded.size,
      totalFailed: this._failed.size,
      totalCached: this._audioCache.size + this._imageCache.size + this._dataCache.size,
    };
  }

  /**
   * Debug info
   */
  getDebugInfo() {
    return {
      audioCache: Array.from(this._audioCache.keys()),
      imageCache: Array.from(this._imageCache.keys()),
      dataCache: Array.from(this._dataCache.keys()),
      loaded: Array.from(this._loaded),
      failed: Array.from(this._failed),
      loading: Array.from(this._loading.keys()),
      stats: this.getStats(),
    };
  }
}
