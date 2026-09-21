import { notify, validateState } from './state.js';
import { makeArchive, readArchive, archiveName } from './ShareArchive.js';

function openDB() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('pair-editor-saves',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('slots',{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error(T("save.001")));
  });
}
async function slotAction(method,key,value){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('slots',['get','getAll'].includes(method)?'readonly':'readwrite'),store=tx.objectStore('slots');let result;
    const request=method==='put'?store.put(value):method==='getAll'?store.getAll():store[method](key);
    request.onsuccess=()=>result=request.result;
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onerror=tx.onabort=()=>{db.close();reject(new Error(T("save.002")));};
  });
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function modal(title){
  const dialog=document.createElement('dialog');dialog.className='save-dialog';
  const heading=document.createElement('h2');heading.textContent=title;
  const close=document.createElement('button');close.type='button';close.innerHTML='<i class="bi bi-x" aria-hidden="true"></i>';close.setAttribute('aria-label',T("save.003"));close.className='dialog-close floating-close';close.onclick=()=>dialog.close();
  dialog.append(heading,close);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();return dialog;
}
function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(error){notify(error.message);}finally{b.disabled=false;}};return b;}

export function attachSaving(store,stage,stickers,waitForDraw) {
  const {size,initialState}=store.definition;
  const draftKey=store.state.templateId+':autosave';
  let queue=Promise.resolve();
  function cacheCurrent(){
    const revision=store.revision,snapshot=structuredClone(store.state);
    queue=queue.catch(()=>{}).then(()=>slotAction('put',draftKey,{key:draftKey,state:snapshot,savedAt:Date.now()})).then(()=>{if(store.revision===revision)store.markSaved();});
    queue.catch(()=>notify(T("save.004")));
    return queue;
  }
  const ready=(async()=>{
    const revision=store.revision;
    try{
      const draft=await slotAction('get',draftKey);
      if(draft?.state){const next=await validateState(draft.state,store.definition);if(store.revision===revision){store.replace(next);await waitForDraw();notify(T("save.005"));}}
    }catch{notify(T("save.006"));}
    store.subscribe(()=>cacheCurrent());
    if(store.revision!==revision&&store.dirty)cacheCurrent();
  })();
  async function outputCanvas(pixelRatio=1){
    await waitForDraw();await document.fonts.ready;
    const previous={width:stage.width(),height:stage.height(),scale:stage.scale()};
    const transformerVisible=stickers.transformer.visible();
    try{
      const originalSize={...(store.definition.getSize?.(store.state)??size)};
      stickers.transformer.hide();stage.scale({x:1,y:1});stage.size(originalSize);stage.draw();
      return stage.toCanvas({pixelRatio});
    }finally{
      stage.size({width:previous.width,height:previous.height});stage.scale(previous.scale);
      stickers.transformer.visible(transformerVisible);stage.draw();stickers.positionDelete();
    }
  }
  async function apply(raw){
    const next=await validateState(raw,store.definition);
    if(store.dirty&&!confirm(T("save.007")))return false;
    store.replace(next);await waitForDraw();notify(T("save.008"));return true;
  }
  async function slots(){
    const dialog=modal(T("save.009"));
    const create=button(T("save.010"),async()=>{
      const revision=store.revision,snapshot=structuredClone(store.state);
      const key=store.state.templateId+':slot:'+crypto.randomUUID();
      const preview=(await outputCanvas(0.2)).toDataURL('image/png');
      await slotAction('put',key,{key,name:window.editorTemplate?.title||T("save.011"),state:snapshot,preview,savedAt:Date.now()});
      if(store.revision===revision)store.markSaved();await refresh();notify(T("save.012"));
    });
    const note=document.createElement('p');note.textContent=T("save.013");dialog.append(note);
    create.className='new-save-slot';create.innerHTML='<i class="bi bi-plus" aria-hidden="true"></i> ' + T("save.010");dialog.append(create);
    const listing=document.createElement('div');listing.className='save-slots';dialog.append(listing);
    async function refresh(){
      listing.replaceChildren();
      const records=(await slotAction('getAll')).filter(r=>r.key!==draftKey&&r.state?.templateId===store.state.templateId).sort((a,b)=>b.savedAt-a.savedAt);
      for(let record of records){
        const key=record.key;
        if(!dialog.isConnected)return;
        const row=document.createElement('article');row.className='save-slot';
        const nameRow=document.createElement('div');nameRow.className='slot-name-row';
        const label=document.createElement('input');label.className='slot-name';label.value=record.name||T("save.009");label.maxLength=40;label.setAttribute('aria-label',T("save.014"));
        const edit=document.createElement('button');edit.type='button';edit.className='slot-name-edit';edit.innerHTML='<i class="bi bi-pencil-square"></i>';edit.setAttribute('aria-label',T("save.015"));edit.onclick=()=>{label.focus();label.select();};nameRow.append(label,edit);row.append(nameRow);
        let nameWrite=Promise.resolve();
        label.addEventListener('change',()=>{const name=label.value.trim()||T("save.009");label.value=name;nameWrite=nameWrite.catch(()=>{}).then(async()=>{const latest=await slotAction('get',key);if(!latest)return;record={...latest,key,name};await slotAction('put',key,record);}).catch(()=>notify(T("save.016")));});
        label.addEventListener('keydown',e=>{if(e.key==='Enter')label.blur();});
        const footer=document.createElement('div');footer.className='slot-footer';
        const time=document.createElement('time');time.textContent=new Date(record.savedAt).toLocaleString();time.dateTime=new Date(record.savedAt).toISOString();
        const image=document.createElement('img');image.src=record.preview;image.alt=T("save.017");row.append(image);
        const actions=document.createElement('div');actions.className='dialog-actions';
        actions.append(button(T("save.018"),async()=>{
          await nameWrite;
          if(!confirm(T("save.019")))return;
          const revision=store.revision;
          const snapshot=structuredClone(store.state),preview=(await outputCanvas(0.2)).toDataURL('image/png');
          await slotAction('put',key,{key,name:label.value.trim()||T("save.009"),state:snapshot,preview,savedAt:Date.now()});
          if(store.revision===revision)store.markSaved();notify(T("save.020"));await refresh();
        }));
        {
          actions.append(button(T("save.021"),async()=>{if(await apply(record.state))dialog.close();}));
          actions.append(button(T("save.022"),async()=>{await nameWrite;if(confirm(T("save.023"))){await slotAction('delete',key);await refresh();}}));
        }
        actions.querySelectorAll('button').forEach(b=>b.classList.add(b.textContent===T("save.022")?'slot-action-delete':'slot-action-primary'));
        footer.append(time,actions);row.append(footer);listing.append(row);
      }
    }
    await refresh();
  }
  function transfer(){
    const dialog=modal(T("save.024"));const note=document.createElement('p');note.textContent=T("save.025");dialog.append(note);
    const exportButton=button(T("save.026"),async()=>{
      download(makeArchive(store.state),archiveName());notify(T("save.027"));
    });exportButton.className='export-file-button';dialog.append(exportButton);
    const zone=document.createElement('div');zone.className='import-file zip-dropzone';
    const input=document.createElement('input');input.type='file';input.accept='.zip,application/zip';input.hidden=true;
    const choose=document.createElement('button');choose.type='button';choose.textContent=T("save.028");choose.className='zip-import-button';choose.onclick=()=>input.click();
    const hint=document.createElement('p');hint.textContent=T("save.029");
    const status=document.createElement('p');status.className='zip-import-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    zone.append(choose,hint,input,status);dialog.append(zone);
    let busy=false,dragDepth=0;
    function clearDrag(){dragDepth=0;zone.classList.remove('is-dragover');}
    async function importFile(file){
      if(!file||busy)return;
      busy=true;input.disabled=true;choose.disabled=true;zone.classList.add('is-loading');zone.setAttribute('aria-busy','true');status.textContent=T("save.030");
      try{const raw=await readArchive(file);if(await apply(raw))dialog.close();else status.textContent=T("save.031");}
      catch(error){status.textContent=error instanceof SyntaxError?T("save.032"):error.message;}
      finally{busy=false;input.disabled=false;choose.disabled=false;zone.classList.remove('is-loading');zone.setAttribute('aria-busy','false');}
    }
    input.onchange=()=>{const file=input.files[0];input.value='';importFile(file);};
    zone.addEventListener('dragenter',e=>{if(![...(e.dataTransfer?.types||[])].includes('Files'))return;e.preventDefault();dragDepth++;zone.classList.add('is-dragover');});
    zone.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=busy?'none':'copy';zone.classList.add('is-dragover');});
    zone.addEventListener('dragleave',e=>{e.preventDefault();if(--dragDepth<=0)clearDrag();});
    zone.addEventListener('drop',e=>{e.preventDefault();clearDrag();const files=e.dataTransfer?.files;if(files?.length!==1){status.textContent=T("save.033");return;}importFile(files[0]);});
    dialog.addEventListener('dragover',e=>e.preventDefault());
    dialog.addEventListener('drop',e=>{e.preventDefault();if(!zone.contains(e.target)){clearDrag();status.textContent=T("save.034");}});
  }
  async function png(){
    const canvas=await outputCanvas();const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error(T("save.035"))),'image/png'));
    const dialog=modal(T("save.036")),image=document.createElement('img');image.className='download-preview';image.alt=T("save.037");
    const url=URL.createObjectURL(blob);image.src=url;dialog.append(image);
    const note=document.createElement('p');note.className='download-note';note.textContent=T("save.038", canvas.width, canvas.height);
    const downloadButton=button(T("save.039"),()=>download(blob,store.state.templateId+'.png'));downloadButton.className='png-download';dialog.append(note,downloadButton);
    dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
  }
  async function reset(){
    if(!confirm(T("save.040")))return;
    await ready;
    store.replace(initialState(store.state.templateId));
    await waitForDraw();await queue;
    notify(T("save.041"));
  }
  for(const [action,fn] of [['reset',reset],['slots',slots],['export',transfer],['download',png]]){
    const b=document.querySelector(`[data-action="${action}"]`);b.disabled=false;
    b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(error){notify(error.message);}finally{b.disabled=false;}});
  }
  window.addEventListener('beforeunload',e=>{if(store.dirty){e.preventDefault();e.returnValue='';}});
  return {outputCanvas,apply,slots,transfer,png,reset,ready,flushCache:()=>queue};
}
