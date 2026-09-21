import { attachColorPicker } from './ColorPicker.js';
import { cropImage } from './Cropper.js';
import { readImage, notify } from './state.js';
import { createKeyboardBar } from './KeyboardBar.js';
import { createRichTextField } from './RichText.js';

export function createForms(store,stickers,eyedropper) {
  const definition=store.definition;
  const {fields,fonts=[],initialState}=definition;
  /* 字型標籤含 T()，版型若寫成函式就要每次重建表單時才求值，切語言才跟得上。 */
  const fontLabel=font=>{const l=definition.fontLabels;return (typeof l==='function'?l():l??{})[font] ?? font;};
  const getTabs=()=>typeof definition.tabs==='function'?definition.tabs(store.state):definition.tabs;
  const getGroups=id=>{
    const tab=getTabs().find(t=>t.id===id);
    const source=tab?.groups ?? definition.groups ?? [];
    return typeof source==='function'?source(store.state,id):source;
  };
  const contentTabs=()=>getTabs().filter(t=>t.type!=='action');
  function normalizeSelection(){
    if(!contentTabs().some(t=>t.id===side))side=contentTabs()[0]?.id;
    const items=getGroups(side);
    if(!items.some(g=>g[0]===category))category=items[0]?.[0];
  }
  const compact=matchMedia('(max-width:1024px)'),host=document.querySelector('#editor-inputs');
  const keyboard=createKeyboardBar(host);
  let side=contentTabs()[0]?.id,category,selection=null,z=210;
  normalizeSelection();
  let categoryScroll=0;
  const panels=new Map();let mobileCleanup=()=>{};
  function announceSelection(){window.dispatchEvent(new CustomEvent('editor:selection',{detail:{side,category}}));}
  function fieldPanel(currentSide,group) {
    const body=document.createElement('div');body.className='field-content';const cleanups=[];
    function bindVisibility(node,condition){
      if(!condition)return;
      const update=()=>{node.hidden=typeof condition==='string'
        ?store.state.values[condition]!==true
        :condition.notValue!==undefined?store.state.values[condition.id]===condition.notValue
        :store.state.values[condition.id]!==condition.value;};
      update();cleanups.push({mount:()=>store.subscribe(update)});
    }
    const name=getGroups(currentSide).find(g=>g[0]===group)?.[1]||'';
    const title=document.createElement('h3');title.textContent=[getTabs().find(t=>t.id===currentSide)?.heading ?? '',name].filter(Boolean).join(' ');body.append(title);
    if(definition.formOptions?.scrollTabs){title.dataset.memberSide=currentSide;title.dataset.memberCategory=name;}
    const fieldItems=fields(currentSide,group,store.state);
    const imageFields=definition.imageField?.(currentSide,group,store.state);
    const trailingImages=[];
    for(const image of (Array.isArray(imageFields)?imageFields:imageFields?[imageFields]:[])){
      const {id,label:imageLabel,visibleWhen,placement,...position}=image;
      const label=document.createElement('label');label.className='image-upload'+(position.round?' round':'')+' '+(position.className||'');
      label.style.setProperty('--image-ratio',position.width+'/'+position.height);
      const preview=document.createElement('img');preview.alt=title.textContent;preview.dataset.imagePreview=id;
      const existing=store.state.images[id];preview.hidden=!existing;if(existing)preview.src=existing;
      const caption=document.createElement('span');caption.textContent=T("form.001");
      const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label',(imageLabel||title.textContent)+T("form.002"));
      const remove=document.createElement('button');remove.type='button';remove.className='image-remove';remove.textContent=T("form.003");
      input.onchange=async()=>{
        const file=input.files[0];input.value='';if(!file)return;input.disabled=true;
        try{const src=await cropImage(file,position);if(src)store.change(s=>s.images[id]=src,'images');}
        catch(error){notify(error.message);}finally{input.disabled=false;}
      };
      remove.onclick=()=>store.change(s=>delete s.images[id],'images');
      const citationInput = document.createElement('input');
      citationInput.type = 'text';
      citationInput.className = 'image-citation-input';
      citationInput.placeholder = T("form.004");
      
      // 🔥 第 1 項需求：一般的圖片輸入框也固定放一個擦不掉的 'ⓒ' SVG 標記
      citationInput.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ctext x='0' y='13' font-size='13' font-family='sans-serif' fill='%23555'%3Eⓒ%3C/text%3E%3C/svg%3E")`;
      citationInput.style.backgroundRepeat = 'no-repeat';
      citationInput.style.backgroundPosition = '12px center'; // 固定在距離左邊 12px 的位置
      citationInput.style.paddingLeft = '30px'; // 把文字推開，不要壓到 ⓒ
      citationInput.style.textAlign = 'left';

      citationInput.value = store.state.values?.[`${id}-citation`] || '';
      citationInput.oninput = (e) => {
          store.change(s => {
              s.values[id + '-citation'] = e.target.value;
              (s.touched ??= {})[id + '-citation'] = true;
          });
      };
      const section=document.createElement('div');section.className='image-field';
      if(imageLabel){const heading=document.createElement('h4');heading.textContent=imageLabel;section.append(heading);}
      label.append(preview,caption,input);
      // 🔥 [關鍵修正] 把 citationInput 插在 label 與 remove 之間。
      section.append(label, citationInput, remove); 
      bindVisibility(section,visibleWhen);
      if(placement==='afterFields')trailingImages.push(section);else body.append(section);
    }
    {
      const rows=new Map();
      for(const field of fieldItems) {
        if(field.type==='richtext'){
          const rich=createRichTextField(store,field);body.append(rich.body);cleanups.push({mount:()=>rich.mount()});continue;
        }
        if(field.type==='radio'){
          const section=document.createElement('fieldset');section.className='field-radio';
          const legend=document.createElement('legend');legend.textContent=field.label;
          const options=document.createElement('div');options.className='field-radio-options';
          const inputs=[];
          for(const option of field.options){
            const label=document.createElement('label');label.className='field-radio-option';
            const input=document.createElement('input');input.type='radio';input.name=field.id;input.value=option.value;
            input.checked=store.state.values[field.id]===option.value;inputs.push(input);
            input.onchange=()=>{if(input.checked)store.change(s=>{s.values[field.id]=input.value;(s.touched??={})[field.id]=true;});};
            const caption=document.createElement('span');caption.textContent=option.label;
            label.append(input,caption);options.append(label);
          }
          cleanups.push({mount:()=>store.subscribe(()=>{for(const input of inputs)input.checked=store.state.values[field.id]===input.value;})});
          section.append(legend,options);bindVisibility(section,field.visibleWhen);body.append(section);
          continue;
        }
        const label=document.createElement('label');label.className='field-row';const text=document.createElement('span');text.textContent=field.label;label.append(text);
        const value=store.state.values[field.id];
        bindVisibility(label,field.visibleWhen);
        if(field.type==='checkbox'){
          label.classList.add('field-checkbox');
          const input=document.createElement('input');input.type='checkbox';input.name=field.id;input.checked=value===true;
          input.onchange=()=>store.change(s=>{s.values[field.id]=input.checked;(s.touched??={})[field.id]=true;});
          label.prepend(input);
        }else if(field.type==='number'){
          label.classList.add('field-number');
          const slider=document.createElement('input');slider.type='range';slider.className='custom-range-slider';
          const input=document.createElement('input');input.type='number';input.name=field.id;
          for(const node of [slider,input]){node.min=field.min;node.max=field.max;node.step=field.step??1;node.value=value;}
          slider.setAttribute('aria-label',field.label+T("form.005"));
          function commit(raw){const n=Number(raw),value=Math.max(field.min,Math.min(field.max,Number.isFinite(n)?n:field.min));input.value=value;slider.value=value;store.change(s=>{s.values[field.id]=value;(s.touched??={})[field.id]=true;});}
          slider.oninput=()=>commit(slider.value);
          input.oninput=()=>{if(input.value!==''&&input.validity.valid)commit(input.value);};input.onchange=()=>commit(input.value);
          label.append(slider,input);
        }else if(field.type==='color'){
          const button=document.createElement('button');button.type='button';button.className='color-swatch';button.style.backgroundColor=value;button.setAttribute('aria-label',field.label+T("form.006"));label.append(button);
          // Pickr 要等加進 DOM 之後才初始化。
          cleanups.push({mount:()=>attachColorPicker(button,value,color=>store.change(s=>s.values[field.id]=color),eyedropper)});
        }else{
          const input=document.createElement(field.type==='textarea'?'textarea':field.type==='font'?'select':'input');
          input.name=field.id;
          if(field.placeholder)input.placeholder=field.placeholder;
          input.style.textAlign=field.align||'left';

          if(field.type==='font')for(const font of fonts){
            const option=document.createElement('option');
            option.value=font;



            option.textContent=fontLabel(font);
            option.style.fontFamily=font;
            input.append(option);
          }

          else {input.maxLength=field.maxLength??(field.type==='textarea'?500:100);if(field.type==='textarea')input.rows=3;else input.type='text';if(field.inputMode)input.inputMode=field.inputMode;}
          input.value=value;
          if(field.type!=='font')input.addEventListener('focus',()=>{
            const defaults=definition.defaultValues?.(currentSide)??initialState(store.state.templateId).values;
            if(!field.keepDefault&&!store.state.touched?.[field.id]&&input.value===defaults[field.id]&&input.value!==''){
              input.value='';store.change(s=>{s.values[field.id]='';(s.touched??={})[field.id]=true;});
              if(definition.fontSample?.(currentSide,group))updateFontSample();
            }
          });
          input.addEventListener(field.type==='font'?'change':'input',()=>{
            store.change(s=>{s.values[field.id]=input.value;(s.touched??={})[field.id]=true;},field.changeKind||'values');
            if(definition.fontSample?.(currentSide,group))updateFontSample();
          });label.append(input);
        }
        if(field.row){
          if(!rows.has(field.row)){const row=document.createElement('div');row.className='field-inline-row';rows.set(field.row,row);body.append(row);}
          rows.get(field.row).append(label);
        }else body.append(label);
      }
      if(definition.fontSample?.(currentSide,group)){
        const sample=document.createElement('p');sample.className='font-sample';body.append(sample);updateFontSample();
      }
    }
    body.append(...trailingImages);
    const actions=definition.formActions?.(currentSide,store.state)||[];
    const actionRow=document.createElement('div');actionRow.className='member-form-actions';
    for(const action of actions){
      const button=document.createElement('button');button.type='button';button.className='member-form-action';
      button.textContent=action.label;button.disabled=!!action.disabled;
      if(action.icon){const icon=document.createElement('i');icon.className=action.icon;icon.setAttribute('aria-hidden','true');button.replaceChildren(icon);button.classList.add('member-move-action');button.setAttribute('aria-label',action.label);button.title=action.label;}
      button.onclick=()=>action.onClick({store,open});actionRow.append(button);
    }
    if(actions.length)body.append(actionRow);
    function updateFontSample(){const sample=body.querySelector('.font-sample');if(sample){const config=definition.fontSample(currentSide,group);sample.textContent=store.state.values[config.textId]||T("form.007");sample.style.fontFamily=store.state.values[config.fontId];}}
    return {body,mount(){for(const item of cleanups)item.destroy=item.mount();},destroy(){for(const item of cleanups)item.destroy?.();}};
  }
  function clearPanels(){for(const p of panels.values()){p.form?.destroy();p.node.remove();}panels.clear();}
  function placePanel(node,anchor){
    const area=document.querySelector('.editor-main').getBoundingClientRect();
    const rect=node.getBoundingClientRect();
    const x=anchor?anchor.x+anchor.width+32:area.left+20;
    const preferred=x;
    node.style.left=Math.max(8,Math.min(innerWidth-rect.width-8,preferred))+'px';
    node.style.top=Math.max(8,Math.min(innerHeight-rect.height-8,anchor?anchor.y+24:area.top+110))+'px';
  }
  function open(sideValue,group,konvaNode,refresh=false){
    side=sideValue;category=group;
    normalizeSelection();group=category;
    announceSelection();
    if(compact.matches){renderMobile();host.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});return;}
    const key=side+':'+group;let entry=panels.get(key);
    if(entry&&!refresh){entry.node.style.zIndex=String(++z);entry.node.focus();return;}
    const previous=definition.formOptions?.preservePanelPosition?[...panels.values()][0]?.node:null;
    const previousPosition=previous?{left:previous.style.left,top:previous.style.top}:null;
    clearPanels();
    const form=fieldPanel(side,group),node=document.createElement('section');node.className='floating-editor';node.tabIndex=-1;
    if(definition.formOptions?.panelClass)node.classList.add(definition.formOptions.panelClass);
    if(definition.formOptions?.desktopCategories){
      const selectedSide=side;
      const navigation=document.createElement('div');navigation.className='desktop-member-navigation';
      const select=document.createElement('select');select.setAttribute('aria-label',T("form.008"));
      for(const tab of contentTabs().filter(tab=>tab.type!=='stickers')){
        const option=document.createElement('option');option.value=tab.id;option.textContent=tab.label;select.append(option);
      }
      select.value=side;select.onchange=()=>open(select.value,group);if(select.options.length>1)navigation.append(select);
      const categories=document.createElement('div');categories.className='field-categories desktop-field-categories';
      categories.setAttribute('aria-label',T("form.009"));
      for(const [key,label] of getGroups(side)){
        const button=document.createElement('button');button.type='button';button.textContent=label;
        button.setAttribute('aria-pressed',String(key===group));button.onclick=()=>open(selectedSide,key);categories.append(button);
      }
      navigation.append(categories);form.body.querySelector('h3').after(navigation);
    }
    node.setAttribute('role','dialog');node.setAttribute('aria-label',form.body.querySelector('h3').textContent);node.style.zIndex=String(++z);
    const close=document.createElement('button');close.className='floating-close';close.type='button';close.innerHTML='<i class="bi bi-x" aria-hidden="true"></i>';close.setAttribute('aria-label',T("form.010"));
    close.onclick=()=>{form.destroy();node.remove();panels.delete(key);};node.addEventListener('keydown',e=>{if(e.key==='Escape')close.click();});
    node.addEventListener('pointerdown',()=>node.style.zIndex=String(++z));
    node.append(close,form.body);document.body.append(node);form.mount();panels.set(key,{node,form});
    let anchor=null;if(konvaNode){const stage=konvaNode.getStage(),p=stage.getPointerPosition(),c=stage.container().getBoundingClientRect();if(p)anchor={x:c.left+p.x,y:c.top+p.y,width:0,height:0};}
    if(previousPosition){node.style.left=previousPosition.left;node.style.top=previousPosition.top;}else placePanel(node,anchor);
    node.focus({preventScroll:true});
    const handle=form.body.querySelector('h3');handle.classList.add('editor-drag-handle');handle.title=T("form.011");handle.tabIndex=0;
    let drag=null;
    // 不只標題，面板的空白處與說明文字也能拖動。真正的操作元件除外。
    const controls='input,textarea,select,button,a,label,[contenteditable]:not([contenteditable="false"]),[role="button"]';
    node.addEventListener('pointerdown',e=>{
      if(e.button!==0||!e.isPrimary||drag||e.target.closest(controls))return;
      const r=node.getBoundingClientRect();
      // 面板自己的捲軸還是照常能拉。
      if(e.clientX>=r.left+node.clientLeft+node.clientWidth||e.clientY>=r.top+node.clientTop+node.clientHeight)return;
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};
      node.setPointerCapture(e.pointerId);node.focus({preventScroll:true});e.preventDefault();
    });
    function move(left,top){node.style.left=Math.max(0,Math.min(innerWidth-node.offsetWidth,left))+'px';node.style.top=Math.max(0,Math.min(innerHeight-node.offsetHeight,top))+'px';}
    node.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      node.classList.add('is-dragging');
      move(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);
    });
    const stopDrag=e=>{
      if(!drag||e.pointerId!==drag.id)return;
      drag=null;node.classList.remove('is-dragging');
      if(node.hasPointerCapture(e.pointerId))node.releasePointerCapture(e.pointerId);
    };
    node.addEventListener('pointerup',stopDrag);node.addEventListener('pointercancel',stopDrag);
    node.addEventListener('lostpointercapture',stopDrag);
    handle.addEventListener('keydown',e=>{const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];if(delta){e.preventDefault();const r=node.getBoundingClientRect();move(r.left+delta[0],r.top+delta[1]);}});
  }
  document.addEventListener('pointerdown',e=>{
    if(eyedropper?.active||compact.matches||e.target.closest('.floating-editor,.member-preview,.pcr-app,dialog'))return;
    clearPanels();
  },true);
  function renderStickerList(){
    const target=host.querySelector('.sticker-list');if(!target)return;target.replaceChildren();
    const add=document.createElement('button');add.type='button';add.className='add-sticker';add.textContent=T("form.012");add.onclick=chooseSticker;target.append(add);
    for(const item of store.state.stickers){
      const card=document.createElement('div');card.className='sticker-card';card.classList.toggle('selected',item.id===selection);
      const select=document.createElement('button');select.type='button';select.className='sticker-select';select.setAttribute('aria-label',item.name+T("form.006"));
      const img=document.createElement('img');img.src=item.src;img.alt=item.name;select.append(img);select.onclick=()=>{selection=item.id;stickers.select(item.id);renderStickerList();};
      const remove=document.createElement('button');remove.type='button';remove.className='sticker-list-delete';remove.textContent='×';remove.setAttribute('aria-label',item.name+T("form.013"));remove.onclick=()=>stickers.remove(item.id);
      const shadow=document.createElement('button');shadow.type='button';shadow.className='sticker-shadow-toggle';shadow.textContent=item.shadow?T("form.014"):T("form.015");shadow.setAttribute('aria-pressed',String(!!item.shadow));shadow.onclick=()=>stickers.toggleShadow(item.id);
      card.append(select,remove,shadow);target.append(card);
    }
  }
  let tabScroll=0;
  function scrollableTabs(node){
    let drag=null,moved=false;
    node.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){drag={x:e.clientX,left:node.scrollLeft,id:e.pointerId};moved=false;}});
    node.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x;if(!moved&&Math.abs(dx)<5)return;
      moved=true;node.setPointerCapture(e.pointerId);node.scrollLeft=drag.left-dx;e.preventDefault();
    });
    const stop=()=>{drag=null;};
    node.addEventListener('pointerup',stop);node.addEventListener('pointercancel',stop);
    node.addEventListener('lostpointercapture',stop);node.addEventListener('pointerleave',()=>{if(!moved)stop();});
    node.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopImmediatePropagation();moved=false;}},true);
    node.addEventListener('dragstart',e=>e.preventDefault());
    node.addEventListener('wheel',e=>{
      if(e.ctrlKey||node.scrollWidth<=node.clientWidth)return;
      const unit=e.deltaMode===1?16:e.deltaMode===2?node.clientWidth:1;
      e.preventDefault();node.scrollLeft+=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*unit;
    },{passive:false});
  }
  function renderMobile(preserveScroll=false){
    const scroll=preserveScroll?{host:host.scrollTop,panel:host.querySelector('.mobile-field-panel')?.scrollTop??0}:null;
    keyboard.close();
    normalizeSelection();
    announceSelection();
    categoryScroll=host.querySelector('.field-categories')?.scrollLeft ?? categoryScroll;
    tabScroll=host.querySelector('.character-tabs-scroll')?.scrollLeft??tabScroll;
    const cleanup=mobileCleanup;mobileCleanup=()=>{};
    cleanup();host.replaceChildren();if(!compact.matches)return;
    const tabs=document.createElement('div');tabs.className='character-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',T("form.016"));
    const split=definition.formOptions?.scrollTabs;
    let tabRow=tabs;
    if(split){tabRow=document.createElement('div');tabRow.className='character-tab-row';tabRow.setAttribute('role','tablist');tabRow.setAttribute('aria-label',T("form.016"));tabs.removeAttribute('role');tabs.removeAttribute('aria-label');tabs.classList.add('character-tabs-scroll');tabRow.append(tabs);scrollableTabs(tabs);}
    for(const tab of getTabs()){
      const b=document.createElement('button');b.type='button';b.textContent=tab.label;
      b.id='tab-'+tab.id;
      if(tab.type==='action'){
        b.disabled=!!tab.disabled;
        if(tab.icon){const icon=document.createElement('i');icon.className=tab.icon;icon.setAttribute('aria-hidden','true');b.replaceChildren(icon);}
        b.setAttribute('aria-label',tab.ariaLabel||tab.label);
        b.onclick=async()=>{b.disabled=true;try{
          const next=await tab.onClick({store,open,chooseSticker});
          if(typeof next==='string')side=next;
          renderMobile();
          host.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
        }catch(error){notify(error.message);}finally{b.disabled=false;}};
      }else{
        b.setAttribute('role','tab');b.setAttribute('aria-selected',String(side===tab.id));b.setAttribute('aria-controls','active-fields');
        b.onclick=()=>{side=tab.id;normalizeSelection();renderMobile();document.getElementById('tab-'+tab.id)?.focus();};
      }
      if(split&&(tab.type==='action'||tab.fixed)){b.classList.add(tab.type==='action'?'character-tab-action':'character-tab-fixed');tabRow.append(b);}else tabs.append(b);
    }
    host.append(tabRow);tabs.scrollLeft=tabScroll;const panel=document.createElement('div');panel.className='mobile-field-panel';panel.id='active-fields';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-'+side);host.append(panel);
    if(getTabs().find(t=>t.id===side)?.type==='stickers'){
      const title=document.createElement('h3');title.textContent=T("form.017");const note=document.createElement('p');note.textContent=T("form.018");
      const list=document.createElement('div');list.className='sticker-list';panel.append(title,note,list);renderStickerList();mobileCleanup=()=>{};
    }else{
      const categories=document.createElement('div');categories.className='field-categories';categories.setAttribute('aria-label',T("form.009"));
      let drag=null,suppressClick=false;
      categories.addEventListener('pointerdown',e=>{
        if(e.pointerType!=='mouse'||e.button!==0)return;
        suppressClick=false;drag={x:e.clientX,left:categories.scrollLeft,id:e.pointerId};
      });
      categories.addEventListener('pointermove',e=>{
        if(!drag||e.pointerId!==drag.id)return;
        const dx=e.clientX-drag.x;
        if(!suppressClick&&Math.abs(dx)<5)return;
        suppressClick=true;categories.classList.add('is-dragging');
        if(!categories.hasPointerCapture(e.pointerId))categories.setPointerCapture(e.pointerId);
        categories.scrollLeft=drag.left-dx;e.preventDefault();
      });
      const endDrag=()=>{drag=null;categories.classList.remove('is-dragging');};
      categories.addEventListener('pointerup',endDrag);
      categories.addEventListener('pointercancel',endDrag);
      categories.addEventListener('lostpointercapture',endDrag);
      categories.addEventListener('pointerleave',()=>{if(!suppressClick)endDrag();});
      categories.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}},true);
      categories.addEventListener('dragstart',e=>e.preventDefault());
      categories.addEventListener('wheel',e=>{
        if(e.ctrlKey||categories.scrollWidth<=categories.clientWidth)return;
        const unit=e.deltaMode===1?16:e.deltaMode===2?categories.clientWidth:1;
        const delta=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*unit;
        if(!delta)return;e.preventDefault();categories.scrollLeft+=delta;
      },{passive:false});
      for(const [key,name] of getGroups(side)){const b=document.createElement('button');b.type='button';b.textContent=name;b.setAttribute('aria-pressed',String(key===category));b.onclick=()=>{category=key;renderMobile();};categories.append(b);}
      panel.append(categories);if(!category){mobileCleanup=()=>{};return;}const form=fieldPanel(side,category);panel.append(form.body);form.mount();mobileCleanup=()=>form.destroy();
      categories.scrollLeft=categoryScroll;
    }
    if(scroll){host.scrollTop=scroll.host;panel.scrollTop=scroll.panel;tabs.scrollLeft=tabScroll;}
  }
  async function chooseSticker(){
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
    input.onchange=async()=>{try{const file=input.files[0];if(!file)return;const src=await readImage(file);await stickers.add(src,file.name);}catch(error){notify(error.message);}};input.click();
  }
  compact.addEventListener('change',()=>{clearPanels();renderMobile();});
  window.addEventListener('resize',()=>{for(const p of panels.values())placePanel(p.node);});
  store.subscribe((state,kind)=>{
    if(kind==='reorder'){
      if(!compact.matches&&panels.size)open(side,category,undefined,true);else renderMobile(true);
    }
    if(kind==='labels')for(const tab of contentTabs()){
      const button=document.getElementById('tab-'+tab.id);if(button)button.textContent=tab.label;
      for(const title of document.querySelectorAll('[data-member-side]'))if(title.dataset.memberSide===tab.id)
        title.textContent=[tab.heading??'',title.dataset.memberCategory].filter(Boolean).join(' ');
      for(const select of document.querySelectorAll('.desktop-member-navigation select'))
        for(const option of select.options)if(option.value===tab.id)option.textContent=tab.label;
    }
    if(kind==='replace'||kind==='structure'){clearPanels();renderMobile();}
    if(kind==='images'||kind==='replace')document.querySelectorAll('[data-image-preview]').forEach(img=>{const src=state.images[img.dataset.imagePreview];img.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');});
    if(kind==='stickers')renderStickerList();
  });
  renderMobile();
  return {open,chooseSticker,closeAll:clearPanels,selectSticker(id){selection=id;const tab=getTabs().find(t=>t.type==='stickers');if(compact.matches&&id&&tab){side=tab.id;renderMobile();}else renderStickerList();}};
}
