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

## 後續實作：Supabase staging 已建置

僅在 `wu-jacky-pokemon-staging`（`wlrwlqchlxehlvkyesnj`）套用三筆 migration：

| 版本 | 名稱 | 可重現 SQL |
| --- | --- | --- |
| 20261019091155 | reviewed_staging_baseline | supabase/staging/reviewed-baseline.sql |
| 20261019091513 | staging_advisor_hardening | supabase/staging/advisor-hardening.sql |
| 20261019091654 | staging_admin_session_check | supabase/staging/admin-session-check.sql |

原始 `supabase/migrations/*draft.sql` 保留為歷史草稿；不可再執行於已套用 bundle 的環境。分析 migration、Edge Function、Discord 與排程均未部署。

### 已完成

- 13 張表全部啟用 RLS；一般帳號不能讀管理資料或自行取得管理員資格。
- 私有 schema 內的會員檢查與庫存交易，加上公開的 invoker RPC；無匿名執行權。
- 進貨、訂單狀態／明細、庫存與稽核紀錄均禁止 authenticated 直接寫入，避免繞過交易。後續需透過受控 RPC 建立完整流程。
- 同一 key 的所有庫存交易先取得 advisory transaction lock，並驗證操作類型，防止跨交易誤認重送；鎖定產品與庫存，核對前後快照與數量。
- `cloud-admin.html`：獨立雲端測試後台；登入、商品新增／編輯、供貨／上架狀態、庫存異動。資料庫權限是最終授權依據。
- 使用伺服器 updated_at 版本檢查商品編輯衝突；庫存斷線重送保留原 key，並在同分頁 sessionStorage 記錄待確認操作，重載／重新登入後可沿用。
- Supabase SDK 2.118.0、esbuild 0.25.12 鎖定版本與 lockfile，建置產生本機 bundle，沒有使用未固定版本的 CDN。

### 實測與限制

- 最新 `npm test` 62 項通過；`npm run build:admin` 成功。
- 真實 PostgreSQL staging 驗收腳本通過：匿名拒絕、非管理員 RLS／升權拒絕、管理員辨識、禁止直接繞過庫存／訂單交易、手動調整、到貨、完成扣庫存、實物退回、重送、錯誤整筆回滾與帳實相符。
- 透過 Supabase SDK／真實 Data API 匿名呼叫 products、inventory_balances、orders、public_catalog_draft，均回 401 / SQLSTATE 42501。
- 安全 advisors 無 findings。效能 advisors 僅有新索引尚未被使用的 INFO；目前空資料庫，不因這項提示刪掉用於外鍵及查詢的索引。參考：https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
- 最後確認 Auth 使用者、商品、movements、audit logs 均為 0；所有驗收假資料已回滾。
- 未部署網站；未改 main 或原先 INACTIVE 的正式 Supabase 專案。未做真實登入／iPhone 版面／真正多連線併發／強制稽核寫入失敗／備份還原測試。
- 後台目前最多載入 200 筆商品。標籤、圖片、CSV 與完整訂單／採購輸入尚未串接此雲端頁面。庫存標籤不因單次數量異動自動變更。
- 分頁關閉可能清除 sessionStorage，若上次結果仍不明，必須先核對異動紀錄再建立新異動。

下一個需要使用者操作的步驟：在測試專案 Authentication 建立自己掌握密碼的 Auth 使用者，核對身分後才授予管理員。不可索取密碼或把目前唯一出現的帳號直接當成擁有人。
