/**
 * 相机与镜头数据库
 * 所有数据基于真实世界的设备规格
 * 涵盖近30年（1995-2025）代表性设备
 * 
 * 类别：
 * - FILM: 胶片电影机
 * - DIGITAL: 数字电影机
 * - CAMERA: 照相机（单反/无反/胶片/中画幅）
 * - PHONE: 手机
 */

export const cameraDatabase = {
  // ==================== 相机类型 ====================
  cameraTypes: [
    { id: 'FILM', name: '胶片机', nameEn: 'FILM', icon: '🎞️' },
    { id: 'DIGITAL', name: '数字机', nameEn: 'DIGITAL', icon: '📹' },
    { id: 'CAMERA', name: '照相机', nameEn: 'CAMERA', icon: '📷' },
    { id: 'PHONE', name: '手机', nameEn: 'PHONE', icon: '📱' }
  ],

  // ==================== 电影机 ====================
  cameras: [
    // =========================================================
    // ===== 胶片电影机 (FILM) - 35mm/Super 35 =====
    // =========================================================
    
    // ----- ARRI 胶片机系列 -----
    {
      id: 'arriflex-35-iii',
      name: 'Arriflex 35-III',
      nameCn: '阿莱35-III型电影摄影机',
      type: 'FILM',
      year: 1979,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '阿莱35-III型电影摄影机，好莱坞黄金年代主力机型。采用PL卡口，支持4齿孔/3齿孔走片，最高速度40fps。代表作：《星球大战》三部曲、《夺宝奇兵》系列、《E.T.外星人》。',
      famousFilms: ['星球大战三部曲', '夺宝奇兵', 'E.T.外星人', '第三类接触'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo', 'canon-k35']
    },
    {
      id: 'arriflex-435',
      name: 'Arriflex 435',
      nameCn: '阿莱435型高速电影摄影机',
      type: 'FILM',
      year: 1995,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '阿莱435型高速电影摄影机，可变帧率1-150fps，配备电子快门角度调节(11.2°-180°)。广告、MV和高速摄影首选。代表作：《角斗士》高速战斗场景、《黑客帝国》子弹时间、《珍珠港》空战镜头。',
      famousFilms: ['角斗士', '黑客帝国', '珍珠港', '变形金刚'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic']
    },
    {
      id: 'arriflex-535b',
      name: 'Arriflex 535B',
      nameCn: '阿莱535B型静音电影摄影机',
      type: 'FILM',
      year: 1992,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '阿莱535B型静音电影摄影机，工作室级静音设计(<20dB)，支持同步录音。内置精密注册销系统确保画面稳定。代表作：《辛德勒的名单》、《肖申克的救赎》、《阿甘正传》、《英国病人》。',
      famousFilms: ['辛德勒的名单', '肖申克的救赎', '阿甘正传', '英国病人'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic', 'panavision-primo']
    },
    {
      id: 'arricam-lt',
      name: 'Arricam LT',
      nameCn: '阿莱LT型轻便电影摄影机',
      type: 'FILM',
      year: 2000,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '阿莱LT型轻便电影摄影机(Lite)，重量仅5.6kg，专为手持和斯坦尼康设计。支持1-60fps可变帧率。代表作：《谍影重重》三部曲手持镜头、《拆弹部队》、《黑暗骑士》部分场景。',
      famousFilms: ['谍影重重三部曲', '拆弹部队', '黑暗骑士', '血色将至'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic', 'panavision-primo', 'canon-k35']
    },
    {
      id: 'arricam-st',
      name: 'Arricam ST',
      nameCn: '阿莱ST型工作室电影摄影机',
      type: 'FILM',
      year: 2000,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '阿莱ST型工作室电影摄影机(Studio)，ARRI最后的35mm胶片机巅峰之作。超静音设计，4齿孔精密走片机构。代表作：《指环王》三部曲、《特洛伊》、《无间道风云》、《老无所依》。',
      famousFilms: ['指环王三部曲', '特洛伊', '无间道风云', '老无所依', '蝙蝠侠：侠影之谜'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic', 'panavision-primo', 'canon-k35']
    },
    {
      id: 'arriflex-16sr3',
      name: 'Arriflex 16SR3',
      nameCn: '阿莱16SR3型16毫米电影摄影机',
      type: 'FILM',
      year: 1992,
      format: 'Super 16mm Film',
      sensor: 'Super 16mm胶片 (12.52×7.41mm感光面积)',
      description: '阿莱16SR3型16毫米电影摄影机，16mm胶片机标杆。支持Super 16格式，可后期放大至35mm。纪录片和独立电影首选。代表作：《摔跤手》、《黑天鹅》、《月升王国》、BBC纪录片。',
      famousFilms: ['摔跤手', '黑天鹅', '月升王国', '追梦女孩'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-ultra-prime', 'cooke-s4', 'zeiss-ultra-16']
    },
    
    // ----- Panavision 胶片机系列 -----
    {
      id: 'panaflex-gold-ii',
      name: 'Panaflex Gold II',
      nameCn: '潘那维申金色II型电影摄影机',
      type: 'FILM',
      year: 1982,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '潘那维申金色II型电影摄影机，好莱坞经典主力机型，超静音马达设计。代表作：《泰坦尼克号》、《勇敢的心》、《拯救大兵瑞恩》、《绿里奇迹》。90年代好莱坞大片标配。',
      famousFilms: ['泰坦尼克号', '勇敢的心', '拯救大兵瑞恩', '绿里奇迹', '美国丽人'],
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e', 'panavision-anamorphic-g']
    },
    {
      id: 'panaflex-millennium',
      name: 'Panaflex Millennium',
      nameCn: '潘那维申千禧年型电影摄影机',
      type: 'FILM',
      year: 1997,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '潘那维申千禧年型电影摄影机，21世纪初好莱坞顶级胶片机。改进的画面注册系统，支持3-perf省胶片模式。代表作：《黑客帝国2&3》、《蜘蛛侠》三部曲、《金刚》(2005)。',
      famousFilms: ['黑客帝国2', '黑客帝国3', '蜘蛛侠三部曲', '金刚'],
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e', 'panavision-anamorphic-g']
    },
    {
      id: 'panavision-millennium-xl',
      name: 'Panavision Millennium XL',
      nameCn: '潘那维申千禧年XL型轻便电影摄影机',
      type: 'FILM',
      year: 2000,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '潘那维申千禧年XL型轻便电影摄影机，超轻量设计(6.8kg机身)，手持拍摄革命。代表作：《断背山》、《老无所依》、《血色将至》，李安和科恩兄弟最爱。',
      famousFilms: ['断背山', '老无所依', '血色将至', '通天塔'],
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e', 'panavision-anamorphic-g']
    },
    {
      id: 'panavision-millennium-xl2',
      name: 'Panavision Millennium XL2',
      nameCn: '潘那维申千禧年XL2型电影摄影机',
      type: 'FILM',
      year: 2004,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '潘那维申千禧年XL2型电影摄影机，最后的顶级35mm胶片机。数字化辅助系统，精密3-perf走片。代表作：《盗梦空间》、《星际穿越》(部分)、《敦刻尔克》(35mm部分)、《八恶人》。',
      famousFilms: ['盗梦空间', '星际穿越', '敦刻尔克', '八恶人', '大师'],
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e', 'panavision-anamorphic-g']
    },
    
    // ----- Moviecam 系列 -----
    {
      id: 'moviecam-compact',
      name: 'Moviecam Compact',
      nameCn: '穆维康紧凑型电影摄影机',
      type: 'FILM',
      year: 1990,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '穆维康紧凑型电影摄影机，奥地利精密制造，紧凑型胶片机先驱。被ARRI收购后技术融入Arricam系列。代表作：《辛德勒的名单》(部分)、《英国病人》、欧洲艺术电影。',
      famousFilms: ['辛德勒的名单', '英国病人', '钢琴课'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo']
    },
    {
      id: 'moviecam-super-america',
      name: 'Moviecam Super America',
      nameCn: '穆维康超级美洲型电影摄影机',
      type: 'FILM',
      year: 1993,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '穆维康超级美洲型电影摄影机，Moviecam旗舰产品，高速拍摄能力达120fps。精密工程和优秀的画面稳定性。代表作：《勇敢的心》(部分)、90年代欧洲电影节获奖作品。',
      famousFilms: ['勇敢的心', '面纱', '绝代艳后'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo']
    },
    
    // ----- Aaton 系列 -----
    {
      id: 'aaton-xtr-prod',
      name: 'Aaton XTR Prod',
      nameCn: '雅通XTR制作型16毫米摄影机',
      type: 'FILM',
      year: 1990,
      format: 'Super 16mm Film',
      sensor: 'Super 16mm胶片 (12.52×7.41mm感光面积)',
      description: '雅通XTR制作型16毫米摄影机，法国精密制造，纪录片界传奇机型。独特的"猫在肩膀"人体工程学设计。代表作：《华氏911》、《难以忽视的真相》、大量奥斯卡最佳纪录片。',
      famousFilms: ['华氏911', '难以忽视的真相', '超码的我', '食品公司'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-ultra-prime', 'zeiss-ultra-16', 'cooke-s4']
    },
    {
      id: 'aaton-35-iii',
      name: 'Aaton 35-III',
      nameCn: '雅通35-III型电影摄影机',
      type: 'FILM',
      year: 1999,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '雅通35-III型电影摄影机，Aaton 35mm旗舰，独特人体工程学设计让摄影师更舒适。代表作：法国和欧洲艺术电影、戛纳电影节获奖作品。',
      famousFilms: ['钢琴教师', '隐藏摄像机', '白丝带'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4']
    },
    {
      id: 'aaton-penelope',
      name: 'Aaton Penelope',
      nameCn: '雅通佩内洛普型电影摄影机',
      type: 'FILM',
      year: 2008,
      format: 'Super 35mm Film',
      sensor: '35mm胶片 (24.89×18.66mm感光面积)',
      description: '雅通佩内洛普型电影摄影机，最后的Aaton 35mm胶片机，配备数字取景器，胶片与数字的桥梁产品。代表作：《艺术家》、独立艺术电影。',
      famousFilms: ['艺术家', '午夜巴黎'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5']
    },
    
    // ----- 经典/复古胶片机 -----
    {
      id: 'mitchell-bncr',
      name: 'Mitchell BNCR',
      nameCn: '米切尔BNCR型电影摄影机',
      type: 'FILM',
      year: 1967,
      format: '35mm Film (Academy)',
      sensor: '35mm胶片Academy标准 (22×16mm感光面积)',
      description: '米切尔BNCR型电影摄影机，好莱坞黄金年代工作室标准，精密注册销系统确保画面稳定。代表作：《教父》三部曲、《唐人街》、《飞越疯人院》、《出租车司机》。',
      famousFilms: ['教父', '教父2', '唐人街', '飞越疯人院', '出租车司机', '现代启示录'],
      compatibleMounts: ['Mitchell'],
      compatibleLenses: ['cooke-speed-panchro', 'bausch-lomb-baltar']
    },
    {
      id: 'eclair-npr',
      name: 'Éclair NPR',
      nameCn: '艾克莱尔NPR型16毫米摄影机',
      type: 'FILM',
      year: 1963,
      format: '16mm Film',
      sensor: '16mm胶片 (10.26×7.49mm感光面积)',
      description: '艾克莱尔NPR型16毫米摄影机(Noiseless Portable Reflex)，法国新浪潮运动神器，手持电影革命开创者。轻便静音设计改变了电影拍摄方式。代表作：法国新浪潮电影、《筋疲力尽》风格作品。',
      famousFilms: ['筋疲力尽', '四百击', '精疲力尽', '中国姑娘'],
      compatibleMounts: ['C-Mount', 'Eclair'],
      compatibleLenses: ['angenieux-zoom', 'zeiss-ultra-16']
    },
    {
      id: 'bolex-h16',
      name: 'Bolex H16 Reflex',
      nameCn: '博莱克斯H16反光取景摄影机',
      type: 'FILM',
      year: 1956,
      format: '16mm Film',
      sensor: '16mm胶片 (10.26×7.49mm感光面积)',
      description: '博莱克斯H16反光取景摄影机，瑞士精密制造，发条驱动16mm机。实验电影和电影学院首选。代表作：斯坦·布拉哈格实验电影、无数学生作品、独立短片。',
      famousFilms: ['狗星人', '窗水婴儿移动', '实验电影经典'],
      compatibleMounts: ['C-Mount'],
      compatibleLenses: ['switar-16', 'kern-macro']
    },
    {
      id: 'bell-howell-2709',
      name: 'Bell & Howell 2709',
      nameCn: '贝尔豪威尔2709型电影摄影机',
      type: 'FILM',
      year: 1912,
      format: '35mm Film',
      sensor: '35mm胶片Academy标准 (22×16mm感光面积)',
      description: '贝尔豪威尔2709型电影摄影机，好莱坞默片时代标准机型，历史传奇。精密金属机身，手摇驱动。代表作：《一个国家的诞生》、《党同伐异》、卓别林早期电影。',
      famousFilms: ['一个国家的诞生', '党同伐异', '城市之光', '摩登时代'],
      compatibleMounts: ['Bell-Howell'],
      compatibleLenses: ['cooke-speed-panchro', 'bausch-lomb-baltar']
    },
    
    // ----- 65mm/IMAX 胶片机 -----
    {
      id: 'panavision-system-65',
      name: 'Panavision System 65',
      nameCn: '潘那维申65系统大画幅摄影机',
      type: 'FILM',
      year: 1988,
      format: '65mm Film (5-perf)',
      sensor: '65mm胶片 (52.63×23.01mm感光面积)',
      description: '潘那维申65系统大画幅摄影机，65mm大画幅胶片机，史诗巨制专用。70mm放映时画质惊人。代表作：《指环王》三部曲部分镜头、《大师》70mm版、《八恶人》70mm版。',
      famousFilms: ['指环王', '大师', '八恶人', '银翼杀手2049'],
      compatibleMounts: ['PV65'],
      compatibleLenses: ['panavision-primo-70', 'panavision-system-65']
    },
    {
      id: 'imax-msm-9802',
      name: 'IMAX MSM 9802',
      nameCn: 'IMAX MSM 9802型巨幕摄影机',
      type: 'FILM',
      year: 1998,
      format: '65mm IMAX (15-perf)',
      sensor: 'IMAX 15齿孔胶片 (70×48.5mm感光面积)',
      description: 'IMAX MSM 9802型巨幕摄影机，15齿孔横向走片，人类最大胶片画幅。单卷胶片仅能拍摄3分钟。代表作：《敦刻尔克》IMAX场景、《星际穿越》IMAX场景、《信条》、《奥本海默》。',
      famousFilms: ['敦刻尔克', '星际穿越', '信条', '奥本海默', '黑暗骑士'],
      compatibleMounts: ['IMAX'],
      compatibleLenses: ['imax-prime', 'hasselblad-hc']
    },
    {
      id: 'arri-765',
      name: 'ARRI 765',
      nameCn: '阿莱765型65毫米电影摄影机',
      type: 'FILM',
      year: 1989,
      format: '65mm Film (5-perf)',
      sensor: '65mm胶片 (52.63×23.01mm感光面积)',
      description: '阿莱765型65毫米电影摄影机，ARRI唯一的65mm胶片机，5齿孔竖向走片。代表作：《敦刻尔克》部分场景、《哈姆雷特》(1996)、《大地雄心》。',
      famousFilms: ['敦刻尔克', '哈姆雷特', '大地雄心', '罗宾汉'],
      compatibleMounts: ['PL65'],
      compatibleLenses: ['arri-prime-65', 'panavision-system-65']
    },

    // =========================================================
    // ===== 数字电影机 (DIGITAL) =====
    // =========================================================
    
    // ----- ARRI 数字机系列 -----
    {
      id: 'arri-alexa-classic',
      name: 'ARRI Alexa Classic',
      nameCn: '阿莱艾丽莎经典型数字电影机',
      type: 'DIGITAL',
      year: 2010,
      format: 'Super 35 (2.8K)',
      sensor: 'ARRI ALEV III CMOS传感器 (23.76×13.37mm), 2880×1620有效像素, 14+档动态范围',
      description: '阿莱艾丽莎经典型数字电影机，数字电影革命开创者，奠定ARRI色彩科学标准。支持ProRes和ARRIRAW。代表作：《雨果》、《生命之树》、《艺术家》、《乌云背后的幸福线》。',
      famousFilms: ['雨果', '生命之树', '艺术家', '乌云背后的幸福线', '林肯'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'panavision-primo']
    },
    {
      id: 'arri-alexa-plus',
      name: 'ARRI Alexa Plus',
      nameCn: '阿莱艾丽莎Plus型数字电影机',
      type: 'DIGITAL',
      year: 2010,
      format: 'Super 35 (2.8K)',
      sensor: 'ARRI ALEV III CMOS传感器 (23.76×13.37mm), 2880×1620有效像素, 14+档动态范围',
      description: '阿莱艾丽莎Plus型数字电影机，Alexa升级版，内置无线视频发射器和镜头马达接口。代表作：《少年派的奇幻漂流》、《地心引力》、《为奴十二年》。',
      famousFilms: ['少年派的奇幻漂流', '地心引力', '为奴十二年', '美国骗局'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'panavision-primo']
    },
    {
      id: 'arri-alexa-xt',
      name: 'ARRI Alexa XT',
      nameCn: '阿莱艾丽莎XT型数字电影机',
      type: 'DIGITAL',
      year: 2013,
      format: 'Super 35 (3.4K)',
      sensor: 'ARRI ALEV III CMOS传感器 (28.17×18.13mm 4:3开门), 3414×2198有效像素, 14+档动态范围',
      description: '阿莱艾丽莎XT型数字电影机，4:3开门传感器版本，原生支持变形宽银幕镜头。内置ARRIRAW记录器。代表作：《星球大战：原力觉醒》、《复仇者联盟2》、《碟中谍5》。',
      famousFilms: ['星球大战：原力觉醒', '复仇者联盟2', '碟中谍5', '疯狂的麦克斯：狂暴之路'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'arri-master-anamorphic', 'panavision-anamorphic-e']
    },
    {
      id: 'arri-alexa-sxt',
      name: 'ARRI Alexa SXT',
      nameCn: '阿莱艾丽莎SXT型数字电影机',
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (3.4K)',
      sensor: 'ARRI ALEV III CMOS传感器 (28.17×18.13mm), 3424×2202有效像素, 14+档动态范围',
      description: '阿莱艾丽莎SXT型数字电影机，SXT系列升级，支持ProRes 4K/UHD内录和HDR工作流程。代表作：《爱乐之城》、《月光男孩》、《海边的曼彻斯特》、《敦刻尔克》(35mm数字部分)。',
      famousFilms: ['爱乐之城', '月光男孩', '海边的曼彻斯特', '敦刻尔克', '水形物语'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-master-anamorphic']
    },
    {
      id: 'arri-alexa-mini',
      name: 'ARRI Alexa Mini',
      nameCn: '阿莱艾丽莎迷你型数字电影机',
      type: 'DIGITAL',
      year: 2015,
      format: 'Super 35 (3.4K)',
      sensor: 'ARRI ALEV III CMOS传感器 (28.17×18.13mm), 3424×2202有效像素, 14+档动态范围',
      description: '阿莱艾丽莎迷你型数字电影机，紧凑型Alexa，仅重2.3kg，稳定器/无人机/车载摄影首选。代表作：《星球大战：最后的绝地武士》、《银翼杀手2049》、《小丑》、《寄生虫》。',
      famousFilms: ['星球大战：最后的绝地武士', '银翼杀手2049', '小丑', '寄生虫', '1917', '波西米亚狂想曲'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'arri-alexa-lf',
      name: 'ARRI Alexa LF',
      nameCn: '阿莱艾丽莎大画幅数字电影机',
      type: 'DIGITAL',
      year: 2018,
      format: 'Large Format (4.5K)',
      sensor: 'ARRI ALEV LF CMOS传感器 (36.70×25.54mm), 4448×3096有效像素, 14+档动态范围',
      description: '阿莱艾丽莎大画幅数字电影机(Large Format)，传感器面积比Super 35大2.3倍，更浅景深和更宽视野。代表作：《小妇人》、《婚姻故事》、《爱尔兰人》、《曼克》。',
      famousFilms: ['小妇人', '婚姻故事', '爱尔兰人', '曼克', '芝加哥七君子审判'],
      compatibleMounts: ['LPL', 'PL'],
      compatibleLenses: ['arri-signature-prime', 'zeiss-supreme-prime', 'cooke-s7', 'leica-thalia']
    },
    {
      id: 'arri-alexa-mini-lf',
      name: 'ARRI Alexa Mini LF',
      nameCn: '阿莱艾丽莎迷你大画幅数字电影机',
      type: 'DIGITAL',
      year: 2019,
      format: 'Large Format (4.5K)',
      sensor: 'ARRI ALEV LF CMOS传感器 (36.70×25.54mm), 4448×3096有效像素, 14+档动态范围',
      description: '阿莱艾丽莎迷你大画幅数字电影机，当前好莱坞最受欢迎的主力机型，结合大画幅画质和紧凑机身。代表作：《沙丘》、《沙丘2》、《奥本海默》(数字部分)、《芭比》、《花月杀手》。',
      famousFilms: ['沙丘', '沙丘2', '奥本海默', '芭比', '花月杀手', '拿破仑'],
      compatibleMounts: ['LPL', 'PL'],
      compatibleLenses: ['arri-signature-prime', 'zeiss-supreme-prime', 'cooke-s7', 'leica-thalia', 'sigma-cine-ff']
    },
    {
      id: 'arri-alexa-35',
      name: 'ARRI Alexa 35',
      nameCn: '阿莱艾丽莎35型数字电影机',
      type: 'DIGITAL',
      year: 2022,
      format: 'Super 35 (4.6K)',
      sensor: 'ARRI ALEV 4传感器 (27.99×19.22mm), 4608×3164有效像素, 17档动态范围',
      description: '阿莱艾丽莎35型数字电影机，全新第四代传感器，17档动态范围创行业记录，新一代Super 35标杆。代表作：《奇异博士2》、《阿凡达2》(部分)、众多2023-2024年大片。',
      famousFilms: ['奇异博士2', '阿凡达2', '碟中谍7', '银河护卫队3'],
      compatibleMounts: ['PL', 'LPL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5', 'arri-signature-prime', 'zeiss-supreme-prime', 'sigma-cine-ff', 'canon-k35']
    },
    {
      id: 'arri-alexa-65',
      name: 'ARRI Alexa 65',
      nameCn: '阿莱艾丽莎65毫米数字电影机',
      type: 'DIGITAL',
      year: 2014,
      format: '65mm (6.5K)',
      sensor: 'ARRI A3X CMOS传感器 (54.12×25.58mm), 6560×3100有效像素, 14档动态范围',
      description: '阿莱艾丽莎65毫米数字电影机，数字版65mm/IMAX，仅供租赁。传感器面积接近IMAX 15-perf胶片。代表作：《复仇者联盟3&4》、《碟中谍6》、《沙丘》、《新蝙蝠侠》。',
      famousFilms: ['复仇者联盟3', '复仇者联盟4', '碟中谍6', '沙丘', '新蝙蝠侠', '信条'],
      compatibleMounts: ['XPL'],
      compatibleLenses: ['arri-prime-65', 'arri-prime-dna', 'hasselblad-hc']
    },
    {
      id: 'arri-amira',
      name: 'ARRI AMIRA',
      nameCn: '阿莱阿米拉型纪录片摄影机',
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (3.2K)',
      sensor: 'ARRI ALEV III CMOS传感器 (23.76×13.37mm), 3200×1800有效像素, 14档动态范围',
      description: '阿莱阿米拉型纪录片摄影机，纪录片/新闻/企业首选，单人操作优化设计，与Alexa相同传感器和色彩科学。代表作：BBC纪录片、Netflix纪录片、大量企业宣传片。',
      famousFilms: ['地球脉动II', '我们的星球', 'Netflix纪录片'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-ultra-prime', 'cooke-s4', 'sigma-cine-ff', 'zeiss-cp3']
    },
    
    // ----- RED 数字机系列 -----
    {
      id: 'red-one-mx',
      name: 'RED ONE MX',
      nameCn: '瑞德ONE MX型数字电影机',
      type: 'DIGITAL',
      year: 2009,
      format: 'Super 35 (4.5K)',
      sensor: 'RED Mysterium-X CMOS传感器 (24.4×13.7mm), 4520×2540有效像素, 13档动态范围',
      description: '瑞德ONE MX型数字电影机，RED首款商用机升级版，数字电影革命先驱。压缩RAW编码REDCODE开创者。代表作：《社交网络》、《加勒比海盗4》、《普罗米修斯》。',
      famousFilms: ['社交网络', '加勒比海盗4', '普罗米修斯', '龙纹身的女孩'],
      compatibleMounts: ['PL', 'RED'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo']
    },
    {
      id: 'red-scarlet-x',
      name: 'RED Scarlet-X',
      nameCn: '瑞德斯嘉丽X型数字电影机',
      type: 'DIGITAL',
      year: 2011,
      format: 'Super 35 (4K)',
      sensor: 'RED Mysterium-X CMOS传感器 (20.7×10.8mm剪裁), 4096×2160有效像素, 13档动态范围',
      description: '瑞德斯嘉丽X型数字电影机，RED入门款机型，独立电影友好价格。模块化设计延续RED传统。代表作：独立电影、婚礼摄影、MV制作。',
      famousFilms: ['独立电影', '音乐视频'],
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-cp2', 'sigma-cine-ff', 'canon-cn-e']
    },
    {
      id: 'red-epic-m',
      name: 'RED Epic-M',
      nameCn: '瑞德史诗M型数字电影机',
      type: 'DIGITAL',
      year: 2011,
      format: 'Super 35 (5K)',
      sensor: 'RED Mysterium-X CMOS传感器 (27.7×14.6mm), 5120×2700有效像素, 13档动态范围',
      description: '瑞德史诗M型数字电影机，《霍比特人》主力机型，模块化设计支持3D立体拍摄。最高120fps@5K。代表作：《霍比特人》三部曲、《少年派的奇幻漂流》、《环太平洋》。',
      famousFilms: ['霍比特人三部曲', '少年派的奇幻漂流', '环太平洋', '极乐空间'],
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'cooke-s5']
    },
    {
      id: 'red-epic-dragon',
      name: 'RED Epic Dragon',
      nameCn: '瑞德史诗龙型数字电影机',
      type: 'DIGITAL',
      year: 2013,
      format: 'Super 35 (6K)',
      sensor: 'RED Dragon CMOS传感器 (30.7×15.8mm), 6144×3160有效像素, 15档动态范围',
      description: '瑞德史诗龙型数字电影机，6K Dragon传感器，15档动态范围。红色巨龙成为行业标杆。代表作：《火星救援》、《蚁人》、《头号玩家》、《银河护卫队》。',
      famousFilms: ['火星救援', '蚁人', '头号玩家', '银河护卫队', '侏罗纪世界'],
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'cooke-s5', 'sigma-cine-ff']
    },
    {
      id: 'red-weapon-helium',
      name: 'RED Weapon Helium 8K',
      nameCn: '瑞德武器氦气8K数字电影机',
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (8K)',
      sensor: 'RED Helium CMOS传感器 (29.90×15.77mm), 8192×4320有效像素, 16.5档动态范围',
      description: '瑞德武器氦气8K数字电影机，首款商用8K电影机，8K@60fps或4K@120fps。代表作：《银河护卫队2》、《金刚：骷髅岛》、《王牌特工2》、《雷神3》。',
      famousFilms: ['银河护卫队2', '金刚：骷髅岛', '王牌特工2', '雷神3', '环太平洋2'],
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s5', 'leica-summilux-c', 'sigma-cine-ff']
    },
    {
      id: 'red-monstro-8k',
      name: 'RED Monstro 8K VV',
      nameCn: '瑞德怪兽8K大画幅数字电影机',
      type: 'DIGITAL',
      year: 2017,
      format: 'VV/Full Frame (8K)',
      sensor: 'RED Monstro CMOS传感器 (40.96×21.60mm), 8192×4320有效像素, 17档动态范围',
      description: '瑞德怪兽8K大画幅数字电影机(Vista Vision)，全画幅8K传感器，RED最大画幅。代表作：《阿凡达2》(部分)、《碟中谍7》(部分)、Netflix高端剧集。',
      famousFilms: ['阿凡达2', '碟中谍7', '怪奇物语'],
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'sigma-cine-ff']
    },
    {
      id: 'red-gemini',
      name: 'RED DSMC2 Gemini 5K',
      nameCn: '瑞德双子座5K数字电影机',
      type: 'DIGITAL',
      year: 2018,
      format: 'Super 35 (5K)',
      sensor: 'RED Gemini CMOS传感器 (30.72×18.00mm), 5120×3000有效像素, 16.5档动态范围',
      description: '瑞德双子座5K数字电影机，双原生ISO (800/3200)，低光性能王者，夜景拍摄首选。代表作：《黑袍纠察队》、夜景MV、低光纪录片。',
      famousFilms: ['黑袍纠察队', '怪奇物语', 'Netflix剧集'],
      compatibleMounts: ['PL', 'Canon EF'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'red-komodo',
      name: 'RED Komodo',
      nameCn: '瑞德科莫多6K紧凑型数字电影机',
      type: 'DIGITAL',
      year: 2020,
      format: 'Super 35 (6K)',
      sensor: 'RED Komodo CMOS传感器 (27.03×14.26mm), 6144×3240有效像素, 16档动态范围',
      description: '瑞德科莫多6K紧凑型数字电影机，仅重960g，采用Canon RF卡口。全局快门版本2023年发布。代表作：YouTube专业内容、独立电影、广告片。',
      famousFilms: ['YouTube专业内容', '独立电影', '广告片'],
      compatibleMounts: ['RF'],
      compatibleLenses: ['sigma-cine-ff', 'canon-sumire', 'zeiss-cp3']
    },
    {
      id: 'red-komodo-x',
      name: 'RED Komodo-X',
      nameCn: '瑞德科莫多X型全局快门数字电影机',
      type: 'DIGITAL',
      year: 2023,
      format: 'Super 35 (6K)',
      sensor: 'RED Komodo GS CMOS传感器 (27.03×14.26mm), 6144×3240有效像素, 全局快门, 15档动态范围',
      description: '瑞德科莫多X型全局快门数字电影机，Komodo升级版搭载全局快门，彻底消除果冻效应。代表作：体育赛事、快速运动、VFX制作。',
      famousFilms: ['体育赛事', 'VFX制作'],
      compatibleMounts: ['RF'],
      compatibleLenses: ['sigma-cine-ff', 'canon-sumire', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'red-v-raptor',
      name: 'RED V-Raptor',
      nameCn: '瑞德V-猛禽8K数字电影机',
      type: 'DIGITAL',
      year: 2021,
      format: 'VV (8K)',
      sensor: 'RED V-Raptor CMOS传感器 (40.96×21.60mm), 8192×4320有效像素, 17档动态范围',
      description: '瑞德V-猛禽8K数字电影机，RED新旗舰，8K VV传感器，支持8K@120fps。代表作：《黑亚当》、《闪电侠》、高端广告。',
      famousFilms: ['黑亚当', '闪电侠', '高端广告'],
      compatibleMounts: ['PL', 'RF'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'sigma-cine-ff', 'canon-sumire', 'leica-summilux-c']
    },
    {
      id: 'red-v-raptor-xl',
      name: 'RED V-Raptor XL',
      nameCn: '瑞德V-猛禽XL型数字电影机',
      type: 'DIGITAL',
      year: 2022,
      format: 'VV (8K)',
      sensor: 'RED V-Raptor CMOS传感器 (40.96×21.60mm), 8192×4320有效像素, 17档动态范围',
      description: '瑞德V-猛禽XL型数字电影机，V-Raptor大机身版，内置主动冷却系统，适合长时间高强度拍摄。代表作：高端剧集、大型广告制作。',
      famousFilms: ['Netflix剧集', '高端广告'],
      compatibleMounts: ['PL', 'RF'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'arri-signature-prime']
    },
    {
      id: 'red-ranger-monstro',
      name: 'RED Ranger Monstro',
      nameCn: '瑞德游骑兵怪兽型数字电影机',
      type: 'DIGITAL',
      year: 2019,
      format: 'VV (8K)',
      sensor: 'RED Monstro CMOS传感器 (40.96×21.60mm), 8192×4320有效像素, 17档动态范围',
      description: '瑞德游骑兵怪兽型数字电影机，租赁市场专供，集成式机身设计，内置V-Lock电池槽和ND滤镜。代表作：租赁公司主力机型。',
      famousFilms: ['租赁市场专用'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'arri-signature-prime']
    },
    
    // ----- Sony 数字机系列 -----
    {
      id: 'sony-f35',
      name: 'Sony F35',
      nameCn: '索尼F35型数字电影机',
      type: 'DIGITAL',
      year: 2009,
      format: 'Super 35 (1080p)',
      sensor: 'Sony Super 35mm CCD传感器 (23.6×13.3mm), 1920×1080有效像素, 14档动态范围',
      description: '索尼F35型数字电影机，CineAlta系列先驱，采用CCD传感器获得胶片级色彩。代表作：《阿凡达》(部分)、《创：战纪》、《特种部队》。',
      famousFilms: ['阿凡达', '创：战纪', '特种部队'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'zeiss-ultra-prime', 'cooke-s4', 'panavision-primo']
    },
    {
      id: 'sony-f55',
      name: 'Sony F55',
      nameCn: '索尼F55型数字电影机',
      type: 'DIGITAL',
      year: 2013,
      format: 'Super 35 (4K)',
      sensor: 'Sony Super 35mm CMOS传感器 (24.0×12.7mm), 4096×2160有效像素, 14档动态范围',
      description: '索尼F55型数字电影机，4K CineAlta，可选配全局快门模式。支持4K RAW输出。代表作：《蜘蛛侠：英雄归来》、《自杀小队》、Netflix剧集。',
      famousFilms: ['蜘蛛侠：英雄归来', '自杀小队', 'Netflix剧集'],
      compatibleMounts: ['PL', 'FZ'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'sony-cinealta', 'sigma-cine-ff']
    },
    {
      id: 'sony-f65',
      name: 'Sony F65',
      nameCn: '索尼F65型旗舰数字电影机',
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 35 (8K)',
      sensor: 'Sony Super 35mm CMOS传感器 (24.7×13.1mm), 8192×4320有效像素, 14档动态范围',
      description: '索尼F65型旗舰数字电影机，8K传感器超采样输出4K，画质惊人。代表作：《遗落战境》、《极乐空间》、《超凡蜘蛛侠2》、《像素大战》。',
      famousFilms: ['遗落战境', '极乐空间', '超凡蜘蛛侠2', '像素大战'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s5', 'leica-summilux-c', 'sony-cinealta']
    },
    {
      id: 'sony-fs7',
      name: 'Sony PXW-FS7',
      nameCn: '索尼FS7型纪录片摄影机',
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      sensor: 'Sony Exmor CMOS传感器 (23.6×13.3mm), 4096×2160有效像素, 14档动态范围',
      description: '索尼FS7型纪录片摄影机，纪录片/电视剧工作马，性价比之王。人体工程学肩扛设计。代表作：BBC纪录片、Discovery频道、大量电视剧。',
      famousFilms: ['BBC纪录片', 'Discovery频道', '电视剧制作'],
      compatibleMounts: ['E'],
      compatibleLenses: ['sony-cinealta', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'sony-fs7-ii',
      name: 'Sony PXW-FS7 II',
      nameCn: '索尼FS7 II型纪录片摄影机',
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (4K)',
      sensor: 'Sony Exmor CMOS传感器 (23.6×13.3mm), 4096×2160有效像素, 14档动态范围',
      description: '索尼FS7 II型纪录片摄影机，FS7升级版，电子可变ND滤镜，改进的人体工程学。代表作：专业纪录片、企业视频、新闻采访。',
      famousFilms: ['专业纪录片', '企业视频', '新闻采访'],
      compatibleMounts: ['E'],
      compatibleLenses: ['sony-cinealta', 'sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'sony-fx6',
      name: 'Sony FX6',
      nameCn: '索尼FX6型全画幅紧凑电影机',
      type: 'DIGITAL',
      year: 2020,
      format: 'Full Frame (4K)',
      sensor: 'Sony Exmor R CMOS传感器 (35.6×23.8mm), 4256×2832有效像素, 15档动态范围',
      description: '索尼FX6型全画幅紧凑电影机，全画幅紧凑电影机，双原生ISO (800/12800)。代表作：婚礼电影、纪录片、YouTube专业内容。',
      famousFilms: ['婚礼电影', '纪录片', 'YouTube内容'],
      compatibleMounts: ['E'],
      compatibleLenses: ['sony-cinealta', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'sony-fx9',
      name: 'Sony PXW-FX9',
      nameCn: '索尼FX9型全画幅旗舰电影机',
      type: 'DIGITAL',
      year: 2019,
      format: 'Full Frame (6K)',
      sensor: 'Sony Exmor R CMOS传感器 (35.6×23.8mm), 6008×3168有效像素, 15档动态范围',
      description: '索尼FX9型全画幅旗舰电影机，全画幅旗舰，电子可变ND，快速混合自动对焦。代表作：《曼达洛人》(部分)、Netflix剧集、高端纪录片。',
      famousFilms: ['曼达洛人', 'Netflix剧集', '高端纪录片'],
      compatibleMounts: ['E'],
      compatibleLenses: ['sony-cinealta', 'zeiss-supreme-prime', 'sigma-cine-ff', 'cooke-s7']
    },
    {
      id: 'sony-venice',
      name: 'Sony Venice',
      nameCn: '索尼威尼斯型数字电影机',
      type: 'DIGITAL',
      year: 2017,
      format: 'Full Frame (6K)',
      sensor: 'Sony 36×24mm CMOS传感器, 6048×4032有效像素, 15档动态范围',
      description: '索尼威尼斯型数字电影机，好莱坞主流机型，双原生ISO 500/2500，可拆卸传感器模块。代表作：《小丑》(部分)、《猛毒》、《黑寡妇》、《尚气》。',
      famousFilms: ['小丑', '猛毒', '黑寡妇', '尚气', '永恒族'],
      compatibleMounts: ['PL', 'E'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'sony-cinealta', 'sigma-cine-ff']
    },
    {
      id: 'sony-venice-2',
      name: 'Sony Venice 2',
      nameCn: '索尼威尼斯2型旗舰数字电影机',
      type: 'DIGITAL',
      year: 2022,
      format: 'Full Frame (8.6K)',
      sensor: 'Sony 全画幅CMOS传感器, 8640×5760有效像素, 16档动态范围',
      description: '索尼威尼斯2型旗舰数字电影机，双ISO全画幅旗舰(800/3200)，内置X-OCN记录，可更换传感器块。代表作：《碟中谍7》、《夺宝奇兵5》、《海王2》。',
      famousFilms: ['碟中谍7', '夺宝奇兵5', '海王2', '速度与激情10'],
      compatibleMounts: ['PL', 'E'],
      compatibleLenses: ['zeiss-supreme-prime', 'cooke-s7', 'leica-summilux-c', 'sony-cinealta', 'sigma-cine-ff']
    },
    {
      id: 'sony-burano',
      name: 'Sony Burano',
      nameCn: '索尼布拉诺型便携电影机',
      type: 'DIGITAL',
      year: 2023,
      format: 'Full Frame (8.6K)',
      sensor: 'Sony 全画幅CMOS传感器, 8640×5760有效像素, 16档动态范围',
      description: '索尼布拉诺型便携电影机，Venice 2便携版，内置8档电子ND滤镜和5轴防抖，单人操作优化。代表作：2024年新片、高端纪录片。',
      famousFilms: ['2024年新片', '高端纪录片'],
      compatibleMounts: ['PL', 'E'],
      compatibleLenses: ['sony-cinealta', 'zeiss-supreme-prime', 'sigma-cine-ff', 'cooke-s7']
    },
    
    // ----- Canon 数字机系列 -----
    {
      id: 'canon-c100',
      name: 'Canon EOS C100',
      nameCn: '佳能C100型数字电影机',
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 35 (1080p)',
      sensor: 'Canon Super 35mm CMOS传感器 (24.6×13.8mm), 1920×1080有效像素, 12档动态范围',
      description: '佳能C100型数字电影机，Cinema EOS入门款，纪录片友好，小巧便携。代表作：独立纪录片、婚礼摄影、小型制作。',
      famousFilms: ['独立纪录片', '婚礼摄影'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['canon-cn-e', 'sigma-cine-ff', 'zeiss-cp2']
    },
    {
      id: 'canon-c100-ii',
      name: 'Canon EOS C100 Mark II',
      nameCn: '佳能C100 II型数字电影机',
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (1080p)',
      sensor: 'Canon Super 35mm CMOS传感器 (24.6×13.8mm), 1920×1080有效像素, 12档动态范围',
      description: '佳能C100 II型数字电影机，C100升级版，双像素CMOS AF快速对焦。代表作：纪录片、企业视频、新闻采访。',
      famousFilms: ['纪录片', '企业视频'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['canon-cn-e', 'sigma-cine-ff', 'zeiss-cp2']
    },
    {
      id: 'canon-c200',
      name: 'Canon EOS C200',
      nameCn: '佳能C200型数字电影机',
      type: 'DIGITAL',
      year: 2017,
      format: 'Super 35 (4K)',
      sensor: 'Canon Super 35mm CMOS传感器 (24.6×13.8mm), 4096×2160有效像素, 15档动态范围',
      description: '佳能C200型数字电影机，内录Cinema RAW Light格式，双像素AF。代表作：独立电影、MV、网络内容。',
      famousFilms: ['独立电影', 'MV制作'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['canon-cn-e', 'canon-sumire', 'sigma-cine-ff', 'zeiss-cp3']
    },
    {
      id: 'canon-c300',
      name: 'Canon EOS C300',
      nameCn: '佳能C300型数字电影机',
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 35 (4K)',
      sensor: 'Canon Super 35mm CMOS传感器 (24.6×13.8mm), 3840×2160有效像素, 12档动态范围',
      description: '佳能C300型数字电影机，Cinema EOS开山之作，好莱坞接受的第一批数字电影机之一。代表作：《铁娘子》、《地心引力》(部分)、大量电视剧。',
      famousFilms: ['铁娘子', '地心引力', '电视剧制作'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-cn-e', 'zeiss-cp2', 'cooke-s4']
    },
    {
      id: 'canon-c300-ii',
      name: 'Canon EOS C300 Mark II',
      nameCn: '佳能C300 II型数字电影机',
      type: 'DIGITAL',
      year: 2015,
      format: 'Super 35 (4K)',
      sensor: 'Canon Super 35mm CMOS传感器 (26.2×13.8mm), 4096×2160有效像素, 15档动态范围',
      description: '佳能C300 II型数字电影机，4K内录升级，15档动态范围，双像素AF。代表作：《美国犯罪故事》、Netflix剧集、高端纪录片。',
      famousFilms: ['美国犯罪故事', 'Netflix剧集', '高端纪录片'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-cn-e', 'canon-sumire', 'zeiss-cp3', 'sigma-cine-ff']
    },
    {
      id: 'canon-c300-iii',
      name: 'Canon EOS C300 Mark III',
      nameCn: '佳能C300 III型数字电影机',
      type: 'DIGITAL',
      year: 2020,
      format: 'Super 35 (4K DGO)',
      sensor: 'Canon Super 35mm 双增益CMOS传感器 (26.2×13.8mm), 4096×2160有效像素, 16档动态范围',
      description: '佳能C300 III型数字电影机，双增益输出HDR(DGO)，Cinema RAW Light内录。代表作：《黑袍纠察队》(部分)、高端电视剧。',
      famousFilms: ['黑袍纠察队', '高端电视剧'],
      compatibleMounts: ['PL', 'EF', 'RF'],
      compatibleLenses: ['canon-sumire', 'zeiss-cp3', 'sigma-cine-ff', 'dzofilm-vespid']
    },
    {
      id: 'canon-c500',
      name: 'Canon EOS C500',
      nameCn: '佳能C500型数字电影机',
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 35 (4K)',
      sensor: 'Canon Super 35mm CMOS传感器 (26.2×13.8mm), 4096×2160有效像素, 12档动态范围',
      description: '佳能C500型数字电影机，Cinema EOS首款4K RAW输出机型。代表作：《速度与激情7》、《美国狙击手》(部分)。',
      famousFilms: ['速度与激情7', '美国狙击手'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-cn-e', 'zeiss-master-prime', 'cooke-s4']
    },
    {
      id: 'canon-c500-ii',
      name: 'Canon EOS C500 Mark II',
      nameCn: '佳能C500 II型全画幅数字电影机',
      type: 'DIGITAL',
      year: 2019,
      format: 'Full Frame (5.9K)',
      sensor: 'Canon 全画幅CMOS传感器 (38.1×20.1mm), 5952×3140有效像素, 15档动态范围',
      description: '佳能C500 II型全画幅数字电影机，Canon旗舰全画幅电影机，模块化设计。代表作：高端广告、剧集、独立电影。',
      famousFilms: ['高端广告', '剧集制作'],
      compatibleMounts: ['PL', 'EF', 'RF'],
      compatibleLenses: ['canon-sumire', 'canon-k35', 'zeiss-cp3', 'sigma-cine-ff']
    },
    {
      id: 'canon-c700',
      name: 'Canon EOS C700',
      nameCn: '佳能C700型旗舰数字电影机',
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (4.5K)',
      sensor: 'Canon Super 35mm CMOS传感器 (26.2×13.8mm), 4512×2376有效像素, 15档动态范围',
      description: '佳能C700型旗舰数字电影机，Cinema EOS旗舰，模块化设计可配合各种配件。代表作：《美女与野兽》(2017部分)、高端电视剧。',
      famousFilms: ['美女与野兽', '高端电视剧'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-cn-e', 'canon-sumire', 'zeiss-master-prime', 'cooke-s5']
    },
    {
      id: 'canon-c700-ff',
      name: 'Canon EOS C700 FF',
      nameCn: '佳能C700全画幅数字电影机',
      type: 'DIGITAL',
      year: 2018,
      format: 'Full Frame (5.9K)',
      sensor: 'Canon 全画幅CMOS传感器 (38.1×20.1mm), 5952×3140有效像素, 15档动态范围',
      description: '佳能C700全画幅数字电影机，C700全画幅版本，与Alexa LF竞争。代表作：高端广告、剧集。',
      famousFilms: ['高端广告', '剧集制作'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['canon-sumire', 'zeiss-supreme-prime', 'cooke-s7', 'leica-thalia']
    },
    {
      id: 'canon-c70',
      name: 'Canon EOS C70',
      nameCn: '佳能C70型紧凑数字电影机',
      type: 'DIGITAL',
      year: 2020,
      format: 'Super 35 (4K DGO)',
      sensor: 'Canon Super 35mm 双增益CMOS传感器 (26.2×13.8mm), 4096×2160有效像素, 16档动态范围',
      description: '佳能C70型紧凑数字电影机，RF卡口Cinema EOS，紧凑型机身，双增益HDR。代表作：独立电影、纪录片、YouTube专业内容。',
      famousFilms: ['独立电影', '纪录片', 'YouTube内容'],
      compatibleMounts: ['RF'],
      compatibleLenses: ['canon-sumire', 'sigma-cine-ff', 'zeiss-cp3']
    },
    
    // ----- Blackmagic 数字机系列 -----
    {
      id: 'bmd-cinema-camera',
      name: 'Blackmagic Cinema Camera',
      nameCn: '黑魔法电影摄影机(初代)',
      type: 'DIGITAL',
      year: 2012,
      format: 'Super 16 (2.5K)',
      sensor: 'Fairchild CCD传感器 (15.6×8.8mm), 2432×1366有效像素, 13档动态范围',
      description: '黑魔法电影摄影机(初代)，BMD首款电影机，以不到3000美元价格打破行业壁垒，开启独立电影数字革命。代表作：无数独立电影、短片。',
      famousFilms: ['独立电影', '学生作品'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp2', 'samyang-xeen']
    },
    {
      id: 'bmd-production-4k',
      name: 'Blackmagic Production Camera 4K',
      nameCn: '黑魔法4K制作摄影机',
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      sensor: 'Sony CMOS传感器 (21.12×11.88mm), 4000×2160有效像素, 12档动态范围',
      description: '黑魔法4K制作摄影机，首款低于3000美元的4K电影机，全局快门。代表作：独立电影、MV、网络内容。',
      famousFilms: ['独立电影', 'MV制作'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp2', 'samyang-xeen']
    },
    {
      id: 'bmd-ursa',
      name: 'Blackmagic URSA',
      nameCn: '黑魔法URSA型数字电影机',
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      sensor: 'Sony CMOS传感器 (25.34×14.25mm), 4000×2160有效像素, 12档动态范围',
      description: '黑魔法URSA型数字电影机，URSA系列开山之作，大型机身可更换传感器模块，10.1英寸翻转屏。代表作：低预算电影、MV。',
      famousFilms: ['低预算电影', 'MV制作'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'bmd-ursa-mini-4k',
      name: 'Blackmagic URSA Mini 4K',
      nameCn: '黑魔法URSA迷你4K数字电影机',
      type: 'DIGITAL',
      year: 2015,
      format: 'Super 35 (4K)',
      sensor: 'Sony CMOS传感器 (25.34×14.25mm), 4000×2160有效像素, 12档动态范围',
      description: '黑魔法URSA迷你4K数字电影机，URSA Mini系列开创，更紧凑的机身设计。代表作：独立电影、纪录片。',
      famousFilms: ['独立电影', '纪录片'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'bmd-ursa-mini-pro',
      name: 'Blackmagic URSA Mini Pro',
      nameCn: '黑魔法URSA迷你专业型数字电影机',
      type: 'DIGITAL',
      year: 2017,
      format: 'Super 35 (4.6K)',
      sensor: 'Blackmagic CMOS传感器 (25.34×14.25mm), 4608×2592有效像素, 15档动态范围',
      description: '黑魔法URSA迷你专业型数字电影机，URSA Mini Pro系列，内置ND滤镜(2/4/6档)，15档动态范围。代表作：低预算剧情片、纪录片、广告。',
      famousFilms: ['低预算电影', '纪录片', '广告'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'cooke-s4', 'dzofilm-vespid']
    },
    {
      id: 'bmd-ursa-mini-pro-g2',
      name: 'Blackmagic URSA Mini Pro G2',
      nameCn: '黑魔法URSA迷你专业G2型数字电影机',
      type: 'DIGITAL',
      year: 2019,
      format: 'Super 35 (4.6K)',
      sensor: 'Blackmagic Gen4 CMOS传感器 (25.34×14.25mm), 4608×2592有效像素, 15档动态范围',
      description: '黑魔法URSA迷你专业G2型数字电影机，G2升级版，支持4.6K@120fps和300fps超高速。代表作：独立电影、高速摄影。',
      famousFilms: ['独立电影', '高速摄影'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'cooke-s4', 'dzofilm-vespid']
    },
    {
      id: 'blackmagic-ursa-12k',
      name: 'Blackmagic URSA Mini Pro 12K',
      nameCn: '黑魔法URSA迷你专业12K数字电影机',
      type: 'DIGITAL',
      year: 2020,
      format: 'Super 35 (12K)',
      sensor: 'Blackmagic 12K RGBW传感器 (27.03×14.25mm), 12288×6480有效像素, 14档动态范围',
      description: '黑魔法URSA迷你专业12K数字电影机，革命性12K分辨率，RGBW传感器设计，支持12K@60fps。代表作：VFX制作、高端广告、实验电影。',
      famousFilms: ['VFX制作', '高端广告'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-cp3', 'sigma-cine-ff', 'dzofilm-vespid']
    },
    {
      id: 'bmd-pocket-4k',
      name: 'Blackmagic Pocket Cinema Camera 4K',
      nameCn: '黑魔法口袋电影机4K',
      type: 'DIGITAL',
      year: 2018,
      format: 'Micro 4/3 (4K)',
      sensor: 'Blackmagic Micro 4/3 CMOS传感器 (18.96×10mm), 4096×2160有效像素, 13档动态范围',
      description: '黑魔法口袋电影机4K，口袋4K神机，独立电影革命的延续，仅售1295美元的专业电影机。代表作：无数YouTube内容、独立短片、微电影。',
      famousFilms: ['YouTube内容', '独立短片', '微电影'],
      compatibleMounts: ['MFT'],
      compatibleLenses: ['sigma-cine-ff', 'dzofilm-vespid', 'meike-cine']
    },
    {
      id: 'bmd-pocket-6k',
      name: 'Blackmagic Pocket Cinema Camera 6K',
      nameCn: '黑魔法口袋电影机6K',
      type: 'DIGITAL',
      year: 2019,
      format: 'Super 35 (6K)',
      sensor: 'Blackmagic Super 35mm CMOS传感器 (23.10×12.99mm), 6144×3456有效像素, 13档动态范围',
      description: '黑魔法口袋电影机6K，口袋6K，EF卡口版本，2495美元获得Super 35mm 6K画质。代表作：独立电影、婚礼摄影、YouTube高端内容。',
      famousFilms: ['独立电影', '婚礼摄影', 'YouTube内容'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'bmd-pocket-6k-pro',
      name: 'Blackmagic Pocket Cinema Camera 6K Pro',
      nameCn: '黑魔法口袋电影机6K专业版',
      type: 'DIGITAL',
      year: 2021,
      format: 'Super 35 (6K)',
      sensor: 'Blackmagic Super 35mm CMOS传感器 (23.10×12.99mm), 6144×3456有效像素, 13档动态范围',
      description: '黑魔法口袋电影机6K专业版，Pocket Pro版，内置2/4/6档ND滤镜，更大电池，倾斜屏幕。代表作：专业独立制作、纪录片。',
      famousFilms: ['专业独立制作', '纪录片'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'bmd-pocket-6k-g2',
      name: 'Blackmagic Pocket Cinema Camera 6K G2',
      nameCn: '黑魔法口袋电影机6K G2版',
      type: 'DIGITAL',
      year: 2022,
      format: 'Super 35 (6K)',
      sensor: 'Blackmagic Super 35mm CMOS传感器 (23.10×12.99mm), 6144×3456有效像素, 13档动态范围',
      description: '黑魔法口袋电影机6K G2版，G2更新版，更大3.5英寸HDR触摸屏，改进散热设计。代表作：独立电影、内容创作。',
      famousFilms: ['独立电影', '内容创作'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    
    // ----- Panasonic 数字机系列 -----
    {
      id: 'panasonic-varicam',
      name: 'Panasonic VariCam',
      nameCn: '松下VariCam型数字电影机',
      type: 'DIGITAL',
      year: 2002,
      format: 'Super 35 (1080p)',
      sensor: '2/3英寸3CCD传感器 (9.6×5.4mm), 1920×1080有效像素',
      description: '松下VariCam型数字电影机，VariCam系列开山之作，首创可变帧率(1-60fps)设计，奠定专业数字摄像机地位。代表作：早期高清电视剧、纪录片。',
      famousFilms: ['早期高清电视剧', '纪录片'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'panavision-primo']
    },
    {
      id: 'panasonic-varicam-35',
      name: 'Panasonic VariCam 35',
      nameCn: '松下VariCam 35型数字电影机',
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      sensor: 'Panasonic Super 35mm MOS传感器 (24.6×13.8mm), 4096×2160有效像素, 14档动态范围',
      description: '松下VariCam 35型数字电影机，4K VariCam，双原生ISO (800/5000)，V-Log色彩空间。代表作：《行尸走肉》、《绝命毒师》(部分)。',
      famousFilms: ['行尸走肉', '绝命毒师', 'HBO剧集'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'cooke-s5', 'sigma-cine-ff']
    },
    {
      id: 'panasonic-varicam-lt',
      name: 'Panasonic VariCam LT',
      nameCn: '松下VariCam LT型轻便数字电影机',
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (4K)',
      sensor: 'Panasonic Super 35mm MOS传感器 (24.6×13.8mm), 4096×2160有效像素, 14档动态范围',
      description: '松下VariCam LT型轻便数字电影机，VariCam轻量版(2.9kg)，机动性强，适合稳定器和无人机。代表作：纪录片、企业视频、小型剧组。',
      famousFilms: ['纪录片', '企业视频'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['zeiss-cp3', 'sigma-cine-ff', 'cooke-s4']
    },
    {
      id: 'panasonic-varicam-pure',
      name: 'Panasonic VariCam Pure',
      nameCn: '松下VariCam Pure型RAW记录模块',
      type: 'DIGITAL',
      year: 2016,
      format: 'Super 35 (4K)',
      sensor: 'Panasonic Super 35mm MOS传感器 (24.6×13.8mm), 4096×2160有效像素, 14档动态范围',
      description: '松下VariCam Pure型RAW记录模块，VariCam 4K RAW记录版本，支持CODEX V-RAW记录器直连。代表作：高端后期项目。',
      famousFilms: ['高端后期项目'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s4', 'cooke-s5']
    },
    {
      id: 'panasonic-eva1',
      name: 'Panasonic AU-EVA1',
      nameCn: '松下EVA1型紧凑数字电影机',
      type: 'DIGITAL',
      year: 2017,
      format: 'Super 35 (5.7K)',
      sensor: 'Panasonic Super 35mm MOS传感器 (25.28×13.37mm), 5720×3016有效像素, 14档动态范围',
      description: '松下EVA1型紧凑数字电影机，紧凑型5.7K电影机，双原生ISO (800/2500)，EF卡口，纪录片首选。代表作：纪录片、低预算剧情片。',
      famousFilms: ['纪录片', '低预算电影'],
      compatibleMounts: ['EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    
    // ----- Panavision 数字机系列 -----
    {
      id: 'panavision-genesis',
      name: 'Panavision Genesis',
      nameCn: '潘那维申创世纪型数字电影机',
      type: 'DIGITAL',
      year: 2004,
      format: 'Super 35 (1080p)',
      sensor: 'Sony Super 35mm CCD传感器 (23.6×13.3mm), 1920×1080有效像素, 10档动态范围',
      description: '潘那维申创世纪型数字电影机，首款Panavision数字机，基于Sony F900改进。代表作：《迈阿密风云》、《超人归来》、《佐迪亚克》。',
      famousFilms: ['迈阿密风云', '超人归来', '佐迪亚克', '点球成金'],
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo', 'panavision-primo-70', 'panavision-anamorphic-e']
    },
    {
      id: 'panavision-dxl',
      name: 'Panavision Millennium DXL',
      nameCn: '潘那维申千禧DXL型大画幅数字电影机',
      type: 'DIGITAL',
      year: 2016,
      format: 'Large Format (8K)',
      sensor: 'RED Monstro CMOS传感器 (40.96×21.60mm), 8192×4320有效像素, 16档动态范围',
      description: '潘那维申千禧DXL型大画幅数字电影机，采用RED Monstro传感器配合Panavision独家色彩科学Light Iron。代表作：《自杀小队》、《神奇女侠》。',
      famousFilms: ['自杀小队', '神奇女侠', 'HBO剧集'],
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo-70', 'panavision-anamorphic-g', 'panavision-system-65']
    },
    {
      id: 'panavision-dxl2',
      name: 'Panavision Millennium DXL2',
      nameCn: '潘那维申千禧DXL2型大画幅数字电影机',
      type: 'DIGITAL',
      year: 2018,
      format: 'Large Format (8K)',
      sensor: 'RED Monstro CMOS传感器 (40.96×21.60mm), 8192×4320有效像素, 17档动态范围',
      description: '潘那维申千禧DXL2型大画幅数字电影机，DXL升级版，Light Iron色彩管理流程，好莱坞大片首选之一。代表作：《好莱坞往事》、《黑客帝国4》、《蜘蛛侠：英雄无归》。',
      famousFilms: ['好莱坞往事', '黑客帝国4', '蜘蛛侠：英雄无归', '神奇女侠1984'],
      compatibleMounts: ['PV'],
      compatibleLenses: ['panavision-primo-70', 'panavision-anamorphic-g', 'panavision-system-65', 'panavision-ultra-vista']
    },
    
    // ----- 其他品牌数字机 -----
    {
      id: 'kinefinity-mavo-lf',
      name: 'Kinefinity MAVO LF',
      nameCn: '卓曜MAVO大画幅数字电影机',
      type: 'DIGITAL',
      year: 2018,
      format: 'Large Format (6K)',
      sensor: 'Kinefinity 大画幅CMOS传感器 (36×19mm), 6016×3172有效像素, 14档动态范围',
      description: '卓曜MAVO大画幅数字电影机，中国品牌大画幅电影机，性价比出色。代表作：中国独立电影、低预算剧情片。',
      famousFilms: ['中国独立电影', '低预算制作'],
      compatibleMounts: ['PL', 'EF', 'E'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'kinefinity-mavo-edge-8k',
      name: 'Kinefinity MAVO Edge 8K',
      nameCn: '卓曜MAVO Edge 8K数字电影机',
      type: 'DIGITAL',
      year: 2021,
      format: 'Full Frame (8K)',
      sensor: 'Kinefinity 全画幅CMOS传感器 (36×24mm), 8192×5456有效像素, 14档动态范围',
      description: '卓曜MAVO Edge 8K数字电影机，8K全画幅中国制造电影机，支持ProRes RAW。代表作：中国影视制作、高端广告。',
      famousFilms: ['中国影视制作', '高端广告'],
      compatibleMounts: ['PL', 'EF', 'E'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid', 'zeiss-supreme-prime']
    },
    {
      id: 'z-cam-e2-f8',
      name: 'Z CAM E2-F8',
      nameCn: 'Z CAM E2-F8型全画幅数字电影机',
      type: 'DIGITAL',
      year: 2020,
      format: 'Full Frame (8K)',
      sensor: 'Z CAM 全画幅CMOS传感器 (35.8×23.8mm), 8192×4320有效像素, 14档动态范围',
      description: 'Z CAM E2-F8型全画幅数字电影机，全画幅8K紧凑机身，中国深圳制造。代表作：VR制作、多机位拍摄。',
      famousFilms: ['VR制作', '多机位拍摄'],
      compatibleMounts: ['PL', 'EF'],
      compatibleLenses: ['sigma-cine-ff', 'zeiss-cp3', 'dzofilm-vespid']
    },
    {
      id: 'phantom-flex4k',
      name: 'Phantom Flex4K',
      nameCn: '幻影Flex4K型高速摄影机',
      type: 'DIGITAL',
      year: 2014,
      format: 'Super 35 (4K)',
      sensor: 'Vision Research CMOS传感器 (27.6×15.5mm), 4096×2304有效像素, 12档动态范围',
      description: '幻影Flex4K型高速摄影机，高速摄影之王，支持4K@1000fps和1080p@2000fps。代表作：所有需要超级慢动作的好莱坞大片、体育转播、科学影像。',
      famousFilms: ['复仇者联盟', '变形金刚', 'BBC地球脉动', '体育转播'],
      compatibleMounts: ['PL'],
      compatibleLenses: ['zeiss-master-prime', 'cooke-s5', 'arri-signature-prime']
    },

    // ==================== 照相机 (CAMERA) ====================
    // ===== Nikon 尼康系列 =====
    {
      id: 'nikon-f3',
      name: 'Nikon F3',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Nikon',
      year: 1980,
      format: '35mm Film',
      description: '传奇专业胶片单反，NASA太空任务用机',
      focalLengths: [24, 28, 35, 50, 85, 105, 135, 180],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'warm-tone', 'vintage-color', 'natural-bokeh'],
      promptBase: 'shot on Nikon F3 35mm film camera'
    },
    {
      id: 'nikon-fm2',
      name: 'Nikon FM2',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Nikon',
      year: 1982,
      format: '35mm Film',
      description: '经典机械胶片单反，1/4000快门',
      focalLengths: [24, 28, 35, 50, 85, 105, 135],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'warm-tone', 'vintage-color'],
      promptBase: 'shot on Nikon FM2 film camera, classic film photography'
    },
    {
      id: 'nikon-d850',
      name: 'Nikon D850',
      type: 'CAMERA',
      subtype: 'dslr',
      brand: 'Nikon',
      year: 2017,
      format: 'Full Frame (45.7MP)',
      description: '全画幅旗舰单反，高像素高速度',
      focalLengths: [14, 20, 24, 28, 35, 50, 58, 85, 105, 135, 200],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0, 11],
      availableEffects: ['sharp-detail', 'natural-color', 'bokeh'],
      promptBase: 'shot on Nikon D850, professional DSLR photography'
    },
    {
      id: 'nikon-z9',
      name: 'Nikon Z9',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Nikon',
      year: 2021,
      format: 'Full Frame (45.7MP)',
      description: '旗舰无反相机，8K视频，120fps连拍',
      focalLengths: [14, 20, 24, 28, 35, 50, 58, 85, 105, 135, 200, 400],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['sharp-detail', 'natural-color', 'silky-bokeh'],
      promptBase: 'shot on Nikon Z9, flagship mirrorless camera'
    },
    {
      id: 'nikon-z6-iii',
      name: 'Nikon Z6 III',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Nikon',
      year: 2024,
      format: 'Full Frame (24.5MP)',
      description: '全画幅无反，部分堆栈式传感器',
      focalLengths: [14, 20, 24, 28, 35, 50, 85, 135],
      apertures: [1.4, 1.8, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['natural-color', 'bokeh', 'low-light'],
      promptBase: 'shot on Nikon Z6 III mirrorless camera'
    },

    // ===== Canon 佳能系列 =====
    {
      id: 'canon-ae1',
      name: 'Canon AE-1',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Canon',
      year: 1976,
      format: '35mm Film',
      description: '划时代胶片单反，开创自动曝光',
      focalLengths: [24, 28, 35, 50, 85, 100, 135, 200],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'vintage-color', 'warm-tone', 'soft-glow'],
      promptBase: 'shot on Canon AE-1 film camera, vintage photography'
    },
    {
      id: 'canon-eos-1v',
      name: 'Canon EOS-1V',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Canon',
      year: 2000,
      format: '35mm Film',
      description: '最后的旗舰胶片单反，专业级性能',
      focalLengths: [14, 20, 24, 28, 35, 50, 85, 100, 135, 200, 300],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'professional-color', 'sharp-detail'],
      promptBase: 'shot on Canon EOS-1V professional film camera'
    },
    {
      id: 'canon-5d-mark-iv',
      name: 'Canon 5D Mark IV',
      type: 'CAMERA',
      subtype: 'dslr',
      brand: 'Canon',
      year: 2016,
      format: 'Full Frame (30.4MP)',
      description: '全画幅单反经典，摄影师首选',
      focalLengths: [16, 24, 35, 50, 85, 100, 135, 200],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['canon-color', 'natural-skin', 'bokeh'],
      promptBase: 'shot on Canon 5D Mark IV, professional photography'
    },
    {
      id: 'canon-eos-r5',
      name: 'Canon EOS R5',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Canon',
      year: 2020,
      format: 'Full Frame (45MP)',
      description: '旗舰无反，8K视频，强大对焦',
      focalLengths: [14, 24, 28, 35, 50, 85, 100, 135, 200],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['sharp-detail', 'canon-color', 'creamy-bokeh'],
      promptBase: 'shot on Canon EOS R5, flagship mirrorless'
    },
    {
      id: 'canon-eos-r3',
      name: 'Canon EOS R3',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Canon',
      year: 2021,
      format: 'Full Frame (24.1MP)',
      description: '高速旗舰无反，眼控对焦，30fps连拍',
      focalLengths: [14, 24, 35, 50, 85, 135, 200, 400, 600],
      apertures: [1.2, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['action-freeze', 'canon-color', 'bokeh'],
      promptBase: 'shot on Canon EOS R3, professional sports photography'
    },

    // ===== Sony 索尼系列 =====
    {
      id: 'sony-a7r-v',
      name: 'Sony A7R V',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Sony',
      year: 2022,
      format: 'Full Frame (61MP)',
      description: '高像素旗舰，AI对焦，8档防抖',
      focalLengths: [12, 14, 20, 24, 35, 50, 85, 100, 135, 200],
      apertures: [1.2, 1.4, 1.8, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['ultra-sharp', 'natural-color', 'silky-bokeh'],
      promptBase: 'shot on Sony A7R V, high resolution photography'
    },
    {
      id: 'sony-a9-iii',
      name: 'Sony A9 III',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Sony',
      year: 2023,
      format: 'Full Frame (24.6MP)',
      description: '全局快门无反，无果冻效应，120fps',
      focalLengths: [14, 24, 35, 50, 70, 85, 135, 200, 400, 600],
      apertures: [1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['action-freeze', 'global-shutter', 'natural-color'],
      promptBase: 'shot on Sony A9 III with global shutter'
    },
    {
      id: 'sony-a7c-ii',
      name: 'Sony A7C II',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Sony',
      year: 2023,
      format: 'Full Frame (33MP)',
      description: '紧凑全画幅，街拍利器',
      focalLengths: [20, 24, 35, 40, 50, 85],
      apertures: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6],
      availableEffects: ['street-photo', 'natural-color', 'bokeh'],
      promptBase: 'shot on Sony A7C II, compact full-frame'
    },

    // ===== Fujifilm 富士系列 =====
    {
      id: 'fuji-x100vi',
      name: 'Fujifilm X100VI',
      type: 'CAMERA',
      subtype: 'compact',
      brand: 'Fujifilm',
      year: 2024,
      format: 'APS-C (40.2MP)',
      description: '经典旁轴造型，23mm f/2定焦，胶片模拟',
      focalLengths: [23],
      apertures: [2.0, 2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['fuji-film-sim', 'classic-chrome', 'acros', 'velvia', 'provia', 'astia'],
      promptBase: 'shot on Fujifilm X100VI, film simulation'
    },
    {
      id: 'fuji-x-t5',
      name: 'Fujifilm X-T5',
      type: 'CAMERA',
      subtype: 'mirrorless',
      brand: 'Fujifilm',
      year: 2022,
      format: 'APS-C (40.2MP)',
      description: '复古无反，强大胶片模拟',
      focalLengths: [14, 16, 18, 23, 27, 33, 35, 50, 56, 80, 90],
      apertures: [1.2, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['fuji-film-sim', 'classic-chrome', 'classic-neg', 'acros', 'nostalgic-neg'],
      promptBase: 'shot on Fujifilm X-T5 with film simulation'
    },
    {
      id: 'fuji-gfx-100s-ii',
      name: 'Fujifilm GFX100S II',
      type: 'CAMERA',
      subtype: 'medium-format',
      brand: 'Fujifilm',
      year: 2024,
      format: 'Medium Format (102MP)',
      description: '中画幅旗舰，超高画质',
      focalLengths: [23, 30, 32, 45, 50, 63, 80, 100, 110, 250],
      apertures: [1.7, 2.0, 2.8, 3.5, 4.0, 5.6, 8.0],
      availableEffects: ['medium-format-look', 'fuji-film-sim', 'ultra-detail', 'shallow-dof'],
      promptBase: 'shot on Fujifilm GFX100S II medium format'
    },

    // ===== Hasselblad 哈苏系列 =====
    {
      id: 'hasselblad-500cm',
      name: 'Hasselblad 500C/M',
      type: 'CAMERA',
      subtype: 'film-medium',
      brand: 'Hasselblad',
      year: 1970,
      format: '6x6cm Film',
      description: '传奇中画幅胶片机，登月相机',
      focalLengths: [40, 50, 60, 80, 100, 120, 150, 180, 250],
      apertures: [2.8, 4.0, 5.6, 8.0, 11, 16, 22],
      availableEffects: ['medium-format-film', 'square-format', 'zeiss-rendering', 'film-grain'],
      promptBase: 'shot on Hasselblad 500C/M, medium format film'
    },
    {
      id: 'hasselblad-x2d',
      name: 'Hasselblad X2D 100C',
      type: 'CAMERA',
      subtype: 'medium-format',
      brand: 'Hasselblad',
      year: 2022,
      format: 'Medium Format (100MP)',
      description: '顶级中画幅无反，1TB内置存储',
      focalLengths: [21, 25, 30, 38, 45, 55, 65, 80, 90, 120],
      apertures: [2.5, 2.8, 3.2, 3.5, 4.0, 5.6, 8.0],
      availableEffects: ['hasselblad-color', 'medium-format-look', 'ultra-detail'],
      promptBase: 'shot on Hasselblad X2D 100C, premium medium format'
    },

    // ===== Leica 徕卡系列 =====
    {
      id: 'leica-m6',
      name: 'Leica M6',
      type: 'CAMERA',
      subtype: 'film-rangefinder',
      brand: 'Leica',
      year: 1984,
      format: '35mm Film',
      description: '经典旁轴胶片机，街拍圣器',
      focalLengths: [21, 24, 28, 35, 50, 75, 90, 135],
      apertures: [1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['leica-rendering', 'film-grain', 'classic-contrast', 'street-photo'],
      promptBase: 'shot on Leica M6 film camera, street photography'
    },
    {
      id: 'leica-m11',
      name: 'Leica M11',
      type: 'CAMERA',
      subtype: 'rangefinder',
      brand: 'Leica',
      year: 2022,
      format: 'Full Frame (60MP)',
      description: '现代数码旁轴，三重分辨率',
      focalLengths: [21, 24, 28, 35, 50, 75, 90, 135],
      apertures: [1.4, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['leica-rendering', 'high-contrast', 'street-photo'],
      promptBase: 'shot on Leica M11, rangefinder photography'
    },
    {
      id: 'leica-q3',
      name: 'Leica Q3',
      type: 'CAMERA',
      subtype: 'compact',
      brand: 'Leica',
      year: 2023,
      format: 'Full Frame (60MP)',
      description: '全画幅便携机，28mm Summilux定焦',
      focalLengths: [28],
      apertures: [1.7, 2.0, 2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['leica-rendering', 'summilux-bokeh', 'street-photo'],
      promptBase: 'shot on Leica Q3 with 28mm Summilux'
    },

    // ===== Pentax 宾得系列 =====
    {
      id: 'pentax-k1000',
      name: 'Pentax K1000',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Pentax',
      year: 1976,
      format: '35mm Film',
      description: '入门胶片单反经典，简单可靠',
      focalLengths: [28, 35, 50, 85, 135, 200],
      apertures: [1.4, 1.7, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'vintage-color', 'warm-tone'],
      promptBase: 'shot on Pentax K1000 film camera'
    },
    {
      id: 'pentax-67',
      name: 'Pentax 67',
      type: 'CAMERA',
      subtype: 'film-medium',
      brand: 'Pentax',
      year: 1969,
      format: '6x7cm Film',
      description: '中画幅胶片机，人像神器',
      focalLengths: [45, 55, 75, 90, 105, 135, 165, 200, 300],
      apertures: [2.4, 2.8, 4.0, 5.6, 8.0, 11, 16, 22],
      availableEffects: ['medium-format-film', 'portrait-rendering', 'film-grain', 'shallow-dof'],
      promptBase: 'shot on Pentax 67 medium format film'
    },

    // ===== Olympus 奥林巴斯系列 =====
    {
      id: 'olympus-om1',
      name: 'Olympus OM-1',
      type: 'CAMERA',
      subtype: 'film-slr',
      brand: 'Olympus',
      year: 1972,
      format: '35mm Film',
      description: '轻量化胶片单反先驱',
      focalLengths: [21, 24, 28, 35, 50, 85, 100, 135, 180],
      apertures: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
      availableEffects: ['film-grain', 'zuiko-rendering', 'compact-slr'],
      promptBase: 'shot on Olympus OM-1 film camera'
    },

    // ===== CCD时代经典数码相机 =====
    {
      id: 'sony-dsc-rx1',
      name: 'Sony DSC-RX1',
      type: 'CAMERA',
      subtype: 'compact',
      brand: 'Sony',
      year: 2012,
      format: 'Full Frame (24.3MP)',
      description: '首款全画幅便携机，35mm Zeiss定焦',
      focalLengths: [35],
      apertures: [2.0, 2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['zeiss-rendering', 'full-frame-compact', 'bokeh'],
      promptBase: 'shot on Sony RX1, full-frame compact camera'
    },
    {
      id: 'ricoh-gr-iii',
      name: 'Ricoh GR III',
      type: 'CAMERA',
      subtype: 'compact',
      brand: 'Ricoh',
      year: 2019,
      format: 'APS-C (24.2MP)',
      description: '口袋街拍机，28mm定焦',
      focalLengths: [28],
      apertures: [2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['street-photo', 'high-contrast-bw', 'positive-film', 'snap-focus'],
      promptBase: 'shot on Ricoh GR III, street photography'
    },
    {
      id: 'contax-t2',
      name: 'Contax T2',
      type: 'CAMERA',
      subtype: 'film-compact',
      brand: 'Contax',
      year: 1990,
      format: '35mm Film',
      description: '钛合金胶片便携机，Zeiss 38mm f/2.8',
      focalLengths: [38],
      apertures: [2.8, 4.0, 5.6, 8.0, 11, 16],
      availableEffects: ['film-grain', 'zeiss-rendering', 'premium-compact', 'soft-glow'],
      promptBase: 'shot on Contax T2 film camera, Zeiss lens'
    },
    {
      id: 'nikon-coolpix-p1000',
      name: 'Nikon Coolpix P1000',
      type: 'CAMERA',
      subtype: 'bridge',
      brand: 'Nikon',
      year: 2018,
      format: '1/2.3" (16MP)',
      description: '125倍光学变焦，超长焦便携机',
      focalLengths: [24, 35, 50, 100, 200, 500, 1000, 2000, 3000],
      apertures: [2.8, 4.0, 5.6, 8.0],
      availableEffects: ['super-telephoto', 'moon-shot', 'wildlife'],
      promptBase: 'shot on Nikon P1000, extreme telephoto'
    },

    // ==================== 手机 (PHONE) ====================
    // ===== iPhone 系列 =====
    {
      id: 'iphone-15-pro-max',
      name: 'iPhone 15 Pro Max',
      type: 'PHONE',
      brand: 'Apple',
      year: 2023,
      sensor: '48MP Main',
      description: '5倍四棱镜长焦，ProRAW，Log视频',
      focalLengths: [13, 24, 35, 48, 77, 120],
      apertures: [1.78, 2.2, 2.8],
      availableEffects: ['photographic-styles', 'portrait-mode', 'night-mode', 'cinematic-mode', 'prores-log'],
      promptBase: 'shot on iPhone 15 Pro Max'
    },
    {
      id: 'iphone-14-pro',
      name: 'iPhone 14 Pro',
      type: 'PHONE',
      brand: 'Apple',
      year: 2022,
      sensor: '48MP Main',
      description: '首款4800万像素iPhone，灵动岛',
      focalLengths: [13, 24, 48, 77],
      apertures: [1.78, 2.2, 2.8],
      availableEffects: ['photographic-styles', 'portrait-mode', 'night-mode', 'cinematic-mode'],
      promptBase: 'shot on iPhone 14 Pro'
    },
    {
      id: 'iphone-13-pro',
      name: 'iPhone 13 Pro',
      type: 'PHONE',
      brand: 'Apple',
      year: 2021,
      sensor: '12MP',
      description: '电影效果模式，ProRes视频',
      focalLengths: [13, 26, 77],
      apertures: [1.5, 1.8, 2.8],
      availableEffects: ['portrait-mode', 'night-mode', 'cinematic-mode', 'macro'],
      promptBase: 'shot on iPhone 13 Pro'
    },
    {
      id: 'iphone-12-pro',
      name: 'iPhone 12 Pro',
      type: 'PHONE',
      brand: 'Apple',
      year: 2020,
      sensor: '12MP',
      description: 'LiDAR扫描，杜比视界HDR',
      focalLengths: [13, 26, 52],
      apertures: [1.6, 2.0, 2.4],
      availableEffects: ['portrait-mode', 'night-mode', 'deep-fusion'],
      promptBase: 'shot on iPhone 12 Pro'
    },
    {
      id: 'iphone-11-pro',
      name: 'iPhone 11 Pro',
      type: 'PHONE',
      brand: 'Apple',
      year: 2019,
      sensor: '12MP',
      description: '首款三摄iPhone，夜间模式',
      focalLengths: [13, 26, 52],
      apertures: [1.8, 2.0, 2.4],
      availableEffects: ['portrait-mode', 'night-mode', 'smart-hdr'],
      promptBase: 'shot on iPhone 11 Pro'
    },
    {
      id: 'iphone-x',
      name: 'iPhone X',
      type: 'PHONE',
      brand: 'Apple',
      year: 2017,
      sensor: '12MP',
      description: '首款全面屏iPhone，人像光效',
      focalLengths: [28, 52],
      apertures: [1.8, 2.4],
      availableEffects: ['portrait-mode', 'portrait-lighting'],
      promptBase: 'shot on iPhone X'
    },
    {
      id: 'iphone-7-plus',
      name: 'iPhone 7 Plus',
      type: 'PHONE',
      brand: 'Apple',
      year: 2016,
      sensor: '12MP',
      description: '首款双摄iPhone，人像模式',
      focalLengths: [28, 56],
      apertures: [1.8, 2.8],
      availableEffects: ['portrait-mode'],
      promptBase: 'shot on iPhone 7 Plus, portrait mode'
    },
    {
      id: 'iphone-4',
      name: 'iPhone 4',
      type: 'PHONE',
      brand: 'Apple',
      year: 2010,
      sensor: '5MP',
      description: 'Retina显示屏，HDR拍照',
      focalLengths: [30],
      apertures: [2.8],
      availableEffects: ['hdr', 'vintage-phone'],
      promptBase: 'shot on iPhone 4, vintage smartphone photo'
    },

    // ===== Samsung Galaxy 系列 =====
    {
      id: 'samsung-s24-ultra',
      name: 'Samsung Galaxy S24 Ultra',
      type: 'PHONE',
      brand: 'Samsung',
      year: 2024,
      sensor: '200MP Main',
      description: '2亿像素，5倍光学变焦，AI增强',
      focalLengths: [13, 23, 50, 115],
      apertures: [1.7, 2.2, 2.4, 3.4],
      availableEffects: ['ai-photo', 'nightography', 'portrait-mode', 'expert-raw', '100x-zoom'],
      promptBase: 'shot on Samsung Galaxy S24 Ultra'
    },
    {
      id: 'samsung-s23-ultra',
      name: 'Samsung Galaxy S23 Ultra',
      type: 'PHONE',
      brand: 'Samsung',
      year: 2023,
      sensor: '200MP Main',
      description: '2亿像素，10倍光学变焦',
      focalLengths: [13, 23, 70, 230],
      apertures: [1.7, 2.2, 2.4, 4.9],
      availableEffects: ['nightography', 'portrait-mode', 'expert-raw', 'space-zoom'],
      promptBase: 'shot on Samsung Galaxy S23 Ultra'
    },
    {
      id: 'samsung-s21-ultra',
      name: 'Samsung Galaxy S21 Ultra',
      type: 'PHONE',
      brand: 'Samsung',
      year: 2021,
      sensor: '108MP Main',
      description: '1亿像素，双长焦系统',
      focalLengths: [13, 26, 72, 240],
      apertures: [1.8, 2.2, 2.4, 4.9],
      availableEffects: ['portrait-mode', 'night-mode', '100x-zoom'],
      promptBase: 'shot on Samsung Galaxy S21 Ultra'
    },

    // ===== Google Pixel 系列 =====
    {
      id: 'pixel-8-pro',
      name: 'Google Pixel 8 Pro',
      type: 'PHONE',
      brand: 'Google',
      year: 2023,
      sensor: '50MP Main',
      description: 'Tensor G3芯片，AI摄影标杆',
      focalLengths: [14, 25, 48, 113],
      apertures: [1.68, 1.95, 2.8],
      availableEffects: ['magic-eraser', 'photo-unblur', 'night-sight', 'astrophotography', 'best-take'],
      promptBase: 'shot on Google Pixel 8 Pro, computational photography'
    },
    {
      id: 'pixel-7-pro',
      name: 'Google Pixel 7 Pro',
      type: 'PHONE',
      brand: 'Google',
      year: 2022,
      sensor: '50MP Main',
      description: '计算摄影标杆，超分辨率变焦',
      focalLengths: [14, 25, 48, 120],
      apertures: [1.85, 2.2, 3.5],
      availableEffects: ['magic-eraser', 'night-sight', 'astrophotography', 'real-tone'],
      promptBase: 'shot on Google Pixel 7 Pro'
    },
    {
      id: 'pixel-6-pro',
      name: 'Google Pixel 6 Pro',
      type: 'PHONE',
      brand: 'Google',
      year: 2021,
      sensor: '50MP Main',
      description: '首款Tensor芯片，Magic Eraser',
      focalLengths: [14, 25, 104],
      apertures: [1.85, 2.2, 3.5],
      availableEffects: ['magic-eraser', 'night-sight', 'motion-mode'],
      promptBase: 'shot on Google Pixel 6 Pro'
    },

    // ===== Huawei 华为系列 =====
    {
      id: 'huawei-p60-pro',
      name: 'Huawei P60 Pro',
      type: 'PHONE',
      brand: 'Huawei',
      year: 2023,
      sensor: '48MP Main',
      description: 'XMAGE影像，可变光圈',
      focalLengths: [13, 24, 90],
      apertures: [1.4, 2.2, 2.8],
      availableEffects: ['xmage-color', 'variable-aperture', 'night-mode'],
      promptBase: 'shot on Huawei P60 Pro, XMAGE imaging'
    },
    {
      id: 'huawei-mate-60-pro',
      name: 'Huawei Mate 60 Pro',
      type: 'PHONE',
      brand: 'Huawei',
      year: 2023,
      sensor: '50MP Main',
      description: '卫星通话，超感知影像',
      focalLengths: [13, 24, 90],
      apertures: [1.4, 2.2, 2.8],
      availableEffects: ['xmage-color', 'portrait-mode', 'night-mode'],
      promptBase: 'shot on Huawei Mate 60 Pro'
    },
    {
      id: 'huawei-p40-pro',
      name: 'Huawei P40 Pro',
      type: 'PHONE',
      brand: 'Huawei',
      year: 2020,
      sensor: '50MP Main',
      description: '徕卡四摄，RYYB传感器',
      focalLengths: [18, 23, 125],
      apertures: [1.9, 2.2, 3.4],
      availableEffects: ['leica-color', 'night-mode', 'bokeh'],
      promptBase: 'shot on Huawei P40 Pro, Leica camera'
    },

    // ===== Xiaomi 小米系列 =====
    {
      id: 'xiaomi-14-ultra',
      name: 'Xiaomi 14 Ultra',
      type: 'PHONE',
      brand: 'Xiaomi',
      year: 2024,
      sensor: '50MP 1-inch Main',
      description: '徕卡Summilux，一英寸传感器',
      focalLengths: [12, 23, 75, 120],
      apertures: [1.63, 1.8, 2.5, 2.5],
      availableEffects: ['leica-authentic', 'leica-vibrant', 'master-lens', 'variable-aperture'],
      promptBase: 'shot on Xiaomi 14 Ultra, Leica Summilux'
    },
    {
      id: 'xiaomi-13-ultra',
      name: 'Xiaomi 13 Ultra',
      type: 'PHONE',
      brand: 'Xiaomi',
      year: 2023,
      sensor: '50MP 1-inch Main',
      description: '一英寸传感器，徕卡合作',
      focalLengths: [12, 23, 75, 120],
      apertures: [1.9, 2.0, 2.5, 3.0],
      availableEffects: ['leica-authentic', 'leica-vibrant', 'ultra-night'],
      promptBase: 'shot on Xiaomi 13 Ultra, Leica camera'
    },

    // ===== OPPO/OnePlus 系列 =====
    {
      id: 'oppo-find-x7-ultra',
      name: 'OPPO Find X7 Ultra',
      type: 'PHONE',
      brand: 'OPPO',
      year: 2024,
      sensor: '50MP Dual Main',
      description: '双潜望长焦，哈苏调色',
      focalLengths: [15, 23, 65, 135],
      apertures: [1.8, 1.95, 2.6, 4.3],
      availableEffects: ['hasselblad-color', 'dual-periscope', 'ultra-night'],
      promptBase: 'shot on OPPO Find X7 Ultra, Hasselblad color'
    },
    {
      id: 'oneplus-12',
      name: 'OnePlus 12',
      type: 'PHONE',
      brand: 'OnePlus',
      year: 2024,
      sensor: '50MP Main',
      description: '哈苏合作，第四代传感器',
      focalLengths: [14, 23, 64],
      apertures: [1.6, 2.0, 2.6],
      availableEffects: ['hasselblad-color', 'portrait-mode', 'night-mode'],
      promptBase: 'shot on OnePlus 12, Hasselblad camera'
    },

    // ===== vivo 系列 =====
    {
      id: 'vivo-x100-ultra',
      name: 'vivo X100 Ultra',
      type: 'PHONE',
      brand: 'vivo',
      year: 2024,
      sensor: '50MP 1-inch Main',
      description: '200mm潜望长焦，蔡司影像',
      focalLengths: [14, 23, 85, 200],
      apertures: [1.75, 2.0, 2.67, 3.7],
      availableEffects: ['zeiss-color', 'zeiss-bokeh', 'super-telephoto', 'night-mode'],
      promptBase: 'shot on vivo X100 Ultra, Zeiss optics'
    },
    {
      id: 'vivo-x90-pro-plus',
      name: 'vivo X90 Pro+',
      type: 'PHONE',
      brand: 'vivo',
      year: 2022,
      sensor: '50MP 1-inch Main',
      description: '一英寸传感器，蔡司T*镀膜',
      focalLengths: [14, 23, 50, 90],
      apertures: [1.75, 1.85, 1.6, 2.5],
      availableEffects: ['zeiss-color', 'zeiss-portrait', 'night-mode'],
      promptBase: 'shot on vivo X90 Pro+, Zeiss T* lens'
    },

    // ===== Nokia 诺基亚经典系列 =====
    {
      id: 'nokia-pureview-808',
      name: 'Nokia 808 PureView',
      type: 'PHONE',
      brand: 'Nokia',
      year: 2012,
      sensor: '41MP',
      description: '传奇4100万像素，超采样技术',
      focalLengths: [26],
      apertures: [2.4],
      availableEffects: ['pureview-oversampling', 'lossless-zoom', 'xenon-flash'],
      promptBase: 'shot on Nokia 808 PureView, 41MP sensor'
    },
    {
      id: 'nokia-lumia-1020',
      name: 'Nokia Lumia 1020',
      type: 'PHONE',
      brand: 'Nokia',
      year: 2013,
      sensor: '41MP',
      description: '4100万像素，OIS光学防抖',
      focalLengths: [26],
      apertures: [2.2],
      availableEffects: ['pureview-oversampling', 'xenon-flash', 'raw-capture'],
      promptBase: 'shot on Nokia Lumia 1020'
    },
    {
      id: 'nokia-n95',
      name: 'Nokia N95',
      type: 'PHONE',
      brand: 'Nokia',
      year: 2007,
      sensor: '5MP',
      description: '多媒体电脑手机，卡尔蔡司镜头',
      focalLengths: [35],
      apertures: [2.8],
      availableEffects: ['zeiss-rendering', 'vintage-phone', 'autofocus'],
      promptBase: 'shot on Nokia N95, Carl Zeiss lens'
    },
    {
      id: 'nokia-7650',
      name: 'Nokia 7650',
      type: 'PHONE',
      brand: 'Nokia',
      year: 2002,
      sensor: 'VGA (0.3MP)',
      description: '首款拍照手机，开创移动摄影',
      focalLengths: [35],
      apertures: [2.8],
      availableEffects: ['retro-phone', 'lo-fi'],
      promptBase: 'shot on Nokia 7650, early camera phone aesthetic'
    },

    // ===== Sony Xperia 系列 =====
    {
      id: 'sony-xperia-1-vi',
      name: 'Sony Xperia 1 VI',
      type: 'PHONE',
      brand: 'Sony',
      year: 2024,
      sensor: '48MP Main',
      description: 'Alpha技术下放，AI超分辨率',
      focalLengths: [16, 24, 48, 85, 170],
      apertures: [1.9, 2.1, 2.3, 2.8],
      availableEffects: ['alpha-processing', 'eye-af', 'real-time-tracking', 'cinematic-video'],
      promptBase: 'shot on Sony Xperia 1 VI, Alpha camera technology'
    },
    {
      id: 'sony-xperia-pro-i',
      name: 'Sony Xperia PRO-I',
      type: 'PHONE',
      brand: 'Sony',
      year: 2021,
      sensor: '1-inch 12MP',
      description: '一英寸传感器，RX100技术',
      focalLengths: [16, 24, 50],
      apertures: [2.0, 2.2, 2.4],
      availableEffects: ['1-inch-sensor', 'zeiss-rendering', 'eye-af'],
      promptBase: 'shot on Sony Xperia PRO-I, 1-inch sensor'
    }
  ],

  // ==================== 镜头 ====================
  lenses: [
    // ===== Zeiss 系列 =====
    {
      id: 'zeiss-master-prime',
      name: 'Zeiss Master Prime',
      brand: 'Zeiss',
      mount: 'PL',
      format: 'Super 35',
      focalLengths: [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135],
      // 真实光圈数据：12-75mm为T1.3，100-135mm为T2.0
      apertureByFocal: {
        12: { max: 1.3, min: 22 },
        14: { max: 1.3, min: 22 },
        16: { max: 1.3, min: 22 },
        18: { max: 1.3, min: 22 },
        21: { max: 1.3, min: 22 },
        25: { max: 1.3, min: 22 },
        27: { max: 1.3, min: 22 },
        32: { max: 1.3, min: 22 },
        35: { max: 1.3, min: 22 },
        40: { max: 1.3, min: 22 },
        50: { max: 1.3, min: 22 },
        65: { max: 1.3, min: 22 },
        75: { max: 1.3, min: 22 },
        100: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 }
      },
      characteristics: {
        sharpness: 'extremely high',
        contrast: 'high',
        colorRendition: 'neutral',
        bokeh: 'smooth circular',
        flare: 'minimal', // 几乎无炫光
        distortion: 'very low'
      },
      // 可用特效：Zeiss Master Prime 以锐利和低炫光著称
      availableEffects: ['bokeh'],
      description: '极致锐利，几乎无炫光，专业电影制作首选'
    },
    {
      id: 'zeiss-ultra-prime',
      name: 'Zeiss Ultra Prime',
      brand: 'Zeiss',
      mount: 'PL',
      format: 'Super 35',
      focalLengths: [8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 50, 65, 85, 100, 135, 180],
      apertureByFocal: {
        8: { max: 2.8, min: 22 },
        10: { max: 2.1, min: 22 },
        12: { max: 2.0, min: 22 },
        14: { max: 1.9, min: 22 },
        16: { max: 1.9, min: 22 },
        20: { max: 1.9, min: 22 },
        24: { max: 1.9, min: 22 },
        28: { max: 1.9, min: 22 },
        32: { max: 1.9, min: 22 },
        40: { max: 1.9, min: 22 },
        50: { max: 1.9, min: 22 },
        65: { max: 1.9, min: 22 },
        85: { max: 1.9, min: 22 },
        100: { max: 1.9, min: 22 },
        135: { max: 1.9, min: 22 },
        180: { max: 1.9, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth',
        flare: 'controlled',
        distortion: 'low'
      },
      availableEffects: ['bokeh'],
      description: '高性价比电影镜头，覆盖广泛焦段'
    },
    {
      id: 'zeiss-supreme-prime',
      name: 'Zeiss Supreme Prime',
      brand: 'Zeiss',
      mount: 'PL',
      format: 'Full Frame',
      focalLengths: [15, 18, 21, 25, 29, 35, 40, 50, 65, 85, 100, 135, 150, 200],
      apertureByFocal: {
        15: { max: 1.8, min: 22 },
        18: { max: 1.5, min: 22 },
        21: { max: 1.5, min: 22 },
        25: { max: 1.5, min: 22 },
        29: { max: 1.5, min: 22 },
        35: { max: 1.5, min: 22 },
        40: { max: 1.5, min: 22 },
        50: { max: 1.5, min: 22 },
        65: { max: 1.5, min: 22 },
        85: { max: 1.5, min: 22 },
        100: { max: 1.5, min: 22 },
        135: { max: 1.8, min: 22 },
        150: { max: 2.1, min: 22 },
        200: { max: 2.1, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium',
        colorRendition: 'warm neutral',
        bokeh: 'creamy smooth',
        flare: 'gentle warm flare',
        distortion: 'very low'
      },
      availableEffects: ['bokeh', 'gentle-flare'],
      description: '全画幅电影镜头，锐利中带温暖，柔和炫光'
    },
    {
      id: 'zeiss-cp3',
      name: 'Zeiss CP.3',
      brand: 'Zeiss',
      mount: 'PL/EF/E',
      format: 'Full Frame',
      focalLengths: [15, 18, 21, 25, 28, 35, 50, 85, 100, 135],
      apertureByFocal: {
        15: { max: 2.9, min: 22 },
        18: { max: 2.9, min: 22 },
        21: { max: 2.9, min: 22 },
        25: { max: 2.1, min: 22 },
        28: { max: 2.1, min: 22 },
        35: { max: 2.1, min: 22 },
        50: { max: 2.1, min: 22 },
        85: { max: 2.1, min: 22 },
        100: { max: 2.1, min: 22 },
        135: { max: 2.1, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth',
        flare: 'minimal',
        distortion: 'low'
      },
      availableEffects: ['bokeh'],
      description: '紧凑型全画幅电影镜头，性价比高'
    },

    // ===== Cooke 系列 =====
    {
      id: 'cooke-s4',
      name: 'Cooke S4/i',
      brand: 'Cooke',
      mount: 'PL',
      format: 'Super 35',
      focalLengths: [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135],
      // S4/i 全系列为 T2.0
      apertureByFocal: {
        12: { max: 2.0, min: 22 },
        14: { max: 2.0, min: 22 },
        16: { max: 2.0, min: 22 },
        18: { max: 2.0, min: 22 },
        21: { max: 2.0, min: 22 },
        25: { max: 2.0, min: 22 },
        27: { max: 2.0, min: 22 },
        32: { max: 2.0, min: 22 },
        35: { max: 2.0, min: 22 },
        40: { max: 2.0, min: 22 },
        50: { max: 2.0, min: 22 },
        65: { max: 2.0, min: 22 },
        75: { max: 2.0, min: 22 },
        100: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'warm (Cooke Look)',
        bokeh: 'smooth organic',
        flare: 'warm gentle',
        distortion: 'low'
      },
      // 著名的 "Cooke Look" - 温暖肤色，柔和过渡
      availableEffects: ['cooke-look', 'warm-tone', 'soft-skin', 'bokeh'],
      description: '经典"Cooke Look"，温暖肤色还原，柔和高光过渡'
    },
    {
      id: 'cooke-s5',
      name: 'Cooke S5/i',
      brand: 'Cooke',
      mount: 'PL',
      format: 'Full Frame',
      focalLengths: [18, 25, 32, 40, 50, 65, 75, 100, 135],
      apertureByFocal: {
        18: { max: 1.4, min: 22 },
        25: { max: 1.4, min: 22 },
        32: { max: 1.4, min: 22 },
        40: { max: 1.4, min: 22 },
        50: { max: 1.4, min: 22 },
        65: { max: 1.4, min: 22 },
        75: { max: 1.4, min: 22 },
        100: { max: 1.4, min: 22 },
        135: { max: 1.4, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'warm (Cooke Look)',
        bokeh: 'smooth organic',
        flare: 'warm gentle',
        distortion: 'very low'
      },
      availableEffects: ['cooke-look', 'warm-tone', 'soft-skin', 'bokeh'],
      description: '全画幅版Cooke Look，T1.4大光圈'
    },
    {
      id: 'cooke-s7',
      name: 'Cooke S7/i',
      brand: 'Cooke',
      mount: 'PL',
      format: 'Full Frame+',
      focalLengths: [18, 25, 32, 40, 50, 75, 100, 135],
      apertureByFocal: {
        18: { max: 2.0, min: 22 },
        25: { max: 2.0, min: 22 },
        32: { max: 2.0, min: 22 },
        40: { max: 2.0, min: 22 },
        50: { max: 2.0, min: 22 },
        75: { max: 2.0, min: 22 },
        100: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'warm (Cooke Look)',
        bokeh: 'exceptionally smooth',
        flare: 'warm gentle',
        distortion: 'very low'
      },
      availableEffects: ['cooke-look', 'warm-tone', 'soft-skin', 'bokeh'],
      description: '大画幅Cooke镜头，覆盖Alexa 65'
    },
    {
      id: 'cooke-anamorphic-i',
      name: 'Cooke Anamorphic/i',
      brand: 'Cooke',
      mount: 'PL',
      format: 'Super 35 Anamorphic',
      isAnamorphic: true,
      anamorphicRatio: 2.0,
      focalLengths: [25, 32, 40, 50, 65, 75, 100, 135, 180],
      apertureByFocal: {
        25: { max: 2.3, min: 22 },
        32: { max: 2.3, min: 22 },
        40: { max: 2.3, min: 22 },
        50: { max: 2.3, min: 22 },
        65: { max: 2.3, min: 22 },
        75: { max: 2.3, min: 22 },
        100: { max: 2.3, min: 22 },
        135: { max: 2.3, min: 22 },
        180: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'medium',
        contrast: 'medium',
        colorRendition: 'warm',
        bokeh: 'oval (anamorphic)',
        flare: 'horizontal streak (anamorphic)',
        distortion: 'anamorphic barrel'
      },
      // 变形镜头特有效果
      availableEffects: ['anamorphic-flare', 'anamorphic-bokeh', 'horizontal-streak', 'cooke-look', 'warm-tone'],
      description: '2x变形镜头，椭圆散景，经典水平拉丝炫光'
    },

    // ===== Canon 系列 =====
    {
      id: 'canon-k35',
      name: 'Canon K-35',
      brand: 'Canon',
      mount: 'PL',
      format: 'Super 35',
      vintage: true,
      year: '1976',
      focalLengths: [18, 24, 35, 55, 85],
      // K-35 经典规格
      apertureByFocal: {
        18: { max: 1.5, min: 16 },
        24: { max: 1.4, min: 16 },
        35: { max: 1.4, min: 16 },
        55: { max: 1.2, min: 16 }, // 55mm是唯一的T1.2
        85: { max: 1.4, min: 16 }
      },
      characteristics: {
        sharpness: 'medium (vintage)',
        contrast: 'low-medium',
        colorRendition: 'warm vintage',
        bokeh: 'soft dreamy',
        flare: 'rainbow/prismatic flare', // 著名的彩虹炫光
        distortion: 'moderate'
      },
      // K-35 以独特的彩虹炫光和复古柔焦著称
      availableEffects: ['rainbow-flare', 'vintage-soft', 'dreamy-bokeh', 'warm-tone', 'low-contrast'],
      description: '1976年经典镜头，著名的彩虹炫光，复古柔焦感'
    },
    {
      id: 'canon-sumire',
      name: 'Canon Sumire Prime',
      brand: 'Canon',
      mount: 'PL',
      format: 'Full Frame',
      focalLengths: [14, 20, 24, 35, 50, 85, 135],
      apertureByFocal: {
        14: { max: 3.1, min: 22 },
        20: { max: 1.5, min: 22 },
        24: { max: 1.5, min: 22 },
        35: { max: 1.5, min: 22 },
        50: { max: 1.3, min: 22 },
        85: { max: 1.3, min: 22 },
        135: { max: 2.5, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'warm',
        bokeh: 'smooth organic',
        flare: 'warm gentle',
        distortion: 'low'
      },
      availableEffects: ['warm-tone', 'soft-skin', 'bokeh', 'gentle-flare'],
      description: '温暖色调，柔和肤色，适合人像拍摄'
    },

    // ===== ARRI 系列 =====
    {
      id: 'arri-signature-prime',
      name: 'ARRI Signature Prime',
      brand: 'ARRI',
      mount: 'LPL',
      format: 'Large Format',
      focalLengths: [12, 15, 18, 21, 25, 29, 35, 40, 47, 58, 75, 95, 125, 150, 200, 280],
      apertureByFocal: {
        12: { max: 1.8, min: 22 },
        15: { max: 1.8, min: 22 },
        18: { max: 1.8, min: 22 },
        21: { max: 1.8, min: 22 },
        25: { max: 1.8, min: 22 },
        29: { max: 1.8, min: 22 },
        35: { max: 1.8, min: 22 },
        40: { max: 1.8, min: 22 },
        47: { max: 1.8, min: 22 },
        58: { max: 1.8, min: 22 },
        75: { max: 1.8, min: 22 },
        95: { max: 1.8, min: 22 },
        125: { max: 1.8, min: 22 },
        150: { max: 2.0, min: 22 },
        200: { max: 2.5, min: 22 },
        280: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'natural pleasing',
        bokeh: 'silky smooth',
        flare: 'subtle warm',
        distortion: 'very low'
      },
      availableEffects: ['silky-bokeh', 'natural-skin', 'subtle-flare', 'warm-tone'],
      description: '大画幅镜头，丝滑散景，自然肤色'
    },
    {
      id: 'arri-master-anamorphic',
      name: 'ARRI Master Anamorphic',
      brand: 'ARRI',
      mount: 'PL',
      format: 'Super 35 Anamorphic',
      isAnamorphic: true,
      anamorphicRatio: 2.0,
      focalLengths: [28, 35, 40, 50, 60, 75, 100, 135, 180],
      apertureByFocal: {
        28: { max: 1.9, min: 22 },
        35: { max: 1.9, min: 22 },
        40: { max: 1.9, min: 22 },
        50: { max: 1.9, min: 22 },
        60: { max: 1.9, min: 22 },
        75: { max: 1.9, min: 22 },
        100: { max: 1.9, min: 22 },
        135: { max: 1.9, min: 22 },
        180: { max: 1.9, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'oval (anamorphic)',
        flare: 'controlled horizontal streak',
        distortion: 'minimal anamorphic'
      },
      availableEffects: ['anamorphic-flare', 'anamorphic-bokeh', 'horizontal-streak'],
      description: '高端变形镜头，可控炫光，T1.9大光圈'
    },
    {
      id: 'arri-prime-65',
      name: 'ARRI Prime 65',
      brand: 'ARRI',
      mount: 'XPL',
      format: '65mm',
      focalLengths: [28, 35, 50, 75, 100, 150, 300],
      apertureByFocal: {
        28: { max: 1.7, min: 22 },
        35: { max: 1.7, min: 22 },
        50: { max: 1.7, min: 22 },
        75: { max: 1.7, min: 22 },
        100: { max: 1.7, min: 22 },
        150: { max: 2.0, min: 22 },
        300: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'natural',
        bokeh: 'extremely smooth',
        flare: 'minimal',
        distortion: 'very low'
      },
      availableEffects: ['large-format-bokeh', 'shallow-dof'],
      description: '65mm专用镜头，极浅景深'
    },
    {
      id: 'arri-prime-dna',
      name: 'ARRI Prime DNA',
      brand: 'ARRI',
      mount: 'XPL',
      format: '65mm',
      vintage: true,
      focalLengths: [28, 35, 50, 80, 100, 135, 200],
      apertureByFocal: {
        28: { max: 2.0, min: 22 },
        35: { max: 2.0, min: 22 },
        50: { max: 2.0, min: 22 },
        80: { max: 2.0, min: 22 },
        100: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 },
        200: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'medium (vintage)',
        contrast: 'low-medium',
        colorRendition: 'vintage warm',
        bokeh: 'organic vintage',
        flare: 'vintage character flare',
        distortion: 'vintage character'
      },
      availableEffects: ['vintage-character', 'organic-flare', 'warm-tone', 'soft-glow'],
      description: '复古65mm镜头，独特光学特性'
    },

    // ===== Panavision 系列 =====
    {
      id: 'panavision-primo',
      name: 'Panavision Primo',
      brand: 'Panavision',
      mount: 'PV',
      format: 'Super 35',
      focalLengths: [10, 14.5, 17.5, 21, 27, 35, 40, 50, 65, 75, 85, 100, 125, 150],
      apertureByFocal: {
        10: { max: 1.9, min: 22 },
        14.5: { max: 1.9, min: 22 },
        17.5: { max: 1.9, min: 22 },
        21: { max: 1.9, min: 22 },
        27: { max: 1.9, min: 22 },
        35: { max: 1.9, min: 22 },
        40: { max: 1.9, min: 22 },
        50: { max: 1.9, min: 22 },
        65: { max: 1.9, min: 22 },
        75: { max: 1.9, min: 22 },
        85: { max: 1.9, min: 22 },
        100: { max: 1.9, min: 22 },
        125: { max: 1.9, min: 22 },
        150: { max: 1.9, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral balanced',
        bokeh: 'smooth',
        flare: 'controlled',
        distortion: 'very low'
      },
      availableEffects: ['bokeh', 'clean-image'],
      description: '好莱坞行业标准镜头，平衡的画质'
    },
    {
      id: 'panavision-primo-70',
      name: 'Panavision Primo 70',
      brand: 'Panavision',
      mount: 'PV',
      format: 'Large Format',
      focalLengths: [27, 35, 40, 50, 65, 80, 100, 125, 150, 200],
      apertureByFocal: {
        27: { max: 1.9, min: 22 },
        35: { max: 1.9, min: 22 },
        40: { max: 1.9, min: 22 },
        50: { max: 1.9, min: 22 },
        65: { max: 1.9, min: 22 },
        80: { max: 1.9, min: 22 },
        100: { max: 1.9, min: 22 },
        125: { max: 1.9, min: 22 },
        150: { max: 1.9, min: 22 },
        200: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth large format',
        flare: 'controlled',
        distortion: 'very low'
      },
      availableEffects: ['large-format-bokeh', 'shallow-dof'],
      description: '大画幅Primo镜头，8K分辨率支持'
    },
    {
      id: 'panavision-anamorphic-e',
      name: 'Panavision E-Series Anamorphic',
      brand: 'Panavision',
      mount: 'PV',
      format: 'Super 35 Anamorphic',
      isAnamorphic: true,
      anamorphicRatio: 2.0,
      vintage: true,
      focalLengths: [35, 40, 50, 75, 100],
      apertureByFocal: {
        35: { max: 2.0, min: 16 },
        40: { max: 2.0, min: 16 },
        50: { max: 2.0, min: 16 },
        75: { max: 2.0, min: 16 },
        100: { max: 2.0, min: 16 }
      },
      characteristics: {
        sharpness: 'medium (vintage)',
        contrast: 'low-medium',
        colorRendition: 'warm vintage',
        bokeh: 'oval vintage',
        flare: 'dramatic blue streak', // 著名的蓝色拉丝炫光
        distortion: 'anamorphic mumps'
      },
      availableEffects: ['blue-streak-flare', 'anamorphic-bokeh', 'vintage-anamorphic', 'mumps-distortion'],
      description: '经典变形镜头，著名的蓝色拉丝炫光'
    },
    {
      id: 'panavision-anamorphic-g',
      name: 'Panavision G-Series Anamorphic',
      brand: 'Panavision',
      mount: 'PV',
      format: 'Super 35 Anamorphic',
      isAnamorphic: true,
      anamorphicRatio: 2.0,
      focalLengths: [35, 40, 50, 65, 75, 100, 135, 150, 180],
      apertureByFocal: {
        35: { max: 2.8, min: 22 },
        40: { max: 2.8, min: 22 },
        50: { max: 2.8, min: 22 },
        65: { max: 2.8, min: 22 },
        75: { max: 2.8, min: 22 },
        100: { max: 2.8, min: 22 },
        135: { max: 2.8, min: 22 },
        150: { max: 2.8, min: 22 },
        180: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'neutral',
        bokeh: 'oval smooth',
        flare: 'horizontal streak',
        distortion: 'anamorphic'
      },
      availableEffects: ['anamorphic-flare', 'anamorphic-bokeh', 'horizontal-streak'],
      description: '现代变形镜头，更锐利的画质'
    },

    // ===== Leica 系列 =====
    {
      id: 'leica-summilux-c',
      name: 'Leica Summilux-C',
      brand: 'Leica',
      mount: 'PL',
      format: 'Full Frame',
      focalLengths: [16, 18, 21, 25, 29, 35, 40, 50, 65, 75, 100],
      apertureByFocal: {
        16: { max: 1.4, min: 16 },
        18: { max: 1.4, min: 16 },
        21: { max: 1.4, min: 16 },
        25: { max: 1.4, min: 16 },
        29: { max: 1.4, min: 16 },
        35: { max: 1.4, min: 16 },
        40: { max: 1.4, min: 16 },
        50: { max: 1.4, min: 16 },
        65: { max: 1.4, min: 16 },
        75: { max: 1.4, min: 16 },
        100: { max: 1.4, min: 16 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'Leica look',
        bokeh: 'creamy swirly',
        flare: 'warm organic',
        distortion: 'low'
      },
      availableEffects: ['leica-look', 'creamy-bokeh', 'warm-flare', 'high-contrast'],
      description: '徕卡电影镜头，独特的"Leica Look"'
    },
    {
      id: 'leica-thalia',
      name: 'Leica Thalia',
      brand: 'Leica',
      mount: 'PL/LPL',
      format: 'Large Format',
      focalLengths: [24, 30, 35, 45, 55, 70, 90, 100, 120, 180],
      apertureByFocal: {
        24: { max: 3.6, min: 22 },
        30: { max: 2.0, min: 22 },
        35: { max: 2.0, min: 22 },
        45: { max: 2.0, min: 22 },
        55: { max: 2.0, min: 22 },
        70: { max: 2.0, min: 22 },
        90: { max: 2.0, min: 22 },
        100: { max: 2.0, min: 22 },
        120: { max: 2.0, min: 22 },
        180: { max: 3.2, min: 22 }
      },
      characteristics: {
        sharpness: 'medium-high',
        contrast: 'medium',
        colorRendition: 'classic Leica',
        bokeh: 'smooth large format',
        flare: 'organic warm',
        distortion: 'low'
      },
      availableEffects: ['leica-look', 'large-format-bokeh', 'warm-tone'],
      description: '大画幅徕卡镜头，经典Leica成像'
    },

    // ===== Sigma 系列 =====
    {
      id: 'sigma-cine-ff',
      name: 'Sigma Cine FF High Speed',
      brand: 'Sigma',
      mount: 'PL/EF/E',
      format: 'Full Frame',
      focalLengths: [14, 20, 24, 28, 35, 40, 50, 85, 105, 135],
      apertureByFocal: {
        14: { max: 1.8, min: 16 },
        20: { max: 1.4, min: 16 },
        24: { max: 1.4, min: 16 },
        28: { max: 1.4, min: 16 },
        35: { max: 1.4, min: 16 },
        40: { max: 1.4, min: 16 },
        50: { max: 1.4, min: 16 },
        85: { max: 1.4, min: 16 },
        105: { max: 1.4, min: 16 },
        135: { max: 1.8, min: 16 }
      },
      characteristics: {
        sharpness: 'very high',
        contrast: 'high',
        colorRendition: 'neutral modern',
        bokeh: 'smooth',
        flare: 'minimal',
        distortion: 'low'
      },
      availableEffects: ['bokeh', 'sharp-image'],
      description: '高性价比全画幅电影镜头，极致锐利'
    },

    // ===== Sony 系列 =====
    {
      id: 'sony-cinealta',
      name: 'Sony CineAlta',
      brand: 'Sony',
      mount: 'PL/E',
      format: 'Full Frame',
      focalLengths: [20, 24, 35, 50, 85, 135],
      apertureByFocal: {
        20: { max: 2.0, min: 22 },
        24: { max: 2.0, min: 22 },
        35: { max: 2.0, min: 22 },
        50: { max: 2.0, min: 22 },
        85: { max: 2.0, min: 22 },
        135: { max: 2.0, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth',
        flare: 'controlled',
        distortion: 'very low'
      },
      availableEffects: ['bokeh', 'clean-image'],
      description: 'Sony官方电影镜头，为Venice优化'
    },

    // ===== DZOFilm 系列 =====
    {
      id: 'dzofilm-vespid',
      name: 'DZOFilm Vespid',
      brand: 'DZOFilm',
      mount: 'PL/EF',
      format: 'Full Frame',
      focalLengths: [16, 21, 25, 35, 50, 75, 90, 100, 125],
      apertureByFocal: {
        16: { max: 2.8, min: 22 },
        21: { max: 2.1, min: 22 },
        25: { max: 2.1, min: 22 },
        35: { max: 2.1, min: 22 },
        50: { max: 2.1, min: 22 },
        75: { max: 2.1, min: 22 },
        90: { max: 2.8, min: 22 },
        100: { max: 2.1, min: 22 },
        125: { max: 2.8, min: 22 }
      },
      characteristics: {
        sharpness: 'high',
        contrast: 'medium-high',
        colorRendition: 'neutral',
        bokeh: 'smooth',
        flare: 'controlled',
        distortion: 'low'
      },
      availableEffects: ['bokeh'],
      description: '高性价比全画幅电影镜头'
    },

    // ===== Hasselblad 系列 (65mm) =====
    {
      id: 'hasselblad-hc',
      name: 'Hasselblad HC',
      brand: 'Hasselblad',
      mount: 'HC',
      format: 'Medium Format',
      focalLengths: [24, 28, 35, 50, 80, 100, 150, 210, 300],
      apertureByFocal: {
        24: { max: 4.8, min: 32 },
        28: { max: 4.0, min: 32 },
        35: { max: 3.5, min: 32 },
        50: { max: 3.5, min: 32 },
        80: { max: 2.8, min: 32 },
        100: { max: 2.2, min: 32 },
        150: { max: 3.2, min: 32 },
        210: { max: 4.0, min: 32 },
        300: { max: 4.5, min: 32 }
      },
      characteristics: {
        sharpness: 'extremely high',
        contrast: 'high',
        colorRendition: 'medium format',
        bokeh: 'smooth',
        flare: 'minimal',
        distortion: 'very low'
      },
      availableEffects: ['medium-format-look', 'shallow-dof'],
      description: '中画幅镜头，与ARRI 65配合使用'
    }
  ],

  // ==================== 镜头特效定义 ====================
  lensEffects: {
    // ===== 炫光类 =====
    'rainbow-flare': {
      id: 'rainbow-flare',
      name: '彩虹炫光',
      nameEn: 'Rainbow Lens Flare',
      category: 'flare',
      promptSuffix: 'with rainbow prismatic lens flare',
      description: 'Canon K-35等复古镜头的标志性彩虹色炫光'
    },
    'anamorphic-flare': {
      id: 'anamorphic-flare',
      name: '变形炫光',
      nameEn: 'Anamorphic Lens Flare',
      category: 'flare',
      promptSuffix: 'with anamorphic lens flare',
      description: '变形镜头特有的水平拉丝炫光'
    },
    'horizontal-streak': {
      id: 'horizontal-streak',
      name: '水平拉丝',
      nameEn: 'Horizontal Streak Flare',
      category: 'flare',
      promptSuffix: 'with horizontal streak flare across the frame',
      description: '变形镜头的水平光线条纹'
    },
    'blue-streak-flare': {
      id: 'blue-streak-flare',
      name: '蓝色拉丝',
      nameEn: 'Blue Streak Flare',
      category: 'flare',
      promptSuffix: 'with classic blue anamorphic streak flare',
      description: 'Panavision E-Series变形镜头的经典蓝色拉丝'
    },
    'gentle-flare': {
      id: 'gentle-flare',
      name: '柔和炫光',
      nameEn: 'Gentle Flare',
      category: 'flare',
      promptSuffix: 'with subtle warm lens flare',
      description: '温和的光晕效果'
    },
    'warm-flare': {
      id: 'warm-flare',
      name: '暖色炫光',
      nameEn: 'Warm Flare',
      category: 'flare',
      promptSuffix: 'with warm organic lens flare',
      description: '带有暖色调的镜头炫光'
    },
    'subtle-flare': {
      id: 'subtle-flare',
      name: '微妙炫光',
      nameEn: 'Subtle Flare',
      category: 'flare',
      promptSuffix: 'with subtle lens flare',
      description: '微妙不明显的炫光效果'
    },
    'organic-flare': {
      id: 'organic-flare',
      name: '有机炫光',
      nameEn: 'Organic Flare',
      category: 'flare',
      promptSuffix: 'with organic vintage flare characteristics',
      description: '自然有机的复古炫光'
    },
    'vintage-character': {
      id: 'vintage-character',
      name: '复古特性',
      nameEn: 'Vintage Character',
      category: 'flare',
      promptSuffix: 'with vintage lens optical characteristics',
      description: '复古镜头的独特光学特性'
    },

    // ===== 散景类 =====
    'bokeh': {
      id: 'bokeh',
      name: '散景',
      nameEn: 'Bokeh',
      category: 'bokeh',
      promptSuffix: 'with beautiful bokeh',
      description: '柔和的背景虚化效果'
    },
    'anamorphic-bokeh': {
      id: 'anamorphic-bokeh',
      name: '椭圆散景',
      nameEn: 'Anamorphic Oval Bokeh',
      category: 'bokeh',
      promptSuffix: 'with oval anamorphic bokeh',
      description: '变形镜头特有的椭圆形散景'
    },
    'dreamy-bokeh': {
      id: 'dreamy-bokeh',
      name: '梦幻散景',
      nameEn: 'Dreamy Bokeh',
      category: 'bokeh',
      promptSuffix: 'with soft dreamy bokeh',
      description: '柔美梦幻的散景效果'
    },
    'silky-bokeh': {
      id: 'silky-bokeh',
      name: '丝滑散景',
      nameEn: 'Silky Bokeh',
      category: 'bokeh',
      promptSuffix: 'with silky smooth bokeh',
      description: '极其顺滑的散景过渡'
    },
    'creamy-bokeh': {
      id: 'creamy-bokeh',
      name: '奶油散景',
      nameEn: 'Creamy Bokeh',
      category: 'bokeh',
      promptSuffix: 'with creamy swirly bokeh',
      description: '奶油般顺滑的散景'
    },
    'large-format-bokeh': {
      id: 'large-format-bokeh',
      name: '大画幅散景',
      nameEn: 'Large Format Bokeh',
      category: 'bokeh',
      promptSuffix: 'with large format shallow depth of field bokeh',
      description: '大画幅带来的极浅景深'
    },
    'shallow-dof': {
      id: 'shallow-dof',
      name: '浅景深',
      nameEn: 'Shallow Depth of Field',
      category: 'bokeh',
      promptSuffix: 'with extremely shallow depth of field',
      description: '极浅的景深效果'
    },

    // ===== 色彩风格类 =====
    'cooke-look': {
      id: 'cooke-look',
      name: 'Cooke Look',
      nameEn: 'Cooke Look',
      category: 'style',
      promptSuffix: 'with classic Cooke Look rendering',
      description: 'Cooke镜头独特的温暖成像风格'
    },
    'leica-look': {
      id: 'leica-look',
      name: 'Leica Look',
      nameEn: 'Leica Look',
      category: 'style',
      promptSuffix: 'with distinctive Leica rendering',
      description: '徕卡镜头独特的成像风格'
    },
    'warm-tone': {
      id: 'warm-tone',
      name: '暖色调',
      nameEn: 'Warm Tone',
      category: 'style',
      promptSuffix: 'with warm color tone',
      description: '温暖的色彩倾向'
    },
    'soft-skin': {
      id: 'soft-skin',
      name: '柔和肤色',
      nameEn: 'Soft Skin Rendering',
      category: 'style',
      promptSuffix: 'with pleasing skin tone rendering',
      description: '对人物肤色的柔和还原'
    },
    'natural-skin': {
      id: 'natural-skin',
      name: '自然肤色',
      nameEn: 'Natural Skin Tone',
      category: 'style',
      promptSuffix: 'with natural skin tone',
      description: '自然的肤色还原'
    },
    'low-contrast': {
      id: 'low-contrast',
      name: '低对比度',
      nameEn: 'Low Contrast',
      category: 'style',
      promptSuffix: 'with low contrast cinematic look',
      description: '柔和的低对比度电影感'
    },
    'high-contrast': {
      id: 'high-contrast',
      name: '高对比度',
      nameEn: 'High Contrast',
      category: 'style',
      promptSuffix: 'with punchy high contrast',
      description: '锐利的高对比度'
    },
    'medium-format-look': {
      id: 'medium-format-look',
      name: '中画幅质感',
      nameEn: 'Medium Format Look',
      category: 'style',
      promptSuffix: 'with medium format film look',
      description: '中画幅的独特质感'
    },

    // ===== 柔焦/复古类 =====
    'vintage-soft': {
      id: 'vintage-soft',
      name: '复古柔焦',
      nameEn: 'Vintage Soft Focus',
      category: 'softness',
      promptSuffix: 'with vintage soft focus characteristics',
      description: '复古镜头的柔焦效果'
    },
    'soft-glow': {
      id: 'soft-glow',
      name: '柔光',
      nameEn: 'Soft Glow',
      category: 'softness',
      promptSuffix: 'with soft halation glow',
      description: '高光处的柔和光晕'
    },
    'vintage-anamorphic': {
      id: 'vintage-anamorphic',
      name: '复古变形',
      nameEn: 'Vintage Anamorphic',
      category: 'softness',
      promptSuffix: 'with vintage anamorphic characteristics',
      description: '复古变形镜头的特性'
    },

    // ===== 畸变类 =====
    'mumps-distortion': {
      id: 'mumps-distortion',
      name: '腮腺畸变',
      nameEn: 'Anamorphic Mumps',
      category: 'distortion',
      promptSuffix: 'with slight anamorphic mumps distortion at close focus',
      description: '变形镜头近焦时的面部畸变效果'
    },

    // ===== 清晰锐利类 =====
    'sharp-image': {
      id: 'sharp-image',
      name: '锐利画面',
      nameEn: 'Sharp Image',
      category: 'sharpness',
      promptSuffix: 'with tack sharp image quality',
      description: '极致锐利的画面'
    },
    'clean-image': {
      id: 'clean-image',
      name: '干净画面',
      nameEn: 'Clean Image',
      category: 'sharpness',
      promptSuffix: 'with clean clinical image',
      description: '干净无瑕的画面'
    }
  },

  // ==================== 标准光圈档位 ====================
  standardApertureStops: [1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 2.0, 2.1, 2.3, 2.8, 3.2, 3.5, 4.0, 4.5, 4.8, 5.6, 6.3, 8.0, 11, 16, 22]
}

/**
 * 根据相机获取兼容的镜头列表
 */
export function getCompatibleLenses(cameraId) {
  const camera = cameraDatabase.cameras.find(c => c.id === cameraId)
  if (!camera) return []
  
  return cameraDatabase.lenses.filter(lens => 
    camera.compatibleLenses.includes(lens.id)
  )
}

/**
 * 根据镜头和焦段获取可用光圈列表
 */
export function getAvailableApertures(lensId, focalLength) {
  const lens = cameraDatabase.lenses.find(l => l.id === lensId)
  if (!lens || !lens.apertureByFocal[focalLength]) {
    return cameraDatabase.standardApertureStops.filter(f => f >= 2.0 && f <= 11)
  }
  
  const { max, min } = lens.apertureByFocal[focalLength]
  return cameraDatabase.standardApertureStops.filter(f => f >= max && f <= min)
}

/**
 * 根据镜头获取可用的特效列表
 */
export function getAvailableEffects(lensId) {
  const lens = cameraDatabase.lenses.find(l => l.id === lensId)
  if (!lens || !lens.availableEffects) return []
  
  return lens.availableEffects.map(effectId => cameraDatabase.lensEffects[effectId]).filter(Boolean)
}

/**
 * 生成相机设置的提示词
 * @param {Object} settings - 相机设置
 * @param {string} settings.cameraName - 相机名称
 * @param {string} settings.lensName - 镜头名称
 * @param {number} settings.focalLength - 焦段
 * @param {number} settings.aperture - 光圈
 * @param {Array} settings.effects - 已选特效ID列表
 * @returns {string} 生成的提示词
 */
export function generateCameraPrompt(settings) {
  const { cameraName, lensName, focalLength, aperture, effects = [], mode = 'cinema', cameraData } = settings
  
  let prompt = ''
  
  // 电影机模式
  if (mode === 'cinema') {
    if (!cameraName || !lensName) return ''
    prompt = `Shot on ${cameraName} with ${lensName}, ${focalLength}mm, f/${aperture}`
    
    // 添加镜头特效提示词
    if (effects.length > 0) {
      const effectPrompts = effects
        .map(effectId => cameraDatabase.lensEffects?.[effectId]?.promptSuffix)
        .filter(Boolean)
      
      if (effectPrompts.length > 0) {
        prompt += ', ' + effectPrompts.join(', ')
      }
    }
  }
  // 照相机模式
  else if (mode === 'camera') {
    if (!cameraName) return ''
    
    // 使用相机的基础提示词（如果有）
    if (cameraData?.promptBase) {
      prompt = cameraData.promptBase
    } else {
      prompt = `Shot on ${cameraName}`
    }
    
    // 添加焦段和光圈
    prompt += `, ${focalLength}mm, f/${aperture}`
    
    // 添加相机特效提示词
    if (effects.length > 0) {
      const effectPrompts = effects
        .map(effectId => cameraEffectsMap[effectId]?.prompt)
        .filter(Boolean)
      
      if (effectPrompts.length > 0) {
        prompt += ', ' + effectPrompts.join(', ')
      }
    }
  }
  // 手机模式
  else if (mode === 'phone') {
    if (!cameraName) return ''
    
    // 使用手机的基础提示词（如果有）
    if (cameraData?.promptBase) {
      prompt = cameraData.promptBase
    } else {
      prompt = `Shot on ${cameraName}`
    }
    
    // 手机通常不强调焦段和光圈数值，但可以添加
    if (focalLength && focalLength !== 24) {
      prompt += `, ${focalLength}mm equivalent`
    }
    
    // 添加手机特效提示词
    if (effects.length > 0) {
      const effectPrompts = effects
        .map(effectId => cameraEffectsMap[effectId]?.prompt)
        .filter(Boolean)
      
      if (effectPrompts.length > 0) {
        prompt += ', ' + effectPrompts.join(', ')
      }
    }
  }
  
  return prompt
}

/**
 * 获取相机类型列表
 */
export function getCameraTypes() {
  return cameraDatabase.cameraTypes || [
    { id: 'FILM', name: '胶片机', nameEn: 'FILM', icon: '🎞️' },
    { id: 'DIGITAL', name: '数字机', nameEn: 'DIGITAL', icon: '📹' },
    { id: 'CAMERA', name: '照相机', nameEn: 'CAMERA', icon: '📷' },
    { id: 'PHONE', name: '手机', nameEn: 'PHONE', icon: '📱' }
  ]
}

/**
 * 按类型获取相机列表
 */
export function getCamerasByType(type) {
  return cameraDatabase.cameras.filter(c => c.type === type)
}

function pickDefaultFocalLength(values = []) {
  if (!values.length) return 35
  if (values.includes(35)) return 35
  return values.reduce((prev, curr) =>
    Math.abs(curr - 35) < Math.abs(prev - 35) ? curr : prev
  )
}

/**
 * 获取指定相机类型的默认设置
 */
export function getDefaultCameraSettingsForType(type = 'CAMERA') {
  const cameraType = getCameraTypes().some(item => item.id === type) ? type : 'CAMERA'
  const camera = getCamerasByType(cameraType)[0] || cameraDatabase.cameras[0]

  if (!camera) {
    return {
      cameraType,
      camera: '',
      lens: '',
      focalLength: 35,
      aperture: 2.0,
      effects: []
    }
  }

  const cinemaMode = cameraType === 'FILM' || cameraType === 'DIGITAL'
  const lens = cinemaMode ? getCompatibleLenses(camera.id)[0] : null
  const focalLengths = lens?.focalLengths || camera.focalLengths || [35]
  const focalLength = pickDefaultFocalLength(focalLengths)
  const apertures = lens
    ? getAvailableApertures(lens.id, focalLength)
    : (camera.apertures || [1.4, 2.0, 2.8, 4.0, 5.6, 8.0])

  return {
    cameraType: camera.type || cameraType,
    camera: camera.id,
    lens: lens?.id || '',
    focalLength,
    aperture: apertures[0] || 2.0,
    effects: []
  }
}

/**
 * 相机特效映射表
 */
const cameraEffectsMap = {
  // 胶片效果
  'film-grain': { id: 'film-grain', name: '胶片颗粒', category: 'style', description: '经典胶片颗粒质感', prompt: 'film grain texture' },
  'warm-tone': { id: 'warm-tone', name: '暖色调', category: 'style', description: '温暖的色彩倾向', prompt: 'warm color tones' },
  'vintage-color': { id: 'vintage-color', name: '复古色彩', category: 'style', description: '怀旧复古色调', prompt: 'vintage color grading' },
  'natural-bokeh': { id: 'natural-bokeh', name: '自然散景', category: 'bokeh', description: '自然柔和的焦外', prompt: 'natural bokeh' },
  
  // 数码相机效果
  'sharp-detail': { id: 'sharp-detail', name: '锐利细节', category: 'sharpness', description: '高锐度细节', prompt: 'sharp details, high resolution' },
  'natural-color': { id: 'natural-color', name: '自然色彩', category: 'style', description: '准确自然的颜色', prompt: 'natural color reproduction' },
  'silky-bokeh': { id: 'silky-bokeh', name: '丝滑散景', category: 'bokeh', description: '细腻平滑的焦外', prompt: 'silky smooth bokeh' },
  'bokeh': { id: 'bokeh', name: '散景', category: 'bokeh', description: '背景虚化效果', prompt: 'beautiful bokeh' },
  'creamy-bokeh': { id: 'creamy-bokeh', name: '奶油散景', category: 'bokeh', description: '奶油般的焦外过渡', prompt: 'creamy bokeh' },
  'low-light': { id: 'low-light', name: '低光性能', category: 'style', description: '优秀的暗光表现', prompt: 'excellent low light performance' },
  
  // 佳能特有
  'canon-color': { id: 'canon-color', name: '佳能色彩', category: 'style', description: '佳能标志性色彩科学', prompt: 'Canon color science' },
  'natural-skin': { id: 'natural-skin', name: '自然肤色', category: 'style', description: '讨喜的人像肤色', prompt: 'natural flattering skin tones' },
  'action-freeze': { id: 'action-freeze', name: '动作凝固', category: 'style', description: '高速动作捕捉', prompt: 'action freeze, high speed capture' },
  
  // 索尼特有
  'ultra-sharp': { id: 'ultra-sharp', name: '超锐利', category: 'sharpness', description: '极致锐度', prompt: 'ultra sharp details' },
  'global-shutter': { id: 'global-shutter', name: '全局快门', category: 'style', description: '无果冻效应', prompt: 'global shutter, no rolling shutter artifacts' },
  'street-photo': { id: 'street-photo', name: '街拍风格', category: 'style', description: '街头摄影美学', prompt: 'street photography aesthetic' },
  
  // 富士特有
  'fuji-film-sim': { id: 'fuji-film-sim', name: '富士胶片模拟', category: 'style', description: '富士经典胶片模拟', prompt: 'Fujifilm film simulation' },
  'classic-chrome': { id: 'classic-chrome', name: 'Classic Chrome', category: 'style', description: '经典铬色调', prompt: 'Fujifilm Classic Chrome simulation' },
  'classic-neg': { id: 'classic-neg', name: 'Classic Neg', category: 'style', description: '经典负片风格', prompt: 'Fujifilm Classic Negative simulation' },
  'acros': { id: 'acros', name: 'ACROS', category: 'style', description: '高对比黑白', prompt: 'Fujifilm ACROS black and white' },
  'velvia': { id: 'velvia', name: 'Velvia', category: 'style', description: '高饱和风光', prompt: 'Fujifilm Velvia vivid colors' },
  'provia': { id: 'provia', name: 'Provia', category: 'style', description: '标准色彩', prompt: 'Fujifilm Provia standard' },
  'astia': { id: 'astia', name: 'Astia', category: 'style', description: '柔和肤色', prompt: 'Fujifilm Astia soft' },
  'nostalgic-neg': { id: 'nostalgic-neg', name: 'Nostalgic Neg', category: 'style', description: '怀旧负片', prompt: 'Fujifilm Nostalgic Negative' },
  
  // 中画幅效果
  'medium-format-look': { id: 'medium-format-look', name: '中画幅质感', category: 'style', description: '中画幅独特透视和景深', prompt: 'medium format look, shallow depth of field' },
  'medium-format-film': { id: 'medium-format-film', name: '中画幅胶片', category: 'style', description: '中画幅胶片质感', prompt: 'medium format film look' },
  'ultra-detail': { id: 'ultra-detail', name: '超高细节', category: 'sharpness', description: '极致细节表现', prompt: 'ultra high detail, extremely sharp' },
  'shallow-dof': { id: 'shallow-dof', name: '浅景深', category: 'bokeh', description: '极浅景深效果', prompt: 'extremely shallow depth of field' },
  'square-format': { id: 'square-format', name: '方画幅', category: 'style', description: '6x6方形构图', prompt: 'square format composition' },
  'zeiss-rendering': { id: 'zeiss-rendering', name: '蔡司成像', category: 'style', description: '蔡司镜头成像风格', prompt: 'Zeiss lens rendering' },
  
  // 哈苏特有
  'hasselblad-color': { id: 'hasselblad-color', name: '哈苏色彩', category: 'style', description: '哈苏自然色彩科学', prompt: 'Hasselblad Natural Color Solution' },
  
  // 徕卡特有
  'leica-rendering': { id: 'leica-rendering', name: '徕卡成像', category: 'style', description: '徕卡独特成像风格', prompt: 'Leica lens rendering, classic Leica look' },
  'high-contrast': { id: 'high-contrast', name: '高对比', category: 'style', description: '高对比度', prompt: 'high contrast' },
  'summilux-bokeh': { id: 'summilux-bokeh', name: 'Summilux散景', category: 'bokeh', description: 'Summilux镜头特有散景', prompt: 'Summilux lens bokeh' },
  
  // 理光特有
  'high-contrast-bw': { id: 'high-contrast-bw', name: '高对比黑白', category: 'style', description: '高对比黑白', prompt: 'high contrast black and white' },
  'positive-film': { id: 'positive-film', name: '正片效果', category: 'style', description: '正片色彩', prompt: 'positive film colors' },
  'snap-focus': { id: 'snap-focus', name: '速拍对焦', category: 'style', description: '预设对焦距离', prompt: 'snap focus street photography' },
  
  // 康泰时特有
  'premium-compact': { id: 'premium-compact', name: '高端便携', category: 'style', description: '高端便携相机质感', prompt: 'premium compact camera quality' },
  'soft-glow': { id: 'soft-glow', name: '柔和光晕', category: 'softness', description: '柔和的高光溢出', prompt: 'soft glow, gentle highlight bloom' },
  
  // 专业胶片效果
  'professional-color': { id: 'professional-color', name: '专业色彩', category: 'style', description: '专业级色彩还原', prompt: 'professional color accuracy' },
  'zuiko-rendering': { id: 'zuiko-rendering', name: 'Zuiko成像', category: 'style', description: '奥林巴斯Zuiko镜头风格', prompt: 'Olympus Zuiko lens rendering' },
  'compact-slr': { id: 'compact-slr', name: '紧凑单反', category: 'style', description: '紧凑轻便的单反体验', prompt: 'compact SLR photography' },
  'portrait-rendering': { id: 'portrait-rendering', name: '人像渲染', category: 'bokeh', description: '优秀的人像表现', prompt: 'portrait lens rendering, flattering bokeh' },
  
  // 超长焦效果
  'super-telephoto': { id: 'super-telephoto', name: '超长焦', category: 'style', description: '超长焦压缩效果', prompt: 'super telephoto compression' },
  'moon-shot': { id: 'moon-shot', name: '月球摄影', category: 'style', description: '月球拍摄效果', prompt: 'moon photography, extreme telephoto' },
  'wildlife': { id: 'wildlife', name: '野生动物', category: 'style', description: '野生动物摄影', prompt: 'wildlife photography' },
  
  // ===== 手机特有效果 =====
  // iPhone
  'photographic-styles': { id: 'photographic-styles', name: '摄影风格', category: 'style', description: 'iPhone摄影风格', prompt: 'iPhone Photographic Styles' },
  'portrait-mode': { id: 'portrait-mode', name: '人像模式', category: 'bokeh', description: '计算人像虚化', prompt: 'portrait mode, computational bokeh' },
  'night-mode': { id: 'night-mode', name: '夜间模式', category: 'style', description: '计算夜景', prompt: 'night mode, computational low light' },
  'cinematic-mode': { id: 'cinematic-mode', name: '电影效果', category: 'style', description: 'iPhone电影效果模式', prompt: 'iPhone Cinematic mode, rack focus' },
  'prores-log': { id: 'prores-log', name: 'ProRes Log', category: 'style', description: 'ProRes Log视频', prompt: 'Apple ProRes Log video' },
  'macro': { id: 'macro', name: '微距', category: 'style', description: '超近距微距', prompt: 'macro photography, extreme close-up' },
  'deep-fusion': { id: 'deep-fusion', name: 'Deep Fusion', category: 'style', description: '像素级优化', prompt: 'Deep Fusion pixel-level optimization' },
  'smart-hdr': { id: 'smart-hdr', name: 'Smart HDR', category: 'style', description: '智能HDR', prompt: 'Smart HDR, high dynamic range' },
  'portrait-lighting': { id: 'portrait-lighting', name: '人像光效', category: 'style', description: '计算人像光效', prompt: 'Portrait Lighting effects' },
  'hdr': { id: 'hdr', name: 'HDR', category: 'style', description: '高动态范围', prompt: 'HDR photography' },
  'vintage-phone': { id: 'vintage-phone', name: '复古手机', category: 'style', description: '早期智能手机美学', prompt: 'early smartphone aesthetic, vintage mobile photo' },
  
  // Samsung
  'ai-photo': { id: 'ai-photo', name: 'AI照片', category: 'style', description: 'AI增强照片', prompt: 'AI enhanced photo' },
  'nightography': { id: 'nightography', name: 'Nightography', category: 'style', description: '三星夜间摄影', prompt: 'Samsung Nightography, advanced night photography' },
  'expert-raw': { id: 'expert-raw', name: 'Expert RAW', category: 'style', description: '专业RAW拍摄', prompt: 'Samsung Expert RAW, professional mobile photography' },
  '100x-zoom': { id: '100x-zoom', name: '100倍变焦', category: 'style', description: '超级空间变焦', prompt: 'Space Zoom 100x telephoto' },
  'space-zoom': { id: 'space-zoom', name: 'Space Zoom', category: 'style', description: '空间变焦', prompt: 'Samsung Space Zoom' },
  
  // Google Pixel
  'magic-eraser': { id: 'magic-eraser', name: 'Magic Eraser', category: 'style', description: 'AI物体移除', prompt: 'Google Magic Eraser, clean composition' },
  'photo-unblur': { id: 'photo-unblur', name: 'Photo Unblur', category: 'style', description: 'AI去模糊', prompt: 'Photo Unblur, AI sharpening' },
  'night-sight': { id: 'night-sight', name: 'Night Sight', category: 'style', description: 'Google夜视', prompt: 'Google Night Sight, computational night photography' },
  'astrophotography': { id: 'astrophotography', name: '天文摄影', category: 'style', description: '手机天文摄影', prompt: 'astrophotography mode, night sky' },
  'best-take': { id: 'best-take', name: 'Best Take', category: 'style', description: 'AI最佳表情', prompt: 'Best Take, AI face optimization' },
  'real-tone': { id: 'real-tone', name: 'Real Tone', category: 'style', description: '真实肤色', prompt: 'Real Tone, accurate skin representation' },
  'motion-mode': { id: 'motion-mode', name: '动态模式', category: 'style', description: '长曝光运动效果', prompt: 'Motion Mode, long exposure effect' },
  
  // 华为
  'xmage-color': { id: 'xmage-color', name: 'XMAGE色彩', category: 'style', description: '华为XMAGE影像', prompt: 'Huawei XMAGE color science' },
  'variable-aperture': { id: 'variable-aperture', name: '可变光圈', category: 'bokeh', description: '物理可变光圈', prompt: 'variable aperture, adjustable depth of field' },
  'leica-color': { id: 'leica-color', name: '徕卡色彩', category: 'style', description: '华为徕卡色彩', prompt: 'Huawei Leica color mode' },
  
  // 小米
  'leica-authentic': { id: 'leica-authentic', name: 'Leica Authentic', category: 'style', description: '徕卡原生风格', prompt: 'Leica Authentic look, classic Leica rendering' },
  'leica-vibrant': { id: 'leica-vibrant', name: 'Leica Vibrant', category: 'style', description: '徕卡鲜艳风格', prompt: 'Leica Vibrant, enhanced colors' },
  'master-lens': { id: 'master-lens', name: '大师镜头', category: 'style', description: '大师风格滤镜', prompt: 'Master lens effect' },
  'ultra-night': { id: 'ultra-night', name: '超级夜景', category: 'style', description: '超级夜景模式', prompt: 'Ultra Night mode, extreme low light' },
  
  // OPPO/OnePlus
  'dual-periscope': { id: 'dual-periscope', name: '双潜望', category: 'style', description: '双潜望长焦系统', prompt: 'dual periscope telephoto' },
  
  // vivo
  'zeiss-color': { id: 'zeiss-color', name: '蔡司色彩', category: 'style', description: 'vivo蔡司色彩', prompt: 'vivo Zeiss color science' },
  'zeiss-bokeh': { id: 'zeiss-bokeh', name: '蔡司散景', category: 'bokeh', description: '蔡司风格散景', prompt: 'Zeiss style bokeh simulation' },
  'zeiss-portrait': { id: 'zeiss-portrait', name: '蔡司人像', category: 'bokeh', description: '蔡司人像风格', prompt: 'Zeiss Portrait mode' },
  
  // Nokia
  'pureview-oversampling': { id: 'pureview-oversampling', name: 'PureView超采样', category: 'style', description: '诺基亚超采样技术', prompt: 'Nokia PureView oversampling, high resolution downsample' },
  'lossless-zoom': { id: 'lossless-zoom', name: '无损变焦', category: 'style', description: 'PureView无损变焦', prompt: 'lossless digital zoom' },
  'xenon-flash': { id: 'xenon-flash', name: '氙气闪光', category: 'style', description: '氙气闪光灯效果', prompt: 'xenon flash lighting' },
  'raw-capture': { id: 'raw-capture', name: 'RAW拍摄', category: 'style', description: '手机RAW格式', prompt: 'RAW capture, unprocessed' },
  'autofocus': { id: 'autofocus', name: '自动对焦', category: 'style', description: '早期自动对焦', prompt: 'autofocus camera phone' },
  'retro-phone': { id: 'retro-phone', name: '复古手机', category: 'style', description: '复古手机摄影风格', prompt: 'retro camera phone aesthetic' },
  'lo-fi': { id: 'lo-fi', name: 'Lo-Fi', category: 'style', description: '低保真美学', prompt: 'lo-fi photography, early digital aesthetic' },
  
  // Sony Xperia
  'alpha-processing': { id: 'alpha-processing', name: 'Alpha处理', category: 'style', description: 'Sony Alpha算法', prompt: 'Sony Alpha camera processing' },
  'eye-af': { id: 'eye-af', name: '眼部对焦', category: 'style', description: 'AI眼部追踪', prompt: 'Eye AF tracking' },
  'real-time-tracking': { id: 'real-time-tracking', name: '实时追踪', category: 'style', description: '实时主体追踪', prompt: 'real-time tracking autofocus' },
  'cinematic-video': { id: 'cinematic-video', name: '电影视频', category: 'style', description: '电影级视频', prompt: 'cinematic video recording' },
  '1-inch-sensor': { id: '1-inch-sensor', name: '一英寸传感器', category: 'style', description: '大尺寸传感器', prompt: '1-inch sensor, large sensor mobile' },
  
  // 全画幅便携
  'full-frame-compact': { id: 'full-frame-compact', name: '全画幅便携', category: 'style', description: '全画幅便携相机', prompt: 'full-frame compact camera' }
}

/**
 * 获取相机特效列表
 * @param {string[]} effectIds - 特效ID数组
 * @returns {Array} 特效对象数组
 */
export function getCameraEffects(effectIds) {
  if (!effectIds || !Array.isArray(effectIds)) return []
  return effectIds
    .map(id => cameraEffectsMap[id])
    .filter(Boolean)
}
