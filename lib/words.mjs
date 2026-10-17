import {readFileSync} from 'node:fs';
const idioms=JSON.parse(readFileSync(new URL('../data/idioms.json',import.meta.url),'utf8'));
const categoryWords=JSON.parse(readFileSync(new URL('../data/category-words.json',import.meta.url),'utf8'));
const aliases = { '风中残烛': ['风烛残年'], '自行车': ['单车', '脚踏车'], '猫': ['小猫','猫咪'], '狗': ['小狗','狗狗'], '熊猫': ['大熊猫'], '冰淇淋': ['冰激凌'], '西瓜': ['watermelon'], '兔子': ['兔'], '锅碗瓢盆': ['鍋碗瓢盆'], '眼花缭乱': ['眼花繚亂'] };
const entries=(answers,category)=>answers.map(answer=>({answer,category,aliases:aliases[answer]||[]}));
const idiomPools=Object.fromEntries(Object.entries(idioms).map(([level,answers])=>[level,entries(answers,'成语')]));
export const IDIOM_LEVELS=[
  {id:'easy',name:'入门',description:'常见、容易联想到画面的成语'},
  {id:'normal',name:'进阶',description:'更多常用成语，也有抽象表达'},
  {id:'challenge',name:'挑战',description:'全量四字成语词库，包含生僻词和古语'}
].map(level=>({...level,count:idiomPools[level.id].length}));
const levelNames=[{id:'easy',name:'入门'},{id:'normal',name:'进阶'},{id:'challenge',name:'挑战'}];
const descriptions={
 动物:['常见动物与有鲜明外形的物种','加入更多野生动物，区分外形与习性','加入较少见物种，考验特征观察'],
 食物:['常见食材、家常菜和零食','加入地方菜与甜点，留意做法和形态','加入特色菜及跨文化料理'],
 物品:['日常用品、交通工具和玩具','加入专门用途的工具与器材','加入专业设备与传统器物'],
 职业:['熟悉的工作，借助服装、工具和场景表达','加入专业工种和细分职业','加入更专门的职业与工作流程'],
 动作:['常见身体动作与日常活动','加入多步操作和技巧动作','加入复杂操作与组合动作'],
 故事:['熟悉的经典故事和直观生活小情节','加入历史故事和转折更丰富的小情节','加入典故和带隐喻的原创情节']
};
const categoryPools=Object.fromEntries(Object.entries(categoryWords).map(([category,levels])=>[category,Object.fromEntries(Object.entries(levels).map(([level,answers])=>[level,entries(answers,category)]))]));
export const CATEGORY_LEVELS={成语:IDIOM_LEVELS,...Object.fromEntries(Object.entries(categoryPools).map(([category,pools])=>[category,levelNames.map((level,i)=>({...level,count:pools[level.id].length,description:descriptions[category][i]+(i?'；包含前一档词库。':'。')}))]))};
export const WORDS=[...idiomPools.challenge,...Object.values(categoryPools).flatMap(pools=>pools.challenge)];
export const CATEGORIES=Object.entries(CATEGORY_LEVELS).map(([name,levels])=>({name,count:levels.at(-1).count,levels}));
export function getWordLevels(category){
 if(!Object.hasOwn(CATEGORY_LEVELS,category))throw new Error('请选择有效的题目分类。');
 return CATEGORY_LEVELS[category];
}
export function getWordPool(category,level='easy') {
 if(!getWordLevels(category).some(item=>item.id===level))throw new Error(category==='成语'?'请选择有效的成语难度。':'请选择有效的题库难度。');
 return category==='成语'?idiomPools[level]:categoryPools[category][level];
}
export const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
export function judgeGuess(word,value){
  const guess=normalize(value),answer=normalize(word.answer);
  if(guess===answer)return {correct:true,match:'exact'};
  if((word.aliases||[]).some(a=>normalize(a)===guess))return {correct:true,match:'alias'};
  // Only four-character idiom answers get the relaxed rule. Count duplicates too.
  if(word.category==='成语'&&/^\p{Script=Han}{4}$/u.test(answer)&&/^\p{Script=Han}{4}$/u.test(guess)){
    const a=Array.from(answer),g=Array.from(guess);
    if([...a].sort().join('')===[...g].sort().join(''))return {correct:true,match:'idiom-order'};
    if(a.filter((c,i)=>c===g[i]).length>=3)return {correct:true,match:'idiom-three'};
  }
  return {correct:false,match:null};
}
export const isCorrect=(word,value)=>judgeGuess(word,value).correct;
