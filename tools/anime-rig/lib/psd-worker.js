'use strict';
importScripts('ag-psd.min.js','rigger.js','runtime.js');
// 收錄版：合輯的 i18n 引擎用到 window 與 document，無法在 worker 裡載入；改由主執行緒把
// 目前語言的字典隨 PSD 一起傳過來，這裡提供同樣介面的 T()，rigger.js、runtime.js 共用。
// 用 globalThis（worker 裡就是 self），上游在 Node 的 vm 裡執行本檔的測試也能載入。
let messages={};
globalThis.T=function(key,...args){
  const value=messages[key];
  if(value===undefined)return key;
  return args.length?value.replace(/\{(\d+)\}/g,(m,i)=>args[i]===undefined?m:args[i]):value;
};
agPsd.initializeCanvas(undefined,(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
onmessage = function(ev) {
  try {
    const {buffer,generic}=ev.data;messages=ev.data.messages||{};
    RigRuntime.validateHeader(buffer);
    postMessage({progress:T('load.checking')});
    const id=RigRuntime.fingerprint(buffer);
    const options={useImageData:true,skipThumbnail:true,skipCompositeImageData:true};
    Rigger.validatePsd(agPsd.readPsd(new Uint8Array(buffer),{...options,skipLayerImageData:true}));
    postMessage({progress:T('load.decoding')});
    const psd=agPsd.readPsd(new Uint8Array(buffer),{...options,skipCompositeImageData:false});
    postMessage({progress:T('load.denoising')});
    const pre=Rigger.cleanPsdLayers(psd);
    postMessage({progress:T('load.building')});
    const rig=Rigger.buildRig(psd,{generic});
    const transfers=new Set();
    function collect(v) {
      if(!v || typeof v!=='object')return;
      if(ArrayBuffer.isView(v)){transfers.add(v.buffer);return;}
      for(const x of Object.values(v))collect(x);
    }
    collect(psd); collect(rig);
    postMessage({psd,pre,rig,id},[...transfers]);
  } catch(err) { postMessage({error:err.message || String(err)}); }
};
