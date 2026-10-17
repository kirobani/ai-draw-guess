import {applyDrawingEdit,drawPrompt,DrawingFormatError} from './shapes.mjs';

export function drawingRepairPrompt(prompt,data,error,previous){
  // Report structural facts, never reflect arbitrary model text as instructions.
  const count=value=>Array.isArray(value)?value.length:'缺失或不是数组';
  const summary=JSON.stringify({undo:Number.isInteger(data?.undo)?data.undo:'缺失或不是整数',appendCount:count(data?.append),shapesCount:count(data?.shapes)});
  const format=previous.length
    ?`本次是改画，原画仍完整保留，共 ${previous.length} 笔。必须同时返回整数 undo 和数组 append。undo 只能是 0–${previous.length}，append 只写新增笔画。只调整提示或保留原画时，也必须明确返回 {"undo":0,"append":[],"hint":null,"hints":{}}，再按本局提示规则填写 hint/hints。若撤回全部旧笔画，append 必须至少有一笔。不要用空 shapes 代替改画。`
    :'本次是首次作画，必须返回 {"shapes":[具体笔画],"hint":null,"hints":{}}，shapes 不能为空。';
  return `${prompt}\n\n上次回复未通过绘图格式检查，没有应用到画布。错误：${error.message} 回复结构：${summary}。这次只修正输出格式，重新提交一个完整 JSON 对象。${format}最终画面必须有 1–450 个有效笔画。不要解释错误、不要道歉、不要输出 Markdown。`;
}

export async function requestDrawing({run,player,word,previous=[],wrong=[],hintMode='visual',signal}){
  const prompt=drawPrompt(word,previous,wrong,hintMode);
  let data=await run(player,prompt,null,signal),elapsed=data?.elapsed||0;
  signal?.throwIfAborted();
  try{return {data,shapes:applyDrawingEdit(data,previous),elapsed};}
  catch(error){
    if(!(error instanceof DrawingFormatError))throw error;
    // One repair request to the same model. Network/auth/timeouts are not retried.
    // Keep the original drawing immutable until the entire replacement validates.
    signal?.throwIfAborted();
    data=await run(player,drawingRepairPrompt(prompt,data,error,previous),null,signal);
    signal?.throwIfAborted();elapsed+=data?.elapsed||0;
    try{return {data,shapes:applyDrawingEdit(data,previous),elapsed};}
    catch(repairError){
      if(repairError instanceof DrawingFormatError)throw new DrawingFormatError(`${repairError.message} 已自动修正一次仍未通过。${previous.length?'原画已保留，可重试改画。':'请重试画图。'}`);
      throw repairError;
    }
  }
}
