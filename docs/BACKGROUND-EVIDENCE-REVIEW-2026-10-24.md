# 背景圖鑑第三輪：剩餘證據核對（2026-10-24）

本輪新增0筆、刪除0筆、修正16筆，總數仍為276筆活動／圖樣紀錄。269筆已推出活動紀錄、4筆即將推出、3筆未確認素材。`complete:false`；不能把這個數字稱為276種獨立已發放設計。

## 已處理

- 長野BG-0209：開始日補為2026/10/1。Pokéらく10/1更新與一般市民10/4更新記錄一致，另有現地玩家10/7回覆佐證；維持「名錄交叉核對」，不冒稱官方單獨公告日期。9/26是素材發現日、7/9是實體人孔蓋公布日。
- 波士頓BG-0201：依官方延期公告標為已推出。10/24～25全球活動、2026/10/24～2028/10/23額外特殊調查領取期、親赴波士頓轉補給站的條件分開。每持票日一份調查、每份最多9次背景伊布；沒有波士頓GO集章。領取期限不冒充完成期限。
- GO Fest三城市BG-0136、0140、0141：逐隻補一般團體戰、暗影團體戰、原始團體戰、超夢與捷拉奧拉的路線。捷拉奧拉改為公園特殊調查。隊長服裝的城市地標背景條件未確認，明確標示，不能用全球隊伍特殊背景GO Pass推論。
- PokéPark BG-0119：三神鳥逐隻列月份；皮卡丘保留候選記錄，但明確標示背景資格未證實。官方野外出現名單不能作為背景發放證據。
- 世界賽BG-0190：七個地標團體戰逐隻對應、科斯莫古太空裝與ESA太空裝區分；名錄其他超級款逐隻標明條件未確認。
- 全球曠野2025 BG-0238：逐隻列深入曠野團體戰、11/15暗影克雷色利亞、11/16暗影達克萊伊、披風穿著熊及超極巨長毛巨魔的路線。特殊調查遭遇不直接標成保證背景。
- 補7筆活動地區：2024檀香山世界賽、福岡曠野、香港城市狩獵、汝矣島櫻花節、2025安那翰世界賽、哥本哈根GO Fest、2026舊金山世界賽。
- 三筆未確認素材再次檢索後仍隔離於待確認。沒有可靠證據時不猜日期、不新增販售商品。

## 尚未完成

日期待確認由4降至3；取得條件部分未確認9筆；圖樣未確認3筆，清單互有重疊，共9筆紀錄。

| 編號 | 缺口 |
|---|---|
| BG-0072 | 釜山煙火素材實際發放、日期、寶可夢、方式 |
| BG-0119 | 園區皮卡丘背景資格與路線 |
| BG-0136 / BG-0140 / BG-0141 | 隊長服裝的城市地標背景路線，與全球隊伍特殊背景分開 |
| BG-0190 | 其他超級團體戰款逐隻背景條件 |
| BG-0238 | 特殊調查個別獎勵背景是否保證 |
| BG-0276 | 球場素材活動、日期、寶可夢及發放 |
| BG-0277 | 夜景素材活動、日期、寶可夢及發放；檔名不能作哥斯大黎加證據 |

## 來源

- https://pokemongo-raku.com/post130804
- https://note.com/chic_badger3860/n/nb32c45620191
- https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14331342319
- https://pokemongo.com/ja/news/pokelid_full
- https://pokemongo.com/en/news/city-safari-boston-rescheduled
- https://pokemongo.com/news/ppk_launch
- https://pokemongo.com/news/mega-mewtwo-gofest-2026
- https://pokemongo.com/en/news/know-before-you-go-gofest-2026-in-person-events
- https://leekduck.com/events/pokemon-go-fest-2026-tokyo/
- https://leekduck.com/events/pokemon-go-fest-2026-chicago/
- https://leekduck.com/events/pokemon-go-fest-2026-copenhagen/
- https://leekduck.com/events/pokemon-world-championships-2026-san-francisco/
- https://leekduck.com/events/pokemon-go-wild-area-2025-global/

## 驗證

- `npm test` 155/155通過；`npm run build`通過。
- 讀取網站實際連線的Supabase，商品仍11筆；本輪未修改商品、價格、庫存或資料庫結構。
- 更新圖鑑JSON和背景bundle快取版本；既有中英文搜尋、篩選與穩定ID回歸測試通過。
- 完整16筆逐欄修改前後差異：`backgrounds-evidence-review-2026-10-24.json`。
- 本輪沒有重新逐像素比對345張圖片，也沒有重新宣稱全量歷史發放條件已證實。
