# SS14

繁體中文 Windows 桌面小浮層，提供畫面分析、盤面修正與操作建議。

## 下載與執行

到 [Releases](https://github.com/xlox123456789/SS14/releases/latest) 下載 Windows x64 版本：

- **SS14-0.5.3-portable.exe**：直接雙擊執行，不需要安裝 Node.js、Python 或其他開發環境。
- **SS14-0.5.3-win-x64.zip**：解壓縮後執行資料夾中的 **SS14.exe**。請保留整個資料夾。

支援 Windows 10／11 64 位元。首次啟動請按「⚙ 設定」，選擇目標視窗與 Log 路徑，再啟用自動分析。目標程式請使用視窗或無邊框模式。

## 操作

- F9：手動截圖分析。
- Ctrl＋Alt＋O：顯示／隱藏浮層。
- 查看盤面：檢查辨識結果，點擊格子修正。
- 設定：調整透明度、置頂、快捷鍵、分析模式與診斷。

自動模式優先使用 Log 事件，另以每 0.1 秒的決策區檢查補足缺少事件的情況。只有穩定變更才執行完整辨識；0.1 秒是檢查頻率，不是完整分析耗時。待確認資料會明確標示，操作建議不會自動控制目標程式。

設定與最近盤面儲存於 %APPDATA%\SS14，不會上傳截圖、Log 或個人設定。程式退出請使用系統匣選單的「結束程式」。

## 原始碼開發

需要 Node.js 與 pnpm。首次執行：

```powershell
cd overlay
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm start
```

測試：在專案根目錄執行 node --test tests/*.test.cjs。部分桌面／真實截圖測試需額外測試環境，不包含私人截圖與 Log。

## 來源與聲明

原版核心由 CoffeeBns 製作，本工具提供簡化繁體中文介面及桌面整合。作者、來源、版本與第三方聲明請見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

重建 Windows 執行包：回到根目錄執行 pnpm install --frozen-lockfile，再執行 pnpm run build:win。
