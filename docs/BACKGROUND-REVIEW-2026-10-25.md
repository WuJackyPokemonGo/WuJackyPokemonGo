# 背景圖鑑續查 — 2026-10-25

## 第 1 項：已修正並部署

查核開始時，GitHub main（dbdcb83）與正式站 BG-0190 都仍包含拉帝亞斯及拉帝歐斯。已於 79d7540 刪除這兩筆舊金山適用寶可夢；其他活動中的相同寶可夢不受影響。正式站重新下載確認兩者皆不存在；GitHub Pages 與 Store checks 成功。台南／洛杉磯 BG-0122、BG-0123 的好啦魷先前已於 dbdcb83 移除，既有回歸測試通過。

刪除後 BG-0190 有 36 筆直接遭遇、3 筆進化繼承。此為現有資料筆數，不代表已完成舊金山完整適用名單驗證，也不把它當作 38／40／42 差異的定論。

## 第 2 項：本輪進度，尚未全面完成

- Serebii 重新下載：272 個名錄位置，圖片網址與前次對照完全相同，新增 0、移除 0。
- Dittobase 重新下載：253 個條目網址，新增 0、移除 0；HTML SHA-256 也與 10/24 驗收一致。
- PokéXperience 的直接下載回傳 HTTP 403；搜尋服務只能讀到載入中的頁面，無法據此宣稱已重新核對其全部 345 份素材。沿用前次收錄證據，不冒稱本輪全量重驗。
- 更新 BG-0211 洛杉磯 Night Out：當地 10/24 活動已過，改為已推出，補結束日期及一星皮卡丘／三星耿鬼保證背景的逐隻條件。官方未確認調查顫弦蠑螈的背景資格，不新增。
- 共 276 筆活動／圖樣紀錄：270 已推出、3 即將推出、3 待確認素材；新增活動紀錄 0。不是 276 種獨立已發放背景。

## 尚缺證據的 8 筆

| ID | 本輪查核結果與缺口 |
|---|---|
| BG-0072 | 釜山官方煙火節實體活動日期不能證明遊戲發放；仍缺遊戲活動、日期、適用寶可夢及方式。 |
| BG-0119 | 重讀官方 PokéPark 公告，僅明列三神鳥附背景；野外皮卡丘或一般田野調查不構成其背景證據。 |
| BG-0136 | 找到玩家親述 Blanche 配飾拉普拉斯附東京背景，支持存在；不能證明所有 Tokyo Complete 獎勵保證背景，維持條件待確認。 |
| BG-0141 | 任務名錄支持四區挑戰後 Copenhagen Complete 的小火馬獎勵；社群說明含活動前推測，不能當作保證城市背景的實測證據。 |
| BG-0190 | 閉幕團戰玩家現場回報有個別背景及互相矛盾的出現名單；未完成逐隻核對。Serebii 仍列飛機兄妹，不能將來源名單直接當作正確。 |
| BG-0238 | 再查官方 2025 公告，無法證實全球特殊調查個別獎勵保證背景；長崎調查的官方保證不能套用全球。 |
| BG-0276 | 未找到可將球場素材與遊戲活動、日期、寶可夢、發放相連的證據。 |
| BG-0277 | 未找到夜景素材的活動及發放證據，不以 costa_rica 檔名猜測地區。 |

日期待確認仍 3、取得條件待確認仍 8、待確認素材仍 3，清單重疊。complete 保持 false。

## 來源

- https://www.serebii.net/pokemongo/backgrounds.shtml
- https://www.dittobase.com/pokemon-go/backgrounds
- https://pokexperience.com/backgrounds/
- https://pokemongo.com/news/pokemon-night-out-irl-details2026
- https://pokemongo.com/news/ppk_launch
- https://pokemongo.com/en/news/know-before-you-go-gofest-2026-in-person-events
- https://pokemongo.com/news/global-events-gofest2026-overlays
- https://pokemongo.com/news/get-ready-for-gowildarea-2025
- https://www.reddit.com/r/pokemongo/comments/1tungk4/gofest_tokyo_haul/
- https://www.reddit.com/r/TheSilphRoad/comments/1u24ljq/coppenhagen_city_map_is_out/
- https://www.reddit.com/r/TheSilphRoad/comments/1w5o6nm/closing_ceremony_mega_sf_backgroud_list/
- https://www.serebii.net/pokemongo/reallifeevents/pokemonxpandworldchampionships2026.shtml

## 驗證

npm test：203/203 通過；npm run build 通過。公開背景覆寫 RPC 回傳空物件，沒有覆寫重新帶回飛機兄妹。本輪未修改商品、價格、庫存或資料庫。更新資料與 bundle 快取版本；10/24 收錄驗收收據保留原始日期及統計，測試明確計入洛杉磯已推出的時間差。
