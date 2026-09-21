// 保留換行與局部格式，只有超出畫面寬度的行才額外折行。
export function createRichTextBlock(K,parent,attrs){
  const {x,y,width,height,fontFamily='Apple SD Gothic Neo',fontSize=24}=attrs;
  const group=new K.Group({x,y,clipX:0,clipY:0,clipWidth:width,clipHeight:height,listening:false});parent.add(group);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),nodes=[],measurements=new Map();
  const spacing=fontSize*-0.025,lineHeight=fontSize*1.5;
  const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
  let signature='';
  function measure(text,bold){
    const key=Number(bold)+text;if(measurements.has(key))return measurements.get(key);
    ctx.font=`${bold?700:400} ${fontSize}px "${fontFamily}"`;
    const value=ctx.measureText(text).width+Array.from(text).length*spacing;measurements.set(key,value);return value;
  }
  function update(doc){
    const next=JSON.stringify(doc);if(next===signature)return;signature=next;
    const fragments=[];let cy=0;
    for(const line of doc.lines){
      let cx=0,chunk=null;
      for(const run of line.runs){
        const chars=segmenter?[...segmenter.segment(run.text)].map(s=>s.segment):Array.from(run.text);
        for(const char of chars){
          const same=chunk&&chunk.bold===run.bold&&chunk.color===run.color;
          let advance=same?measure(chunk.text+char,run.bold)-measure(chunk.text,run.bold):measure(char,run.bold);
          if(cx>0&&cx+advance>width){cy+=lineHeight;cx=0;chunk=null;advance=measure(char,run.bold);}
          if(cy>=height)break;
          if(chunk&&chunk.bold===run.bold&&chunk.color===run.color)chunk.text+=char;
          else {chunk={text:char,bold:run.bold,color:run.color,x:cx,y:cy};fragments.push(chunk);}
          cx+=advance;
        }
        if(cy>=height)break;
      }
      cy+=lineHeight;if(cy>=height)break;
    }
    fragments.forEach((fragment,i)=>{
      if(!nodes[i]){nodes[i]=new K.Text({fontFamily,fontSize,letterSpacing:spacing,height:lineHeight,verticalAlign:'middle',wrap:'none',listening:false});group.add(nodes[i]);}
      nodes[i].setAttrs({x:fragment.x,y:fragment.y,text:fragment.text,fill:fragment.color,fontStyle:fragment.bold?'700':'400',visible:true});
    });
    for(let i=fragments.length;i<nodes.length;i++)nodes[i].hide();
  }
  function invalidate(){signature='';measurements.clear();}
  return {group,update,invalidate};
}
