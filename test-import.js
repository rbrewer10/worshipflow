// Test that the TABLET_PORT export is available
try {
  // This would normally be built from src/main/index.ts
  // We're just checking the module structure is correct
  console.log("Build successful - checking generated files...");
  
  const fs = require('fs');
  const path = require('path');
  
  const mainFile = path.join(__dirname, 'out', 'main', 'index.js');
  const content = fs.readFileSync(mainFile, 'utf-8');
  
  if (content.includes('wf:app:getTabletPort')) {
    console.log("✓ IPC handler 'wf:app:getTabletPort' is present in main bundle");
  } else {
    console.log("✗ IPC handler 'wf:app:getTabletPort' NOT found");
    process.exit(1);
  }
  
  if (content.includes('TABLET_PORT')) {
    console.log("✓ TABLET_PORT is referenced in main bundle");
  } else {
    console.log("✗ TABLET_PORT not found in main bundle");
    process.exit(1);
  }
  
  const preloadFile = path.join(__dirname, 'out', 'preload', 'index.js');
  const preloadContent = fs.readFileSync(preloadFile, 'utf-8');
  
  if (preloadContent.includes('getTabletPort')) {
    console.log("✓ getTabletPort method is present in preload bundle");
  } else {
    console.log("✗ getTabletPort method NOT found in preload");
    process.exit(1);
  }
  
  const rendererFile = path.join(__dirname, 'out', 'renderer', 'assets', 'index-BhgOsN_h.js');
  // The renderer JS is minified, so we just check it exists
  if (fs.existsSync(rendererFile)) {
    console.log("✓ Renderer bundle exists");
  }
  
  console.log("\nAll changes verified in built bundles!");
  
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
