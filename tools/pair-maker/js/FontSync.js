export function createFontSync(stage, updateValues, onError) {
  let warned=false;
  function refresh() {
    updateValues();
    for(const node of stage.find('Text')) {
      if(!node.isVisible())continue;
      const text=node.text();
      if(text){node.text('');node.text(text);}
    }
    stage.batchDraw();
  }
  async function sync() {
    updateValues();
    if(document.fonts){
      const requests=new Map();
      for(const node of stage.find('Text')){
        if(!node.isVisible())continue;
        const text=node.text();if(!text)continue;
        const family=node.fontFamily().split(',').map(name=>{
          const clean=name.trim().replace(/^['"]|['"]$/g,'');
          return ['serif','sans-serif','monospace','cursive','fantasy','system-ui'].includes(clean)?clean:JSON.stringify(clean);
        }).join(',');
        const font=`${node.fontStyle()||'normal'} ${node.fontVariant()||'normal'} ${node.fontSize()}px ${family}`;
        const key=font+'\n'+text;
        if(!requests.has(key))requests.set(key,document.fonts.load(font,text).catch(()=>{
          if(!warned){warned=true;onError?.(T("font.001"));}
        }));
      }
      await Promise.all(requests.values());
    }
    refresh();
  }
  document.fonts?.addEventListener('loadingdone',refresh);
  window.addEventListener('pageshow',()=>{sync().catch(onError);});
  return {sync,refresh};
}
