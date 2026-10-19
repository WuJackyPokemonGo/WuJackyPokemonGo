# 開發進度 2026-10-19

範圍：`test/full-build-v1`；未合併 main、未部署正式網站，未執行任何雲端 SQL。

## 已修正

- 修復商品 CSV 匯入將換行及數字正則過度跳脫的錯誤。原本正常 CSV 可能被判定沒有資料列或數字無效，但文字比對測試仍然通過。
- CSV 支援 LF、CRLF、CR、BOM、引號內逗號與多行文字、雙引號跳脫；拒絕錯位或未配對引號、重複標題、欄數不一致及超出安全整數的值。
- 保留既有商品庫存，整批驗證完成才套用；新商品初始庫存仍寫入本機異動紀錄。
- 詢價複製在 Clipboard API 缺少或拒絕、舊複製 API 失敗時保留可長按選取的完整文字，並提供全選按鈕。修改清單或備註會清除過期的手動複製文字。
- CI 增加行為測試，直接執行頁面中的匯入及複製事件處理器，而非只比對原始碼文字。

## 驗證

`node --test tests/*.test.mjs`：48 項通過（24 項既有靜態檢查 + 24 項新增行為測試）。

行為測試使用 Node VM 與替代 DOM，涵蓋正常匯入、更新保留庫存、錯誤整批拒絕、取消、各類 Clipboard 失敗。不代表已在 iPhone Safari、真實剪貼簿或 PostgreSQL 實測。此次未修改分析 Edge Function，未重新執行 Deno。

## 已找回的交接位置

依前次對話紀錄，Supabase 測試專案 `wu-jacky-pokemon-staging` 已建立；當時顯示 Healthy、NANO、No migrations/No backups。最後停在手機 SQL Editor 無法貼上。這是歷史狀態，本次未登入 Supabase 重新查證。

下一個需要使用者參與的步驟是確認目前 Supabase 畫面及測試專案位置，再完成唯讀環境檢查；不可假設 migration 已執行，也不可使用原先暫停的正式專案代替。
