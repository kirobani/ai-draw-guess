export const REACTIONS=[['idle','待机'],['drawing','正在画画'],['thinking','闭眼思考'],['confident','自信等待'],['happy','猜中了！'],['closed','闭眼休息'],['sad','O□O 猜错了！']];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function blinkOpen(t){if(t<0||t>.34)return 1;if(t<.13)return .5+.5*Math.cos(t/.13*Math.PI);if(t<.17)return 0;return .5-.5*Math.cos((t-.17)/.17*Math.PI);}
// Body motion is authored in the native rig; this driver keeps breathing active
// underneath every painted expression, without magnifying the iris movement.
export function reactionFrame(s,route='original'){const t=s.time,skill=route!=='original';let x=s.headX+Math.sin(t*.7)*(skill?1.8:1.2),y=s.headY+Math.sin(t*.9)*(skill?.95:.65),z=Math.sin(t*.8)*(skill?1.9:1.3),gx=s.gazeX*.45,gy=s.gazeY*.28,eyes=0,face=0,open=0,form=.1,eye=1,stroke=0;
 if(s.follow&&s.reaction==='idle'){x+=s.pointerX*4;y+=s.pointerY*1.5;gx+=s.pointerX*.48;gy+=s.pointerY*.28;}
 switch(s.reaction){case'drawing':y-=4;z=-3+Math.sin(t*2.3);gx=Math.sin(t*1.8)*.12;gy=-.42;stroke=Math.sin(t*5.5);break;case'thinking':y-=2;z=-1.5;eyes=face=1;eye=0;break;case'confident':x+=4;y+=3;z=5;eyes=face=5;gx=.12;gy=.15;break;case'happy':y+=Math.sin(t*4.5)*3;z=3+Math.sin(t*2.3)*3;eyes=face=2;eye=0;break;case'closed':eyes=face=3;eye=0;break;case'sad':eyes=face=4;break;}
 if(s.talking){face=0;open=clamp((.5+.5*Math.sin(t*12))*(.55+.45*Math.sin(t*3.4)**2),0,1);form=.2+Math.sin(t*3.3)*.5;}
 if(!eyes)eye=blinkOpen(t-s.blinkAt);
 return{ParamAngleX:clamp(x,-16,16),ParamAngleY:clamp(y,-6,6),ParamAngleZ:clamp(z,-10,10),ParamBodyAngleX:Math.sin(t*.5)*(skill?1.25:.7),ParamBodyAngleZ:Math.sin(t*.65)*(skill?1:.5),ParamEyeBallX:clamp(gx,-.6,.6),ParamEyeBallY:clamp(gy,-.42,.42),ParamEyeLOpen:eye,ParamEyeROpen:eye,ParamMouthOpenY:open,ParamMouthForm:form,ParamBrowLY:.05,ParamBrowRY:.05,ParamPaintedEyes:eyes,ParamPaintedFace:face,ParamDrawingBody:s.reaction==='drawing'?1:0,ParamDrawingStroke:stroke,ParamBreath:.5+Math.sin(t*1.25)*(skill?.48:.35)};
}
