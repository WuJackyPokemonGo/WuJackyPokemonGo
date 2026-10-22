# 正式資料匯入／匯出契約（草案）

狀態：設計規格，尚未實作成正式雲端功能。現有 `admin.html` 只支援本機商品 CSV 原型，不能當作完整備份、訂單匯入或帳務系統。

## 通用檔案規則

- 編碼：UTF-8；匯出 CSV 建議附 BOM 以便試算表正確顯示繁體中文。
- 第一列必須是固定欄位名稱；不依賴欄位順序以外的猜測。
- 每份資料檔都應帶有 `schema_version`、匯出時間、時區與資料範圍；若使用獨立 manifest，必須把 manifest 與檔案一起保存。
- 匯入前先解析並顯示新增／更新／略過／錯誤數量及逐列原因；使用者確認後才寫入。
- 預設採「整批驗證後再寫入」；若任一必要列失敗，不可留下半套資料。大型檔案需分批時，必須有可追蹤的批次 ID 與補償策略。
- 使用穩定的 SKU 或資料庫 ID 關聯，禁止以商品名稱作唯一識別；重複 ID、無效關聯及未知 schema 版本都應拒絕。
- 價格與金額使用整數台幣或明確的小數精度，不可依試算表顯示格式猜測。日期使用 ISO 8601，明確帶時區；純日期欄位使用 YYYY-MM-DD。
- 任何含客戶聯絡方式、供應商、成本、利潤、費用、訂單或稽核內容的匯出，僅限管理員並提醒安全保存。禁止把秘密金鑰匯出。

## 商品檔：`products-v1.csv`

欄位建議：
`schema_version,sku,name_zh,name_en,aliases,pokedex_number,description_public,publication_status,supply_status,public_price_twd,price_is_inquiry,low_stock_threshold,manual_sort_order,hot_rank,first_stocked_at,coming_soon_at,tag_names,image_rights_note`

- `sku` 必須唯一且穩定；更新時以 SKU 對應，不能因改名而變成新商品。
- `aliases` 與 `tag_names` 使用經規格化的多值編碼（建議 JSON 字串），不可直接以逗號拆分，否則別名內含逗號會壞掉。
- 匯入商品資料預設不得改變現有庫存、庫存異動、採購、訂單或歷史成本。
- `image_rights_note` 僅記錄內部授權來源，不代表自動取得使用權；圖片檔另以 Storage 備份流程處理。
- 任何批次價格變更需預覽舊值／新值、影響筆數與確認操作；刪除商品應優先封存，不能破壞歷史訂單關聯。

## 庫存異動檔：`inventory-movements-v1.csv`

欄位建議：
`schema_version,movement_id,sku,movement_type,quantity_delta,reason,actor,created_at,related_order_number`

- 此檔是稽核匯出，不是一般商品匯入模板。
- 正式環境不允許以 CSV 直接覆寫庫存餘額或把歷史異動重新寫入正式 ledger。
- 若需從舊系統導入期初庫存，必須走獨立的一次性導入流程：凍結寫入、盤點確認、逐 SKU 預覽、生成 opening movement、保留來源檔與操作者紀錄，並防止同一批次重複套用。
- 匯入歷史異動前需另行設計幂等鍵與對帳規則；目前不支援直接匯入。

## 採購批次檔：`purchase-batches-v1.csv`

欄位建議：
`schema_version,batch_id,sku,purchased_at,quantity,unit_cost_twd,extra_cost_twd,supplier_name,source_url,notes_private`

- 成本、供應商與內部備註屬機密資料，只能由授權管理員匯出。
- 匯入採購批次不可自動增加庫存；必須由經審核的「到貨驗收」交易同步產生庫存異動。
- 已用於歷史銷售成本的採購批次，不可任意覆寫；更正應以補償紀錄或明確版本處理。

## 訂單與財務檔

訂單、訂單項目、收款／退款、平台費、其他費用與稽核紀錄應使用不同版本化檔案，並以穩定 ID 互相關聯。不能把多張表硬塞進單一 CSV，也不能只匯出訂單主表而遺漏商品快照、成本快照、庫存 movement、退款與稽核紀錄。

正式完整備份應優先採用資料庫原生備份／還原與 Storage 物件備份。CSV 是管理員可讀取的補充資料交換方式，不是可完整還原系統的唯一手段。

## 匯入前後安全檢查

1. 驗證 schema 版本、必要欄位、編碼、日期、數值精度與多值欄位格式。
2. 檢查 SKU／ID 重複、未知 SKU、無效標籤、無效狀態及關聯缺失。
3. 顯示完整預覽：新增、更新、略過、衝突、可能覆寫欄位及錯誤列。
4. 先產生可回復的備份／快照，再要求管理員確認。
5. 在單一交易或有明確補償策略的批次中套用；失敗時不得留下不完整關聯。
6. 匯入完成後重新讀取資料，核對筆數、金額總和、庫存 movement 與餘額對帳。
7. 記錄操作者、時間、來源檔 hash、schema 版本、批次 ID、結果與錯誤摘要；不把完整客戶資料寫進一般錯誤日誌。

## 尚未實作

- [ ] 版本化 manifest 與完整匯出包。
- [ ] 商品 CSV 預覽、衝突解析與整批回滾。
- [ ] 期初庫存專用導入流程與幂等保護。
- [ ] 採購、訂單、費用與稽核的安全匯出。
- [ ] 圖片 Storage 備份與關聯驗證。
- [ ] staging 往返測試及還原演練。
