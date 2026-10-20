'use strict';
// Compact status shared by the overlay and board. All content is plain text.
window.renderAdvice=(state,detailed=false)=>{
  const a=state.advice||{status:'idle',message:'等待盤面'},box=document.getElementById('advice');
  box.dataset.status=a.status;
  document.getElementById('advice-title').textContent=a.status==='ready'?(a.provisional?'暫定建議走法（資料待確認）':'建議走法'):'建議走法';
  document.getElementById('advice-move').textContent=a.message;
  document.getElementById('advice-note').textContent=a.status==='ready'?
    (a.provisional?`${a.pending} 個項目待確認；修正後會重新計算。`:
      '依目前盤面計算，請對照遊戲後操作。')+(detailed?` 原版${a.method==='simulation'?'模擬評估':'策略'}，每選項 ${a.rounds} 輪；耗時 ${Math.round(a.elapsedMs)} 毫秒。`:''):'';
  if(detailed){
    document.getElementById('advice-estimate').textContent=a.expected==null?'':`依目前資料模擬：本局結束時預期捕獲 ${a.expected.toFixed(2)} 隻彩色囚犯（估計值）。`;
    const list=document.getElementById('advice-options');list.replaceChildren();
    for(const o of a.alternatives||[]){const li=document.createElement('li');li.textContent=o.label+(o.mean==null?'':`：預期彩色 ${o.mean.toFixed(2)}`);list.append(li);}
    document.getElementById('recommend').disabled=state.analysis.status==='busy'||a.status==='busy'||!state.analysis.hasBoard;
  }
};
