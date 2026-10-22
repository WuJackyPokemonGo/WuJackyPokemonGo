# 開發進度 2026-10-22

## 本輪完成（僅 staging）

- 保留現有擁有人 Auth／管理員設定，以及現存的 1 筆商品；沒有匯入示範商品。
- 商品可同時儲存分類關聯、英文名、別名、圖鑑編號、公開說明／售價、上架與供貨狀態、首次入庫日期、排序及低庫存門檻。商品與標籤在單一資料庫交易完成，並記錄稽核。編輯使用伺服器 updated_at 拒絕過期版本。
- 分類新增、商品搜尋、上架狀態篩選、每頁 30 筆。資料 API 分頁讀取，不再截斷於 200 筆；本輪上限 20,000 筆，超限報錯而非悄悄遺失資料。
- 私有 product-images bucket，僅管理員可讀取／上傳，拒絕匿名與一般登入者。原圖不覆寫／不刪除；瀏覽器檢查 10 MB 上限、檔案標頭與實際解碼，另外產生 900px 內的 WebP 縮圖，原始檔保持原 bytes。
- 圖片說明、順序、是否用於賣場可編輯；新圖片預設未核准。媒體原圖／縮圖以 5 分鐘 signed URL 讀取，資料夾不是公開 bucket。
- 賣場預覽僅顯示 published 商品和核准圖片，支援搜尋、分類、詢價數量及複製。使用 security_invoker 的 catalog_preview 白名單投影，不包含成本／精確庫存／來源／客戶或訂單。仍需管理員身份，尚未開啟匿名正式目錄。
- 庫存異動最近 50 筆查閱。既有庫存調整／重送流程保留。
- 匯出版本化商品 JSON，含分類與圖片索引；不含圖片二進位檔、庫存帳、訂單。這不是完整備份，尚無還原／匯入功能。

## SQL 狀態

`supabase/staging/catalog-management.sql` 已透過 execute_sql 在 staging 套用。首次 apply_migration 因 Invalid or expired requestState 失敗；唯讀確認未套用後才改用 execute_sql，並確認 view 與 RPC 存在。此 extension 沒有新增 schema_migrations 紀錄；不要重跑初始建置或本 extension。既有三筆 migration 不變。

## 驗證

- Node 測試 74 項通過，含 payload、200 筆以上分頁、公開 DTO 白名單、台灣月份邊界、圖片標頭與上傳結果不明時保留原檔等測試。
- 新的真實 PostgreSQL rollback 驗收：匿名拒絕、一般帳號拒絕、管理員商品／分類原子儲存、舊版本拒絕、無效分類回滾、圖片核准過濾、草稿不可預覽及稽核通過。
- 既有庫存／採購到貨／完成訂單／退回與重送的 PostgreSQL rollback 驗收再次通過。修正原腳本假設整個 audit_logs 只有 4 筆的錯誤，改成僅計算本次驗收操作者。
- 驗收結束後仍為原本 1 筆商品、0 分類、0 圖片、0 Storage 物件，測試資料未留下。
- 瀏覽器已確認登入頁載入與版面；沒有使用擁有人密碼，未宣稱真實管理員登入／iPhone／實際檔案上傳驗收完成。
- Security advisors 沒有資料表、view、RPC 或 Storage findings；有既存的 Auth leaked-password-protection-disabled 警告。未變更付費方案或 Auth 設定。

## 下次接續

1. 擁有人在私人測試頁，用原有測試帳號驗收：登入、編輯既有商品、分類、上傳圖片並核准、預覽、庫存紀錄與登出。
2. 完成採購與訂單輸入 UI（目前只有已驗收的庫存生命週期 RPC，不能誤稱完整後台完成）。
3. 雲端 CSV 差異預覽／原子匯入、完整備份與還原、更多真實裝置及並行測試。
4. 完成商品資料與媒體公開方式後，另行做匿名目錄與正式 GitHub Pages 串接。本輪不合併 main、不變更正式站或暫停中的正式資料庫。

## 已保存與部署

- GitHub 功能提交：`fa022f35efd0a53fb8434b77cedf6fee5b79adfd`，分支 `test/full-build-v1`。
- 私人 Sites 建置來源提交：`81429b4f656dc5bb8b09348dbaf24b3ffbac292f`。
- 部署 `appgdep_6ad9a19bd4408191b8929e1200c5ed2c` 回傳 succeeded；網址：https://wu-jacky-admin-staging.gentleray7.chatgpt.site 。擁有人限定存取維持不變。
- 真實匿名 Data API 驗證：products、inventory_balances、catalog_preview 皆拒絕（42501）；匿名 Storage signed URL 請求亦遭拒絕。
