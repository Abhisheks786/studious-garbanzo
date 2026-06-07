const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'js/game.js',
  'js/constants.js',
  'js/systems/save.js',
  'js/systems/audio.js',
  'js/systems/input.js',
  'js/systems/particles.js',
  'js/world/physics.js',
  'js/world/rooms.js',
  'js/world/renderer.js',
  'js/entities/player.js',
  'js/entities/enemies.js',
  'js/entities/boss.js',
  'js/ui/ui.js',
  'js/systems/quests.js'
];

let allOk = true;
filesToCheck.forEach(file => {
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    allOk = false;
    return;
  }
  const content = fs.readFileSync(file, 'utf8');
  const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    const resolvedPath = path.resolve(path.dirname(file), importPath);
    if (!fs.existsSync(resolvedPath)) {
      console.error('In ' + file + ' import not found: ' + importPath + ' -> ' + resolvedPath);
      allOk = false;
    }
  }
});
if (allOk) {
  console.log('All files exist and all imports resolved successfully!');
} else {
  process.exit(1);
}
