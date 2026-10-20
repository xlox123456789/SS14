# CoffeeBns 原始碼來源與使用範圍

- Original Project: Tartarus Simulator
- Author: CoffeeBns / blahdot3h
- Repository: https://github.com/blahdot3h/tartarus-simulator
- Twitch: https://www.twitch.tv/coffeebns
- YouTube: https://www.youtube.com/@CoffeeBns
- 取得日期：2026-10-19；上游提交 `12b85db88cc8a3ba9c63a7d52be7b9ddb0c888fd`，資產標記 `20261018p`。
- 使用者表示已取得原作者同意製作簡化繁體中文版；本機整合依此進行。沒有另外取得或附加更廣泛的再授權條款。

此提交未找到 LICENSE 或 NOTICE 檔案；上游桌面版 package.json 的 license 為 UNLICENSED。原文保留於 UPSTREAM_DESKTOP_PACKAGE.json。這不等於 MIT、Apache 或其他一般開源授權，不應自行加上這些授權。原始檔註解、UPSTREAM_README.md、tools/README.md 及資料建置程式中的圖像／玩家報告來源註記均保留。原版 README 中的第三方遊戲資料來源亦保留。

## 未修改的來源

`manifest.json` 記錄每個來源檔的上游路徑與 SHA-256（將 CRLF 正規化為 LF 後計算）。`js/scan.js`、`scan-data.js`、`scan-worker.js`、`pick-data.js` 是實際執行的辨識核心與資料。原版 scan worker 的 importScripts/postMessage 由桌面背景執行緒橋接，演算法與資料不變。

`js/engine.js` 供原版 model/buildState、食物鏈與 Check 一致性檢查使用；0.5.0 起也供原版 Solver 計算建議，不載入完整模擬器頁面。`js/board.js` 提供原版 6×4 環形座標、動物肖像及刑具 SVG。主介面的字樣與操作由本機程式提供。

`js/analyze.js`、`js/capture.js`、`js/follow.js`、`js/auto.js` 及 `desktop/main.js` 是保留供研究／擷取函式／同步更新的原始來源，不直接載入整個上游頁面。原版網站的資料收集、回報、OCR 網路下載、自動更新及 BroadcastChannel 頁面協作均未載入。

## 可重建的衍生檔

- `model-core.cjs`：由 `scripts/extract-upstream-model.cjs` 擷取原版 blankModel、normalize、buildState、scanToModel、chainToModel 及其輔助函式，函式本體保持原樣。僅補 CommonJS 匯出與依賴；策略回呼固定為未啟用，不依建議推測玩家選了哪件刑具。
- `auto-core.cjs`：由 `scripts/extract-upstream-auto.cjs` 擷取原版 follower、onLine、fire、parseRules、setRules、setWatch、setPace 與最新 DEFAULT_RULES / DEFAULT_WATCH / RANK。唯一呼叫調整為 `grab(b.kind,b.hits)`，讓桌面擷取接收原版已判定的事件類型與 day-0 證據；不改匹配、合併、取消及等待規則。
- `find-log.cjs`：擷取上游 desktop/main.js 的登錄檔查詢、Steam library/manifest、預設啟動器路徑、VirtualStore 與最新 Log 搜尋。省略需 koffi 的原生程序視窗查詢，以現有使用者選窗與手動 Log 選擇補足，未新增原生套件。

本機 `src/analyzer/pick-model.js` 是 `analyze.js usePick` 中純資料轉換的小型桌面改編，保留新局／中途獎勵的差別；省略網頁、OCR、Solver 副作用。新局證據及重選延續規則依 follow.js / auto.js，未自行創造 Log 事件。

## 測試資料

原版 `tools/scan-test.js`、`scan-build.js`、`scan-truth.json`、`png.js` 保留未修改。公開 Repo 刻意忽略 `trainingdata/`，因此無法只用此 checkout 重現原作者準確率。現有編譯參考資料可以直接辨識，不需要重新訓練或建置。

本機測試中的公開盤面來自上游 `beta/data/raw/2026-10-16.jsonl` 的 id 1030，只保留盤面及來源資訊，作相容性／修正測試，並非辨識成功證據。Log 回播行使用原版規則中的實際名稱建構，並非真實遊戲錄製資料。

## 同步方式

取得新的上游提交後，逐一核對來源差異與授權，再更新必要原始檔、版本與 manifest，執行兩個 extract 腳本及所有測試。不要直接將上游網站整頁覆蓋本機介面。`node scripts/verify-upstream.cjs` 驗證原始檔雜湊及衍生檔可重建性。

## 0.4.1 修復補充

上游最新 main 再次取得後仍為同一提交，scan.js、scan-worker.js 與編譯資料均未改動。背景執行緒改為持續重用，保留原版 cache；每次處理完成會釋放影像參照。auto-core 僅額外匯出原有 setRules，讓本機層追加實機已確認的 Page@ 規則。新規則位於 src/auto/log-rules.js，對應的真實摘錄位於 tests/fixtures/real-stage-events.log，並非虛構 TLLua 事件；原版解析器、去抖與等待演算法保持不變。

## 0.5.0 建議走法整合

2026-10-20 再次 fetch 上游 main，仍是同一提交。新增未修改的 js/solver.js、solver-worker.js、tool-combos.js，均記錄於 manifest。Node Worker 的 vm 橋接 importScripts、postMessage 與計時器，直接執行原版 solver-worker，不翻譯或重寫策略演算法。recommend-core.cjs 由 scripts/extract-upstream-strategy.cjs 原樣擷取 analyze.js 的 bestMove；使用同版 LIVE_MIN=150、SWITCH_MIN=0.05、CHECK_MS=700。保留原版樣本不足時採用策略、近似同分不切換的選擇方式。沒有使用原版多核心 worker 池，以單一持續背景 Worker 控制本機負擔。

自行新增：繁中動作標籤、資料待確認提示、缺少關鍵資料時阻擋建議、版本與事件序號驗證、逾時取消、盤面／浮層顯示及測試。原版 recommendation 對吞噬選擇視窗的「取消後結束今日」提示以同樣條件在橋接層處理。建議不會回寫遊戲，辨識也不會依建議猜測使用者選擇。

## 0.5.2 執行環境優化

js/scan-worker.js 與 js/solver-worker.js 仍原樣執行，但 src/shared/upstream-worker.cjs 改用原版支援的 CommonJS 模組，僅提供 self / importScripts 包裝，不再置於獨立 vm context。原始碼與模板雜湊不變，原版演算法、門檻、快取及策略評估規則沒有變更。此調整只改背景執行環境。

The upstream README display title is translated into English for this distribution. Attribution, author names and links are preserved. The manifest records both the upstream and distribution hashes.
