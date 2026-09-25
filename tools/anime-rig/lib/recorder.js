/*!
 * Anime2.5DRig — recorder.js
 * Records the preview canvas with MediaRecorder. WebM (VP9/VP8) keeps the
 * alpha channel in Chromium-based browsers, so the avatar can be recorded
 * with a transparent background.
 * MIT License
 */
(function(root){
'use strict';
// 收錄版：顯示名稱改存字典 key（labelKey），由 app.js 依目前語言以 T() 取得。
const CANDIDATES=[
  {mime:'video/webm;codecs=vp9',ext:'webm',labelKey:'rec.fmt.vp9',alpha:true},
  {mime:'video/webm;codecs=vp8',ext:'webm',labelKey:'rec.fmt.vp8',alpha:true},
  {mime:'video/webm',ext:'webm',labelKey:'rec.fmt.webm',alpha:true},
  {mime:'video/mp4;codecs=avc1',ext:'mp4',labelKey:'rec.fmt.h264',alpha:false},
  {mime:'video/mp4',ext:'mp4',labelKey:'rec.fmt.mp4',alpha:false}
];
function formats(){
  if(typeof MediaRecorder==='undefined'||typeof MediaRecorder.isTypeSupported!=='function')return [];
  return CANDIDATES.filter(c=>{try{return MediaRecorder.isTypeSupported(c.mime);}catch(err){return false;}});
}
function create(canvas){
  let rec=null,stream=null,timer=null,chunks=[],cancelled=false,startedAt=0;
  function cleanup(){clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;rec=null;chunks=[];}
  /** Resolves with {blob, format, seconds}; rejects with AbortError when cancelled. */
  function start(opts){
    if(rec)return Promise.reject(new Error(T('rec.err.busy')));
    if(typeof canvas.captureStream!=='function')return Promise.reject(new Error(T('rec.err.unsupported')));
    const list=formats(),f=list.find(x=>x.mime===opts.format)||list[0];
    if(!f)return Promise.reject(new Error(T('rec.err.noFormat')));
    const seconds=Math.max(0.5,opts.seconds||5),fps=opts.fps||30;
    const pixels=canvas.width*canvas.height;
    const bits=opts.bitsPerSecond||Math.round(Math.min(40e6,Math.max(4e6,pixels*fps*0.12)));
    try{stream=canvas.captureStream(fps);rec=new MediaRecorder(stream,{mimeType:f.mime,videoBitsPerSecond:bits});}
    catch(err){cleanup();return Promise.reject(err);}
    chunks=[];cancelled=false;
    return new Promise((resolve,reject)=>{
      rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
      rec.onerror=e=>{const err=e.error||new Error(T('rec.err.failed'));cleanup();reject(err);};
      rec.onstop=()=>{
        const blob=new Blob(chunks,{type:f.mime.split(';')[0]}),wasCancelled=cancelled,dur=(performance.now()-startedAt)/1000;
        cleanup();
        if(wasCancelled)reject(new DOMException(T('rec.cancelled'),'AbortError'));
        else if(!blob.size)reject(new Error(T('rec.err.empty')));
        else resolve({blob,format:f,seconds:dur});
      };
      rec.start(250);startedAt=performance.now();
      const tick=()=>{
        if(!rec)return;
        const t=(performance.now()-startedAt)/1000;
        if(opts.onProgress)opts.onProgress(Math.min(t,seconds),seconds);
        if(t>=seconds){if(rec.state!=='inactive')rec.stop();}
        else timer=setTimeout(tick,100);
      };
      timer=setTimeout(tick,100);
    });
  }
  function stop(){if(rec&&rec.state!=='inactive')rec.stop();}
  function cancel(){cancelled=true;stop();}
  return {start,stop,cancel,get active(){return !!rec;}};
}
root.RigRecorder={create,formats};
})(typeof self!=='undefined'?self:this);
