# 永久商品 SKU：WJ-0001 流水號（2026-11-16）

## 決議與範圍
- 一件「可販售的商品」一個獨立永久 SKU；單隻與套組皆獨立配號。套組組成與 PTC 庫存關聯屬後續工作，不在本次擅自新增。
- 既有商品依 `created_at, id` 固定順序補號；包括草稿、已售罄、封存。**不以清單顯示順序或圖鑑編號重排**。
- 新增商品由資料庫自動領下一個號碼，格式 `WJ-0001` 起（超過 9999 時自然延長，不截斷）。
- SKU 在後台商品列表、搜尋、唯讀編輯欄與 CSV 匯出可見。前台商品卡、詳情、詢價與分享網址都不顯示。訂單明細預計於未來自助下單階段加入 SKU；本次未啟用自助下單。
- UUID 繼續作為商品/庫存/訂單/分享連結關聯鍵；此次僅補 SKU，不重新建立商品。
- 300 個 Excel 預排號碼**不是**已預先占用的商品編號，不可據此認定網站已有 300 件商品。

## 上正式環境前必須檢查
**專案命名與實際接線不同：**2026-11-16 已核對 main 的 `staging-config.mjs`、`cloud-admin.mjs`、`storefront-service.mjs`：正式 GitHub Pages 賣場與後台目前都連到 `wlrwlqchlxehlvkyesnj`（雖名稱為 `wu-jacky-pokemon-staging`）。該**正式網站實際連線的資料庫**唯讀盤點有 127 件商品，127 件 SKU 皆空白。另一個名為 `WuJackyPokemonGo` 的 `uhwhhdtwtzmuodvltijw` 專案目前 INACTIVE，並非 main 程式所用的資料來源。**正式資料庫已盤點且完成補號，網站程式尚待合併部署**。2026-11-16 在資料庫內的 private.app_saved_backups 建立完整備份後，正式執行 migration `sku_permanent_wj_auto_number_20261116`，127 件成功分配 WJ-0001～WJ-0127，0 漏編、0 重複。

正式執行前唯讀盤點 SQL：
```sql
select count(*) as total,
       count(*) filter (where sku is null) as missing,
       count(*) filter (where sku is not null) as filled,
       count(*) filter (where sku is not null and
         case when sku ~ '^WJ-[0-9]{4,15}$'
              then substring(sku from 4)::bigint < 1
              else true end) as legacy_or_invalid
from public.products;
select sku,id,name_zh from public.products where sku is not null order by sku;
```
若發現非 `WJ-####` 舊 SKU，migration **直接中止**，不能不經審核覆蓋。先保留原 UUID 與舊編號清單，決定映射策略再調整。

## 變更路徑
1. DB: `supabase/production/sku-auto-number.sql`：單一交易鎖定產品表，核對舊編號，建立不可回退 sequence，依固定順序補空號；新增觸發器禁止人工新填與覆寫，並避免舊編輯器空白值清除 SKU。
2. DB 驗收: `supabase/production/sku-auto-number-acceptance.sql`：在 `BEGIN/ROLLBACK` 測試唯一、補號、自動新增、禁止更改。
3. DB 備份還原：`supabase/production/sku-restore-compatibility.sql` 保留現行 `admin_io` 的 CSV 多筆空 SKU、預期商品 ID 重複檢查；修正舊備份還原空 SKU、還原較大 SKU 後序列前進。正式資料庫已套用。完整 UI 還原端到端仍待驗收。
4. 後台表單：新增顯示「系統自動產生」，既有 SKU 唯讀。
5. CSV：新增行留空 SKU；既有商品以 UUID 或既有 SKU 更新；企圖更改原 SKU 會在預覽階段拒絕；即使舊 CSV 把該欄留空，也保留原編號。
6. `admin.html` 與 `cloud-admin.html` 必須完全相同；更新產生的 `assets/cloud-admin.bundle.js`，CI 執行 `npm test`、`npm run build`、bundle diff。

## 注意事項
- 序列分配不保證無跳號：失敗交易/併發寫入可留下號碼空缺，但**不會再分配同一號**。
- 刪除商品不回收號碼；日後不允許直接調降序列。
- 舊版備份還原會設定 `wj.restoring` 旗標而略過一般 SKU 強制規則，目的是保留歷史還原相容性。已新增還原後補號與序列前進處理，交易回滾的 SQL 模擬通過；完整 UI 還原端到端流程尚待驗收。
- 此分支沒有設定任何帳密、沒有修改價格、庫存、商品 UUID 或正式資料。
- 正式套用前在現行正式資料庫以 `BEGIN ... ROLLBACK` 模擬驗收通過；備份後已正式執行 migration，127 筆商品均有唯一 SKU。正式 SQL 驗收通過且測試資料回滾。GitHub Actions 程式測試及 build 通過；待 GitHub PR 合併部署。
