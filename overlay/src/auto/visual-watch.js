'use strict';
// A small, low-frequency decision-row check for clients that omit click Log events.
// This is a change trigger only. CoffeeBns remains the sole board recognizer.
const distance=(a,b)=>!a||!b||a.length!==b.length?Infinity:a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
class VisualWatch {
  constructor({capture,busy,onChange,onError,interval=100}){Object.assign(this,{capture,busy,onChange,onError,interval});this.epoch=0;this.running=false;}
  async start(target){
    const key=JSON.stringify(target);if(this.key===key&&this.timer)return;
    this.stop();const epoch=this.epoch;this.key=key;
    try{
      await this.capture.startProbe(target);
      if(epoch!==this.epoch){if(!this.key)this.capture.stopProbe();return;}
      this.timer=setInterval(()=>this.tick(),this.interval);this.timer.unref?.();
      await this.tick();
    }catch(error){if(epoch===this.epoch){this.stop();this.onError(error);}}
  }
  async tick(){
    if(!this.key||this.running||this.busy())return;
    this.running=true;const epoch=this.epoch;
    try{
      const sample=await this.capture.probe();if(epoch!==this.epoch)return;
      if(!Array.isArray(sample)||sample.length!==512)throw new Error('無法取得決策區畫面，請取消遊戲最小化後按 F9。');
      if(!this.anchor){this.anchor=sample;this.previous=sample;return;}
      const stable=distance(sample,this.previous)<4,changed=distance(sample,this.anchor)>9;
      this.previous=sample;
      if(stable&&changed){this.anchor=sample;this.onChange();}
    }catch(error){if(epoch===this.epoch){this.stop();this.onError(error);}}
    finally{this.running=false;}
  }
  stop(){++this.epoch;clearInterval(this.timer);this.timer=null;this.key=null;this.anchor=null;this.previous=null;this.capture.stopProbe();}
}
module.exports={VisualWatch,distance};
