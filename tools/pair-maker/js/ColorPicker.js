export function attachColorPicker(button,value,onSave,eyedropper) {
  let destroyed=false, sampling=false, initialized=false;
  const pickr=window.Pickr.create({
    el:button,useAsButton:true,theme:'monolith',default:value,
    components:{preview:true,opacity:false,hue:true,interaction:{input:true,save:true,clear:false}},
    i18n:{'btn:save':T("crop.010"),'aria:btn:save':T("color.001")}
  });
  pickr.on('init',()=>{initialized=true;if(destroyed)pickr.destroyAndRemove();});
  pickr.on('save',(color,instance)=>{
    if(color){const hex=color.toHEXA().toString().slice(0,7);button.style.backgroundColor=hex;onSave(hex);}
    instance.hide();
  });
  if(eyedropper)pickr.on('init',()=>{
    if(destroyed)return;
    const trigger=document.createElement('button');trigger.type='button';
    trigger.className='pcr-canvas-eyedropper';
    trigger.innerHTML='<i class="bi bi-eyedropper" aria-hidden="true"></i> ' + T("color.002");
    trigger.onclick=async()=>{
      if(sampling||destroyed)return;
      sampling=true;trigger.disabled=true;pickr.hide();
      try{
        const hex=await eyedropper.pick();
        if(destroyed)return;
        if(hex){
          pickr.setColor(hex,true);pickr.applyColor();pickr.hide();
          button.focus({preventScroll:true});
        }else{
          trigger.disabled=false;pickr.show();trigger.focus({preventScroll:true});
        }
      }finally{sampling=false;if(!destroyed)trigger.disabled=false;}
    };
    pickr.getRoot().interaction.result.parentElement.append(trigger);
  });
  return ()=>{
    if(destroyed)return;
    destroyed=true;if(sampling)eyedropper.cancel();
    if(initialized)pickr.destroyAndRemove();
  };
}
