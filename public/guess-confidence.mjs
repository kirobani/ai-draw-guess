// This is a model's self-rating of visual evidence, not a correctness probability.
export const CONFIDENCE_RULE='confidence 填你仅根据画面线索对本次答案的主观把握，0 到 100 的整数；线索明确就高，犹豫就中，瞎蒙就低。';
export function normalizeConfidence(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?Math.round(value):null;}
export function submittedExpression(confidence,seed=''){
  const value=normalizeConfidence(confidence);
  if(value!==null)return value>=75?'confident':value>=40?'uncertain':'random';
  // Stable variety for older/custom models which omit the optional field.
  let hash=0;for(const c of String(seed))hash=(Math.imul(hash,31)+c.codePointAt(0))>>>0;
  return ['confident','uncertain','random'][hash%3];
}
export function submittedLabel(confidence){
  if(normalizeConfidence(confidence)===null)return '已提交 · 等待揭晓';
  return {confident:'已提交 · 很有把握',uncertain:'已提交 · 有点犹豫',random:'已提交 · 把握不大'}[submittedExpression(confidence)];
}
