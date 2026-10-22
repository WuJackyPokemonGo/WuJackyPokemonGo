# 2026-10-22 完整開發版接續紀錄

主站及後台沿用 GitHub Pages main。最新功能、驗收與擁有人剩餘操作以 README.md 為準，較早 DATA-TOOLS 紀錄保留為歷史。

已正式套用財務、報表、分析、備份、排程與安全補回 SQL。Supabase 專案 wlrwlqchlxehlvkyesnj 名稱含 staging，但已用於正式環境，不可清空。apply_migration 兩次 requestState 失效；execute_sql 單一交易成功，無新增 migration history。

store-maintenance Edge Function 版本 1 已 ACTIVE；自帶內部 token 驗證，僅 service_role 可執行對應 RPC，瀏覽器沒有 service key。cron wu-jacky-maintenance 每 15 分鐘執行；首份每日備份 completed，HTTP 200，通知 0。Discord 關閉，費率未編造。

88 項 Node 測試與正式 bundle build 通過；finance / data-io / public-storefront / security 四份 SQL 回滾驗收通過。390px 本機 UI fixture 已驗證收款、費用、費率與加權成本。真實 iOS 登入與檔案驗收不冒稱完成。

不要再將部分收款、多次退款、加權成本、財務報表、Excel、分析、自動含圖備份或排程列為未開發。仍需擁有人填實際商品／費率、選擇是否提供 Discord 網址，並驗收自己的手機。這些不應由工程測試資料代填。

部署後應確認 GitHub Store checks 與 Pages 都針對本次 commit 成功，正式 HTML 的 script query 為 20261022-complete，並比對 bundle SHA-256。

## 後續手機驗收補正

擁有人指出庫存數字／橘底低庫存提示遺漏，已補正商品卡、詳情與管理預覽；93 項程式測試及真實資料庫公開庫存／門檻／售罄／私密欄位回滾驗收通過。顧客明確顯示經確認庫存，基礎 ledger 仍私密。排序不變，預設門檻沿用資料庫 3，個別商品可改；未知數量不編造。以最新 20261022-stock HTML 與 GitHub commit 為準。

## 圖片相容性修正

手機 WebP 編碼失敗已以 PNG 備援處理，串接至儲存、發布與前台顯示；原圖不變。100 項測試與 PNG 權限回滾驗收通過，原圖 bucket 仍私密。最新版本 20261022-image-fix；需擁有人重新選同一張圖片驗收 iPhone 實機。
