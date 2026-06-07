// Mocking DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
  <canvas id="c" width="640" height="400"></canvas>
  <canvas id="minimap" width="80" height="50"></canvas>
  <div id="mctl">
    <div id="mb-l"></div>
    <div id="mb-r"></div>
    <div id="mb-u"></div>
    <div id="mb-j"></div>
    <div id="mb-d"></div>
    <div id="mb-a"></div>
  </div>
</body>
</html>
`, {
  url: 'http://localhost/',
  pretendToBeVisual: true
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.navigator.getGamepads = () => [];
global.localStorage = {
  getItem: () => null,
  setItem: () => null
};

// Mock 2D Context
const ctxMock = {
  imageSmoothingEnabled: false,
  canvas: { width: 640, height: 400 },
  fillRect: () => {},
  clearRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arcTo: () => {},
  closePath: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 50 }),
  createLinearGradient: () => ({
    addColorStop: () => {}
  }),
  ellipse: () => {},
  arc: () => {},
  rect: () => {},
  drawImage: () => {}
};

dom.window.HTMLCanvasElement.prototype.getContext = function(type) {
  if (type === '2d') {
    return ctxMock;
  }
  return null;
};

// Mock AudioContext
class AudioContextMock {
  constructor() {
    this.state = 'suspended';
    this.destination = {};
  }
  createGain() {
    return {
      connect: () => {},
      gain: { value: 1 }
    };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}
global.window.AudioContext = AudioContextMock;
global.window.webkitAudioContext = AudioContextMock;

// Mock requestAnimationFrame
global.window.requestAnimationFrame = (callback) => {
  return setTimeout(() => callback(Date.now()), 16);
};
global.requestAnimationFrame = global.window.requestAnimationFrame;

// Execute the game module
console.log('Loading game module...');
try {
  import('./js/game.js').then(module => {
    console.log('Game module loaded successfully!');
    // Let's run for 100ms
    setTimeout(() => {
      console.log('Game ran for 100ms without crashing!');
      process.exit(0);
    }, 100);
  }).catch(err => {
    console.error('Import error:', err);
    process.exit(1);
  });
} catch (e) {
  console.error('Exception during import:', e);
  process.exit(1);
}
