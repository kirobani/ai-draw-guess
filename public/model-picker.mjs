import {paint} from './drawing.mjs';
import {modelSource,chosenEffort,waitSeconds,effortChoices,EFFORT_LABELS,WAIT_SECONDS,reasoningSummary} from './reasoning.mjs';
export {modelSource} from './reasoning.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function matchingModels(p,catalog,showText=false){
  const source=modelSource(p),family=p.characterId==='none'?null:p.characterId;
  return (catalog?.models||[]).filter(m=>m.source===source&&(!family||m.family===family)&&(m.id===p.model||m.gameDrawing&&(showText||m.vision)));
}
export function sameSetup(p,saved){return !!saved&&!p.apiKey&&!p.keySource&&p.provider===saved.provider&&p.baseUrl===saved.baseUrl&&p.model===saved.model&&chosenEffort(p)===chosenEffort(saved)&&waitSeconds(p)===waitSeconds(saved);}
export function connectionIssue(p){return p.provider!=='codex'&&/[{}]|%7[bd]/i.test(p.baseUrl||'')?'接口地址还是示例模板，请复制申请 Key 的平台提供的完整 Base URL；不能保留 {WorkspaceId}。':'';}
const dollars=n=>n===null?'—':'$'+new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n);
function receiptText(r){
  if(!r)return '本次未取得型号回执';
  if(r.source==='codex')return `本机 Codex 已按 ${esc(r.requestedModel)} 调用；命令行未提供服务端型号回执。`;
  return `请求：<code>${esc(r.requestedModel)}</code><br>返回：<code>${esc(r.responseModel||'平台未返回型号')}</code>${r.provider?`<br>承载服务：${esc(r.provider)}`:''}${r.requestId?`<br>请求编号：<code>${esc(r.requestId)}</code>`:''}`;
}
export function mountModelPicker(row,p,catalog,check){
  const host=row.querySelector('.model-picker'),showText=row.dataset.showText==='true',manualOpen=host.querySelector('.model-manual')?.open;
  const options=matchingModels(p,catalog,showText),source=modelSource(p),selected=catalog?.models?.find(m=>m.source===source&&m.id===p.model);
  const checked=check?.model===p.model?check:null;
  const vision=checked?.vision.ok?'✓ 识图实测通过':selected?.vision?'目录支持识图 · 待测':selected?.visionUnknown?'识图能力待实测':selected?'不支持识图':'识图能力待确认';
  const drawing=checked?.drawing.ok?'✓ 已返回有效游戏笔画':'游戏绘图待实测';
  const id=esc(p.id),hasCurrent=options.some(m=>m.id===p.model);
  const efforts=effortChoices(selected),effort=chosenEffort(p);
  const sources=['openrouter','codex','qwen'].filter(s=>s===source||catalog?.models?.some(m=>m.source===s&&(p.characterId==='none'||m.family===p.characterId)&&m.vision&&m.gameDrawing));
  host.innerHTML=`<input type="hidden" data-field="keySource" value="${esc(p.keySource||'')}"><label>接入平台<select data-route-choice aria-label="${esc(p.name)}接入平台">${!source?'<option value="" selected>当前自定义接口</option>':''}${sources.map(s=>`<option value="${s}" ${s===source?'selected':''}>${{codex:'本机 Codex',qwen:'千问平台',openrouter:'OpenRouter'}[s]}</option>`).join('')}</select></label><label class="model-select-label">选择型号<select data-model-choice aria-label="${esc(p.name)}型号"><option value="" ${!p.model?'selected':''} disabled>请选择型号</option>${!hasCurrent&&p.model?`<option value="${esc(p.model)}" selected>${esc(p.model)}（当前型号）</option>`:''}${options.map(m=>`<option value="${esc(m.id)}" ${m.id===p.model?'selected':''}>${esc(m.name)}${!m.vision?' · 仅文字':''}</option>`).join('')}</select></label>
    <div class="model-badges"><span class="${checked?.vision.ok?'passed':selected&&!selected.vision?'unsupported':''}">${vision}</span><span class="${checked?.drawing.ok?'passed':''}">${drawing}</span></div>
    <p class="model-id">${esc(p.model||'尚未选择型号')}</p>
    <p class="model-price">${source==='codex'?'使用本机 Codex 登录 · 不扣 OpenRouter 余额':source==='qwen'?`千问平台按量计费（人民币） · <a href="${esc(selected?.reference||'https://www.qianwenai.com/models')}" target="_blank" rel="noopener">查看官方能力与价格 ↗</a>`:selected?`每百万文字 token：输入 ${dollars(selected.inputPrice)} / 输出 ${dollars(selected.outputPrice)}（美元；图片另按平台计费）`:'未取得该型号价格'}${selected?.imageGeneration?' · 原生生图型号不适合当前笔画协议':''}</p>
    ${['openrouter','qwen'].includes(source)?`<label class="check model-filter"><input type="checkbox" data-show-text ${showText?'checked':''}> 也显示仅文字型号（不能看图猜题）</label>`:''}
    <input type="hidden" data-field="replyMode" value="${p.replyMode==='thinking'?'thinking':'fast'}">
    <div class="provider-grid model-controls"><label>思考强度<select data-field="reasoningEffort" aria-label="${esc(p.name)}思考强度">${!efforts.includes(effort)?`<option value="${esc(effort)}" selected>${esc(EFFORT_LABELS[effort]||effort)} · 请核对型号支持</option>`:''}${efforts.map(value=>`<option value="${value}" ${effort===value?'selected':''}>${EFFORT_LABELS[value]}</option>`).join('')}</select></label><label>最长等待<select data-field="timeoutSeconds" aria-label="${esc(p.name)}最长等待">${WAIT_SECONDS.map(n=>`<option value="${n}" ${waitSeconds(p)===n?'selected':''}>${n} 秒</option>`).join('')}</select></label></div>
    <p class="model-notice">${esc(reasoningSummary(p,selected))} 等待上限从请求发出后开始计时。</p>
    ${source==='qwen'?`<p class="model-notice">千问平台型号 · 官方资料核对于 2026-10-09。列表不代表账户权限，第三方直供型号可能需先在千问平台开通。</p>`:''}
    <details class="model-manual" ${manualOpen||!source?'open':''}><summary>手动填写型号 ID</summary><label for="model-${id}" class="sr-only">模型 ID</label><input id="model-${id}" data-field="model" value="${esc(p.model)}" placeholder="厂商提供的完整模型 ID" autocomplete="off"></details>
    ${connectionIssue(p)?`<p class="model-notice" role="alert">${esc(connectionIssue(p))}</p>`:''}
    ${!options.length?`<p class="model-notice">${catalog?'此接入方式暂无可选目录，可保留或手动填写型号。':'正在读取型号目录；当前配置可以保留。'}</p>`:''}
    ${checked?`<details class="model-evidence"><summary>查看实测结果与型号回执</summary><p>测试于 ${esc(new Date(checked.checkedAt).toLocaleString('zh-CN'))}。一次通过说明这次可用，不代表每次都能猜对。</p><p class="check-result"><b>${checked.vision.ok?'✓':'未通过'} 看图猜词</b> · ${esc(checked.vision.message)}${Number.isFinite(checked.vision.elapsed)?` · ${(checked.vision.elapsed/1000).toFixed(1)} 秒`: ''}</p><div class="model-receipt">${receiptText(checked.vision.receipt)}</div><p class="check-result"><b>${checked.drawing.ok?'✓':'未通过'} 游戏绘图</b> · ${esc(checked.drawing.message)}${Number.isFinite(checked.drawing.elapsed)?` · ${(checked.drawing.elapsed/1000).toFixed(1)} 秒`: ''}</p><div class="model-receipt">${receiptText(checked.drawing.receipt)}</div>${checked.drawing.ok?'<p>实测画作：自行车（画得好不好仍需看图判断）</p><canvas class="model-test-drawing" width="1000" height="650" aria-label="模型实际生成的自行车简笔画"></canvas>':''}<p>${source==='openrouter'?`本次两项测试共约 $${Number(checked.costUSD||0).toFixed(5)}`:source==='codex'?'通过 Codex 本机登录测试':'通过所填 API 接口测试 · 费用以该平台账单为准'} · ${(checked.elapsed/1000).toFixed(1)} 秒</p></details>`:''}`;
  const canvas=host.querySelector('canvas');if(canvas)paint(canvas,checked.drawing.shapes);
}
