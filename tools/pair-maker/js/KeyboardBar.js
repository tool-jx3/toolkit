export function createKeyboardBar(host){
  const viewport=window.visualViewport;
  const compact=matchMedia('(max-width:1024px)');
  const main=document.querySelector('.editor-main'),canvasArea=document.querySelector('.canvas-area');
  const bar=document.createElement('section');bar.className='keyboard-bar';bar.hidden=true;
  
  // 🔥 [關鍵修正 1] 為了消掉算繪卡頓，寬度只在這裡固定成 100% 一次。
  bar.style.width = '100%'; 
  bar.style.left = '0px';

  const title=document.createElement('span');title.className='keyboard-bar-title';
  const row=document.createElement('div');row.className='keyboard-bar-row';
  const done=document.createElement('button');done.type='button';done.innerHTML='<i class="bi bi-check2" aria-hidden="true"></i>';done.className='keyboard-bar-done';
  const expand=document.createElement('button');expand.type='button';expand.className='keyboard-bar-expand';
  /* 這條列只建立一次，切語言時不會重畫，所以標籤集中重套。 */
  const applyBarLabels=()=>{bar.setAttribute('aria-label',T("kbd.001"));done.setAttribute('aria-label',T("kbd.002"));expand.setAttribute('aria-label',T("kbd.005"));expand.title=T("kbd.006");};
  applyBarLabels();I18N.onChange(applyBarLabels);
  row.append(title,expand,done);bar.append(row);document.body.append(bar);
  let active=null,frame=0,gesture=null,suppressClick=false,resizeDrag=null;
  function resizeInput(height){
    if(!active)return;
    const overhead=bar.offsetHeight-active.input.getBoundingClientRect().height;
    const max=Math.max(50,(viewport?.height||innerHeight)-overhead-16);
    active.resizedHeight=Math.max(50,Math.min(max,height));
    bar.classList.add('keyboard-bar-resized');
    bar.style.setProperty('--keyboard-input-height',active.resizedHeight+'px');
  }
  expand.addEventListener('pointerdown',e=>{
    if(!active||e.button!==0)return;e.preventDefault();
    resizeDrag={id:e.pointerId,y:e.clientY,height:active.input.getBoundingClientRect().height};
    expand.setPointerCapture(e.pointerId);
  });
  expand.addEventListener('pointermove',e=>{
    if(!resizeDrag||resizeDrag.id!==e.pointerId)return;
    e.preventDefault();resizeInput(resizeDrag.height+resizeDrag.y-e.clientY);position();
  });
  function endResize(e){if(resizeDrag?.id!==e.pointerId)return;resizeDrag=null;if(expand.hasPointerCapture(e.pointerId))expand.releasePointerCapture(e.pointerId);}
  expand.addEventListener('pointerup',endResize);expand.addEventListener('pointercancel',endResize);
  expand.addEventListener('lostpointercapture',()=>{resizeDrag=null;});
  expand.addEventListener('keydown',e=>{if(active&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();resizeInput(active.input.getBoundingClientRect().height+(e.key==='ArrowUp'?16:-16));position();}});

  // 🔥 [關鍵修正 2] 出處輸入框被收進鍵盤列時，強制注入 CSS 讓它像一般欄位一樣撐滿
  if (!document.getElementById('keyboard-bar-style-override')) {
      const style = document.createElement('style');
      style.id = 'keyboard-bar-style-override';
      style.textContent = `
          .keyboard-bar-row .image-citation-input,
          .keyboard-bar-row .sticker-citation-input {
              max-width: none !important;
              border-radius: 14px !important;
              text-align: left !important;
              margin: 0 !important;
              padding: 26px 54px 8px 32px !important;
              background-position: 12px 28px !important;
          }
      `;
      document.head.appendChild(style);
  }

  function position(){
    if(!active)return;
    const height=viewport?.height||innerHeight,top=viewport?.offsetTop||0;
    
    bar.style.setProperty('--keyboard-viewport-height',height+'px');
    main?.style.setProperty('--keyboard-visible-height',height+'px');
    if(active.resizedHeight!=null)resizeInput(active.resizedHeight);
    bar.style.top=Math.max(top,top+height-bar.offsetHeight)+'px';
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  function fitText(){
    if(active?.input.tagName==='TEXTAREA'&&active.resizedHeight==null){
      active.input.style.height='auto';active.input.style.height=(active.input.scrollHeight+2)+'px';
    }
    schedule();
  }
  function close(){
    if(!active)return;const current=active;active=null;
    if(resizeDrag){const id=resizeDrag.id;resizeDrag=null;if(expand.hasPointerCapture(id))expand.releasePointerCapture(id);}
    current.input.removeEventListener('input',fitText);
    current.input.style.height=current.height;
    if(current.rows!==null)current.input.setAttribute('rows',current.rows);
    if(current.placeholder.isConnected)current.placeholder.replaceWith(current.moved);else current.moved.remove();
    current.input.blur();bar.hidden=true;document.body.classList.remove('keyboard-editing');
    if(main){main.scrollTop=0;for(const key of ['--keyboard-visible-height','--keyboard-canvas-height','--keyboard-panel-height'])main.style.removeProperty(key);}
  }
  function open(input){
    if(active)return;
    // 鍵盤把畫面擠小時，各區塊仍維持原本的高度，讓畫面可以捲動。
    main?.style.setProperty('--keyboard-canvas-height',(canvasArea?.getBoundingClientRect().height||0)+'px');
    main?.style.setProperty('--keyboard-panel-height',host.getBoundingClientRect().height+'px');
    const rich=input.hasAttribute('data-rich-editor');
    const label=input.getAttribute('aria-label')||input.closest('.field-row')?.querySelector('span')?.textContent || input.placeholder || T("kbd.003");
    const placeholder=document.createElement('span');placeholder.className='keyboard-input-placeholder';placeholder.textContent=T("kbd.004");
    const start=input.selectionStart,end=input.selectionEnd;
    const saved=rich?input.richSelection?.capture():null,moved=rich?input.closest('.rich-text-field'):input;
    active={input,moved,placeholder,height:input.style.height,rows:input.getAttribute('rows')};
    expand.hidden=!(rich||input.tagName==='TEXTAREA');bar.classList.remove('keyboard-bar-resized');bar.style.removeProperty('--keyboard-input-height');
    title.textContent=label;input.setAttribute('aria-label',label);moved.replaceWith(placeholder);
    bar.hidden=false;bar.classList.toggle('keyboard-bar-rich',rich);row.prepend(moved);document.body.classList.add('keyboard-editing');
    if(input.tagName==='TEXTAREA')input.rows=1;
    input.addEventListener('input',fitText);fitText();position();
    input.focus({preventScroll:true});if(rich)input.richSelection?.restore(saved);else if(start!=null)input.setSelectionRange(start,end);schedule();
  }

  bar.addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Enter'&&!e.isComposing&&e.keyCode!==229) {
      if (active.input.tagName !== 'TEXTAREA'&&!active.input.hasAttribute('data-rich-editor')) {
        e.preventDefault();
        close();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const focusables=[...bar.querySelectorAll('input,textarea,[data-rich-editor],button')].filter(el=>!el.disabled&&el.offsetParent!==null);
      const index=focusables.indexOf(document.activeElement);
      focusables[(index+(e.shiftKey?-1:1)+focusables.length)%focusables.length]?.focus();
    }
  });

  // 在外面短按一下只會關閉。拖曳、長按、捲動都不會關閉。
  function stop(e,prevent=true){if(prevent&&e.cancelable)e.preventDefault();e.stopImmediatePropagation();}
  window.addEventListener('pointerdown',e=>{
    if(!active){suppressClick=false;return;}
    if(bar.contains(e.target))return;
    if(gesture){gesture.moved=true;}else gesture={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),moved:e.button!==0,
      scroll:canvasArea?.contains(e.target)?main:null,scrollTop:main?.scrollTop||0,pointerType:e.pointerType};
    stop(e,e.pointerType!=='touch');
  },{capture:true,passive:false});
  window.addEventListener('pointermove',e=>{
    if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>10)gesture.moved=true;
    // 觸控交給瀏覽器預設的捲動；滑鼠／觸控筆則依拖曳距離捲動畫面。
    if(gesture?.moved&&gesture.scroll&&gesture.pointerType!=='touch'){
      gesture.scroll.scrollTop=gesture.scrollTop+gesture.y-e.clientY;if(e.cancelable)e.preventDefault();
    }
  },{capture:true,passive:false});
  window.addEventListener('pointercancel',()=>{if(gesture)gesture.moved=true;gesture=null;},true);
  window.addEventListener('pointerup',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;
    const tap=!gesture.moved&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<=10&&performance.now()-gesture.time<500&&!bar.contains(e.target);
    gesture=null;suppressClick=true;stop(e);if(tap)close();
  },{capture:true,passive:false});
  for(const event of ['wheel','scroll'])window.addEventListener(event,()=>{if(gesture)gesture.moved=true;},{capture:true,passive:true});
  for(const event of ['mousedown','mouseup','touchstart','touchend','dblclick','contextmenu'])window.addEventListener(event,e=>{
    if((active||suppressClick)&&!bar.contains(e.target))stop(e,!event.startsWith('touch'));
  },{capture:true,passive:false});
  window.addEventListener('click',e=>{
    if(bar.contains(e.target))return;
    if(suppressClick){suppressClick=false;stop(e);return;}
    if(active){stop(e);if(e.detail===0)close();}
  },{capture:true,passive:false});
  window.addEventListener('focusin',e=>{
    if(active&&!bar.contains(e.target)){
      e.stopImmediatePropagation();active.input.focus({preventScroll:true});return;
    }
  },true);
  document.addEventListener('focusin',e=>{
    if(host.contains(e.target)&&compact.matches&&e.target.matches('input[type="text"],textarea,.image-citation-input,.sticker-citation-input,[data-rich-editor]'))open(e.target);
  });
  done.onclick=close;
  viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);
  window.addEventListener('resize',schedule);
  compact.addEventListener('change',()=>{if(!compact.matches)close();});
  
  // 🔥 [關鍵修正 3] 刪掉會造成無限迴圈卡頓的 ResizeObserver。
  
  return {close};
}
