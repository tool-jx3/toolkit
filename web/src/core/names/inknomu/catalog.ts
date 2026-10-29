/**
 * 弄墨 Inknomu《角色姓名產生器》的姓名資料（CC BY 4.0）：29 個包的清單（開頁就要用的部分）。由 web/scripts/inknomu-names.mjs 產生，不要手改；
 * 出處、授權與本站做的變更見同資料夾的 meta.json、LICENSE.txt 與 docs/refactor/specs/npc-names.md 2.5。
 */
import type { InknomuPackInfo } from '../corpus';

// biome-ignore format: 資料檔由腳本產生，一個包一行
export const INKNOMU_PACKS: readonly InknomuPackInfo[] = [
  {"id":"jp-sengoku","region":"jp","label":"日本・戰國時代（1467–1615）","neutral":false,"rank":true,"countries":false,"reading":"kana","patronymic":false,"sha256":"452152e806b2d5909d5b719a5ef505a11b4583997eda4ca118bbc8c142031cfe"},
  {"id":"jp-edo","region":"jp","label":"日本・江戶時代（1603–1868）","neutral":false,"rank":true,"countries":false,"reading":"kana","patronymic":false,"sha256":"1cf4ee17290626c6521bea63e6fa127da409dc4b09df00c40e3a746d0dc21f66"},
  {"id":"jp-taisho","region":"jp","label":"日本・大正時代（1912–1926，含明治後期）","neutral":true,"rank":true,"countries":false,"reading":"kana","patronymic":false,"sha256":"1a48f01a521cc5a4a480ab6057c44ebce453ab95167c50db2d104dc45229b265"},
  {"id":"jp-showa","region":"jp","label":"日本・昭和時代（1926–1989）","neutral":true,"rank":true,"countries":false,"reading":"kana","patronymic":false,"sha256":"d579ae3e49a2199b8c7ac1614ae2fb05e91f40c3a2c59713ade365bcc9214043"},
  {"id":"jp-modern","region":"jp","label":"日本・平成令和時代（1989–今）","neutral":true,"rank":true,"countries":false,"reading":"kana","patronymic":false,"sha256":"d37d3cc04df4145fa479c1f071b7664d9262a87e0aa4a387cc979408e1f94c71"},
  {"id":"jp-rare","region":"jp","label":"日本・珍稀難讀姓名","neutral":true,"rank":true,"countries":false,"reading":"kana","patronymic":false,"sha256":"6d8536beef8823721cc2a28c4ec44d8027746b8e5a278391bae178aab0e1f4fa"},
  {"id":"tw-qing","region":"tw","label":"台灣・清領時代（1683–1895）","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"342864f5eb7470e3d1ae28ca2f772d306f22e9cb91daaa9566f046d6258d98b4"},
  {"id":"tw-japanese","region":"tw","label":"台灣・日治時代（1895–1945）","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"c5ad58fe48cd669fabcc73580ec2b13f9d6f6e73a8fb009cd6de657ff58bcf3d"},
  {"id":"tw-modern","region":"tw","label":"台灣・現代（1945–今）","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"b7a07a1fc9a2e4eb3da99b288c9633612fc65f0ed32c230825ef0da756cd5f6b"},
  {"id":"tw-y2k","region":"tw","label":"台灣・二千年後（2000–）","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"394ab7e2ce117b7ad3823b649253830b80e07372fcc11acb3a6d3d98d7df11b1"},
  {"id":"tw-wuxia","region":"tw","label":"台灣・武俠江湖","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"a918a18dbcfee712bd706500ac537ee7caf13fa3a77a4692b980efe7cb437513"},
  {"id":"kr-modern","region":"kr","label":"韓國・現代","neutral":true,"rank":false,"countries":false,"reading":"latin","patronymic":false,"sha256":"9649681546f5ce6c53414eb229eb733bad937792b1cc11cd7f4ee8b77b9a89ff"},
  {"id":"uk-medieval","region":"uk","label":"英國・中世紀（1066–1485）","neutral":true,"rank":true,"countries":false,"reading":null,"patronymic":false,"sha256":"40041e6a65bb8d53ef52f1caed8deb029e9d50ce91424a582c9bfdb24e8299b3"},
  {"id":"uk-regency","region":"uk","label":"英國・攝政時代（1780–1837）","neutral":true,"rank":true,"countries":false,"reading":null,"patronymic":false,"sha256":"452b2807d565430fde5d16d5538d61d24ff07a19d9940db3ce37219a5d65fa8f"},
  {"id":"uk-victorian","region":"uk","label":"英國・維多利亞時代（1837–1901）","neutral":true,"rank":true,"countries":false,"reading":null,"patronymic":false,"sha256":"025f33f4e2cc05d1b347440a6f588e4c63d0e629e320dc6c595cb36e6f88a455"},
  {"id":"uk-modern","region":"uk","label":"英國・現代（1990–今）","neutral":true,"rank":true,"countries":false,"reading":null,"patronymic":false,"sha256":"a4773cc8e26818a66d71aae825c595d661102b4a171d23974b559d564bebb4d0"},
  {"id":"us-classic","region":"us","label":"美國・經典時代（1880–1950）","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"b481874693d96ffa34a2cc8b3c5336b13a796464a8e853f64521fd47cf47120c"},
  {"id":"us-modern","region":"us","label":"美國・現代（1990–今）","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"b52a9e023ed45a344ffda08577a92a796e2d62addc0ff822a14a112db0f4fd06"},
  {"id":"us-latino","region":"us","label":"美國・拉美裔（西班牙語系命名傳統）","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"96d3c7464177189a16eaa5a881652dafaa18f795b6cce2926a26bb3e90a7cd51"},
  {"id":"us-african-american","region":"us","label":"美國・非裔（African American命名傳統）","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"2616f141ea22079098ad90979a7707b3d5cc3d3e204e9547d3d6b152f45e5d0a"},
  {"id":"ru-imperial","region":"ru","label":"俄羅斯・帝俄時代（1721–1917）","neutral":false,"rank":false,"countries":false,"reading":"latin","patronymic":false,"sha256":"c054eeb4f3be2e174b12cd60474dcb572a07ff1e86f725a411bd409d57728dbe"},
  {"id":"ru-modern","region":"ru","label":"俄羅斯・現代（1991–今）","neutral":false,"rank":false,"countries":false,"reading":"latin","patronymic":false,"sha256":"be634f1d005bef2f5e32077d53289148cfda748c7ba7e7e85d851c403d15d633"},
  {"id":"nordic-viking","region":"nordic","label":"北歐・維京時代（793–1066）","neutral":false,"rank":false,"countries":false,"reading":"latin","patronymic":true,"sha256":"61de6d3f69e8e4be7b11400f67f416ff97b1bd7686006db8cd97250403c13011"},
  {"id":"nordic-modern","region":"nordic","label":"北歐・現代（1990–今）","neutral":true,"rank":false,"countries":true,"reading":null,"patronymic":false,"sha256":"ed8212b13778f12516d2249120fbd61ccdcaba44ca87996ad29fc1fce1dad156"},
  {"id":"fantasy-human","region":"fantasy","label":"奇幻・人類","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"4489bf211ecdf9651da107a0a3a8ae41f4fb72a89954321deae46d8aeec007ba"},
  {"id":"fantasy-elf","region":"fantasy","label":"奇幻・精靈","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"ab705e8b4c138fedf31d6a759e7d2d9c31bb8ee9f7eea8a0e054fa3f5a514d98"},
  {"id":"fantasy-dwarf","region":"fantasy","label":"奇幻・矮人","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"9520869e94b4bac424509a04e578a2b67329c1758812ac26a5a816603f5a8228"},
  {"id":"fantasy-orc","region":"fantasy","label":"奇幻・獸人／半獸人","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"a652d125b5fd5613aa5cd12649a1bd81aa3a5c049ac58eddc230adc82bde3b7d"},
  {"id":"fantasy-halfling","region":"fantasy","label":"奇幻・半身人","neutral":true,"rank":false,"countries":false,"reading":null,"patronymic":false,"sha256":"03095efbcec9f26176f33330844a35ffd4aa358e30d0010099a22e03a025cf6e"},
];
