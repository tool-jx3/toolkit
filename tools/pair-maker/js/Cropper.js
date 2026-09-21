import { readImage } from './state.js';
export async function cropImage(file,position) {
  const src=await readImage(file);if(!src)return null;
  return new Promise((resolve,reject)=>{
    const dialog=document.createElement('dialog'); dialog.className='crop-dialog';
    dialog.innerHTML='<h2>' + T("crop.001") + '</h2><div class="crop-preview"><img alt="' + T("crop.002") + '"></div><div class="dialog-actions"><button type="button" data-zoom-out disabled>' + T("crop.003") + '</button><button type="button" data-zoom-in disabled>' + T("crop.004") + '</button><button type="button" data-fit disabled>' + T("crop.005") + '</button><button type="button" data-rotate disabled>' + T("crop.006") + '</button><button type="button" data-reset disabled>' + T("crop.007") + '</button></div><p>' + T("crop.008") + '</p><div class="dialog-actions"><button type="button" data-cancel>' + T("crop.009") + '</button><button type="button" data-apply class="primary" disabled>' + T("crop.010") + '</button></div>';
    document.body.append(dialog);dialog.showModal();
    const image=dialog.querySelector('img');let cropper=null,finished=false;
    function close(value,error){if(finished)return;finished=true;cropper?.destroy();dialog.close();dialog.remove();error?reject(error):resolve(value);}
    image.onload=()=>{
      // viewMode 1 會限制圖片不能小於裁切框。
      cropper=new window.Cropper(image,{aspectRatio:position.width/position.height,viewMode:0,autoCropArea:1,dragMode:'move',background:true,ready(){dialog.querySelectorAll('button[disabled]').forEach(button=>button.disabled=false);}});
    };
    image.onerror=()=>close(null,new Error(T("crop.011")));image.src=src;
    dialog.querySelector('[data-cancel]').onclick=()=>close(null);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close(null);});
    dialog.querySelector('[data-rotate]').onclick=()=>cropper?.rotate(90);
    dialog.querySelector('[data-reset]').onclick=()=>cropper?.reset();
    dialog.querySelector('[data-zoom-out]').onclick=()=>cropper?.zoom(-0.1);
    dialog.querySelector('[data-zoom-in]').onclick=()=>cropper?.zoom(0.1);
    dialog.querySelector('[data-fit]').onclick=()=>{
      const box=cropper.getCropBoxData(),canvas=cropper.getCanvasData(),image=cropper.getImageData();
      if(!canvas.width||!canvas.height)return;
      const factor=Math.min(box.width/canvas.width,box.height/canvas.height);
      cropper.zoomTo(image.width/image.naturalWidth*factor);
      const fitted=cropper.getCanvasData();
      cropper.setCanvasData({left:box.left+(box.width-fitted.width)/2,top:box.top+(box.height-fitted.height)/2});
    };
    dialog.querySelector('[data-apply]').onclick=()=>{
      try {
        const canvas=cropper.getCroppedCanvas({width:position.width,height:position.height,imageSmoothingEnabled:true,imageSmoothingQuality:'high'});
        if(!canvas)throw new Error(T("crop.012"));close(canvas.toDataURL('image/png'));
      }catch(error){close(null,error);}
    };
  });
}
