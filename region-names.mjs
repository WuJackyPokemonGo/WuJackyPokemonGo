// Country / area names for background regions, keyed by the catalog's English region name.
// Columns: Japanese, Korean, Vietnamese, Thai, Indonesian, Spanish, Portuguese.
export const REGION_NAMES={
 'United States':['アメリカ','미국','Hoa Kỳ','สหรัฐอเมริกา','Amerika Serikat','Estados Unidos','Estados Unidos'],
 'South Korea':['韓国','대한민국','Hàn Quốc','เกาหลีใต้','Korea Selatan','Corea del Sur','Coreia do Sul'],
 'Japan':['日本','일본','Nhật Bản','ญี่ปุ่น','Jepang','Japón','Japão'],
 'United Kingdom':['イギリス','영국','Vương quốc Anh','สหราชอาณาจักร','Inggris','Reino Unido','Reino Unido'],
 'Spain':['スペイン','스페인','Tây Ban Nha','สเปน','Spanyol','España','Espanha'],
 'Mexico':['メキシコ','멕시코','Mexico','เม็กซิโก','Meksiko','México','México'],
 'Indonesia':['インドネシア','인도네시아','Indonesia','อินโดนีเซีย','Indonesia','Indonesia','Indonésia'],
 'Taiwan':['台湾','대만','Đài Loan','ไต้หวัน','Taiwan','Taiwán','Taiwan'],
 'Hong Kong':['香港','홍콩','Hồng Kông','ฮ่องกง','Hong Kong','Hong Kong','Hong Kong'],
 'Brazil':['ブラジル','브라질','Brazil','บราซิล','Brasil','Brasil','Brasil'],
 'Singapore':['シンガポール','싱가포르','Singapore','สิงคโปร์','Singapura','Singapur','Singapura'],
 'India':['インド','인도','Ấn Độ','อินเดีย','India','India','Índia'],
 'Italy':['イタリア','이탈리아','Ý','อิตาลี','Italia','Italia','Itália'],
 'Chile':['チリ','칠레','Chile','ชิลี','Chili','Chile','Chile'],
 'France':['フランス','프랑스','Pháp','ฝรั่งเศส','Prancis','Francia','França'],
 'Germany':['ドイツ','독일','Đức','เยอรมนี','Jerman','Alemania','Alemanha'],
 'Netherlands':['オランダ','네덜란드','Hà Lan','เนเธอร์แลนด์','Belanda','Países Bajos','Países Baixos'],
 'Thailand':['タイ','태국','Thái Lan','ไทย','Thailand','Tailandia','Tailândia'],
 'Canada':['カナダ','캐나다','Canada','แคนาดา','Kanada','Canadá','Canadá'],
 'Australia':['オーストラリア','호주','Úc','ออสเตรเลีย','Australia','Australia','Austrália'],
 'Argentina':['アルゼンチン','아르헨티나','Argentina','อาร์เจนตินา','Argentina','Argentina','Argentina'],
 'Denmark':['デンマーク','덴마크','Đan Mạch','เดนมาร์ก','Denmark','Dinamarca','Dinamarca'],
 'Malaysia':['マレーシア','말레이시아','Malaysia','มาเลเซีย','Malaysia','Malasia','Malásia'],
 'Philippines':['フィリピン','필리핀','Philippines','ฟิลิปปินส์','Filipina','Filipinas','Filipinas'],
 'Portugal':['ポルトガル','포르투갈','Bồ Đào Nha','โปรตุเกส','Portugal','Portugal','Portugal'],
 'Belgium':['ベルギー','벨기에','Bỉ','เบลเยียม','Belgia','Bélgica','Bélgica'],
 'Multiple regions':['複数地域','여러 지역','Nhiều khu vực','หลายภูมิภาค','Beberapa wilayah','Varias regiones','Várias regiões'],
 'Global':['グローバル','글로벌','Toàn cầu','ทั่วโลก','Global','Global','Global']
};
const COLUMNS=['ja','ko','vi','th','id','es','pt'];
export const localRegionName=(en,locale)=>REGION_NAMES[en]?.[COLUMNS.indexOf(locale)]||'';
export const allRegionNames=en=>REGION_NAMES[en]??[];
