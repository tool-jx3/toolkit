// 存下來的不是 HTML，而是逐行的文字片段。格式相同的相鄰片段會合併。
export const DEFAULT_COLOR = '#363636';
const HEX = /^#[0-9a-f]{6}$/i;
export function plainDocument(text) {
  return {lines:String(text).replace(/\r\n?/g,'\n').split('\n').map(text=>({runs:text?[{text,bold:false,color:DEFAULT_COLOR}]:[]}))};
}
export function documentText(doc){return doc.lines.map(line=>line.runs.map(run=>run.text).join('')).join('\n');}
export function validateDocument(doc,text){
  if(!doc||!Array.isArray(doc.lines)||!doc.lines.length||doc.lines.length>1001)throw new Error(T("rich.001"));
  let count=0;
  const lines=doc.lines.map(line=>{
    if(!line||!Array.isArray(line.runs))throw new Error(T("rich.002"));
    const runs=[];
    for(const run of line.runs){
      if(++count>2000||!run||typeof run.text!=='string'||/[\r\n]/.test(run.text)||run.text.length>1000||typeof run.bold!=='boolean'||!HEX.test(run.color))throw new Error(T("rich.002"));
      append(runs,{text:run.text,bold:run.bold,color:run.color.toLowerCase()});
    }
    return {runs};
  });
  const next={lines};if(documentText(next)!==text)throw new Error(T("rich.003"));return next;
}
function append(runs,run){
  if(!run.text)return;
  const last=runs.at(-1);
  if(last&&last.bold===run.bold&&last.color===run.color)last.text+=run.text;else runs.push({...run});
}
function colorHex(color,fallback){
  if(HEX.test(color))return color.toLowerCase();
  const match=/^rgb\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)\s*\)$/.exec(color);
  return match?'#'+match.slice(1).map(n=>Math.min(255,Number(n)).toString(16).padStart(2,'0')).join(''):fallback;
}
// 把 Enter 或貼上產生的 div、p、br 轉成明確的換行。
export function readEditor(root){
  function walk(node,style){
    if(node.nodeType===3)return [{text:node.nodeValue.replace(/\u00a0/g,' '),...style}];
    if(node.nodeType!==1&&node.nodeType!==11)return [];
    if(node.nodeName==='BR')return [{text:'\n',...style}];
    if(['SCRIPT','STYLE'].includes(node.nodeName))return [];
    const weight=node.style?.fontWeight;
    style={bold:weight?weight==='bold'||Number(weight)>=600:style.bold||['B','STRONG'].includes(node.nodeName),
      color:colorHex(node.style?.color||node.getAttribute?.('color')||'',style.color)};
    const out=[];let previousBlock=false,seen=false;
    const children=[...node.childNodes];
    if(children.length===1&&children[0].nodeName==='BR')return [];
    for(const child of children){
      const block=['DIV','P','LI'].includes(child.nodeName);
      if(seen&&(block||previousBlock))append(out,{text:'\n',...style});
      for(const run of walk(child,style))append(out,run);
      previousBlock=block;seen=true;
    }
    return out;
  }
  const lines=[{runs:[]}];
  for(const run of walk(root,{bold:false,color:DEFAULT_COLOR})){
    run.text.split('\n').forEach((text,i)=>{if(i)lines.push({runs:[]});append(lines.at(-1).runs,{...run,text});});
  }
  return {lines};
}
function writeEditor(editor,doc){
  editor.replaceChildren();
  for(const line of doc.lines){
    const div=document.createElement('div');
    for(const run of line.runs){const span=document.createElement('span');span.textContent=run.text;span.style.fontWeight=run.bold?'700':'400';span.style.color=run.color;div.append(span);}
    if(!div.childNodes.length)div.append(document.createElement('br'));editor.append(div);
  }
}

export function createRichTextField(store,field){
  const body=document.createElement('div');body.className='rich-text-field';
  const toolbar=document.createElement('div');toolbar.className='rich-text-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label',field.label+T("rich.004"));
  const bold=document.createElement('button');bold.type='button';bold.textContent=T("rich.005");bold.setAttribute('aria-pressed','false');
  const colorLabel=document.createElement('label');colorLabel.className='rich-text-color';colorLabel.append(document.createTextNode(T("rich.006")));
  const color=document.createElement('input');color.type='color';color.value=DEFAULT_COLOR;color.setAttribute('aria-label',field.label+T("rich.007"));colorLabel.append(color);
  const resetColor=document.createElement('button');resetColor.type='button';resetColor.textContent=T("rich.008");
  toolbar.append(bold,colorLabel,resetColor);
  const editor=document.createElement('div');editor.contentEditable='true';editor.dataset.richEditor=field.id;editor.className='rich-text-editor';editor.setAttribute('role','textbox');editor.setAttribute('aria-label',field.label);editor.setAttribute('aria-multiline','true');editor.spellcheck=false;
  const note=document.createElement('p');note.className='rich-text-note';note.textContent=T("rich.009");note.setAttribute('role','status');
  body.append(toolbar,editor,note);
  let savedRange=null,composing=false,lastDoc=store.state.richText?.[field.id]||plainDocument(store.state.values[field.id]);
  writeEditor(editor,lastDoc);
  function capture(){const selection=getSelection();if(selection?.rangeCount&&editor.contains(selection.anchorNode)&&editor.contains(selection.focusNode))savedRange=selection.getRangeAt(0).cloneRange();return savedRange;}
  function restore(){editor.focus({preventScroll:true});if(savedRange){const selection=getSelection();selection.removeAllRanges();selection.addRange(savedRange);}}
  editor.richSelection={
    capture(){const range=capture();return range?{start:range.startContainer,startOffset:range.startOffset,end:range.endContainer,endOffset:range.endOffset}:null;},
    restore(saved){if(saved&&editor.contains(saved.start)&&editor.contains(saved.end)){savedRange=document.createRange();savedRange.setStart(saved.start,saved.startOffset);savedRange.setEnd(saved.end,saved.endOffset);}restore();}
  };
  function commit(){
    if(composing)return;
    const doc=readEditor(editor),text=documentText(doc);
    if(text.length>1000){writeEditor(editor,lastDoc);savedRange=null;note.textContent=T("rich.010");return;}
    lastDoc=doc;
    store.change(s=>{s.values[field.id]=text;(s.richText??={})[field.id]=doc;(s.touched??={})[field.id]=true;});capture();
  }
  function format(command,value){
    if(!savedRange){editor.focus({preventScroll:true});capture();}
    if(!savedRange)return;
    restore();document.execCommand(command,false,value);commit();capture();
    bold.setAttribute('aria-pressed',String(document.queryCommandState('bold')));
  }
  // 用瀏覽器內建的編輯指令，保住輸入法、選取範圍與原本的復原功能。
  bold.addEventListener('pointerdown',e=>{capture();e.preventDefault();});bold.onclick=()=>format('bold');
  color.addEventListener('pointerdown',capture);color.oninput=()=>format('foreColor',color.value);
  resetColor.addEventListener('pointerdown',e=>{capture();e.preventDefault();});
  resetColor.onclick=()=>{color.value=DEFAULT_COLOR;format('foreColor',DEFAULT_COLOR);};
  editor.addEventListener('input',commit);
  editor.addEventListener('compositionstart',()=>composing=true);
  editor.addEventListener('compositionend',()=>{composing=false;commit();});
  editor.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n'));commit();});
  editor.addEventListener('drop',e=>e.preventDefault());
  editor.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b'){e.preventDefault();capture();format('bold');}});
  const selected=()=>{capture();if(document.activeElement===editor)bold.setAttribute('aria-pressed',String(document.queryCommandState('bold')));};
  return {body,mount(){document.addEventListener('selectionchange',selected);return ()=>document.removeEventListener('selectionchange',selected);}};
}
