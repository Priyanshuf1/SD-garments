const fs = require('fs');

let runtime = fs.readFileSync('assets/spline/runtime.js', 'utf8');

// 1. Intercept document data in start(t) to eradicate video layer and videos dictionary
const targetStart = 'let i=await qV(t);this._data=i;';
const replaceStart = `let i=await qV(t);if(i&&i.shared){if(i.shared.materials){const pm=i.shared.materials["4581576f-a517-4e6a-aa7e-dd5011cf984a"];if(pm&&pm.layers){pm.layers=pm.layers.filter(l=>l&&l.data&&l.data.type!=="video");pm.layers.forEach(l=>{if(l&&l.data&&l.data.type==="texture"){l.data.visible=!0;l.data.alpha=1;}})}}if(i.shared.videos){delete i.shared.videos["0f86e8f8-fc28-46b0-97fa-1b031b522abd"];}}this._data=i;`;

if (!runtime.includes(targetStart)) {
  console.error('Target start not found!');
  process.exit(1);
}

runtime = runtime.replace(targetStart, replaceStart);

// 2. Enhance updateSrc to support HTMLCanvasElement and image URLs on any layer
const targetUpdateSrc = `let r=()=>{this.loaded=!0;for(let s of Object.values(this._cache))for(let o of Object.values(s))for(let a of Object.values(o))a&&(a.image=this.img,a.needsUpdate=!0);this.shared.requestRender()};`;
const replaceUpdateSrc = `let r=()=>{this.loaded=!0;for(let s of Object.values(this._cache))for(let o of Object.values(s))for(let a of Object.values(o))a&&(a.image=this.img,a.needsUpdate=!0);this.shared.requestRender()};if(e&&(e instanceof HTMLCanvasElement||(typeof HTMLCanvasElement!=="undefined"&&e.getContext))){this.img=e;r();return;}if(this.isVideo&&typeof e==="string"&&!e.includes(".mp4")){let im=new Image();im.crossOrigin="anonymous";im.onload=()=>{this.img=im;r();};im.src=e;return;}`;

if (!runtime.includes(targetUpdateSrc)) {
  console.error('Target updateSrc not found!');
  process.exit(1);
}

runtime = runtime.replace(targetUpdateSrc, replaceUpdateSrc);

fs.writeFileSync('assets/spline/runtime.js', runtime, 'utf8');
console.log('assets/spline/runtime.js patched successfully!');
