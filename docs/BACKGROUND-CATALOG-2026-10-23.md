# 背景圖鑑實作進度（2026-10-23）

## 這次接續的主線

使用者要求直接完善正式網站 `backgrounds.html`，不是製作商品上架別名。商品 PT 欄位只在新增商品時提供。正式站為 https://wujackypokemongo.github.io/WuJackyPokemonGo/ 。

## 本輪已寫入程式的內容

- 268 組收錄記錄：133 組官方活動已核對、125 組名錄交叉核對、7 組即將推出、3 組待核對。
- 名錄交叉核對不是官方確認；背景存在與適用寶可夢可核對，但日期細節仍可能待核。兩種證據在畫面及篩選中分開。
- 六國館舍每館九種原始遭遇款（普通與太空裝皮卡丘是兩款），共 54；七種進化款另區呈現，不加進九款。
- 日本寶可夢中心補齊橫濱，共 18 地；GO Lab 普通皮卡丘與博士助手分別寫明取得方式及開始日期。
- 補山形人孔蓋、2026 坦帕灣光芒背景；人孔蓋使用官方全國逐步開放說明，不用虛構的 1/1 日期。
- 補進化／合體名錄及搜尋，新增國家／地區篩選，保留中英文與圖鑑號搜尋、庫存商品關聯。
- 更正台南、2025 城市狩獵、十週年、月光、印尼無車日等日期；未來活動獨立顯示。
- 檢查 268 個圖片網址：原本 266 個可用，台北花卉及 Wimpole 兩個失效網址已換成驗證可下載的來源圖。
- 三組相同來源圖保留活動／類型脈絡，標明同圖樣，不將記錄數當獨立背景總數。

## 尚未全部完善（不可宣稱完成全部歷史背景）

- 66 組精確日期仍有來源衝突或不完整；不填猜測日期，詳情顯示原始來源日期及待核對說明。
- 110 組取得方式尚需進一步核實；畫面保留明確待核對文字。
- 三組待核：2024 MLB Marlins、2024 MLB Mariners（與 2025 圖相同，需補首次發放證據）；Busan Fireworks Festival（只有候選素材）。
- 268 是工作記錄數，不是歷來已推出獨立圖樣的最終款數。
- `data/backgrounds.json` 為完整前端資料；研究 JSON 保留證據與衝突摘要，避免重複整理。

## 全部記錄

| 工作編號 | 背景 | 收錄狀態 |
|---|---|---|
| BG-0001 | GO Tour Las Vegas | 名錄交叉核對 |
| BG-0002 | Air Adventures Jeju Island | 名錄交叉核對 |
| BG-0003 | GO Fest Osaka | 名錄交叉核對 |
| BG-0004 | GO Fest London | 名錄交叉核對 |
| BG-0005 | GO Fest New York City | 名錄交叉核對 |
| BG-0006 | City Safari Seoul | 名錄交叉核對 |
| BG-0007 | City Safari Barcelona | 名錄交叉核對 |
| BG-0008 | City Safari Mexico City | 名錄交叉核對 |
| BG-0009 | GO Tour Los Angeles | 名錄交叉核對 |
| BG-0010 | Air Adventures Bali | 名錄交叉核對 |
| BG-0011 | City Safari Tainan | 官方活動已核對 |
| BG-0012 | Air Adventures Surabaya | 名錄交叉核對 |
| BG-0013 | GO Fest Sendai | 名錄交叉核對 |
| BG-0014 | GO Fest Madrid | 名錄交叉核對 |
| BG-0015 | GO Fest New York City 2024 | 名錄交叉核對 |
| BG-0016 | 2024 Pokemon World Championships | 名錄交叉核對 |
| BG-0017 | Air Adventures Yogyakarta | 名錄交叉核對 |
| BG-0018 | MLB Marlins | 待核對 |
| BG-0019 | MLB Mariners | 待核對 |
| BG-0020 | Air Adventures Jakarta | 名錄交叉核對 |
| BG-0021 | Safari Zone Incheon | 名錄交叉核對 |
| BG-0022 | GO Wild Area Fukuoka | 名錄交叉核對 |
| BG-0023 | City Safari Hong Kong | 名錄交叉核對 |
| BG-0024 | City Safari Sao Paulo | 名錄交叉核對 |
| BG-0025 | GO Tour New Taipei City | 名錄交叉核對 |
| BG-0026 | GO Tour Unova Los Angeles | 名錄交叉核對 |
| BG-0027 | City Safari Singapore | 名錄交叉核對 |
| BG-0028 | City Safari Mumbai | 名錄交叉核對 |
| BG-0029 | City Safari Milan | 名錄交叉核對 |
| BG-0030 | City Safari Santiago | 名錄交叉核對 |
| BG-0031 | Spring Blossom Festival | 名錄交叉核對 |
| BG-0032 | Expo 2025 - Osaka | 名錄交叉核對 |
| BG-0033 | Expo 2025 - Osaka 2 | 名錄交叉核對 |
| BG-0034 | Suita City | 名錄交叉核對 |
| BG-0035 | GO Fest 2025 Osaka | 名錄交叉核對 |
| BG-0036 | GO Fest 2025 Jersey City | 名錄交叉核對 |
| BG-0037 | GO Fest 2025 Paris | 名錄交叉核對 |
| BG-0038 | Lotte Giants | 名錄交叉核對 |
| BG-0039 | Seattle Mariners | 官方活動已核對 |
| BG-0040 | Road Trip 2025 Manchester | 名錄交叉核對 |
| BG-0041 | Miami Marlins | 官方活動已核對 |
| BG-0042 | Road Trip 2025 London | 名錄交叉核對 |
| BG-0043 | Tampa Bay Rays | 官方活動已核對 |
| BG-0044 | Milwaukee Brewers | 官方活動已核對 |
| BG-0045 | Road Trip 2025 Paris | 名錄交叉核對 |
| BG-0046 | Jangheung Water Festival | 名錄交叉核對 |
| BG-0047 | Road Trip 2025 Valencia | 名錄交叉核對 |
| BG-0048 | Washington Nationals | 官方活動已核對 |
| BG-0049 | Road Trip 2025 Berlin | 名錄交叉核對 |
| BG-0050 | Arizona Diamond Backs | 官方活動已核對 |
| BG-0051 | Chicago White Sox | 官方活動已核對 |
| BG-0052 | Baltimore Orioles | 官方活動已核對 |
| BG-0053 | Cleveland Guardians | 官方活動已核對 |
| BG-0054 | 2025 Pokemon World Championships | 名錄交叉核對 |
| BG-0055 | Road Trip 2025 The Hague | 名錄交叉核對 |
| BG-0056 | Road Trip 2025 Cologne | 名錄交叉核對 |
| BG-0057 | New York Mets | 官方活動已核對 |
| BG-0058 | Boston Red Sox | 名錄交叉核對 |
| BG-0059 | San Francisco Giants | 名錄交叉核對 |
| BG-0060 | Minnesota Twins | 名錄交叉核對 |
| BG-0061 | Texas Rangers | 名錄交叉核對 |
| BG-0062 | Mega Evolution Paris | 名錄交叉核對 |
| BG-0063 | Mega Evolution Paris 2 | 名錄交叉核對 |
| BG-0064 | City Safari Bangkok | 名錄交叉核對 |
| BG-0065 | City Safari Amsterdam | 官方活動已核對 |
| BG-0066 | City Safari Valencia | 官方活動已核對 |
| BG-0067 | City Safari Cancun | 名錄交叉核對 |
| BG-0068 | City Safari Vancouver | 名錄交叉核對 |
| BG-0069 | Pokemon GO at Jeju Island | 名錄交叉核對 |
| BG-0070 | GO Wild Area Nagasaki | 官方活動已核對 |
| BG-0071 | Taipei Children's Amusement Park | 名錄交叉核對 |
| BG-0072 | Busan Fireworks Festival | 待核對 |
| BG-0073 | Pokelid Okinawa | 官方活動已核對 |
| BG-0074 | Pokelid Fukuoka | 官方活動已核對 |
| BG-0075 | Pokelid Kagoshima | 官方活動已核對 |
| BG-0076 | Pokelid Miyazaki | 官方活動已核對 |
| BG-0077 | Pokelid Nagasaki | 官方活動已核對 |
| BG-0078 | Pokelid Saga | 官方活動已核對 |
| BG-0079 | City Safari Sydney | 名錄交叉核對 |
| BG-0080 | City Safari Miami | 官方活動已核對 |
| BG-0081 | City Safari Buenos Aires | 名錄交叉核對 |
| BG-0082 | NFL Cardinals | 名錄交叉核對 |
| BG-0083 | Car Free Day | 官方活動已核對 |
| BG-0084 | Pyeongchang Winter Festival | 名錄交叉核對 |
| BG-0085 | Pokelid Aichi | 官方活動已核對 |
| BG-0086 | Pokelid Akita | 官方活動已核對 |
| BG-0087 | Pokelid Aomori | 官方活動已核對 |
| BG-0088 | Pokelid Chiba | 官方活動已核對 |
| BG-0089 | Pokelid Fukui | 官方活動已核對 |
| BG-0090 | Pokelid Fukushima | 官方活動已核對 |
| BG-0091 | Pokelid Gifu | 官方活動已核對 |
| BG-0092 | Pokelid Hokkaido | 官方活動已核對 |
| BG-0093 | Pokelid Hyogo | 官方活動已核對 |
| BG-0094 | Pokelid Ibaraki | 官方活動已核對 |
| BG-0095 | Pokelid Ishikawa | 官方活動已核對 |
| BG-0096 | Pokelid Iwate | 官方活動已核對 |
| BG-0097 | Pokelid Kanagawa | 官方活動已核對 |
| BG-0098 | Pokelid Kyoto | 官方活動已核對 |
| BG-0099 | Pokelid Mie | 官方活動已核對 |
| BG-0100 | Pokelid Miyagi | 官方活動已核對 |
| BG-0101 | Pokelid Nara | 官方活動已核對 |
| BG-0102 | Pokelid Niigata | 官方活動已核對 |
| BG-0103 | Pokelid Osaka | 官方活動已核對 |
| BG-0104 | Pokelid Saitama | 官方活動已核對 |
| BG-0105 | Pokelid Shiga | 官方活動已核對 |
| BG-0106 | Pokelid Shizuoka | 官方活動已核對 |
| BG-0107 | Pokelid Tochigi | 官方活動已核對 |
| BG-0108 | Pokelid Tokyo | 官方活動已核對 |
| BG-0109 | Pokelid Toyama | 官方活動已核對 |
| BG-0110 | Pokelid Wakayama | 官方活動已核對 |
| BG-0111 | Pokelid Ehime | 官方活動已核對 |
| BG-0112 | Pokelid Kagawa | 官方活動已核對 |
| BG-0113 | Pokelid Kochi | 官方活動已核對 |
| BG-0114 | Pokelid Okayama | 官方活動已核對 |
| BG-0115 | Pokelid Shimane | 官方活動已核對 |
| BG-0116 | Pokelid Tokushima | 官方活動已核對 |
| BG-0117 | Pokelid Tottori | 官方活動已核對 |
| BG-0118 | Pokelid Yamaguchi | 官方活動已核對 |
| BG-0119 | PokePark Kanto | 名錄交叉核對 |
| BG-0120 | Carnival Flamigo Cologne | 名錄交叉核對 |
| BG-0121 | Carnival Flamigo Rio | 名錄交叉核對 |
| BG-0122 | GO Tour 2026 Tainan | 名錄交叉核對 |
| BG-0123 | GO Tour 2026 Los Angeles | 名錄交叉核對 |
| BG-0124 | Taipei Floral Picnic 2016 | 名錄交叉核對 |
| BG-0125 | Yomiuri Giants | 名錄交叉核對 |
| BG-0126 | Koshien Hanshin Tigers | 名錄交叉核對 |
| BG-0127 | Rakuten Eagles | 名錄交叉核對 |
| BG-0128 | Hiroshima Carp | 名錄交叉核對 |
| BG-0129 | Softbank Hawks | 名錄交叉核對 |
| BG-0130 | Belluna | 名錄交叉核對 |
| BG-0131 | Kyocera | 名錄交叉核對 |
| BG-0132 | Yokohama Baystars | 名錄交叉核對 |
| BG-0133 | Zozo Marine | 名錄交叉核對 |
| BG-0134 | Hokkaido Fighters | 名錄交叉核對 |
| BG-0135 | Chunichi Dragons | 名錄交叉核對 |
| BG-0136 | GO Fest 2026 Tokyo | 名錄交叉核對 |
| BG-0137 | GO Fest Tokyo Koto | 名錄交叉核對 |
| BG-0138 | GO Fest Tokyo Minato | 名錄交叉核對 |
| BG-0139 | GO Fest Tokyo Shinagawa | 名錄交叉核對 |
| BG-0140 | GO Fest 2026 Chicago | 名錄交叉核對 |
| BG-0141 | GO Fest 2026 Copenhagen | 名錄交叉核對 |
| BG-0142 | Tokyo Swallows | 名錄交叉核對 |
| BG-0143 | Toyama All Stars | 名錄交叉核對 |
| BG-0144 | Pokemon Center Fukuoka | 官方活動已核對 |
| BG-0145 | Pokemon Center GO Lab | 官方活動已核對 |
| BG-0146 | Pokemon Center Hiroshima | 官方活動已核對 |
| BG-0147 | Pokemon Center Kagawa | 官方活動已核對 |
| BG-0148 | Pokemon Center Kanazawa | 官方活動已核對 |
| BG-0149 | Pokemon Center Kyoto | 官方活動已核對 |
| BG-0150 | Pokemon Center Mega Tokyo | 官方活動已核對 |
| BG-0151 | Pokemon Center Nagoya | 官方活動已核對 |
| BG-0152 | Pokemon Center Okinawa | 官方活動已核對 |
| BG-0153 | Pokemon Center Osaka | 官方活動已核對 |
| BG-0154 | Pokemon Center Osaka DX | 官方活動已核對 |
| BG-0155 | Pokemon Center Sapporo | 官方活動已核對 |
| BG-0156 | Pokemon Center Shibuya | 官方活動已核對 |
| BG-0157 | Pokemon Center Skytree Town | 官方活動已核對 |
| BG-0158 | Pokemon Center Tohoku | 官方活動已核對 |
| BG-0159 | Pokemon Center Tokyo Bay | 官方活動已核對 |
| BG-0160 | Pokemon Center Tokyo DX | 官方活動已核對 |
| BG-0161 | 10th Anniversary Celebration | 名錄交叉核對 |
| BG-0162 | National Trust Anglesey Abbey | 官方活動已核對 |
| BG-0163 | National Trust Attingham Park | 官方活動已核對 |
| BG-0164 | National Trust Belton House | 官方活動已核對 |
| BG-0165 | National Trust Calke Abbey | 官方活動已核對 |
| BG-0166 | National Trust Chirk | 官方活動已核對 |
| BG-0167 | National Trust Cliveden | 官方活動已核對 |
| BG-0168 | National Trust Clumber Park | 官方活動已核對 |
| BG-0169 | National Trust Dunham Massey | 官方活動已核對 |
| BG-0170 | National Trust Fountains Abbey Estate | 官方活動已核對 |
| BG-0171 | National Trust Gibside | 官方活動已核對 |
| BG-0172 | National Trust Hanbury | 官方活動已核對 |
| BG-0173 | National Trust Hardwick | 官方活動已核對 |
| BG-0174 | National Trust Killerton | 官方活動已核對 |
| BG-0175 | National Trust Kingston Lacy | 官方活動已核對 |
| BG-0176 | National Trust Lacock | 官方活動已核對 |
| BG-0177 | National Trust Lyme Park | 官方活動已核對 |
| BG-0178 | National Trust Mottisfont | 官方活動已核對 |
| BG-0179 | National Trust Mount Stewart | 官方活動已核對 |
| BG-0180 | National Trust Nymans | 官方活動已核對 |
| BG-0181 | National Trust Polesden | 官方活動已核對 |
| BG-0182 | National Trust Scotney Castle | 官方活動已核對 |
| BG-0183 | National Trust Stourhead | 官方活動已核對 |
| BG-0184 | National Trust Stowe Garden Park | 官方活動已核對 |
| BG-0185 | National Trust Tredegar House | 官方活動已核對 |
| BG-0186 | National Trust Trelissick | 官方活動已核對 |
| BG-0187 | National Trust Tyntesfield | 官方活動已核對 |
| BG-0188 | National Trust Wimpole | 官方活動已核對 |
| BG-0189 | Pokemon Jet Red | 官方活動已核對 |
| BG-0190 | 2026 Pokemon World Championships | 名錄交叉核對 |
| BG-0191 | PokeXciting Malaysia | 官方活動已核對 |
| BG-0192 | PokeXciting Taiwan | 官方活動已核對 |
| BG-0193 | PokeXciting Singapore | 即將推出 |
| BG-0194 | PokeXciting Philippines | 即將推出 |
| BG-0195 | Pokemon Jet Green | 官方活動已核對 |
| BG-0196 | City Safari - Brisbane | 官方活動已核對 |
| BG-0197 | City Safari - Munich | 官方活動已核對 |
| BG-0198 | City Safari - Marseille | 官方活動已核對 |
| BG-0199 | City Safari - Lisbon | 官方活動已核對 |
| BG-0200 | City Safari - Rio de Janeiro | 官方活動已核對 |
| BG-0201 | City Safari - Boston | 即將推出 |
| BG-0202 | London Science Museum | 官方活動已核對 |
| BG-0203 | Cite de l'Espace | 官方活動已核對 |
| BG-0204 | Ciutat de les Arts | 官方活動已核對 |
| BG-0205 | Euro Space Center | 官方活動已核對 |
| BG-0206 | Germany Space Center | 官方活動已核對 |
| BG-0207 | Netherlands Space Expo | 官方活動已核對 |
| BG-0208 | San Diego Comic Con Malaga | 名錄交叉核對 |
| BG-0209 | Pokelid Nagano | 名錄交叉核對 |
| BG-0210 | NFL Cardinals 2026 | 名錄交叉核對 |
| BG-0211 | Night Out - Los Angeles | 即將推出 |
| BG-0212 | GO Wild Area 2026 Sendai Tohoku | 即將推出 |
| BG-0213 | GO Wild Area 2026 Mexico City | 即將推出 |
| BG-0214 | Night Out - London | 即將推出 |
| BG-0215 | GO Fest 2024 Wormhole | 官方活動已核對 |
| BG-0216 | GO Fest 2024 Radiance | 官方活動已核對 |
| BG-0217 | GO Fest 2024 Umbra | 官方活動已核對 |
| BG-0218 | GO Fest 2024 Wormhole Radiance | 官方活動已核對 |
| BG-0219 | GO Fest 2024 Wormhole Umbra | 官方活動已核對 |
| BG-0220 | Team Valor | 名錄交叉核對 |
| BG-0221 | Team Instinct | 名錄交叉核對 |
| BG-0222 | Team Mystic | 名錄交叉核對 |
| BG-0223 | GO Wild Area 2024 | 名錄交叉核對 |
| BG-0224 | Community Day 2024 | 名錄交叉核對 |
| BG-0225 | Dual Destiny | 名錄交叉核對 |
| BG-0226 | GO Tour Enigma | 名錄交叉核對 |
| BG-0227 | GO Tour Unova Black | 名錄交叉核對 |
| BG-0228 | GO Tour Unova White | 名錄交叉核對 |
| BG-0229 | GO Tour Unova Black White | 名錄交叉核對 |
| BG-0230 | Might and Mastery | 名錄交叉核對 |
| BG-0231 | Delightful Days | 名錄交叉核對 |
| BG-0232 | GO Fest 2025 Zamazenta | 名錄交叉核對 |
| BG-0233 | GO Fest 2025 Zacian | 名錄交叉核對 |
| BG-0234 | 9th Anniversary | 名錄交叉核對 |
| BG-0235 | Dark Skies | 名錄交叉核對 |
| BG-0236 | Tales of Transformation | 名錄交叉核對 |
| BG-0237 | Pokemon Concierge | 官方活動已核對 |
| BG-0238 | GO Wild Area 2025 | 名錄交叉核對 |
| BG-0239 | Pokemon Astronomical Observatory | 名錄交叉核對 |
| BG-0240 | Community Day 2026 | 名錄交叉核對 |
| BG-0241 | GO Tour 2026 Mega | 名錄交叉核對 |
| BG-0242 | GO Tour 2026 X | 名錄交叉核對 |
| BG-0243 | GO Tour 2026 Y | 名錄交叉核對 |
| BG-0244 | GO Tour 2026 Gold | 名錄交叉核對 |
| BG-0245 | GO Tour 2026 Silver | 名錄交叉核對 |
| BG-0246 | GO Tour 2026 Ruby | 名錄交叉核對 |
| BG-0247 | GO Tour 2026 Sapphire | 名錄交叉核對 |
| BG-0248 | GO Tour 2026 Diamond | 名錄交叉核對 |
| BG-0249 | GO Tour 2026 Pearl | 名錄交叉核對 |
| BG-0250 | Festival of Colors | 名錄交叉核對 |
| BG-0251 | Pokemon Pokopia | 名錄交叉核對 |
| BG-0252 | LEGO Pokemon | 名錄交叉核對 |
| BG-0253 | Pokemon GO Arraia 2026 | 名錄交叉核對 |
| BG-0254 | GO Fest 2026 Global | 官方活動已核對 |
| BG-0255 | GO Fest 2026 Mewtwo | 官方活動已核對 |
| BG-0256 | 10th Anniversary | 官方活動已核對 |
| BG-0257 | Road of Legends | 官方活動已核對 |
| BG-0258 | Mewtwo | 官方活動已核對 |
| BG-0259 | Mega Mewtwo | 官方活動已核對 |
| BG-0260 | 10th Anniversary Celebration | 名錄交叉核對 |
| BG-0261 | Pokemon World Championships 2026 | 官方活動已核對 |
| BG-0262 | Pokemon Horizons | 名錄交叉核對 |
| BG-0263 | Moonlight | 官方活動已核對 |
| BG-0264 | Pattern of the Wild | 官方活動已核對 |
| BG-0265 | Ancients Recovered — Regi series | 名錄交叉核對 |
| BG-0266 | Pokémon Center Yokohama | 官方活動已核對 |
| BG-0267 | Poké Lid Yamagata | 官方活動已核對 |
| BG-0268 | MLB Tampa Bay Rays 2026 | 官方活動已核對 |

## 後續跨站核對更新

本文件上方為上一輪 268 筆的歷史檢查點。後續已補正式後台編輯功能，並完成一輪跨站覆蓋檢查，目前底稿為 270 筆；新增 FC 首爾及待核對的世界賽藍色素材。最新狀態與限制見 `BACKGROUNDS-CROSS-SITE-2026-10-23.md`，逐項來源索引見 `backgrounds-cross-site-audit-2026-10-23.json`。尚未宣稱全部歷史背景或每種寶可夢款式已全部完善。
