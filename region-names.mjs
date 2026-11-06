// Country / area names for background regions, keyed by the catalog's English region name.
// Columns: Japanese, Korean, Vietnamese, Thai.
export const REGION_NAMES={
 'United States':['アメリカ','미국','Hoa Kỳ','สหรัฐอเมริกา'],
 'South Korea':['韓国','대한민국','Hàn Quốc','เกาหลีใต้'],
 'Japan':['日本','일본','Nhật Bản','ญี่ปุ่น'],
 'United Kingdom':['イギリス','영국','Vương quốc Anh','สหราชอาณาจักร'],
 'Spain':['スペイン','스페인','Tây Ban Nha','สเปน'],
 'Mexico':['メキシコ','멕시코','Mexico','เม็กซิโก'],
 'Indonesia':['インドネシア','인도네시아','Indonesia','อินโดนีเซีย'],
 'Taiwan':['台湾','대만','Đài Loan','ไต้หวัน'],
 'Hong Kong':['香港','홍콩','Hồng Kông','ฮ่องกง'],
 'Brazil':['ブラジル','브라질','Brazil','บราซิล'],
 'Singapore':['シンガポール','싱가포르','Singapore','สิงคโปร์'],
 'India':['インド','인도','Ấn Độ','อินเดีย'],
 'Italy':['イタリア','이탈리아','Ý','อิตาลี'],
 'Chile':['チリ','칠레','Chile','ชิลี'],
 'France':['フランス','프랑스','Pháp','ฝรั่งเศส'],
 'Germany':['ドイツ','독일','Đức','เยอรมนี'],
 'Netherlands':['オランダ','네덜란드','Hà Lan','เนเธอร์แลนด์'],
 'Thailand':['タイ','태국','Thái Lan','ไทย'],
 'Canada':['カナダ','캐나다','Canada','แคนาดา'],
 'Australia':['オーストラリア','호주','Úc','ออสเตรเลีย'],
 'Argentina':['アルゼンチン','아르헨티나','Argentina','อาร์เจนตินา'],
 'Denmark':['デンマーク','덴마크','Đan Mạch','เดนมาร์ก'],
 'Malaysia':['マレーシア','말레이시아','Malaysia','มาเลเซีย'],
 'Philippines':['フィリピン','필리핀','Philippines','ฟิลิปปินส์'],
 'Portugal':['ポルトガル','포르투갈','Bồ Đào Nha','โปรตุเกส'],
 'Belgium':['ベルギー','벨기에','Bỉ','เบลเยียม'],
 'Multiple regions':['複数地域','여러 지역','Nhiều khu vực','หลายภูมิภาค'],
 'Global':['グローバル','글로벌','Toàn cầu','ทั่วโลก']
};
const COLUMNS=['ja','ko','vi','th'];
export const localRegionName=(en,locale)=>REGION_NAMES[en]?.[COLUMNS.indexOf(locale)]||'';
export const allRegionNames=en=>REGION_NAMES[en]??[];
