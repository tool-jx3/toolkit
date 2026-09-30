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


// PDF 工具只在下載時才載入，編輯資料不會送到伺服器。
let pdfTools;
function loadPdfTools() {
  return pdfTools ??= Promise.all([
    ['PDFLib', 'pdf-lib.min.js'], ['fontkit', 'fontkit.umd.min.js']
  ].map(([global, file]) => window[global] ? Promise.resolve() : new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/pdf/' + file, import.meta.url);
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error(T("pdf.001"))); };
    document.head.append(script);
  }))).catch(error => { pdfTools = null; throw error; });
}
/* TRPG Toolkit 合輯：上游把 PDF 用的字型（由 NotoSerifCJKKR 與 Pretendard 衍生，約 25 MB）
 * 放在 vendor/pdf/，本 repo 不散布字型檔，改成按下「下載 PDF」時才從 Google Fonts 抓完整的 TTF
 * （fonts.gstatic.com 回應 Access-Control-Allow-Origin: *，瀏覽器也會照 cache-control 快取一年）。
 * 網址是以非瀏覽器的 User-Agent 查 fonts.googleapis.com/css 得到的；subset 參數列出韓文或繁中
 * 以外的其他子集時，回傳的就是沒有切割過的完整字型：明體 KR 與上游的 serif-*.ttf 一樣涵蓋
 * 11,172 個諺文與 8,138 個漢字，繁中版涵蓋 15,384 個漢字（Big5 常用字與次常用字全數收錄）。
 * 只指定 subset=korean 的版本沒有漢字，subset=chinese-traditional 則只有 6,317 個漢字。 */
const PDF_FONTS = {
  'serif-kr': {
    400: 'https://fonts.gstatic.com/s/notoserifkr/v31/3JnoSDn90Gmq2mr3blnHaTZXbOtLJDvui3JOncjmeM52.ttf',
    500: 'https://fonts.gstatic.com/s/notoserifkr/v31/3JnoSDn90Gmq2mr3blnHaTZXbOtLJDvui3JOncjUeM52.ttf',
    600: 'https://fonts.gstatic.com/s/notoserifkr/v31/3JnoSDn90Gmq2mr3blnHaTZXbOtLJDvui3JOncg4f852.ttf',
    700: 'https://fonts.gstatic.com/s/notoserifkr/v31/3JnoSDn90Gmq2mr3blnHaTZXbOtLJDvui3JOncgBf852.ttf'
  },
  'serif-tc': {
    400: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX9aMOpD.ttf',
    500: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX9oMOpD.ttf',
    600: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX-EN-pD.ttf',
    700: 'https://fonts.gstatic.com/s/notoseriftc/v36/XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX-9N-pD.ttf'
  },
  'sans-kr': {
    400: 'https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf',
    700: 'https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf'
  },
  'sans-tc': {
    400: 'https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf',
    700: 'https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf'
  }
};
/* 每個字依序找第一套收有這個字的字型：先找同字體的韓文版、繁中版，再換另一種字體。
 * 上游只在明體與黑體之間互補，合輯版多了繁中的兩套。全部都沒有的字留給第一套畫（缺字符號）。 */
const PDF_CHAINS = {
  serif: ['serif-kr', 'serif-tc', 'sans-kr', 'sans-tc'],
  gothic: ['sans-kr', 'sans-tc', 'serif-kr', 'serif-tc']
};
// 取最接近的字重：黑體只有 400／700，與上游「600 以上用 700，否則用 400」的對應相同。
function pdfFontKey(family, weight) {
  const nearest = Object.keys(PDF_FONTS[family]).map(Number)
    .reduce((best, value) => Math.abs(value - weight) < Math.abs(best - weight) ? value : best);
  return family + '@' + nearest;
}
// 背景圖 → 真正的 PDF 文字 → 貼紙，依這個順序重現同樣的畫布配置。
async function pagePdf(pageIds, renderPage, size, progress, signal) {
  await loadPdfTools(); signal.throwIfAborted();
  const lib = window.PDFLib, doc = await lib.PDFDocument.create();
  doc.registerFontkit(window.fontkit);
  const sources = new Map(), fonts = new Map();
  // 下載字型並讀出它收錄的字元；真的用到才嵌入，免得只拿來查字的字型撐大 PDF。
  function source(key) {
    if (!sources.has(key)) {
      const [family, weight] = key.split('@');
      sources.set(key, fetch(PDF_FONTS[family][weight], { signal }).then(async response => {
        if (!response.ok) throw new Error(T("pdf.002"));
        const bytes = new Uint8Array(await response.arrayBuffer());
        return { bytes, chars: new Set(window.fontkit.create(bytes).characterSet) };
      }).catch(error => {
        sources.delete(key);
        throw signal.aborted ? error : new Error(T("pdf.002"));
      }));
    }
    return sources.get(key);
  }
  function getFont(key) {
    if (!fonts.has(key)) fonts.set(key, source(key).then(({ bytes }) => doc.embedFont(bytes, { subset: false })));
    return fonts.get(key);
  }
  async function textWithFallback(items) {
    const result = [];
    for (const item of items) {
      const chain = PDF_CHAINS[item.serif ? 'serif' : 'gothic'].map(family => pdfFontKey(family, item.weight));
      let current = null, advance = 0;
      for (const [index, char] of [...item.text].entries()) {
        const code = char.codePointAt(0);
        let font = chain[0];
        for (const key of chain) if ((await source(key)).chars.has(code)) { font = key; break; }
        if (!current || current.font !== font) {
          current = { ...item, text: '', advances: [], x: item.x + advance, font };
          result.push(current);
        }
        current.text += char; current.advances.push(item.advances[index]);
        advance += item.advances[index];
      }
    }
    return result;
  }
  async function paintImage(page, canvas) {
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value)
      : reject(new Error(T("pdf.003"))), 'image/png'));
    const image = await doc.embedPng(await blob.arrayBuffer());
    page.drawImage(image, { x: 0, y: 0, width: size.width * .75, height: size.height * .75 });
  }
  for (let i = 0; i < pageIds.length; i++) {
    signal.throwIfAborted(); progress(i + 1, pageIds.length);
    await new Promise(resolve => setTimeout(resolve, 0));
    const { canvas, text, overlay } = renderPage(pageIds[i]);
    try {
      const page = doc.addPage([size.width * .75, size.height * .75]);
      await paintImage(page, canvas);
      for (const item of await textWithFallback(text)) {
        if (!item.text) continue;
        const font = await getFont(item.font), fontKey = page.node.newFontDictionary(font.name, font.ref);
        const fontSize = item.size * .75, parts = lib.PDFArray.withContext(doc.context);
        [...item.text].forEach((char, index) => {
          parts.push(font.encodeText(char));
          const natural = font.widthOfTextAtSize(char, fontSize);
          parts.push(lib.PDFNumber.of((natural - item.advances[index] * .75 / item.scaleX) * 1000 / fontSize));
        });
        const color = /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#323232';
        const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
        page.pushOperators(lib.pushGraphicsState(), lib.setFillingRgbColor(...rgb),
          lib.beginText(), lib.setFontAndSize(fontKey, fontSize),
          lib.setTextMatrix(item.scaleX, 0, 0, 1, item.x * .75,
            page.getHeight() - (item.y + item.size * .85) * .75),
          lib.PDFOperator.of('TJ', [parts]), lib.endText(), lib.popGraphicsState());
      }
      if (overlay) await paintImage(page, overlay);
    } finally { canvas.width = canvas.height = 1; if (overlay) overlay.width = overlay.height = 1; }
  }
  signal.throwIfAborted();
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

export function attachSaving(store,stage,stickers,waitForDraw,scene) {
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
    if (store.definition.pdfExport && scene?.renderPdfPage) {
      const status = document.createElement('p');
      status.className = 'download-note'; status.setAttribute('role', 'status');
      status.textContent = T("pdf.004");
      const controller = new AbortController();
      dialog.addEventListener('close', () => controller.abort(), { once: true });
      const pdfButton = button(T("pdf.005"), async () => {
        try {
          scene.paginate?.();
          await waitForDraw(); await document.fonts.ready;
          controller.signal.throwIfAborted();
          const snapshot = structuredClone(store.state);
          const pdf = await pagePdf(snapshot.pages,
            id => scene.renderPdfPage(snapshot, id, stickers.layer), size,
            (page, total) => { status.textContent = T("pdf.006", page, total); }, controller.signal);
          download(pdf, snapshot.templateId + '.pdf');
          status.textContent = T("pdf.007", snapshot.pages.length);
        } catch (error) {
          if (controller.signal.aborted) return;
          status.textContent = T("pdf.008");
          throw error;
        }
      });
      pdfButton.className = 'png-download pdf-download';
      const actions = document.createElement('div');
      actions.className = 'textlog-download-actions';
      actions.append(downloadButton, pdfButton);
      dialog.append(actions, status);
    }
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
