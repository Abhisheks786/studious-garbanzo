// ═══════════════════════════════════════════════════════════════
//  LOGGER & DEBUG SYSTEM — Structured logging and profiling
// ═══════════════════════════════════════════════════════════════

import { EventBus, GameEvents } from './EventBus.js';

export class Logger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.level = options.level || 'info'; // 'debug' | 'info' | 'warn' | 'error'
    this.useConsole = options.useConsole !== false;
    this.logToFile = options.logToFile || false;
    
    // Log storage
    this._logs = [];
    this._maxLogs = options.maxLogs || 1000;
    
    // Performance profiling
    this._marks = new Map();
    this._metrics = new Map();
    
    // Level severity (lower = more severe)
    this._levelSeverity = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  /**
   * Main logging method
   */
  log(level, category, message, data = null) {
    if (!this.enabled) return;
    
    // Check level filter
    if (this._levelSeverity[level] < this._levelSeverity[this.level]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      category,
      message,
      data,
    };

    // Store log
    this._logs.push(logEntry);
    if (this._logs.length > this._maxLogs) {
      this._logs.shift();
    }

    // Console output
    if (this.useConsole) {
      const style = this._getConsoleStyle(level);
      const prefix = `[${timestamp.split('T')[1]}] ${category.toUpperCase()}`;
      console.log(
        `%c${prefix}%c ${message}`,
        style,
        'color: inherit;'
      );
      if (data) console.log(data);
    }

    // Emit event for external listeners
    EventBus.emit(GameEvents.DEBUG_LOG, logEntry);
  }

  debug(category, message, data = null) { this.log('debug', category, message, data); }
  info(category, message, data = null) { this.log('info', category, message, data); }
  warn(category, message, data = null) { this.log('warn', category, message, data); }
  error(category, message, data = null) { this.log('error', category, message, data); }

  /**
   * Performance profiling: Mark start
   */
  mark(label) {
    this._marks.set(label, performance.now());
  }

  /**
   * Performance profiling: Measure end
   */
  measure(label) {
    if (!this._marks.has(label)) {
      console.warn(`Mark not found: ${label}`);
      return null;
    }

    const startTime = this._marks.get(label);
    const duration = performance.now() - startTime;
    
    this._marks.delete(label);
    
    // Track metric
    if (!this._metrics.has(label)) {
      this._metrics.set(label, []);
    }
    this._metrics.get(label).push(duration);

    this.debug('perf', `${label}: ${duration.toFixed(2)}ms`);
    return duration;
  }

  /**
   * Get metric statistics
   */
  getMetricStats(label) {
    if (!this._metrics.has(label)) return null;

    const values = this._metrics.get(label);
    const avg = values.reduce((a, b) => a + b) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { avg, min, max, count: values.length };
  }

  /**
   * Get all logs
   */
  getLogs(filter = {}) {
    let logs = [...this._logs];

    if (filter.level) {
      logs = logs.filter(l => l.level === filter.level);
    }
    if (filter.category) {
      logs = logs.filter(l => l.category.includes(filter.category));
    }

    return logs;
  }

  /**
   * Clear logs
   */
  clearLogs() {
    this._logs = [];
  }

  /**
   * Export logs as JSON
   */
  exportLogs() {
    return JSON.stringify(this._logs, null, 2);
  }

  /**
   * Get console style based on level
   */
  _getConsoleStyle(level) {
    const styles = {
      error: 'color: #ff4444; font-weight: bold;',
      warn: 'color: #ffaa00; font-weight: bold;',
      info: 'color: #00aaff;',
      debug: 'color: #88ff00;',
    };
    return styles[level] || 'color: inherit;';
  }

  /**
   * Get all debug info
   */
  getDebugInfo() {
    return {
      recentLogs: this._logs.slice(-10),
      logCount: this._logs.length,
      metrics: Object.fromEntries(
        Array.from(this._metrics.entries()).map(([label, values]) => [
          label,
          this.getMetricStats(label),
        ])
      ),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
//  PERFORMANCE PROFILER — Detailed performance analysis
// ═══════════════════════════════════════════════════════════════

export class PerformanceProfiler {
  constructor(logger) {
    this.logger = logger;
    this.frameMetrics = [];
    this.systemMetrics = new Map();
  }

  /**
   * Record frame time
   */
  recordFrame(dt, fps) {
    this.frameMetrics.push({ dt, fps, timestamp: performance.now() });
    if (this.frameMetrics.length > 300) this.frameMetrics.shift();
  }

  /**
   * Record system execution time
   */
  recordSystem(systemName, duration) {
    if (!this.systemMetrics.has(systemName)) {
      this.systemMetrics.set(systemName, []);
    }
    this.systemMetrics.get(systemName).push(duration);
  }

  /**
   * Get frame statistics
   */
  getFrameStats() {
    if (this.frameMetrics.length === 0) return null;
    const fps = this.frameMetrics.map(f => f.fps);
    return {
      avgFps: (fps.reduce((a, b) => a + b) / fps.length).toFixed(1),
      minFps: Math.min(...fps),
      maxFps: Math.max(...fps),
      frameCount: this.frameMetrics.length,
    };
  }

  /**
   * Get system statistics
   */
  getSystemStats() {
    const stats = {};
    for (const [name, durations] of this.systemMetrics) {
      const avg = durations.reduce((a, b) => a + b) / durations.length;
      stats[name] = {
        avg: avg.toFixed(2),
        max: Math.max(...durations).toFixed(2),
        count: durations.length,
      };
    }
    return stats;
  }

  /**
   * Get bottleneck analysis
   */
  getBottlenecks() {
    const stats = this.getSystemStats();
    return Object.entries(stats)
      .sort(([, a], [, b]) => parseFloat(b.avg) - parseFloat(a.avg))
      .slice(0, 5); // Top 5 bottlenecks
  }

  /**
   * Clear metrics
   */
  clear() {
    this.frameMetrics = [];
    this.systemMetrics.clear();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DEBUG DISPLAY — On-screen debug UI
// ═══════════════════════════════════════════════════════════════

export class DebugDisplay {
  constructor(canvas, logger, profiler) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.logger = logger;
    this.profiler = profiler;
    this.visible = false;
    this.page = 0; // 0=overview, 1=logs, 2=metrics
  }

  /**
   * Toggle debug display
   */
  toggle() {
    this.visible = !this.visible;
    return this.visible;
  }

  /**
   * Draw debug info on screen
   */
  draw() {
    if (!this.visible) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.9;

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(10, 10, 350, 250);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 350, 250);

    // Title
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('DEBUG INFO', 15, 28);

    // Content based on page
    ctx.fillStyle = '#cccccc';
    ctx.font = '10px monospace';
    const lines = this._getDebugLines();
    
    lines.forEach((line, i) => {
      ctx.fillText(line, 15, 45 + i * 14);
    });

    // Page indicator
    ctx.fillStyle = '#666666';
    ctx.fillText(`[${this.page}] Press D to cycle`, 15, 250);

    ctx.restore();
  }

  /**
   * Get debug lines for current page
   */
  _getDebugLines() {
    if (this.page === 0) {
      // Overview
      const frameStats = this.profiler.getFrameStats();
      return [
        `FPS: ${frameStats?.avgFps || '0'} (min: ${frameStats?.minFps || 0})`,
        `Memory: ${(performance.memory?.usedJSHeapSize / 1048576).toFixed(1)}MB`,
        `Logs: ${this.logger._logs.length}`,
        `Metrics: ${this.logger._metrics.size}`,
        '',
        'Page 0: Overview',
        'Page 1: Recent Logs',
        'Page 2: System Metrics',
      ];
    } else if (this.page === 1) {
      // Recent logs
      const recentLogs = this.logger._logs.slice(-8);
      return recentLogs.map(log => 
        `[${log.level.toUpperCase()[0]}] ${log.category}: ${log.message}`
      );
    } else if (this.page === 2) {
      // System metrics
      const bottlenecks = this.profiler.getBottlenecks();
      return bottlenecks.map(([name, stats]) => 
        `${name}: ${stats.avg}ms (max: ${stats.max}ms)`
      );
    }
    return [];
  }

  /**
   * Next page
   */
  nextPage() {
    this.page = (this.page + 1) % 3;
  }
}
