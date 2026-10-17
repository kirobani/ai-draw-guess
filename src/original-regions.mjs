export const FACES={"gemini": [316, 115, 132, 128], "claude": [308, 59, 177, 181], "chatgpt": [323, 81, 119, 149], "grok": [326, 118, 121, 142], "glm": [307, 66, 141, 154], "kimi": [301, 84, 141, 158], "qwen": [322, 89, 135, 139], "doubao": [328, 51, 126, 147]};
export function sourceRegion(id,view){
 if(id==='deepseek')return view==='full'?{x:100,y:0,w:568,h:768}:view==='face'?{x:275,y:38,w:205,h:221}:{x:158,y:22,w:450,h:425};
 const [x,y,w,h]=FACES[id];
 return view==='full'?{x:128,y:0,w:512,h:768}:view==='face'?{x:x-42,y:Math.max(0,y-78),w:w+84,h:h+116}:{x:190,y:0,w:390,h:440};
}
