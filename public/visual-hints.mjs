export const HINT_MODES=[
  {id:'none',name:'禁止任何提示',label:'1 · 禁止提示',description:'玩家和 AI 都不能发送公开或单独提示，只能通过补画帮助猜题。'},
  {id:'preset',name:'固定选项提示',label:'2 · 固定选项',description:'上一版规则：只选画面区域和观察重点，生成固定提示；不能自由写文字。第 2、3 轮开放。'},
  {id:'visual',name:'画面文字提示',label:'3 · 画面文字',description:'当前规则：自由提醒画里的具体内容、纠正误读，不解释词义。第 2、3 轮开放，默认使用此档。'}
];
export function normalizeHintMode(mode='visual'){
  if(!HINT_MODES.some(item=>item.id===mode))throw new Error('请选择有效的提示方式。');
  return mode;
}
export const hintModeInfo=mode=>HINT_MODES.find(item=>item.id===normalizeHintMode(mode));

// These choices also remain readable for older games.
export const HINT_REGIONS=[
  {id:'all',name:'整幅画',area:[0,0,1000,650]},
  ...['top','middle','bottom'].flatMap((row,y)=>['left','center','right'].map((col,x)=>({id:row+'-'+col,name:[['左上方','上方中间','右上方'],['左侧','中间','右侧'],['左下方','下方中间','右下方']][y][x],area:[x*1000/3,y*650/3,(x+1)*1000/3,(y+1)*650/3]})))
];
export const HINT_FOCUSES=[
  {id:'outline',name:'轮廓与形状',text:r=>`注意${r}的外轮廓和线条形状。`},
  {id:'direction',name:'线条朝向',text:r=>`注意${r}线条的朝向和指向。`},
  {id:'position',name:'相对位置',text:r=>`注意${r}各部分的上下、左右位置。`},
  {id:'count',name:'数量与重复',min:2,text:r=>`留意${r}相似图形出现的次数。`},
  {id:'size',name:'大小对比',min:2,text:r=>`比较${r}几个轮廓的大小。`},
  {id:'connection',name:'相连还是交叉',min:2,text:r=>`看清${r}哪些线条相连，哪些只是交叉。`},
  {id:'separate',name:'分开还是相连',min:2,text:r=>`留意${r}轮廓间的空隙，别把分开的部分看成连在一起。`},
  {id:'overlap',name:'轮廓重叠',min:2,text:r=>`看清${r}哪些轮廓相互重叠。`},
  {id:'inside',name:'轮廓内外',text:r=>`留意${r}轮廓内部和外部的位置关系。`},
  {id:'color',name:'颜色差别',text:r=>`比较${r}不同颜色各自对应的部分。`},
  {id:'whole',name:'整体看，别只盯一笔',text:r=>`把${r}的线条合起来看，不要只盯着某一笔。`}
];

function bounds(s){
  if(s.type==='ellipse')return [s.x-s.rx,s.y-s.ry,s.x+s.rx,s.y+s.ry];
  if(s.type==='rect')return [s.x,s.y,s.x+s.w,s.y+s.h];
  return [Math.min(...s.points.map(p=>p[0])),Math.min(...s.points.map(p=>p[1])),Math.max(...s.points.map(p=>p[0])),Math.max(...s.points.map(p=>p[1]))];
}
function presetChoice(value){
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['region','focus'].includes(k)))throw new Error('本局提示只能选择画面区域和观察重点，不能自由写文字。');
  if(!value.focus)return null;
  const region=HINT_REGIONS.find(r=>r.id===value.region),focus=HINT_FOCUSES.find(f=>f.id===value.focus);
  if(!region||!focus)throw new Error('请选择有效的画面区域和观察重点。');
  return {region,focus};
}
export function visualHint(value,shapes=[],mode='visual'){
  normalizeHintMode(mode);
  if(value==null||value==='')return {text:'',choice:null};
  if(mode==='none'){
    if(typeof value==='string'&&!value.trim())return {text:'',choice:null};
    throw new Error('本局禁止任何提示，请通过补画表达。');
  }
  if(mode==='preset'){
    const selected=presetChoice(value);if(!selected)return {text:'',choice:null};
    const {region,focus}=selected,a=region.area;
    const near=shapes.filter(s=>{const b=bounds(s);return b[0]<=a[2]&&b[2]>=a[0]&&b[1]<=a[3]&&b[3]>=a[1];});
    if(near.length<(focus.min||1))throw new Error('选定区域没有足够的笔画可供提示，请先补画或换一个区域。');
    return {text:focus.text(region.id==='all'?'画面':`画面${region.name}`),choice:{region:region.id,focus:focus.id}};
  }
  // Convert older structured hints without imposing their old region/stroke restrictions.
  if(typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['region','focus'].includes(k))){
    if(!value.focus)return {text:'',choice:null};
    const region=HINT_REGIONS.find(r=>r.id===value.region),focus=HINT_FOCUSES.find(f=>f.id===value.focus);
    if(region&&focus)value=focus.text(region.id==='all'?'画面':'画面'+region.name);
  }
  if(typeof value!=='string')throw new Error('请用文字填写提示。');
  const text=value.trim();
  if(text.length>300)throw new Error('提示请控制在 300 字以内。');
  return {text,choice:text||null};
}
export const VISUAL_HINT_RULES='提示可以自由表达，不必使用固定句式或区域选项。请围绕这幅画，别写题目或成语的释义、寓意、典故，也别直接报答案。你的身份是帮人看清画的画手，不是出释义谜语的老师。可以指出画里的具体物体、动作、位置或细节，例如“注意左边那个人手里拿着什么”；也可以针对选手的误读澄清，例如“你当成树枝的那条长线，其实是鱼竿”。只能解释可在笔画中定位的对象或关系，不要补充它象征哪类人、什么品德、什么道理或什么处境。正例：“看右边黑马身上的红圈，再看两匹马颜色哪里不同”；反例：“想想哪个成语专指马群里那匹惹祸的马”“注意它代表破坏集体的人”。这些反例即使加上“注意画面”“想一想”，仍然是在解释答案，不能用。不要添加图里没画出的惹祸、拖累、品行、因果或故事背景，不用近义词、反义词、适用场景和拆字暗示来替画面答题。也不要凭答案断言“它本来没有”“后来才加上”“因此害了别人”：如果画面没有呈现前后变化或因果，只描述眼前能看到的状态。画不清楚就补画，没画出来的关键含义不要靠提示补齐。提交前在心里检查每一条公开和单独提示：句中哪些内容能指到具体笔画？如果只是知道答案才补得出的解释，删掉这部分，保留读图提醒；删完没有有用内容就用 null。不要输出检查过程，也不要另写谜语。hint 是公开提示文字，hints 的值是针对该选手的提示文字；没有要提醒的内容时用 null。';
export const PRESET_HINT_RULES=`提示只能帮助读图，不能代替画面提供答案。禁止解释词义、成语寓意、典故、使用场景、近义词、反义词、谐音、拆字，禁止引入画中没有的物体或动作。画得不清楚先补画，不要用文字补答案。hint 和 hints 的值只能是 null 或 {"region":"区域编号","focus":"观察重点编号"}，不得输出自由文本或附加字段。区域：${HINT_REGIONS.map(r=>r.id+'='+r.name).join('；')}。观察重点：${HINT_FOCUSES.map(f=>f.id+'='+f.name).join('；')}。必须选择修改后画面已有笔画所在的区域；比较类重点需有多个相关部分。只有确实能帮助读图或纠正误读时才提示，否则返回 null。游戏会根据选项生成固定的读图指引，不会转发你写的解释。`;
export function hintRules(mode='visual'){
  normalizeHintMode(mode);
  if(mode==='none')return '本局禁止任何提示，包括公开和单独提示。只能补画，不能用文字描述线索、解释词义或纠正误读。所有轮次 hint 必须为 null，hints 必须为 {}。';
  return (mode==='preset'?PRESET_HINT_RULES:VISUAL_HINT_RULES)+'hint 是公开提示，hints 对象的键只能是前述未猜中选手的 id，值是只发给该选手的提示。';
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function hintControl(label,recipient,value=null,mode='visual'){
  normalizeHintMode(mode);
  if(mode==='none')return '';
  if(mode==='preset'){
    const choice=value&&typeof value==='object'?value:null;
    return `<div class="visual-hint" data-hint-recipient="${esc(recipient)}"><span>${esc(label)}</span><div class="visual-hint-fields"><label><span class="sr-only">${esc(label)}区域</span><select data-hint-region aria-label="${esc(label)}区域">${HINT_REGIONS.map(r=>`<option value="${r.id}" ${r.id===(choice?.region||'all')?'selected':''}>${r.name}</option>`).join('')}</select></label><label><span class="sr-only">${esc(label)}观察重点</span><select data-hint-focus aria-label="${esc(label)}观察重点"><option value="">不提示</option>${HINT_FOCUSES.map(f=>`<option value="${f.id}" ${f.id===choice?.focus?'selected':''}>${f.name}</option>`).join('')}</select></label></div><small data-hint-preview aria-live="polite">${esc(choice?visualHint(choice).text:'不发送提示')}</small></div>`;
  }
  const text=visualHint(value).text;
  return '<label class="visual-hint" data-hint-recipient="'+esc(recipient)+'"><span>'+esc(label)+'</span><textarea data-hint-text maxlength="300" rows="3" aria-label="'+esc(label)+'" placeholder="例如：注意左边那个人手里的东西；那条长线是鱼竿，不是树枝。">'+esc(text)+'</textarea><small>提醒画里的具体内容，或纠正看错的地方。别解释题意。</small></label>';
}
