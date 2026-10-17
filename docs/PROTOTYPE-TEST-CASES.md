# 本機原型測試與測試報告格式

## 自動檢查
開啟 `tools/prototype-check.html` 可檢查前台 HTML 的幾項基本結構與關鍵文字。它是輕量的字串檢查器，不會實際模擬瀏覽器版面，也不能證明程式安全或功能無錯。

## 管理後台 CSV 手動測試
1. 匯出 CSV，確認 UTF-8 與表頭存在。
2. 匯入只有表頭的 CSV，應顯示錯誤而非靜默成功。
3. 匯入缺少商品名稱的資料列，應中止並指出列號。
4. 匯入負數、非整數庫存／價格／門檻，應拒絕。
5. 在 CSV 中重複商品 ID，應拒絕整批。
6. 以既有 ID 匯入不同庫存數字，必須保留既有庫存，不得不經庫存異動流程直接覆蓋。
7. 以新 ID 匯入正庫存商品，應建立初始庫存異動紀錄。
8. 匯入後確認商品名稱、別名、標籤、售價、說明及搜尋結果。
9. 在手機瀏覽器測試新增、編輯、標籤改名／刪除、庫存加減與負數拒絕。
10. 重新整理頁面，確認目前原型的本機資料持久化；明確提醒此資料不會自動同步到其他裝置。

## 測試限制
- 尚未執行真實裝置瀏覽器測試。
- 尚未配置自動化瀏覽器測試環境。
- 尚未連接 Supabase 或任何正式資料庫。
- 不可把所有檢查通過當成可上線證明。

## 資料庫草稿 staging 驗收（目前不可直接在正式環境執行）

只有在建立獨立 staging 專案、確認可還原且由熟悉 PostgreSQL/Supabase 的人審查 SQL 後才可執行。

1. 匿名角色不能讀取 products、inventory_balances、inventory_movements、orders、order_items、purchase_batches、expenses、audit_logs、admin_profiles。
2. 一般 authenticated 使用者即使在 JWT metadata 中自行加上 `is_admin=true`，仍不能通過 `is_store_admin()`。
3. 非管理員呼叫 `admin_adjust_inventory` 必須被拒絕，且餘額、異動與稽核表都不變。
4. 管理員以有效理由增加庫存，應在同一交易中更新餘額並新增一筆 movement 與 audit log。
5. 管理員減少庫存超過現有數量，應整筆失敗並回滾，不能留下半筆 movement/audit。
6. 空白理由、少於 3 個非空白字元、delta=0、不存在商品及已封存商品均應拒絕。
7. 兩個管理員同時調整同一商品時，餘額與異動總和必須一致；不得負庫存或漏記 movement。
8. 確認管理員無法直接更新 inventory_balances 或直接插入／刪除 inventory_movements，所有正式異動必須經過已審查的交易函式。
9. 確認 audit_logs 不可由一般客戶端修改或刪除，並測試資料庫管理角色的例外權限。
10. 驗證 staging 備份、完整還原、RLS/view 實際語義與公開 API 欄位白名單，再考慮正式串接。
