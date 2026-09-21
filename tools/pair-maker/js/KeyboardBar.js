export function createKeyboardBar(host){
  const mobile=matchMedia('(max-width:768px)'),viewport=window.visualViewport;
  const compact=matchMedia('(max-width:1024px)');
  const bar=document.createElement('section');bar.className='keyboard-bar';bar.hidden=true;
  
  // 🔥 [關鍵修正 1] 為了消掉算繪卡頓，寬度只在這裡固定成 100% 一次。
  bar.style.width = '100%'; 
  bar.style.left = '0px';

  const title=document.createElement('span');title.className='keyboard-bar-title';
  const row=document.createElement('div');row.className='keyboard-bar-row';
  const done=document.createElement('button');done.type='button';done.innerHTML='<i class="bi bi-check2" aria-hidden="true"></i>';done.className='keyboard-bar-done';
  /* 這條列只建立一次，切語言時不會重畫，所以兩個標籤集中重套。 */
  const applyBarLabels=()=>{bar.setAttribute('aria-label',T("kbd.001"));done.setAttribute('aria-label',T("kbd.002"));};
  applyBarLabels();I18N.onChange(applyBarLabels);
  row.append(title,done);bar.append(row);document.body.append(bar);
  let active=null,frame=0,baseline=0,sawKeyboard=false;

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
    
    if((viewport?.scale||1)===1){
      if(navigator.maxTouchPoints > 0) {
          if(baseline-height>100)sawKeyboard=true;
          else if(sawKeyboard&&baseline-height<60){close();return;}
      }
    }
    bar.style.top=Math.max(top,top+height-bar.offsetHeight)+'px';
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  function fitText(){
    if(active?.input.tagName==='TEXTAREA'){
      active.input.style.height='auto';active.input.style.height=(active.input.scrollHeight+2)+'px';
    }
    schedule();
  }
  function close(){
    if(!active)return;const current=active;active=null;
    current.input.removeEventListener('input',fitText);
    current.input.style.height=current.height;
    if(current.rows!==null)current.input.setAttribute('rows',current.rows);
    if(current.placeholder.isConnected)current.placeholder.replaceWith(current.moved);else current.moved.remove();
    current.input.blur();bar.hidden=true;document.body.classList.remove('keyboard-editing');
  }
  function open(input){
    if(active?.input===input)return;close();
    const rich=input.hasAttribute('data-rich-editor');
    const label=input.getAttribute('aria-label')||input.closest('.field-row')?.querySelector('span')?.textContent || input.placeholder || T("kbd.003");
    const placeholder=document.createElement('span');placeholder.className='keyboard-input-placeholder';placeholder.textContent=T("kbd.004");
    const start=input.selectionStart,end=input.selectionEnd;
    const saved=rich?input.richSelection?.capture():null,moved=rich?input.closest('.rich-text-field'):input;
    active={input,moved,placeholder,height:input.style.height,rows:input.getAttribute('rows')};baseline=viewport?.height||innerHeight;sawKeyboard=false;
    title.textContent=label;input.setAttribute('aria-label',label);moved.replaceWith(placeholder);
    bar.hidden=false;bar.classList.toggle('keyboard-bar-rich',rich);row.prepend(moved);document.body.classList.add('keyboard-editing');
    if(input.tagName==='TEXTAREA')input.rows=1;
    input.addEventListener('input',fitText);fitText();position();
    input.focus({preventScroll:true});if(rich)input.richSelection?.restore(saved);else if(start!=null)input.setSelectionRange(start,end);schedule();
  }

  bar.addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Enter') {
      if (active.input.tagName !== 'TEXTAREA'&&!active.input.hasAttribute('data-rich-editor')) {
        e.preventDefault();
        close();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const focusables = Array.from(host.querySelectorAll('input[type="text"], textarea, [data-rich-editor], .keyboard-input-placeholder'))
        .filter(el => el === active.placeholder || el.offsetParent !== null);
      const currentIndex = focusables.indexOf(active.placeholder);
      if (currentIndex !== -1) {
        const nextIndex = currentIndex + (e.shiftKey ? -1 : 1);
        if (nextIndex >= 0 && nextIndex < focusables.length) { focusables[nextIndex].focus(); } 
        else { close(); }
      }
    }
  });

  document.addEventListener('focusin',e=>{
    if(host.contains(e.target)&&((mobile.matches&&e.target.matches('input[type="text"],textarea, .image-citation-input, .sticker-citation-input'))||(compact.matches&&e.target.hasAttribute('data-rich-editor'))))open(e.target);
  });
  bar.addEventListener('focusout',()=>requestAnimationFrame(()=>{if(active&&!bar.contains(document.activeElement))close();}));
  done.onclick=close;
  viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);
  window.addEventListener('resize',schedule);
  mobile.addEventListener('change',()=>{if(!mobile.matches&&!active?.input.hasAttribute('data-rich-editor'))close();});
  compact.addEventListener('change',()=>{if(!compact.matches)close();});
  
  // 🔥 [關鍵修正 3] 刪掉會造成無限迴圈卡頓的 ResizeObserver。
  
  return {close};
}
