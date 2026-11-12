const modelFamilyRig='model-family-live2d-r1';
const geminiFamilyRig='gemini-family-live2d-r1';

function avatar(id,family,name,face){
  const rigRevision=family==='gemini'?geminiFamilyRig:modelFamilyRig;
  const [x,y,w,h]=face;
  return {
    id,family,name,rigRevision,
    modelUrl:`/models/${rigRevision}/${id}/${id}-expressions.model3.json`,
    views:{
      full:{x:110,y:0,w:550,h:768},
      portrait:{x:150,y:0,w:470,h:family==='gemini'?650:515},
      face:{x:x-42,y:Math.max(0,y-78),w:w+84,h:h+116},
      seat:{x:Math.round(x+w/2)-225,y:0,w:450,h:480}
    }
  };
}

// Canvas and face bounds come from the two R1 packages' characters.json files.
export const MODEL_FAMILY_AVATARS=[
  avatar('astra','chatgpt','GPT · Astra',[293,71,179,194]),
  avatar('luna','chatgpt','GPT · Luna',[291,83,192,198]),
  avatar('sol','chatgpt','GPT · Sol',[292,58,182,198]),
  avatar('terra','chatgpt','GPT · Terra',[308,56,152,166]),
  avatar('opus','claude','Claude · Opus',[278,49,237,226]),
  avatar('sonnet','claude','Claude · Sonnet',[297,50,169,177]),
  avatar('haiku-5.5','claude','Claude · Haiku 5.5',[272,58,212,209]),
  avatar('fable-5.2','claude','Claude · Fable 5.2',[292,52,183,187]),
  avatar('gemini-ultra','gemini','Gemini · Ultra',[286,105,192,173]),
  avatar('gemini-pro','gemini','Gemini · Pro',[284,77,197,200]),
  avatar('gemini-flash','gemini','Gemini · Flash',[286,76,195,203]),
  avatar('gemini-flash-lite','gemini','Gemini · Flash-Lite',[280,83,204,211])
];
export const MODEL_FAMILY_AVATAR_MAP=Object.fromEntries(MODEL_FAMILY_AVATARS.map(c=>[c.id,c]));
export const MODEL_FAMILY_NAMES={chatgpt:'GPT',claude:'Claude',gemini:'Gemini'};

export function modelFamilyAvatarId(family,model){
  const name=String(model||'').trim().toLowerCase().split('/').at(-1);
  if(family==='chatgpt')return /^gpt-[\d.]+-(astra|luna|sol|terra)(?:$|[-:])/.exec(name)?.[1];
  if(family==='claude'){
    const tier=/^claude-(opus|sonnet|haiku|fable)(?:$|[-:])/.exec(name)?.[1];
    return {haiku:'haiku-5.5',fable:'fable-5.2'}[tier]||tier;
  }
  if(family==='gemini'&&/^gemini-/.test(name)){
    if(/(?:^|-)flash[-.]lite(?:$|[-:.])/.test(name))return 'gemini-flash-lite';
    if(/(?:^|-)flash(?:$|[-:.])/.test(name))return 'gemini-flash';
    if(/(?:^|-)(?:carbon|ultra)(?:$|[-:.])/.test(name))return 'gemini-ultra';
    if(/(?:^|-)(?:argon|pro)(?:$|[-:.])/.test(name))return 'gemini-pro';
  }
}
