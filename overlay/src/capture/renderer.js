'use strict';
window.captureFrame = async function () {
  let stream, timeout, frameCallback;
  const video = document.getElementById('source');
  try {
    if(probeVideo?.readyState>=2&&probeStream?.active){
      let callback,timer;
      try{await Promise.race([new Promise(resolve=>{callback=probeVideo.requestVideoFrameCallback(resolve);}),new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}
      finally{clearTimeout(timer);if(callback)probeVideo?.cancelVideoFrameCallback(callback);}
      if(!probeVideo||!probeStream?.active)return {ok:false,error:'遊戲畫面分享已中斷，請重新截圖。'};
      const canvas=document.createElement('canvas');canvas.width=probeVideo.videoWidth;canvas.height=probeVideo.videoHeight;
      canvas.getContext('2d').drawImage(probeVideo,0,0);return {ok:true,dataUrl:canvas.toDataURL('image/png')};
    }
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
    const firstFrame = new Promise(resolve => { frameCallback = video.requestVideoFrameCallback(resolve); });
    video.srcObject = stream;
    await video.play();
    await Promise.race([
      firstFrame,
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('frame-timeout')), 7000); }),
    ]);
    if (!video.videoWidth || !video.videoHeight) return { ok: false, error: '尚未收到遊戲畫面，請重試。' };
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return { ok: true, dataUrl: canvas.toDataURL('image/png') };
  } catch (error) {
    return { ok: false, error: error.message === 'frame-timeout'
      ? '等待遊戲畫面逾時。請確認遊戲未最小化。'
      : 'Windows 無法提供此視窗畫面。請取消遊戲最小化，並使用視窗或無邊框模式；必要時確認遊戲與浮層的執行權限相同。' };
  } finally {
    clearTimeout(timeout); if (frameCallback) video.cancelVideoFrameCallback(frameCallback);
    stream?.getTracks().forEach(track => track.stop());
    video.pause(); video.srcObject = null;
  }
};
let probeVideo=null,probeStream=null,probeGeneration=0;
window.stopDecisionProbe=()=>{++probeGeneration;probeStream?.getTracks().forEach(t=>t.stop());probeVideo?.pause();if(probeVideo)probeVideo.srcObject=null;probeStream=null;probeVideo=null;};
window.startDecisionProbe=async()=>{
  window.stopDecisionProbe();const generation=probeGeneration;
  let stream,timer;
  try{
    stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:10,max:10}},audio:false});
    if(generation!==probeGeneration){stream.getTracks().forEach(t=>t.stop());return {ok:false,error:'決策區檢查已停止。'};}
    const video=document.createElement('video');video.muted=true;
    const ready=new Promise(resolve=>video.requestVideoFrameCallback(resolve));video.srcObject=stream;
    probeStream=stream;probeVideo=video;await video.play();
    await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('等待遊戲畫面逾時。')),7000);})]);
    return {ok:true};
  }catch(error){stream?.getTracks().forEach(t=>t.stop());if(generation===probeGeneration)window.stopDecisionProbe();return {ok:false,error:error.message};}
  finally{clearTimeout(timer);}
};
window.decisionProbe=()=>{
  if(!probeStream?.active||probeVideo?.readyState<2)return null;
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=16;
  const g=canvas.getContext('2d',{willReadFrequently:true}),w=probeVideo.videoWidth,h=probeVideo.videoHeight;
  // The same relative region contains patrol cards and Eat/Replace/End cards.
  g.drawImage(probeVideo,w*.27,h*.61,w*.46,h*.29,0,0,32,16);
  const pixels=g.getImageData(0,0,32,16).data,result=[];
  for(let i=0;i<pixels.length;i+=4)result.push(Math.round((pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)/8)*8);
  return result;
};
