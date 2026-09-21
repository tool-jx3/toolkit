import { createStore, decodeImage, notify, pruneImages } from './state.js';
import { createStickers } from './stickers.js';
import { createForms } from './FormScript.js';
import { attachSaving } from './SaveBtn.js';
import { createCanvasEyedropper } from './CanvasEyedropper.js';
import { createFontSync } from './FontSync.js';

let started=false;
async function start(config){
  if(started)return;
  document.querySelector('.tools-toggle').setAttribute('aria-label',T("runtime.001"));
  const definition=config.definition;
  if(!definition){
    document.querySelectorAll('[data-action]').forEach(b=>b.disabled=true);
    const status=document.querySelector('#editor-status');status.hidden=false;
    status.textContent=T("runtime.002");return;
  }
  started=true;
  const {positions,createScene}=definition;
  if(!window.Konva||!window.Cropper||!window.Pickr){notify(T("runtime.003"));return;}
  const container=document.querySelector('#konva-container');
  const stage=new Konva.Stage({container,width:0,height:0});
  const store=createStore(definition);let forms;
  const scene=createScene(stage,(side,group,node)=>{stickers.select(null);forms.open(side,group,node);},store);
  await scene.ready;
  const fontSync=createFontSync(stage,()=>scene.updateValues(store.state.values),notify);
  const stickers=createStickers(stage,store,id=>forms?.selectSticker(id));
  const eyedropper=createCanvasEyedropper(stage,stickers,waitForDraw);
  forms=createForms(store,stickers,eyedropper);
  const resize=(event)=>{
    const width=event?.detail?.width ?? (parseFloat(container.style.width)||0);
    const scale=width/config.width;
    stage.size({width,height:config.height*scale});
    stage.scale({x:scale,y:scale});stage.draw();stickers.positionDelete();
  };
  container.addEventListener('editor:resize',resize);
  let pending=Promise.resolve(),renderEpoch=0;
  const activeImages=new Map();
  async function render(state,kind){
    const bounds=definition.getSize?.(state)??definition.size;
    if(config.width!==bounds.width||config.height!==bounds.height){
      config.width=bounds.width;config.height=bounds.height;
      container.style.setProperty('--canvas-ratio',bounds.width+' / '+bounds.height);
      window.dispatchEvent(new Event('editor:layout'));
    }
    scene.updateState?.(state,kind);
    scene.updateValues(state.values);
    const fontsReady=fontSync.sync();
    if(kind==='values'||kind==='labels'){await fontsReady;return;}
    const token=++renderEpoch;
    const jobs=Object.keys(positions).map(async id=>{
      const src=state.images[id]||null;if(activeImages.get(id)===src)return;
      const image=src?await decodeImage(src):null;
      if(token!==renderEpoch)return;
      scene.updateImage(id,image);activeImages.set(id,src);
    });
    if(kind==='stickers'||kind==='replace'||kind==='structure')jobs.push(stickers.render());
    await Promise.all([...jobs,fontsReady]);pruneImages(store.state);
  }
  let renderFrame=null,queuedKind=null;
  function flushRender(){
    if(renderFrame!==null)cancelAnimationFrame(renderFrame);
    renderFrame=null;if(!queuedKind)return;
    const kind=queuedKind;queuedKind=null;
    // 合併起來，這樣剛換完圖就打字也不會漏掉圖片的更新。
    pending=pending.catch(()=>{}).then(()=>render(store.state,kind));
    pending.catch(error=>notify(error.message));
  }
  store.subscribe((state,kind)=>{
    queuedKind=queuedKind===null?kind:queuedKind===kind?kind:'replace';
    if(renderFrame===null)renderFrame=requestAnimationFrame(flushRender);
  });
  await render(store.state,'replace');
  async function waitForDraw(){
    do{flushRender();const task=pending;await task;if(task===pending&&!queuedKind)break;}while(true);
    await fontSync.sync();stage.draw();
  }
  const saving=attachSaving(store,stage,stickers,waitForDraw);
  await saving.ready;
  document.querySelector('[data-action="sticker"]').onclick=()=>forms.chooseSticker();
  resize();
  document.fonts.ready.then(()=>fontSync.refresh());
  window.pairEditor={definition,stage,store,scene,stickers,forms,saving,eyedropper,waitForDraw};
}
window.addEventListener('editor:ready',e=>start(e.detail).catch(error=>notify(error.message)));
if(window.editorTemplate)start(window.editorTemplate).catch(error=>notify(error.message));
