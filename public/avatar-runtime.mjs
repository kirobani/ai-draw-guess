// The bundled Cubism Framework reads Core constants while its module evaluates.
// Keep that optional dependency out of the game's static import graph.
let Renderer,loadError;
if(!globalThis.Live2DCubismCore){
  loadError=new Error('尚未安装或未能加载 Cubism Core。选手和 API 设置可正常使用；请按角色资源说明安装核心库后刷新页面。');
}else{
  try{({CharacterView:Renderer}=await import('./avatar-renderer.mjs'));}
  catch(cause){loadError=new Error('角色渲染器未能加载。选手和 API 设置可正常使用；请检查角色文件是否完整，安装后刷新页面。',{cause});}
}

class UnavailableCharacterView {
  constructor(canvas,options={}){
    this.canvas=canvas;this.onError=options.onError||(()=>{});
    this.ready=false;this.disposed=false;
  }
  async load(){
    if(!this.disposed){this.canvas.dataset.loaded='error';this.onError(loadError);}
    return this;
  }
  setState(state){this.canvas.dataset.state=state;}
  setPaused(){}
  setSuspended(){}
  setFraming(){}
  setPose(){}
  setEyesClosed(){}
  blink(){}
  resize(){}
  destroy(){this.disposed=true;}
}

export const avatarRuntimeAvailable=!!Renderer;
export const CharacterView=Renderer||UnavailableCharacterView;
