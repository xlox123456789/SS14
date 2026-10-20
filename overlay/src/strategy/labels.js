'use strict';
const L=require('../board/labels');
const cell=n=>`第 ${String(n+1).padStart(2,'0')} 格`;
function describe(a,model,cancelConsume=false){
  const target=n=>{const c=model.cells[n];return `${cell(n)}${c&&c.beast?`（${L.beast[c.beast]}・${L.tier[c.tier]}）`:''}`;};
  switch(a.type){
    case 'patrol':return `移動至${target(a.cell)}`;
    case 'devour':return `吞噬${target(a.to)}`;
    case 'chain':return `繼續吞噬${target(a.to)}`;
    case 'hunt':return `標記${target(a.to)}為獵物`;
    case 'swap':return '替換目前牢房的囚犯';
    case 'end':return cancelConsume?'取消吞噬選擇，再結束今日':'結束今日';
    case 'stopchain':return '取消連鎖吞噬，保留囚犯';
    case 'office':return a.choice==='bestow'?'辦公室：賜福（提升囚犯品質）':'辦公室：煽動（增加事件牢門）';
    case 'event':return a.accept?'接受目前事件':'放棄目前事件';
    case 'reroll':return '重選目前的獎勵選項';
    case 'choose':return `選擇「${L.tool[a.id]||({ring:'三頭拇指環',horn:'紛爭銅角',wine:'緋紅陳釀',brand:'原罪烙印'}[a.id])||'獎勵'}」`;
    default:return '目前沒有可顯示的建議走法';
  }
}
module.exports={describe};
