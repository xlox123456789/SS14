'use strict';
const labels = {
  beast: { mammoth: '猛獁', lion: '獅子', wolf: '狼', rat: '老鼠' },
  tier: ['普通', '魔法', '稀有', '傳奇', '至臻', '彩色'],
  kind: { office:'典獄長辦公室', sealed:'未開啟', empty:'空格', inmate:'囚犯', scouted:'已探查', revealed:'品質已揭示', scratch:'抓痕門', nest:'老鼠窩' },
  event: { '':'無事件', unknown:'事件種類待確認', chain:'連鎖反應', execution:'處刑', trickster:'閉門之後', appetite:'飢腸轆轆', convict:'高危囚犯', crow:'烏鴉低語', freedom:'自由滋味', usurp1:'篡位一', usurp2:'篡位二', usurp3:'篡位三', usurp4:'篡位四', ratway:'下水道鼠徑', hunt:'尋寶', portion:'額外配給' },
  tool: { revenge:'復仇者之棺', muzzle:'狂獸痛苦口枷', saw:'鏽蝕鋸', keys:'遺失的鑰匙串', rope:'絞刑繩', fire:'灼熱烙鐵', ironbox:'蠕動鐵箱', skewer:'鼠首串', hook:'分揀鉤', pestle:'鐵杵', scales:'典獄長天秤', tongs:'猛獁慾望鐵鉗', guillotine:'頭狼獠牙斷頭臺', axe:'獄卒處刑斧', shackles:'長鏈鐐銬', collar:'瘋獸倒刺項圈', forged:'偽造鑰匙', dogtag:'重犯狗牌', cage:'擁擠獸籠', blacklist:'劊子手黑名單', shortchain:'短鏈鐐銬', maiden:'斷裂鐵處女', whip:'倒刺鞭', ravenous:'兇獸貪食鎖鏈', scapegoat:'替罪羊斷頭臺', stake:'燃燒刑柱', coin:'血親命運硬幣', crown:'獄王鐵冠', maul:'猛獁象足重錘', claws:'頭狼污穢利爪', trap:'狂獅染血陷阱' },
  objective: { other:'其他／未確認', king:'困獸之王', walk:'監獄漫步', consume:'適者生存', incident:'暗流湧動', doors:'牢門之後' },
  startEvent: { none:'無', cagefight:'困獸之鬥', ironlaw:'鐵律', tyranny:'暴政', opulence:'奢華' },
  step: { patrol:'選擇移動位置', manage:'管理牢房', office:'辦公室', chain:'連鎖吞噬', event:'特殊事件', ratway:'鼠徑選擇', choice:'獎勵選擇' },
  check: { warden:'典獄長位置', dest:'可移動位置', tools:'刑具', day:'日期', vault:'彩色囚犯數', objective:'目標', choice:'刑具選擇卡' },
};
if(typeof module==='object'&&module.exports)module.exports=labels;
else window.labels=labels;
