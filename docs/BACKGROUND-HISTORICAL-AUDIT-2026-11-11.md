# 第 05 項：2024 歷年取得條件覆核（2026-11-11）

開始時已讀 GitHub 最新 `data/backgrounds.json`（blob `35bbe3f8da98ab0c92f1fc1bf91ccdf211a0aa55`）、[前輪取得條件紀錄](BACKGROUND-AUDIT-FOLLOWUP-2026-11-10.md)、[282 筆對照表](BACKGROUND-AUDIT-CROSSWALK-2026-11-10.md)，並確認正式站 JSON 與該 blob 一致。以下只處理歷年取得條件，第 07–09 項的已分工專項未重做。

## 本輪判定與修正

| 條目 | 新查證結果 | 證據與限制 |
| --- | --- | --- |
| BG-0017 日惹 | 當地 2024/8/24–25 10:00–18:00。有效當日票券及親自參加超級團體戰為公告的背景取得條件，捕捉拉帝亞斯／拉帝歐斯後有背景機會。補明超級團體戰；票券及現場條件已能從原始公告的同期留存版本追查。 | [2024/5/22 同期公告留存](https://pocketmonsters.net/index.php/news/7573) 明列來源為 [官方原網址](https://pokemongolive.com/events/indonesia-journey-yogyakarta)。官方目前轉址頁讀取失敗，因此保留留存版本的來源性質。其文字明列 in-person，沒有遠距附背景的公告資格。 |
| BG-0021 仁川 | 2024/9/27–29。活動田野調查可提供有機會帶背景的探險帽皮卡丘與坐騎小羊。入場票另含特殊調查，獎勵坐騎小羊有背景機會；城市加購日不額外發特殊調查。 | [Leek Duck 的該屆規則與任務](https://leekduck.com/events/pokemon-go-safari-zone-icheon-south-korea-2024/) 與 [同期活動報導](https://pokemongohub.net/post/news/pokemon-go-city-safari-2024-incheon/) 一致。兩者使用 may，沒有將背景機會改寫為保證。 [Serebii 的實際調查步驟與物種](https://advent.serebii.net/pokemongo/reallifeevents/safarizoneincheon.shtml) 支持獎勵。 |
| BG-0024 聖保羅 | 2024/12/7–8。取得途徑為特殊調查與伊布探險隊限時調查。後者在指定地點發放最多八次附聖保羅背景的探險帽伊布，第二天加購可再完成。刪除套用到這屆的泛用集章描述。 | [同期活動報導](https://pokemongohub.net/post/event/pokemon-go-city-safari-sao-paulo-brazil/) 明列背景限時調查與第二日規則；[Serebii 任務紀錄](https://www.serebii.net/pokemongo/reallifeevents/citysafari-saopaulo.shtml) 有各項轉補給站任務。 [Dittobase](https://www.dittobase.com/pokemon-go/backgrounds/lc-city-safari-2024-saopaulo) 支持日期與一種直接遭遇、八種進化。 |
| BG-0215 究極之洞 | 2024/7/8 10:00–7/13 10:00 為究極異獸五星團體戰；7/13 10:00–18:00 含奈克洛茲瑪；7/14 10:00–18:00 為奈克洛茲瑪。皆為捕捉後有背景機會。原描述把持票特殊調查列入此圖樣，現改為公告的逐日團戰時段；特殊調查的索爾迦雷歐／露奈雅拉屬另外的日曜／月影圖樣。 | [官方背景公告](https://pokemongo.com/news/special-backgrounds?hl=en) 逐時段列出。保留現有物種及合體欄位，兩張調查背景與兩張合體專屬背景的既有條目已另行核對。 |

資料提交為 `2b82aeadb56152d17d09e6358ec9d3870e353d1b`、`d98e6d2ec484112bc18081aa40831c5bcf8ed488`。合計四筆取得方式／來源變動，未新增背景、改動圖樣或寶可夢名單。

## 本輪維持原資料

- BG-0016 檀香山。官方明列賽事 8/16–18，全球遊戲慶祝 8/16–20；兩種時段依舊不能直接替代地點背景發放迄日。重新查看當時社群討論後，8/19 留言雖有拿到背景的描述，沒有足以確認捕獲日期及途徑的畫面。該串 8/18 留言提到活動至 8/20 20:00，也不足以單獨證明背景發放截止。保持現有 8/20，待原始遊戲畫面或地方活動公告。 [官方](https://pokemongo.com/news/world-championships-event-2024) · [當時社群討論](https://www.reddit.com/r/TheSilphRoad/comments/1etyycw) · [Serebii](https://www.serebii.net/pokemongo/reallifeevents/pokemonworldchampionships2024.shtml) · [Dittobase](https://www.dittobase.com/pokemon-go/backgrounds/lc-wcs-2024-honolulu)
- BG-0023 香港。既有描述已列特殊調查與伊布探險隊限時調查，日期與 [Serebii](https://www.serebii.net/pokemongo/reallifeevents/citysafari-hongkong.shtml)、[Dittobase](https://www.dittobase.com/pokemon-go/backgrounds/lc-city-safari-2024-hongkong) 一致。部分同期文章誤把背景城市寫成台南，未據此更改本站香港圖樣或名稱。
- BG-0122／0123 的好啦魷、BG-0079／0081 的雪梨及布宜諾斯艾利斯取得途徑，先前已建議由 Claude 協查。本輪沒有收到新的交付證據，無法認定該兩組已完成。其餘歷年條目的裝扮、形態及後續復刻仍依逐筆對照表續查，第 05 項尚未結案。

## 正式站驗收

正式站公開 `data/backgrounds.json` 的 Git blob 為 `0dc7c86f476016d782a32e5af3c7af95ca485994`，與本輪最後資料提交一致。逐筆比較開始及結束版本，共 282 筆，只有 BG-0017、BG-0021、BG-0024、BG-0215 的中英文取得方式與查核來源變動；ID、日期、寶可夢名單、其他條目及頂層資料均通過一致性檢查。
